"use client";

import { useEffect, useRef } from "react";
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
import { Tour } from "./ui/Tour";
import { LoadingState } from "./ui/LoadingState";
import { LabelOverlay } from "./ui/LabelOverlay";
import { ProteinSwitcher } from "./ui/ProteinSwitcher";
import { PROTEINS } from "@/content/proteins";
import { pendingProtein, syncUrl } from "@/store/urlState";
import { useTourStore } from "@/store/tourStore";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useIsMobile } from "./useIsMobile";
import { SectionTabs } from "./ui/SectionTabs";
import { usePipelineStore } from "@/store/pipelineStore";
import PipelineView from "@/pipeline/PipelineView";
import { pipelineRuntime } from "@/pipeline/runtime";

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
  // During the tour its caption takes the place of the bottom controls (and of the info sheet on phones)
  const touring = useTourStore((s) => s.active);
  const section = useExplorerStore((s) => s.section);
  useKeyboardShortcuts();

  useEffect(() => {
    // A shared link may ask for another protein: switch first, then this effect runs again and loads it
    const linked = pendingProtein();
    if (linked && linked !== proteinId) {
      setProtein(linked);
      return;
    }
    load(proteinId);
  }, [load, proteinId, setProtein]);

  // Mirror the view in the address bar so it can be shared
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => syncUrl(useDataStore.getState().protein), 200);
    };
    const unsubView = useExplorerStore.subscribe(schedule);
    const unsubData = useDataStore.subscribe(schedule);
    const unsubPipeline = usePipelineStore.subscribe(schedule);
    return () => {
      window.clearTimeout(timer);
      unsubView();
      unsubData();
      unsubPipeline();
    };
  }, []);

  useEffect(() => {
    sceneRefs.haze = haze.current;
    return () => {
      sceneRefs.haze = null;
    };
  }, []);

  // Opt-in debugging / automation handle: add ?debug to the URL
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("debug")) {
      (window as unknown as Record<string, unknown>).__explorer = { useExplorerStore, useDataStore, usePipelineStore, sceneRefs, transitionRuntime, pipelineRuntime, getAnchor };
    }
  }, []);

  const ready = status === "ready" && currentId === proteinId;
  const entry = PROTEINS[proteinId];

  return (
    <>
      <div ref={haze} className="transition-haze pointer-events-none absolute inset-0 z-[5]" aria-hidden />
      {section === "make" ? (
        <PipelineView />
      ) : (
        <>
          {/* A fresh canvas per protein: clean WebGL resources and camera framing */}
          {ready && <SceneCanvas key={proteinId} />}
          {ready && <LabelOverlay />}

          {!ready && (
            <LoadingState
              label={`Loading ${entry.name} structure (PDB ${entry.pdbId})…`}
              error={status === "error" ? error : null}
              onRetry={() => load(proteinId)}
              onBack={proteinId !== "ubiquitin" ? () => setProtein("ubiquitin") : undefined}
            />
          )}

          {/* section tabs: their own row under the title on phones */}
          <div data-label-block className="pointer-events-auto absolute top-[34px] left-1/2 z-20 -translate-x-1/2 md:hidden">
            <SectionTabs compact />
          </div>

          {/* protein choice: centred under the title on larger screens, under the level pill on phones */}
          <div
            data-label-block
            className="pointer-events-auto absolute top-[96px] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2.5 md:flex lg:top-[70px]"
          >
            <SectionTabs />
            <ProteinSwitcher />
          </div>
          {!ready && (
            <div className="pointer-events-auto absolute top-[76px] left-4 z-20 md:hidden">
              <ProteinSwitcher />
            </div>
          )}

          {ready && (
            <>
              {/* top-left: level, magnification, scale bar, breadcrumb */}
              <div className="pointer-events-none absolute top-[76px] left-4 z-20 flex flex-col items-start gap-1.5 sm:left-8 md:top-[50px]">
                <div data-label-block className="pointer-events-auto">
                  <ScalePill />
                </div>
                <div data-label-block className="pointer-events-auto md:hidden">
                  <ProteinSwitcher />
                </div>
                <div data-label-block className="pointer-events-auto hidden md:block">
                  <Breadcrumb />
                </div>
              </div>

              {/* top-right: view controls */}
              <div data-label-block className="absolute top-[74px] right-4 z-20 sm:right-8 md:top-[48px]">
                <ViewControls />
              </div>

              {/* right: hierarchy navigation */}
              <div data-label-block className={`absolute right-4 z-20 sm:right-9 ${mobile ? "top-[34%] -translate-y-1/2" : "top-1/2 -translate-y-1/2"}`}>
                <LevelNav />
              </div>

              {mobile ? (
                <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 ${touring ? "pb-3" : ""}`}>
                  <Hints />
                  <Tour />
                  {!touring && (
                    <>
                      <div data-label-block className="pointer-events-auto flex w-full items-center justify-between gap-1.5 px-3">
                        <PrevButton />
                        <div className="min-w-0 overflow-x-auto">
                          <ContextControls />
                        </div>
                        <NextButton />
                      </div>
                      <div data-label-block className="w-full px-2">
                        <InfoPanel variant="sheet" />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div data-label-block className="pointer-events-none absolute top-1/2 left-6 z-20 -translate-y-[46%] sm:left-9">
                    <InfoPanel variant="side" />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-[46px] z-20 flex flex-col items-center gap-2.5">
                    <Hints />
                    <Tour />
                    {!touring && (
                      <div data-label-block className="pointer-events-auto flex items-center gap-2">
                        <PrevButton />
                        <ContextControls />
                        <NextButton />
                      </div>
                    )}
                  </div>
                </>
              )}
              <HoverTooltip />
            </>
          )}
        </>
      )}
    </>
  );
}
