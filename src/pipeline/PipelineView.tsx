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
import { StageActions, StageNext, StagePrev } from "./ui/StageControls";
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
              <div data-label-block className="pointer-events-auto flex w-full items-center justify-between gap-1.5 px-3">
                <StagePrev />
                <div className="min-w-0 overflow-x-auto">
                  <StageActions ctx={ctx} />
                </div>
                <StageNext />
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
              <div className="pointer-events-none absolute inset-x-0 bottom-[46px] z-20 flex flex-col items-center gap-2.5">
                <div data-label-block className="pointer-events-auto flex items-center gap-2">
                  <StagePrev />
                  <StageActions ctx={ctx} />
                  <StageNext />
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
