"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  Color,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { AA_CLASS_INFO, aminoAcid } from "@/content/aminoAcids";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { aaLabel } from "@/lib/structure/protein";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { cylinderMatrix } from "@/scene/shared/geometry";
import { setBaseOpacity, useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";

/**
 * The design, read as the chain it encodes. A typical tag (Met, six His, the TEV site ENLYFQ and
 * the Gly that stays behind after the cut) is added in front of KRAS 1–169; the flexible tail
 * 170–188 of KRAS4B is left out. Only the leftover Gly0 is recorded in 4OBE.
 */
export type TagKind = "start" | "his" | "tev" | "gly0";
const TAG: { one: string; name: string; kind: TagKind }[] = [
  { one: "M", name: "Met (start)", kind: "start" },
  ...Array.from({ length: 6 }, (_, i) => ({ one: "H", name: `His ${i + 1} of 6`, kind: "his" as const })),
  ...["E", "N", "L", "Y", "F", "Q"].map((one) => ({ one, name: `${one} (TEV site ENLYFQ)`, kind: "tev" as const })),
  { one: "G", name: "Gly0 (stays after the cut)", kind: "gly0" },
];
const FULL_LENGTH = 188;
const PER_ROW = 20;
const GAP = 1.55;
const ROW = 2.7;
/** Tag colours kept apart from the side-chain class colours used for KRAS itself */
export const TAG_COLORS: Record<TagKind, string> = { start: "#8E97A8", his: "#16C35B", tev: "#D35BB4", gly0: "#F2C230" };
const TAIL_COLOR = "#B4BDCB";
/*
 * "Trim and tag", in two acts: the chain is cut after Lys169 and the tail drifts off; then KRAS
 * makes room and the tag beads click on at the N-terminus one by one, Gly0 first and the start
 * Met last (seconds).
 */
const CUT = { at: 0.25, flash: 0.5, drift: [0.6, 1.0] };
const SHIFT = [1.6, 1.0];
const ATTACH = { start: 2.7, each: 0.14, fly: 0.45 };
const T_END = ATTACH.start + (TAG.length - 1) * ATTACH.each + ATTACH.fly + 0.1;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
type Act = "full" | "cut" | "tag" | "done";

/** Point along the serpentine path at (fractional) chain index t; negative t lies before the start. */
function snake(t: number, rows: number, out: Vector3) {
  const x0 = -((PER_ROW - 1) * GAP) / 2;
  const y0 = ((rows - 1) * ROW) / 2;
  if (t < 0) return out.set(x0 + t * GAP, y0, 0);
  const row = Math.floor(t / PER_ROW);
  const col = t - row * PER_ROW;
  const x = row % 2 === 0 ? x0 + col * GAP : x0 + (PER_ROW - 1 - col) * GAP;
  return out.set(x, y0 - row * ROW, 0);
}

interface Bead {
  kind: TagKind | "kras" | "tail";
  /** Index in the full protein (before) and in the construct (after); −1 when absent */
  from: number;
  to: number;
  color: string;
  label: string;
  detail: string;
}

export function ConstructStage() {
  const { protein } = useProteinData();
  const { role } = useStage();
  const target = usePipelineStore((s) => s.steps.construct);
  const beads = useRef<InstancedMesh>(null);
  const links = useRef<InstancedMesh>(null);
  const time = useRef(target ? T_END : 0);
  const [act, setAct] = useState<Act>(target ? "done" : "full");
  const flash = useRef<Mesh>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), c: new Color(), q: new Quaternion(), s: new Vector3() }), []);

  const list = useMemo<Bead[]>(() => {
    const out: Bead[] = TAG.map((t, i) => ({
      kind: t.kind,
      from: i - TAG.length,
      to: i,
      color: TAG_COLORS[t.kind],
      label: t.name,
      detail:
        t.kind === "his"
          ? "Six histidines in a row: the His-tag, which grips nickel beads during purification."
          : t.kind === "tev"
            ? "The TEV protease recognition site; TEV cuts between Q and G."
            : t.kind === "gly0"
              ? "After the TEV cut this glycine stays on KRAS. 4OBE records it as residue 0, an 'expression tag'."
              : "The start codon's methionine.",
    }));
    for (const r of protein.residues) {
      const cls = aminoAcid(r.resName).cls;
      out.push({
        kind: "kras",
        from: r.seq - 1,
        to: TAG.length + r.seq - 1,
        color: AA_CLASS_INFO[cls].color,
        label: `${aaLabel(r)} · ${aminoAcid(r.resName).name}`,
        detail: "Part of the G-domain kept in the construct.",
      });
    }
    for (let seq = protein.residues[protein.residues.length - 1].seq + 1; seq <= FULL_LENGTH; seq++) {
      out.push({ kind: "tail", from: seq - 1, to: -1, color: TAIL_COLOR, label: `Residue ${seq}`, detail: "Part of the flexible tail (hypervariable region), left out of the construct." });
    }
    return out;
  }, [protein]);

  const res = useMemo(() => {
    const ring = new TorusGeometry(1, 0.08, 8, 40);
    const ringMat = new MeshBasicMaterial({ color: "#E0544C", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    ringMat.userData.forceTransparent = true;
    ringMat.userData.ownFade = true;
    return {
      sphere: new SphereGeometry(1, 20, 14),
      mat: new MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.6 }),
      link: new CylinderGeometry(1, 1, 1, 8),
      linkMat: new MeshStandardMaterial({ color: "#BAC3D1", roughness: 0.6 }),
      ring,
      ringMat,
    };
  }, []);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  const rowsFull = Math.ceil(FULL_LENGTH / PER_ROW);
  const rowsConstruct = Math.ceil((TAG.length + protein.residues.length) / PER_ROW);
  const rows = Math.max(rowsFull, rowsConstruct);

  const lastIndex = protein.residues.length - 1; // Lys169: the last bead kept
  useFrame((_, delta) => {
    const m = beads.current;
    const l = links.current;
    if (!m || !l) return;
    const goal = usePipelineStore.getState().steps.construct;
    delta = stageDelta(delta);
    // forward at normal speed; a replay rewinds quickly
    time.current = goal ? Math.min(T_END, time.current + delta) : Math.max(0, time.current - delta * 4);
    const t = time.current;
    const nextAct: Act = t <= 0 ? "full" : t < SHIFT[0] ? "cut" : t < T_END ? "tag" : "done";
    if (nextAct !== act) setAct(nextAct);

    const cut = t >= CUT.at;
    const drift = smooth((t - CUT.drift[0]) / CUT.drift[1]);
    const shift = smooth((t - SHIFT[0]) / SHIFT[1]);
    const pos: (Vector3 | null)[] = [];
    const attached: boolean[] = [];
    list.forEach((b, i) => {
      let scale = 0.62;
      const p = new Vector3();
      let done = true;
      if (b.kind === "tail") {
        // the cut-off tail slides down and away, then fades
        snake(b.from, rows, p);
        p.y -= drift * 3.2;
        p.x += drift * 1.2;
        scale *= 1 - smooth((t - 1.0) / 0.8);
      } else if (b.from < 0) {
        // tag bead i clicks on in reverse order: Gly0 (next to Met1) first, the start Met last
        const order = TAG.length - 1 - b.to;
        const f = smooth((t - ATTACH.start - order * ATTACH.each) / ATTACH.fly);
        const slot = snake(b.to, rows, new Vector3());
        p.copy(slot).add(tmp.s.set(-2.2 - order * 0.15, 3.6, 1.5).multiplyScalar(1 - f));
        scale *= f > 0 ? 0.35 + 0.65 * f : 0;
        done = f > 0.97;
      } else {
        snake(b.from + (b.to - b.from) * shift, rows, p);
      }
      if (b.kind === "gly0") scale *= 1.25;
      pos.push(scale > 0.02 ? p : null);
      attached.push(done);
      m.setMatrixAt(i, tmp.m.compose(p, tmp.q, tmp.s.setScalar(Math.max(scale, 0.0001))));
      m.setColorAt(i, tmp.c.set(b.color));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    // backbone links between neighbours that are both present; the 169–170 bond is broken by the cut
    for (let i = 0; i < list.length - 1; i++) {
      const a = pos[i];
      const b = pos[i + 1];
      const kindA = list[i].kind;
      const kindB = list[i + 1].kind;
      const sameSide = (kindA === "tail") === (kindB === "tail");
      const cutBond = kindA !== "tail" && kindB === "tail";
      const joined = a && b && attached[i] && attached[i + 1] && (sameSide || (cutBond && !cut));
      l.setMatrixAt(i, joined ? cylinderMatrix(a, b, 0.14, tmp.m) : tmp.m.makeScale(0, 0, 0));
    }
    l.instanceMatrix.needsUpdate = true;

    // the cut: a red ring flashes on the bond between Lys169 and residue 170
    const fl = flash.current;
    if (fl) {
      const k = (t - CUT.at + 0.15) / CUT.flash;
      const on = goal > 0 && k > 0 && k < 1;
      fl.visible = on;
      if (on) {
        // Lys169 and residue 170 still sit at their original places when the cut happens
        fl.position.copy(snake(lastIndex, rows, new Vector3())).lerp(snake(lastIndex + 1, rows, new Vector3()), 0.5);
        fl.scale.setScalar(0.4 + 1.2 * k);
        setBaseOpacity(res.ringMat, 1 - k);
      }
    }
  });

  const interactive = role === "current";
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.instanceId == null) return;
    e.stopPropagation();
    const b = list[e.instanceId];
    useExplorerStore.getState().setHover({ key: `construct:${e.instanceId}`, title: b.label, subtitle: b.detail, swatch: b.color });
    document.body.style.cursor = "help";
  };
  const onOut = () => {
    useExplorerStore.getState().setHover(null);
    document.body.style.cursor = "";
  };

  const at = (t: number, dy: number) => {
    const p = snake(t, rows, new Vector3());
    return [p.x, p.y + dy, p.z] as [number, number, number];
  };
  const lastKras = TAG.length + protein.residues.length - 1;
  return (
    <group>
      <instancedMesh ref={beads} args={[res.sphere, res.mat, list.length]} onPointerMove={onMove} onPointerOut={onOut} />
      <instancedMesh ref={links} frustumCulled={false} args={[res.link, res.linkMat, list.length - 1]} raycast={() => null} />
      <mesh ref={flash} geometry={res.ring} material={res.ringMat} visible={false} raycast={() => null} />
      {act === "full" && (
        <>
          <SceneLabel position={at(0, 1.6)} tone="accent" essential>
            Full KRAS4B · 188 amino acids
          </SceneLabel>
          <SceneLabel position={at(176, -1.6)} tone="muted" essential>
            170–188 · flexible tail
          </SceneLabel>
        </>
      )}
      {act === "cut" && (
        <SceneLabel position={at(lastIndex + 0.5, 1.7)} essential className="!border-[#E0544C]/60 !text-[#B4352E] dark:!text-[#FF9A92]">
          cut after Lys169
        </SceneLabel>
      )}
      {act === "tag" && (
        <SceneLabel position={at(3.5, 3.4)} essential className="!border-[#16C35B]/60 !text-[#0d7a3a] dark:!text-[#6ef0a0]">
          His-tag joins the N-terminus
        </SceneLabel>
      )}
      {act === "done" && (
        <>
          <SceneLabel position={at(3.5, 1.6)} essential className="!border-[#16C35B]/60 !text-[#0d7a3a] dark:!text-[#6ef0a0]">
            His-tag ×6
          </SceneLabel>
          <SceneLabel position={at(10, 1.6)} essential className="!border-[#D35BB4]/60 !text-[#9a2f80] dark:!text-[#f2a2dc]">
            TEV site · cut after Q
          </SceneLabel>
          <SceneLabel position={at(13, -1.6)} tone="gold" essential>
            Gly0 stays
          </SceneLabel>
          <SceneLabel position={at(TAG.length + 50, 1.6)} tone="accent" essential>
            KRAS 1–169 · the G-domain
          </SceneLabel>
          <SceneLabel position={at(lastKras, -1.6)} tone="muted">
            Lys169 · end
          </SceneLabel>
        </>
      )}
    </group>
  );
}

export const constructFraming = () => framing([0, 0, 0], 17.5, [0, 0.12, 1]);
