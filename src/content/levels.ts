import type { Level } from "@/store/explorerStore";

export interface LevelMeta {
  id: Level;
  numeral: string;
  name: string;
  /** Real-world size of one scene unit, or null for schematic (not-to-scale) levels */
  metersPerUnit: number | null;
  /** Shown instead of a scale bar on schematic levels */
  schematicNote?: string;
}

export const LEVELS: LevelMeta[] = [
  { id: 0, numeral: "I", name: "Protein", metersPerUnit: 1e-10 },
  { id: 1, numeral: "II", name: "Polypeptide Chain", metersPerUnit: 1e-10 },
  { id: 2, numeral: "III", name: "Amino Acid", metersPerUnit: 1e-10 },
  { id: 3, numeral: "IV", name: "Atom", metersPerUnit: null, schematicNote: "Schematic · not to scale" },
  { id: 4, numeral: "V", name: "Subatomic Particles", metersPerUnit: null, schematicNote: "Schematic · ~10⁻¹⁵ m" },
];
