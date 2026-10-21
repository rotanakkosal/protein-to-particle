import type { InfoContent, InfoSection } from "./info";
import type { ProteinModel } from "@/lib/structure/protein";
import type { Mode } from "@/store/explorerStore";

/**
 * The proteins the explorer can open. Coordinates are real PDB entries bundled in public/pdb
 * (with an optional download fallback for local development). Everything that depends on the
 * file itself (residue range, resolution, ligands, mass) is computed from the loaded model.
 */

export type ProteinId = "ubiquitin" | "kras";

export interface SiteSpec {
  label: string;
  start: number;
  end: number;
}

export interface Hotspot {
  seq: number;
  resName: string;
  /** Short mutation-style name, e.g. "G12" */
  label: string;
}

export interface ResidueNote {
  beginner: string;
  scientific: string;
}

export interface ProteinEntry {
  id: ProteinId;
  name: string;
  pdbId: string;
  /** Bundled copy (relative URL so the app also works under a sub-path) */
  file: string;
  /** Used only when the bundled copy is missing */
  remoteUrl: string;
  chainId: string;
  /** Modelled amino acids in the bundled file, shown in the switcher before the file has loaded */
  residueCount: number;
  /** Residue number the tour starts on (a glycine in both proteins) */
  defaultResidueSeq: number;
  /** Functional sites labelled on the Level I model */
  sites: SiteSpec[];
  /** Disease hotspots that can be highlighted on Levels I and II (their text comes from residueNote) */
  hotspots?: Hotspot[];
  /** Static citation; when empty the JRNL record of the file is used */
  citation?: string;
  tail: ResidueNote;
  levelOne: (m: ProteinModel, mode: Mode) => InfoContent;
  chainExamples: ResidueNote & { scientificExtra: string };
  residueNote: (seq: number, resName: string) => ResidueNote | null;
}

const sections = (made: string[], example: string[], why: string[]): InfoSection[] => [
  { id: "made", label: "Made of", body: made },
  { id: "example", label: "Example", body: example },
  { id: "why", label: "Why it matters", body: why },
];

const nm = (m: ProteinModel) => `about ${(m.maxDimension / 10).toFixed(1)} nm`;
const dataLine = (m: ProteinModel, e: ProteinEntry) => {
  const citation = e.citation ?? m.citation;
  return `PDB ${m.idCode || e.pdbId}${citation ? ` (${citation})` : ""}`;
};

/* ------------------------------------------------------------------ ligands */

export const LIGAND_INFO: Record<string, { name: string; beginner: string; scientific: string }> = {
  GDP: {
    name: "GDP",
    beginner: "GDP (guanosine diphosphate). While KRAS holds GDP, the switch is OFF.",
    scientific: "Guanosine 5′-diphosphate: the inactive-state nucleotide; its β-phosphate is gripped by the P-loop.",
  },
  GTP: {
    name: "GTP",
    beginner: "GTP (guanosine triphosphate). While KRAS holds GTP, the switch is ON.",
    scientific: "Guanosine 5′-triphosphate: the active-state nucleotide, hydrolysed to GDP + Pᵢ.",
  },
  GNP: {
    name: "GppNHp",
    beginner: "A lab-made copy of GTP that cannot be split, used to freeze KRAS in its ON state.",
    scientific: "Phosphoaminophosphonic acid-guanylate ester (GppNHp), a non-hydrolysable GTP analogue.",
  },
  GCP: {
    name: "GppCp",
    beginner: "A lab-made copy of GTP that cannot be split.",
    scientific: "Phosphomethylphosphonic acid guanylate ester, a non-hydrolysable GTP analogue.",
  },
  MG: {
    name: "Mg²⁺",
    beginner: "A magnesium ion that helps hold the nucleotide's phosphate groups in place.",
    scientific: "Mg²⁺ cofactor, coordinated by the β-phosphate and Ser17 (and by Thr35 in the GTP state).",
  },
};

/* ------------------------------------------------------------------ ubiquitin */

