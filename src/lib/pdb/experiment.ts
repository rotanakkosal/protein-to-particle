/**
 * How a structure was made, as recorded in its PDBx/mmCIF file: source gene, expression
 * system, crystallisation, diffraction experiment, data quality, refinement and dates.
 * Every field is optional because older or non-crystallographic entries leave many blank.
 */

import { cifRows, cifValue, type CifTables, type Value } from "./parseCif";
import type { PdbStructure } from "./parsePdb";

export interface ExperimentInfo {
  gene: { names: string[]; organism: string | null; details: string | null };
  expression: { host: string | null; strain: string | null; vectorType: string | null; plasmid: string | null };
  /** Residues the authors flag as left over from the expression tag (e.g. Gly0) */
  expressionTags: { chain: string; resName: string; seq: number }[];
  uniprot: { accession: string; name: string | null } | null;
  /** Formula weight of one polymer chain (Da) and how many chains the asymmetric unit holds */
  chainWeightDa: number | null;
  chainsInAsu: number | null;
  crystal: { method: string | null; temperatureK: number | null; pH: number | null; details: string | null; matthews: number | null; solventPercent: number | null };
  diffraction: {
    source: string | null;
    site: string | null;
    beamline: string | null;
    wavelength: number | null;
    detector: string | null;
    detectorModel: string | null;
    monochromator: string | null;
    temperatureK: number | null;
  };
  reflections: { resolutionHigh: number | null; resolutionLow: number | null; count: number | null; completeness: number | null; redundancy: number | null; rMerge: number | null };
  refinement: { method: string | null; startingModel: string | null; rWork: number | null; rFree: number | null };
  software: { name: string; role: string }[];
  dates: { collected: string | null; deposited: string | null; released: string | null };
}

const num = (v: Value): number | null => {
  if (v === null) return null;
  const x = Number.parseFloat(v);
  return Number.isFinite(x) ? x : null;
};

