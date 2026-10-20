"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { CapsuleGeometry, CatmullRomCurve3, Color, CylinderGeometry, Group, InstancedMesh, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector3 } from "three";
import { aminoAcid } from "@/content/aminoAcids";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { aaLabel } from "@/lib/structure/protein";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { cylinderMatrix } from "@/scene/shared/geometry";
import { useStage } from "@/scene/StageGroup";
import { framing } from "../runtime";
import { useViewFade } from "../lib/viewFade";

/* B-DNA, to scale: 1 unit = 4 Å (radius 10 Å, rise 3.4 Å and 34.3° twist per base pair) */
const FIRST_CODON = 10;
const CODONS = 12;
const BP = CODONS * 3;
const RISE = 3.38 / 4;
const RADIUS = 2.5;
const TWIST = (34.3 * Math.PI) / 180;
const GROOVE = (155 * Math.PI) / 180; // azimuth between the two backbones: minor groove on one side
const BASE_COLORS: Record<string, string> = { A: "#4FAF5C", T: "#E0544C", G: "#E2B93B", C: "#2F72E4" };
const PAIR: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
/** Codons known for certain in the human KRAS gene (from the standard mutation notation c.34–39) */
const KNOWN: Record<number, string> = { 12: "GGT", 13: "GGC" };

const xAt = (i: number) => (i - (BP - 1) / 2) * RISE;
const strandPoint = (i: number, strand: 0 | 1, r = RADIUS) => {
  const a = i * TWIST + (strand ? GROOVE : 0);
  return new Vector3(xAt(i), r * Math.cos(a), r * Math.sin(a));
};

