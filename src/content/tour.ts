import type { Level } from "@/store/explorerStore";
import type { LevelSize } from "./levels";

/** Everything the captions need about the protein and the path the tour takes through it. */
export interface TourContext {
  proteinName: string;
  residueCount: number;
  /** e.g. "Gly12" */
  residueLabel: string;
  /** e.g. "glycine" */
  residueName: string;
  /** Beginner note about the residue in this protein, if there is one */
  residueNote: string | null;
  /** e.g. "carbon" */
  atomName: string;
  /** e.g. "Cα" */
  atomDisplay: string;
  protons: number;
  neutrons: number;
  sizes: LevelSize[];
  /** Protein width / proton width */
  zoomFactor: number;
  /** How many proteins side by side would span a thin (50 µm) human hair */
  perHair: number;
}

export interface TourView {
  chainUnfolded: boolean;
  atomView: "orbits" | "cloud";
}

export interface TourStep {
  level: Level;
  view: TourView;
  title: (c: TourContext) => string;
  text: (c: TourContext) => string;
}

const folded: TourView = { chainUnfolded: false, atomView: "orbits" };

const millions = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} million` : Math.round(x).toLocaleString("en-US"));

export const TOUR_STEPS: TourStep[] = [
  {
    level: 0,
    view: folded,
    title: (c) => `This is ${c.proteinName}, a real protein`,
    text: (c) =>
      `Every coil and arrow is drawn from atom positions measured by X-ray crystallography. ${c.proteinName} is about ${c.sizes[0].short} across: ${c.perHair.toLocaleString("en-US")} of them side by side would span the width of a thin human hair.`,
  },
  {
    level: 1,
    view: folded,
    title: () => "Inside: one folded chain",
    text: (c) => `Zoom in and the protein turns out to be a single chain of ${c.residueCount} amino acids, one bead each. The chain folds up on itself to make the protein's shape.`,
  },
  {
    level: 1,
    view: { chainUnfolded: true, atomView: "orbits" },
    title: () => "Unfolded, it is a long string",
    text: (c) => `Stretched out, the chain would be about ${c.sizes[1].short}. The order of its amino acids (the sequence, written in the genes) decides how it folds.`,
  },
  {
    level: 2,
    view: { chainUnfolded: true, atomView: "orbits" },
    title: (c) => `One amino acid: ${c.residueLabel}`,
    text: (c) =>
      `${c.residueLabel} is one bead of the chain, a small molecule about ${c.sizes[2].short} across made of carbon, hydrogen, nitrogen and oxygen atoms.${c.residueNote ? ` ${c.residueNote}` : ""}`,
  },
  {
    level: 3,
    view: { chainUnfolded: true, atomView: "orbits" },
    title: (c) => `One atom: ${c.atomName}`,
    text: (c) =>
      `This is the ${c.atomDisplay} ${c.atomName} atom of ${c.residueLabel}, about ${c.sizes[3].short} across. Its tiny nucleus holds ${c.protons} protons and ${c.neutrons} neutrons, with ${c.protons} electrons around it. The neat orbits are a simplification.`,
  },
  {
    level: 3,
    view: { chainUnfolded: true, atomView: "cloud" },
    title: () => "Electrons form a cloud",
    text: () => "Electrons do not really circle like planets. This cloud shows where they are likely to be found: densest near the nucleus and thinning out further away.",
  },
  {
    level: 4,
    view: { chainUnfolded: true, atomView: "cloud" },
    title: () => "Subatomic particles",
    text: (c) =>
      `Protons (+) and neutrons (no charge) are each about ${c.sizes[4].short === "point-like" ? "1.7 fm" : c.sizes[4].short} across and made of three quarks. Electrons (−) seem to have no size at all.`,
  },
  {
    level: 4,
    view: { chainUnfolded: true, atomView: "cloud" },
    title: () => "From protein to particle",
    text: (c) => `You just zoomed about ${millions(c.zoomFactor)} times: from a ${c.sizes[0].short} protein down to a 1.7 fm proton. Explore any level on your own, or watch the tour again.`,
  },
];

/** How long a caption stays up: long enough to read it, at a calm pace. */
export const dwellMs = (text: string) => Math.max(6000, 2400 + text.length * 48);
