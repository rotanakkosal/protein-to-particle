/**
 * Minimal PDBx/mmCIF reader. It returns the same PdbStructure as the PDB-format parser, so the
 * rest of the app does not care which format a structure came in. Residue numbers, chain IDs and
 * atom names use the author ("auth_") fields, which match the numbering of the classic PDB file.
 */

import type { PdbAtom, PdbStructure, SecondaryStructureRecord } from "./parsePdb";

const WATER = new Set(["HOH", "WAT", "DOD", "H2O"]);

/** One CIF value; `null` stands for the CIF "unknown" (?) and "not applicable" (.) markers. */
export type Value = string | null;
interface Table {
  tags: string[];
  rows: Value[][];
}

interface Token {
  text: string;
  /** Quoted strings and text fields are always values, never keywords or tags */
  quoted: boolean;
}

function* tokenize(text: string): Generator<Token> {
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    // multi-line text field: ";" at the start of a line opens and closes it
    if (line.startsWith(";")) {
      const parts = [line.slice(1)];
      while (++li < lines.length && !lines[li].startsWith(";")) parts.push(lines[li]);
      yield { text: parts.join("\n").trim(), quoted: true };
      continue;
    }
    let i = 0;
    const n = line.length;
    while (i < n) {
      const c = line[i];
      if (c === " " || c === "\t") {
        i++;
      } else if (c === "#") {
        break;
      } else if (c === "'" || c === '"') {
        // a quote only closes when followed by whitespace or the end of the line
        let j = i + 1;
        while (j < n && !(line[j] === c && (j + 1 === n || line[j + 1] === " " || line[j + 1] === "\t"))) j++;
        yield { text: line.slice(i + 1, j), quoted: true };
        i = j + 1;
      } else {
        let j = i;
        while (j < n && line[j] !== " " && line[j] !== "\t") j++;
        yield { text: line.slice(i, j), quoted: false };
        i = j;
      }
    }
  }
}

/** All categories of the first data block, keyed by category name ("atom_site", "cell", ...). */
export type CifTables = Map<string, Table>;

/** Reads the first data block into tables keyed by category name ("atom_site", "struct_conf", ...). */
export function readCifTables(text: string): CifTables {
  const tables = new Map<string, Table>();
  const value = (t: Token): Value => (!t.quoted && (t.text === "?" || t.text === ".") ? null : t.text);
  const split = (tag: string) => {
    const dot = tag.indexOf(".");
    return dot < 0 ? [tag.slice(1), ""] : [tag.slice(1, dot), tag.slice(dot + 1)];
  };
  const isTag = (t: Token) => !t.quoted && t.text.startsWith("_");
  const isKeyword = (t: Token) => !t.quoted && /^(loop_|data_|save_|global_|stop_)/i.test(t.text);

  const it = tokenize(text);
  let tok = it.next();
  let blocks = 0;
  while (!tok.done) {
    const t = tok.value;
    if (!t.quoted && /^data_/i.test(t.text)) {
      if (++blocks > 1) break; // first data block only
      tok = it.next();
    } else if (!t.quoted && t.text.toLowerCase() === "loop_") {
      const tags: string[] = [];
      tok = it.next();
      while (!tok.done && isTag(tok.value)) {
        tags.push(tok.value.text);
        tok = it.next();
      }
      if (!tags.length) continue;
      const [category] = split(tags[0]);
      const table: Table = { tags: tags.map((x) => split(x)[1]), rows: [] };
      let row: Value[] = [];
      while (!tok.done && !isTag(tok.value) && !isKeyword(tok.value)) {
        row.push(value(tok.value));
        if (row.length === tags.length) {
          table.rows.push(row);
          row = [];
        }
        tok = it.next();
      }
      tables.set(category, table);
    } else if (isTag(t)) {
      const [category, item] = split(t.text);
      tok = it.next();
      let v: Value = null;
      if (!tok.done && !isTag(tok.value) && !isKeyword(tok.value)) {
        v = value(tok.value);
        tok = it.next();
      }
      let table = tables.get(category);
      if (!table) tables.set(category, (table = { tags: [], rows: [[]] }));
      table.tags.push(item);
      table.rows[0].push(v);
    } else {
      tok = it.next();
    }
  }
  return tables;
}

/** Row accessor: `get(row, "auth_seq_id")` */
function columns(table: Table | undefined) {
  const index = new Map(table?.tags.map((t, i) => [t, i]) ?? []);
  return (row: Value[], tag: string): Value => {
    const i = index.get(tag);
    return i === undefined ? null : (row[i] ?? null);
  };
}

const first = (tables: CifTables, category: string, tag: string): Value => {
  const table = tables.get(category);
  if (!table?.rows.length) return null;
  return columns(table)(table.rows[0], tag);
};

/** First value of an item, e.g. cifValue(tables, "cell", "length_a"). */
export const cifValue = first;

/** Every row of a category as an object keyed by item name. */
export function cifRows(tables: CifTables, category: string): Record<string, Value>[] {
  const table = tables.get(category);
  if (!table) return [];
  return table.rows.map((row) => Object.fromEntries(table.tags.map((t, i) => [t, row[i] ?? null])));
}

