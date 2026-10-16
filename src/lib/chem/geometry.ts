import { Vector3 } from "three";
import type { HGeometry } from "./residueTemplates";

const TETRAHEDRAL = (109.47 * Math.PI) / 180;
const HALF_TETRA = (54.735 * Math.PI) / 180;
const TRIGONAL = (120 * Math.PI) / 180;

function anyPerpendicular(a: Vector3): Vector3 {
  const t = Math.abs(a.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  return new Vector3().crossVectors(a, t).normalize();
}

/**
 * Places `count` hydrogens on `center` using ideal VSEPR geometry.
 *
 * @param neighbors heavy-atom neighbours of the centre atom
 * @param reference for single-neighbour centres: an atom bonded to that neighbour,
 *                  used to fix the rotation (staggered/anti for sp3, syn for sp2)
 */
export function placeHydrogens(
  center: Vector3,
  neighbors: Vector3[],
  count: number,
  geometry: HGeometry,
  bondLength: number,
  reference?: Vector3,
): Vector3[] {
  if (count <= 0 || neighbors.length === 0) return [];
  const units = neighbors.map((n) => new Vector3().subVectors(n, center).normalize());
  const out: Vector3[] = [];
  const add = (dir: Vector3) => out.push(center.clone().addScaledVector(dir.normalize(), bondLength));

  if (units.length >= 3) {
    const sum = units.reduce((acc, u) => acc.add(u), new Vector3());
    add(sum.negate());
    return out;
  }

  if (units.length === 2) {
    const [u1, u2] = units;
    const bis = new Vector3().addVectors(u1, u2).negate().normalize();
    if (count === 1) {
      add(bis);
      return out;
    }
    const n = new Vector3().crossVectors(u1, u2).normalize();
    add(bis.clone().multiplyScalar(Math.cos(HALF_TETRA)).addScaledVector(n, Math.sin(HALF_TETRA)));
    add(bis.clone().multiplyScalar(Math.cos(HALF_TETRA)).addScaledVector(n, -Math.sin(HALF_TETRA)));
    return out.slice(0, count);
  }

  // Single heavy neighbour
  const a = units[0];
  let p: Vector3;
  if (reference) {
    const r = new Vector3().subVectors(reference, neighbors[0]);
    p = r.addScaledVector(a, -r.dot(a));
    p = p.lengthSq() < 1e-6 ? anyPerpendicular(a) : p.normalize();
  } else {
    p = anyPerpendicular(a);
  }

  if (geometry === "sp2") {
    // In the plane of (reference, neighbour, centre); first H syn (cis) to the reference
    const signs = [1, -1];
    for (let i = 0; i < Math.min(count, 2); i++) {
      add(a.clone().multiplyScalar(Math.cos(TRIGONAL)).addScaledVector(p, signs[i] * Math.sin(TRIGONAL)));
    }
    return out;
  }

  // sp3: staggered, first hydrogen anti to the reference atom
  const q = new Vector3().crossVectors(a, p).normalize();
  for (let k = 0; k < Math.min(count, 3); k++) {
    const phi = Math.PI + (k * 2 * Math.PI) / 3;
    const radial = p.clone().multiplyScalar(Math.cos(phi)).addScaledVector(q, Math.sin(phi));
    add(a.clone().multiplyScalar(Math.cos(TETRAHEDRAL)).addScaledVector(radial, Math.sin(TETRAHEDRAL)));
  }
  return out;
}

/** Ideal Cβ position from backbone N, Cα, C (standard tetrahedral construction). */
export function idealCB(N: Vector3, CA: Vector3, C: Vector3): Vector3 {
  const b = new Vector3().subVectors(CA, N);
  const c = new Vector3().subVectors(C, CA);
  const a = new Vector3().crossVectors(b, c);
  return new Vector3()
    .addScaledVector(a, -0.58273431)
    .addScaledVector(b, 0.56802827)
    .addScaledVector(c, -0.54067466)
    .add(CA);
}
