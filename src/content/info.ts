import { Vector3 } from "three";
import type { ProteinModel, Region } from "@/lib/structure/protein";
import { aaLabel } from "@/lib/structure/protein";
import type { MolAtom, ResidueMolecule } from "@/lib/chem/residueMolecule";
import { ELEMENTS, type ElementInfo, type ElementSymbol } from "@/lib/chem/elements";
import { AA_CLASS_INFO, aminoAcid } from "./aminoAcids";
import { PROTEINS } from "./proteins";
import type { Level, Mode, ParticleKind, Selection } from "@/store/explorerStore";

export interface InfoSection {
  id: "made" | "example" | "why";
  label: string;
  body: string[];
}

export interface InfoContent {
  title: string;
  subtitle: string;
  summary: string;
  /** Protein-specific callout shown under the summary (e.g. a cancer hotspot) */
  highlight?: string;
  facts: { label: string; value: string }[];
  sections: InfoSection[];
  relation: { up: string | null; down: string | null };
  note: { title: string; text: string; tone: "info" | "warning" };
}

export interface InfoContext {
  protein: ProteinModel;
  molecule: ResidueMolecule;
  selection: Selection;
  mode: Mode;
  aminoAcidForm: "residue" | "free";
  atomView: "orbits" | "cloud";
}

const sections = (made: string[], example: string[], why: string[]): InfoSection[] => [
  { id: "made", label: "Made of", body: made },
  { id: "example", label: "Example", body: example },
  { id: "why", label: "Why it matters", body: why },
];

/* ------------------------------------------------------------------ helpers */