const ubiquitin: ProteinEntry = {
  id: "ubiquitin",
  name: "Ubiquitin",
  pdbId: "1UBI",
  file: "pdb/1UBI.pdb",
  remoteUrl: "https://files.rcsb.org/download/1UBI.pdb",
  chainId: "A",
  residueCount: 76,
  defaultResidueSeq: 10,
  citation: "Ramage et al., Biochem. J. 299:151, 1994",
  sites: [{ label: "Lys48 · chain-link site", start: 48, end: 48 }],
  tail: {
    beginner: "The flexible end of the chain. Cells attach its last amino acid to other proteins.",
    scientific: "Flexible C-terminal tail ending in Gly75–Gly76, the conjugation site.",
  },
  levelOne: (m, mode) => {
    if (mode === "beginner") {
      return {
        title: "Ubiquitin",
        subtitle: "A protein: a large biological molecule",
        summary:
          "A protein is a large biological molecule made of amino acids connected together. Proteins perform important jobs inside living things. This one, ubiquitin, is found in almost every cell of your body.",
        facts: [
          { label: "Amino acids", value: `${m.residues.length}` },
          { label: "Atoms (not counting H)", value: `${m.heavyAtomCount}` },
          { label: "Size", value: nm(m) },
        ],
        sections: sections(
          [
            `It is one long chain of ${m.residues.length} amino acids that has folded into a compact 3D shape.`,
            "The coloured shapes are all parts of that single chain: spirals are helices, flat arrows are sheets and thin tubes are loops.",
          ],
          [
            "Ubiquitin works like a “recycle me” tag. Cells attach it to old or damaged proteins so the cell's recycling machine (the proteasome) can break them down and reuse their parts.",
          ],
          [
            "A protein's shape decides its job. Proteins digest food (enzymes), fight germs (antibodies), carry oxygen (hemoglobin) and build hair and skin (keratin and collagen).",
            "Ubiquitin is so important that its sequence is almost the same in people, yeast and plants.",
          ],
        ),
        relation: { up: "Proteins work together inside cells to keep you alive.", down: "Zoom in: the protein is one folded polypeptide chain." },
        note: {
          tone: "info",
          title: "How to read this model",
          text: "This ribbon drawing is built from the real atomic positions measured by X-ray crystallography. It traces the path of the chain; individual atoms appear when you zoom in close.",
        },
      };
    }
    return {
      title: `Ubiquitin · PDB ${m.idCode || "1UBI"}`,
      subtitle: `Globular protein · Homo sapiens · ${m.method.toLowerCase()}${m.resolution ? `, ${m.resolution.toFixed(1)} Å` : ""}`,
      summary:
        "Proteins are biological macromolecules: polymers of L-α-amino acids whose sequence encodes a specific three-dimensional fold. Ubiquitin (76 residues, 8.6 kDa) adopts the β-grasp fold: a mixed five-stranded β-sheet packed against an α-helix.",
      facts: [
        { label: "Residues", value: `${m.residues.length}` },
        { label: "Mass", value: `${m.massKDa.toFixed(1)} kDa` },
        { label: "Heavy atoms", value: `${m.heavyAtomCount}` },
        { label: "Max. dimension", value: `${(m.maxDimension / 10).toFixed(1)} nm` },
      ],
      sections: sections(
        [
          "A single polypeptide chain (chain A), Met1–Gly76.",
          "Secondary structure (PDB HELIX/SHEET records): α-helix Ile23–Glu34; 3₁₀-helix Leu56–Tyr59; β-strands 1–7, 10–17, 40–45, 48–50 and 64–72.",
          "A hydrophobic core, plus a surface patch (Leu8, Ile44, Val70) recognised by ubiquitin-binding domains.",
        ],
        [
          "The C-terminal Gly76 is joined to the ε-amino group of a lysine on a target protein (an isopeptide bond) by an E1–E2–E3 enzyme cascade.",
          "Lys48-linked polyubiquitin chains target proteins to the 26S proteasome for degradation; Lys63-linked chains act in DNA repair and signalling.",
        ],
        [
          "Ubiquitin-mediated proteolysis controls protein turnover, the cell cycle, DNA repair and immune signalling. Its discovery was recognised by the 2004 Nobel Prize in Chemistry (Ciechanover, Hershko, Rose).",
          "Human and yeast ubiquitin differ at only 3 of 76 positions, making it one of the most conserved proteins known.",
        ],
      ),
      relation: {
        up: "Quaternary level: proteins assemble into complexes and pathways (e.g. the ubiquitin–proteasome system).",
        down: "Tertiary structure = the folded polypeptide chain.",
      },
      note: {
        tone: "info",
        title: "Representation & data",
        text: `Cartoon computed from backbone coordinates (Cα spline; ribbon orientation from C=O vectors): helices as ribbons, strands as arrows (N→C), coil as tubes. Zoom in to reveal side-chain bonds. Coordinates: ${dataLine(m, ubiquitin)}.`,
      },
    };
  },
  chainExamples: {
    beginner:
      "Think of beads on a necklace. The order of the beads is written in your DNA. Changing a single bead can change the whole protein: in sickle-cell disease, just one amino acid in hemoglobin is different.",
    scientific: "Hydrophobic residues alternate along β-strands, so one face of the sheet packs into the core.",
    scientificExtra: "Human and yeast ubiquitin differ at only 3 of 76 positions (P19S, E24D, A28S).",
  },
  residueNote: (seq, resName) => {
    if (seq === 1 && resName === "MET")
      return {
        beginner: "Met1 is the very first amino acid of the chain.",
        scientific: "Met1 is the N-terminal residue; its α-amino group can also anchor linear (M1-linked) ubiquitin chains.",
      };
    if ((seq === 8 && resName === "LEU") || (seq === 44 && resName === "ILE") || (seq === 70 && resName === "VAL"))
      return {
        beginner: "This amino acid is part of an oily patch on ubiquitin's surface that other proteins grab onto.",
        scientific: "Part of the Ile44 hydrophobic patch (Leu8, Ile44, Val70) recognised by most ubiquitin-binding domains.",
      };
    if (seq === 48 && resName === "LYS")
      return {
        beginner: "When more ubiquitins are chained on here, the protein is sent to be recycled.",
        scientific: "Lys48: K48-linked polyubiquitin is the canonical signal for proteasomal degradation.",
      };
    if (seq === 63 && resName === "LYS")
      return { beginner: "Chains built on this lysine help with DNA repair.", scientific: "Lys63: K63-linked chains act in DNA repair, endocytosis and signalling." };
    if ([6, 11, 27, 29, 33].includes(seq) && resName === "LYS")
      return { beginner: "One of ubiquitin's seven lysines, each of which can anchor another ubiquitin.", scientific: `Lys${seq}: one of seven lysines that can each form a ubiquitin–ubiquitin linkage.` };
    if ((seq === 75 || seq === 76) && resName === "GLY")
      return {
        beginner: "Part of the flexible tail. The last glycine (76) is the part that gets attached to other proteins.",
        scientific: `Gly${seq} in the C-terminal tail; Gly76 forms the isopeptide bond to substrate lysines.`,
      };
    if (seq === 10 && resName === "GLY")
      return {
        beginner: "Gly10 sits in the tight turn where the chain folds back on itself between the first two strands.",
        scientific: "Gly10 closes the tight β-hairpin turn (Leu8–Gly10) between strands 1 and 2.",
      };
    return null;
  },
};

