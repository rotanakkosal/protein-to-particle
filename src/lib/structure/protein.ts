import { Vector3 } from "three";
import { parsePdb, type PdbStructure, type SecondaryStructureKind } from "@/lib/pdb/parsePdb";
import { isCif, parseCif } from "@/lib/pdb/parseCif";
import { AMINO_ACIDS, ONE_LETTER } from "@/content/aminoAcids";
import { RESIDUE_TEMPLATES } from "@/lib/chem/residueTemplates";
import { isElementSymbol, type ElementSymbol } from "@/lib/chem/elements";

export type SSType = SecondaryStructureKind | "coil";
export type RegionKind = "helix" | "helix310" | "strand" | "loop" | "turn" | "nterm" | "tail";

export interface Residue {
  index: number;
  seq: number;
  resName: string;
  one: string;
  atoms: Record<string, Vector3>;
  elements: Record<string, ElementSymbol>;
  ss: SSType;
  regionId: string;
  /** True when the chain is broken (missing residues) between this residue and the previous one */
  breakBefore: boolean;
}

export interface Region {
  id: string;
  kind: RegionKind;
  /** First/last residue index (0-based, inclusive) */
  startIndex: number;
  endIndex: number;
  label: string;
  ordinal: number;
  centroid: Vector3;
  /** Turns only: true when it joins two β-strands (a β-hairpin) */
  hairpin?: boolean;
}

export interface DetailBond {
  a: Vector3;
  b: Vector3;
  ea: ElementSymbol;
  eb: ElementSymbol;
}

export interface LigandAtom {
  name: string;
  element: string;
  position: Vector3;
}

/** A bound small molecule or ion (HETATM group), e.g. GDP or Mg²⁺. */
export interface Ligand {
  key: string;
  resName: string;
  resSeq: number;
  atoms: LigandAtom[];
  /** Covalent bonds inferred from interatomic distances (index pairs into atoms) */
  bonds: [number, number][];
  centroid: Vector3;
}

export interface ProteinModel {
  idCode: string;
  chainId: string;
  molecule: string;
  citation: string;
  method: string;
  resolution: number | null;
  residues: Residue[];
  regions: Region[];
  regionById: Record<string, Region>;
  sequence: string;
  heavyAtomCount: number;
  /** Bounding-sphere radius of all heavy atoms (Å), centred on the origin */
  radius: number;
  /** Largest dimension of the molecule (Å) */
  maxDimension: number;
  /** Side-chain bonds, used for the close-up detail layer of the ribbon view */
  sideChainBonds: DetailBond[];
  ligands: Ligand[];
  /** Mass of the modelled chain from its sequence (kDa) */
  massKDa: number;
}

/** Covalent radii (Å) for inferring ligand bonds; metal ions are left unbonded. */
const COVALENT_RADIUS: Record<string, number> = { H: 0.31, C: 0.76, N: 0.71, O: 0.66, P: 1.07, S: 1.05, F: 0.57, CL: 1.02, BR: 1.2 };

/** Jacobi eigen-decomposition of a symmetric 3×3 matrix. Returns eigenvectors sorted by eigenvalue (desc). */
function principalAxes(cov: number[][]): Vector3[] {
  const a = cov.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] * a[p][q];
    if (off < 1e-12) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-14) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const pairs = [0, 1, 2].map((i) => ({ value: a[i][i], vec: new Vector3(v[0][i], v[1][i], v[2][i]).normalize() }));
  pairs.sort((x, y) => y.value - x.value);
  return pairs.map((p) => p.vec);
}

