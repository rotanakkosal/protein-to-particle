"use client";

import { create } from "zustand";

/** The ten stages, in lab order, from the gene to the deposited structure. */
export const STAGE_KEYS = ["gene", "construct", "plasmid", "cell", "expression", "purification", "storage", "crystal", "diffraction", "structure"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const STAGE_COUNT = STAGE_KEYS.length;

/**
 * How many steps each stage plays through (0 = the starting state). The bottom bar offers the
 * next step as its main action; steps are kept when you leave a stage, and "Replay" resets them.
 */
export const STAGE_STEPS: Record<StageKey, number> = {
  gene: 0,
  construct: 1, // full KRAS4B → trimmed construct with tag
  plasmid: 1, // empty plasmid → gene inserted
  cell: 2, // transformed cells → antibiotic selection → grown culture
  expression: 1, // idle → IPTG added (transcription, translation, folding)
  purification: 6, // lyse → bind → wash → elute → cut tag → size exclusion
  storage: 4, // concentrate → aliquot → flash-freeze → store at −80 °C
  crystal: 1, // fresh drop → grown crystals
  diffraction: 0,
  structure: 3, // search model placed → refined → deposited
};

export interface PipelineTransition {
  id: number;
  from: number;
  to: number;
}

interface PipelineState {
  stage: number;
  transition: PipelineTransition | null;
  steps: Record<StageKey, number>;
  /** Incremented to restart a stage's animation from its first step */
  replays: Record<StageKey, number>;
  geneView: "chromosome" | "dna";
  crystalView: "drop" | "lattice";
  rotating: boolean;
  showRings: boolean;
  goTo: (stage: number) => void;
  next: () => void;
  previous: () => void;
  finishTransition: () => void;
  advance: (key: StageKey) => void;
  setStep: (key: StageKey, step: number) => void;
  replay: (key: StageKey) => void;
  set: (patch: Partial<Pick<PipelineState, "geneView" | "crystalView" | "rotating" | "showRings">>) => void;
}

let transitionId = 0;
const zeros = () => Object.fromEntries(STAGE_KEYS.map((k) => [k, 0])) as Record<StageKey, number>;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  stage: 0,
  transition: null,
  steps: zeros(),
  replays: zeros(),
  geneView: "dna",
  crystalView: "drop",
  rotating: true,
  showRings: true,
  goTo: (stage) => {
    const { stage: current, transition } = get();
    if (transition || stage === current || stage < 0 || stage >= STAGE_COUNT) return;
    set({ transition: { id: ++transitionId, from: current, to: stage } });
  },
  next: () => get().goTo(get().stage + 1),
  previous: () => get().goTo(get().stage - 1),
  finishTransition: () => {
    const t = get().transition;
    if (t) set({ stage: t.to, transition: null });
  },
  advance: (key) => {
    const steps = get().steps;
    if (steps[key] < STAGE_STEPS[key]) set({ steps: { ...steps, [key]: steps[key] + 1 } });
  },
  setStep: (key, step) => set((s) => ({ steps: { ...s.steps, [key]: Math.max(0, Math.min(STAGE_STEPS[key], step)) } })),
  replay: (key) => set((s) => ({ steps: { ...s.steps, [key]: 0 }, replays: { ...s.replays, [key]: s.replays[key] + 1 } })),
  set: (patch) => set(patch),
}));

export const currentStageKey = () => STAGE_KEYS[usePipelineStore.getState().stage];
