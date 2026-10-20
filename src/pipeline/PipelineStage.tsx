"use client";

import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { fadeTree, StageContext, type StageRole } from "@/scene/StageGroup";
import { pipelineRuntime } from "./runtime";

/**
 * Wraps one pipeline stage: while stages change, the outgoing one swells or shrinks and fades,
 * and the incoming one grows into place (same material fading as the explorer's level stages).
 */
export function PipelineStage({ role, children }: { role: StageRole; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let opacity = 1;
    let scale = 1;
    if (role !== "current") {
      const s = role === "outgoing" ? pipelineRuntime.outgoing : pipelineRuntime.incoming;
      opacity = s.opacity;
      scale = s.scale;
    }
    g.scale.setScalar(scale);
    g.visible = opacity > 0.004;
    if (g.visible) fadeTree(g, opacity);
  });
  return (
    <StageContext.Provider value={{ role, level: 0 }}>
      <group ref={ref}>{children}</group>
    </StageContext.Provider>
  );
}