function dihedral(a: Vector3, b: Vector3, c: Vector3, d: Vector3): number {
  const b0 = a.clone().sub(b);
  const b1 = c.clone().sub(b).normalize();
  const b2 = d.clone().sub(c);
  const v = b0.sub(b1.clone().multiplyScalar(b0.dot(b1)));
  const w = b2.sub(b1.clone().multiplyScalar(b2.dot(b1)));
  const x = v.dot(w);
  const y = b1.clone().cross(v).dot(w);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function phiPsi(protein: ProteinModel, i: number): { phi: number | null; psi: number | null } {
  const r = protein.residues[i];
  const prev = protein.residues[i - 1];
  const next = protein.residues[i + 1];
  const phi = prev?.atoms.C ? dihedral(prev.atoms.C, r.atoms.N, r.atoms.CA, r.atoms.C) : null;
  const psi = next?.atoms.N ? dihedral(r.atoms.N, r.atoms.CA, r.atoms.C, next.atoms.N) : null;
  return { phi, psi };
}

const deg = (x: number | null) => (x == null ? "n/a" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}°`);

function bondLength(m: ResidueMolecule, a: string, b: string): string {
  const A = m.atomById[a];
  const B = m.atomById[b];
  return A && B ? `${A.position.distanceTo(B.position).toFixed(2)} Å` : "n/a";
}

const chargeSuffix = (q: number) => (q === 0 ? "" : q > 0 ? (q === 1 ? "⁺" : `${q}⁺`) : q === -1 ? "⁻" : `${-q}⁻`);

/** Nucleus-to-atom size comparison: marble (1 cm) scaled up. */
function marbleComparison(el: ElementInfo): string {
  const nuclearRadiusFm = el.Z === 1 ? 0.84 : 1.2 * Math.cbrt(el.massNumber);
  const ratio = (el.covalentRadiusPm * 1000) / nuclearRadiusFm;
  const metres = Math.round(ratio / 100 / 10) * 10;
  return `if the nucleus were a 1 cm marble, the whole atom would be about ${metres} m across`;
}

const ELEMENT_EXAMPLES: Record<ElementSymbol, { beginner: string; scientific: string }> = {
  H: {
    beginner: "Hydrogen is the most common element in the universe, and the Sun is mostly hydrogen. Every water molecule (H₂O) contains two hydrogen atoms.",
    scientific: "Heavier isotopes ²H (deuterium) and ³H (tritium) exist; neutron crystallography uses deuterium to locate hydrogen atoms in proteins, which X-rays barely see.",
  },
  C: {
    beginner: "The carbon in your body is the same kind found in pencil “lead” (graphite) and in diamonds. Only the arrangement of the atoms differs.",
    scientific: "¹²C defines the atomic mass unit (1 u = 1/12 of the mass of a ¹²C atom). Trace ¹⁴C (half-life ≈ 5,730 years) is the basis of radiocarbon dating.",
  },
  N: {
    beginner: "Nitrogen makes up about 78% of the air you breathe. Every amino acid contains at least one nitrogen atom.",
    scientific: "The rare stable isotope ¹⁵N (0.4%) is used to label proteins for NMR structure determination.",
  },
  O: {
    beginner: "Oxygen is the gas you breathe, and most of your body's mass is oxygen, mainly in water.",
    scientific: "¹⁸O/¹⁶O ratios preserved in ice cores and shells are used to reconstruct past climates.",
  },
  S: {
    beginner: "Sulfur gives garlic and onions their sharp smell. In proteins it is found in methionine and cysteine.",
    scientific: "Radioactive ³⁵S labelled viral protein in the 1952 Hershey–Chase experiment, which showed that genes are made of DNA, not protein.",
  },
};

/* ------------------------------------------------------------------ atom roles */

export function atomRole(m: ResidueMolecule, a: MolAtom, form: "residue" | "free"): { beginner: string; scientific: string } {
  const name = a.name;
  const free = form === "free";
  if (a.context) {
    const roles: Record<string, string> = { CA: "alpha carbon", C: "carbonyl carbon", O: "carbonyl oxygen", N: "amide nitrogen", H: "amide hydrogen" };
    return { beginner: roles[name] ?? "atom", scientific: roles[name] ?? "atom" };
  }
  switch (name) {
    case "N":
      return free || m.isNTerminal
        ? { beginner: "nitrogen of the amino group", scientific: "α-amino nitrogen" }
        : { beginner: "backbone nitrogen (joins the previous amino acid)", scientific: "amide nitrogen (peptide bond to the previous residue)" };
    case "CA":
      return { beginner: "alpha carbon (the central carbon)", scientific: "α-carbon (stereocentre in all but Gly)" };
    case "C":
      return { beginner: "backbone carbon (joins the next amino acid)", scientific: free ? "carboxyl carbon" : "carbonyl carbon (peptide bond to the next residue)" };
    case "O":
      return { beginner: "oxygen double-bonded to carbon", scientific: "carbonyl oxygen (C=O)" };
    case "OXT":
      return free
        ? { beginner: "oxygen of the –OH group (leaves as water)", scientific: "hydroxyl oxygen of –COOH" }
        : { beginner: "end oxygen of the chain", scientific: "C-terminal carboxylate oxygen" };
    case "HXT":
      return { beginner: "hydrogen of the –OH group (leaves as water)", scientific: "carboxylic acid hydrogen" };
  }
  if (a.isHydrogen && a.parent === "N") {
    return a.leaving
      ? { beginner: "amino hydrogen (leaves as water)", scientific: "amino H lost on peptide-bond formation" }
      : { beginner: "hydrogen on the nitrogen", scientific: free || m.isNTerminal ? "α-amino hydrogen" : "amide hydrogen (backbone H-bond donor)" };
  }
  if (a.isHydrogen && a.parent === "CA") {
    return a.group === "sidechain"
      ? { beginner: "glycine's whole side group: just one hydrogen", scientific: "Hα3, in the Cβ position (R = H)" }
      : { beginner: "hydrogen on the alpha carbon", scientific: "α-hydrogen" };
  }
  if (a.isHydrogen) return { beginner: "hydrogen on the side group", scientific: "side-chain hydrogen" };
  return { beginner: `${ELEMENTS[a.element].name.toLowerCase()} in the side group`, scientific: `side-chain ${ELEMENTS[a.element].name.toLowerCase()} (${a.display})` };
}

/* ------------------------------------------------------------------ hover text */

export function regionHoverText(region: Region, mode: Mode, proteinId: Selection["proteinId"]): { title: string; subtitle: string } {
  const b: Record<Region["kind"], string> = {
    strand: "A stretched-out part of the chain. Strands lie side by side to form a flat sheet.",
    helix: "A part of the chain coiled up like a spring (an α-helix).",
    helix310: "A short, tightly wound coil.",
    loop: "A flexible loop that lets the chain change direction.",
    turn: region.hairpin ? "A sharp turn where the chain folds back on itself." : "A short bend where the chain changes direction.",
    nterm: "The start of the chain (the N-terminus), where the first amino acid sits.",
    tail: PROTEINS[proteinId].tail.beginner,
  };
  const s: Record<Region["kind"], string> = {
    strand: "Extended β-strand, hydrogen-bonded to neighbouring strands of the mixed β-sheet.",
    helix: "α-helix: 3.6 residues/turn, i→i+4 C=O···H–N hydrogen bonds.",
    helix310: "3₁₀-helix: i→i+3 backbone hydrogen bonds.",
    loop: "Irregular coil connecting secondary-structure elements.",
    turn: region.hairpin
      ? "Tight turn reversing chain direction (β-hairpin turn)."
      : "Short coil of one or two residues linking two secondary-structure elements.",
    nterm: "N-terminal residue(s) before the first secondary-structure element; free α-amino group (–NH₃⁺ at pH 7).",
    tail: PROTEINS[proteinId].tail.scientific,
  };
  return { title: region.label, subtitle: mode === "beginner" ? b[region.kind] : s[region.kind] };
}

export function atomHoverText(m: ResidueMolecule, a: MolAtom, mode: Mode, form: "residue" | "free") {
  const el = ELEMENTS[a.element];
  const role = atomRole(m, a, form)[mode];
  if (a.context) {
    return {
      title: `${a.display} of ${a.context.residueLabel}`,
      subtitle: `${el.name} (${el.symbol}) · part of the ${a.context.relation} amino acid in the chain`,
      hint: "Shown faintly for context",
    };
  }
  const neighbors = m.bonds
    .filter((b) => b.a === a.id || b.b === a.id)
    .map((b) => m.atomById[b.a === a.id ? b.b : b.a])
    .filter((n) => (form === "free" ? n.inFree : n.inResidue))
    .map((n) => n.display);
  const leaving = a.leaving && form === "free" ? " · removed as H₂O when a peptide bond forms" : "";
  return {
    title: `${a.display}: ${role}`,
    subtitle: `${el.name} (${el.symbol}) · bonded to ${neighbors.join(", ") || "none"}${leaving}`,
    hint: "Click to zoom into this atom",
  };
}

export function particleHoverText(kind: ParticleKind, el: ElementInfo, mode: Mode, shell?: number) {
  if (kind === "proton")
    return { title: "Proton", subtitle: mode === "beginner" ? `Positive charge (+1) · one of ${el.Z} in this nucleus` : "+1 e · 938.27 MeV/c² · quarks uud" };
  if (kind === "neutron")
    return { title: "Neutron", subtitle: mode === "beginner" ? `No charge (0) · one of ${el.massNumber - el.Z} in this nucleus` : "0 · 939.57 MeV/c² · quarks udd" };
  const where = shell ? `shell ${shell}` : "the electron cloud";
  return { title: "Electron", subtitle: mode === "beginner" ? `Negative charge (−1) · in ${where}` : `−1 e · 0.511 MeV/c² · lepton · ${where}` };
}

/* ------------------------------------------------------------------ breadcrumb */

export function pathLabels(protein: ProteinModel, molecule: ResidueMolecule, sel: Selection): string[] {
  const atom = molecule.atomById[sel.atomId];
  const p = { proton: "Proton", neutron: "Neutron", electron: "Electron" }[sel.particle];
  return [
    PROTEINS[sel.proteinId].name,
    `Chain ${protein.chainId}`,
    aaLabel(protein.residues[sel.residueIndex]),
    `${ELEMENTS[sel.atomElement].name}${atom ? ` · ${atom.display}` : ""}`,
    p,
  ];
}

/* ------------------------------------------------------------------ panels */

export function getInfoContent(level: Level, ctx: InfoContext): InfoContent {
  switch (level) {
    case 0:
      return proteinInfo(ctx);
    case 1:
      return chainInfo(ctx);
    case 2:
      return aminoAcidInfo(ctx);
    case 3:
      return atomInfo(ctx);
    default:
      return particleInfo(ctx);
  }
}

function proteinInfo({ protein, mode, selection }: InfoContext): InfoContent {
  return PROTEINS[selection.proteinId].levelOne(protein, mode);
}

function chainInfo({ protein, mode, selection }: InfoContext): InfoContent {
  const n = protein.residues.length;
  const kinds = new Set(protein.residues.map((r) => r.resName)).size;
  const region = protein.regionById[selection.regionId];
  const focus = region ? ` You zoomed in near ${region.label.split(" · ")[0].toLowerCase()} (${region.label.split(" · ")[1]}).` : "";
  const entry = PROTEINS[selection.proteinId];
  const first = protein.residues[0];
  const last = protein.residues[n - 1];
  const gaps = protein.residues.filter((r) => r.breakBefore).length;
  const bonds = n - 1 - gaps;
  if (mode === "beginner") {
    return {
      title: "Polypeptide Chain",
      subtitle: `The single chain of ${n} amino acids that folds into ${entry.name}`,
      summary: `A polypeptide is a long chain of amino acids connected together. This chain can fold into a specific shape to form a protein. Each bead here is one amino acid.${focus}`,
      facts: [
        { label: "Beads (amino acids)", value: `${n}` },
        { label: "Links (peptide bonds)", value: `${bonds}` },
        { label: "Kinds used", value: `${kinds} of 20` },
      ],
      sections: sections(
        [
          "Amino acids joined end-to-end by peptide bonds (the gold bands).",
          "Every chain has a start (the N-terminus) and an end (the C-terminus), so it has a direction, like a sentence read from left to right.",
        ],
        [entry.chainExamples.beginner],
        [
          "The order of the amino acids (the sequence) decides how the chain folds, and the fold decides what the protein can do.",
          "Press “Unfold chain” to straighten it and see that the protein really is one continuous chain.",
        ],
      ),
      relation: { up: "Folds up into the protein (Level I).", down: "Each bead is one amino acid (Level III)." },
      note: {
        tone: "info",
        title: "Simplified",
        text: "Each bead stands for a whole amino acid (about 10–25 atoms), placed at its real alpha-carbon position. Bead colours show the kind of side group.",
      },
    };
  }
  return {
    title: `Polypeptide chain ${protein.chainId}`,
    subtitle: `${aaLabel(first)} → ${aaLabel(last)} · primary structure`,
    summary: `A polypeptide is a linear polymer of amino-acid residues joined by peptide (amide) bonds between the carbonyl carbon of residue i and the amide nitrogen of residue i+1. Its sequence (primary structure) determines the folded conformation.${focus}`,
    facts: [
      { label: "Residues", value: `${n}` },
      { label: "Peptide bonds", value: `${bonds}` },
      { label: "Cα–Cα (trans)", value: "3.8 Å" },
      { label: "Residue types", value: `${kinds} of 20` },
    ],
    sections: sections(
      [
        "A repeating backbone –N–Cα–C(=O)– with a side chain (R) on each Cα.",
        "The peptide bond has partial double-bond character (resonance), so each C–N unit is planar and almost always trans (ω ≈ 180°). Chain flexibility comes from the φ and ψ torsions around Cα.",
      ],
      [entry.chainExamples.scientific, entry.chainExamples.scientificExtra],
      [
        "Folding is driven mainly by the hydrophobic effect and stabilised by backbone hydrogen bonds (helices, sheets), side-chain packing and salt bridges.",
        "Misfolding and aggregation underlie diseases such as Alzheimer's and Parkinson's.",
      ],
    ),
    relation: { up: "Tertiary structure: the folded chain (Level I).", down: "Monomer unit: an amino-acid residue (Level III)." },
    note: {
      tone: "info",
      title: "Representation",
      text: `Coarse-grained Cα model: one bead per residue at its experimental Cα position; gold bands mark the midpoint of each real C–N peptide bond. The unfolded layout is schematic.${gaps ? ` ${gaps} gap${gaps > 1 ? "s" : ""} in the chain mark residues not resolved in the crystal.` : ""}`,
    },
  };
}

function aminoAcidInfo({ protein, molecule: m, mode, aminoAcidForm: form, selection }: InfoContext): InfoContent {
  const aa = aminoAcid(m.resName);
  const r = protein.residues[selection.residueIndex];
  const atoms = m.atoms.filter((a) => !a.context && (form === "free" ? a.inFree : a.inResidue));
  const hasS = atoms.some((a) => a.element === "S");
  const formula = form === "free" ? m.formulaFree : `${m.formulaResidue}${chargeSuffix(m.chargeResidue)}`;
  const isGly = m.resName === "GLY";
  const entry = PROTEINS[selection.proteinId];
  const note = entry.residueNote(r.seq, r.resName);
  const lastSeq = protein.residues[protein.residues.length - 1].seq;
  if (mode === "beginner") {
    return {
      highlight: note ? `In ${entry.name}: ${note.beginner}` : undefined,
      title: `${aa.name} (${m.label})`,
      subtitle: form === "free" ? "A free amino acid: a building block before it joins a chain" : "An amino acid: one building block of the chain",
      summary: `An amino acid is a small molecule that acts as a building block of proteins. Amino acids contain atoms such as carbon, hydrogen, oxygen and nitrogen. ${aa.sideChainBeginner}`,
      facts: [
        { label: "Atoms shown", value: `${atoms.length}` },
        { label: "Formula", value: formula },
        { label: "Place in chain", value: `${r.seq} of ${lastSeq}` },
      ],
      sections: sections(
        [
          "Every amino acid has the same core: a central carbon (Cα) holding an amino group (with N), a carboxyl group (C with O), one hydrogen and a side group called R.",
          `Atom colours: carbon grey, hydrogen white, nitrogen blue, oxygen red${hasS ? ", sulfur yellow" : ""}. Sticks are chemical bonds (two sticks = a double bond).`,
        ],
        [aa.example],
        [
          "There are 20 common amino acids. Their different side groups give each protein its unique shape and chemistry.",
          form === "residue"
            ? "Inside a chain an amino acid is called a residue: each time two amino acids join, one water molecule (H₂O) is released. Switch to “Free amino acid” to compare."
            : "The atoms with a blue halo are removed as water (H₂O) when this amino acid joins a chain through a peptide bond.",
        ],
      ),
      relation: { up: "Joined to its neighbours by peptide bonds in the chain (Level II).", down: `Built from atoms. Click ${isGly ? "the central carbon (Cα)" : "a carbon atom"} to zoom in (Level IV).` },
      note: {
        tone: "info",
        title: "About this model",
        text: `Ball-and-stick model of the real ${m.label} from the crystal structure. X-ray structures don't show hydrogen atoms, so hydrogens were added using ideal bond lengths and angles.`,
      },
    };
  }
  const { phi, psi } = phiPsi(protein, selection.residueIndex);
  const heavy = m.atoms.filter((a) => !a.context && !a.isHydrogen && a.inResidue).map((a) => a.display);
  return {
    highlight: note ? `${entry.name}: ${note.scientific}` : undefined,
    title: `${m.label} · ${aa.name}`,
    subtitle: `${aa.three} / ${aa.one} · ${AA_CLASS_INFO[aa.cls].label} · M = ${aa.molarMass.toFixed(2)} g/mol (free acid)`,
    summary: `α-Amino acids share a central α-carbon bonded to an amino group, a carboxyl group, Hα and a side chain R; proteins use the L-enantiomer. ${aa.sideChainScientific}`,
    facts: [
      { label: form === "free" ? "Free amino acid" : "Residue (pH 7)", value: formula },
      { label: "φ / ψ", value: `${deg(phi)} / ${deg(psi)}` },
      { label: "N–Cα · Cα–C", value: `${bondLength(m, "N", "CA")} · ${bondLength(m, "CA", "C")}` },
      { label: "C=O", value: bondLength(m, "C", "O") },
    ],
    sections: sections(
      [
        `Heavy atoms (crystal coordinates): ${heavy.join(", ")}.`,
        form === "residue"
          ? `Residue = free amino acid − H₂O: ${aa.formula} − H₂O → ${aa.residueFormula}${m.chargeResidue ? ` (shown with charge ${m.chargeResidue > 0 ? "+" : "−"}${Math.abs(m.chargeResidue)} at pH 7)` : ""}.`
          : `Neutral free amino acid ${aa.formula}; at pH 7 it exists mainly as the zwitterion H₃N⁺–CH(R)–COO⁻.`,
      ],
      [
        m.prevLabel || m.nextLabel
          ? `Peptide bonds in the chain: ${[m.prevLabel ? `${m.prevLabel} C–N ${m.label}` : null, m.nextLabel ? `${m.label} C–N ${m.nextLabel}` : null].filter(Boolean).join(" and ")}.`
          : "Terminal residue.",
        "Condensation: R₁–COOH + H₂N–R₂ → R₁–CO–NH–R₂ + H₂O (on the ribosome, driven by aminoacyl-tRNA chemistry).",
      ],
      [
        isGly
          ? "With R = H, glycine has no Cβ, so it can adopt φ/ψ combinations forbidden to other residues, which is why it is common in turns and tight packing."
          : `${AA_CLASS_INFO[aa.cls].label} side chains shape the fold through packing, hydrogen bonding and charge.`,
        m.isNTerminal ? "As the N-terminal residue, its amino group is free (–NH₃⁺ at pH 7)." : m.isCTerminal ? "As the C-terminal residue, its carboxylate is free (–COO⁻ at pH 7)." : "Backbone N–H and C=O groups act as hydrogen-bond donor and acceptor in secondary structure.",
      ],
    ),
    relation: { up: "Residue i of the polypeptide (Level II).", down: "Atoms: covalently bonded H, C, N, O (S) nuclei with shared electrons (Level IV)." },
    note: {
      tone: "info",
      title: "Model notes",
      text: "Heavy-atom coordinates from PDB 1UBI. Hydrogens placed geometrically (C–H 1.09 Å, N–H 1.01 Å, O–H 0.96 Å; sp³ tetrahedral, sp² trigonal); protonation states for pH ≈ 7 (His as the Nε2–H tautomer). Aromatic rings drawn in one Kekulé form.",
    },
  };
}

