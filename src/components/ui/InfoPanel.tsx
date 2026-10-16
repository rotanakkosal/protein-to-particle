"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Info } from "lucide-react";
import { getInfoContent, type InfoContent } from "@/content/info";
import { LEVELS } from "@/content/levels";
import { getResidueMolecule, useDataStore } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { AtomLegend, MassChart, ParticleCounts, SequenceStrip, StructureLegend } from "./LevelWidgets";

/** Left-hand educational card (bottom sheet on phones). Cross-fades upward like the reference. */
export function InfoPanel({ variant }: { variant: "side" | "sheet" }) {
  const protein = useDataStore((s) => s.protein);
  const level = useExplorerStore((s) => s.transition?.to ?? s.level);
  const selection = useExplorerStore((s) => s.selection);
  const mode = useExplorerStore((s) => s.mode);
  const aminoAcidForm = useExplorerStore((s) => s.aminoAcidForm);
  const atomView = useExplorerStore((s) => s.atomView);
  const [collapsed, setCollapsed] = useState(false);
  if (!protein) return null;

  const molecule = getResidueMolecule(protein, selection.residueIndex);
  const content = getInfoContent(level, { protein, molecule, selection, mode, aminoAcidForm, atomView });
  const key = `${selection.proteinId}|${level}|${mode}|${level >= 2 ? selection.residueIndex : ""}|${level >= 3 ? `${selection.atomId}${selection.atomElement}` : ""}|${level === 4 ? selection.particle : ""}`;

  let widget: React.ReactNode = null;
  if (level === 0) widget = <StructureLegend />;
  else if (level === 1) widget = <SequenceStrip protein={protein} />;
  else if (level === 2) widget = <AtomLegend molecule={molecule} form={aminoAcidForm} />;
  else if (level === 3) widget = <ParticleCounts symbol={selection.atomElement} />;
  else widget = <MassChart />;

  const sheet = variant === "sheet";
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.section
        key={key}
        initial={{ opacity: 0, y: sheet ? 18 : 26 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.08 } }}
        exit={{ opacity: 0, y: sheet ? 10 : 16, transition: { duration: 0.22, ease: "easeIn" } }}
        aria-live="polite"
        className={
          sheet
            ? "pointer-events-auto flex max-h-[36dvh] w-full flex-col overflow-hidden rounded-t-xl border border-b-0 border-line bg-white shadow-[0_-4px_20px_rgba(7,38,90,0.10)]"
            : "pointer-events-auto flex max-h-[calc(100dvh-250px)] w-[330px] flex-col overflow-hidden rounded-[6px] border border-line bg-white shadow-[0_2px_14px_rgba(7,38,90,0.08)] xl:w-[350px]"
        }
      >
        {/* Poster-style section bar: navy band with a white uppercase label */}
        <div className="flex shrink-0 items-center justify-between gap-2 bg-brand px-4 py-2">
          <p className="text-[10.5px] font-bold tracking-[0.1em] text-white uppercase">
            Level {LEVELS[level].numeral} · {LEVELS[level].name}
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
          <h2 className="font-display text-[21px] leading-[1.2] font-extrabold tracking-[-0.01em] text-balance text-brand">{content.title}</h2>
          <p className="mt-0.5 text-[12px] leading-snug font-medium text-brand-mid">{content.subtitle}</p>
        </header>
        {!(sheet && collapsed) && <PanelBody content={content} widget={widget} />}
      </motion.section>
    </AnimatePresence>
  );
}

function PanelBody({ content, widget }: { content: InfoContent; widget: React.ReactNode }) {
  const [tab, setTab] = useState<InfoContent["sections"][number]["id"]>("made");
  const section = content.sections.find((s) => s.id === tab) ?? content.sections[0];
  return (
    <div className="thin-scroll overflow-y-auto px-4 pt-2 pb-3.5">
      <p className="text-[12.5px] leading-[1.55] text-body">{content.summary}</p>
      {content.highlight && (
        <p className="mt-2.5 rounded-md border-l-[3px] border-brand bg-brand-soft px-2.5 py-2 text-[12px] leading-snug font-medium text-brand">{content.highlight}</p>
      )}
      {widget}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line/70 pt-2.5">
        {content.facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[10px] tracking-wide text-muted uppercase">{f.label}</dt>
            <dd className="truncate text-[12.5px] font-semibold text-ink tabular-nums" title={f.value}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 border-t border-line/70 pt-2.5">
        <div role="tablist" aria-label="More about this level" className="flex gap-1">
          {content.sections.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === section.id}
              onClick={() => setTab(s.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                s.id === section.id ? "bg-brand text-white" : "bg-paper-2 text-muted hover:text-ink"
              }`}
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

      <div className="mt-3 space-y-1 border-t border-line/70 pt-2.5 text-[11.5px] leading-snug">
        {content.relation.up && (
          <p className="flex gap-1.5 text-muted">
            <ArrowUp className="mt-[1px] h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
            <span>
              <span className="font-semibold text-ink">Part of: </span>
              {content.relation.up}
            </span>
          </p>
        )}
        {content.relation.down && (
          <p className="flex gap-1.5 text-muted">
            <ArrowDown className="mt-[1px] h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
            <span>
              <span className="font-semibold text-ink">Made of: </span>
              {content.relation.down}
            </span>
          </p>
        )}
      </div>

      <aside
        className={`mt-3 flex gap-2 rounded-md px-2.5 py-2 text-[11.5px] leading-snug ${
          content.note.tone === "warning" ? "bg-amber-note text-[#5b4512]" : "bg-panel text-brand"
        }`}
      >
        {content.note.tone === "warning" ? (
          <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#b7871f]" aria-hidden />
        ) : (
          <Info className="mt-[1px] h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
        )}
        <span>
          <span className="font-semibold">{content.note.title}: </span>
          {content.note.text}
        </span>
      </aside>
    </div>
  );
}
