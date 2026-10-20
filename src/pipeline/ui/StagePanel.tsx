"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ChevronDown, ChevronsDown, Info, MousePointerClick } from "lucide-react";
import { STAGE_META, stageInfo, type FactSource, type PipelineContext, type StageInfo } from "@/content/pipeline";
import { useExplorerStore } from "@/store/explorerStore";
import { STAGE_KEYS, usePipelineStore } from "@/store/pipelineStore";
import { useMoreBelow } from "@/components/ui/InfoPanel";

const BADGE: Record<FactSource, { label: string; className: string; title: string } | null> = {
  "4OBE": { label: "4OBE", className: "bg-brand-soft text-brand-ink", title: "Recorded in the PDB entry 4OBE" },
  computed: { label: "computed", className: "bg-paper-2 text-brand-mid", title: "Calculated from the data in 4OBE" },
  typical: { label: "typical", className: "bg-amber-note text-amber-ink", title: "Common lab practice, not recorded for 4OBE" },
  known: null,
};

function SourceBadge({ source }: { source: FactSource }) {
  const b = BADGE[source];
  if (!b) return null;
  return (
    <span title={b.title} className={`ml-1 inline-block rounded-[3px] px-1 text-[9px] leading-[14px] font-bold tracking-wide uppercase ${b.className}`}>
      {b.label}
    </span>
  );
}

/** Left-hand card (bottom sheet on phones) describing the current stage, its real data and its steps. */
export function StagePanel({ ctx, variant, widget }: { ctx: PipelineContext; variant: "side" | "sheet"; widget?: ReactNode }) {
  const stage = usePipelineStore((s) => s.transition?.to ?? s.stage);
  const key = STAGE_KEYS[stage];
  const step = usePipelineStore((s) => s.steps[key]);
  const mode = useExplorerStore((s) => s.mode);
  const [collapsed, setCollapsed] = useState(false);
  const info = stageInfo(key, ctx, mode);
  const meta = STAGE_META[stage];
  const Icon = meta.icon;
  const sheet = variant === "sheet";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.section
        key={`${key}|${mode}`}
        initial={{ opacity: 0, y: sheet ? 18 : 26 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 } }}
        exit={{ opacity: 0, y: sheet ? 10 : 16, transition: { duration: 0.22, ease: "easeIn" } }}
        aria-live="polite"
        className={
          sheet
            ? "pointer-events-auto flex max-h-[36dvh] w-full flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-surface shadow-[0_-4px_20px_rgba(7,38,90,0.10)]"
            : "pointer-events-auto flex max-h-[calc(100dvh-250px)] w-[330px] flex-col overflow-hidden rounded-[6px] border border-line bg-surface shadow-[0_2px_14px_rgba(7,38,90,0.08)] xl:w-[350px]"
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-2 bg-brand px-4 py-2">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.1em] text-white uppercase">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            Stage {stage + 1} / {STAGE_KEYS.length} · {meta.name}
          </p>
          {sheet && (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="rounded-md p-0.5 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label={collapsed ? "Expand information" : "Collapse information"}
              aria-expanded={!collapsed}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        <header className="px-4 pt-3">
          <h2 className="font-display text-[21px] leading-[1.2] font-extrabold tracking-[-0.01em] text-balance text-brand-ink">{info.title}</h2>
          <p className="mt-0.5 text-[12px] leading-snug font-medium text-brand-mid">{info.subtitle}</p>
        </header>
        {!(sheet && collapsed) && <Body info={info} step={step} widget={widget} />}
      </motion.section>
    </AnimatePresence>
  );
}

function Body({ info, step, widget }: { info: StageInfo; step: number; widget?: ReactNode }) {
  const [tab, setTab] = useState(info.sections[0].id);
  const section = info.sections.find((s) => s.id === tab) ?? info.sections[0];
  const { ref, more, update, scrollMore } = useMoreBelow();
  const done = step > 0 ? info.steps[step - 1] : null;
  const nextStep = info.steps[step];

  return (
    <div className="relative flex min-h-0 flex-col">
      <div ref={ref} onScroll={update} className="thin-scroll overflow-y-auto px-4 pt-2 pb-3.5">
        <div>
          <p className="text-[12.5px] leading-[1.55] text-body">{info.summary}</p>

          {info.steps.length > 0 && (
            <div className="mt-2.5 rounded-md border-l-[3px] border-brand bg-brand-soft px-2.5 py-2 text-[12px] leading-snug text-brand-ink">
              <div className="mb-1 flex gap-1" aria-label={`Step ${step} of ${info.steps.length}`}>
                {info.steps.map((_, i) => (
                  <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-brand" : "bg-brand/20"}`} />
                ))}
              </div>
              {done ? (
                <p className="flex gap-1.5 font-medium">
                  <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{done.done}</span>
                </p>
              ) : (
                <p className="font-medium">Ready. Press “{nextStep?.action}” below to start.</p>
              )}
            </div>
          )}

          {widget}

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line/70 pt-2.5">
            {info.facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="flex items-center text-[10px] tracking-wide text-muted uppercase">
                  {f.label}
                  <SourceBadge source={f.source} />
                </dt>
                <dd className="text-[12.5px] leading-snug font-semibold text-ink" title={f.value}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-3 border-t border-line/70 pt-2.5">
            <div role="tablist" aria-label="More about this stage" className="flex gap-1">
              {info.sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === section.id}
                  onClick={() => setTab(s.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${s.id === section.id ? "bg-brand text-white" : "bg-paper-2 text-muted hover:text-ink"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="mt-2 space-y-1.5 text-[12.5px] leading-[1.55] text-body">
              {section.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>

          <p className="mt-3 flex gap-1.5 border-t border-line/70 pt-2.5 text-[11.5px] leading-snug text-muted">
            <MousePointerClick className="mt-[1px] h-3.5 w-3.5 shrink-0 text-brand-ink" aria-hidden />
            <span>
              <span className="font-semibold text-ink">Try it: </span>
              {info.tryIt}
            </span>
          </p>

          <aside className="mt-3 flex gap-2 rounded-md bg-panel px-2.5 py-2 text-[11.5px] leading-snug text-brand-ink">
            <Info className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">What is simplified: </span>
              {info.note}
            </span>
          </aside>

          <p className="mt-2.5 text-[10.5px] leading-snug text-muted">
            <SourceBadge source="4OBE" /> recorded in the PDB entry · <SourceBadge source="computed" /> calculated from it · <SourceBadge source="typical" /> common practice, not recorded
          </p>
        </div>
      </div>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-surface via-surface/85 to-transparent pb-2 transition-opacity duration-300 ${more ? "opacity-100" : "opacity-0"}`}
        aria-hidden={!more}
      >
        <button
          type="button"
          tabIndex={more ? 0 : -1}
          onClick={scrollMore}
          className={`flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] font-medium text-brand-ink shadow-[0_1px_4px_rgba(7,38,90,0.12)] hover:border-brand ${more ? "pointer-events-auto" : ""}`}
        >
          More
          <ChevronsDown className="h-3 w-3" aria-hidden />
        </button>
      </div>
    </div>
  );
}
