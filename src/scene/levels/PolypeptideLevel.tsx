"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { AA_CLASS_INFO, aminoAcid } from "@/content/aminoAcids";
import { aaLabel } from "@/lib/structure/protein";
import { setBaseOpacity, useStage } from "../StageGroup";
import { transitionRuntime } from "../runtime";
import { ACCENT, BG, CHAIN_LINK, PEPTIDE_BOND } from "../shared/palette";
import { SceneLabel } from "../shared/SceneLabel";
import { cylinderMatrix } from "../shared/geometry";
import { getRibbon } from "./ProteinLevel";

const BEAD_R = 1.45;
const bg = new Color(BG);
const white = new Color("#ffffff");
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function PolypeptideLevel() {
  const { protein, chain } = useProteinData();
  const { role } = useStage();
  const residues = protein.residues;
  const n = residues.length;
  const selection = useExplorerStore((s) => s.selection);
  const unfoldedTarget = useExplorerStore((s) => s.chainUnfolded);

  const beads = useRef<InstancedMesh>(null);
  const links = useRef<InstancedMesh>(null);
  const bonds = useRef<InstancedMesh>(null);
  const ring = useRef<Group>(null);

  const res = useMemo(() => {
    const beadGeo = new SphereGeometry(1, 28, 18);
    const linkGeo = new CylinderGeometry(1, 1, 1, 10, 1, true);
    const bondGeo = new CylinderGeometry(1, 1, 1, 20);
    const ringGeo = new TorusGeometry(2.25, 0.11, 10, 64);
    const beadMat = new MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.8 });
    const linkMat = new MeshStandardMaterial({ color: CHAIN_LINK, roughness: 0.55 });
    const bondMat = new MeshPhysicalMaterial({ color: PEPTIDE_BOND, roughness: 0.25, metalness: 0.15, clearcoat: 0.6, emissive: PEPTIDE_BOND, emissiveIntensity: 0.12 });
    const ringMat = new MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.35, roughness: 0.4 });
    const ghostMat = new MeshStandardMaterial({ color: "#C5CEDB", roughness: 0.8, transparent: true, opacity: 0.16, depthWrite: false });
    ghostMat.userData.forceTransparent = true;
    return { beadGeo, linkGeo, bondGeo, ringGeo, beadMat, linkMat, bondMat, ringMat, ghostMat };
  }, []);
  useEffect(
    () => () => {
      Object.values(res).forEach((r) => r.dispose());
    },
    [res],
  );

  const baseColors = useMemo(() => residues.map((r) => new Color(AA_CLASS_INFO[aminoAcid(r.resName).cls].color)), [residues]);

  // Normalised distance of each bead from the zoom anchor (used for the reveal wave)
  const revealOrder = useMemo(() => {
    const anchor = transitionRuntime.anchor.clone();
    const d = chain.folded.map((p) => p.distanceTo(anchor));
    const max = Math.max(...d) || 1;
    return d.map((x) => x / max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, role]);

  const unfold = useRef(unfoldedTarget ? 1 : 0);
  const [settledLayout, setSettledLayout] = useState<"folded" | "unfolded" | "moving">(unfoldedTarget ? "unfolded" : "folded");
  const hovered = useRef<number | null>(null);
  const current = useMemo(() => chain.folded.map((p) => p.clone()), [chain]);
  const tmp = useMemo(() => ({ m: new Matrix4(), c: new Color(), v: new Vector3(), q: new Quaternion(), s: new Vector3(), a: new Vector3(), b: new Vector3() }), []);

  useFrame((state, delta) => {
    const beadMesh = beads.current;
    const linkMesh = links.current;
    const bondMesh = bonds.current;
    if (!beadMesh || !linkMesh || !bondMesh) return;
    const st = useExplorerStore.getState();

    // Fold / unfold animation (staggered from N- to C-terminus)
    const goal = st.chainUnfolded ? 1 : 0;
    if (unfold.current !== goal) {
      const step = delta / 1.8;
      unfold.current = goal > unfold.current ? Math.min(goal, unfold.current + step) : Math.max(goal, unfold.current - step);
      if (settledLayout !== "moving") setSettledLayout("moving");
      if (unfold.current === goal) setSettledLayout(goal ? "unfolded" : "folded");
    }
    const u = unfold.current;
    const stagger = 0.55;
    for (let i = 0; i < n; i++) {
      const ui = easeInOut(Math.min(1, Math.max(0, u * (1 + stagger) - (stagger * i) / (n - 1))));
      current[i].lerpVectors(chain.folded[i], chain.unfolded[i], ui);
    }

    // Reveal (protein ↔ chain morph) and approach dimming
    const rt = transitionRuntime;
    let reveal = 1;
    if (rt.active && rt.style === "morph") reveal = role === "incoming" ? rt.reveal : role === "outgoing" ? 1 - rt.reveal : 1;
    const dim = role === "outgoing" && rt.active && rt.style === "zoom" && rt.direction === 1 ? rt.approach : 0;
    const sel = st.selection.residueIndex;
    const hov = role === "current" ? (hovered.current ?? st.hoveredResidue) : null;
    const regionId = st.selection.regionId;
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.04;

    const scales: number[] = [];
    for (let i = 0; i < n; i++) {
      const appear = reveal >= 1 ? 1 : smoothstep(revealOrder[i] * 0.55, revealOrder[i] * 0.55 + 0.45, reveal);
      let s = BEAD_R * appear;
      const c = tmp.c.copy(baseColors[i]);
      if (i === sel) {
        s *= 1.12 * pulse + 0.25 * dim;
        c.lerp(white, 0.12 + 0.25 * dim);
      } else if (dim > 0) {
        c.lerp(bg, 0.78 * dim);
      } else if (i === hov) {
        s *= 1.28;
        c.lerp(white, 0.35);
      } else if (u < 0.01 && residues[i].regionId !== regionId) {
        c.lerp(bg, 0.12);
      }
      scales.push(s);
      tmp.m.compose(current[i], tmp.q.identity(), tmp.s.setScalar(s));
      beadMesh.setMatrixAt(i, tmp.m);
      beadMesh.setColorAt(i, c);
    }
    beadMesh.instanceMatrix.needsUpdate = true;
    // three.js caches an InstancedMesh's bounding sphere for raycasting and never refreshes it, so
    // after unfolding (or a reveal that started at scale 0) beads outside the stale sphere become
    // unclickable. Recomputing over 76 instances each frame is cheap.
    beadMesh.computeBoundingSphere();
    if (beadMesh.instanceColor) beadMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < n - 1; i++) {
      const ui = (Math.min(1, Math.max(0, u * (1 + stagger) - (stagger * i) / (n - 1))) + Math.min(1, Math.max(0, u * (1 + stagger) - (stagger * (i + 1)) / (n - 1)))) / 2;
      const pb = tmp.v.lerpVectors(chain.foldedPeptide[i], chain.unfoldedPeptide[i], easeInOut(ui));
      // no link across missing residues
      const appear = chain.gapAfter[i] ? 0 : Math.min(scales[i], scales[i + 1]) > 0.01 ? Math.min(scales[i], scales[i + 1]) / BEAD_R : 0;
      const lr = 0.32 * Math.min(1, appear);
      linkMesh.setMatrixAt(i * 2, cylinderMatrix(current[i], pb, lr, tmp.m));
      linkMesh.setMatrixAt(i * 2 + 1, cylinderMatrix(pb, current[i + 1], lr, tmp.m));
      // Peptide-bond marker: a short gold band on the link, at the real C–N bond position
      tmp.a.subVectors(current[i + 1], current[i]).normalize();
      tmp.b.copy(pb).addScaledVector(tmp.a, -0.3);
      const end = tmp.v.clone().addScaledVector(tmp.a, 0.3);
      bondMesh.setMatrixAt(i, cylinderMatrix(tmp.b, end, 0.62 * Math.min(1, appear), tmp.m));
    }
    linkMesh.instanceMatrix.needsUpdate = true;
    bondMesh.instanceMatrix.needsUpdate = true;
    setBaseOpacity(res.ghostMat, 0.16 * (1 - u));

    if (ring.current) {
      ring.current.position.copy(current[sel]);
      ring.current.scale.setScalar(pulse * (role === "current" || dim > 0 ? 1 : 0.001));
    }
  });

  const interactive = role === "current";
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.instanceId == null || useExplorerStore.getState().transition) return;
    e.stopPropagation();
    const i = e.instanceId;
    hovered.current = i;
    const r = residues[i];
    const aa = aminoAcid(r.resName);
    const st = useExplorerStore.getState();
    st.setHoveredResidue(i);
    st.setHover({
      key: `res:${i}`,
      title: `${aaLabel(r)} · ${aa.name}`,
      subtitle: st.mode === "beginner" ? `Amino acid ${r.seq} of ${n} · ${AA_CLASS_INFO[aa.cls].beginner}` : `Residue ${r.seq}/${n} · ${AA_CLASS_INFO[aa.cls].label} · ${aa.residueFormula} residue`,
      hint: "Click to zoom into this amino acid",
      swatch: AA_CLASS_INFO[aa.cls].color,
    });
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    hovered.current = null;
    const st = useExplorerStore.getState();
    st.setHoveredResidue(null);
    st.setHover(null);
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.instanceId == null || e.delta > 5) return;
    e.stopPropagation();
    const i = e.instanceId;
    hovered.current = null;
    document.body.style.cursor = "";
    useExplorerStore.getState().setHoveredResidue(null);
    useExplorerStore.getState().drillDown({ residueIndex: i, regionId: residues[i].regionId }, current[i].toArray());
  };

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  // Labels use the settled layout (hidden while the chain is moving)
  const layout = settledLayout === "unfolded" ? chain.unfolded : chain.folded;
  const peptideLayout = settledLayout === "unfolded" ? chain.unfoldedPeptide : chain.foldedPeptide;
  const sel = selection.residueIndex;
  const region = protein.regionById[selection.regionId];
  const labelled = useMemo(() => {
    const set = new Set<number>();
    if (settledLayout === "unfolded") {
      for (let i = 0; i < n; i += 5) set.add(i);
    } else if (region) {
      // the two ends of the clicked region (neighbouring beads are too close to label them all)
      set.add(region.startIndex);
      set.add(region.endIndex);
    }
    // keep the selected residue's own label clear (folded neighbours sit closer on screen)
    const clear = settledLayout === "unfolded" ? 2 : 3;
    for (const i of [...set]) if (Math.abs(i - sel) < clear) set.delete(i);
    set.delete(0);
    set.delete(n - 1);
    return [...set];
  }, [settledLayout, region, sel, n]);
  const up = (p: Vector3, d = 2.6) => [p.x, p.y + d, p.z] as [number, number, number];
  const ghost = getRibbon(protein);

  return (
    <group>
      <instancedMesh ref={beads} args={[res.beadGeo, res.beadMat, n]} onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} />
      <instancedMesh ref={links} args={[res.linkGeo, res.linkMat, (n - 1) * 2]} raycast={() => null} />
      <instancedMesh ref={bonds} args={[res.bondGeo, res.bondMat, n - 1]} raycast={() => null} />
      <mesh geometry={ghost.geometry} material={res.ghostMat} raycast={() => null} />
      <Billboard ref={ring}>
        <mesh geometry={res.ringGeo} material={res.ringMat} raycast={() => null} />
      </Billboard>

      {settledLayout !== "moving" && (
        <>
          <SceneLabel position={up(layout[sel], 3.2)} tone="accent" essential>
            {aaLabel(residues[sel])}
          </SceneLabel>
          {labelled.map((i) => (
            <SceneLabel key={i} position={up(layout[i])}>
              {aaLabel(residues[i])}
            </SceneLabel>
          ))}
          <SceneLabel position={up(layout[0], 3)} tone="muted">
            N-terminus
          </SceneLabel>
          <SceneLabel position={up(layout[n - 1], 3)} tone="muted">
            C-terminus
          </SceneLabel>
          {sel < n - 1 && !chain.gapAfter[sel] && (
            <SceneLabel position={[peptideLayout[sel].x, peptideLayout[sel].y - 1.8, peptideLayout[sel].z]} tone="gold">
              peptide bond
            </SceneLabel>
          )}
        </>
      )}
    </group>
  );
}
