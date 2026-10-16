import { Vector3 } from "three";
import type { ProteinModel, Residue } from "@/lib/structure/protein";
import { aaLabel } from "@/lib/structure/protein";
import { ELEMENTS, X_H_BOND_LENGTH, type ElementSymbol } from "./elements";
import { RESIDUE_TEMPLATES, SIDE_CHAIN_CHARGE, displayAtomName, type BondOrder, type HGeometry } from "./residueTemplates";
import { idealCB, placeHydrogens } from "./geometry";

/**
 * Builds the Level III ball-and-stick model of one residue taken from the real protein.
 *
 * Both chemical forms are produced in one model so the view can animate between them:
 *  - "residue": the unit as it sits inside the chain (pH ≈ 7), with ghosted atoms of the
 *    neighbouring residues and the two peptide bonds that join them;
 *  - "free":    the neutral, textbook free amino acid H₂N–CαH(R)–COOH, which has one extra
 *    H on N and an extra OH on C: the atoms released as water when a peptide bond forms.
 */

export type MolForm = "residue" | "free";

export interface MolAtom {
  id: string;
  name: string;
  display: string;
  element: ElementSymbol;
  position: Vector3;
  isHydrogen: boolean;
  group: "backbone" | "sidechain";
  /** Present in the residue (in-chain) form */
  inResidue: boolean;
  /** Present in the free amino acid */
  inFree: boolean;
  /** Atom belongs to a neighbouring residue (context only) */
  context?: { relation: "previous" | "next"; residueLabel: string };
  /** Removed (as part of H₂O) when this amino acid forms a peptide bond */
  leaving?: boolean;
  /** Heavy atom this hydrogen is attached to */
  parent?: string;
}

export interface MolBond {
  id: string;
  a: string;
  b: string;
  order: BondOrder;
  peptide?: boolean;
}

