import { Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";
import type { Level } from "@/store/explorerStore";

/**
 * Mutable, per-frame state shared between the transition controller, the camera rig and the
 * level stages. Kept outside React so 60 fps animation never triggers re-renders.
 */

export const FOV = 35;

export interface StageTransform {
  position: Vector3;
  scale: number;
  opacity: number;
}

export const transitionRuntime = {
  active: false,
  style: "zoom" as "zoom" | "morph",
  direction: 1 as 1 | -1,
  from: 0 as Level,
  to: 0 as Level,
  /** 0→1 during the approach (camera moving onto the selected component) */
  approach: 0,
  /** 0→1 while the structures cross-fade */
  dissolve: 0,
  /** Bead reveal progress for the protein ↔ chain morph */
  reveal: 0,
  anchor: new Vector3(),
  outgoing: { position: new Vector3(), scale: 1, opacity: 1 } as StageTransform,
  incoming: { position: new Vector3(), scale: 1, opacity: 0 } as StageTransform,
  fogRadius: 20,
  /** Debug only (exposed with ?debug): slows transitions down for frame-by-frame inspection */
  timeScale: 1,
};

export interface Viewport {
  width: number;
  height: number;
  /** Shift of the model centre in CSS px (positive x → right, positive y → up) */
  shiftX: number;
  shiftY: number;
  usableWidth: number;
  usableHeight: number;
}

export const sceneRefs = {
  controls: null as CameraControlsImpl | null,
  haze: null as HTMLDivElement | null,
  viewport: { width: 1280, height: 800, shiftX: 0, shiftY: 0, usableWidth: 800, usableHeight: 600 } as Viewport,
  dragging: false,
};

/** Layout reserved by the HTML overlay around the 3D view (keeps the model clear of the panels). */
export function computeViewport(width: number, height: number): Viewport {
  if (width < 768) {
    const top = 140; // title, section tabs, then the level pill and the view controls
    const bottom = Math.round(height * 0.36);
    const usableHeight = Math.max(160, height - top - bottom);
    return {
      width,
      height,
      shiftX: -12,
      shiftY: Math.round((bottom - top) / 2),
      usableWidth: width - 64,
      usableHeight,
    };
  }
  const panel = width < 1100 ? 320 : 372;
  const nav = width < 1280 ? 72 : 150; // level names beside the nav appear at ≥1280px
  const top = 128;
  const bottom = 96;
  return {
    width,
    height,
    shiftX: Math.round((panel - nav) / 2),
    shiftY: Math.round((bottom - top) / 2),
    usableWidth: Math.max(240, width - panel - nav),
    usableHeight: Math.max(240, height - top - bottom),
  };
}

/** Camera distance at which a sphere of `radius` fits the usable part of the view. */
export function framingDistance(radius: number, fit = 1.0): number {
  const v = sceneRefs.viewport;
  const t = Math.tan((FOV * Math.PI) / 360);
  const halfV = Math.atan((t * v.usableHeight) / v.height);
  const halfH = Math.atan((t * v.usableWidth) / v.height);
  const half = Math.min(halfV, halfH);
  return (radius / Math.sin(half)) * fit;
}
