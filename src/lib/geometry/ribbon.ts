import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, Vector3 } from "three";
import type { ProteinModel, Residue, SSType } from "@/lib/structure/protein";

/**
 * Cartoon ("ribbon") geometry for a protein chain, computed from real backbone atoms:
 *  - a centripetal Catmull–Rom spline passes through the Cα atoms (β-strands lightly smoothed),
 *  - the ribbon's width direction follows the peptide C=O vectors (so helices coil and sheets lie flat),
 *  - helices are flat ribbons, strands are flat arrows (pointing N→C), loops are round tubes.
 */

export interface RibbonGeometry {
  geometry: BufferGeometry;
  /** Residue index owning each vertex */
  vertexResidue: Uint16Array;
  /** Residue index owning each triangle (for picking) */
  faceResidue: Uint16Array;
}

interface Profile {
  w: number;
  h: number;
  p: number;
}

const PROFILES: Record<SSType, Profile> = {
  helix: { w: 2.7, h: 0.5, p: 4.5 },
  helix310: { w: 1.9, h: 0.5, p: 4.5 },
  strand: { w: 2.3, h: 0.55, p: 5 },
  coil: { w: 0.62, h: 0.62, p: 2 },
};
const ARROW_BASE = 3.5;
const ARROW_TIP = 0.55;
const SUBDIV = 10;
const RADIAL = 16;

const smooth = (t: number) => t * t * (3 - 2 * t);

