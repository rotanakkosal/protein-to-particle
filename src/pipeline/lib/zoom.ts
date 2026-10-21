"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, Object3D, Vector3 } from "three";
import { setBaseOpacity } from "@/scene/StageGroup";
import { stageDelta } from "../runtime";

interface ZoomOptions {
  /** Point of the overview the zoom dives into (it swells around this point) */
  outerPivot: Vector3;
  /** Point of the detail scene it grows out from */
  innerPivot: Vector3;
  outerScale?: number;
  innerScale?: number;
  seconds?: number;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
/** Fast start, gentle finish: the overview swells ahead of the camera, so the move reads as diving in */
const easeOut = (x: number) => 1 - (1 - x) ** 3;

function fade(root: Object3D, value: number) {
  root.traverse((o) => {
    const m = (o as Object3D & { material?: Material | Material[] }).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if (!mm.userData.ownFade) setBaseOpacity(mm, (mm.userData.viewMax ?? 1) * value);
  });
}

/**
 * Zooms from an overview object (a flask, a plate) into a detail scene (the cells, one well): the
 * overview swells around its pivot and fades while the detail grows out of the same spot. The
 * stage's framing follows its sub-view, so the camera moves at the same time. Materials whose
 * opacity the stage animates itself set `userData.ownFade` and multiply by `progress` instead.
 */
export function useZoom(zoomed: boolean, { outerPivot, innerPivot, outerScale = 6, innerScale = 0.18, seconds = 1.4 }: ZoomOptions) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const progress = useRef(zoomed ? 1 : 0);
  const applied = useRef(-1);

  useFrame((_, delta) => {
    const target = zoomed ? 1 : 0;
    const k = progress.current;
    progress.current = k + Math.sign(target - k) * Math.min(Math.abs(target - k), stageDelta(delta) / seconds);
    if (progress.current === applied.current && outer.current?.userData.zoomReady) return;
    applied.current = progress.current;
    const e = smooth(progress.current);
    const o = outer.current;
    const i = inner.current;
    if (o) {
      const s = 1 + (outerScale - 1) * easeOut(progress.current);
      o.scale.setScalar(s);
      o.position.copy(outerPivot).multiplyScalar(1 - s);
      o.visible = e < 0.999;
      fade(o, 1 - smooth(Math.min(1, e * 1.25)));
      o.userData.zoomReady = true;
    }
    if (i) {
      const s = innerScale + (1 - innerScale) * e;
      i.scale.setScalar(s);
      i.position.copy(innerPivot).multiplyScalar(1 - s);
      i.visible = e > 0.001;
      fade(i, smooth(Math.min(1, e * 1.25)));
    }
  });

  return { outer, inner, progress };
}
