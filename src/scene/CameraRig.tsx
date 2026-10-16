"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Fog, PerspectiveCamera, Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";
import { useExplorerStore } from "@/store/explorerStore";
import { computeViewport, FOV, framingDistance, sceneRefs, transitionRuntime } from "./runtime";
import { getFraming } from "./framing";

/**
 * Owns the orbit camera: view offset (keeps the model clear of the side panels), level framing,
 * zoom / reset commands, gentle auto-rotation, depth fog and the live scale-bar measurement.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const level = useExplorerStore((s) => s.level);
  const transition = useExplorerStore((s) => s.transition);
  const viewCommand = useExplorerStore((s) => s.viewCommand);
  const lastScaleUpdate = useRef(0);
  const settledRadius = useRef(20);
  const initialised = useRef(false);

  // Keep the projection centred on the free area between the panels
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
    const onStart = () => {
      sceneRefs.dragging = true;
      useExplorerStore.getState().markInteracted();
    };
    const onEnd = () => {
      sceneRefs.dragging = false;
    };
    c.addEventListener("controlstart", onStart);
    c.addEventListener("controlend", onEnd);
    return () => {
      c.removeEventListener("controlstart", onStart);
      c.removeEventListener("controlend", onEnd);
      sceneRefs.controls = null;
    };
  }, []);

  const frame = (animate: boolean) => {
    const c = ref.current;
    if (!c) return;
    const f = getFraming(useExplorerStore.getState().level);
    const target = f.target;
    const current = c.getPosition(new Vector3()).sub(c.getTarget(new Vector3()));
    const dir = (f.direction ?? current.normalize()).clone();
    const dist = framingDistance(f.radius);
    const pos = target.clone().addScaledVector(dir, dist);
    c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate);
  };

  // Initial framing and per-level distance limits once a level has settled
  useEffect(() => {
    const c = ref.current;
    if (!c || transition) return;
    const f = getFraming(level);
    settledRadius.current = f.radius;
    c.minDistance = f.radius * 0.35;
    c.maxDistance = framingDistance(f.radius) * 3;
    if (!initialised.current) {
      initialised.current = true;
      frame(false);
    }
  }, [level, transition]);

  // Zoom / reset / refocus commands from the UI
  useEffect(() => {
    const c = ref.current;
    if (!c || !viewCommand || useExplorerStore.getState().transition) return;
    if (viewCommand.type === "zoomIn") c.dolly(c.distance * 0.28, true);
    else if (viewCommand.type === "zoomOut") c.dolly(-c.distance * 0.38, true);
    else {
      const f = getFraming(useExplorerStore.getState().level);
      settledRadius.current = f.radius;
      c.minDistance = f.radius * 0.35;
      c.maxDistance = framingDistance(f.radius) * 3;
      frame(true);
    }
  }, [viewCommand]);

  // Re-fit when the window is resized
  useEffect(() => {
    if (initialised.current && !useExplorerStore.getState().transition) frame(true);
  }, [size.width, size.height]);

  useFrame((state, delta) => {
    const c = ref.current;
    if (!c) return;
    const s = useExplorerStore.getState();

    if (s.autoRotate && !s.transition && !sceneRefs.dragging && !s.hover) {
      c.rotate(delta * 0.11, 0, false);
    }

    // Depth fog follows the focus distance so far parts fade softly into the background
    const distance = c.distance;
    const R = transitionRuntime.active ? transitionRuntime.fogRadius : settledRadius.current;
    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.near = Math.max(0.1, distance - R * 0.25);
      fog.far = distance + R * 2.8;
    }

    // Scale bar: CSS pixels per scene unit at the focus distance (throttled store update)
    if (state.clock.elapsedTime - lastScaleUpdate.current > 0.12) {
      lastScaleUpdate.current = state.clock.elapsedTime;
      const px = size.height / (2 * distance * Math.tan((FOV * Math.PI) / 360));
      if (Math.abs(px - s.pxPerUnit) / s.pxPerUnit > 0.01) s.setPxPerUnit(px);
    }
  }, -1);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.32}
      draggingSmoothTime={0.1}
      dollySpeed={0.55}
      truckSpeed={1}
      azimuthRotateSpeed={0.9}
      polarRotateSpeed={0.9}
    />
  );
}
