import type { LucideIcon } from "lucide-react";
import { Box, CircleDot, Dna, Factory, Funnel, Gem, Microscope, Scissors, Snowflake, Zap } from "lucide-react";
import type { CrystalInfo, ExperimentInfo } from "@/lib/pdb/experiment";
import type { ProteinModel } from "@/lib/structure/protein";
import type { Mode } from "@/store/explorerStore";
import type { StageKey } from "@/store/pipelineStore";
import type { InfoSection } from "./info";

/**
 * "How it was made": the lab pipeline behind PDB 4OBE, from the KRAS gene to the deposited model.
 * Facts are tagged by where they come from, so recorded data is never mixed up with typical practice:
 *   4OBE      recorded in the PDB entry       computed  calculated from the entry
 *   known     textbook biology                typical   common lab practice, not recorded for 4OBE
 */

export type FactSource = "4OBE" | "computed" | "known" | "typical";

export interface PipelineFact {
  label: string;
  value: string;
  source: FactSource;
}

export interface StageStep {
  /** Button text for doing this step */
  action: string;
  /** What just happened (shown once the step is done) */
  done: string;
}

export interface StageInfo {
  title: string;
  subtitle: string;
  summary: string;
  facts: PipelineFact[];
  sections: InfoSection[];
  steps: StageStep[];
  /** One line suggesting what to try */
  tryIt: string;
  note: string;
}

export interface StageMeta {
  key: StageKey;
  name: string;
  icon: LucideIcon;
  /** Real size of what the stage shows */
  scale: string;
}

export const STAGE_META: StageMeta[] = [
  { key: "gene", name: "Gene", icon: Dna, scale: "DNA ≈ 2 nm wide" },
  { key: "construct", name: "Construct design", icon: Scissors, scale: "one bead = one amino acid" },
  { key: "plasmid", name: "Plasmid", icon: CircleDot, scale: "plasmid ≈ 1 µm of DNA" },
  { key: "cell", name: "E. coli", icon: Microscope, scale: "cell ≈ 2 µm long" },
  { key: "expression", name: "Expression", icon: Factory, scale: "ribosome ≈ 25 nm" },
  { key: "purification", name: "Purification", icon: Funnel, scale: "column ≈ 1 cm wide" },
  { key: "storage", name: "Storage", icon: Snowflake, scale: "tube ≈ 1 cm" },
  { key: "crystal", name: "Crystallization", icon: Gem, scale: "drop ≈ 2 mm · cell ≈ 10 nm" },
  { key: "diffraction", name: "X-ray diffraction", icon: Zap, scale: "detector ≈ 32 cm" },
  { key: "structure", name: "Solved structure", icon: Box, scale: "map region ≈ 2 nm" },
];

export interface PipelineContext {
  protein: ProteinModel;
  exp: ExperimentInfo;
  crystal: CrystalInfo | null;
}

/* ------------------------------------------------------------------ helpers */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function longDate(iso: string | null): string {
  if (!iso) return "n/a";
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  return m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso;
}
const kelvin = (k: number | null) => (k == null ? "n/a" : `${Math.round(k - 273.15)} °C (${Math.round(k)} K)`);
const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** Short space-group symbol: "C 1 2 1" → "C2", "P 21 21 21" → "P2₁2₁2₁". */
export function shortSpaceGroup(name: string): string {
  const [lattice, ...rest] = name.trim().split(/\s+/);
  const axes = rest.filter((t) => t !== "1");
  return lattice + (axes.length ? axes.map((t) => (t.length === 2 ? `${t[0]}${"₀₁₂₃₄₅"[Number(t[1])] ?? t[1]}` : t)).join("") : "1");
}
const sections = (made: string[], lab: string[], why: string[]): InfoSection[] => [
  { id: "made", label: "What happens", body: made },
  { id: "example", label: "In the lab", body: lab },
  { id: "why", label: "Why it matters", body: why },
];