function atomInfo({ protein, molecule: m, mode, selection, aminoAcidForm: form, atomView }: InfoContext): InfoContent {
  const el = ELEMENTS[selection.atomElement];
  const atom = m.atomById[selection.atomId];
  const N = el.massNumber - el.Z;
  const roleText = atom ? atomRole(m, atom, form) : { beginner: "atom", scientific: "atom" };
  const neighbors = atom
    ? m.bonds
        .filter((b) => b.a === atom.id || b.b === atom.id)
        .map((b) => m.atomById[b.a === atom.id ? b.b : b.a])
        .filter((n) => (form === "free" ? n.inFree : n.inResidue))
    : [];
  const neighborText = neighbors.map((n) => `${n.display} (${ELEMENTS[n.element].name.toLowerCase()})`).join(", ");
  const label = aaLabel(protein.residues[selection.residueIndex]);
  const bohrNote = `Simplified picture: electrons do not really travel in fixed circular orbits like planets. They form fuzzy “clouds” showing where an electron is likely to be found${atomView === "orbits" ? " (switch to Electron cloud to see this)" : ""}. Not to scale: ${marbleComparison(el)}.`;

  if (mode === "beginner") {
    return {
      title: `${el.name} atom`,
      subtitle: `${el.isotopeName} · ${atom ? `the ${roleText.beginner.split(" (")[0]} of ${label}` : label}`,
      summary: `An atom is the basic unit of a chemical element. Atoms connect to form molecules. Every ${el.name.toLowerCase()} atom has ${el.Z} proton${el.Z > 1 ? "s" : ""}.`,
      facts: [
        { label: "Protons", value: `${el.Z}` },
        { label: "Neutrons", value: `${N}` },
        { label: "Electrons", value: `${el.Z}` },
      ],
      sections: sections(
        [
          `A tiny, heavy centre called the nucleus holds ${el.Z} proton${el.Z > 1 ? "s" : ""}${N ? ` and ${N} neutron${N > 1 ? "s" : ""}` : " (and no neutrons)"}. ${el.Z} electron${el.Z > 1 ? "s" : ""} move around it.`,
          "Almost all of an atom's mass is in the nucleus, but almost all of its space is where the electrons are found.",
        ],
        [ELEMENT_EXAMPLES[el.symbol].beginner],
        [
          `The number of protons decides which element an atom is: ${el.Z} proton${el.Z > 1 ? "s" : ""} always means ${el.name.toLowerCase()}.`,
          neighbors.length
            ? `In ${label} this atom is bonded to ${neighbors.length} other atom${neighbors.length > 1 ? "s" : ""}: ${neighborText}. The grey stubs point toward them.`
            : `${el.name} usually forms ${el.typicalBonds} bond${el.typicalBonds > 1 ? "s" : ""}.`,
        ],
      ),
      relation: { up: `Atoms bond together to form the amino acid ${label} (Level III).`, down: "Made of subatomic particles. Click a proton, neutron or electron (Level V)." },
      note: { tone: "warning", title: "Simplified model", text: bohrNote },
    };
  }

  const R = el.Z === 1 ? 0.84 : 1.2 * Math.cbrt(el.massNumber);
  const valence = el.shells[el.shells.length - 1];
  const massFrac = (100 * (1 - (el.Z * 0.000548580) / el.massNumber)).toFixed(2);
  return {
    title: `${el.name} (${el.isotopeSymbol})`,
    subtitle: `Z = ${el.Z} · N = ${N} · A = ${el.massNumber} · neutral · ${atom ? roleText.scientific : ""}`,
    summary: `Ground-state configuration ${el.configuration}. ${
      atom
        ? `In ${label}, ${atom.display} forms ${neighbors.length} covalent bond${neighbors.length === 1 ? "" : "s"} (${neighbors.map((n) => n.display).join(", ")}). Bonding electrons are shared, so the isolated-atom picture is an approximation.`
        : ""
    }`,
    facts: [
      { label: "Protons (Z)", value: `${el.Z}` },
      { label: "Neutrons (N)", value: `${N}` },
      { label: "Electrons / shells", value: `${el.Z} (${el.shells.join(", ")})` },
      { label: "Abundance", value: `${el.abundance}%` },
    ],
    sections: sections(
      [
        `Nucleus: ${el.Z} p + ${N} n, bound by the strong nuclear force; radius ≈ ${R.toFixed(1)} fm (≈ 1.2·A^⅓ fm).`,
        `Electrons: ${el.shells.join(" + ")} by shell; ${valence} valence electron${valence > 1 ? "s" : ""}. The nucleus holds ≈ ${massFrac}% of the atom's mass.`,
      ],
      [ELEMENT_EXAMPLES[el.symbol].scientific],
      [
        `Chemistry is set by the valence electrons; the nuclear charge (+${el.Z}e) binds them. ${el.name} typically forms ${el.typicalBonds} covalent bond${el.typicalBonds > 1 ? "s" : ""} in biomolecules.`,
        "Electrons occupy orbitals (probability distributions), with at most two electrons of opposite spin per orbital (Pauli exclusion).",
      ],
    ),
    relation: { up: `Covalently bonded within ${label} (Level III).`, down: "Constituents: nucleons (p, n) and electrons (Level V)." },
    note: {
      tone: "warning",
      title: "Model notes",
      text: `Bohr-style shells are a teaching device: quantum mechanics describes electrons by orbitals with no defined path. The cloud view samples Slater-type 1s/2s/2p densities (Clementi–Raimondi exponents; radial nodes omitted). Nucleus enlarged roughly 10⁴×; ${marbleComparison(el)}.`,
    },
  };
}

