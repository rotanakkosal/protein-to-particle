"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useExplorerStore, type Level, type TransitionRequest } from "@/store/explorerStore";
import { framingDistance, sceneRefs, transitionRuntime } from "./runtime";
import { getAnchor, getFraming } from "./framing";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeInCubic = (x: number) => x * x * x;
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Spherical interpolation between two unit vectors. */
function slerpDir(a: Vector3, b: Vector3, t: number, out: Vector3) {
  const dot = Math.min(1, Math.max(-1, a.dot(b)));
  const theta = Math.acos(dot);
  if (theta < 1e-4) return out.copy(b);
  const s = Math.sin(theta);
  return out
    .copy(a)
    .multiplyScalar(Math.sin((1 - t) * theta) / s)
    .addScaledVector(b, Math.sin(t * theta) / s)
    .normalize();
}

interface CameraPose {
  target: Vector3;
  distance: number;
  direction: Vector3;
}

/** Remembered camera pose per level so going back up restores the user's previous view. */
const levelMemory = new Map<Level, CameraPose>();

interface Plan {
  req: TransitionRequest;
  t: number;
  duration: number;
  start: CameraPose;
  end: CameraPose;
  approachDistance: number;
  fromFocus: Vector3;
  toFocus: Vector3;
  fromRadius: number;
  toRadius: number;
  finished: boolean;
}

const FORWARD = { approach: 0.6, dissolveStart: 0.48, dissolve: 1.05 };
const BACKWARD = { dissolve: 1.0, settleStart: 0.82, settle: 0.75 };
const MORPH = 1.45;

