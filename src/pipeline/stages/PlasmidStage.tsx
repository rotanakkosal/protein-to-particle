"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BufferAttribute, Color, Curve, Mesh, MeshPhysicalMaterial, TubeGeometry, Vector3 } from "three";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";

/**
 * A schematic expression plasmid drawn as a twisted two-strand DNA ring. Part sizes are typical
 * relative lengths, not the real map of the plasmid; only the plasmid's name comes from 4OBE.
 */
interface Part {
  id: string;
  name: string;
  detail: string;
  /** Relative length (≈ base pairs) */
  len: number;
  color: string;
}

const R = 8;
const TWIST = 34; // turns of the two strands around the ring
const STRAND_R = 0.28;
const STRAND_OFFSET = 0.32;
const WAIT = 3.6; // how far above its place the construct DNA waits before insertion

/** Parts clockwise from the top; the insert goes in at the top, between RBS and terminator. */
function partsFor(insertLen: number, inserted: number): Part[] {
  return [
    { id: "promoter", name: "Promoter", detail: "The on/off switch: lets RNA polymerase start reading here once expression is switched on.", len: 150, color: "#2A5CB8" },
    { id: "rbs", name: "Ribosome binding site", detail: "Where the ribosome lands on the messenger RNA to start making protein.", len: 40, color: "#7FB2EC" },
    {
      id: "insert",
      name: "KRAS construct",
      detail: `The designed gene: tag + KRAS 1–169, ${insertLen} bases of coding DNA.`,
      len: insertLen * inserted,
      color: "#E2B93B",
    },
    { id: "site", name: "Cloning site", detail: "Where the ring is cut open to paste in a gene.", len: 30 * (1 - inserted), color: "#21A37E" },
    { id: "terminator", name: "Terminator", detail: "Tells RNA polymerase to stop reading.", len: 100, color: "#24A79A" },
    { id: "spacer1", name: "Plasmid backbone", detail: "Plasmid DNA linking the working parts.", len: 650, color: "#C5CEDB" },
    { id: "resistance", name: "Antibiotic resistance gene", detail: "Lets only cells carrying the plasmid survive the antibiotic.", len: 800, color: "#E0544C" },
    { id: "spacer2", name: "Plasmid backbone", detail: "Plasmid DNA linking the working parts.", len: 450, color: "#C5CEDB" },
    { id: "origin", name: "Origin of replication", detail: "Where the bacterium starts copying the plasmid, so each cell keeps many copies.", len: 600, color: "#8D7BD6" },
    { id: "spacer3", name: "Plasmid backbone", detail: "Plasmid DNA linking the working parts.", len: 500, color: "#C5CEDB" },
  ];
}

/** Ring path for one strand, from angle a0 to a1 (radians, clockwise from the top). */
class RingStrand extends Curve<Vector3> {
  constructor(
    private a0: number,
    private a1: number,
    private phase: number,
  ) {
    super();
  }
  getPoint(t: number, out = new Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t;
    const twist = a * TWIST + this.phase;
    const r = R + STRAND_OFFSET * Math.cos(twist);
    // clockwise from the top: x = r sin a, y = r cos a
    return out.set(r * Math.sin(a), r * Math.cos(a), STRAND_OFFSET * Math.sin(twist));
  }
}

/** Builds one strand of the ring from angle `start` over `span` radians, vertex-coloured by part. */
function ringGeometry(parts: Part[], start: number, span: number, phase: number) {
  const total = parts.reduce((s, p) => s + p.len, 0);
  const segs = Math.max(60, Math.round((720 * span) / (Math.PI * 2)));
  const g = new TubeGeometry(new RingStrand(start, start + span, phase), segs, STRAND_R, 8, false);
  const colors = new Float32Array(g.attributes.position.count * 3);
  const c = new Color();
  const bounds: { start: number; end: number; part: Part }[] = [];
  let acc = 0;
  for (const p of parts) {
    bounds.push({ start: acc / total, end: (acc + p.len) / total, part: p });
    acc += p.len;
  }
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const b = bounds.find((x) => f >= x.start && f <= x.end) ?? bounds[bounds.length - 1];
    c.set(b.part.color);
    for (let j = 0; j <= 8; j++) c.toArray(colors, (i * 9 + j) * 3);
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  return { geometry: g, bounds, span, start };
}

