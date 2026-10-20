"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, Object3D } from "three";
import { setBaseOpacity } from "@/scene/StageGroup";

/**
 * Cross-fades a sub-view of a stage (e.g. chromosome ↔ DNA close-up): each frame the group's
 * materials ease toward full or zero opacity, and the group is hidden once faded out.
 * `max` caps a material's opacity (materials keep their own maximum in userData.viewMax).
 */
export function useViewFade(visible: boolean, speed = 3.5) {
  const ref = useRef<Group>(null);
  const value = useRef(visible ? 1 : 0);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = visible ? 1 : 0;
    value.current += Math.sign(target - value.current) * Math.min(Math.abs(target - value.current), delta * speed);
    g.visible = value.current > 0.01;
    g.traverse((o: Object3D) => {
      const m = (o as Object3D & { material?: Material | Material[] }).material;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) setBaseOpacity(mm, (mm.userData.viewMax ?? 1) * value.current);
    });
  });
  return ref;
}