function buildRegions(residues: Residue[]): Region[] {
  const regions: Region[] = [];
  const counters: Record<string, number> = {};
  let i = 0;
  while (i < residues.length) {
    const ss = residues[i].ss;
    let j = i;
    while (j + 1 < residues.length && residues[j + 1].ss === ss) j++;
    let kind: RegionKind;
    if (ss === "coil") {
      if (j === residues.length - 1) kind = "tail";
      else if (i === 0) kind = "nterm";
      else if (j - i + 1 <= 2) kind = "turn";
      else kind = "loop";
    } else {
      kind = ss;
    }
    counters[kind] = (counters[kind] ?? 0) + 1;
    const ordinal = counters[kind];
    const first = residues[i];
    const last = residues[j];
    const range = i === j ? aaLabel(first) : `${aaLabel(first)}–${aaLabel(last)}`;
    const names: Record<RegionKind, string> = {
      helix: "α-helix",
      helix310: "3₁₀-helix",
      strand: `β-strand ${ordinal}`,
      loop: "Loop",
      turn: "Turn",
      nterm: "N-terminus",
      tail: "C-terminal tail",
    };
    const id = `${kind}-${first.seq}`;
    const centroid = new Vector3();
    for (let k = i; k <= j; k++) centroid.add(residues[k].atoms.CA);
    centroid.divideScalar(j - i + 1);
    const hairpin = kind === "turn" && residues[i - 1]?.ss === "strand" && residues[j + 1]?.ss === "strand";
    regions.push({ id, kind, startIndex: i, endIndex: j, label: `${names[kind]} · ${range}`, ordinal, centroid, ...(kind === "turn" ? { hairpin } : {}) });
    for (let k = i; k <= j; k++) residues[k].regionId = id;
    i = j + 1;
  }
  // Number helices when there is more than one (KRAS has five α-helices)
  for (const kind of ["helix", "helix310"] as const) {
    if ((counters[kind] ?? 0) > 1) {
      for (const r of regions) if (r.kind === kind) r.label = r.label.replace(/^(α-helix|3₁₀-helix)/, `$1 ${r.ordinal}`);
    }
  }
  return regions;
}

export function aaLabel(r: Pick<Residue, "resName" | "seq">): string {
  const n = r.resName.charAt(0) + r.resName.slice(1).toLowerCase();
  return `${n}${r.seq}`;
}

// Hydrogens are placed from residue templates at Level III, so any modelled ones in the file are skipped
const isHydrogen = (element: string) => element === "H" || element === "D";

