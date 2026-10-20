"use client";

import { FlaskConical, Telescope } from "lucide-react";
import { useExplorerStore, type Section } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { useTourStore } from "@/store/tourStore";

const TABS: { id: Section; label: string; short: string; icon: typeof Telescope }[] = [
  { id: "explore", label: "Explore the structure", short: "Explore", icon: Telescope },
  { id: "make", label: "How it was made", short: "How it was made", icon: FlaskConical },
];

/** Switches between the structure explorer and the lab pipeline that produced the structure. */
export function SectionTabs({ compact = false }: { compact?: boolean }) {
  const section = useExplorerStore((s) => s.section);
  const setSection = useExplorerStore((s) => s.setSection);
  const exploring = useExplorerStore((s) => s.transition !== null);
  const piping = usePipelineStore((s) => s.transition !== null);
  const busy = exploring || piping;
  return (
    <div role="tablist" aria-label="Section" className="flex rounded-[7px] border border-line bg-surface p-0.5 shadow-[0_1px_3px_rgba(7,38,90,0.08)]">
      {TABS.map((t) => {
        const active = t.id === section;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={busy}
            onClick={() => {
              useTourStore.getState().stop();
              setSection(t.id);
            }}
            className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap transition-colors disabled:opacity-60 ${
              active ? "bg-brand text-white" : "text-muted hover:bg-brand-soft hover:text-brand-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {compact ? t.short : t.label}
          </button>
        );
      })}
    </div>
  );
}
