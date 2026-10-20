import { Vector3 } from "three";

/**
 * Per-frame state of a pipeline stage change, shared by the transition driver, the camera rig
 * and the stage groups. Kept outside React so animation never triggers re-renders.
 */
export const pipelineRuntime = {
  active: false,
  /** +1 forward (next stage), −1 back */
  direction: 1 as 1 | -1,
  /** 0 → 1 over the whole change */
  progress: 0,
  outgoing: { scale: 1, opacity: 1 },
  incoming: { scale: 1, opacity: 0 },
  /** Debug only (exposed with ?debug): speeds up or slows down the stages' own animations */
  speed: 1,
};

/** Frame time for stage animations: capped against hitches, scaled by the debug speed. */
export const stageDelta = (delta: number) => Math.min(delta, 0.1) * pipelineRuntime.speed;

export interface StageFraming {
  target: Vector3;
  /** Radius of the sphere that should fill the free part of the view */
  radius: number;
  /** Preferred view direction (target → camera) */
  direction: Vector3;
}

export const framing = (target: [number, number, number], radius: number, direction: [number, number, number]): StageFraming => ({
  target: new Vector3(...target),
  radius,
  direction: new Vector3(...direction).normalize(),
});
