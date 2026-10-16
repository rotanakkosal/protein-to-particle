/**
 * Covalent topology of the standard amino-acid residues.
 *
 * Heavy-atom positions come from the crystal structure; X-ray structures at this resolution do
 * not resolve hydrogens, so they are placed from these templates with ideal geometry
 * (see addHydrogens.ts). Bond orders use one Kekulé structure for aromatic rings.
 *
 * Hydrogen counts describe the residue as it exists in a protein at pH ≈ 7 (Lys/Arg protonated,
 * Asp/Glu deprotonated, His neutral Nε2–H). `countFree` gives the count for the neutral,
 * textbook free amino acid when it differs.
 */

export type BondOrder = 1 | 2;
export type HGeometry = "sp3" | "sp2";

export interface HydrogenSpec {
  atom: string;
  count: number;
  countFree?: number;
  geometry: HGeometry;
}

export interface ResidueTemplate {
  /** Side-chain bonds (backbone N–CA, CA–C, C=O and CA–CB are added automatically) */
  bonds: [string, string, BondOrder][];
  /** Side-chain hydrogens (backbone N–H and Cα–H are handled separately) */
  hydrogens: HydrogenSpec[];
}

const sp3 = (atom: string, count: number, countFree?: number): HydrogenSpec => ({ atom, count, countFree, geometry: "sp3" });
const sp2 = (atom: string, count: number, countFree?: number): HydrogenSpec => ({ atom, count, countFree, geometry: "sp2" });

const AROMATIC_6 = (): [string, string, BondOrder][] => [
  ["CB", "CG", 1],
  ["CG", "CD1", 2],
  ["CD1", "CE1", 1],
  ["CE1", "CZ", 2],
  ["CZ", "CE2", 1],
  ["CE2", "CD2", 2],
  ["CD2", "CG", 1],
];

