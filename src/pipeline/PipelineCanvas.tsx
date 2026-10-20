"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { useExplorerStore } from "@/store/explorerStore";
import { STAGE_KEYS, usePipelineStore } from "@/store/pipelineStore";
import { FOV } from "@/scene/runtime";
import { StudioLights } from "@/scene/StudioLights";
import { SceneThemeSync } from "@/scene/SceneThemeSync";
import { SCENE_THEME } from "@/scene/shared/palette";
import type { StageRole } from "@/scene/StageGroup";
import { PipelineCamera } from "./PipelineCamera";
import { PipelineStage } from "./PipelineStage";
import { STAGES } from "./stages";

/** Mounts the current stage, or the outgoing and incoming stages while they change. */
function Stages() {
  const stage = usePipelineStore((s) => s.stage);
  const transition = usePipelineStore((s) => s.transition);
  const list: { index: number; role: StageRole }[] = transition
    ? [
        { index: transition.from, role: "outgoing" },
        { index: transition.to, role: "incoming" },
      ]
    : [{ index: stage, role: "current" }];
  return (
    <>
      {list.map(({ index, role }) => {
        const { Component } = STAGES[STAGE_KEYS[index]];
        return (
          <PipelineStage key={index} role={role}>
            <Component />
          </PipelineStage>
        );
      })}
    </>
  );
}

/** The WebGL canvas for the "How it was made" pipeline. */
export default function PipelineCanvas() {
  const [dpr, setDpr] = useState(1.75);
  const [bg] = useState(() => SCENE_THEME[useExplorerStore.getState().theme].bg);
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, dpr]}
      camera={{ fov: FOV, near: 0.05, far: 4000, position: [10, 12, 60] }}
      flat
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      onPointerMissed={() => useExplorerStore.getState().setHover(null)}
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 60, 400]} />
      <SceneThemeSync />
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />
      <AdaptiveDpr pixelated={false} />
      <StudioLights />
      <PipelineCamera />
      <Suspense fallback={null}>
        <Stages />
      </Suspense>
    </Canvas>
  );
}