export function parseExperiment(tables: CifTables): ExperimentInfo {
  const v = (cat: string, item: string) => cifValue(tables, cat, item);
  const entity = cifRows(tables, "entity").find((r) => r.type === "polymer");
  const poly = cifRows(tables, "entity_poly")[0];
  const releases = cifRows(tables, "pdbx_audit_revision_history")
    .map((r) => r.revision_date)
    .filter((d): d is string => !!d)
    .sort();
  const strands = poly?.pdbx_strand_id?.split(",").filter(Boolean).length ?? null;

  return {
    gene: {
      names: (v("entity_src_gen", "pdbx_gene_src_gene") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      organism: v("entity_src_gen", "pdbx_gene_src_scientific_name"),
      details: v("entity_src_gen", "gene_src_details"),
    },
    expression: {
      host: v("entity_src_gen", "pdbx_host_org_scientific_name"),
      strain: v("entity_src_gen", "pdbx_host_org_strain"),
      vectorType: v("entity_src_gen", "pdbx_host_org_vector_type"),
      plasmid: v("entity_src_gen", "plasmid_name"),
    },
    expressionTags: cifRows(tables, "struct_ref_seq_dif")
      .filter((r) => (r.details ?? "").toLowerCase().includes("expression tag"))
      .map((r) => ({ chain: r.pdbx_pdb_strand_id ?? "", resName: r.mon_id ?? "", seq: Number.parseInt(r.pdbx_auth_seq_num ?? "", 10) }))
      .filter((t) => Number.isFinite(t.seq)),
    uniprot: v("struct_ref", "pdbx_db_accession") ? { accession: v("struct_ref", "pdbx_db_accession")!, name: v("struct_ref", "db_code") } : null,
    chainWeightDa: num(entity?.formula_weight ?? null),
    chainsInAsu: num(entity?.pdbx_number_of_molecules ?? null) ?? strands,
    crystal: {
      method: v("exptl_crystal_grow", "method"),
      temperatureK: num(v("exptl_crystal_grow", "temp")),
      pH: num(v("exptl_crystal_grow", "pH")),
      details: v("exptl_crystal_grow", "pdbx_details"),
      matthews: num(v("exptl_crystal", "density_Matthews")),
      solventPercent: num(v("exptl_crystal", "density_percent_sol")),
    },
    diffraction: {
      source: v("diffrn_source", "source"),
      site: v("diffrn_source", "pdbx_synchrotron_site"),
      beamline: v("diffrn_source", "pdbx_synchrotron_beamline"),
      wavelength: num(v("diffrn_radiation_wavelength", "wavelength")) ?? num(v("diffrn_source", "pdbx_wavelength_list")),
      detector: v("diffrn_detector", "detector"),
      detectorModel: v("diffrn_detector", "type"),
      monochromator: v("diffrn_radiation", "monochromator"),
      temperatureK: num(v("diffrn", "ambient_temp")),
    },
    reflections: {
      resolutionHigh: num(v("reflns", "d_resolution_high")),
      resolutionLow: num(v("reflns", "d_resolution_low")),
      count: num(v("reflns", "number_obs")),
      completeness: num(v("reflns", "percent_possible_obs")),
      redundancy: num(v("reflns", "pdbx_redundancy")),
      rMerge: num(v("reflns", "pdbx_Rmerge_I_obs")),
    },
    refinement: {
      method: v("refine", "pdbx_method_to_determine_struct"),
      startingModel: v("refine", "pdbx_starting_model"),
      rWork: num(v("refine", "ls_R_factor_R_work")),
      rFree: num(v("refine", "ls_R_factor_R_free")),
    },
    software: cifRows(tables, "software")
      .filter((r) => r.name)
      .map((r) => ({ name: r.name!, role: r.classification ?? "" })),
    dates: {
      collected: v("diffrn_detector", "pdbx_collection_date"),
      deposited: v("pdbx_database_status", "recvd_initial_deposition_date"),
      released: releases[0] ?? null,
    },
  };
}

/* ------------------------------------------------------------------ crystal */

export interface SymOp {
  /** Rotation part, row-major 3×3, acting on fractional coordinates */
  r: number[];
  /** Translation in fractional units */
  t: [number, number, number];
}

export interface CrystalInfo {
  cell: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
  spaceGroup: string;
  /** Molecules per unit cell as recorded (Z) */
  z: number | null;
  /** Cartesian (Å) → fractional, row-major 3×3 */
  toFrac: number[];
  /** Fractional → Cartesian (Å), row-major 3×3 */
  toCart: number[];
  volume: number;
  symops: SymOp[];
  /** Heavy atoms of the asymmetric unit (all chains plus ligands), deposited coordinates */
  asu: AsuAtoms;
}

export interface AsuAtoms {
  count: number;
  xyz: Float32Array;
  /** Atomic number (scattering power) */
  zNum: Uint8Array;
  bFactor: Float32Array;
  /** Index into `chains` */
  chain: Uint8Array;
  chains: string[];
  /** 1 for Cα atoms of the polymer */
  isCA: Uint8Array;
  resSeq: Int16Array;
}

/** General positions of common protein space groups (International Tables, standard settings). */
const SPACE_GROUP_OPS: Record<string, string[]> = {
  "P 1": ["x,y,z"],
  "P 1 21 1": ["x,y,z", "-x,y+1/2,-z"],
  "C 1 2 1": ["x,y,z", "-x,y,-z", "x+1/2,y+1/2,z", "-x+1/2,y+1/2,-z"],
  "P 21 21 21": ["x,y,z", "-x+1/2,-y,z+1/2", "-x,y+1/2,-z+1/2", "x+1/2,-y+1/2,-z"],
  "P 21 21 2": ["x,y,z", "-x,-y,z", "-x+1/2,y+1/2,-z", "x+1/2,-y+1/2,-z"],
  "C 2 2 21": ["x,y,z", "-x,-y,z+1/2", "-x,y,-z+1/2", "x,-y,-z", "x+1/2,y+1/2,z", "-x+1/2,-y+1/2,z+1/2", "-x+1/2,y+1/2,-z+1/2", "x+1/2,-y+1/2,-z"],
};

/** Parses one symmetry operator such as "-x+1/2,y+1/2,-z". */
export function parseSymop(op: string): SymOp {
  const r = new Array(9).fill(0);
  const t: [number, number, number] = [0, 0, 0];
  op
    .toLowerCase()
    .replace(/\s+/g, "")
    .split(",")
    .forEach((part, row) => {
      for (const m of part.matchAll(/([+-]?)([xyz]|\d+(?:\/\d+)?(?:\.\d+)?)/g)) {
        const sign = m[1] === "-" ? -1 : 1;
        const term = m[2];
        if (term === "x" || term === "y" || term === "z") r[row * 3 + "xyz".indexOf(term)] = sign;
        else {
          const [p, q] = term.split("/");
          t[row] += (sign * Number.parseFloat(p)) / (q ? Number.parseFloat(q) : 1);
        }
      }
    });
  return { r, t };
}

const ATOMIC_NUMBER: Record<string, number> = { H: 1, C: 6, N: 7, O: 8, F: 9, NA: 11, MG: 12, P: 15, S: 16, CL: 17, K: 19, CA: 20, MN: 25, FE: 26, CO: 27, NI: 28, CU: 29, ZN: 30, SE: 34, BR: 35, CD: 48, I: 53 };

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** Orthogonalisation in the PDB convention (a along x, b in the xy plane) when the file has no matrix. */
function fracMatrixFromCell(a: number, b: number, c: number, alpha: number, beta: number, gamma: number): number[] {
  const rad = Math.PI / 180;
  const [ca, cb, cg, sg] = [Math.cos(alpha * rad), Math.cos(beta * rad), Math.cos(gamma * rad), Math.sin(gamma * rad)];
  const v = Math.sqrt(1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg);
  const toCart = [a, b * cg, c * cb, 0, b * sg, (c * (ca - cb * cg)) / sg, 0, 0, (c * v) / sg];
  return invert3(toCart);
}

export function parseCrystal(tables: CifTables, structure: PdbStructure): CrystalInfo | null {
  const n = (cat: string, item: string) => num(cifValue(tables, cat, item));
  const a = n("cell", "length_a");
  const b = n("cell", "length_b");
  const c = n("cell", "length_c");
  const alpha = n("cell", "angle_alpha");
  const beta = n("cell", "angle_beta");
  const gamma = n("cell", "angle_gamma");
  const spaceGroup = (cifValue(tables, "symmetry", "space_group_name_H-M") ?? cifValue(tables, "space_group", "name_H-M_alt") ?? "").trim();
  if (!a || !b || !c || !alpha || !beta || !gamma || !spaceGroup) return null;
  // A unit cell of 1 Å means "no crystal" (NMR and cryo-EM entries)
  if (a <= 1.01 && b <= 1.01 && c <= 1.01) return null;

  const listed = [...cifRows(tables, "space_group_symop").map((r) => r.operation_xyz), ...cifRows(tables, "symmetry_equiv").map((r) => r.pos_as_xyz)].filter(
    (x): x is string => !!x,
  );
  const opStrings = listed.length ? listed : SPACE_GROUP_OPS[spaceGroup];
  if (!opStrings) return null;

  const m = [1, 2, 3].flatMap((i) => [1, 2, 3].map((j) => num(cifValue(tables, "atom_sites", `fract_transf_matrix[${i}][${j}]`))));
  const toFrac = m.every((x) => x !== null) ? (m as number[]) : fracMatrixFromCell(a, b, c, alpha, beta, gamma);
  const toCart = invert3(toFrac);
  const rad = Math.PI / 180;
  const [ca, cb, cg] = [Math.cos(alpha * rad), Math.cos(beta * rad), Math.cos(gamma * rad)];
  const volume = a * b * c * Math.sqrt(1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg);

  const atoms = [...structure.atoms, ...structure.hetAtoms].filter((x) => x.element !== "H" && x.element !== "D");
  const chains = [...new Set(atoms.map((x) => x.chainId))];
  const asu: AsuAtoms = {
    count: atoms.length,
    xyz: new Float32Array(atoms.length * 3),
    zNum: new Uint8Array(atoms.length),
    bFactor: new Float32Array(atoms.length),
    chain: new Uint8Array(atoms.length),
    chains,
    isCA: new Uint8Array(atoms.length),
    resSeq: new Int16Array(atoms.length),
  };
  const polymer = new Set(structure.atoms);
  atoms.forEach((x, i) => {
    asu.xyz.set([x.x, x.y, x.z], i * 3);
    asu.zNum[i] = ATOMIC_NUMBER[x.element] ?? 6;
    asu.bFactor[i] = x.bFactor;
    asu.chain[i] = chains.indexOf(x.chainId);
    asu.isCA[i] = polymer.has(x) && x.name === "CA" ? 1 : 0;
    asu.resSeq[i] = x.resSeq;
  });

  return {
    cell: { a, b, c, alpha, beta, gamma },
    spaceGroup,
    z: n("cell", "Z_PDB"),
    toFrac,
    toCart,
    volume,
    symops: opStrings.map(parseSymop),
    asu,
  };
}
