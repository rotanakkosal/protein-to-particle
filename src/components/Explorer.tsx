"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import SceneCanvas from "@/scene/SceneCanvas";
import { sceneRefs, transitionRuntime } from "@/scene/runtime";
import { getAnchor } from "@/scene/framing";
import { ScalePill } from "./ui/ScalePill";
import { Breadcrumb } from "./ui/Breadcrumb";
import { ViewControls } from "./ui/ViewControls";
import { LevelNav } from "./ui/LevelNav";
import { InfoPanel } from "./ui/InfoPanel";
import { ContextControls, NextButton, PrevButton } from "./ui/BottomBar";
import { HoverTooltip } from "./ui/HoverTooltip";
import { Hints } from "./ui/Hints";
import { LoadingState } from "./ui/LoadingState";
import { LabelOverlay } from "./ui/LabelOverlay";
import { ProteinSwitcher } from "./ui/ProteinSwitcher";
import { PROTEINS } from "@/content/proteins";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const mobileQuery = "(max-width: 767px)";
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(mobileQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
}

/** The interactive explorer: 3D canvas plus the HTML overlay around it. */
export default function Explorer() {
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const load = useDataStore((s) => s.load);
  const currentId = useDataStore((s) => s.currentId);
  const proteinId = useExplorerStore((s) => s.selection.proteinId);
  const setProtein = useExplorerStore((s) => s.setProtein);
  const haze = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  useKeyboardShortcuts();

  useEffect(() => {
    load(proteinId);
  }, [load, proteinId]);

  useEffect(() => {
    sceneRefs.haze = haze.current;
    return () => {
      sceneRefs.haze = null;
    };
  }, []);

  // Opt-in debugging / automation handle: add ?debug to the URL
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("debug")) {
      (window as unknown as Record<string, unknown>).__explorer = { useExplorerStore, useDataStore, sceneRefs, transitionRuntime, getAnchor };
    }
  }, []);

  const ready = status === "ready" && currentId === proteinId;
  const entry = PROTEINS[proteinId];

  return (
    <>
      {/* A fresh canvas per protein: clean WebGL resources and camera framing */}
      {ready && <SceneCanvas key={proteinId} />}
      {ready && <LabelOverlay />}
      <div ref={haze} className="transition-haze pointer-events-none absolute inset-0 z-[5]" aria-hidden />

      {!ready && (
        <LoadingState
          label={`Loading ${entry.name} structure (PDB ${entry.pdbId})…`}
          error={status === "error" ? error : null}
          onRetry={() => load(proteinId)}
          onBack={proteinId !== "ubiquitin" ? () => setProtein("ubiquitin") : undefined}
        />
      )}

      {/* protein choice: centred under the title on larger screens, under the level pill on phones */}
      <div className="pointer-events-auto absolute top-[96px] left-1/2 z-20 hidden -translate-x-1/2 md:block lg:top-[70px]">
        <ProteinSwitcher />
      </div>
      {!ready && (
        <div className="pointer-events-auto absolute top-[42px] left-4 z-20 md:hidden">
          <ProteinSwitcher />
        </div>
      )}

      {ready && (
        <>
          {/* top-left: level, magnification, scale bar, breadcrumb */}
          <div className="pointer-events-none absolute top-[42px] left-4 z-20 flex flex-col items-start gap-1.5 sm:top-[50px] sm:left-8">
            <div className="pointer-events-auto">
              <ScalePill />
            </div>
            <div className="pointer-events-auto md:hidden">
              <ProteinSwitcher />
            </div>
            <div className="pointer-events-auto hidden md:block">
              <Breadcrumb />
            </div>
          </div>

          {/* top-right: view controls */}
          <div className="absolute top-[40px] right-4 z-20 sm:top-[48px] sm:right-8">
            <ViewControls />
          </div>

          {/* right: hierarchy navigation */}
          <div className={`absolute right-4 z-20 sm:right-9 ${mobile ? "top-[34%] -translate-y-1/2" : "top-1/2 -translate-y-1/2"}`}>
            <LevelNav />
          </div>

          {mobile ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2">
              <Hints />
              <div className="pointer-events-auto flex w-full items-center justify-between gap-1.5 px-3">
                <PrevButton />
                <div className="min-w-0 overflow-x-auto">
                  <ContextControls />
                </div>
                <NextButton />
              </div>
              <div className="w-full px-2">
                <InfoPanel variant="sheet" />
              </div>
            </div>
          ) : (
            <>
              <div className="pointer-events-none absolute top-1/2 left-6 z-20 -translate-y-[46%] sm:left-9">
                <InfoPanel variant="side" />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-[46px] z-20 flex flex-col items-center gap-2.5">
                <Hints />
                <div className="pointer-events-auto flex items-center gap-2">
                  <PrevButton />
                  <ContextControls />
                  <NextButton />
                </div>
              </div>
            </>
          )}
          <HoverTooltip />
        </>
      )}
    </>
  );
}
