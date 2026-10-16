import { Vector3 } from "three";
import type { ProteinModel } from "./protein";

/**
 * Bead-on-a-string layouts for the Level II polypeptide view.
 *  - folded:   one bead per residue at its real Cα position; the peptide-bond marker sits at the
 *              real midpoint of the C(i)–N(i+1) bond.
 *  - unfolded: the same chain laid out as a serpentine so the linear N→C order is visible.
 */
export interface ChainLayout {
  folded: Vector3[];
  foldedPeptide: Vector3[];
  unfolded: Vector3[];
  unfoldedPeptide: Vector3[];
  unfoldedRadius: number;
  /** gapAfter[i] is true when residues i and i+1 are not joined (missing residues in the crystal) */
  gapAfter: boolean[];
}

export const CA_SPACING = 3.8; // Å, trans peptide Cα–Cα distance

export function buildChainLayout(protein: ProteinModel): ChainLayout {
  const res = protein.residues;
  // Roughly square serpentine: 13 per row for ubiquitin (76), ~19 for a 169-residue chain
  const perRow = Math.max(10, Math.round(Math.sqrt(res.length * 2.2)));
  const gapAfter = res.slice(0, -1).map((_, i) => res[i + 1].breakBefore);
  const folded = res.map((r) => r.atoms.CA.clone());
  const foldedPeptide: Vector3[] = [];
  for (let i = 0; i < res.length - 1; i++) {
    const c = res[i].atoms.C;
    const n = res[i + 1].atoms.N;
    foldedPeptide.push(c && n && !gapAfter[i] ? c.clone().add(n).multiplyScalar(0.5) : folded[i].clone().lerp(folded[i + 1], 0.5));
  }

  const rows = Math.ceil(res.length / perRow);
  const rowGap = 8.5;
  const unfolded: Vector3[] = [];
  for (let i = 0; i < res.length; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const forward = row % 2 === 0;
    const x = (forward ? col : perRow - 1 - col) * CA_SPACING - ((perRow - 1) * CA_SPACING) / 2;
    const y = ((rows - 1) / 2 - row) * rowGap;
    // the gentle zig-zag of an extended β-like chain
    const z = (i % 2 === 0 ? 1 : -1) * 0.9;
    unfolded.push(new Vector3(x, y, z));
  }
  const unfoldedPeptide: Vector3[] = [];
  for (let i = 0; i < res.length - 1; i++) unfoldedPeptide.push(unfolded[i].clone().lerp(unfolded[i + 1], 0.5));

  let unfoldedRadius = 0;
  for (const p of unfolded) unfoldedRadius = Math.max(unfoldedRadius, p.length());

  return { folded, foldedPeptide, unfolded, unfoldedPeptide, unfoldedRadius: unfoldedRadius + 2, gapAfter };
}