function particleInfo({ mode, selection }: InfoContext): InfoContent {
  const el = ELEMENTS[selection.atomElement];
  const N = el.massNumber - el.Z;
  const p = selection.particle;
  const note = {
    tone: "info" as const,
    title: "Simplified",
    text: "Sizes and colours are not to scale. Quarks are never found alone (colour confinement); the springs only suggest the gluon field. The electron's glow is only artistic, since it behaves as a point particle.",
  };
  const relation = {
    up: `${p === "electron" ? "Occupies orbitals around" : "Bound inside"} the ${el.name.toLowerCase()} nucleus (Level IV).`,
    down: p === "electron" ? "Fundamental: no smaller parts are known." : "Contains quarks (shown). This is the last level of the explorer.",
  };

  if (mode === "beginner") {
    if (p === "proton")
      return {
        title: "Proton",
        subtitle: "Found inside the nucleus",
        summary: "Proton: A positively charged particle found inside the nucleus. It is made of three even smaller particles called quarks.",
        facts: [
          { label: "Charge", value: "+1 (positive)" },
          { label: "Where", value: "Nucleus" },
          { label: "Weight", value: "≈ 1,836 electrons" },
        ],
        sections: sections(
          ["Two “up” quarks and one “down” quark, held together by the strong force (drawn as springs)."],
          [`The ${el.name.toLowerCase()} atom you came from has ${el.Z} proton${el.Z > 1 ? "s" : ""}. Every ${el.name.toLowerCase()} atom has exactly this many. Change the number and it becomes a different element.`],
          ["Opposite charges attract: positive protons pull on negative electrons. That pull keeps electrons near the nucleus and makes atoms possible."],
        ),
        relation,
        note,
      };
    if (p === "neutron")
      return {
        title: "Neutron",
        subtitle: "Found inside the nucleus",
        summary: "Neutron: An electrically neutral particle found inside the nucleus. Like the proton, it is made of three quarks.",
        facts: [
          { label: "Charge", value: "0 (neutral)" },
          { label: "Where", value: "Nucleus" },
          { label: "Weight", value: "≈ 1,839 electrons" },
        ],
        sections: sections(
          ["One “up” quark and two “down” quarks. Their charges cancel out, so the neutron has no overall charge."],
          [
            N === 0
              ? "The hydrogen atom you came from has no neutrons at all. Ordinary hydrogen is the only atom without one."
              : `Your ${el.name.toLowerCase()} atom has ${N} neutron${N > 1 ? "s" : ""}. Atoms of the same element with different numbers of neutrons are called isotopes, like carbon-12 and carbon-14.`,
          ],
          ["Neutrons help glue the nucleus together: the strong force between neutrons and protons is stronger than the protons' electric push on each other."],
        ),
        relation,
        note,
      };
    return {
      title: "Electron",
      subtitle: "Found around the nucleus",
      summary: "Electron: A negatively charged particle found around the nucleus. Electrons occupy cloud-like regions around the nucleus rather than fixed paths.",
      facts: [
        { label: "Charge", value: "−1 (negative)" },
        { label: "Where", value: "Around the nucleus" },
        { label: "Weight", value: "1/1836 of a proton" },
      ],
      sections: sections(
        ["As far as we know, nothing smaller. The electron is a fundamental particle."],
        ["Electricity in a wire is a flow of electrons. A static shock is electrons jumping from you to a door handle."],
        ["Electrons make chemistry happen: atoms share or swap electrons to form bonds. Every bond in the amino acid you explored is made of shared electrons."],
      ),
      relation,
      note,
    };
  }

  if (p === "proton")
    return {
      title: "Proton (p⁺)",
      subtitle: "Baryon · quark content uud · spin ½ · stable",
      summary: "The proton carries charge +e and, with the neutron, makes up the nucleus. Its proton number Z defines the chemical element.",
      facts: [
        { label: "Charge", value: "+1.602×10⁻¹⁹ C" },
        { label: "Mass", value: "938.27 MeV/c²" },
        { label: "Charge radius", value: "≈ 0.84 fm" },
        { label: "Mass / mₑ", value: "1836.15" },
      ],
      sections: sections(
        ["Valence quarks u, u, d: +⅔ + ⅔ − ⅓ = +1.", "Bound by gluons (quantum chromodynamics). The quarks' rest masses supply only about 1% of the proton's mass; the rest is the energy of confined quarks and gluons."],
        [`Z = ${el.Z} for ${el.name.toLowerCase()}: the nuclear charge +${el.Z}e binds ${el.Z} electron${el.Z > 1 ? "s" : ""} in the neutral atom.`],
        ["No proton decay has ever been observed (lifetime > 10³⁴ years); the hydrogen in your body is as old as the universe."],
      ),
      relation,
      note,
    };
  if (p === "neutron")
    return {
      title: "Neutron (n⁰)",
      subtitle: "Baryon · quark content udd · spin ½",
      summary: "The neutron is electrically neutral but slightly heavier than the proton. Bound in stable nuclei it is stable; free, it β-decays.",
      facts: [
        { label: "Charge", value: "0" },
        { label: "Mass", value: "939.57 MeV/c²" },
        { label: "Magnetic moment", value: "−1.91 μN" },
        { label: "Free lifetime", value: "≈ 880 s" },
      ],
      sections: sections(
        ["Valence quarks u, d, d: +⅔ − ⅓ − ⅓ = 0.", "Neutral overall, yet it has a magnetic moment, which is evidence of its charged constituents."],
        [`Outside a nucleus: n → p + e⁻ + ν̄ₑ (mean lifetime ≈ 880 s, about 15 minutes). Bound inside stable nuclei${N ? ` such as ${el.isotopeSymbol}` : ""}, neutrons do not decay.`],
        [`Neutrons add strong-force binding without electric repulsion; the N/Z ratio (here ${N}/${el.Z}) governs nuclear stability.`],
      ),
      relation,
      note,
    };
  return {
    title: "Electron (e⁻)",
    subtitle: "Lepton · spin ½ · stable · no known substructure",
    summary: "The electron carries charge −e and only ~1/1836 of the proton's mass. Electrons occupy orbitals around the nucleus and form chemical bonds.",
    facts: [
      { label: "Charge", value: "−1.602×10⁻¹⁹ C" },
      { label: "Mass", value: "0.511 MeV/c²" },
      { label: "Size", value: "point-like (< 10⁻¹⁸ m)" },
      { label: "Spin", value: "½ (fermion)" },
    ],
    sections: sections(
      ["A fundamental lepton: no internal structure has been detected."],
      ["Covalent bonds are shared electron pairs. For example, the Cα–N bond in the amino acid you explored contains two electrons."],
      ["As fermions, electrons obey the Pauli exclusion principle (at most two per orbital, with opposite spins), which produces shell structure and the periodic table."],
    ),
    relation,
    note,
  };
}