export const RESIDUE_TEMPLATES: Record<string, ResidueTemplate> = {
  GLY: { bonds: [], hydrogens: [] },
  ALA: { bonds: [], hydrogens: [sp3("CB", 3)] },
  VAL: {
    bonds: [["CB", "CG1", 1], ["CB", "CG2", 1]],
    hydrogens: [sp3("CB", 1), sp3("CG1", 3), sp3("CG2", 3)],
  },
  LEU: {
    bonds: [["CB", "CG", 1], ["CG", "CD1", 1], ["CG", "CD2", 1]],
    hydrogens: [sp3("CB", 2), sp3("CG", 1), sp3("CD1", 3), sp3("CD2", 3)],
  },
  ILE: {
    bonds: [["CB", "CG1", 1], ["CB", "CG2", 1], ["CG1", "CD1", 1]],
    hydrogens: [sp3("CB", 1), sp3("CG1", 2), sp3("CG2", 3), sp3("CD1", 3)],
  },
  MET: {
    bonds: [["CB", "CG", 1], ["CG", "SD", 1], ["SD", "CE", 1]],
    hydrogens: [sp3("CB", 2), sp3("CG", 2), sp3("CE", 3)],
  },
  PHE: {
    bonds: AROMATIC_6(),
    hydrogens: [sp3("CB", 2), sp2("CD1", 1), sp2("CD2", 1), sp2("CE1", 1), sp2("CE2", 1), sp2("CZ", 1)],
  },
  TYR: {
    bonds: [...AROMATIC_6(), ["CZ", "OH", 1]],
    hydrogens: [sp3("CB", 2), sp2("CD1", 1), sp2("CD2", 1), sp2("CE1", 1), sp2("CE2", 1), sp2("OH", 1)],
  },
  TRP: {
    bonds: [
      ["CB", "CG", 1],
      ["CG", "CD1", 2],
      ["CG", "CD2", 1],
      ["CD1", "NE1", 1],
      ["NE1", "CE2", 1],
      ["CE2", "CD2", 2],
      ["CE2", "CZ2", 1],
      ["CZ2", "CH2", 2],
      ["CH2", "CZ3", 1],
      ["CZ3", "CE3", 2],
      ["CE3", "CD2", 1],
    ],
    hydrogens: [sp3("CB", 2), sp2("CD1", 1), sp2("NE1", 1), sp2("CE3", 1), sp2("CZ2", 1), sp2("CZ3", 1), sp2("CH2", 1)],
  },
  PRO: {
    bonds: [["CB", "CG", 1], ["CG", "CD", 1], ["CD", "N", 1]],
    hydrogens: [sp3("CB", 2), sp3("CG", 2), sp3("CD", 2)],
  },
  SER: { bonds: [["CB", "OG", 1]], hydrogens: [sp3("CB", 2), sp3("OG", 1)] },
  THR: {
    bonds: [["CB", "OG1", 1], ["CB", "CG2", 1]],
    hydrogens: [sp3("CB", 1), sp3("OG1", 1), sp3("CG2", 3)],
  },
  CYS: { bonds: [["CB", "SG", 1]], hydrogens: [sp3("CB", 2), sp3("SG", 1)] },
  ASN: {
    bonds: [["CB", "CG", 1], ["CG", "OD1", 2], ["CG", "ND2", 1]],
    hydrogens: [sp3("CB", 2), sp2("ND2", 2)],
  },
  GLN: {
    bonds: [["CB", "CG", 1], ["CG", "CD", 1], ["CD", "OE1", 2], ["CD", "NE2", 1]],
    hydrogens: [sp3("CB", 2), sp3("CG", 2), sp2("NE2", 2)],
  },
  ASP: {
    bonds: [["CB", "CG", 1], ["CG", "OD1", 2], ["CG", "OD2", 1]],
    hydrogens: [sp3("CB", 2), sp2("OD2", 0, 1)],
  },
  GLU: {
    bonds: [["CB", "CG", 1], ["CG", "CD", 1], ["CD", "OE1", 2], ["CD", "OE2", 1]],
    hydrogens: [sp3("CB", 2), sp3("CG", 2), sp2("OE2", 0, 1)],
  },
  LYS: {
    bonds: [["CB", "CG", 1], ["CG", "CD", 1], ["CD", "CE", 1], ["CE", "NZ", 1]],
    hydrogens: [sp3("CB", 2), sp3("CG", 2), sp3("CD", 2), sp3("CE", 2), sp3("NZ", 3, 2)],
  },
  ARG: {
    bonds: [["CB", "CG", 1], ["CG", "CD", 1], ["CD", "NE", 1], ["NE", "CZ", 1], ["CZ", "NH1", 1], ["CZ", "NH2", 2]],
    hydrogens: [sp3("CB", 2), sp3("CG", 2), sp3("CD", 2), sp2("NE", 1), sp2("NH1", 2), sp2("NH2", 2, 1)],
  },
  HIS: {
    bonds: [["CB", "CG", 1], ["CG", "ND1", 1], ["CG", "CD2", 2], ["ND1", "CE1", 2], ["CE1", "NE2", 1], ["NE2", "CD2", 1]],
    hydrogens: [sp3("CB", 2), sp2("CD2", 1), sp2("CE1", 1), sp2("NE2", 1)],
  },
};

/** Formal charge of the side chain in the protein (pH ≈ 7). */
export const SIDE_CHAIN_CHARGE: Record<string, number> = { LYS: 1, ARG: 1, ASP: -1, GLU: -1 };

const GREEK: Record<string, string> = { A: "α", B: "β", G: "γ", D: "δ", E: "ε", Z: "ζ", H: "η" };

/** "CA" → "Cα", "CG1" → "Cγ1", "HB2" → "Hβ2"; terminal OXT/HXT keep their PDB names */
export function displayAtomName(name: string): string {
  if (name === "OXT" || name === "HXT") return name;
  if (name.length < 2) return name;
  const first = name[0];
  const greek = GREEK[name[1]];
  if (!greek) return name;
  return `${first}${greek}${name.slice(2)}`;
}
