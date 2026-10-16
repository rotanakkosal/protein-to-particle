/**
 * Element data for the atoms that occur in proteins (H, C, N, O, S).
 * Colours follow the standard CPK/Jmol convention (slightly softened for the light theme).
 */

export type ElementSymbol = "H" | "C" | "N" | "O" | "S";

export interface OrbitalSpec {
  /** Label such as "1s" or "2p" */
  label: string;
  n: number;
  l: 0 | 1;
  electrons: number;
  /** Clementi–Raimondi Slater-type orbital exponent (1/bohr) */
  zeta: number;
}

export interface ElementInfo {
  symbol: ElementSymbol;
  name: string;
  /** Atomic number = number of protons */
  Z: number;
  /** Mass number of the most abundant stable isotope */
  massNumber: number;
  isotopeName: string;
  isotopeSymbol: string;
  /** Natural abundance of that isotope (percent) */
  abundance: number;
  /** Electrons per Bohr shell for the neutral atom */
  shells: number[];
  configuration: string;
  /** Typical number of covalent bonds in biomolecules */
  typicalBonds: number;
  color: string;
  /** Ball radius used in ball-and-stick rendering (Å) */
  ballRadius: number;
  /** Covalent radius (pm) */
  covalentRadiusPm: number;
  orbitals: OrbitalSpec[];
}

export const ELEMENTS: Record<ElementSymbol, ElementInfo> = {
  H: {
    symbol: "H",
    name: "Hydrogen",
    Z: 1,
    massNumber: 1,
    isotopeName: "hydrogen-1",
    isotopeSymbol: "¹H",
    abundance: 99.98,
    shells: [1],
    configuration: "1s¹",
    typicalBonds: 1,
    color: "#F2F1EC",
    ballRadius: 0.27,
    covalentRadiusPm: 31,
    orbitals: [{ label: "1s", n: 1, l: 0, electrons: 1, zeta: 1.0 }],
  },
  C: {
    symbol: "C",
    name: "Carbon",
    Z: 6,
    massNumber: 12,
    isotopeName: "carbon-12",
    isotopeSymbol: "¹²C",
    abundance: 98.9,
    shells: [2, 4],
    configuration: "1s² 2s² 2p²",
    typicalBonds: 4,
    color: "#5E6168",
    ballRadius: 0.42,
    covalentRadiusPm: 76,
    orbitals: [
      { label: "1s", n: 1, l: 0, electrons: 2, zeta: 5.6727 },
      { label: "2s", n: 2, l: 0, electrons: 2, zeta: 1.6083 },
      { label: "2p", n: 2, l: 1, electrons: 2, zeta: 1.5679 },
    ],
  },
  N: {
    symbol: "N",
    name: "Nitrogen",
    Z: 7,
    massNumber: 14,
    isotopeName: "nitrogen-14",
    isotopeSymbol: "¹⁴N",
    abundance: 99.6,
    shells: [2, 5],
    configuration: "1s² 2s² 2p³",
    typicalBonds: 3,
    color: "#3D5FD9",
    ballRadius: 0.4,
    covalentRadiusPm: 71,
    orbitals: [
      { label: "1s", n: 1, l: 0, electrons: 2, zeta: 6.6651 },
      { label: "2s", n: 2, l: 0, electrons: 2, zeta: 1.9237 },
      { label: "2p", n: 2, l: 1, electrons: 3, zeta: 1.917 },
    ],
  },
  O: {
    symbol: "O",
    name: "Oxygen",
    Z: 8,
    massNumber: 16,
    isotopeName: "oxygen-16",
    isotopeSymbol: "¹⁶O",
    abundance: 99.76,
    shells: [2, 6],
    configuration: "1s² 2s² 2p⁴",
    typicalBonds: 2,
    color: "#E0413A",
    ballRadius: 0.4,
    covalentRadiusPm: 66,
    orbitals: [
      { label: "1s", n: 1, l: 0, electrons: 2, zeta: 7.6579 },
      { label: "2s", n: 2, l: 0, electrons: 2, zeta: 2.2458 },
      { label: "2p", n: 2, l: 1, electrons: 4, zeta: 2.2266 },
    ],
  },
  S: {
    symbol: "S",
    name: "Sulfur",
    Z: 16,
    massNumber: 32,
    isotopeName: "sulfur-32",
    isotopeSymbol: "³²S",
    abundance: 94.99,
    shells: [2, 8, 6],
    configuration: "1s² 2s² 2p⁶ 3s² 3p⁴",
    typicalBonds: 2,
    color: "#E2B93B",
    ballRadius: 0.55,
    covalentRadiusPm: 105,
    orbitals: [
      { label: "1s", n: 1, l: 0, electrons: 2, zeta: 15.5409 },
      { label: "2s", n: 2, l: 0, electrons: 2, zeta: 5.3144 },
      { label: "2p", n: 2, l: 1, electrons: 6, zeta: 5.9885 },
      { label: "3s", n: 3, l: 0, electrons: 2, zeta: 2.1223 },
      { label: "3p", n: 3, l: 1, electrons: 4, zeta: 1.8273 },
    ],
  },
};

export function isElementSymbol(s: string): s is ElementSymbol {
  return s === "H" || s === "C" || s === "N" || s === "O" || s === "S";
}

/** Ideal X–H bond lengths (Å) used when placing hydrogens. */
export const X_H_BOND_LENGTH: Record<ElementSymbol, number> = {
  H: 0.74,
  C: 1.09,
  N: 1.01,
  O: 0.96,
  S: 1.34,
};