/* ------------------------------------------------------------------ KRAS */

const ligandList = (m: ProteinModel) => m.ligands.map((l) => LIGAND_INFO[l.resName]?.name ?? l.resName);
const hasLigand = (m: ProteinModel, names: string[]) => m.ligands.some((l) => names.includes(l.resName));

const kras: ProteinEntry = {
  id: "kras",
  name: "KRAS",
  pdbId: "4OBE",
  file: "pdb/4OBE.cif",
  remoteUrl: "https://files.rcsb.org/download/4OBE.cif",
  chainId: "A",
  residueCount: 169,
  defaultResidueSeq: 12,
  sites: [
    { label: "P-loop", start: 10, end: 17 },
    { label: "Switch I", start: 30, end: 38 },
    { label: "Switch II", start: 59, end: 76 },
  ],
  // The three classic oncogenic positions, from most to least frequently mutated
  hotspots: [
    { seq: 12, resName: "GLY", label: "G12" },
    { seq: 13, resName: "GLY", label: "G13" },
    { seq: 61, resName: "GLN", label: "Q61" },
  ],
  tail: {
    beginner: "The end of the chain in this model. In the cell, KRAS continues with a flexible tail that anchors it to the cell membrane.",
    scientific: "C-terminal end of the crystallised G-domain; the hypervariable region (residues ~170–188) and its farnesylated Cys185 are absent.",
  },
  levelOne: (m, mode) => {
    const first = m.residues[0];
    const last = m.residues[m.residues.length - 1];
    const ligands = ligandList(m);
    const gdp = hasLigand(m, ["GDP"]);
    const gtpLike = hasLigand(m, ["GTP", "GNP", "GCP"]);
    if (mode === "beginner") {
      return {
        title: "KRAS",
        subtitle: "A protein: a molecular on/off switch for cell growth",
        summary:
          "A protein is a large biological molecule made of amino acids connected together. Proteins perform important jobs inside living things. KRAS works like a light switch inside your cells: it turns ON to tell a cell to grow and divide, then switches itself OFF again.",
        facts: [
          { label: "Amino acids shown", value: `${m.residues.length}` },
          { label: "Atoms (not counting H)", value: `${m.heavyAtomCount}` },
          { label: "Size", value: nm(m) },
        ],
        sections: sections(
          [
            `It is one chain of amino acids folded into a compact shape. This model shows the working part of KRAS (amino acids ${first.seq} to ${last.seq}), which does the switching.`,
            gdp
              ? "The small molecule held in its pocket (balls and sticks) is GDP. While KRAS holds GDP it is switched OFF; when it swaps it for GTP it switches ON."
              : gtpLike
                ? "The small molecule held in its pocket (balls and sticks) is a copy of GTP, which keeps KRAS switched ON."
                : "KRAS switches ON when it holds a small molecule called GTP and OFF when it holds GDP.",
          ],
          [
            "In many cancers KRAS is broken so that it gets stuck in the ON position and keeps telling cells to grow. Changes in KRAS are found in about 9 out of 10 pancreatic cancers.",
          ],
          [
            "For decades KRAS was called “undruggable”. In 2021 the first medicine that blocks one faulty form of KRAS (called G12C) was approved, after scientists found a hidden pocket in its shape.",
            "Its most often changed amino acid is glycine 12, the first stop when you zoom in.",
          ],
        ),
        relation: {
          up: "KRAS passes messages inside cells, from growth signals at the cell surface toward the nucleus.",
          down: "Zoom in: KRAS is one folded polypeptide chain.",
        },
        note: {
          tone: "info",
          title: "How to read this model",
          text: "This ribbon drawing is built from the real atomic positions measured by X-ray crystallography. The pocket molecule is shown as balls and sticks. Individual protein atoms appear when you zoom in close.",
        },
      };
    }
    return {
      title: `KRAS · PDB ${m.idCode || "4OBE"}`,
      subtitle: `Small GTPase · Homo sapiens · ${m.method.toLowerCase()}${m.resolution ? `, ${m.resolution.toFixed(2)} Å` : ""}`,
      summary: `KRAS is a small GTPase of the RAS superfamily. Its G-domain (residues ${first.seq}–${last.seq} here) adopts the Ras fold: a six-stranded β-sheet flanked by five α-helices that binds GDP or GTP together with a Mg²⁺ ion. GTP-bound KRAS engages effectors such as RAF to drive the RAF–MEK–ERK (MAPK) pathway.`,
      facts: [
        { label: "Residues (modelled)", value: `${first.seq}–${last.seq}` },
        { label: "Mass (G-domain)", value: `${m.massKDa.toFixed(1)} kDa` },
        { label: "Bound", value: ligands.length ? ligands.join(" · ") : "none" },
        { label: "Heavy atoms", value: `${m.heavyAtomCount}` },
      ],
      sections: sections(
        [
          `A single chain (${m.chainId}); the crystallised G-domain covers residues ${first.seq}–${last.seq} of the 188-residue KRAS4B isoform.`,
          "Phosphate-binding P-loop Gly10–Ser17 (GAGGVGKS); switch I (~30–38) and switch II (~59–76) change conformation between the GDP and GTP states; NKxD (116–119) and SAK (145–147) motifs recognise the guanine base.",
          "Ser17 coordinates the Mg²⁺ ion; in the GTP state Thr35 of switch I coordinates it too.",
        ],
        [
          "Oncogenic hotspots G12, G13 and Q61 impair GAP-stimulated GTP hydrolysis (substitutions at Gly12 sterically block the GAP arginine finger), leaving KRAS GTP-bound and signalling.",
          "Covalent KRAS G12C inhibitors sotorasib (approved 2021) and adagrasib (2022) bind the switch-II pocket of GDP-bound KRAS and trap it in the inactive state.",
        ],
        [
          "RAS genes are mutated in roughly a fifth of human cancers, and KRAS accounts for most of them, especially pancreatic, colorectal and lung adenocarcinoma.",
        ],
      ),
      relation: {
        up: "Signalling: membrane-anchored through its C-terminal hypervariable region (not in the crystal), it relays receptor tyrosine kinase signals to RAF–MEK–ERK.",
        down: "Tertiary structure = the folded polypeptide chain.",
      },
      note: {
        tone: "info",
        title: "Representation & data",
        text: `Cartoon computed from backbone coordinates (Cα spline; ribbon orientation from C=O vectors). Bound ligands are drawn as ball-and-stick, with bonds inferred from interatomic distances. Coordinates: ${dataLine(m, kras)}.`,
      },
    };
  },
  chainExamples: {
    beginner:
      "Changing a single bead can change everything. Swapping glycine 12 for another amino acid (for example G12D or G12C) jams the KRAS switch in the ON position.",
    scientific: "Hotspot residues Gly12 and Gly13 sit in the P-loop; Gln61 sits in switch II.",
    scientificExtra: "KRAS, HRAS and NRAS share about 90% sequence identity across the G-domain; they differ mainly in the hypervariable region.",
  },
  residueNote: (seq, resName) => {
    if (seq === 12 && resName === "GLY")
      return {
        beginner:
          "Gly12 is the most frequently changed amino acid in KRAS in cancer. Replacing this tiny glycine (for example G12D, G12V or G12C) stops KRAS from switching itself OFF.",
        scientific:
          "Gly12 (P-loop). Any side chain here sterically blocks the arginine finger of GTPase-activating proteins and impairs GTP hydrolysis; G12D, G12V and G12C are the commonest oncogenic variants.",
      };
    if (seq === 13 && resName === "GLY")
      return { beginner: "Gly13 is the second most often changed spot in this loop (G13D).", scientific: "Gly13 (P-loop), the second glycine hotspot (e.g. G13D)." };
    if (seq === 61 && resName === "GLN")
      return {
        beginner: "Gln61 helps KRAS switch itself OFF. When it is changed (for example Q61H), KRAS stays ON.",
        scientific: "Gln61 (switch II) positions the catalytic water for GTP hydrolysis; Q61 substitutions are oncogenic.",
      };
    if (seq === 17 && resName === "SER")
      return { beginner: "Ser17 holds the magnesium ion in the pocket.", scientific: "Ser17 (P-loop) coordinates the Mg²⁺ ion." };
    if (seq === 35 && resName === "THR")
      return { beginner: "Thr35 reaches into the pocket when KRAS is ON.", scientific: "Thr35 (switch I) coordinates Mg²⁺ and contacts the γ-phosphate in the GTP state." };
    if (seq >= 10 && seq <= 17)
      return { beginner: "Part of the P-loop, which grips the phosphate groups of GDP or GTP.", scientific: "P-loop (Gly10–Ser17, GxxxxGKS motif), binding the nucleotide phosphates." };
    if (seq >= 30 && seq <= 38)
      return { beginner: "Part of switch I, which changes shape between OFF and ON.", scientific: "Switch I (~30–38), which reorganises on GTP binding to contact effectors such as RAF." };
    if (seq >= 59 && seq <= 76)
      return {
        beginner: "Part of switch II, which changes shape between OFF and ON. Medicines such as sotorasib fit into a pocket beneath it.",
        scientific: "Switch II (~59–76); the switch-II pocket beneath it is the binding site of covalent G12C inhibitors.",
      };
    if (seq >= 116 && seq <= 119)
      return { beginner: "Part of a small loop that recognises the G (guanine) part of GDP and GTP.", scientific: "NKxD motif (Asn116–Asp119), recognising the guanine base." };
    if (seq >= 145 && seq <= 147)
      return { beginner: "Part of a loop that also holds the guanine part of GDP and GTP.", scientific: "SAK motif (Ser145–Lys147), stabilising guanine binding." };
    return null;
  },
};

export const PROTEINS: Record<ProteinId, ProteinEntry> = { ubiquitin, kras };
export const PROTEIN_ORDER: ProteinId[] = ["ubiquitin", "kras"];

/** Hotspots of a protein that exist in the loaded model, as residue indices with their notes. */
export function hotspotsIn(protein: ProteinModel, id: ProteinId) {
  const entry = PROTEINS[id];
  return (entry.hotspots ?? []).flatMap((h) => {
    const index = protein.residues.findIndex((r) => r.seq === h.seq && r.resName === h.resName);
    const note = entry.residueNote(h.seq, h.resName);
    return index >= 0 && note ? [{ ...h, index, note }] : [];
  });
}
