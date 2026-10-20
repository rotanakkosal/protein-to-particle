"use client";

import { STAGE_META } from "@/content/pipeline";
import { STAGE_COUNT, usePipelineStore } from "@/store/pipelineStore";

/** "STAGE 3 / 10 · plasmid ≈ 1 µm of DNA": where you are in the pipeline and the real size shown. */
export function StagePill() {
  const stage = usePipelineStore((s) => s.transition?.to ?? s.stage);
  const meta = STAGE_META[stage];
  return (
    <div className="flex h-8 items-center gap-2 rounded-md bg-surface/95 px-2.5 text-[11.5px] whitespace-nowrap shadow-[0_1px_3px_rgba(7,38,90,0.12)] sm:h-9 sm:px-3 sm:text-[12px]">
      <span className="font-semibold tracking-[0.08em] text-brand-ink">
        STAGE {stage + 1}
        <span className="text-faint"> / {STAGE_COUNT}</span>
      </span>
      <span className="hidden text-faint sm:inline">·</span>
      <span className="hidden text-muted sm:inline">{meta.scale}</span>
    </div>
  );
}