/** Angles (radians, clockwise from the top) of the insert in the finished plasmid. */
function insertArc(insertLen: number) {
  const parts = partsFor(insertLen, 1);
  const k = (Math.PI * 2) / parts.reduce((s, p) => s + p.len, 0);
  const before = parts[0].len + parts[1].len;
  return { a0: before * k, a1: (before + insertLen) * k };
}

export function PlasmidStage() {
  const { protein } = useProteinData();
  const exp = protein.experiment;
  const { role } = useStage();
  const target = usePipelineStore((s) => s.steps.plasmid);
  const insertLen = (protein.residues.length + 14) * 3 + 3; // KRAS + typical tag codons + stop
  const strandA = useRef<Mesh>(null);
  const strandB = useRef<Mesh>(null);
  const insertA = useRef<Mesh>(null);
  const insertB = useRef<Mesh>(null);
  const u = useRef(target);
  const layout = useRef<ReturnType<typeof ringGeometry> | null>(null);
  const [settled, setSettled] = useState(target);

  const mat = useMemo(() => new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.5 }), []);
  const insertMat = useMemo(() => new MeshPhysicalMaterial({ color: "#E2B93B", roughness: 0.35, clearcoat: 0.6, emissive: "#E2B93B", emissiveIntensity: 0.15 }), []);
  useEffect(
    () => () => {
      mat.dispose();
      insertMat.dispose();
    },
    [mat, insertMat],
  );

  // the insert arc (final size and place), flying in from above
  const insertGeo = useMemo(() => {
    const { a0, a1 } = insertArc(insertLen);
    return [0, Math.PI].map((phase) => new TubeGeometry(new RingStrand(a0, a1, phase), 120, STRAND_R, 8, false));
  }, [insertLen]);
  useEffect(() => () => insertGeo.forEach((g) => g.dispose()), [insertGeo]);

  /**
   * Phases of the insertion (e = 0 → 1): the ring opens at the cloning site (to 0.35), the insert
   * drops into the gap (to 0.8) and the ring closes around it. The open ring's parts keep their
   * final angles, so ring and insert join seamlessly.
   */
  const rebuild = (e: number) => {
    const merged = e >= 0.999;
    const { a0, a1 } = insertArc(insertLen);
    let parts: Part[];
    let start: number;
    let span: number;
    if (merged) {
      parts = partsFor(insertLen, 1).filter((p) => p.len > 0);
      start = 0;
      span = Math.PI * 2;
    } else {
      const open = Math.min(1, e / 0.35);
      const all = partsFor(insertLen, 0);
      // the ring starts just after the gap: cloning site (until cut), terminator … origin, backbone, promoter, RBS
      parts = [...all.slice(3), ...all.slice(0, 2)].filter((p) => p.len > 0 && (p.id !== "site" || open === 0));
      const centre = (a0 + a1) / 2;
      const half = (open * (a1 - a0)) / 2;
      const siteHalf = open === 0 ? ((all[3].len / all.reduce((t, p) => t + p.len, 0)) * Math.PI * 2) / 2 : 0;
      start = centre + half - siteHalf;
      span = Math.PI * 2 - 2 * half;
    }
    const a = ringGeometry(parts, start, span, 0);
    const b = ringGeometry(parts, start, span, Math.PI);
    layout.current?.geometry.dispose();
    strandB.current?.geometry.dispose();
    layout.current = a;
    if (strandA.current) strandA.current.geometry = a.geometry;
    if (strandB.current) strandB.current.geometry = b.geometry;
  };

  const last = useRef(-1);
  useFrame((state, delta) => {
    const goal = usePipelineStore.getState().steps.plasmid;
    delta = stageDelta(delta);
    u.current += Math.sign(goal - u.current) * Math.min(Math.abs(goal - u.current), delta / 2.4);
    const e = u.current;
    const key = Math.round(e * 400) / 400;
    if (key !== last.current) {
      last.current = key;
      rebuild(e);
      if (e === 0 || e === 1) setSettled(e);
    }
    // the construct DNA waits above the cloning site from the start, then drops into the open ring
    const drop = e < 0.35 ? 0 : e < 0.8 ? (e - 0.35) / 0.45 : 1;
    const bob = e === 0 ? Math.sin(state.clock.elapsedTime * 1.4) * 0.15 : 0;
    for (const m of [insertA.current, insertB.current]) {
      if (!m) continue;
      m.visible = e < 0.999;
      m.position.set(0, WAIT * (1 - drop * drop * (3 - 2 * drop)) + bob, 0);
    }
  });

  const interactive = role === "current";
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || !layout.current) return;
    e.stopPropagation();
    const p = e.point;
    let a = Math.atan2(p.x, p.y);
    if (a < 0) a += Math.PI * 2;
    const L = layout.current;
    let f = (a - L.start) / L.span;
    f = ((f % 1) + 1) % 1;
    const part = (L.bounds.find((b) => f >= b.start && f <= b.end) ?? L.bounds[0]).part;
    useExplorerStore.getState().setHover({ key: `plasmid:${part.id}`, title: part.name, subtitle: part.detail, swatch: part.color });
    document.body.style.cursor = "help";
  };
  const onOut = () => {
    useExplorerStore.getState().setHover(null);
    document.body.style.cursor = "";
  };

  // label angles follow the layout on screen: finished ring from the top, or the empty ring around the cloning site
  const labelFor = (id: string, out = 3.2) => {
    let ordered: Part[];
    let start: number;
    if (settled) {
      ordered = partsFor(insertLen, 1).filter((p) => p.len > 0);
      start = 0;
    } else {
      const all = partsFor(insertLen, 0);
      ordered = [...all.slice(3), ...all.slice(0, 2)].filter((p) => p.len > 0);
      const { a0, a1 } = insertArc(insertLen);
      start = (a0 + a1) / 2 - ((all[3].len / ordered.reduce((t, p) => t + p.len, 0)) * Math.PI * 2) / 2;
    }
    const total = ordered.reduce((t, p) => t + p.len, 0);
    let acc = 0;
    for (const p of ordered) {
      if (p.id === id) {
        const a = start + ((acc + p.len / 2) / total) * Math.PI * 2;
        return [(R + out) * Math.sin(a), (R + out) * Math.cos(a), 0] as [number, number, number];
      }
      acc += p.len;
    }
    return [0, 0, 0] as [number, number, number];
  };

  return (
    <group>
      <mesh ref={strandA} material={mat} onPointerMove={onMove} onPointerOut={onOut} />
      <mesh ref={strandB} material={mat} onPointerMove={onMove} onPointerOut={onOut} />
      <mesh ref={insertA} geometry={insertGeo[0]} material={insertMat} raycast={() => null} />
      <mesh ref={insertB} geometry={insertGeo[1]} material={insertMat} raycast={() => null} />
      <SceneLabel position={[0, 0.6, 0]} tone="strong" essential>
        {exp?.expression.plasmid ?? "Expression plasmid"}
      </SceneLabel>
      <SceneLabel position={[0, -0.9, 0]} tone="muted">
        {settled ? "with the KRAS insert" : "empty plasmid"}
      </SceneLabel>
      {settled ? (
        <SceneLabel position={labelFor("insert", 2.6)} tone="gold" essential>
          KRAS construct · {insertLen} bases with tag
        </SceneLabel>
      ) : (
        <>
          <SceneLabel position={labelFor("site", -2.6)} essential>
            cloning site
          </SceneLabel>
          <SceneLabel position={[0, R + WAIT + 1.5, 0]} tone="gold" essential>
            KRAS construct DNA · {insertLen} bases, ready to insert
          </SceneLabel>
        </>
      )}
      <SceneLabel position={labelFor("promoter", 3.4)}>promoter (switch)</SceneLabel>
      <SceneLabel position={labelFor("resistance")}>antibiotic resistance</SceneLabel>
      <SceneLabel position={labelFor("origin")}>origin of replication</SceneLabel>
      <SceneLabel position={labelFor("terminator", 3.4)} tone="muted">
        terminator
      </SceneLabel>
    </group>
  );
}

export const plasmidFraming = () => framing([0, 1.8, 0], 14, [0, 0.1, 1]);