export function buildProteinModel(structure: PdbStructure, chainId = "A", ligandNames?: Set<string>): ProteinModel {
  const atoms = structure.atoms.filter((a) => a.chainId === chainId && !isHydrogen(a.element));
  const byRes = new Map<number, typeof atoms>();
  for (const a of atoms) {
    if (!byRes.has(a.resSeq)) byRes.set(a.resSeq, []);
    byRes.get(a.resSeq)!.push(a);
  }

  // Centre on the heavy-atom centroid and rotate onto principal axes (proper rotation, det = +1)
  const centroid = new Vector3();
  for (const a of atoms) centroid.add(new Vector3(a.x, a.y, a.z));
  centroid.divideScalar(atoms.length);
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const a of atoms) {
    const d = [a.x - centroid.x, a.y - centroid.y, a.z - centroid.z];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r][c] += d[r] * d[c];
  }
  const [e1, e2] = principalAxes(cov);
  const e3 = new Vector3().crossVectors(e1, e2).normalize();
  const transform = (x: number, y: number, z: number) => {
    const d = new Vector3(x, y, z).sub(centroid);
    return new Vector3(d.dot(e1), d.dot(e2), d.dot(e3));
  };

  const ssAt = (seq: number): SSType => {
    for (const s of structure.secondary) {
      if (s.chainId === chainId && seq >= s.start && seq <= s.end) return s.kind;
    }
    return "coil";
  };

  const residues: Residue[] = [];
  const seqs = [...byRes.keys()].sort((x, y) => x - y);
  for (const seq of seqs) {
    const list = byRes.get(seq)!;
    const resName = list[0].resName;
    const record: Record<string, Vector3> = {};
    const elements: Record<string, ElementSymbol> = {};
    for (const a of list) {
      if (!isElementSymbol(a.element)) continue;
      record[a.name] = transform(a.x, a.y, a.z);
      elements[a.name] = a.element;
    }
    if (!record.CA) continue;
    residues.push({
      index: residues.length,
      seq,
      resName,
      one: ONE_LETTER[resName] ?? "X",
      atoms: record,
      elements,
      ss: ssAt(seq),
      regionId: "",
      breakBefore: false,
    });
  }
  for (let i = 1; i < residues.length; i++) {
    const a = residues[i - 1];
    const b = residues[i];
    const peptide = a.atoms.C && b.atoms.N ? a.atoms.C.distanceTo(b.atoms.N) : Infinity;
    b.breakBefore = b.seq !== a.seq + 1 || peptide > 2.0 || a.atoms.CA.distanceTo(b.atoms.CA) > 4.3;
  }

  // Bound ligands of this chain (only recognised biological ones: no buffer or cryo-protectant molecules)
  const groups = new Map<string, typeof structure.hetAtoms>();
  for (const h of structure.hetAtoms) {
    if (h.chainId !== chainId || isHydrogen(h.element) || (ligandNames && !ligandNames.has(h.resName))) continue;
    const key = `${h.resName}${h.resSeq}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(h);
  }
  const ligands: Ligand[] = [...groups.entries()].map(([key, list]) => {
    const atomsL = list.map((h) => ({ name: h.name, element: h.element, position: transform(h.x, h.y, h.z) }));
    const bonds: [number, number][] = [];
    for (let i = 0; i < atomsL.length; i++) {
      for (let j = i + 1; j < atomsL.length; j++) {
        const ri = COVALENT_RADIUS[atomsL[i].element];
        const rj = COVALENT_RADIUS[atomsL[j].element];
        if (ri === undefined || rj === undefined) continue;
        const d = atomsL[i].position.distanceTo(atomsL[j].position);
        if (d > 0.4 && d < ri + rj + 0.4) bonds.push([i, j]);
      }
    }
    const centroid = atomsL.reduce((acc, a) => acc.add(a.position), new Vector3()).divideScalar(atomsL.length);
    return { key, resName: list[0].resName, resSeq: list[0].resSeq, atoms: atomsL, bonds, centroid };
  });
  const WATER_MASS = 18.015;
  const massKDa = (residues.reduce((sum, r) => sum + (AMINO_ACIDS[r.resName]?.molarMass ?? 110 + WATER_MASS) - WATER_MASS, 0) + WATER_MASS) / 1000;

  const regions = buildRegions(residues);
  let radius = 0;
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  let heavyAtomCount = 0;
  for (const r of residues) {
    for (const p of Object.values(r.atoms)) {
      radius = Math.max(radius, p.length());
      min = min.min(p);
      max = max.max(p);
      heavyAtomCount++;
    }
  }
  const size = new Vector3().subVectors(max, min);

  const sideChainBonds: DetailBond[] = [];
  for (const r of residues) {
    const t = RESIDUE_TEMPLATES[r.resName];
    if (!t) continue;
    const pairs: [string, string][] = [["CA", "CB"], ...t.bonds.map(([a, b]) => [a, b] as [string, string])];
    for (const [a, b] of pairs) {
      if (r.atoms[a] && r.atoms[b]) sideChainBonds.push({ a: r.atoms[a], b: r.atoms[b], ea: r.elements[a], eb: r.elements[b] });
    }
  }

  return {
    idCode: structure.idCode,
    chainId,
    molecule: structure.molecule,
    citation: structure.citation,
    method: structure.method,
    resolution: structure.resolution,
    residues,
    regions,
    regionById: Object.fromEntries(regions.map((r) => [r.id, r])),
    sequence: residues.map((r) => r.one).join(""),
    heavyAtomCount,
    radius,
    maxDimension: Math.max(size.x, size.y, size.z),
    sideChainBonds,
    ligands,
    massKDa,
  };
}

export interface ProteinSource {
  id: string;
  pdbId: string;
  file: string;
  remoteUrl: string;
  chainId: string;
}

const cache = new Map<string, Promise<ProteinModel>>();

async function fetchPdbText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return /^ATOM {2}|^_atom_site\./m.test(text) ? text : null; // PDB or mmCIF coordinates
  } catch {
    return null;
  }
}

/** Loads a protein once: the bundled copy first, then (for local development) the RCSB download. */
export function loadProtein(source: ProteinSource, ligandNames?: Set<string>): Promise<ProteinModel> {
  let p = cache.get(source.id);
  if (!p) {
    p = (async () => {
      const text = (await fetchPdbText(source.file)) ?? (await fetchPdbText(source.remoteUrl));
      if (!text) throw new Error(`The structure file for PDB ${source.pdbId} is not available. Add ${source.file} to the public folder or check your internet connection.`);
      return buildProteinModel(isCif(text) ? parseCif(text) : parsePdb(text), source.chainId, ligandNames);
    })();
    p.catch(() => cache.delete(source.id));
    cache.set(source.id, p);
  }
  return p;
}
