"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import type { Group, Vector3Tuple } from "three";
import { useExplorerStore } from "@/store/explorerStore";
import { useStage } from "../StageGroup";
import { useLabelStore, type LabelTone } from "./labelRegistry";

interface SceneLabelProps {
  position: Vector3Tuple;
  children: ReactNode;
  tone?: LabelTone;
  /** Shown even when the user hides optional labels */
  essential?: boolean;
  className?: string;
}

/**
 * Small HTML tag anchored to a 3D point (rendered by LabelOverlay).
 * Hidden while a level transition is running and on stages that are not current.
 */
export function SceneLabel({ position, children, tone = "default", essential = false, className = "" }: SceneLabelProps) {
  const { role } = useStage();
  const enabled = useExplorerStore((s) => (essential || s.showLabels) && !s.transition);
  const visible = enabled && role === "current";
  const anchor = useRef<Group>(null);
  const id = useId();

  useEffect(() => {
    if (!anchor.current) return;
    useLabelStore.getState().upsert({ id, anchor: anchor.current, content: children, tone, className, visible });
  }, [id, children, tone, className, visible]);

  useEffect(() => () => useLabelStore.getState().remove(id), [id]);

  return <group ref={anchor} position={position} />;
}
