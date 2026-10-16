/**
 * Minimal fixed-column PDB parser (wwPDB format v3.3).
 * Reads ATOM records, HELIX/SHEET secondary-structure records, ligand HETATM records
 * (waters are skipped) and a few header fields.
 */

export interface PdbAtom {
  serial: number;
  name: string;
  resName: string;
  chainId: string;
  resSeq: number;
  x: number;
  y: number;
  z: number;
  bFactor: number;
  element: string;
}

export type SecondaryStructureKind = "helix" | "helix310" | "strand";

export interface SecondaryStructureRecord {
  kind: SecondaryStructureKind;
  chainId: string;
  start: number;
  end: number;
}

export interface PdbStructure {
  idCode: string;
  classification: string;
  /** First MOLECULE name from the COMPND records, e.g. "UBIQUITIN" */
  molecule: string;
  resolution: number | null;
  method: string;
  atoms: PdbAtom[];
  /** Non-water HETATM records (bound ligands and ions) */
  hetAtoms: PdbAtom[];
  /** Primary citation as "Surname et al. (year)", from the JRNL records; empty if unpublished */
  citation: string;
  secondary: SecondaryStructureRecord[];
}

const WATER = new Set(["HOH", "WAT", "DOD", "H2O"]);

const num = (s: string) => Number.parseFloat(s.trim());
const int = (s: string) => Number.parseInt(s.trim(), 10);

export function parsePdb(text: string): PdbStructure {
  const atoms: PdbAtom[] = [];
  const hetAtoms: PdbAtom[] = [];
  let molecule = "";
  let firstAuthor = "";
  let year = "";
  const secondary: SecondaryStructureRecord[] = [];
  let idCode = "";
  let classification = "";
  let resolution: number | null = null;
  let method = "";
  let firstModelDone = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.padEnd(80, " ");
    const record = line.slice(0, 6);

    if (record === "HEADER") {
      classification = line.slice(10, 50).trim();
      idCode = line.slice(62, 66).trim();
    } else if (record === "COMPND" && !molecule) {
      const m = /MOLECULE:\s*([^;]+)/.exec(line);
      if (m) molecule = m[1].trim();
    } else if (record === "JRNL  " && line.slice(12, 16) === "AUTH" && !firstAuthor) {
      const first = line.slice(19).split(",")[0].trim(); // e.g. "R.RAMAGE"
      const surname = first.split(".").pop() ?? "";
      firstAuthor = surname.charAt(0) + surname.slice(1).toLowerCase();
    } else if (record === "JRNL  " && line.slice(12, 15) === "REF" && !year) {
      const m = /(\d{4})\s*$/.exec(line.slice(19, 67));
      if (m) year = m[1];
    } else if (record === "EXPDTA") {
      method = line.slice(10).trim();
    } else if (record === "REMARK" && line.slice(6, 10).trim() === "2") {
      const m = /RESOLUTION\.\s+([\d.]+)/.exec(line);
      if (m) resolution = Number.parseFloat(m[1]);
    } else if (record === "HELIX ") {
      // helixClass 1 = right-handed alpha, 5 = right-handed 3-10
      const helixClass = int(line.slice(38, 40));
      secondary.push({
        kind: helixClass === 5 ? "helix310" : "helix",
        chainId: line[19],
        start: int(line.slice(21, 25)),
        end: int(line.slice(33, 37)),
      });
    } else if (record === "SHEET ") {
      secondary.push({
        kind: "strand",
        chainId: line[21],
        start: int(line.slice(22, 26)),
        end: int(line.slice(33, 37)),
      });
    } else if (record === "ENDMDL") {
      firstModelDone = true;
    } else if ((record === "ATOM  " || record === "HETATM") && !firstModelDone) {
      const altLoc = line[16];
      if (altLoc !== " " && altLoc !== "A") continue; // keep the first alternate location only
      const name = line.slice(12, 16).trim();
      const resName = line.slice(17, 20).trim();
      if (record === "HETATM" && WATER.has(resName)) continue;
      const elementField = line.slice(76, 78).trim();
      const target = record === "ATOM  " ? atoms : hetAtoms;
      target.push({
        serial: int(line.slice(6, 11)),
        name,
        resName,
        chainId: line[21],
        resSeq: int(line.slice(22, 26)),
        x: num(line.slice(30, 38)),
        y: num(line.slice(38, 46)),
        z: num(line.slice(46, 54)),
        bFactor: num(line.slice(60, 66)) || 0,
        element: (elementField || name.replace(/[^A-Za-z]/g, "").charAt(0)).toUpperCase(),
      });
    }
  }

  const citation = firstAuthor ? `${firstAuthor} et al.${year ? ` (${year})` : ""}` : "";
  return { idCode, classification, molecule, resolution, method, atoms, hetAtoms, citation, secondary };
}
