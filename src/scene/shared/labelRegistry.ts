"use client";

import type { ReactNode } from "react";
import type { Object3D } from "three";
import { create } from "zustand";

/**
 * 3D-anchored labels without nested React roots.
 *
 * Scene components register an anchor Object3D plus the label content; a single DOM overlay
 * (LabelOverlay) renders every label and projects its anchor to the screen each frame.
 * This avoids drei's <Html>, whose per-label React roots unmount synchronously and can race
 * when many labels disappear in the same commit (e.g. at the start of a level transition).
 */

export type LabelTone = "default" | "accent" | "muted" | "gold" | "strong";

export interface LabelEntry {
  id: string;
  anchor: Object3D;
  content: ReactNode;
  tone: LabelTone;
  className: string;
  visible: boolean;
}

interface LabelState {
  labels: Record<string, LabelEntry>;
  upsert: (entry: LabelEntry) => void;
  remove: (id: string) => void;
}

export const useLabelStore = create<LabelState>((set) => ({
  labels: {},
  upsert: (entry) => set((s) => ({ labels: { ...s.labels, [entry.id]: entry } })),
  remove: (id) =>
    set((s) => {
      if (!s.labels[id]) return s;
      const next = { ...s.labels };
      delete next[id];
      return { labels: next };
    }),
}));
