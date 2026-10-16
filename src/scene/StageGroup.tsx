"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, Object3D } from "three";
import { transitionRuntime } from "./runtime";
import type { Level } from "@/store/explorerStore";

export type StageRole = "current" | "outgoing" | "incoming";

interface StageInfo {
  role: StageRole;
  level: Level;
}

const StageContext = createContext<StageInfo>({ role: "current", level: 0 });
export const useStage = () => useContext(StageContext);

/**
 * Per-material opacity: components set `material.userData.baseOpacity` for their own fades
 * (dimming, LOD); the stage multiplies it by the transition fade. Switching between opaque and
 * transparent rendering recompiles the material once (three.js bakes OPAQUE into the shader).
 */
export function setBaseOpacity(material: Material, value: number) {
  material.userData.baseOpacity = value;
}

function applyFade(material: Material, fade: number) {
  const ud = material.userData;
  if (ud.baseOpacity === undefined) ud.baseOpacity = material.opacity;
  const opacity = ud.baseOpacity * fade;
  const wantTransparent = ud.forceTransparent === true || opacity < 0.999;
  if (material.transparent !== wantTransparent) {
    material.transparent = wantTransparent;
    material.needsUpdate = true;
  }
  material.opacity = opacity;
  if (ud.keepDepthWrite === undefined) ud.keepDepthWrite = material.depthWrite;
  material.depthWrite = ud.keepDepthWrite && (ud.forceTransparent === true || opacity > 0.55);
}

function fadeTree(root: Object3D, fade: number) {
  root.traverse((obj) => {
    const m = (obj as Object3D & { material?: Material | Material[] }).material;
    if (!m) return;
    if (Array.isArray(m)) m.forEach((mm) => applyFade(mm, fade));
    else applyFade(m, fade);
  });
}

export function StageGroup({ level, role, children }: { level: Level; role: StageRole; children: ReactNode }) {
  const ref = useRef<Group>(null);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let opacity = 1;
    if (role === "current") {
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
    } else {
      const s = role === "outgoing" ? transitionRuntime.outgoing : transitionRuntime.incoming;
      g.position.copy(s.position);
      g.scale.setScalar(s.scale);
      opacity = s.opacity;
    }
    g.visible = opacity > 0.004;
    if (g.visible) fadeTree(g, opacity);
  });

  return (
    <StageContext.Provider value={{ role, level }}>
      <group ref={ref}>{children}</group>
    </StageContext.Provider>
  );
}