export interface ResidueMolecule {
  residueIndex: number;
  resName: string;
  seq: number;
  label: string;
  atoms: MolAtom[];
  atomById: Record<string, MolAtom>;
  bonds: MolBond[];
  /** Bounding sphere of all atoms (both forms) */
  center: Vector3;
  radius: number;
  sideChainCentroid: Vector3;
  formulaResidue: string;
  formulaFree: string;
  chargeResidue: number;
  prevLabel?: string;
  nextLabel?: string;
  isNTerminal: boolean;
  isCTerminal: boolean;
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => (n === 1 ? "" : String(n).split("").map((d) => SUB[Number(d)]).join(""));

export function hillFormula(counts: Partial<Record<ElementSymbol, number>>): string {
  const order: ElementSymbol[] = ["C", "H", "N", "O", "S"];
  return order.filter((e) => (counts[e] ?? 0) > 0).map((e) => `${e}${sub(counts[e]!)}`).join("");
}

function hydrogenNames(heavy: string, count: number): string[] {
  const suffix = heavy.slice(1);
  if (heavy === "N") return count === 1 ? ["H"] : Array.from({ length: count }, (_, i) => `H${i + 1}`);
  if (count === 1) return [`H${suffix}`];
  const numbered = /\d$/.test(suffix);
  const start = numbered || count === 3 ? 1 : 2;
  return Array.from({ length: count }, (_, i) => `H${suffix}${start + i}`);
}

export function buildResidueMolecule(protein: ProteinModel, residueIndex: number): ResidueMolecule {
  const res: Residue = protein.residues[residueIndex];
  // Neighbours only count when they are really joined by a peptide bond (no missing residues between)
  const prev: Residue | undefined = res.breakBefore ? undefined : protein.residues[residueIndex - 1];
  const nextCandidate: Residue | undefined = protein.residues[residueIndex + 1];
  const next: Residue | undefined = nextCandidate && !nextCandidate.breakBefore ? nextCandidate : undefined;
  const template = RESIDUE_TEMPLATES[res.resName] ?? RESIDUE_TEMPLATES.GLY;
  const isPro = res.resName === "PRO";

  const atoms: MolAtom[] = [];
  const bonds: MolBond[] = [];
  const byId: Record<string, MolAtom> = {};
  const addAtom = (atom: MolAtom) => {
    atoms.push(atom);
    byId[atom.id] = atom;
  };
  const addBond = (a: string, b: string, order: BondOrder = 1, peptide = false) => {
    if (!byId[a] || !byId[b]) return;
    bonds.push({ id: `${a}-${b}`, a, b, order, peptide });
  };

  const backboneNames = new Set(["N", "CA", "C", "O", "OXT"]);
  for (const [name, pos] of Object.entries(res.atoms)) {
    addAtom({
      id: name,
      name,
      display: displayAtomName(name),
      element: res.elements[name],
      position: pos.clone(),
      isHydrogen: false,
      group: backboneNames.has(name) ? "backbone" : "sidechain",
      inResidue: true,
      inFree: true,
    });
  }

  // Neighbouring residues (shown only in the in-chain form)
  if (prev?.atoms.C) {
    const ctx = { relation: "previous" as const, residueLabel: aaLabel(prev) };
    for (const n of ["CA", "C", "O"]) {
      if (!prev.atoms[n]) continue;
      addAtom({
        id: `prev:${n}`, name: n, display: displayAtomName(n), element: prev.elements[n], position: prev.atoms[n].clone(),
        isHydrogen: false, group: "backbone", inResidue: true, inFree: false, context: ctx,
      });
    }
  }
  if (next?.atoms.N) {
    const ctx = { relation: "next" as const, residueLabel: aaLabel(next) };
    for (const n of ["N", "CA"]) {
      if (!next.atoms[n]) continue;
      addAtom({
        id: `next:${n}`, name: n, display: displayAtomName(n), element: next.elements[n], position: next.atoms[n].clone(),
        isHydrogen: false, group: "backbone", inResidue: true, inFree: false, context: ctx,
      });
    }
  }

  // Heavy-atom bonds
  addBond("N", "CA");
  addBond("CA", "C");
  addBond("C", "O", 2);
  addBond("C", "OXT");
  addBond("CA", "CB");
  for (const [a, b, order] of template.bonds) addBond(a, b, order);
  addBond("prev:CA", "prev:C");
  addBond("prev:C", "prev:O", 2);
  addBond("prev:C", "N", 1, true);
  addBond("C", "next:N", 1, true);
  addBond("next:N", "next:CA");

  // Adjacency over heavy atoms (both forms) for hydrogen placement
  const adjacency = new Map<string, string[]>();
  for (const bnd of bonds) {
    adjacency.set(bnd.a, [...(adjacency.get(bnd.a) ?? []), bnd.b]);
    adjacency.set(bnd.b, [...(adjacency.get(bnd.b) ?? []), bnd.a]);
  }
  const pos = (id: string) => byId[id].position;
  const referenceFor = (center: string, neighbor: string): Vector3 | undefined => {
    // Prefer an atom double-bonded to the neighbour (gives syn O=C–O–H, in-plane ring OH, etc.)
    const dbl = bonds.find((b) => b.order === 2 && (b.a === neighbor || b.b === neighbor) && b.a !== center && b.b !== center);
    if (dbl) return pos(dbl.a === neighbor ? dbl.b : dbl.a);
    const other = (adjacency.get(neighbor) ?? []).find((n) => n !== center);
    return other ? pos(other) : undefined;
  };

  const addHydrogens = (
    heavy: string,
    positions: Vector3[],
    names: string[],
    flags: (i: number) => Pick<MolAtom, "inResidue" | "inFree" | "leaving" | "context">,
  ) => {
    positions.forEach((p, i) => {
      const id = heavy.includes(":") ? `${heavy.split(":")[0]}:${names[i]}` : names[i];
      const f = flags(i);
      addAtom({
        id, name: names[i], display: displayAtomName(names[i]), element: "H", position: p, isHydrogen: true,
        group: byId[heavy].group, parent: heavy, ...f,
      });
      bonds.push({ id: `${heavy}-${id}`, a: heavy, b: id, order: 1 });
    });
  };

  const hPositions = (center: string, count: number, geometry: HGeometry) => {
    const neigh = adjacency.get(center) ?? [];
    const ref = neigh.length === 1 ? referenceFor(center, neigh[0]) : undefined;
    return placeHydrogens(pos(center), neigh.map(pos), count, geometry, X_H_BOND_LENGTH[byId[center].element], ref);
  };

  // Backbone amide hydrogens
  const nLen = X_H_BOND_LENGTH.N;
  if (prev && byId["prev:C"]) {
    const extraDir = new Vector3().subVectors(pos("prev:C"), pos("N")).normalize();
    const extra = pos("N").clone().addScaledVector(extraDir, nLen);
    if (isPro) {
      addHydrogens("N", [extra], ["H"], () => ({ inResidue: false, inFree: true, leaving: true }));
    } else {
      const amide = hPositions("N", 1, "sp2");
      addHydrogens("N", [amide[0], extra], ["H", "H2"], (i) =>
        i === 0 ? { inResidue: true, inFree: true } : { inResidue: false, inFree: true, leaving: true },
      );
    }
  } else {
    // N-terminus: –NH₃⁺ in the protein, –NH₂ in the free amino acid
    const n = isPro ? 2 : 3;
    const hs = hPositions("N", n, "sp3");
    addHydrogens("N", hs, hydrogenNames("N", n), (i) => ({ inResidue: true, inFree: i < n - 1 }));
  }

  // Cα hydrogens
  const caCount = res.resName === "GLY" ? 2 : 1;
  const caH = hPositions("CA", caCount, "sp3");
  if (res.resName === "GLY" && caH.length === 2) {
    // The hydrogen in the Cβ position is glycine's entire side chain (R = H)
    const cb = idealCB(pos("N"), pos("CA"), pos("C"));
    const rFirst = caH[0].distanceTo(cb) < caH[1].distanceTo(cb);
    const ordered = rFirst ? [caH[1], caH[0]] : caH;
    addHydrogens("CA", ordered, ["HA2", "HA3"], () => ({ inResidue: true, inFree: true }));
    byId.HA3.group = "sidechain";
  } else {
    addHydrogens("CA", caH, ["HA"], () => ({ inResidue: true, inFree: true }));
  }

  // Side-chain hydrogens
  for (const spec of template.hydrogens) {
    if (!byId[spec.atom]) continue;
    const free = spec.countFree ?? spec.count;
    const n = Math.max(spec.count, free);
    if (n === 0) continue;
    const hs = hPositions(spec.atom, n, spec.geometry);
    addHydrogens(spec.atom, hs, hydrogenNames(spec.atom, n), (i) => ({ inResidue: i < spec.count, inFree: i < free }));
  }

  // Carboxyl end
  if (next && byId["next:N"]) {
    const dir = new Vector3().subVectors(pos("next:N"), pos("C")).normalize();
    addAtom({
      id: "OXT", name: "OXT", display: "OXT", element: "O", position: pos("C").clone().addScaledVector(dir, 1.32),
      isHydrogen: false, group: "backbone", inResidue: false, inFree: true, leaving: true,
    });
    bonds.push({ id: "C-OXT", a: "C", b: "OXT", order: 1 });
    adjacency.set("OXT", ["C"]);
    const [hxt] = placeHydrogens(pos("OXT"), [pos("C")], 1, "sp2", X_H_BOND_LENGTH.O, pos("O"));
    addAtom({
      id: "HXT", name: "HXT", display: "HXT", element: "H", position: hxt, isHydrogen: true, group: "backbone",
      parent: "OXT", inResidue: false, inFree: true, leaving: true,
    });
    bonds.push({ id: "OXT-HXT", a: "OXT", b: "HXT", order: 1 });
    // Amide H of the next residue (context)
    if (next.resName !== "PRO" && byId["next:CA"]) {
      const [h] = placeHydrogens(pos("next:N"), [pos("C"), pos("next:CA")], 1, "sp2", nLen);
      addAtom({
        id: "next:H", name: "H", display: "H", element: "H", position: h, isHydrogen: true, group: "backbone",
        parent: "next:N", inResidue: true, inFree: false, context: byId["next:N"].context,
      });
      bonds.push({ id: "next:N-next:H", a: "next:N", b: "next:H", order: 1 });
    }
  } else if (byId.OXT) {
    // C-terminus: –COO⁻ in the protein, –COOH in the free amino acid
    const [hxt] = placeHydrogens(pos("OXT"), [pos("C")], 1, "sp2", X_H_BOND_LENGTH.O, pos("O"));
    addAtom({
      id: "HXT", name: "HXT", display: "HXT", element: "H", position: hxt, isHydrogen: true, group: "backbone",
      parent: "OXT", inResidue: false, inFree: true,
    });
    bonds.push({ id: "OXT-HXT", a: "OXT", b: "HXT", order: 1 });
  }

  // Orient: Cα at the origin, N→C along +x, side chain pointing up (+y). Proper rotation.
  const origin = pos("CA").clone();
  const x = new Vector3().subVectors(pos("C"), pos("N")).normalize();
  const up = (byId.CB ? pos("CB").clone() : idealCB(pos("N"), pos("CA"), pos("C"))).sub(origin);
  const y = up.addScaledVector(x, -up.dot(x)).normalize();
  const z = new Vector3().crossVectors(x, y);
  for (const atom of atoms) {
    const d = atom.position.clone().sub(origin);
    atom.position.set(d.dot(x), d.dot(y), d.dot(z));
  }

  // Bounds, side-chain centroid, formulas
  const center = new Vector3();
  for (const a of atoms) center.add(a.position);
  center.divideScalar(atoms.length);
  let radius = 0;
  for (const a of atoms) radius = Math.max(radius, a.position.distanceTo(center) + ELEMENTS[a.element].ballRadius);

  const sideAtoms = atoms.filter((a) => a.group === "sidechain" && !a.context);
  const sideChainCentroid = new Vector3();
  for (const a of sideAtoms) sideChainCentroid.add(a.position);
  if (sideAtoms.length) sideChainCentroid.divideScalar(sideAtoms.length);

  const count = (form: MolForm) => {
    const c: Partial<Record<ElementSymbol, number>> = {};
    for (const a of atoms) {
      if (a.context) continue;
      if (form === "residue" ? !a.inResidue : !a.inFree) continue;
      c[a.element] = (c[a.element] ?? 0) + 1;
    }
    return c;
  };
  const chargeResidue = (SIDE_CHAIN_CHARGE[res.resName] ?? 0) + (prev ? 0 : 1) + (next ? 0 : -1);

  return {
    residueIndex,
    resName: res.resName,
    seq: res.seq,
    label: aaLabel(res),
    atoms,
    atomById: byId,
    bonds,
    center,
    radius,
    sideChainCentroid,
    formulaResidue: hillFormula(count("residue")),
    formulaFree: hillFormula(count("free")),
    chargeResidue,
    prevLabel: prev ? aaLabel(prev) : undefined,
    nextLabel: next ? aaLabel(next) : undefined,
    isNTerminal: !prev,
    isCTerminal: !next,
  };
}