/** Molecules per unit cell and the Matthews coefficient, recomputed from the cell and the chain weight. */
export function packingNumbers(ctx: PipelineContext) {
  const { crystal, exp } = ctx;
  if (!crystal || !exp.chainWeightDa) return null;
  const molecules = crystal.symops.length * (exp.chainsInAsu ?? 1);
  const vm = crystal.volume / (molecules * exp.chainWeightDa);
  return { molecules, vm, solvent: 100 * (1 - 1.23 / vm) };
}

/** Parses the crystallisation recipe "0.2M Sodium Acetate pH4.5, 0.1M Tris pH 8.5, 26% PEG 3350, …" into its ingredients. */
export function recipe(details: string | null): string[] {
  if (!details) return [];
  return details
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /\d/.test(s) && !/^(VAPOR|temperature)/i.test(s) && !/^\d+K$/i.test(s))
    .map((s) => s.replace(/(\d)M\b/, "$1 M").replace(/pH(\d)/, "pH $1"));
}

/* ------------------------------------------------------------------ stages */

export function stageInfo(key: StageKey, ctx: PipelineContext, mode: Mode): StageInfo {
  const { protein, exp, crystal } = ctx;
  const sci = mode === "scientific";
  const first = protein.residues[0];
  const last = protein.residues[protein.residues.length - 1];
  const range = `${first.seq}–${last.seq}`;
  const codons = protein.residues.length;
  const tag = exp.expressionTags.find((t) => t.chain === protein.chainId) ?? exp.expressionTags[0];
  const tagLabel = tag ? `${titleCase(tag.resName)}${tag.seq}` : null;

  switch (key) {
    case "gene":
      return {
        title: "The KRAS gene",
        subtitle: sci ? `${exp.gene.names.join(" · ")} · ${exp.gene.organism ?? ""}` : "Where the protein's recipe is written",
        summary: sci
          ? `KRAS (chromosome 12p12.1) encodes the small GTPase K-Ras. Alternative splicing of its last coding exon gives KRAS4A and KRAS4B (188 residues), which differ from residue 151 on. The 4OBE chain matches KRAS4B over residues ${range}.`
          : "Every protein starts as a gene: a stretch of DNA that spells out its amino acids, three DNA letters (one codon) for each. KRAS is built from a gene on chromosome 12.",
        facts: [
          { label: "Gene", value: exp.gene.names.join(", ") || "n/a", source: "4OBE" },
          { label: "Organism", value: exp.gene.organism ?? "n/a", source: "4OBE" },
          { label: "Location", value: "chromosome 12 (12p12.1)", source: "known" },
          { label: "UniProt", value: exp.uniprot ? `${exp.uniprot.accession}${exp.uniprot.name ? ` (${exp.uniprot.name})` : ""}` : "n/a", source: "4OBE" },
          { label: "Codons used", value: `${codons} (${codons * 3} bases)`, source: "computed" },
        ],
        sections: sections(
          [
            "DNA is a double helix of two strands, about 2 nm wide, with the bases A, T, G and C paired across the middle: A with T, G with C.",
            "Each codon of three bases stands for one amino acid. In the human gene, codon 12 reads GGT (glycine) and codon 13 reads GGC (glycine).",
          ],
          [
            exp.gene.details
              ? `The lab did not copy the human DNA itself. The 4OBE record says the gene was "${exp.gene.details}": rewritten with the codons bacteria read most easily, so many DNA letters change while every amino acid stays the same.`
              : "Labs often use a synthetic copy of the gene rewritten for the host organism.",
          ],
          [
            "Cancer mutations in KRAS are single-letter changes in this DNA. GGT → GAT at codon 12, for example, swaps glycine for aspartate (G12D).",
          ],
        ),
        steps: [],
        tryIt: "Switch between the chromosome and the DNA close-up, and hover the highlighted codons.",
        note: "The helix is to scale (2 nm wide, 0.34 nm per base pair) but only a short stretch is shown, with only codons 12 and 13 spelled out. The whole KRAS gene spans tens of thousands of base pairs, most of them introns that are spliced out.",
      };

    case "construct":
      return {
        title: "Designing the construct",
        subtitle: sci ? `KRAS4B ${range} with an N-terminal tag` : "Choosing exactly what to make",
        summary: sci
          ? `The construct spans the G-domain (${range}) and leaves out the flexible hypervariable region (170–188), which would hinder crystallization. A His-tag followed by a protease site is a common design: the single ${tagLabel ?? "Gly0"} left in 4OBE is exactly what a TEV protease cut (ENLYFQ↓G) leaves behind.`
          : `Scientists rarely make a whole protein. They design a construct: just the part they need (here amino acids ${first.seq} to ${last.seq}, the switch part of KRAS) plus a short handle, a tag, that makes the protein easy to fish out later.`,
        facts: [
          { label: "Residues kept", value: `${range} (G-domain)`, source: "4OBE" },
          { label: "Left out", value: "170–188 (flexible tail)", source: "known" },
          { label: "Extra residue", value: tagLabel ? `${tagLabel}, "expression tag"` : "none", source: "4OBE" },
          { label: "DNA", value: exp.gene.details ?? "n/a", source: "4OBE" },
          { label: "Tag design", value: "His-tag + TEV site", source: "typical" },
        ],
        sections: sections(
          [
            "The design is written at the DNA level, but it is easiest to read as the chain of amino acids it will make: a start, the tag, a cut site, then KRAS.",
            `Six histidines in a row (the His-tag) will later grip nickel beads. The TEV site (ENLYFQ) tells a protease where to cut the tag off again, leaving one glycine${tagLabel ? ` (${tagLabel} in the file)` : ""}.`,
          ],
          [
            "Designs are usually ordered as synthetic DNA, already codon-optimized for the host, and checked by sequencing before use.",
          ],
          [
            "Flexible tails rarely crystallize. Trimming KRAS to its compact G-domain is what made a 1.24 Å structure possible.",
          ],
        ),
        steps: [{ action: `Trim to residues ${range}`, done: `Trimmed: the flexible tail (170–188) is left out and a tag is added in front.` }],
        tryIt: "Trim the protein to the construct and see what is kept, added and left out.",
        note: "The tag shown is a typical design. The PDB entry records only the leftover glycine; the exact tag sequence is in the paper (Hunter et al. 2014).",
      };

    case "plasmid":
      return {
        title: "Cloning into a plasmid",
        subtitle: exp.expression.plasmid ? `${exp.expression.plasmid} · expression plasmid` : "A ring of DNA bacteria can copy",
        summary: sci
          ? `The construct was cloned into ${exp.expression.plasmid ?? "an expression plasmid"} (recorded in 4OBE). Expression plasmids combine an inducible promoter and ribosome binding site upstream of the insert, a terminator, a selection marker (antibiotic resistance) and an origin of replication.`
          : "The construct DNA is pasted into a plasmid: a small ring of DNA that bacteria copy and read. Besides the gene, the plasmid carries a switch (the promoter) to turn it on later and a gene that protects the bacteria from an antibiotic.",
        facts: [
          { label: "Plasmid", value: exp.expression.plasmid ?? "n/a", source: "4OBE" },
          { label: "Vector type", value: exp.expression.vectorType ?? "n/a", source: "4OBE" },
          { label: "KRAS coding DNA", value: `${codons * 3} bases`, source: "computed" },
          { label: "Other parts", value: "promoter, resistance gene, origin", source: "typical" },
        ],
        sections: sections(
          [
            "The ring is cut open at a chosen spot, the construct DNA is joined in, and the ring is sealed again.",
            "The origin of replication makes the bacteria copy the plasmid; the resistance gene lets only plasmid-carrying cells survive the antibiotic.",
          ],
          ["Cloning is checked by DNA sequencing before the plasmid is put into the expression strain."],
          ["The promoter keeps the gene quiet while the bacteria grow, then switches it on all at once when the culture is ready."],
        ),
        steps: [{ action: "Insert the gene", done: "The ring is opened, the KRAS construct is joined in, and the ring closes again." }],
        tryIt: "Insert the gene, then hover each part of the ring.",
        note: "Parts are drawn schematically and not to scale; the full map of the plasmid is not part of the PDB entry.",
      };

    case "cell":
      return {
        title: "Growing E. coli",
        subtitle: [exp.expression.host, exp.expression.strain].filter(Boolean).join(" · ") || "The bacterial factory",
        summary: sci
          ? `Plasmids are introduced by transformation and selected with the plasmid's antibiotic marker. ${exp.expression.strain ?? "BL21(DE3)"}, the strain recorded in 4OBE, lacks the Lon and OmpT proteases, and its chromosome carries the T7 RNA polymerase gene (prophage λDE3) under an IPTG-inducible promoter.`
          : "The plasmid is put into E. coli bacteria. An antibiotic kills every cell that did not take up the plasmid, so only the KRAS-carrying cells grow. They divide roughly every half hour, making billions of copies.",
        facts: [
          { label: "Host", value: exp.expression.host ?? "n/a", source: "4OBE" },
          { label: "Strain", value: exp.expression.strain ?? "n/a", source: "4OBE" },
          { label: "Cell size", value: "about 2 µm long", source: "known" },
          { label: "Doubling time", value: "≈ 20 to 30 min at 37 °C", source: "typical" },
        ],
        sections: sections(
          [
            "A brief heat shock makes the cells take up the plasmid. Most cells do not, so an antibiotic is used to remove them.",
            "Each surviving cell divides in two, then those divide again: 20 doublings turn one cell into about a million.",
          ],
          ["Colonies are picked from an antibiotic plate, grown overnight, then scaled up to litres of broth until the culture is dense enough to switch on expression."],
          ["Bacteria are fast, cheap and easy to grow, which is why most crystal structures of human proteins start in E. coli."],
        ),
        steps: [
          { action: "Add antibiotic", done: "Cells without the plasmid cannot resist the antibiotic and die." },
          { action: "Grow the culture", done: "The surviving cells divide again and again." },
        ],
        tryIt: "Add the antibiotic, then let the culture grow.",
        note: "Cells and plasmids are enlarged and drawn as clean shapes; a real culture holds around a billion cells per millilitre.",
      };

    case "expression":
      return {
        title: "Making the protein",
        subtitle: "Gene → messenger RNA → amino-acid chain → folded KRAS",
        summary: sci
          ? "IPTG relieves lac repression, so the insert is transcribed into mRNA and translated by ribosomes (in E. coli, roughly 10 to 20 amino acids per second). The chain folds as it emerges; Ras proteins purified from bacteria usually carry GDP·Mg²⁺, as seen in 4OBE."
          : "Adding a chemical called IPTG flips the switch. The cell copies the gene into messenger RNA, and ribosomes read it codon by codon, linking amino acids into a chain that folds into KRAS. KRAS even picks up GDP, its 'off' molecule, from inside the cell.",
        facts: [
          { label: "Switch", value: "IPTG", source: "typical" },
          { label: "Chain made", value: `tag + KRAS ${range}`, source: "computed" },
          { label: "Final fold", value: "as in 4OBE", source: "4OBE" },
          { label: "Picked up", value: protein.ligands.map((l) => (l.resName === "MG" ? "Mg²⁺" : l.resName)).join(" + ") || "none", source: "4OBE" },
        ],
        sections: sections(
          [
            "RNA polymerase copies the gene into mRNA. Ribosomes, the cell's protein factories, read the mRNA three letters at a time and add one amino acid per codon.",
            "The new chain folds into its working shape and grabs a GDP molecule and a magnesium ion from the cell.",
          ],
          ["Expression often runs overnight at a lower temperature (around 18 °C), which gives chains more time to fold properly."],
          ["One litre of culture can yield tens of milligrams of KRAS, far more than any human tissue could provide."],
        ),
        steps: [{ action: "Add IPTG", done: "Transcription and translation start; the chain grows, folds and binds GDP·Mg²⁺." }],
        tryIt: "Add IPTG and watch a ribosome build the chain, which then folds into KRAS.",
        note: "Ribosome and mRNA are schematic and not to scale: a real ribosome (about 25 nm) is roughly five times wider than KRAS, here only about twice. The fold animation morphs the chain into the final 4OBE shape; it is not the real folding pathway.",
      };

    case "purification":
      return {
        title: "Purifying KRAS",
        subtitle: "From bacterial soup to one pure protein",
        summary: sci
          ? `Immobilized-metal affinity chromatography (Ni-NTA) captures the His-tagged protein; imidazole competes for the Ni²⁺ sites and elutes it. TEV protease removes the tag${tagLabel ? `, leaving ${tagLabel} (recorded as an expression-tag residue in 4OBE)` : ""}, and size-exclusion chromatography gives a clean, monodisperse sample.`
          : "KRAS now has to be separated from thousands of other bacterial proteins. The cells are broken open and the mix flows through a column of beads carrying nickel. Only the tagged KRAS sticks. After washing, KRAS is released, its tag is cut off, and a last column sorts molecules by size.",
        facts: [
          { label: "Proof the tag was cut", value: tagLabel ? `only ${tagLabel} remains` : "n/a", source: "4OBE" },
          { label: "Capture", value: "nickel (Ni-NTA) beads", source: "typical" },
          { label: "Release", value: "imidazole", source: "typical" },
          { label: "Polish", value: "size exclusion", source: "typical" },
        ],
        sections: sections(
          [
            "Six histidines in a row hold on to nickel ions, so the tag works like a hook. Imidazole looks like the side chain of histidine and pushes KRAS off the hook.",
            "The cut tag and the protease (which usually carries a His-tag too) stick to a second nickel column, while the untagged KRAS flows through.",
          ],
          ["Each step is checked on a gel (SDS-PAGE). Everything is kept cold, around 4 °C, to protect the protein."],
          ["Crystals only grow from very pure, uniform protein; even small amounts of contaminants can stop them forming."],
        ),
        steps: [
          { action: "Break the cells", done: "The cell walls are broken open and everything inside spills into the buffer." },
          { action: "Load the nickel column", done: "His-tagged KRAS grips the nickel beads; other proteins flow through." },
          { action: "Wash", done: "A buffer with a little imidazole rinses off proteins that stuck loosely." },
          { action: "Elute with imidazole", done: "Plenty of imidazole pushes KRAS off the nickel, and it flows out." },
          { action: "Cut off the tag", done: `TEV protease cuts after ENLYFQ, removing the tag and leaving ${tagLabel ?? "a glycine"} at the start of KRAS.` },
          { action: "Polish by size", done: "Size exclusion separates by size: KRAS comes off as one clean peak." },
        ],
        tryIt: "Step through the purification and watch the chromatogram.",
        note: "Beads and molecules are not to scale, and the chromatogram is schematic, not the authors' data.",
      };

    case "storage":
      return {
        title: "Storing the protein",
        subtitle: "Concentrate, portion, freeze",
        summary: sci
          ? "Samples are concentrated by ultrafiltration, divided into single-use aliquots, snap-frozen in liquid nitrogen and kept at −80 °C. Ras proteins are stored with Mg²⁺ (often with extra GDP) so the nucleotide stays bound, and repeated freeze–thaw cycles are avoided."
          : "Pure KRAS is concentrated, split into small tubes, frozen within seconds in liquid nitrogen and stored at −80 °C. Freezing fast keeps ice crystals from damaging the protein, and small portions mean each tube is thawed only once.",
        facts: [
          { label: "Flash-freeze", value: "liquid nitrogen, −196 °C", source: "typical" },
          { label: "Storage", value: "−80 °C freezer", source: "typical" },
          { label: "Buffer extras", value: "Mg²⁺ (keeps GDP bound)", source: "typical" },
          { label: "For crystals", value: "often around 10 mg/mL", source: "typical" },
        ],
        sections: sections(
          [
            "A spin filter with tiny pores lets water and salt through but holds KRAS back, so the solution becomes more concentrated.",
            "Freezing in liquid nitrogen is so fast that water turns solid before large ice crystals can grow.",
          ],
          ["Each tube is labelled with the protein, concentration and date, and thawed on ice right before setting up crystallization drops."],
          ["Proteins slowly unfold or clump at room temperature. Frozen, the same batch can feed months of experiments."],
        ),
        steps: [
          { action: "Concentrate", done: "Water passes the filter, KRAS stays behind: the sample is now much more concentrated." },
          { action: "Split into tubes", done: "The protein is split into small single-use tubes." },
          { action: "Flash-freeze", done: "The tubes are plunged into liquid nitrogen at −196 °C and freeze within seconds." },
          { action: "Store at −80 °C", done: "The frozen tubes wait in a −80 °C freezer until crystallization." },
        ],
        tryIt: "Take the protein through concentrating, portioning and freezing.",
        note: "Typical lab practice: the PDB entry does not record how the protein was stored.",
      };

    case "crystal": {
      const pack = packingNumbers(ctx);
      const ingredients = recipe(exp.crystal.details);
      const cell = crystal?.cell;
      return {
        title: "Growing crystals",
        subtitle: exp.crystal.method ? `${titleCase(exp.crystal.method).replace("Vapor", "Vapour")} · ${kelvin(exp.crystal.temperatureK)}` : "Vapour diffusion",
        summary: sci
          ? `Hanging-drop vapour diffusion: the drop (protein plus reservoir solution) equilibrates against a reservoir with more precipitant, so water leaves the drop until the protein becomes supersaturated and nucleates. 4OBE grew in ${crystal ? shortSpaceGroup(crystal.spaceGroup) : "n/a"} with ${exp.chainsInAsu ?? "?"} molecules per asymmetric unit${pack ? `; V_M = V_cell / (Z·M) = ${Math.round(crystal!.volume).toLocaleString("en-US")} Å³ / (${pack.molecules} × ${Math.round(exp.chainWeightDa!).toLocaleString("en-US")} Da) = ${pack.vm.toFixed(2)} Å³/Da, about ${Math.round(pack.solvent)}% solvent` : ""}.`
          : "To see atoms with X-rays you need a crystal: billions of KRAS molecules lined up in a perfect repeating pattern. A drop of protein mixed with a salty, syrupy solution hangs over a reservoir. Water slowly leaves the drop, the protein gets crowded, and crystals grow.",
        facts: [
          { label: "Method", value: exp.crystal.method ? titleCase(exp.crystal.method) : "n/a", source: "4OBE" },
          { label: "Temperature", value: kelvin(exp.crystal.temperatureK), source: "4OBE" },
          { label: "Reservoir", value: ingredients.join(" · ") || "n/a", source: "4OBE" },
          { label: "Space group", value: crystal ? `${shortSpaceGroup(crystal.spaceGroup)} (${crystal.spaceGroup})` : "n/a", source: "4OBE" },
          { label: "Unit cell", value: cell ? `${cell.a.toFixed(1)} × ${cell.b.toFixed(1)} × ${cell.c.toFixed(1)} Å, β ${cell.beta.toFixed(1)}°` : "n/a", source: "4OBE" },
          { label: "Molecules per cell", value: pack ? `${pack.molecules}` : "n/a", source: "computed" },
          { label: "Solvent", value: pack ? `${Math.round(pack.solvent)}% (file: ${exp.crystal.solventPercent ?? "n/a"}%)` : "n/a", source: "computed" },
        ],
        sections: sections(
          [
            "PEG 3350 is a long, water-loving polymer that crowds the protein; as water evaporates from the drop toward the reservoir, KRAS molecules are pushed together until they start packing into a lattice.",
            "Inside the crystal, every unit cell holds the same arrangement of KRAS molecules, repeated millions of times in every direction. Over a third of the crystal is still water.",
          ],
          ["Hundreds of conditions are usually screened in tiny drops before one gives good crystals; the best conditions are then refined by hand."],
          ["A crystal amplifies the signal: X-rays scattered by one molecule are far too weak to detect, but billions of identical molecules in step add up to measurable spots."],
        ),
        steps: [{ action: "Let it equilibrate", done: "Over days, water moves from the drop into the reservoir and crystals appear." }],
        tryIt: "Let the drop equilibrate, then look inside the crystal.",
        note: "The drop is schematic. The crystal view uses the real 4OBE unit cell and C2 symmetry, with each KRAS drawn as its backbone trace.",
      };
    }

    case "diffraction": {
      const d = exp.diffraction;
      const r = exp.reflections;
      return {
        title: "X-ray diffraction",
        subtitle: [d.source ? titleCase(d.source) : null, d.site && d.beamline ? `${d.site} beamline ${d.beamline}` : null].filter(Boolean).join(" · "),
        summary: sci
          ? `Each spot is a Bragg reflection hkl, recorded when its reciprocal-lattice point crosses the Ewald sphere during the rotation. The spots here are computed from the real 4OBE cell, C2 symmetry and atoms (|F|² with each atom's B-factor), so the C-centring absences (h + k odd) are missing by construction. The experiment measured ${r.count?.toLocaleString("en-US") ?? "n/a"} unique reflections to ${r.resolutionHigh ?? "?"} Å.`
          : "The frozen crystal sits in a very bright X-ray beam at a synchrotron. Its repeating molecules scatter the X-rays into a pattern of spots, and as the crystal turns, new spots light up. Together, tens of thousands of spots hold the information about where every atom is.",
        facts: [
          { label: "Source", value: d.site && d.beamline ? `${d.site} ${d.beamline} (synchrotron)` : (d.source ?? "n/a"), source: "4OBE" },
          { label: "Wavelength", value: d.wavelength ? `${d.wavelength} Å` : "n/a", source: "4OBE" },
          { label: "Crystal temperature", value: kelvin(d.temperatureK), source: "4OBE" },
          { label: "Detector", value: d.detectorModel ? `${titleCase(d.detectorModel).replace("Adsc", "ADSC")} (${d.detector ?? ""})` : "n/a", source: "4OBE" },
          { label: "Collected", value: longDate(exp.dates.collected), source: "4OBE" },
          { label: "Resolution", value: r.resolutionHigh ? `${r.resolutionLow ?? "?"} to ${r.resolutionHigh} Å` : "n/a", source: "4OBE" },
          { label: "Detector distance", value: "about 150 mm, so the limit reaches the edge", source: "typical" },
          {
            label: "Reflections",
            value: r.count ? `${r.count.toLocaleString("en-US")} · ${r.completeness}% complete · ${r.redundancy}× each` : "n/a",
            source: "4OBE",
          },
        ],
        sections: sections(
          [
            "X-rays bounce off the electrons in the crystal. Only in certain directions do the waves from all the unit cells line up, and there they make a spot.",
            "Spots near the centre come from big features; spots far out carry fine detail. The farthest spots measured set the resolution: 1.24 Å here, enough to tell individual atoms apart.",
          ],
          [
            "The crystal is fished out of the drop in a tiny loop, frozen at 100 K in a stream of cold nitrogen gas (which also slows radiation damage), and rotated in the beam while the detector records image after image.",
          ],
          ["Synchrotron beams are many millions of times brighter than a lab X-ray source, so even small crystals give high-resolution data."],
        ),
        steps: [],
        tryIt: "Let the crystal turn and watch new spots light up; switch the resolution rings on and off.",
        note: "Spots are calculated in your browser from the deposited model (atoms, B-factors, cell and C2 symmetry) out to the real 1.24 Å limit. Real images also contain background scatter, noise, and spot shapes from the crystal's mosaicity. The crystal, loop and pin are enlarged.",
      };
    }

    case "structure": {
      const ref = exp.refinement;
      const phaser = exp.software.find((s) => /phas/i.test(s.role))?.name;
      const refiner = exp.software.find((s) => /refine/i.test(s.role))?.name;
      const model = ref.startingModel?.replace(/^PDB ENTRY /i, "PDB ");
      return {
        title: "Solving the structure",
        subtitle: `${ref.method ? titleCase(ref.method) : "Phasing"} · R-free ${ref.rFree ?? "n/a"}`,
        summary: sci
          ? `Molecular replacement${phaser ? ` in ${phaser}` : ""} placed the search model${model ? ` (${model})` : ""} in the cell; model building and refinement${refiner ? ` in ${refiner}` : ""} reached R-work ${ref.rWork} and R-free ${ref.rFree} at ${exp.reflections.resolutionHigh} Å. R-free is computed on reflections left out of refinement, which guards against over-fitting.`
          : "The spots alone are not a picture: they tell how strong each scattered wave is, but not how the waves line up. Borrowing that missing information from a known KRAS structure gives a first map of the electron cloud. Atoms are fitted into the map and refined until the model explains the spots. The result went into the Protein Data Bank as 4OBE.",
        facts: [
          { label: "Phasing", value: [ref.method ? titleCase(ref.method) : null, phaser].filter(Boolean).join(" · ") || "n/a", source: "4OBE" },
          { label: "Search model", value: model ?? "n/a", source: "4OBE" },
          { label: "Refinement", value: refiner ?? "n/a", source: "4OBE" },
          { label: "R-work / R-free", value: ref.rWork && ref.rFree ? `${ref.rWork.toFixed(3)} / ${ref.rFree.toFixed(3)}` : "n/a", source: "4OBE" },
          { label: "Deposited", value: longDate(exp.dates.deposited), source: "4OBE" },
          { label: "Released", value: longDate(exp.dates.released), source: "4OBE" },
        ],
        sections: sections(
          [
            "The mesh shows where electrons are dense: atoms sit inside it. Fitting the model means placing every atom so the mesh and the model agree.",
            "R-work and R-free measure the mismatch between the spots the model predicts and those measured: 0 would be perfect, and values between 0.15 and 0.20 are typical of a very good structure at this resolution.",
          ],
          ["Building and refinement alternate for days or weeks; at the end, the model is validated and deposited together with the measured data."],
          ["Every structure in the PDB, including 4OBE, is free for anyone to use, which is how this explorer can show it."],
        ),
        steps: [
          { action: "Place the search model", done: `A known KRAS structure${model ? ` (${model})` : ""} is rotated and shifted until it best explains the measured spots.` },
          { action: "Refine the model", done: "Atoms are nudged into the electron density until model and data agree." },
          { action: "Deposit to the PDB", done: `The model and data were deposited on ${longDate(exp.dates.deposited)} and released as PDB ${protein.idCode} on ${longDate(exp.dates.released)}.` },
        ],
        tryIt: "Place the search model, refine it, then deposit it and open 4OBE in the explorer.",
        note: "The mesh is electron density calculated from the final 4OBE model (P-loop, GDP and Mg²⁺), contoured at 1.2 e/Å³; the authors' map came from the measured data. The search model is drawn with 4OBE itself, since 4EPV is not bundled, and refinement is schematic: atoms start up to 0.7 Å off and settle onto their deposited positions while the map sharpens.",
      };
    }
  }
}
