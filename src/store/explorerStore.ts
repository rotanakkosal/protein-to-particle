"use client";

import { create } from "zustand";
import type { ElementSymbol } from "@/lib/chem/elements";
import type { ProteinId } from "@/content/proteins";

export type Level = 0 | 1 | 2 | 3 | 4;
export const LEVEL_COUNT = 5;
export type Mode = "beginner" | "scientific";
export type ParticleKind = "proton" | "neutron" | "electron";
export type Vec3 = [number, number, number];

export interface Selection {
  /** Which protein is being explored */
  proteinId: ProteinId;
  /** Level I: secondary-structure region that was zoomed into */
  regionId: string;
  /** Level II: residue index (0-based) */
  residueIndex: number;
  /** Level III: atom id inside the residue model (e.g. "CA") */
  atomId: string;
  atomElement: ElementSymbol;
  /** Level IV/V: particle */
  particle: ParticleKind;
  /** Level IV: which nucleon/electron instance was clicked (for the zoom anchor) */
  particleIndex: number;
}

export interface HoverInfo {
  key: string;
  title: string;
  subtitle?: string;
  hint?: string;
  swatch?: string;
}

export interface TransitionRequest {
  id: number;
  from: Level;
  to: Level;
  /** Zoom anchor in the coordinates of the level we are leaving (forward), usually the clicked point */
  anchor?: Vec3;
  /** "Start over": restore default selections and framing on arrival */
  reset?: boolean;
}

export interface ViewCommand {
  type: "zoomIn" | "zoomOut" | "reset" | "refocus";
  nonce: number;
}

type ProteinDefaults = Pick<Selection, "residueIndex" | "regionId">;

export const DEFAULT_SELECTION: Selection = {
  proteinId: "ubiquitin",
  regionId: "strand-10",
  residueIndex: 9, // Gly10 of ubiquitin
  atomId: "CA",
  atomElement: "C",
  particle: "proton",
  particleIndex: -1,
};

interface ExplorerState {
  level: Level;
  transition: TransitionRequest | null;
  selection: Selection;
  mode: Mode;
  showLabels: boolean;
  autoRotate: boolean;
  hover: HoverInfo | null;
  hoveredResidue: number | null;
  colorScheme: "structure" | "rainbow";
  chainUnfolded: boolean;
  aminoAcidForm: "residue" | "free";
  atomView: "orbits" | "cloud";
  showQuarks: boolean;
  showField: boolean;
  viewCommand: ViewCommand | null;
  /** Camera-derived scale: CSS pixels per scene unit at the focus distance */
  pxPerUnit: number;
  hasInteracted: boolean;
  /** Start residue/region per protein, resolved from the real structure once it has loaded */
  proteinDefaults: Partial<Record<ProteinId, ProteinDefaults>>;

  drillDown: (patch: Partial<Selection>, anchor?: Vec3) => void;
  setProtein: (id: ProteinId) => void;
  registerProteinDefaults: (id: ProteinId, defaults: ProteinDefaults) => void;
  goToLevel: (level: Level) => void;
  next: () => void;
  previous: () => void;
  restart: () => void;
  finishTransition: () => void;
  select: (patch: Partial<Selection>) => void;
  setHover: (hover: HoverInfo | null) => void;
  setHoveredResidue: (index: number | null) => void;
  setMode: (mode: Mode) => void;
  toggleLabels: () => void;
  toggleAutoRotate: () => void;
  setAutoRotate: (on: boolean) => void;
  setColorScheme: (s: ExplorerState["colorScheme"]) => void;
  setChainUnfolded: (v: boolean) => void;
  setAminoAcidForm: (v: ExplorerState["aminoAcidForm"]) => void;
  setAtomView: (v: ExplorerState["atomView"]) => void;
  setShowQuarks: (v: boolean) => void;
  setShowField: (v: boolean) => void;
  command: (type: ViewCommand["type"]) => void;
  setPxPerUnit: (v: number) => void;
  markInteracted: () => void;
}

let transitionId = 0;

