/**
 * Reference data for the 20 standard amino acids.
 * Formulas and molar masses are for the free (un-ionised) amino acid.
 */

export type AminoAcidClass = "nonpolar" | "polar" | "acidic" | "basic" | "glycine";

export interface AminoAcidInfo {
  three: string;
  one: string;
  name: string;
  cls: AminoAcidClass;
  formula: string;
  /** Formula of the residue inside a chain (free formula minus H₂O) */
  residueFormula: string;
  molarMass: number;
  sideChainBeginner: string;
  sideChainScientific: string;
  example: string;
}

export const AMINO_ACIDS: Record<string, AminoAcidInfo> = {
  GLY: {
    three: "Gly", one: "G", name: "Glycine", cls: "glycine",
    formula: "C₂H₅NO₂", residueFormula: "C₂H₃NO", molarMass: 75.07,
    sideChainBeginner: "Glycine is the smallest amino acid: its side group is just a single hydrogen atom. That makes it very flexible, so it often sits where the chain needs to bend.",
    sideChainScientific: "R = H. Glycine is the only achiral standard amino acid (Cα carries two hydrogens). It has the widest allowed range of backbone φ/ψ angles, so it is common in tight turns.",
    example: "About one in every three amino acids in collagen (the protein that makes skin and tendons strong) is glycine.",
  },
  ALA: {
    three: "Ala", one: "A", name: "Alanine", cls: "nonpolar",
    formula: "C₃H₇NO₂", residueFormula: "C₃H₅NO", molarMass: 89.09,
    sideChainBeginner: "Alanine's side group is a small methyl group (one carbon with three hydrogens). It avoids water and helps form helices.",
    sideChainScientific: "R = –CH₃. Small, non-polar and a strong α-helix former.",
    example: "Alanine is one of the most common amino acids in proteins and is easily made by your own cells.",
  },
  VAL: {
    three: "Val", one: "V", name: "Valine", cls: "nonpolar",
    formula: "C₅H₁₁NO₂", residueFormula: "C₅H₉NO", molarMass: 117.15,
    sideChainBeginner: "Valine has a branched, oily side group that avoids water, so it usually hides inside the folded protein.",
    sideChainScientific: "R = –CH(CH₃)₂. β-branched, hydrophobic; favours β-strands.",
    example: "Valine is an essential amino acid: your body cannot make it, so it must come from food.",
  },
  LEU: {
    three: "Leu", one: "L", name: "Leucine", cls: "nonpolar",
    formula: "C₆H₁₃NO₂", residueFormula: "C₆H₁₁NO", molarMass: 131.17,
    sideChainBeginner: "Leucine has a larger oily side group. Oily side groups cluster together in the protein's core, away from water.",
    sideChainScientific: "R = –CH₂CH(CH₃)₂. Hydrophobic and a strong α-helix former; one of the commonest residues in protein cores.",
    example: "Leucine is essential in the diet and signals muscles to build new protein.",
  },
  ILE: {
    three: "Ile", one: "I", name: "Isoleucine", cls: "nonpolar",
    formula: "C₆H₁₃NO₂", residueFormula: "C₆H₁₁NO", molarMass: 131.17,
    sideChainBeginner: "Isoleucine has a branched, oily side group with the same atoms as leucine, arranged differently.",
    sideChainScientific: "R = –CH(CH₃)CH₂CH₃. β-branched and hydrophobic, with a second chiral centre at Cβ.",
    example: "Isoleucine is one of the three 'branched-chain' amino acids found in sports supplements.",
  },
  MET: {
    three: "Met", one: "M", name: "Methionine", cls: "nonpolar",
    formula: "C₅H₁₁NO₂S", residueFormula: "C₅H₉NOS", molarMass: 149.21,
    sideChainBeginner: "Methionine contains a sulfur atom. It is usually the first amino acid when a cell starts building a protein.",
    sideChainScientific: "R = –CH₂CH₂SCH₃ (thioether). Encoded by the AUG start codon, so it begins most newly made proteins.",
    example: "Eggs, fish and sesame seeds are rich sources of methionine.",
  },
  PHE: {
    three: "Phe", one: "F", name: "Phenylalanine", cls: "nonpolar",
    formula: "C₉H₁₁NO₂", residueFormula: "C₉H₉NO", molarMass: 165.19,
    sideChainBeginner: "Phenylalanine has a flat ring of six carbon atoms in its side group.",
    sideChainScientific: "R = –CH₂–C₆H₅ (benzyl). Aromatic and hydrophobic; stacks with other rings.",
    example: "Diet drinks warn about phenylalanine because people with the condition PKU cannot break it down.",
  },
  TRP: {
    three: "Trp", one: "W", name: "Tryptophan", cls: "nonpolar",
    formula: "C₁₁H₁₂N₂O₂", residueFormula: "C₁₁H₁₀N₂O", molarMass: 204.23,
    sideChainBeginner: "Tryptophan has the biggest side group: a double ring containing nitrogen.",
    sideChainScientific: "R = –CH₂–indole. Largest aromatic side chain; its fluorescence is used to study protein folding.",
    example: "Your body uses tryptophan to make serotonin, a chemical messenger in the brain.",
  },
  PRO: {
    three: "Pro", one: "P", name: "Proline", cls: "nonpolar",
    formula: "C₅H₉NO₂", residueFormula: "C₅H₇NO", molarMass: 115.13,
    sideChainBeginner: "Proline's side group loops back and bonds to its own nitrogen, forming a ring. This makes the chain stiff at that spot.",
    sideChainScientific: "Cyclic: the side chain bonds to the backbone N (a secondary amine), fixing φ ≈ −65° and removing the amide H, so Pro breaks helices.",
    example: "Proline is abundant in collagen, where it helps form the triple-helix rope.",
  },
  SER: {
    three: "Ser", one: "S", name: "Serine", cls: "polar",
    formula: "C₃H₇NO₃", residueFormula: "C₃H₅NO₂", molarMass: 105.09,
    sideChainBeginner: "Serine's side group has an –OH (like in alcohol), so it likes water.",
    sideChainScientific: "R = –CH₂OH. Polar hydroxyl; a frequent site of phosphorylation and the nucleophile of serine proteases.",
    example: "Digestive enzymes such as trypsin use a serine to cut other proteins.",
  },
  THR: {
    three: "Thr", one: "T", name: "Threonine", cls: "polar",
    formula: "C₄H₉NO₃", residueFormula: "C₄H₇NO₂", molarMass: 119.12,
    sideChainBeginner: "Threonine has an –OH group and a small carbon group, so it is partly water-loving.",
    sideChainScientific: "R = –CH(OH)CH₃. β-branched, polar; second chiral centre at Cβ.",
    example: "Threonine is an essential amino acid found in dairy products and lentils.",
  },
  CYS: {
    three: "Cys", one: "C", name: "Cysteine", cls: "polar",
    formula: "C₃H₇NO₂S", residueFormula: "C₃H₅NOS", molarMass: 121.16,
    sideChainBeginner: "Cysteine contains sulfur. Two cysteines can link together like a staple to hold a protein's shape.",
    sideChainScientific: "R = –CH₂SH (thiol, pKa ≈ 8.3). Can form disulfide bonds (–S–S–) and is the target of covalent drugs such as KRAS G12C inhibitors.",
    example: "Disulfide 'staples' between cysteines give hair its shape. Perms work by breaking and re-forming them.",
  },
  ASN: {
    three: "Asn", one: "N", name: "Asparagine", cls: "polar",
    formula: "C₄H₈N₂O₃", residueFormula: "C₄H₆N₂O₂", molarMass: 132.12,
    sideChainBeginner: "Asparagine's side group contains nitrogen and oxygen and readily forms hydrogen bonds with water.",
    sideChainScientific: "R = –CH₂CONH₂ (carboxamide). Polar, uncharged; common in turns and a site of N-linked glycosylation.",
    example: "Asparagine was the first amino acid ever discovered. It was isolated from asparagus juice in 1806.",
  },
  GLN: {
    three: "Gln", one: "Q", name: "Glutamine", cls: "polar",
    formula: "C₅H₁₀N₂O₃", residueFormula: "C₅H₈N₂O₂", molarMass: 146.15,
    sideChainBeginner: "Glutamine has a slightly longer water-loving side group than asparagine.",
    sideChainScientific: "R = –CH₂CH₂CONH₂. Polar carboxamide; a major nitrogen carrier in blood.",
    example: "Glutamine is the most abundant free amino acid in human blood.",
  },
  TYR: {
    three: "Tyr", one: "Y", name: "Tyrosine", cls: "polar",
    formula: "C₉H₁₁NO₃", residueFormula: "C₉H₉NO₂", molarMass: 181.19,
    sideChainBeginner: "Tyrosine has a carbon ring with an –OH group at its tip.",
    sideChainScientific: "R = –CH₂–C₆H₄–OH (phenol). Aromatic and weakly polar; a target of tyrosine kinases.",
    example: "Your body makes adrenaline and the skin pigment melanin from tyrosine.",
  },
  ASP: {
    three: "Asp", one: "D", name: "Aspartic acid", cls: "acidic",
    formula: "C₄H₇NO₄", residueFormula: "C₄H₅NO₃", molarMass: 133.1,
    sideChainBeginner: "Aspartic acid has an acidic side group that carries a negative charge inside the body.",
    sideChainScientific: "R = –CH₂COOH (pKa ≈ 3.9), deprotonated to –CH₂COO⁻ (aspartate) at pH 7.",
    example: "The sweetener aspartame is made from aspartic acid and phenylalanine.",
  },
  GLU: {
    three: "Glu", one: "E", name: "Glutamic acid", cls: "acidic",
    formula: "C₅H₉NO₄", residueFormula: "C₅H₇NO₃", molarMass: 147.13,
    sideChainBeginner: "Glutamic acid has an acidic, negatively charged side group.",
    sideChainScientific: "R = –CH₂CH₂COOH (pKa ≈ 4.1), present as glutamate (–COO⁻) at pH 7.",
    example: "Glutamate gives food its savoury 'umami' taste (as in MSG) and is the brain's main excitatory messenger.",
  },
  LYS: {
    three: "Lys", one: "K", name: "Lysine", cls: "basic",
    formula: "C₆H₁₄N₂O₂", residueFormula: "C₆H₁₂N₂O", molarMass: 146.19,
    sideChainBeginner: "Lysine has a long side group ending in an amino group that carries a positive charge.",
    sideChainScientific: "R = –(CH₂)₄NH₃⁺ (pKa ≈ 10.5). Lysine ε-amino groups are common sites of chemical tags, including ubiquitin itself.",
    example: "Lysine chains on ubiquitin act like a 'recycle' tag: K48-linked chains send proteins to the cell's shredder.",
  },
  ARG: {
    three: "Arg", one: "R", name: "Arginine", cls: "basic",
    formula: "C₆H₁₄N₄O₂", residueFormula: "C₆H₁₂N₄O", molarMass: 174.2,
    sideChainBeginner: "Arginine has a long side group with several nitrogen atoms and a positive charge.",
    sideChainScientific: "R = –(CH₂)₃NH–C(=NH₂⁺)NH₂ (guanidinium, pKa ≈ 12.5); charge is delocalised over three nitrogens.",
    example: "Your body uses arginine to make nitric oxide, which helps blood vessels relax.",
  },
  HIS: {
    three: "His", one: "H", name: "Histidine", cls: "basic",
    formula: "C₆H₉N₃O₂", residueFormula: "C₆H₇N₃O", molarMass: 155.16,
    sideChainBeginner: "Histidine has a ring containing two nitrogen atoms; it can pick up or drop a hydrogen easily.",
    sideChainScientific: "R = –CH₂–imidazole (pKa ≈ 6.0), so it switches charge near physiological pH. Shown here as the neutral Nε2-H tautomer.",
    example: "Many enzymes use histidine to pass protons (H⁺) back and forth during reactions.",
  },
};

export const ONE_LETTER: Record<string, string> = Object.fromEntries(
  Object.entries(AMINO_ACIDS).map(([k, v]) => [k, v.one]),
);

export const AA_CLASS_INFO: Record<AminoAcidClass, { label: string; beginner: string; color: string }> = {
  nonpolar: { label: "Non-polar (water-avoiding)", beginner: "Oily side groups", color: "#E2A44F" },
  polar: { label: "Polar (water-loving)", beginner: "Water-loving side groups", color: "#4FA39B" },
  acidic: { label: "Acidic (negative)", beginner: "Negative charge", color: "#D65A50" },
  basic: { label: "Basic (positive)", beginner: "Positive charge", color: "#4B74D4" },
  glycine: { label: "Glycine (smallest)", beginner: "Glycine", color: "#9783D3" },
};

export function aminoAcid(resName: string): AminoAcidInfo {
  return AMINO_ACIDS[resName] ?? AMINO_ACIDS.GLY;
}
