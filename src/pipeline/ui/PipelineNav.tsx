"use client";

import { STAGE_META } from "@/content/pipeline";
import { usePipelineStore } from "@/store/pipelineStore";

/** Right-hand vertical list of the ten stages (same pattern as the explorer's level navigation). */
export function PipelineNav() {
  const stage = usePipelineStore((s) => s.stage);
  const target = usePipelineStore((s) => s.transition?.to ?? null);
  const goTo = usePipelineStore((s) => s.goTo);
  const active = target ?? stage;
  return (
    <nav aria-label="Pipeline stages" className="relative">
      <div className="absolute top-3 right-[13px] bottom-3 w-px bg-line sm:right-[14px]" aria-hidden />
      <ol className="relative flex flex-col gap-1.5 sm:gap-2">
        {STAGE_META.map((m, i) => {
          const isActive = i === active;
          const done = i < active;
          const Icon = m.icon;
          return (
            <li key={m.key}>
              <button
                type="button"
                onClick={() => goTo(i)}
                disabled={target !== null}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Stage ${i + 1}: ${m.name}`}
                title={`${i + 1}. ${m.name}`}
                className="group flex items-center justify-end gap-2.5"
              >
                <span
                  className={`hidden items-center gap-1 text-right text-[11px] leading-tight tracking-wide transition-colors xl:flex ${
                    isActive ? "font-semibold text-brand-ink" : "text-muted group-hover:text-ink"
                  }`}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  {m.name}
                </span>
                <span
                  className={`flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full border font-display text-[10.5px] font-bold transition-all duration-300 sm:h-[27px] sm:w-[27px] ${
                    isActive
                      ? "scale-105 border-brand bg-brand text-white shadow-[0_2px_8px_rgba(7,38,90,0.3)]"
                      : done
                        ? "border-brand/50 bg-brand-soft text-brand-ink group-hover:border-brand"
                        : "border-faint bg-paper text-ink group-hover:border-brand group-hover:text-brand-ink"
                  }`}
                >
                  {i + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
