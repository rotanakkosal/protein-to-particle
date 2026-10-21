"use client";

import { create } from "zustand";

interface TourState {
  active: boolean;
  /** Index into TOUR_STEPS */
  step: number;
  paused: boolean;
  /** 0–1: how far the current caption has counted down */
  progress: number;
  start: () => void;
  stop: () => void;
  goTo: (step: number) => void;
  setPaused: (paused: boolean) => void;
  setProgress: (progress: number) => void;
}

/** Guided tour state; the step logic lives in the Tour component. */
export const useTourStore = create<TourState>((set) => ({
  active: false,
  step: 0,
  paused: false,
  progress: 0,
  start: () => set({ active: true, step: 0, paused: false, progress: 0 }),
  stop: () => set({ active: false, paused: false, progress: 0 }),
  goTo: (step) => set({ step, paused: false, progress: 0 }),
  setPaused: (paused) => set({ paused }),
  setProgress: (progress) => set({ progress }),
}));
