"use client";

import { Check, ChevronLeft, ChevronRight, RotateCcw, Telescope } from "lucide-react";
import { STAGE_META, stageInfo, type PipelineContext } from "@/content/pipeline";
import { useExplorerStore } from "@/store/explorerStore";
import { STAGE_COUNT, STAGE_KEYS, STAGE_STEPS, usePipelineStore } from "@/store/pipelineStore";
import { Segmented, stepBase, Toggle } from "@/components/ui/BottomBar";

/** Leaves the pipeline and opens the finished structure at Level I of the explorer. */
export function openInExplorer() {
  const st = useExplorerStore.getState();
  if (st.selection.proteinId !== "kras") st.setProtein("kras");
  st.setSection("explore");
}

/** Stage-specific view switches (gene: chromosome ↔ DNA, crystal: plate ↔ inside, diffraction: rotate, rings). */
export function StageViewToggles() {
  const stage = usePipelineStore((s) => (s.transition ? null : s.stage));
  const geneView = usePipelineStore((s) => s.geneView);
  const crystalView = usePipelineStore((s) => s.crystalView);
  const rotating = usePipelineStore((s) => s.rotating);
  const showRings = usePipelineStore((s) => s.showRings);
  const { set } = usePipelineStore.getState();
  if (stage === null) return null;
  const key = STAGE_KEYS[stage];
  if (key === "gene")
    return (
      <Segmented
        label="Gene view"
        value={geneView}
        onChange={(v) => set({ geneView: v })}
        options={[
          { v: "chromosome", l: "Chromosome 12", s: "Chromosome" },
          { v: "dna", l: "DNA close-up", s: "DNA" },
        ]}
      />
    );
  if (key === "crystal")
    return (
      <Segmented
        label="Crystal view"
        value={crystalView}
        onChange={(v) => set({ crystalView: v })}
        options={[
          { v: "drop", l: "Plate and drops", s: "Plate" },
          { v: "lattice", l: "Inside the crystal", s: "Inside" },
        ]}
      />
    );
  if (key === "diffraction")
    return (
      <>
        <Toggle on={rotating} onChange={(v) => set({ rotating: v })}>
          <span className="hidden sm:inline">Rotate crystal</span>
          <span className="sm:hidden">Rotate</span>
        </Toggle>
        <Toggle on={showRings} onChange={(v) => set({ showRings: v })}>
          <span className="hidden sm:inline">Resolution rings</span>
          <span className="sm:hidden">Rings</span>
        </Toggle>
      </>
    );
  return null;
}

/** Whether the current stage has lab steps (otherwise its view switches take the centre slot). */
export function useStageHasSteps() {
  return usePipelineStore((s) => STAGE_STEPS[STAGE_KEYS[s.transition?.to ?? s.stage]] > 0);
}

/**
 * The next lab step, in a slot of fixed width so the button stays in the same place from step to
 * step and stage to stage. When every step is done it shows a quiet "done" state in the same slot.
 */
export function StagePrimary({ ctx, className = "" }: { ctx: PipelineContext; className?: string }) {
  const stage = usePipelineStore((s) => (s.transition ? null : s.stage));
  const steps = usePipelineStore((s) => s.steps);
  const { advance } = usePipelineStore.getState();
  const mode = useExplorerStore((s) => s.mode);
  const slot = `${stepBase} justify-center ${className}`;
  if (stage === null) return <span className={`${slot} invisible border-transparent`} aria-hidden />;
  const key = STAGE_KEYS[stage];
  const total = STAGE_STEPS[key];
  const step = steps[key];
  const info = stageInfo(key, ctx, mode);
  if (step < total)
    return (
      <button type="button" onClick={() => advance(key)} className={`${slot} border-brand bg-brand text-white hover:bg-brand-dark`} title={info.steps[step].action}>
        {total > 1 && <span className="tabular-nums opacity-75">{`${step + 1}/${total}`}</span>}
        <span className="min-w-0 truncate">{info.steps[step].action}</span>
      </button>
    );
  if (key === "structure")
    return (
      <button type="button" onClick={openInExplorer} className={`${slot} border-brand bg-brand text-white hover:bg-brand-dark`}>
        <Telescope className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">Open {ctx.protein.idCode} in the explorer</span>
      </button>
    );
  return (
    <span className={`${slot} border-line bg-surface/95 text-muted`} role="status">
      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
      All steps done
    </span>
  );
}

/** Restarts the stage. Its space is kept even before the first step, so nothing shifts when it appears. */
export function StageReplay() {
  const stage = usePipelineStore((s) => (s.transition ? null : s.stage));
  const steps = usePipelineStore((s) => s.steps);
  const { replay } = usePipelineStore.getState();
  const key = stage === null ? null : STAGE_KEYS[stage];
  const shown = key !== null && STAGE_STEPS[key] > 0 && steps[key] > 0;
  return (
    <button
      type="button"
      onClick={() => key && replay(key)}
      className={`${stepBase} border-line bg-surface/95 text-ink hover:border-brand hover:text-brand-ink max-sm:px-2.5 ${shown ? "" : "invisible"}`}
      title="Start this stage again"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
    >
      <RotateCcw className="h-3 w-3" aria-hidden />
      <span className="hidden sm:inline">Replay</span>
    </button>
  );
}

export function StagePrev() {
  const stage = usePipelineStore((s) => s.stage);
  const busy = usePipelineStore((s) => s.transition !== null);
  const previous = usePipelineStore((s) => s.previous);
  const prev = stage > 0 ? STAGE_META[stage - 1] : null;
  return (
    <button
      type="button"
      onClick={previous}
      disabled={!prev || busy}
      className={`${stepBase} border-line bg-surface/95 text-ink hover:border-brand hover:text-brand-ink`}
      title="Previous stage (←)"
      aria-label={prev ? `Previous stage: ${prev.name}` : "Previous stage"}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      {/* on phones the arrow alone, so the main action keeps a fixed, readable width */}
      <span className="hidden sm:inline">{prev ? prev.name : "Previous stage"}</span>
    </button>
  );
}

export function StageNext() {
  const stage = usePipelineStore((s) => s.stage);
  const busy = usePipelineStore((s) => s.transition !== null);
  const next = usePipelineStore((s) => s.next);
  const last = stage === STAGE_COUNT - 1;
  const nextMeta = last ? null : STAGE_META[stage + 1];
  return (
    <button
      type="button"
      onClick={last ? openInExplorer : next}
      disabled={busy}
      className={`${stepBase} border-brand bg-brand text-white hover:bg-brand-dark`}
      title={last ? "Open the finished structure in the explorer" : "Next stage (→)"}
    >
      <span className="hidden sm:inline">{nextMeta ? `Next: ${nextMeta.name}` : "Explore 4OBE"}</span>
      <span className="sm:hidden">{last ? "Explore" : "Next"}</span>
      {last ? <Telescope className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}
