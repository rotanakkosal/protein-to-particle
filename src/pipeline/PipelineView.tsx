"use client";

import { useMemo } from "react";
import { useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import type { PipelineContext } from "@/content/pipeline";
import { useIsMobile } from "@/components/useIsMobile";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { ViewControls } from "@/components/ui/ViewControls";
import { HoverTooltip } from "@/components/ui/HoverTooltip";
import { LabelOverlay } from "@/components/ui/LabelOverlay";
import { LoadingState } from "@/components/ui/LoadingState";
import PipelineCanvas from "./PipelineCanvas";
import { StagePanel } from "./ui/StagePanel";
import { PipelineNav } from "./ui/PipelineNav";
import { StageNext, StagePrev, StagePrimary, StageReplay, StageViewToggles, useStageHasSteps } from "./ui/StageControls";
import { StagePill } from "./ui/StagePill";
import { StageWidget } from "./ui/StageWidget";

/** "How it was made": the lab pipeline behind PDB 4OBE, laid out like the explorer. */
export default function PipelineView() {
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const currentId = useDataStore((s) => s.currentId);
  const protein = useDataStore((s) => s.protein);
  const load = useDataStore((s) => s.load);
  const setSection = useExplorerStore((s) => s.setSection);
  const mobile = useIsMobile();
  const hasSteps = useStageHasSteps();

  const ctx: PipelineContext | null = useMemo(
    () => (protein?.experiment && currentId === "kras" ? { protein, exp: protein.experiment, crystal: protein.crystal ?? null } : null),
    [protein, currentId],
  );
  const ready = status === "ready" && ctx !== null;

  return (
    <>
      {ready && <PipelineCanvas />}
      {ready && <LabelOverlay />}
      {!ready && (
        <LoadingState
          label="Loading the KRAS record (PDB 4OBE)…"
          error={status === "error" ? error : null}
          onRetry={() => load("kras")}
          onBack={() => setSection("explore")}
          backLabel="Back to the explorer"
        />
      )}

      <div data-label-block className="pointer-events-auto absolute top-[34px] left-1/2 z-20 -translate-x-1/2 md:hidden">
        <SectionTabs compact />
      </div>
      <div
        data-label-block
        className="pointer-events-auto absolute top-[96px] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-2.5 md:flex lg:top-[70px]"
      >
        <SectionTabs />
        <span className="rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-muted shadow-[0_1px_3px_rgba(7,38,90,0.08)]">
          Following <span className="font-semibold text-ink">KRAS</span> · PDB 4OBE
        </span>
      </div>

      {ready && ctx && (
        <>
          <div className="pointer-events-none absolute top-[76px] left-4 z-20 flex flex-col items-start gap-1.5 sm:left-8 md:top-[50px]">
            <div data-label-block className="pointer-events-auto">
              <StagePill />
            </div>
          </div>

          <div data-label-block className="absolute top-[74px] right-4 z-20 sm:right-8 md:top-[48px]">
            <ViewControls variant="make" />
          </div>

          <div data-label-block className={`absolute right-4 z-20 sm:right-9 ${mobile ? "top-[40%] -translate-y-1/2" : "top-1/2 -translate-y-1/2"}`}>
            <PipelineNav />
          </div>

          {mobile ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2">
              {hasSteps && (
                <div data-label-block className="pointer-events-auto flex items-center gap-1.5 empty:hidden">
                  <StageViewToggles />
                </div>
              )}
              {/* fixed side columns keep the main action in the same place on every stage */}
              <div data-label-block className="pointer-events-auto grid w-full grid-cols-[2.75rem_1fr_5.75rem] items-center gap-1 px-3">
                <StagePrev />
                <div className="flex min-w-0 items-center justify-center gap-1">
                  {hasSteps ? (
                    <>
                      <StagePrimary ctx={ctx} className="w-[min(186px,calc(100vw_-_208px))] shrink-0" />
                      <StageReplay />
                    </>
                  ) : (
                    <StageViewToggles />
                  )}
                </div>
                <div className="flex justify-end">
                  <StageNext />
                </div>
              </div>
              <div data-label-block className="w-full px-2">
                <StagePanel ctx={ctx} variant="sheet" widget={<StageWidget ctx={ctx} />} />
              </div>
            </div>
          ) : (
            <>
              <div data-label-block className="pointer-events-none absolute top-1/2 left-6 z-20 -translate-y-[46%] sm:left-9">
                <StagePanel ctx={ctx} variant="side" widget={<StageWidget ctx={ctx} />} />
              </div>
              {/* the main action keeps a fixed slot in the centre; everything else sits either side of it */}
              <div className="pointer-events-none absolute inset-x-0 bottom-[46px] z-20 flex justify-center px-4">
                <div className="grid w-full max-w-[1040px] grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div data-label-block className="pointer-events-auto flex items-center justify-end gap-2 justify-self-end">
                    <StagePrev />
                    {hasSteps && <StageViewToggles />}
                  </div>
                  <div data-label-block className="pointer-events-auto flex justify-center">
                    {hasSteps ? (
                      <StagePrimary ctx={ctx} className="w-[244px]" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <StageViewToggles />
                      </div>
                    )}
                  </div>
                  <div data-label-block className="pointer-events-auto flex items-center gap-2 justify-self-start">
                    {hasSteps && <StageReplay />}
                    <StageNext />
                  </div>
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
