"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Fog, PerspectiveCamera, Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";
import { useExplorerStore } from "@/store/explorerStore";
import { STAGE_KEYS, usePipelineStore } from "@/store/pipelineStore";
import { computeViewport, FOV, framingDistance, sceneRefs } from "@/scene/runtime";
import { pipelineRuntime, type StageFraming } from "./runtime";
import { STAGES } from "./stages";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const DURATION = 1.5;

const framingFor = (stage: number): StageFraming => STAGES[STAGE_KEYS[stage]].framing();

/**
 * Camera for the pipeline: frames each stage, flies between stages while the scenes swap,
 * answers the zoom / reset buttons, rotates gently and keeps the depth fog in step.
 */
export function PipelineCamera() {
  const ref = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const viewCommand = useExplorerStore((s) => s.viewCommand);
  const stage = usePipelineStore((s) => s.stage);
  const transition = usePipelineStore((s) => s.transition);
  const plan = useRef<{ id: number; t: number; from: { target: Vector3; distance: number; dir: Vector3 }; to: { target: Vector3; distance: number; dir: Vector3 } } | null>(null);
  const radius = useRef(10);
  const initialised = useRef(false);

  useEffect(() => {
    const vp = computeViewport(size.width, size.height);
    sceneRefs.viewport = vp;
    camera.fov = FOV;
    camera.setViewOffset(size.width, size.height, -vp.shiftX, vp.shiftY, size.width, size.height);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  useEffect(() => {
    sceneRefs.controls = ref.current;
    const c = ref.current;
    if (!c) return;
    const onStart = () => (sceneRefs.dragging = true);
    const onEnd = () => (sceneRefs.dragging = false);
    c.addEventListener("controlstart", onStart);
    c.addEventListener("controlend", onEnd);
    return () => {
      c.removeEventListener("controlstart", onStart);
      c.removeEventListener("controlend", onEnd);
      sceneRefs.controls = null;
    };
  }, []);

  const framed = useRef<StageFraming | null>(null);
  const frame = (animate: boolean) => {
    const c = ref.current;
    if (!c) return;
    const f = framingFor(usePipelineStore.getState().stage);
    framed.current = f;
    radius.current = f.radius;
    const d = framingDistance(f.radius);
    const pos = f.target.clone().addScaledVector(f.direction, d);
    c.minDistance = f.radius * 0.3;
    c.maxDistance = d * 3;
    c.setLookAt(pos.x, pos.y, pos.z, f.target.x, f.target.y, f.target.z, animate);
  };

  // first frame, and whenever a stage settles (its framing may depend on the stage's own view toggles)
  useEffect(() => {
    if (transition) return;
    frame(initialised.current);
    initialised.current = true;
  }, [stage, transition]);

  // view toggles and steps that change a stage's framing (drop ↔ crystal lattice, colony growth, deposit)
  useEffect(
    () =>
      usePipelineStore.subscribe((s, prev) => {
        if (s.transition || s.stage !== prev.stage) return;
        if (s.geneView !== prev.geneView || s.crystalView !== prev.crystalView) return frame(true);
        if (s.steps !== prev.steps && framed.current) {
          const f = framingFor(s.stage);
          if (f.target.distanceTo(framed.current.target) > 1e-3 || Math.abs(f.radius - framed.current.radius) > 1e-3) frame(true);
        }
      }),
    [],
  );

  useEffect(() => {
    const c = ref.current;
    if (!c || !viewCommand || usePipelineStore.getState().transition) return;
    if (viewCommand.type === "zoomIn") c.dolly(c.distance * 0.28, true);
    else if (viewCommand.type === "zoomOut") c.dolly(-c.distance * 0.38, true);
    else frame(true);
  }, [viewCommand]);

  useEffect(() => {
    if (initialised.current && !usePipelineStore.getState().transition) frame(true);
  }, [size.width, size.height]);

  useFrame((_, rawDelta) => {
    const c = ref.current;
    if (!c) return;
    const req = usePipelineStore.getState().transition;
    const rt = pipelineRuntime;

    if (req) {
      if (!plan.current || plan.current.id !== req.id) {
        const target = c.getTarget(new Vector3());
        const offset = c.getPosition(new Vector3()).sub(target);
        const f = framingFor(req.to);
        plan.current = {
          id: req.id,
          t: 0,
          from: { target, distance: offset.length(), dir: offset.normalize() },
          to: { target: f.target.clone(), distance: framingDistance(f.radius), dir: f.direction.clone() },
        };
        radius.current = Math.max(radius.current, f.radius);
        rt.active = true;
        rt.direction = req.to > req.from ? 1 : -1;
        c.enabled = false;
        c.minDistance = 0.01;
        c.maxDistance = Infinity;
      }
      const p = plan.current;
      p.t += Math.min(rawDelta, 0.12);
      const k = clamp01(p.t / DURATION);
      const e = ease(k);
      rt.progress = k;
      const fwd = rt.direction === 1;
      // outgoing flies past (forward) or recedes (back); incoming grows from the other side
      rt.outgoing.scale = fwd ? 1 + 1.4 * e : 1 - 0.55 * e;
      rt.outgoing.opacity = 1 - clamp01(k / 0.55);
      rt.incoming.scale = fwd ? 0.45 + 0.55 * e : 2.4 - 1.4 * e;
      rt.incoming.opacity = clamp01((k - 0.3) / 0.55);
      const target = new Vector3().lerpVectors(p.from.target, p.to.target, e);
      const dir = new Vector3().lerpVectors(p.from.dir, p.to.dir, e).normalize();
      const distance = p.from.distance + (p.to.distance - p.from.distance) * e;
      const pos = target.clone().addScaledVector(dir, distance);
      c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
      if (sceneRefs.haze) {
        const haze = Math.sin(Math.PI * k) * 0.55;
        sceneRefs.haze.style.opacity = haze.toFixed(3);
        sceneRefs.haze.style.setProperty("--haze-blur", `${(haze * 6).toFixed(2)}px`);
      }
      if (k >= 1) {
        plan.current = null;
        rt.active = false;
        rt.outgoing.opacity = 0;
        rt.incoming.opacity = 1;
        rt.incoming.scale = 1;
        if (sceneRefs.haze) sceneRefs.haze.style.opacity = "0";
        c.enabled = true;
        usePipelineStore.getState().finishTransition();
      }
      return;
    }

    const s = useExplorerStore.getState();
    const st = usePipelineStore.getState();
    if (s.autoRotate && !sceneRefs.dragging && !s.hover && STAGES[STAGE_KEYS[st.stage]].autoRotate !== false) c.rotate(rawDelta * 0.08, 0, false);

    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.near = Math.max(0.1, c.distance - radius.current * 0.4);
      fog.far = c.distance + radius.current * 3.2;
    }
  }, -1);

  return <CameraControls ref={ref} makeDefault smoothTime={0.32} draggingSmoothTime={0.1} dollySpeed={0.55} azimuthRotateSpeed={0.9} polarRotateSpeed={0.9} />;
}
