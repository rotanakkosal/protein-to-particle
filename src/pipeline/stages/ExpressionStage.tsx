"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { AA_CLASS_INFO, aminoAcid } from "@/content/aminoAcids";
import { useProteinData } from "@/store/dataStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { paintRibbon } from "@/lib/geometry/ribbon";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { cylinderMatrix } from "@/scene/shared/geometry";
import { getRibbon, residueBaseColors } from "@/scene/levels/ProteinLevel";
import { setBaseOpacity } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";
import { TAG_COLORS } from "./ConstructStage";

/*
 * Inside one cell, in the ribosome's frame of reference: the messenger RNA slides through a
 * fixed ribosome while the new chain leaves the exit tunnel and settles into the real 4OBE fold.
 * Timeline after "Add IPTG" (seconds): induction, transcription, translation (≈ 20 amino acids
 * per second, close to the real rate in E. coli), folding, then GDP·Mg²⁺ binding.
 */
const T = { iptg: 1.4, tx: 1.6, tl: 9.2, fold: 1.8, bind: 1.6 };
const T_TOTAL = T.iptg + T.tx + T.tl + T.fold + T.bind;
// Not to scale: a real ribosome (≈ 25 nm) is about 5× wider than KRAS (≈ 4.5 nm); here it is about 2×,
// so the chain stays readable. The stage note says so.
const SCALE = 0.115; // Å → scene units for the folded protein
const CENTRE = new Vector3(0, 10.4, 0);
const EXIT = new Vector3(0, 5.6, 0);
const MRNA_Y = -1.25;
const TAG_KINDS = ["start", ...Array(6).fill("his"), ...Array(6).fill("tev"), "gly0"] as (keyof typeof TAG_COLORS)[];
const LIGAND_COLORS: Record<string, string> = { C: "#5E6168", N: "#3D5FD9", O: "#E0413A", P: "#E8862A", MG: "#4FAF5C" };

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Lumpy sphere for a ribosomal subunit (deterministic bumps). */
function lumpy(radius: number, seed: number) {
  const g = new IcosahedronGeometry(radius, 4);
  const p = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 1.7 + seed) * Math.cos(v.y * 1.9 - seed) * Math.sin(v.z * 1.5 + seed * 2);
    v.multiplyScalar(1 + 0.08 * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

type Phase = "idle" | "iptg" | "tx" | "tl" | "fold" | "bind" | "done";

export function ExpressionStage() {
  const { protein } = useProteinData();
  const step = usePipelineStore((s) => s.steps.expression);
  const time = useRef(step ? T_TOTAL : 0);
  const [phase, setPhase] = useState<Phase>(step ? "done" : "idle");
  const beads = useRef<InstancedMesh>(null);
  const links = useRef<InstancedMesh>(null);
  const mrna = useRef<Mesh>(null);
  const ticks = useRef<InstancedMesh>(null);
  const iptg = useRef<InstancedMesh>(null);
  const folded = useRef<Group>(null);
  const ligands = useRef<Group>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), v: new Vector3(), c: new Color() }), []);

  // chain: tag (14) + KRAS; final positions = scaled Cα of the real fold, with the tag as a floppy tail off Met1
  const chain = useMemo(() => {
    const ca = protein.residues.map((r) => r.atoms.CA.clone().multiplyScalar(SCALE).add(CENTRE));
    const first = ca[0];
    const outward = first.clone().sub(CENTRE).normalize();
    const side = new Vector3(0, 1, 0).cross(outward).normalize();
    const tag = TAG_KINDS.map((_, i) => {
      const k = TAG_KINDS.length - i; // distance from Met1 along the tail
      return first.clone().addScaledVector(outward, k * 0.32).addScaledVector(side, Math.sin(k * 0.9) * 0.4);
    });
    const colors = [...TAG_KINDS.map((k) => TAG_COLORS[k]), ...protein.residues.map((r) => AA_CLASS_INFO[aminoAcid(r.resName).cls].color)];
    return { target: [...tag, ...ca], colors, n: tag.length + ca.length };
  }, [protein]);

  const res = useMemo(() => {
    const ribbon = getRibbon(protein);
    paintRibbon(ribbon, residueBaseColors(protein, "structure"));
    const ribbonMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, clearcoat: 0.55, transparent: true, opacity: 0 });
    ribbonMat.userData.forceTransparent = true;
    const big = lumpy(4.6, 1.3);
    const small = lumpy(3.3, 4.1);
    const bigMat = new MeshPhysicalMaterial({ color: "#C8B7E8", roughness: 0.55, clearcoat: 0.3 });
    const smallMat = new MeshPhysicalMaterial({ color: "#E6D9F5", roughness: 0.55, clearcoat: 0.3 });
    const mrnaCurve = new CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => new Vector3(-16 + i, MRNA_Y + Math.sin(i * 0.6) * 0.15, Math.cos(i * 0.5) * 0.15)));
    const mrnaGeo = new TubeGeometry(mrnaCurve, 200, 0.2, 8, false);
    const mrnaMat = new MeshStandardMaterial({ color: "#E8862A", roughness: 0.5 });
    const tick = new TorusGeometry(0.24, 0.05, 6, 12);
    const tickMat = new MeshStandardMaterial({ color: "#B4561A", roughness: 0.5 });
    const bead = new SphereGeometry(0.27, 14, 10);
    const beadMat = new MeshPhysicalMaterial({ roughness: 0.32, clearcoat: 0.6 });
    const link = new CylinderGeometry(1, 1, 1, 6);
    const linkMat = new MeshStandardMaterial({ color: "#BAC3D1", roughness: 0.6 });
    const dot = new SphereGeometry(0.16, 8, 6);
    const dotMat = new MeshStandardMaterial({ color: "#2F72E4", emissive: "#2F72E4", emissiveIntensity: 0.4 });
    const atom = new SphereGeometry(1, 12, 8);
    const atomMats = Object.fromEntries(Object.entries(LIGAND_COLORS).map(([k, c]) => [k, new MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 0.7 })]));
    return { ribbon, ribbonMat, big, small, bigMat, smallMat, mrnaGeo, mrnaMat, tick, tickMat, bead, beadMat, link, linkMat, dot, dotMat, atom, atomMats };
  }, [protein]);
  useEffect(
    () => () => {
      const { ribbon, atomMats, ...rest } = res;
      void ribbon; // shared with the explorer, not disposed here
      Object.values(rest).forEach((r) => r.dispose());
      Object.values(atomMats).forEach((m) => m.dispose());
    },
    [res],
  );

  const iptgSeeds = useMemo(() => Array.from({ length: 26 }, (_, i) => new Vector3(Math.sin(i * 2.4) * 9, 6 + (i % 5) * 1.6, Math.cos(i * 1.7) * 5)), []);

  useFrame((state, delta) => {
    const goal = usePipelineStore.getState().steps.expression;
    if (goal === 0) time.current = 0;
    else time.current = Math.min(T_TOTAL, time.current + stageDelta(delta));
    const t = time.current;
    const t1 = T.iptg;
    const t2 = t1 + T.tx;
    const t3 = t2 + T.tl;
    const t4 = t3 + T.fold;
    const nextPhase: Phase = goal === 0 ? "idle" : t < t1 ? "iptg" : t < t2 ? "tx" : t < t3 ? "tl" : t < t4 ? "fold" : t < T_TOTAL ? "bind" : "done";
    if (nextPhase !== phase) setPhase(nextPhase);

    // IPTG drifts in
    const im = iptg.current;
    if (im) {
      const a = goal === 0 ? 0 : smooth(t / t1);
      const visible = goal !== 0 && t < t2 ? 1 : 0;
      iptgSeeds.forEach((p, i) => im.setMatrixAt(i, tmp.m.compose(tmp.v.copy(p).multiplyScalar(1 - 0.55 * a), tmp.q.identity(), tmp.s.setScalar(visible))));
      im.instanceMatrix.needsUpdate = true;
    }
    // the messenger RNA appears, then slides through the ribosome while it is read
    const grown = goal === 0 ? 0 : smooth((t - t1) / T.tx);
    if (mrna.current) {
      mrna.current.scale.set(Math.max(0.001, grown), 1, 1);
      mrna.current.position.x = -16 * (1 - grown);
    }
    const tm = ticks.current;
    if (tm) {
      const shift = goal === 0 ? 0 : Math.max(0, Math.min(t, t3) - t2) * 2.2;
      for (let i = 0; i < 36; i++) {
        let x = -16 + ((i * 0.9 - shift) % 32.4 + 32.4) % 32.4;
        const show = grown > 0.98 ? 1 : 0;
        if (x > 16) x -= 32.4;
        tm.setMatrixAt(i, tmp.m.compose(tmp.v.set(x, MRNA_Y, 0), tmp.q.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2), tmp.s.setScalar(show)));
      }
      tm.instanceMatrix.needsUpdate = true;
    }

    // nascent chain: bead j leaves the exit tunnel at its turn and settles into place
    const bm = beads.current;
    const lm = links.current;
    if (!bm || !lm) return;
    const foldK = goal === 0 ? 0 : smooth((t - t3) / T.fold);
    const pos: Vector3[] = [];
    for (let j = 0; j < chain.n; j++) {
      const born = t2 + (j / chain.n) * T.tl;
      const age = goal === 0 ? -1 : t - born;
      const p = new Vector3();
      let scale = 0;
      if (age >= 0) {
        const k = smooth(age / 1.4);
        // up out of the tunnel, then over to its place in the fold
        const rise = EXIT.clone().add(new Vector3(Math.sin(j) * 0.4, 1.2 + 0.5 * Math.sin(j * 0.7), Math.cos(j) * 0.4));
        const target = chain.target[j];
        p.copy(EXIT).lerp(rise, Math.min(1, k * 2)).lerp(target, Math.max(0, k * 2 - 1));
        // a slight jitter that calms down as the protein folds
        const jig = (1 - foldK) * 0.25;
        p.x += Math.sin(state.clock.elapsedTime * 2 + j) * jig;
        p.y += Math.cos(state.clock.elapsedTime * 1.7 + j * 1.3) * jig;
        scale = 1 - foldK * (j >= TAG_KINDS.length ? 1 : 0.4);
      }
      pos.push(p);
      bm.setMatrixAt(j, tmp.m.compose(p, tmp.q.identity(), tmp.s.setScalar(Math.max(scale, 0.0001))));
      bm.setColorAt(j, tmp.c.set(chain.colors[j]));
    }
    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    for (let j = 0; j < chain.n - 1; j++) {
      const both = goal !== 0 && t - (t2 + ((j + 1) / chain.n) * T.tl) >= 0;
      const kras = j >= TAG_KINDS.length;
      lm.setMatrixAt(j, both && (!kras || foldK < 0.98) ? cylinderMatrix(pos[j], pos[j + 1], 0.07 * (kras ? 1 - foldK : 1), tmp.m) : tmp.m.makeScale(0, 0, 0));
    }
    lm.instanceMatrix.needsUpdate = true;

    // the real ribbon fades in as the beads fade out, then GDP·Mg²⁺ flies into the pocket
    setBaseOpacity(res.ribbonMat, foldK);
    if (folded.current) folded.current.visible = foldK > 0.01;
    const bindK = goal === 0 ? 0 : smooth((t - t4) / T.bind);
    if (ligands.current) {
      ligands.current.visible = bindK > 0.01;
      ligands.current.position.set(7 * (1 - bindK), 5 * (1 - bindK), 3 * (1 - bindK));
    }
  });

  const centre = CENTRE.toArray() as [number, number, number];
  const phaseLabel: Record<Phase, string> = {
    idle: "Waiting for the switch: press “Add IPTG”",
    iptg: "1 · IPTG switches the gene on",
    tx: "2 · The gene is copied into messenger RNA",
    tl: "3 · The ribosome reads the RNA and links amino acids",
    fold: "4 · The chain folds into KRAS",
    bind: "5 · KRAS picks up GDP and Mg²⁺",
    done: "Folded KRAS with GDP·Mg²⁺, as in 4OBE",
  };
  return (
    <group>
      <mesh geometry={res.big} material={res.bigMat} position={[0, 2.2, 0]} />
      <mesh geometry={res.small} material={res.smallMat} position={[0, -4.0, 0.3]} />
      <mesh ref={mrna} geometry={res.mrnaGeo} material={res.mrnaMat} raycast={() => null} />
      <instancedMesh ref={ticks} frustumCulled={false} args={[res.tick, res.tickMat, 36]} raycast={() => null} />
      <instancedMesh ref={iptg} frustumCulled={false} args={[res.dot, res.dotMat, iptgSeeds.length]} raycast={() => null} />
      <instancedMesh ref={beads} frustumCulled={false} args={[res.bead, res.beadMat, chain.n]} raycast={() => null} />
      <instancedMesh ref={links} frustumCulled={false} args={[res.link, res.linkMat, chain.n - 1]} raycast={() => null} />
      <group ref={folded} position={centre} scale={SCALE}>
        <mesh geometry={res.ribbon.geometry} material={res.ribbonMat} raycast={() => null} />
      </group>
      <group ref={ligands}>
        <group position={centre} scale={SCALE}>
          {protein.ligands.flatMap((l) =>
            l.atoms.map((a, i) => (
              <mesh key={`${l.key}-${i}`} geometry={res.atom} material={res.atomMats[a.element] ?? res.atomMats.C} position={a.position} scale={l.atoms.length === 1 ? 0.75 : 0.5} raycast={() => null} />
            )),
          )}
        </group>
      </group>
      <SceneLabel position={[0, -8.4, 0]} tone="accent" essential>
        {phaseLabel[phase]}
      </SceneLabel>
      <SceneLabel position={[-11.5, MRNA_Y + 1.2, 0]} tone="muted">
        messenger RNA
      </SceneLabel>
      <SceneLabel position={[6.4, 3.4, 0]}>ribosome</SceneLabel>
      {phase === "iptg" && (
        <SceneLabel position={[6.5, 9.5, 0]} essential className="!text-[#1F59C4] dark:!text-[#8DB6FF]">
          IPTG
        </SceneLabel>
      )}
      {(phase === "tl" || phase === "fold") && (
        <SceneLabel position={[-4.6, 7.4, 0]} tone="muted" essential>
          new chain (tag first)
        </SceneLabel>
      )}
      {(phase === "bind" || phase === "done") && (
        <SceneLabel position={[CENTRE.x + 4.8, CENTRE.y + 2.6, 0]} tone="strong" essential>
          KRAS · GDP · Mg²⁺
        </SceneLabel>
      )}
    </group>
  );
}

export const expressionFraming = () => framing([0, 2.6, 0], 13, [0.15, 0.2, 1]);
