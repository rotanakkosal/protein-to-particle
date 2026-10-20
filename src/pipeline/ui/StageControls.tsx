"use client";

import { ChevronLeft, ChevronRight, RotateCcw, Telescope } from "lucide-react";
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

/** The stage's own actions: the next lab step, view switches and replay. */
export function StageActions({ ctx }: { ctx: PipelineContext }) {
  const stage = usePipelineStore((s) => (s.transition ? null : s.stage));
  const steps = usePipelineStore((s) => s.steps);
  const geneView = usePipelineStore((s) => s.geneView);
  const crystalView = usePipelineStore((s) => s.crystalView);
  const rotating = usePipelineStore((s) => s.rotating);
  const showRings = usePipelineStore((s) => s.showRings);
  const { advance, replay, set } = usePipelineStore.getState();
  const mode = useExplorerStore((s) => s.mode);
  if (stage === null) return null;
  const key = STAGE_KEYS[stage];
  const info = stageInfo(key, ctx, mode);
  const step = steps[key];
  const total = STAGE_STEPS[key];

  const primary =
    total > 0 &&
    (step < total ? (
      <button type="button" onClick={() => advance(key)} className={`${stepBase} border-brand bg-brand text-white hover:bg-brand-dark`}>
        <span className="tabular-nums opacity-75">{total > 1 ? `${step + 1}/${total}` : ""}</span>
        {info.steps[step].action}
      </button>
    ) : key === "structure" ? (
      <button type="button" onClick={openInExplorer} className={`${stepBase} border-brand bg-brand text-white hover:bg-brand-dark`}>
        <Telescope className="h-3.5 w-3.5" aria-hidden />
        Open {ctx.protein.idCode} in the explorer
      </button>
    ) : null);
  const again = total > 0 && step > 0 && (
    <button type="button" onClick={() => replay(key)} className={`${stepBase} border-line bg-surface/95 text-ink hover:border-brand hover:text-brand-ink`} title="Start this stage again">
      <RotateCcw className="h-3 w-3" aria-hidden />
      <span className="hidden sm:inline">Replay</span>
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      {key === "gene" && (
        <Segmented
          label="Gene view"
          value={geneView}
          onChange={(v) => set({ geneView: v })}
          options={[
            { v: "chromosome", l: "Chromosome 12", s: "Chromosome" },
            { v: "dna", l: "DNA close-up", s: "DNA" },
          ]}
        />
      )}
      {key === "crystal" && (
        <Segmented
          label="Crystal view"
          value={crystalView}
          onChange={(v) => set({ crystalView: v })}
          options={[
            { v: "drop", l: "Hanging drop", s: "Drop" },
            { v: "lattice", l: "Inside the crystal", s: "Inside" },
          ]}
        />
      )}
      {key === "diffraction" && (
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
      )}
      {primary}
      {again}
    </div>
  );
}

export function StagePrev() {
  const stage = usePipelineStore((s) => s.stage);
  const busy = usePipelineStore((s) => s.transition !== null);
  const previous = usePipelineStore((s) => s.previous);
  const prev = stage > 0 ? STAGE_META[stage - 1] : null;
  return (
    <button type="button" onClick={previous} disabled={!prev || busy} className={`${stepBase} border-line bg-surface/95 text-ink hover:border-brand hover:text-brand-ink`} title="Previous stage (←)">
      <ChevronLeft className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{prev ? prev.name : "Previous stage"}</span>
      <span className="sm:hidden">Back</span>
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
