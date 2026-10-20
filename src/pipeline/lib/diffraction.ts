import type { CrystalInfo } from "@/lib/pdb/experiment";

/*
 * A rotation-method diffraction experiment calculated from a deposited crystal structure.
 *
 * Every reflection hkl inside the resolution limit is enumerated from the real cell; the space
 * group's systematic absences are dropped; the crystal turns about the spindle and each
 * reciprocal-lattice point is recorded where it crosses the Ewald sphere. Intensities are
 * |F(hkl)|², with F summed over all atoms of the asymmetric unit and all symmetry operators,
 * using four-Gaussian X-ray form factors and each atom's B-factor. They are computed lazily and
 * cached per symmetry-unique reflection.
 *
 * Building the reflection list takes a few hundred milliseconds at high resolution, so it runs in
 * slices: call `work(ms)` once per frame until `ready`.
 *
 * Frames: the crystal frame is the Cartesian frame of the deposited coordinates. In the lab frame
 * the beam travels along +x, the spindle is +z and the detector is the plane x = distance.
 */

/** Cromer–Mann coefficients (International Tables C, 6.1.1.4): f = Σ aᵢ·exp(−bᵢ·(sinθ/λ)²) + c */
const FORM: Record<number, number[]> = {
  6: [2.31, 20.8439, 1.02, 10.2075, 1.5886, 0.5687, 0.865, 51.6512, 0.2156],
  7: [12.2126, 0.0057, 3.1322, 9.8933, 2.0125, 28.9975, 1.1663, 0.5826, -11.529],
  8: [3.0485, 13.2771, 2.2868, 5.7011, 1.5463, 0.3239, 0.867, 32.9089, 0.2508],
  12: [5.4204, 2.8275, 2.1735, 79.2611, 1.2269, 0.3808, 2.3073, 7.1937, 0.8584],
  15: [6.4345, 1.9067, 4.1791, 27.157, 1.78, 0.526, 1.4908, 68.1645, 1.1149],
  16: [6.9053, 1.4679, 5.2034, 22.2151, 1.4379, 0.2536, 1.5863, 56.172, 0.8669],
};
/** Form-factor coefficients by atomic number (other elements: carbon scaled by Z) */
export const formCoefficients = (z: number) => FORM[z] ?? FORM[6].map((v, i) => (i % 2 === 0 ? (v * z) / 6 : v));

/** f at (sinθ/λ)² = q */
const formFactor = (c: number[], q: number) => c[0] * Math.exp(-c[1] * q) + c[2] * Math.exp(-c[3] * q) + c[4] * Math.exp(-c[5] * q) + c[6] * Math.exp(-c[7] * q) + c[8];

const B_STEP = 0.25; // Å²: B-factors are binned so each reflection needs only a few hundred exp()
const TWO_PI = Math.PI * 2;
/** Crossing angles are grouped in bins of 0.05° of spindle rotation */
export const EVENT_BIN = (0.05 * Math.PI) / 180;
export const BIN_COUNT = Math.round(TWO_PI / EVENT_BIN);

export interface DiffractionOptions {
  /** High-resolution limit (Å) */
  dMin: number;
  /** X-ray wavelength (Å) */
  wavelength: number;
  /** Crystal-to-detector distance (mm) */
  distance: number;
  /** Half the detector's side (mm) */
  halfSize: number;
  /** Crystal orientation on the goniometer: crystal frame → lab frame at φ = 0, row-major 3×3 */
  orientation: number[];
}

export class Diffraction {
  readonly options: DiffractionOptions;
  /** 0…1 while building; the pattern can be used once `ready` */
  progress = 0;
  ready = false;
  /** Allowed reflections inside the limit, Friedel mates included */
  count = 0;
  hkl = new Int16Array(0);
  /** 1/d (Å⁻¹) */
  dInv = new Float32Array(0);
  /** Reflection → its symmetry-unique representative */
  unique = new Int32Array(0);
  uniqueCount = 0;
  /** Ewald-sphere crossings over a full turn, by angle bin: bin b holds events start[b] … start[b + 1] − 1 */
  events = { count: 0, start: new Uint32Array(BIN_COUNT + 1), reflection: new Int32Array(0), y: new Float32Array(0), z: new Float32Array(0) };
  /** Median |F|² of the 8 to 4 Å reflections, a reference for display brightness */
  reference = 1;

  private readonly crystal: CrystalInfo;
  private builder: Generator<number> | null;
  private intensity = new Float32Array(0);
  private uniqueHkl = new Int16Array(0);
  // per-atom structure-factor tables: cos/sin(2π·h·x) for h = 0…max (index h·atoms + j), per axis
  private tab: { cos: Float32Array; sin: Float32Array }[] = [];
  private element = new Uint8Array(0);
  private elements: number[][] = [];
  private bin = new Uint16Array(0);
  private bins = 0;
  /** Distinct rotation parts of the symmetry operators, each with its translations */
  private rotations: { r: number[]; t: [number, number, number][] }[] = [];
  private cursor = 0;
  private sweepStart = 0;
  private complete = false;

