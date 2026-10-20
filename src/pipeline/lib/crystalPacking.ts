import { BoxGeometry, Matrix4, Vector3 } from "three";
import type { CrystalInfo, SymOp } from "@/lib/pdb/experiment";

export interface PackedMolecule {
  /** Asymmetric-unit chain ("A", "B") */
  chain: string;
  /** Index of the symmetry operator that made this copy */
  op: number;
  /** Lattice translation applied so the copy's centre falls inside the unit cell */
  shift: [number, number, number];
  /** Cα trace in Cartesian Å */
  trace: Vector3[];
}

const mul = (m: number[], x: number, y: number, z: number): [number, number, number] => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
];

/** Cartesian position (Å) of fractional coordinates. */
export const fracToCart = (c: CrystalInfo, f: [number, number, number]) => new Vector3(...mul(c.toCart, ...f));

/**
 * Fills one unit cell with every symmetry copy of every chain of the asymmetric unit: each copy
 * is moved by whole lattice vectors so that its centre lies inside [0, 1)³. `cell` offsets the
 * result by a lattice translation (to draw neighbouring cells).
 */
export function packUnitCell(c: CrystalInfo, cell: [number, number, number] = [0, 0, 0]): PackedMolecule[] {
  const { asu } = c;
  const out: PackedMolecule[] = [];
  asu.chains.forEach((chain, ci) => {
    const frac: [number, number, number][] = [];
    for (let i = 0; i < asu.count; i++) if (asu.isCA[i] && asu.chain[i] === ci) frac.push(mul(c.toFrac, asu.xyz[i * 3], asu.xyz[i * 3 + 1], asu.xyz[i * 3 + 2]));
    if (!frac.length) return;
    c.symops.forEach((op, oi) => {
      const moved = frac.map((f) => {
        const r = mul(op.r, ...f);
        return [r[0] + op.t[0], r[1] + op.t[1], r[2] + op.t[2]] as [number, number, number];
      });
      const centre = [0, 1, 2].map((k) => moved.reduce((s, p) => s + p[k], 0) / moved.length);
      const shift = centre.map((x, k) => -Math.floor(x) + cell[k]) as [number, number, number];
      out.push({ chain, op: oi, shift, trace: moved.map((p) => fracToCart(c, [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]])) });
    });
  });
  return out;
}

/** The twelve edges of the unit cell (offset by `cell`), as pairs of Cartesian points. */
export function cellEdges(c: CrystalInfo, cell: [number, number, number] = [0, 0, 0]): [Vector3, Vector3][] {
  const corner = (i: number, j: number, k: number) => fracToCart(c, [i + cell[0], j + cell[1], k + cell[2]]);
  const edges: [Vector3, Vector3][] = [];
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [1, 5],
    [2, 3],
    [2, 6],
    [3, 7],
    [4, 5],
    [4, 6],
    [5, 7],
    [6, 7],
  ])
    edges.push([corner(a & 1, (a >> 1) & 1, (a >> 2) & 1), corner(b & 1, (b >> 1) & 1, (b >> 2) & 1)]);
  return edges;
}

/** A translation as a short fraction: 0.5 → "1/2", 1.5 → "3/2", 1 → "1" */
function fraction(t: number) {
  for (const den of [1, 2, 3, 4, 6]) {
    const num = Math.round(Math.abs(t) * den);
    if (Math.abs(Math.abs(t) * den - num) < 1e-4) return den === 1 ? `${num}` : `${num}/${den}`;
  }
  return Math.abs(t).toFixed(3);
}

/** A symmetry operator plus a lattice shift, written the crystallographic way: "−x+1/2, y+1/2, −z". */
export function formatSymop(op: SymOp, shift: [number, number, number] = [0, 0, 0]) {
  return [0, 1, 2]
    .map((row) => {
      let s = "";
      for (let col = 0; col < 3; col++) {
        const v = op.r[row * 3 + col];
        if (v) s += `${v < 0 ? "−" : s ? "+" : ""}${"xyz"[col]}`;
      }
      const t = op.t[row] + shift[row];
      if (Math.abs(t) > 1e-6) s += `${t < 0 ? "−" : "+"}${fraction(t)}`;
      return s;
    })
    .join(", ");
}

/**
 * A crystal drawn as a parallelepiped along the cell axes: its proportions are schematic, but its
 * angles are those of the real unit cell (β = 105° gives the slanted faces of a C2 crystal).
 */
export function crystalGeometry(c: CrystalInfo, lengths: [number, number, number]) {
  const g = new BoxGeometry(1, 1, 1);
  const axes = [0, 1, 2].map((i) => new Vector3(c.toCart[i], c.toCart[3 + i], c.toCart[6 + i]).normalize().multiplyScalar(lengths[i]));
  g.applyMatrix4(new Matrix4().makeBasis(axes[0], axes[1], axes[2]));
  return g;
}
