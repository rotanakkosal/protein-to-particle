import { Vector3 } from "three";
import { formCoefficients } from "./diffraction";

/*
 * Calculated electron density and its "chicken-wire" contour, the way crystallographers draw maps.
 *
 * Each atom's density is the Fourier transform of its four-Gaussian form factor damped by its
 * B-factor: ρ(r) = Σᵢ aᵢ·(4π/(bᵢ+B))^1.5·exp(−4π²r²/(bᵢ+B)) + c·(4π/B)^1.5·exp(−4π²r²/B), in e/Å³.
 * Extra blur (added to every B) mimics a lower-resolution, less accurate map.
 */

export interface DensityAtom {
  position: Vector3;
  /** Atomic number */
  z: number;
  /** B-factor (Å²) */
  b: number;
}

export interface DensityGrid {
  origin: Vector3;
  spacing: number;
  n: [number, number, number];
  values: Float32Array;
}

const FOUR_PI = 4 * Math.PI;
const FOUR_PI2 = 4 * Math.PI * Math.PI;

export function densityGrid(atoms: DensityAtom[], spacing: number, margin: number, blur = 0): DensityGrid {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const a of atoms) {
    min.min(a.position);
    max.max(a.position);
  }
  const origin = min.clone().subScalar(margin);
  const n = [0, 1, 2].map((k) => Math.ceil((max.getComponent(k) - min.getComponent(k) + 2 * margin) / spacing) + 1) as [number, number, number];
  const values = new Float32Array(n[0] * n[1] * n[2]);

  for (const atom of atoms) {
    const c = formCoefficients(atom.z);
    const B = Math.max(1, atom.b + blur);
    // Gaussian terms: amplitude and exponent; the constant term c is a point smeared by B alone
    const widths = [c[1] + B, c[3] + B, c[5] + B, c[7] + B, B];
    const amps = [c[0], c[2], c[4], c[6], c[8]].map((a, i) => a * (FOUR_PI / widths[i]) ** 1.5);
    const ks = widths.map((w) => FOUR_PI2 / w);
    // out to where the widest term has fallen below 1% of its peak
    const cutoff = Math.min(4.5, Math.sqrt((Math.log(100) * Math.max(...widths)) / FOUR_PI2));
    const lo = [0, 1, 2].map((k) => Math.max(0, Math.floor((atom.position.getComponent(k) - cutoff - origin.getComponent(k)) / spacing)));
    const hi = [0, 1, 2].map((k) => Math.min(n[k] - 1, Math.ceil((atom.position.getComponent(k) + cutoff - origin.getComponent(k)) / spacing)));
    for (let z = lo[2]; z <= hi[2]; z++) {
      const dz = origin.z + z * spacing - atom.position.z;
      for (let y = lo[1]; y <= hi[1]; y++) {
        const dy = origin.y + y * spacing - atom.position.y;
        for (let x = lo[0]; x <= hi[0]; x++) {
          const dx = origin.x + x * spacing - atom.position.x;
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 > cutoff * cutoff) continue;
          let rho = 0;
          for (let t = 0; t < 5; t++) rho += amps[t] * Math.exp(-ks[t] * r2);
          values[x + n[0] * (y + n[1] * z)] += rho;
        }
      }
    }
  }
  return { origin, spacing, n, values };
}

/** The contour level of `grid` that encloses the same volume as `reference` does at `level`. */
export function matchedLevel(reference: DensityGrid, level: number, grid: DensityGrid) {
  let inside = 0;
  for (const v of reference.values) if (v > level) inside++;
  const fraction = (inside * reference.spacing ** 3) / (grid.values.length * grid.spacing ** 3);
  const sorted = Float32Array.from(grid.values).sort();
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - fraction))))];
}

// marching squares: for each case (corner bits c0 = 1, c1 = 2, c2 = 4, c3 = 8), the cell edges the
// contour crosses, in pairs (edges: 0 = c0–c1, 1 = c1–c2, 2 = c3–c2, 3 = c0–c3)
const CASES: number[][] = [[], [3, 0], [0, 1], [3, 1], [1, 2], [], [0, 2], [3, 2], [2, 3], [0, 2], [], [1, 2], [1, 3], [0, 1], [3, 0], []];

/**
 * Contour lines of the grid at `level` on every grid plane of all three orientations: the mesh
 * ("chicken wire") used to draw electron density. Returns line-segment vertex positions.
 */
export function chickenWire(grid: DensityGrid, level: number): Float32Array {
  const { n, values, origin, spacing } = grid;
  const out: number[] = [];
  const at = (p: number[]) => values[p[0] + n[0] * (p[1] + n[1] * p[2])];
  const p = [0, 0, 0];
  const corner = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const EDGE = [
    [0, 1],
    [1, 2],
    [3, 2],
    [0, 3],
  ];
  // plane families: [normal axis, u axis, v axis]
  for (const [na, ua, va] of [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
  ]) {
    for (let s = 0; s < n[na]; s++) {
      for (let u = 0; u < n[ua] - 1; u++) {
        for (let v = 0; v < n[va] - 1; v++) {
          const vals = corner.map(([du, dv]) => {
            p[na] = s;
            p[ua] = u + du;
            p[va] = v + dv;
            return at(p);
          });
          let code = 0;
          vals.forEach((x, i) => {
            if (x > level) code |= 1 << i;
          });
          if (code === 0 || code === 15) continue;
          let pairs = CASES[code];
          if (code === 5 || code === 10) {
            // saddle: the cell centre decides which pair of opposite corners is cut off
            const centreInside = (vals[0] + vals[1] + vals[2] + vals[3]) / 4 > level;
            const cutsC1andC3 = code === 5 ? centreInside : !centreInside;
            pairs = cutsC1andC3 ? [0, 1, 2, 3] : [3, 0, 1, 2];
          }
          for (const e of pairs) {
            const [a, b] = EDGE[e];
            const t = (level - vals[a]) / (vals[b] - vals[a]);
            const pu = u + corner[a][0] + (corner[b][0] - corner[a][0]) * t;
            const pv = v + corner[a][1] + (corner[b][1] - corner[a][1]) * t;
            const q = [0, 0, 0];
            q[na] = s;
            q[ua] = pu;
            q[va] = pv;
            out.push(origin.x + q[0] * spacing, origin.y + q[1] * spacing, origin.z + q[2] * spacing);
          }
        }
      }
    }
  }
  return Float32Array.from(out);
}
