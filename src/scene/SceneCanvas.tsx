"use client";

import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor } from "@react-three/drei";
import { useExplorerStore } from "@/store/explorerStore";
import { CameraRig } from "./CameraRig";
import { TransitionController } from "./TransitionController";
import { StageManager } from "./StageManager";
import { StudioLights } from "./StudioLights";
import { FOV } from "./runtime";
import { SCENE_THEME } from "./shared/palette";
import { SceneThemeSync } from "./SceneThemeSync";

/** The WebGL canvas: lights, camera rig, transition engine and the level stages. */
export default function SceneCanvas() {
  const [dpr, setDpr] = useState(1.75);
  // Initial colours for the current theme (SceneThemeSync follows later changes)
  const [bg] = useState(() => SCENE_THEME[useExplorerStore.getState().theme].bg);
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, dpr]}
      camera={{ fov: FOV, near: 0.05, far: 2000, position: [20, 25, 110] }}
      flat
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      raycaster={{ params: { Points: { threshold: 0.12 }, Mesh: {}, Line: { threshold: 0.1 }, LOD: {}, Sprite: {} } }}
      onPointerMissed={() => useExplorerStore.getState().setHover(null)}
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 60, 200]} />
      <SceneThemeSync />
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} flipflops={3} onFallback={() => setDpr(1)} />
      <AdaptiveDpr pixelated={false} />
      <StudioLights />
      <CameraRig />
      <TransitionController />
      <Suspense fallback={null}>
        <StageManager />
      </Suspense>
    </Canvas>
  );
}