export function buildRibbon(protein: ProteinModel): RibbonGeometry {
  const positions: number[] = [];
  const vRes: number[] = [];
  const indices: number[] = [];

  // Build each continuous stretch separately so missing residues are never bridged
  const all = protein.residues;
  let start = 0;
  for (let i = 1; i <= all.length; i++) {
    if (i === all.length || all[i].breakBefore) {
      if (i - start >= 2) buildRun(all.slice(start, i), start, positions, vRes, indices);
      start = i;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(positions.length), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const faceResidue = new Uint16Array(indices.length / 3);
  for (let f = 0; f < faceResidue.length; f++) faceResidue[f] = vRes[indices[f * 3]];

  return { geometry, vertexResidue: Uint16Array.from(vRes), faceResidue };
}

/** Appends the ribbon of one continuous run of residues (`offset` = index of its first residue). */
function buildRun(res: Residue[], offset: number, positions: number[], vRes: number[], indices: number[]) {
  const n = res.length;

  // Control points (strand interiors smoothed to remove the pleat zig-zag)
  const ctrl = res.map((r, i) => {
    const ca = r.atoms.CA.clone();
    if (r.ss === "strand" && i > 0 && i < n - 1 && res[i - 1].ss === "strand" && res[i + 1].ss === "strand") {
      return ca.multiplyScalar(0.5).addScaledVector(res[i - 1].atoms.CA, 0.25).addScaledVector(res[i + 1].atoms.CA, 0.25);
    }
    return ca;
  });

  // Guide vectors from the carbonyl groups, flipped for continuity
  const guides: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const r = res[i];
    let d: Vector3;
    if (r.atoms.O && r.atoms.C) d = new Vector3().subVectors(r.atoms.O, r.atoms.C).normalize();
    else d = guides[i - 1]?.clone() ?? new Vector3(0, 1, 0);
    if (i > 0 && d.dot(guides[i - 1]) < 0) d.negate();
    guides.push(d);
  }

  // Strand arrow ranges: arrowhead spans the last residue of each strand
  const arrowEnd = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (res[i].ss === "strand" && (i === n - 1 || res[i + 1].ss !== "strand")) arrowEnd.add(i);
  }

  const curve = new CatmullRomCurve3(ctrl, false, "centripetal", 0.5);
  const samples = (n - 1) * SUBDIV + 1;
  const pts: Vector3[] = [];
  for (let k = 0; k < samples; k++) pts.push(curve.getPoint(k / (samples - 1)));

  const profileAt = (rf: number): Profile & { arrowStep?: boolean } => {
    const i = Math.min(n - 1, Math.floor(rf));
    const u = rf - i;
    // Arrowhead: from residue (end-1) to residue end
    if (i + 1 < n && arrowEnd.has(i + 1) && res[i].ss === "strand") {
      return { w: ARROW_BASE + (ARROW_TIP - ARROW_BASE) * u, h: PROFILES.strand.h, p: PROFILES.strand.p };
    }
    if (arrowEnd.has(i)) {
      // after the tip, blend into the following coil/helix
      const next = res[i + 1] ? PROFILES[res[i + 1].ss] : PROFILES.coil;
      const t = smooth(u);
      return { w: ARROW_TIP + (next.w - ARROW_TIP) * t, h: PROFILES.strand.h + (next.h - PROFILES.strand.h) * t, p: PROFILES.strand.p + (next.p - PROFILES.strand.p) * t };
    }
    const a = PROFILES[res[i].ss];
    const b = PROFILES[res[Math.min(n - 1, i + 1)].ss];
    const t = smooth(u);
    return { w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t, p: a.p + (b.p - a.p) * t };
  };

  const ring = (center: Vector3, W: Vector3, H: Vector3, prof: Profile, owner: number) => {
    const start = positions.length / 3;
    for (let j = 0; j < RADIAL; j++) {
      const th = (j / RADIAL) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const e = 2 / prof.p;
      const x = (prof.w / 2) * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = (prof.h / 2) * Math.sign(s) * Math.pow(Math.abs(s), e);
      const v = center.clone().addScaledVector(W, x).addScaledVector(H, y);
      positions.push(v.x, v.y, v.z);
      vRes.push(offset + owner);
    }
    return start;
  };
  const connect = (a: number, b: number) => {
    for (let j = 0; j < RADIAL; j++) {
      const j2 = (j + 1) % RADIAL;
      // wound so that face normals point outward (ring runs counter-clockwise in the W–H plane)
      indices.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  };
  const cap = (ringStart: number, center: Vector3, owner: number, flip: boolean) => {
    const c = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    vRes.push(offset + owner);
    const copy = positions.length / 3;
    for (let j = 0; j < RADIAL; j++) {
      positions.push(positions[(ringStart + j) * 3], positions[(ringStart + j) * 3 + 1], positions[(ringStart + j) * 3 + 2]);
      vRes.push(offset + owner);
    }
    for (let j = 0; j < RADIAL; j++) {
      const j2 = (j + 1) % RADIAL;
      if (flip) indices.push(c, copy + j2, copy + j);
      else indices.push(c, copy + j, copy + j2);
    }
  };

  let prevRing = -1;
  let prevW: Vector3 | null = null;
  let firstRing = -1;
  for (let k = 0; k < samples; k++) {
    const rf = k / SUBDIV;
    const i = Math.min(n - 1, Math.floor(rf));
    const u = rf - i;
    const owner = Math.min(n - 1, Math.round(rf));
    const T = new Vector3().subVectors(pts[Math.min(samples - 1, k + 1)], pts[Math.max(0, k - 1)]).normalize();
    const g = guides[i].clone().lerp(guides[Math.min(n - 1, i + 1)], u);
    let W = g.addScaledVector(T, -g.dot(T));
    if (W.lengthSq() < 1e-8) W = prevW ? prevW.clone() : new Vector3(0, 1, 0);
    W.normalize();
    if (prevW && W.dot(prevW) < 0) W.negate();
    prevW = W.clone();
    const H = new Vector3().crossVectors(T, W).normalize();

    const isArrowBase = u === 0 && i + 1 < n && arrowEnd.has(i + 1) && res[i].ss === "strand" && k > 0;
    if (isArrowBase) {
      // Step from the strand body out to the wide arrowhead (separate vertices keep shading crisp)
      const body = { w: PROFILES.strand.w, h: PROFILES.strand.h, p: PROFILES.strand.p };
      const head = profileAt(rf);
      const a = ring(pts[k], W, H, body, owner);
      if (prevRing >= 0) connect(prevRing, a);
      const a2 = ring(pts[k], W, H, body, owner);
      const b2 = ring(pts[k], W, H, head, owner);
      connect(a2, b2);
      prevRing = ring(pts[k], W, H, head, owner);
      continue;
    }
    const r = ring(pts[k], W, H, profileAt(rf), owner);
    if (prevRing >= 0) connect(prevRing, r);
    else firstRing = r;
    prevRing = r;
  }
  cap(firstRing, pts[0], 0, true);
  cap(prevRing, pts[samples - 1], n - 1, false);
}

/** Writes per-residue colours into the ribbon's vertex colour attribute. */
export function paintRibbon(r: RibbonGeometry, residueColors: Color[]) {
  const attr = r.geometry.getAttribute("color") as BufferAttribute;
  const arr = attr.array as Float32Array;
  for (let v = 0; v < r.vertexResidue.length; v++) {
    const c = residueColors[r.vertexResidue[v]];
    arr[v * 3] = c.r;
    arr[v * 3 + 1] = c.g;
    arr[v * 3 + 2] = c.b;
  }
  attr.needsUpdate = true;
}