function DnaView({ active }: { active: boolean }) {
  const { protein } = useProteinData();
  const { role } = useStage();
  const group = useViewFade(active);
  const spin = useRef<Group>(null);
  const rungs = useRef<InstancedMesh>(null);
  const phosphates = useRef<InstancedMesh>(null);

  const res = useMemo(() => {
    const curve = (strand: 0 | 1) => {
      const pts: Vector3[] = [];
      for (let t = -0.5; t <= BP - 0.5; t += 0.125) pts.push(strandPoint(t, strand));
      return new CatmullRomCurve3(pts);
    };
    const a = new TubeGeometry(curve(0), BP * 10, 0.32, 10, false);
    const b = new TubeGeometry(curve(1), BP * 10, 0.32, 10, false);
    const matA = new MeshPhysicalMaterial({ color: "#2A5CB8", roughness: 0.35, clearcoat: 0.6 });
    const matB = new MeshPhysicalMaterial({ color: "#7FB2EC", roughness: 0.35, clearcoat: 0.6 });
    const rung = new CylinderGeometry(1, 1, 1, 10);
    const rungMat = new MeshStandardMaterial({ roughness: 0.5 });
    const ball = new SphereGeometry(1, 14, 10);
    const ballMat = new MeshStandardMaterial({ color: "#E8862A", roughness: 0.45 });
    return { a, b, matA, matB, rung, rungMat, ball, ballMat };
  }, []);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  // two half-rungs per base pair, coloured by base where the letter is known
  const bases = useMemo(() => {
    const out: { i: number; strand: 0 | 1; letter: string | null; codon: number }[] = [];
    for (let i = 0; i < BP; i++) {
      const codon = FIRST_CODON + Math.floor(i / 3);
      const known = KNOWN[codon]?.[i % 3] ?? null;
      out.push({ i, strand: 0, letter: known, codon });
      out.push({ i, strand: 1, letter: known ? PAIR[known] : null, codon });
    }
    return out;
  }, []);

  useEffect(() => {
    const m = rungs.current;
    const p = phosphates.current;
    if (!m || !p) return;
    const mat = new Matrix4();
    const c = new Color();
    bases.forEach((b, k) => {
      const from = strandPoint(b.i, b.strand, RADIUS * 0.92);
      const to = strandPoint(b.i, 0, RADIUS * 0.92).lerp(strandPoint(b.i, 1, RADIUS * 0.92), 0.5);
      m.setMatrixAt(k, cylinderMatrix(from, to, b.letter ? 0.3 : 0.22, mat));
      m.setColorAt(k, c.set(b.letter ? BASE_COLORS[b.letter] : (b.codon - FIRST_CODON) % 2 ? "#A9B4C5" : "#C6CEDB"));
      p.setMatrixAt(k, mat.makeScale(0.42, 0.42, 0.42).setPosition(strandPoint(b.i, b.strand)));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    p.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [bases]);

  // the helix turns slowly about its own axis
  useFrame((_, delta) => {
    if (spin.current && useExplorerStore.getState().autoRotate && !useExplorerStore.getState().hover) spin.current.rotation.x += delta * 0.18;
  });

  const interactive = active && role === "current";
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.instanceId == null) return;
    e.stopPropagation();
    const b = bases[e.instanceId];
    const residue = protein.residues.find((r) => r.seq === b.codon);
    const aa = residue ? aminoAcid(residue.resName) : null;
    const known = KNOWN[b.codon];
    const mode = useExplorerStore.getState().mode;
    useExplorerStore.getState().setHover({
      key: `codon:${b.codon}`,
      title: `Codon ${b.codon}${known ? ` · ${known}` : ""} → ${aa ? `${aa.name.toLowerCase()} (${aaLabel(residue!)})` : "?"}`,
      subtitle: known
        ? mode === "beginner"
          ? "These three letters in the human gene spell glycine. The E. coli-optimized copy may use another glycine codon."
          : `Human KRAS c.${(b.codon - 1) * 3 + 1}–${b.codon * 3}. G12/G13 mutations (e.g. c.35G>A, G12D) change these bases.`
        : "The amino acid is known from the protein; the DNA letters of this codon are not shown.",
      swatch: known ? BASE_COLORS.G : undefined,
    });
    document.body.style.cursor = "help";
  };
  const onOut = () => {
    useExplorerStore.getState().setHover(null);
    document.body.style.cursor = "";
  };

  const labelAt = (i: number, dy: number) => [xAt(i), dy, 0] as [number, number, number];
  return (
    <group ref={group}>
      <group ref={spin}>
        <mesh geometry={res.a} material={res.matA} raycast={() => null} />
        <mesh geometry={res.b} material={res.matB} raycast={() => null} />
        <instancedMesh ref={phosphates} args={[res.ball, res.ballMat, bases.length]} raycast={() => null} />
        <instancedMesh ref={rungs} args={[res.rung, res.rungMat, bases.length]} onPointerMove={onMove} onPointerOut={onOut} raycast={interactive ? InstancedMesh.prototype.raycast : () => null} />
      </group>
      {active && (
        <>
          <SceneLabel position={labelAt(7, 4.1)} tone="gold" essential>
            codon 12 · GGT
          </SceneLabel>
          <SceneLabel position={labelAt(10, -4.1)} tone="gold" essential>
            codon 13 · GGC
          </SceneLabel>
          <SceneLabel position={[xAt(0) - 1.6, 0, 0]} tone="muted">
            5′ end
          </SceneLabel>
          <SceneLabel position={[xAt(BP - 1) + 1.6, 0, 0]} tone="muted">
            3′ end
          </SceneLabel>
          <SceneLabel position={labelAt(27, 4.3)}>2 nm wide double helix</SceneLabel>
          <SceneLabel position={labelAt(22, -4.3)} tone="muted">
            1 codon = 3 base pairs
          </SceneLabel>
        </>
      )}
    </group>
  );
}

/* Chromosome 12 as it looks during cell division: two sister chromatids joined at the centromere */
const P_ARM = 5.8; // p arm ≈ 26% of the length (centromere near 35 of 133 Mb)
const Q_ARM = 16.2;
const CHROMATID_R = 1.25;
/** KRAS (12p12.1) lies about 25 Mb from the p-arm tip, ≈ 71% of the way to the centromere */
const KRAS_Y = P_ARM * (1 - 0.71);

function ChromosomeView({ active }: { active: boolean }) {
  const group = useViewFade(active);
  const spin = useRef<Group>(null);
  const res = useMemo(() => {
    const p = new CapsuleGeometry(CHROMATID_R, P_ARM - CHROMATID_R, 8, 20);
    const q = new CapsuleGeometry(CHROMATID_R, Q_ARM - CHROMATID_R, 8, 20);
    const body = new MeshPhysicalMaterial({ color: "#B9C3E3", roughness: 0.5, clearcoat: 0.4 });
    const band = new CylinderGeometry(CHROMATID_R * 1.03, CHROMATID_R * 1.03, 1, 24, 1, true);
    const bandMat = new MeshStandardMaterial({ color: "#6F7BA0", roughness: 0.7 });
    const kras = new MeshStandardMaterial({ color: "#E2B93B", emissive: "#E2B93B", emissiveIntensity: 0.35, roughness: 0.4 });
    return { p, q, body, band, bandMat, kras };
  }, []);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  useFrame((_, delta) => {
    if (spin.current && useExplorerStore.getState().autoRotate) spin.current.rotation.y += delta * 0.25;
  });

  // schematic G-bands (not the real banding pattern), as offsets from the centromere
  const pBands = [1.0, 2.6, 4.3];
  const qBands = [-1.6, -3.4, -5.0, -6.9, -8.8, -10.3, -12.2, -14.0];
  const tilt = 0.06;
  return (
    <group ref={group}>
      <group ref={spin}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * CHROMATID_R * 0.82, 0, 0]}>
            <group rotation={[0, 0, -side * tilt]}>
              <mesh geometry={res.p} material={res.body} position={[0, P_ARM / 2, 0]} />
              {pBands.map((y) => (
                <mesh key={y} geometry={res.band} material={res.bandMat} position={[0, y, 0]} scale={[1, 0.45, 1]} />
              ))}
              <mesh geometry={res.band} material={res.kras} position={[0, KRAS_Y, 0]} scale={[1.04, 0.42, 1.04]} />
            </group>
            <group rotation={[0, 0, side * tilt]}>
              <mesh geometry={res.q} material={res.body} position={[0, -Q_ARM / 2, 0]} />
              {qBands.map((y) => (
                <mesh key={y} geometry={res.band} material={res.bandMat} position={[0, y, 0]} scale={[1, 0.55, 1]} />
              ))}
            </group>
          </group>
        ))}
      </group>
      {active && (
        <>
          <SceneLabel position={[0, P_ARM + 2.2, 0]} essential>
            Chromosome 12
          </SceneLabel>
          <SceneLabel position={[5.6, KRAS_Y, 0]} tone="gold" essential>
            KRAS gene · 12p12.1
          </SceneLabel>
          <SceneLabel position={[-4.8, P_ARM * 0.55, 0]} tone="muted">
            short arm (p)
          </SceneLabel>
          <SceneLabel position={[-4.6, -Q_ARM * 0.55, 0]} tone="muted">
            long arm (q)
          </SceneLabel>
          <SceneLabel position={[4.6, -0.6, 0]} tone="muted">
            centromere
          </SceneLabel>
        </>
      )}
    </group>
  );
}

export function GeneStage() {
  const view = usePipelineStore((s) => s.geneView);
  return (
    <group>
      <DnaView active={view === "dna"} />
      <group position={[0, (Q_ARM - P_ARM) / 2 - 0.5, 0]}>
        <ChromosomeView active={view === "chromosome"} />
      </group>
    </group>
  );
}

export const geneFraming = () =>
  usePipelineStore.getState().geneView === "dna" ? framing([0, 0, 0], 15.5, [0.12, 0.32, 1]) : framing([0, 0, 0], 12.5, [0.1, 0.08, 1]);