  constructor(crystal: CrystalInfo, options: DiffractionOptions) {
    this.crystal = crystal;
    this.options = options;
    this.builder = this.build();
  }

  /** Continues building for up to `budgetMs`; returns true once ready. */
  work(budgetMs: number) {
    if (this.ready || !this.builder) return this.ready;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      const r = this.builder.next();
      if (r.done) {
        this.builder = null;
        this.progress = 1;
        return (this.ready = true);
      }
      this.progress = r.value;
    }
    return false;
  }

  /** Angle bin of a spindle angle (radians, any turn) */
  binOf(phi: number) {
    const a = ((phi % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.min(BIN_COUNT - 1, Math.floor(a / EVENT_BIN));
  }

  /** Radius on the detector (mm) of a resolution (Å) */
  radiusOf(d: number) {
    return this.options.distance * Math.tan(2 * Math.asin(this.options.wavelength / (2 * d)));
  }

  /** |F|² of a reflection, computed on first use */
  intensityOf(reflection: number) {
    const u = this.unique[reflection];
    if (this.intensity[u] < 0) this.compute(u);
    return this.intensity[u];
  }

  /**
   * Spends up to `budgetMs` computing intensities for the events from `fromEvent` on (the ones the
   * turning crystal records next). Returns true once every recordable reflection is known.
   */
  prefetch(fromEvent: number, budgetMs: number) {
    if (this.complete || !this.ready) return this.complete;
    const ev = this.events;
    if (this.cursor < fromEvent || this.cursor >= fromEvent + ev.count) {
      this.cursor = fromEvent;
      this.sweepStart = fromEvent;
    }
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      for (let n = 0; n < 64; n++) {
        if (this.cursor - this.sweepStart >= ev.count) return (this.complete = true);
        const u = this.unique[ev.reflection[this.cursor % ev.count]];
        this.cursor++;
        if (this.intensity[u] < 0) this.compute(u);
      }
    }
    return false;
  }

  private *build(): Generator<number> {
    const { toFrac: M, symops, asu, cell } = this.crystal;
    const { dMin, wavelength: lambda, distance, halfSize, orientation: U } = this.options;

    // ---- atoms
    const atoms = asu.count;
    const zs = [...new Set(asu.zNum)];
    this.elements = zs.map(formCoefficients);
    this.element = Uint8Array.from(asu.zNum, (z) => zs.indexOf(z));
    let bMax = 0;
    for (const b of asu.bFactor) bMax = Math.max(bMax, b);
    this.bins = Math.ceil(bMax / B_STEP) + 1;
    this.bin = Uint16Array.from(asu.bFactor, (b) => Math.round(Math.max(0, b) / B_STEP));

    // ---- symmetry: operators grouped by rotation part (pure translations become a phase factor)
    for (const op of symops) {
      const g = this.rotations.find((x) => x.r.every((v, i) => v === op.r[i]));
      if (g) g.t.push(op.t);
      else this.rotations.push({ r: op.r, t: [op.t] });
    }
    const rotations = this.rotations;

    // ---- reflections: s = Mᵀ·h (Cartesian, Å⁻¹); index rotation h' = Rᵀ·h
    const sMax2 = 1 / (dMin * dMin);
    const max = [Math.ceil(cell.a / dMin), Math.ceil(cell.b / dMin), Math.ceil(cell.c / dMin)];
    const pack = (h: number, k: number, l: number) => ((h + 512) * 1024 + (k + 512)) * 1024 + (l + 512);
    const keyOf = new Map<number, number>();
    const hkl: number[] = [];
    const dInv: number[] = [];
    const uniq: number[] = [];
    const uHkl: number[] = [];
    for (let h = -max[0]; h <= max[0]; h++) {
      for (let k = -max[1]; k <= max[1]; k++) {
        for (let l = -max[2]; l <= max[2]; l++) {
          const x = M[0] * h + M[3] * k + M[6] * l;
          const y = M[1] * h + M[4] * k + M[7] * l;
          const z = M[2] * h + M[5] * k + M[8] * l;
          const s2 = x * x + y * y + z * z;
          if (s2 > sMax2 || s2 === 0) continue;
          // systematic absence: an operator that leaves hkl unchanged but shifts its phase
          let absent = false;
          for (const op of symops) {
            const r = op.r;
            if (r[0] * h + r[3] * k + r[6] * l !== h || r[1] * h + r[4] * k + r[7] * l !== k || r[2] * h + r[5] * k + r[8] * l !== l) continue;
            const p = h * op.t[0] + k * op.t[1] + l * op.t[2];
            if (Math.abs(p - Math.round(p)) > 1e-6) {
              absent = true;
              break;
            }
          }
          if (absent) continue;
          // symmetry-equivalent indices and Friedel mates share one intensity
          let best = -1;
          for (const g of rotations) {
            const r = g.r;
            const a = r[0] * h + r[3] * k + r[6] * l;
            const b = r[1] * h + r[4] * k + r[7] * l;
            const c = r[2] * h + r[5] * k + r[8] * l;
            best = Math.max(best, pack(a, b, c), pack(-a, -b, -c));
          }
          let u = keyOf.get(best);
          if (u === undefined) {
            u = uHkl.length / 3;
            keyOf.set(best, u);
            uHkl.push(h, k, l);
          }
          hkl.push(h, k, l);
          dInv.push(Math.sqrt(s2));
          uniq.push(u);
        }
        yield (0.3 * (h + max[0] + (k + max[1]) / (2 * max[1] + 1))) / (2 * max[0] + 1);
      }
    }
    this.count = dInv.length;
    this.hkl = Int16Array.from(hkl);
    this.dInv = Float32Array.from(dInv);
    yield 0.3;
    this.unique = Int32Array.from(uniq);
    this.uniqueHkl = Int16Array.from(uHkl);
    this.uniqueCount = uHkl.length / 3;
    this.intensity = new Float32Array(this.uniqueCount).fill(-1);

    // ---- structure-factor tables, wide enough for any index a rotation produces
    const need = [0, 0, 0];
    for (let i = 0; i < this.uniqueCount; i++) {
      const [h, k, l] = [uHkl[i * 3], uHkl[i * 3 + 1], uHkl[i * 3 + 2]];
      for (const g of rotations) {
        const r = g.r;
        need[0] = Math.max(need[0], Math.abs(r[0] * h + r[3] * k + r[6] * l));
        need[1] = Math.max(need[1], Math.abs(r[1] * h + r[4] * k + r[7] * l));
        need[2] = Math.max(need[2], Math.abs(r[2] * h + r[5] * k + r[8] * l));
      }
      if (i % 16384 === 16383) yield 0.3;
    }
    this.tab = need.map((m) => ({ cos: new Float32Array((m + 1) * atoms), sin: new Float32Array((m + 1) * atoms) }));
    for (let j = 0; j < atoms; j++) {
      const [x, y, z] = [asu.xyz[j * 3], asu.xyz[j * 3 + 1], asu.xyz[j * 3 + 2]];
      for (let axis = 0; axis < 3; axis++) {
        const f = M[axis * 3] * x + M[axis * 3 + 1] * y + M[axis * 3 + 2] * z;
        const t = this.tab[axis];
        for (let h = 0; h <= need[axis]; h++) {
          t.cos[h * atoms + j] = Math.cos(TWO_PI * h * f);
          t.sin[h * atoms + j] = Math.sin(TWO_PI * h * f);
        }
      }
      if (j % 128 === 127) yield 0.3 + (0.15 * j) / atoms;
    }

    // ---- Ewald-sphere crossings: turned by φ about z, s_lab = Rz(φ)·U·s, and s_lab,x = ρ·cos(φ + α)
    // must equal −λ|s|²/2 (so that |k₀ + s| = 1/λ), which happens at two angles per turn
    const n = this.count;
    const angle = new Float32Array(2 * n);
    const refl = new Int32Array(2 * n);
    const ys = new Float32Array(2 * n);
    const zs2 = new Float32Array(2 * n);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const [h, k, l] = [this.hkl[i * 3], this.hkl[i * 3 + 1], this.hkl[i * 3 + 2]];
      const x = M[0] * h + M[3] * k + M[6] * l;
      const y = M[1] * h + M[4] * k + M[7] * l;
      const z = M[2] * h + M[5] * k + M[8] * l;
      const vx = U[0] * x + U[1] * y + U[2] * z;
      const vy = U[3] * x + U[4] * y + U[5] * z;
      const vz = U[6] * x + U[7] * y + U[8] * z;
      const rho = Math.hypot(vx, vy);
      const c = (-lambda * this.dInv[i] * this.dInv[i]) / (2 * rho);
      // |c| > 1: the point never reaches the sphere (the blind region round the spindle)
      if (Math.abs(c) <= 1) {
        const alpha = Math.atan2(vy, vx);
        const acos = Math.acos(c);
        for (const sign of [1, -1]) {
          const phi = (((sign * acos - alpha) % TWO_PI) + TWO_PI) % TWO_PI;
          // diffracted beam k = k₀ + s_lab, projected onto the detector
          const sx = vx * Math.cos(phi) - vy * Math.sin(phi);
          const sy = vx * Math.sin(phi) + vy * Math.cos(phi);
          const kx = 1 / lambda + sx;
          if (kx <= 0) continue;
          const py = (distance * sy) / kx;
          const pz = (distance * vz) / kx;
          if (Math.abs(py) > halfSize || Math.abs(pz) > halfSize) continue;
          angle[m] = phi;
          refl[m] = i;
          ys[m] = py;
          zs2[m] = pz;
          m++;
        }
      }
      if (i % 4096 === 4095) yield 0.45 + (0.4 * i) / n;
    }

    // ---- group the crossings by angle bin (counting sort)
    const ev = this.events;
    const binOfEvent = new Uint16Array(m);
    for (let e = 0; e < m; e++) {
      binOfEvent[e] = Math.min(BIN_COUNT - 1, Math.floor(angle[e] / EVENT_BIN));
      ev.start[binOfEvent[e] + 1]++;
      if (e % 65536 === 65535) yield 0.85;
    }
    for (let b = 0; b < BIN_COUNT; b++) ev.start[b + 1] += ev.start[b];
    const fill = ev.start.slice(0, BIN_COUNT);
    ev.reflection = new Int32Array(m);
    ev.y = new Float32Array(m);
    ev.z = new Float32Array(m);
    for (let e = 0; e < m; e++) {
      const at = fill[binOfEvent[e]]++;
      ev.reflection[at] = refl[e];
      ev.y[at] = ys[e];
      ev.z[at] = zs2[e];
      if (e % 65536 === 65535) yield 0.88;
    }
    ev.count = m;
    yield 0.9;

    // ---- brightness reference: median intensity of a sample of 8 to 4 Å reflections
    const sample: number[] = [];
    for (let i = 0; i < n && sample.length < 160; i += 7) {
      const d = 1 / this.dInv[i];
      if (d > 8 || d < 4) continue;
      sample.push(this.intensityOf(i));
      if (sample.length % 16 === 0) yield 0.9 + (0.1 * sample.length) / 160;
    }
    sample.sort((a, b) => a - b);
    this.reference = sample[sample.length >> 1] || 1;
  }

  private compute(u: number) {
    const h = this.uniqueHkl[u * 3];
    const k = this.uniqueHkl[u * 3 + 1];
    const l = this.uniqueHkl[u * 3 + 2];
    const M = this.crystal.toFrac;
    const sx = M[0] * h + M[3] * k + M[6] * l;
    const sy = M[1] * h + M[4] * k + M[7] * l;
    const sz = M[2] * h + M[5] * k + M[8] * l;
    const q = (sx * sx + sy * sy + sz * sz) / 4; // (sinθ/λ)²
    const fe = this.elements.map((c) => formFactor(c, q));
    const tb = new Float64Array(this.bins);
    for (let b = 0; b < this.bins; b++) tb[b] = Math.exp(-b * B_STEP * q);

    const n = this.crystal.asu.count;
    const [X, Y, Z] = this.tab;
    const element = this.element;
    const bin = this.bin;
    let re = 0;
    let im = 0;
    for (const g of this.rotations) {
      // Σ over this rotation's translations of exp(2πi·h·t)
      let pr = 0;
      let pi = 0;
      for (const t of g.t) {
        const p = TWO_PI * (h * t[0] + k * t[1] + l * t[2]);
        pr += Math.cos(p);
        pi += Math.sin(p);
      }
      if (Math.abs(pr) < 1e-9 && Math.abs(pi) < 1e-9) continue;
      const r = g.r;
      const a = r[0] * h + r[3] * k + r[6] * l;
      const b = r[1] * h + r[4] * k + r[7] * l;
      const c = r[2] * h + r[5] * k + r[8] * l;
      const ox = Math.abs(a) * n;
      const oy = Math.abs(b) * n;
      const oz = Math.abs(c) * n;
      const gx = a < 0 ? -1 : 1;
      const gy = b < 0 ? -1 : 1;
      const gz = c < 0 ? -1 : 1;
      let fr = 0;
      let fi = 0;
      for (let j = 0; j < n; j++) {
        // exp(2πi(a·x + b·y + c·z)) as a product of the three tabulated factors
        const w = fe[element[j]] * tb[bin[j]];
        const cx = X.cos[ox + j];
        const snx = gx * X.sin[ox + j];
        const cy = Y.cos[oy + j];
        const sny = gy * Y.sin[oy + j];
        const cz = Z.cos[oz + j];
        const snz = gz * Z.sin[oz + j];
        const r1 = cx * cy - snx * sny;
        const i1 = cx * sny + snx * cy;
        fr += w * (r1 * cz - i1 * snz);
        fi += w * (r1 * snz + i1 * cz);
      }
      re += pr * fr - pi * fi;
      im += pr * fi + pi * fr;
    }
    this.intensity[u] = re * re + im * im;
  }
}
