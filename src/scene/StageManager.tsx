"use client";

import type { ComponentType } from "react";
import { useExplorerStore, type Level } from "@/store/explorerStore";
import { StageGroup, type StageRole } from "./StageGroup";
import { ProteinLevel } from "./levels/ProteinLevel";
import { PolypeptideLevel } from "./levels/PolypeptideLevel";
import { AminoAcidLevel } from "./levels/AminoAcidLevel";
import { AtomLevel } from "./levels/AtomLevel";
import { ParticleLevel } from "./levels/ParticleLevel";

const LEVEL_COMPONENTS: Record<Level, ComponentType> = {
  0: ProteinLevel,
  1: PolypeptideLevel,
  2: AminoAcidLevel,
  3: AtomLevel,
  4: ParticleLevel,
};

/**
 * Mounts the current level, or both the outgoing and incoming levels during a transition.
 * Stages are keyed by level so a level keeps its state as it switches between roles.
 */
export function StageManager() {
  const level = useExplorerStore((s) => s.level);
  const transition = useExplorerStore((s) => s.transition);

  const stages: { level: Level; role: StageRole }[] = transition
    ? [
        { level: transition.from, role: "outgoing" },
        { level: transition.to, role: "incoming" },
      ]
    : [{ level, role: "current" }];

  return (
    <>
      {stages.map(({ level: l, role }) => {
        const Component = LEVEL_COMPONENTS[l];
        return (
          <StageGroup key={l} level={l} role={role}>
            <Component />
          </StageGroup>
        );
      })}
    </>
  );
}