const toInt = (v: Value) => (v === null ? Number.NaN : Number.parseInt(v, 10));
const toFloat = (v: Value) => (v === null ? Number.NaN : Number.parseFloat(v));

export function parseCif(text: string): PdbStructure {
  return parseCifTables(readCifTables(text));
}

/** Builds the coordinate model (same shape as the PDB-format parser) from already-read tables. */
export function parseCifTables(tables: CifTables): PdbStructure {

  // header fields
  const idCode = first(tables, "entry", "id") ?? "";
  const classification = first(tables, "struct_keywords", "pdbx_keywords") ?? "";
  const method = first(tables, "exptl", "method") ?? "";
  const resolutionText =
    first(tables, "refine", "ls_d_res_high") ?? first(tables, "reflns", "d_resolution_high") ?? first(tables, "em_3d_reconstruction", "resolution");
  const resolution = resolutionText !== null && Number.isFinite(toFloat(resolutionText)) ? toFloat(resolutionText) : null;

  let molecule = "";
  const entity = tables.get("entity");
  if (entity) {
    const get = columns(entity);
    const polymer = entity.rows.find((r) => get(r, "type") === "polymer");
    molecule = (polymer && get(polymer, "pdbx_description")) ?? "";
  }

  // primary citation as "Surname et al. (year)"
  let citation = "";
  const authors = tables.get("citation_author");
  if (authors) {
    const get = columns(authors);
    const primary = authors.rows
      .filter((r) => get(r, "citation_id") === "primary")
      .sort((a, b) => (toInt(get(a, "ordinal")) || 0) - (toInt(get(b, "ordinal")) || 0));
    const name = primary[0] && get(primary[0], "name"); // e.g. "Hunter, J.C."
    if (name) {
      const surname = name.split(",")[0].trim();
      const cit = tables.get("citation");
      const getC = columns(cit);
      const row = cit?.rows.find((r) => getC(r, "id") === "primary");
      const year = row ? getC(row, "year") : null;
      citation = `${surname} et al.${year ? ` (${year})` : ""}`;
    }
  }

  // secondary structure
  const secondary: SecondaryStructureRecord[] = [];
  const conf = tables.get("struct_conf");
  if (conf) {
    const get = columns(conf);
    for (const r of conf.rows) {
      if (!get(r, "conf_type_id")?.startsWith("HELX")) continue;
      secondary.push({
        // helix class 1 = right-handed alpha, 5 = right-handed 3-10
        kind: toInt(get(r, "pdbx_PDB_helix_class")) === 5 ? "helix310" : "helix",
        chainId: get(r, "beg_auth_asym_id") ?? get(r, "beg_label_asym_id") ?? "",
        start: toInt(get(r, "beg_auth_seq_id") ?? get(r, "beg_label_seq_id")),
        end: toInt(get(r, "end_auth_seq_id") ?? get(r, "end_label_seq_id")),
      });
    }
  }
  const sheet = tables.get("struct_sheet_range");
  if (sheet) {
    const get = columns(sheet);
    for (const r of sheet.rows) {
      secondary.push({
        kind: "strand",
        chainId: get(r, "beg_auth_asym_id") ?? get(r, "beg_label_asym_id") ?? "",
        start: toInt(get(r, "beg_auth_seq_id") ?? get(r, "beg_label_seq_id")),
        end: toInt(get(r, "end_auth_seq_id") ?? get(r, "end_label_seq_id")),
      });
    }
  }

  // coordinates (first model, first alternate location)
  const atoms: PdbAtom[] = [];
  const hetAtoms: PdbAtom[] = [];
  const site = tables.get("atom_site");
  if (site) {
    const get = columns(site);
    let model: Value = null;
    for (const r of site.rows) {
      const m = get(r, "pdbx_PDB_model_num");
      if (model === null) model = m;
      if (m !== model) continue;
      const altLoc = get(r, "label_alt_id");
      if (altLoc !== null && altLoc !== "A") continue;
      const group = get(r, "group_PDB");
      const resName = get(r, "auth_comp_id") ?? get(r, "label_comp_id") ?? "";
      if (group === "HETATM" && WATER.has(resName)) continue;
      const name = get(r, "auth_atom_id") ?? get(r, "label_atom_id") ?? "";
      const atom: PdbAtom = {
        serial: toInt(get(r, "id")),
        name,
        resName,
        chainId: get(r, "auth_asym_id") ?? get(r, "label_asym_id") ?? "",
        resSeq: toInt(get(r, "auth_seq_id") ?? get(r, "label_seq_id")),
        x: toFloat(get(r, "Cartn_x")),
        y: toFloat(get(r, "Cartn_y")),
        z: toFloat(get(r, "Cartn_z")),
        bFactor: toFloat(get(r, "B_iso_or_equiv")) || 0,
        element: (get(r, "type_symbol") ?? name.replace(/[^A-Za-z]/g, "").charAt(0)).toUpperCase(),
      };
      (group === "HETATM" ? hetAtoms : atoms).push(atom);
    }
  }

  return { idCode, classification, molecule, resolution, method, atoms, hetAtoms, citation, secondary };
}

/** mmCIF files start with a "data_" block header (optionally after comment lines). */
export function isCif(text: string): boolean {
  return /^\s*(#.*\n\s*)*data_/i.test(text);
}
