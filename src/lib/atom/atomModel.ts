import { Vector3 } from "three";
import { ELEMENTS, type ElementSymbol } from "@/lib/chem/elements";

/** Small deterministic PRNG (mulberry32) so models look identical on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Nucleon {
  kind: "proton" | "neutron";
  position: Vector3;
}

export const NUCLEON_RADIUS = 0.42;

/**
 * Packs Z protons and N neutrons into a compact ball by simple relaxation.
 * (A teaching model: real nucleons are not hard spheres with fixed positions.)
 */
export function packNucleus(Z: number, N: number, seed = 7): Nucleon[] {
  const A = Z + N;
  const rand = rng(seed + A * 31);
  const r0 = NUCLEON_RADIUS * 2;
  const pts: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const R = NUCLEON_RADIUS * 1.1 * Math.cbrt(A);
  for (let i = 0; i < A; i++) {
    const y = A === 1 ? 0 : 1 - (i / (A - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i;
    const shell = R * Math.cbrt((i + 0.5) / A);
    pts.push(new Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(shell));
  }
  for (let it = 0; it < 160; it++) {
    for (let i = 0; i < A; i++) {
      for (let j = i + 1; j < A; j++) {
        const d = new Vector3().subVectors(pts[j], pts[i]);
        const len = d.length() || 1e-3;
        const overlap = r0 * 0.98 - len;
        if (overlap > 0) {
          d.multiplyScalar((overlap / len) * 0.5);
          pts[i].sub(d);
          pts[j].add(d);
        }
      }
      pts[i].multiplyScalar(0.985); // gentle pull toward the centre
    }
  }
  const centroid = pts.reduce((acc, p) => acc.add(p), new Vector3()).divideScalar(A);
  pts.forEach((p) => p.sub(centroid));

  // Mix protons and neutrons evenly
  const kinds: Nucleon["kind"][] = [...Array(Z).fill("proton"), ...Array(N).fill("neutron")];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return pts.map((position, i) => ({ kind: kinds[i], position }));
}

/** Bohr-model shell radii (schematic scene units). */
export function shellRadius(n: number): number {
  return 2.5 + (n - 1) * 1.55;
}

export interface CloudSample {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
  /** Most-probable radius of the outermost orbital, in scene units */
  outerRadius: number;
}

const ORBITAL_COLORS: Record<string, [number, number, number]> = {
  s1: [0.12, 0.27, 0.72],
  s2: [0.18, 0.45, 0.9],
  p2: [0.42, 0.42, 0.95],
  s3: [0.2, 0.6, 0.85],
  p3: [0.55, 0.45, 0.92],
};

/**
 * Samples electron positions from Slater-type orbital densities
 * P(r) ∝ r^(2n) e^(−2ζr) (a Gamma distribution) with s (uniform) or p (cos²θ) angular parts.
 * Electrons fill p orbitals following Hund's rule. Radial nodes are omitted (Slater approximation).
 */
export function sampleElectronCloud(symbol: ElementSymbol, perElectron = 900, seed = 11): CloudSample {
  const el = ELEMENTS[symbol];
  const rand = rng(seed + el.Z);
  const outer = el.orbitals[el.orbitals.length - 1];
  const outerPeak = outer.n / outer.zeta; // bohr
  const unitsPerBohr = 4.6 / outerPeak;

  const samples: { p: Vector3; c: [number, number, number] }[] = [];
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

  const randomDir = () => {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return new Vector3(s * Math.cos(t), u, s * Math.sin(t));
  };
  const gammaRadius = (n: number, zeta: number) => {
    // Gamma(shape = 2n + 1, rate = 2ζ) as a sum of exponentials
    let sum = 0;
    for (let k = 0; k < 2 * n + 1; k++) sum += -Math.log(1 - rand() + 1e-12);
    return sum / (2 * zeta);
  };

  for (const orb of el.orbitals) {
    const key = `${orb.l === 0 ? "s" : "p"}${orb.n}`;
    const color = ORBITAL_COLORS[key] ?? ORBITAL_COLORS.s2;
    if (orb.l === 0) {
      for (let i = 0; i < orb.electrons * perElectron; i++) {
        const r = gammaRadius(orb.n, orb.zeta) * unitsPerBohr;
        samples.push({ p: randomDir().multiplyScalar(r), c: color });
      }
    } else {
      // Hund's rule: singly occupy px, py, pz before pairing
      const occupancy = [0, 0, 0];
      for (let e = 0; e < orb.electrons; e++) occupancy[e % 3]++;
      occupancy.forEach((occ, ax) => {
        for (let i = 0; i < occ * perElectron; i++) {
          let dir = randomDir();
          let guard = 0;
          while (rand() > dir.dot(axes[ax]) ** 2 && guard++ < 50) dir = randomDir();
          const r = gammaRadius(orb.n, orb.zeta) * unitsPerBohr;
          samples.push({ p: dir.multiplyScalar(r), c: color });
        }
      });
    }
  }

  const positions = new Float32Array(samples.length * 3);
  const colors = new Float32Array(samples.length * 3);
  samples.forEach((s, i) => {
    positions.set([s.p.x, s.p.y, s.p.z], i * 3);
    colors.set(s.c, i * 3);
  });
  return { positions, colors, count: samples.length, outerRadius: outerPeak * unitsPerBohr };
}