export function TransitionController() {
  const plan = useRef<Plan | null>(null);
  const tmpTarget = useRef(new Vector3());
  const tmpDir = useRef(new Vector3());
  const tmpPos = useRef(new Vector3());

  useFrame((_, rawDelta) => {
    const controls = sceneRefs.controls;
    const req = useExplorerStore.getState().transition;

    if (!req) {
      if (plan.current) plan.current = null;
      transitionRuntime.active = false;
      return;
    }
    if (!controls) return;

    // ---- start a new transition ----
    if (!plan.current || plan.current.req.id !== req.id) {
      const target = controls.getTarget(new Vector3());
      const position = controls.getPosition(new Vector3());
      const offset = position.clone().sub(target);
      const start: CameraPose = { target, distance: offset.length(), direction: offset.normalize() };
      levelMemory.set(req.from, { target: start.target.clone(), distance: start.distance, direction: start.direction.clone() });

      const forward = req.to > req.from;
      const morph = Math.min(req.from, req.to) === 0 && Math.max(req.from, req.to) === 1;
      const fromFraming = getFraming(req.from);
      const toFraming = getFraming(req.to);
      const remembered = !forward && !req.reset ? levelMemory.get(req.to) : undefined;
      const end: CameraPose = remembered
        ? { target: remembered.target.clone(), distance: remembered.distance, direction: remembered.direction.clone() }
        : {
            target: toFraming.target.clone(),
            distance: framingDistance(toFraming.radius),
            direction: (toFraming.direction ?? start.direction).clone(),
          };

      const anchor = forward
        ? req.anchor
          ? new Vector3(...req.anchor)
          : getAnchor(req.from)
        : getAnchor(req.to);

      transitionRuntime.active = true;
      transitionRuntime.style = morph ? "morph" : "zoom";
      transitionRuntime.direction = forward ? 1 : -1;
      transitionRuntime.from = req.from;
      transitionRuntime.to = req.to;
      transitionRuntime.anchor.copy(anchor);
      transitionRuntime.approach = 0;
      transitionRuntime.dissolve = 0;
      transitionRuntime.reveal = 0;
      transitionRuntime.outgoing.position.set(0, 0, 0);
      transitionRuntime.outgoing.scale = 1;
      transitionRuntime.outgoing.opacity = 1;
      transitionRuntime.incoming.position.set(0, 0, 0);
      transitionRuntime.incoming.scale = forward ? 0.1 : 3.4;
      transitionRuntime.incoming.opacity = 0;

      controls.enabled = false;
      controls.minDistance = 0.01;
      controls.maxDistance = Infinity;

      const startDistance = start.distance;
      plan.current = {
        req,
        t: 0,
        duration: morph ? MORPH : forward ? FORWARD.dissolveStart + FORWARD.dissolve : BACKWARD.settleStart + BACKWARD.settle,
        start,
        end,
        approachDistance: Math.max(startDistance * 0.5, end.distance * 0.75),
        fromFocus: fromFraming.target.clone(),
        toFocus: toFraming.target.clone(),
        fromRadius: fromFraming.radius,
        toRadius: toFraming.radius,
        finished: false,
      };
    }

    const p = plan.current;
    if (p.finished) return;
    // Real-time progression even on slow GPUs; cap only large hitches (tab switches, GC pauses)
    p.t += Math.min(rawDelta, 0.12) * transitionRuntime.timeScale;
    const rt = transitionRuntime;
    const P = rt.anchor;
    const target = tmpTarget.current;
    const direction = tmpDir.current;
    let distance = p.start.distance;
    let haze = 0;

    if (rt.style === "morph") {
      const e = easeInOutCubic(clamp01(p.t / (MORPH - 0.1)));
      rt.reveal = e;
      rt.approach = e;
      rt.dissolve = e;
      rt.outgoing.position.set(0, 0, 0);
      rt.outgoing.scale = 1;
      rt.outgoing.opacity = 1 - smoothstep(0.15, 0.85, e);
      rt.incoming.position.set(0, 0, 0);
      rt.incoming.scale = 1;
      rt.incoming.opacity = smoothstep(0.0, 0.45, e);
      target.lerpVectors(p.start.target, p.end.target, e);
      distance = lerp(p.start.distance, p.end.distance, e);
      slerpDir(p.start.direction, p.end.direction, e, direction);
      haze = Math.sin(Math.PI * e) * 0.25;
      rt.fogRadius = lerp(p.fromRadius, p.toRadius, e);
    } else if (rt.direction === 1) {
      const a = easeInOutCubic(clamp01(p.t / FORWARD.approach));
      const b = clamp01((p.t - FORWARD.dissolveStart) / FORWARD.dissolve);
      const eb = easeInOutCubic(b);
      rt.approach = a;
      rt.dissolve = b;

      // Old structure swells around the anchor and dissolves, as if we were flying "into" it.
      const so = 1 + 2.4 * easeInCubic(b);
      rt.outgoing.scale = so;
      rt.outgoing.position.copy(P).multiplyScalar(1 - so);
      rt.outgoing.opacity = 1 - smoothstep(0.0, 0.72, b);

      // New structure emerges from the anchor, growing into place.
      const si = lerp(0.1, 1, easeOutCubic(b));
      const Q = tmpPos.current.lerpVectors(P, p.toFocus, eb);
      rt.incoming.scale = si;
      rt.incoming.position.copy(Q).addScaledVector(p.toFocus, -si);
      rt.incoming.opacity = smoothstep(0.22, 0.86, b);

      const approachTarget = new Vector3().lerpVectors(p.start.target, P, a);
      const approachDist = lerp(p.start.distance, p.approachDistance, a);
      // During the dissolve the camera follows the emerging structure, then frames it.
      const followTarget = Q.clone().lerp(p.end.target, eb);
      target.lerpVectors(approachTarget, followTarget, eb);
      distance = lerp(approachDist, p.end.distance, eb);
      slerpDir(p.start.direction, p.end.direction, eb, direction);
      haze = Math.sin(Math.PI * b);
      rt.fogRadius = lerp(p.fromRadius, p.toRadius, eb);
    } else {
      const b = clamp01(p.t / BACKWARD.dissolve);
      const eb = easeInOutCubic(b);
      const c = clamp01((p.t - BACKWARD.settleStart) / BACKWARD.settle);
      const ec = easeInOutCubic(c);
      rt.dissolve = b;
      rt.approach = 1;

      // Current structure shrinks back into its place inside the parent.
      const so = lerp(1, 0.08, easeInCubic(b));
      const Q = tmpPos.current.lerpVectors(p.fromFocus, P, eb);
      rt.outgoing.scale = so;
      rt.outgoing.position.copy(Q).addScaledVector(p.fromFocus, -so);
      rt.outgoing.opacity = 1 - smoothstep(0.35, 0.95, b);

      // Parent structure condenses from a close-up back to its normal size.
      const si = 1 + 2.4 * (1 - easeOutCubic(b));
      rt.incoming.scale = si;
      rt.incoming.position.copy(P).multiplyScalar(1 - si);
      rt.incoming.opacity = smoothstep(0.05, 0.6, b);

      const phase1Target = new Vector3().lerpVectors(p.start.target, P, eb);
      const phase1Dist = lerp(p.start.distance, Math.max(p.start.distance, p.end.distance * 0.45), eb);
      target.lerpVectors(phase1Target, p.end.target, ec);
      distance = lerp(phase1Dist, p.end.distance, ec);
      slerpDir(p.start.direction, p.end.direction, Math.max(eb * 0.6, ec), direction);
      haze = Math.sin(Math.PI * b) * 0.85;
      rt.fogRadius = lerp(p.fromRadius, p.toRadius, eb);
    }

    const pos = tmpPos.current.copy(target).addScaledVector(direction, distance);
    controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);

    if (sceneRefs.haze) {
      sceneRefs.haze.style.opacity = haze.toFixed(3);
      sceneRefs.haze.style.setProperty("--haze-blur", `${(haze * 7).toFixed(2)}px`);
    }

    if (p.t >= p.duration) {
      p.finished = true;
      rt.outgoing.opacity = 0;
      rt.incoming.position.set(0, 0, 0);
      rt.incoming.scale = 1;
      rt.incoming.opacity = 1;
      rt.reveal = 1;
      const end = p.end;
      const endPos = end.target.clone().addScaledVector(end.direction, end.distance);
      controls.setLookAt(endPos.x, endPos.y, endPos.z, end.target.x, end.target.y, end.target.z, false);
      if (sceneRefs.haze) sceneRefs.haze.style.opacity = "0";
      controls.enabled = true;
      useExplorerStore.getState().finishTransition();
    }
  }, -2);

  return null;
}