/** When a choice changes at one level, the deeper choices fall back to sensible defaults. */
function cascade(prev: Selection, patch: Partial<Selection>): Selection {
  const next = { ...prev, ...patch };
  if (patch.residueIndex !== undefined && patch.residueIndex !== prev.residueIndex && patch.atomId === undefined) {
    next.atomId = "CA";
    next.atomElement = "C";
  }
  if ((patch.atomId !== undefined || patch.atomElement !== undefined) && patch.particleIndex === undefined) {
    next.particleIndex = -1;
  }
  return next;
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  level: 0,
  transition: null,
  selection: DEFAULT_SELECTION,
  mode: "beginner",
  // Small screens start with only the essential labels to avoid clutter
  showLabels: typeof window === "undefined" ? true : window.innerWidth >= 768,
  autoRotate: true,
  hover: null,
  hoveredResidue: null,
  colorScheme: "structure",
  chainUnfolded: false,
  aminoAcidForm: "residue",
  atomView: "orbits",
  showQuarks: true,
  showField: true,
  viewCommand: null,
  pxPerUnit: 10,
  hasInteracted: false,
  proteinDefaults: {},

  drillDown: (patch, anchor) => {
    const { level, transition, selection } = get();
    if (transition || level >= LEVEL_COUNT - 1) return;
    set({
      selection: cascade(selection, patch),
      hover: null,
      hasInteracted: true,
      transition: { id: ++transitionId, from: level, to: (level + 1) as Level, anchor },
    });
  },
  setProtein: (id) => {
    const { transition, selection, proteinDefaults } = get();
    if (transition || id === selection.proteinId) return;
    const d = proteinDefaults[id];
    set({
      level: 0,
      selection: { ...DEFAULT_SELECTION, proteinId: id, residueIndex: d?.residueIndex ?? -1, regionId: d?.regionId ?? "" },
      chainUnfolded: false,
      aminoAcidForm: "residue",
      atomView: "orbits",
      colorScheme: "structure",
      hover: null,
      hoveredResidue: null,
    });
  },
  registerProteinDefaults: (id, defaults) => {
    const { selection, proteinDefaults } = get();
    const patch: Partial<ExplorerState> = { proteinDefaults: { ...proteinDefaults, [id]: defaults } };
    // A protein that was opened before its data arrived starts on its showcase residue
    if (selection.proteinId === id && selection.residueIndex < 0) patch.selection = { ...selection, ...defaults };
    set(patch);
  },
  goToLevel: (target) => {
    const { level, transition } = get();
    if (transition || target === level) return;
    set({ hover: null, transition: { id: ++transitionId, from: level, to: target } });
  },
  next: () => {
    const { level } = get();
    if (level < LEVEL_COUNT - 1) get().goToLevel((level + 1) as Level);
  },
  previous: () => {
    const { level } = get();
    if (level > 0) get().goToLevel((level - 1) as Level);
  },
  restart: () => {
    const { level, transition } = get();
    if (transition) return;
    const fresh = (): Selection => {
      const { selection, proteinDefaults } = get();
      return { ...DEFAULT_SELECTION, proteinId: selection.proteinId, ...proteinDefaults[selection.proteinId] };
    };
    if (level === 0) {
      set({ selection: fresh(), colorScheme: "structure" });
      get().command("reset");
      return;
    }
    set({ hover: null, transition: { id: ++transitionId, from: level, to: 0, reset: true } });
  },
  finishTransition: () => {
    const t = get().transition;
    if (!t) return;
    if (t.reset) {
      const { selection, proteinDefaults } = get();
      const fresh: Selection = { ...DEFAULT_SELECTION, proteinId: selection.proteinId, ...proteinDefaults[selection.proteinId] };
      set({ level: t.to, transition: null, selection: fresh, chainUnfolded: false, aminoAcidForm: "residue", atomView: "orbits" });
    } else {
      set({ level: t.to, transition: null });
    }
  },
  select: (patch) => set((s) => ({ selection: cascade(s.selection, patch) })),
  setHover: (hover) => {
    const cur = get().hover;
    if (cur?.key === hover?.key) return;
    set({ hover });
  },
  setHoveredResidue: (index) => {
    if (get().hoveredResidue !== index) set({ hoveredResidue: index });
  },
  setMode: (mode) => set({ mode }),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  setAutoRotate: (on) => set({ autoRotate: on }),
  setColorScheme: (colorScheme) => set({ colorScheme }),
  setChainUnfolded: (chainUnfolded) => {
    set({ chainUnfolded });
    get().command("refocus");
  },
  setAminoAcidForm: (aminoAcidForm) => set({ aminoAcidForm }),
  setAtomView: (atomView) => {
    set({ atomView });
    get().command("refocus");
  },
  setShowQuarks: (showQuarks) => set({ showQuarks }),
  setShowField: (showField) => set({ showField }),
  command: (type) => set({ viewCommand: { type, nonce: Date.now() + Math.random() } }),
  setPxPerUnit: (pxPerUnit) => set({ pxPerUnit }),
  markInteracted: () => {
    if (!get().hasInteracted) set({ hasInteracted: true });
  },
}));
