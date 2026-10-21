"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Color, CylinderGeometry, Mesh, MeshPhysicalMaterial, SphereGeometry, Vector3 } from "three";
import { getResidueMolecule, useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { ELEMENTS } from "@/lib/chem/elements";
import type { MolAtom, MolBond, ResidueMolecule } from "@/lib/chem/residueMolecule";
import { atomHoverText } from "@/content/info";
import { setBaseOpacity, useStage } from "../StageGroup";
import { transitionRuntime } from "../runtime";
import { PEPTIDE_BOND } from "../shared/palette";
import { SceneLabel } from "../shared/SceneLabel";
import { placeBetween } from "../shared/geometry";

const BOND_R = 0.13;
const CONTEXT_OPACITY = 0.38;
const WATER = "#7DB4EA";

interface BondPiece {
  bond: MolBond;
  from: string;
  to: string;
  /** fraction along the bond where this piece starts/ends */
  t0: number;
  t1: number;
  offset: Vector3;
  radius: number;
  color: string;
  peptide: boolean;
}

function bondPieces(mol: ResidueMolecule): BondPiece[] {
  const pieces: BondPiece[] = [];
  const neighbors = (id: string) => mol.bonds.filter((b) => b.a === id || b.b === id).map((b) => (b.a === id ? b.b : b.a));
  for (const bond of mol.bonds) {
    const A = mol.atomById[bond.a];
    const B = mol.atomById[bond.b];
    const offsets: Vector3[] = [new Vector3()];
    let radius = BOND_R;
    if (bond.order === 2) {
      const axis = new Vector3().subVectors(B.position, A.position).normalize();
      const third = [...neighbors(bond.a).filter((x) => x !== bond.b), ...neighbors(bond.b).filter((x) => x !== bond.a)][0];
      let perp: Vector3;
      if (third) {
        const c = new Vector3().subVectors(mol.atomById[third].position, A.position);
        perp = c.addScaledVector(axis, -c.dot(axis)).normalize();
      } else {
        perp = new Vector3(0, 0, 1).cross(axis).normalize();
      }
      offsets.splice(0, 1, perp.clone().multiplyScalar(0.13), perp.clone().multiplyScalar(-0.13));
      radius = BOND_R * 0.62;
    }
    for (const off of offsets) {
      if (bond.peptide) {
        pieces.push({ bond, from: bond.a, to: bond.b, t0: 0, t1: 1, offset: off, radius: radius * 1.25, color: PEPTIDE_BOND, peptide: true });
      } else {
        pieces.push({ bond, from: bond.a, to: bond.b, t0: 0, t1: 0.5, offset: off, radius, color: ELEMENTS[A.element].color, peptide: false });
        pieces.push({ bond, from: bond.a, to: bond.b, t0: 0.5, t1: 1, offset: off, radius, color: ELEMENTS[B.element].color, peptide: false });
      }
    }
  }
  return pieces;
}

export function AminoAcidLevel() {
  const { protein } = useProteinData();
  const { role } = useStage();
  const residueIndex = useExplorerStore((s) => s.selection.residueIndex);
  const form = useExplorerStore((s) => s.aminoAcidForm);
  const mol = getResidueMolecule(protein, residueIndex);

  const sphere = useMemo(() => new SphereGeometry(1, 32, 20), []);
  const cylinder = useMemo(() => new CylinderGeometry(1, 1, 1, 14, 1, true), []);
  const halo = useMemo(() => new SphereGeometry(1, 24, 16), []);

  const atomMats = useMemo(
    () =>
      mol.atoms.map((a) => {
        const m = new MeshPhysicalMaterial({
          color: ELEMENTS[a.element].color,
          roughness: a.element === "H" ? 0.35 : 0.28,
          clearcoat: 0.8,
          clearcoatRoughness: 0.2,
          envMapIntensity: 0.85,
        });
        if (a.context) m.opacity = CONTEXT_OPACITY;
        return m;
      }),
    [mol],
  );
  const pieces = useMemo(() => bondPieces(mol), [mol]);
  const bondMats = useMemo(
    () =>
      pieces.map((p) => {
        const m = new MeshPhysicalMaterial({
          color: p.color,
          roughness: 0.35,
          clearcoat: 0.5,
          emissive: p.peptide ? new Color(PEPTIDE_BOND) : new Color(0),
          emissiveIntensity: p.peptide ? 0.35 : 0,
        });
        const ctx = mol.atomById[p.from].context || mol.atomById[p.to].context;
        if (ctx && !p.peptide) m.opacity = CONTEXT_OPACITY;
        return m;
      }),
    [pieces, mol],
  );
  const haloMat = useMemo(() => {
    const m = new MeshPhysicalMaterial({ color: WATER, roughness: 0.2, transparent: true, opacity: 0.22, depthWrite: false });
    m.userData.forceTransparent = true;
    return m;
  }, []);
  useEffect(
    () => () => {
      atomMats.forEach((m) => m.dispose());
    },
    [atomMats],
  );
  useEffect(
    () => () => {
      bondMats.forEach((m) => m.dispose());
    },
    [bondMats],
  );
  useEffect(
    () => () => {
      sphere.dispose();
      cylinder.dispose();
      halo.dispose();
      haloMat.dispose();
    },
    [sphere, cylinder, halo, haloMat],
  );

  const atomRefs = useRef<(Mesh | null)[]>([]);
  const bondRefs = useRef<(Mesh | null)[]>([]);
  const haloRefs = useRef<(Mesh | null)[]>([]);
  const presence = useRef<number[]>(mol.atoms.map((a) => (form === "free" ? +a.inFree : +a.inResidue)));
  const hovered = useRef<string | null>(null);
  const tmpA = useMemo(() => new Vector3(), []);
  const tmpB = useMemo(() => new Vector3(), []);
  useEffect(() => {
    presence.current = mol.atoms.map((a) => (useExplorerStore.getState().aminoAcidForm === "free" ? +a.inFree : +a.inResidue));
  }, [mol]);

  useFrame((_, delta) => {
    const st = useExplorerStore.getState();
    const free = st.aminoAcidForm === "free";
    const rt = transitionRuntime;
    const dim = role === "outgoing" && rt.active && rt.direction === 1 ? rt.approach : 0;
    const selected = st.selection.atomId;

    mol.atoms.forEach((a, i) => {
      const goal = free ? +a.inFree : +a.inResidue;
      const p = presence.current[i];
      presence.current[i] = p + Math.sign(goal - p) * Math.min(Math.abs(goal - p), delta * 2.4);
      const mesh = atomRefs.current[i];
      if (!mesh) return;
      const e = presence.current[i];
      const ease = e * e * (3 - 2 * e);
      let scale = ELEMENTS[a.element].ballRadius * ease;
      const mat = atomMats[i];
      const isHover = hovered.current === a.id && role === "current";
      if (dim > 0 && a.id === selected) scale *= 1 + 0.35 * dim;
      else if (isHover) scale *= 1.18;
      mesh.scale.setScalar(Math.max(scale, 1e-4));
      mesh.visible = e > 0.01;
      const base = a.context ? CONTEXT_OPACITY : 1;
      setBaseOpacity(mat, a.id === selected ? base : base * (1 - 0.8 * dim));
      mat.emissive.set(isHover || (dim > 0 && a.id === selected) ? "#ffffff" : "#000000");
      mat.emissiveIntensity = isHover ? 0.18 : 0.3 * dim;

      const h = haloRefs.current[i];
      if (h) {
        const show = a.leaving ? ease * (free ? 1 : 0) : 0;
        h.scale.setScalar(ELEMENTS[a.element].ballRadius * 1.75 * Math.max(show, 1e-4));
        h.visible = show > 0.02;
      }
    });

    pieces.forEach((piece, k) => {
      const mesh = bondRefs.current[k];
      if (!mesh) return;
      const ia = mol.atoms.indexOf(mol.atomById[piece.from]);
      const ib = mol.atoms.indexOf(mol.atomById[piece.to]);
      const e = Math.min(presence.current[ia], presence.current[ib]);
      const A = mol.atomById[piece.from].position;
      const B = mol.atomById[piece.to].position;
      tmpA.lerpVectors(A, B, piece.t0).add(piece.offset);
      tmpB.lerpVectors(A, B, piece.t1).add(piece.offset);
      placeBetween(mesh, tmpA, tmpB, piece.radius * Math.max(e, 1e-4));
      mesh.visible = e > 0.01;
      const ctx = mol.atomById[piece.from].context || mol.atomById[piece.to].context;
      setBaseOpacity(bondMats[k], (ctx && !piece.peptide ? CONTEXT_OPACITY : 1) * (1 - 0.8 * dim));
    });
  });

  const interactive = role === "current";
  const onOver = (a: MolAtom, i: number) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || presence.current[i] < 0.5 || useExplorerStore.getState().transition) return;
    e.stopPropagation();
    hovered.current = a.id;
    const st = useExplorerStore.getState();
    const t = atomHoverText(mol, a, st.mode, st.aminoAcidForm);
    st.setHover({ key: `atom:${a.id}`, title: t.title, subtitle: t.subtitle, hint: t.hint, swatch: ELEMENTS[a.element].color });
    document.body.style.cursor = a.context ? "default" : "pointer";
  };
  const onOut = (a: MolAtom) => () => {
    if (hovered.current === a.id) hovered.current = null;
    const st = useExplorerStore.getState();
    if (st.hover?.key === `atom:${a.id}`) st.setHover(null);
    document.body.style.cursor = "";
  };
  const onClick = (a: MolAtom, i: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || a.context || presence.current[i] < 0.5 || e.delta > 5) return;
    e.stopPropagation();
    hovered.current = null;
    document.body.style.cursor = "";
    useExplorerStore.getState().drillDown({ atomId: a.id, atomElement: a.element, particleIndex: -1 }, a.position.toArray());
  };
  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  const labelAtoms = mol.atoms.filter((a) => {
    if (a.context) return false;
    if (form === "free" ? !a.inFree : !a.inResidue) return false;
    if (!a.isHydrogen) return true;
    return a.group === "backbone" || mol.resName === "GLY" || mol.resName === "ALA";
  });
  const out = (p: Vector3, d: number): [number, number, number] => {
    const v = p.clone().sub(mol.center);
    if (v.lengthSq() < 1e-6) v.set(0, 1, 0);
    return p.clone().addScaledVector(v.normalize(), d).toArray() as [number, number, number];
  };
  const at = (id: string) => mol.atomById[id]?.position;
  const mid = (a: string, b: string): [number, number, number] | null => {
    const A = at(a);
    const B = at(b);
    return A && B ? (A.clone().add(B).multiplyScalar(0.5).add(new Vector3(0, -0.75, 0)).toArray() as [number, number, number]) : null;
  };
  const prevBond = mid("prev:C", "N");
  const nextBond = mid("C", "next:N");
  const isGly = mol.resName === "GLY";
  const rPos = isGly ? at("HA3") : mol.sideChainCentroid;
  const leavingC = at("OXT");

  return (
    <group>
      {mol.atoms.map((a, i) => (
        <group key={a.id}>
          <mesh
            ref={(el) => {
              atomRefs.current[i] = el;
            }}
            position={a.position}
            geometry={sphere}
            material={atomMats[i]}
            onPointerOver={onOver(a, i)}
            onPointerOut={onOut(a)}
            onClick={onClick(a, i)}
          />
          {a.leaving && (
            <mesh
              ref={(el) => {
                haloRefs.current[i] = el;
              }}
              position={a.position}
              geometry={halo}
              material={haloMat}
              raycast={() => null}
            />
          )}
        </group>
      ))}
      {pieces.map((p, k) => (
        <mesh
          key={`${p.bond.id}-${k}`}
          ref={(el) => {
            bondRefs.current[k] = el;
          }}
          geometry={cylinder}
          material={bondMats[k]}
          raycast={() => null}
        />
      ))}

      {labelAtoms.map((a) => (
        <SceneLabel key={a.id} position={out(a.position, a.isHydrogen ? 0.5 : 0.75)} tone={a.id === "CA" ? "strong" : "default"}>
          {a.display}
        </SceneLabel>
      ))}
      {rPos && (
        <SceneLabel position={out(rPos, isGly ? 1.25 : 1.8)} tone="accent" essential>
          {isGly ? "side chain R = H" : "side chain (R)"}
        </SceneLabel>
      )}
      {form === "residue" && prevBond && (
        <SceneLabel position={prevBond} tone="gold" essential>
          peptide bond
        </SceneLabel>
      )}
      {form === "residue" && nextBond && (
        <SceneLabel position={nextBond} tone="gold" essential>
          peptide bond
        </SceneLabel>
      )}
      {form === "residue" && at("prev:CA") && (
        <SceneLabel position={out(at("prev:CA")!, 1)} tone="muted">
          ← {mol.prevLabel} (previous)
        </SceneLabel>
      )}
      {form === "residue" && at("next:CA") && (
        <SceneLabel position={out(at("next:CA")!, 1)} tone="muted">
          {mol.nextLabel} (next) →
        </SceneLabel>
      )}
      {form === "free" && at("N") && (
        <SceneLabel position={out(at("N")!, 2.1)} tone="muted">
          amino group
        </SceneLabel>
      )}
      {form === "free" && leavingC && (
        <SceneLabel position={out(leavingC, 1.9)} tone="muted">
          carboxyl group
        </SceneLabel>
      )}
      {form === "free" && leavingC && (
        <SceneLabel position={[leavingC.x + 0.4, leavingC.y - 1.6, leavingC.z]} className="!bg-[#E6F1FC] !text-[#245a8f] !border-[#B9D7F3] dark:!bg-[#16304f] dark:!text-[#a9d0f5] dark:!border-[#2d5684]" essential>
          blue halo: leaves as H₂O when bonding
        </SceneLabel>
      )}
    </group>
  );
}
