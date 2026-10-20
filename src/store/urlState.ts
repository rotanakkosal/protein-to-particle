"use client";

import { PROTEINS, type ProteinId } from "@/content/proteins";
import type { ProteinModel } from "@/lib/structure/protein";
import type { ResidueMolecule } from "@/lib/chem/residueMolecule";
import { useExplorerStore, type Level, type ParticleKind, type Section } from "./explorerStore";
import { STAGE_COUNT, usePipelineStore } from "./pipelineStore";

/**
 * Shareable links: the address bar mirrors what is on screen, e.g.
 *   ?p=kras&l=4&r=12&a=CA        KRAS › Gly12 › its α-carbon
 * p protein · l level (1–5) · r residue number · a atom · x particle · m=sci · v view option · h=1 hotspots
 * The lab pipeline ("How it was made") uses ?view=make&s=3 (stage 1–10).
 * Other query parameters (such as ?debug) are left untouched.
 */

interface UrlView {
  section: Section;
  /** Pipeline stage, 0-based */
  stage: number;
  proteinId: ProteinId;
  level: Level;
  seq?: number;
  atomId?: string;
  particle?: ParticleKind;
  scientific?: boolean;
  view?: "unfolded" | "free" | "cloud";
  hotspots?: boolean;
}

const OWN_KEYS = ["p", "l", "r", "a", "x", "m", "v", "h", "view", "s"];
const PARTICLES: ParticleKind[] = ["proton", "neutron", "electron"];

function parse(search: string): UrlView | null {
  const q = new URLSearchParams(search);
  if (q.get("view") === "make") {
    const stage = Number.parseInt(q.get("s") ?? "1", 10);
    // the pipeline follows KRAS (the entry that records how it was made)
    return { section: "make", stage: Number.isFinite(stage) ? Math.min(STAGE_COUNT, Math.max(1, stage)) - 1 : 0, proteinId: "kras", level: 0, scientific: q.get("m") === "sci" };
  }
  const p = q.get("p");
  if (!p || !(p in PROTEINS)) return null;
  const l = Number.parseInt(q.get("l") ?? "1", 10);
  const r = Number.parseInt(q.get("r") ?? "", 10);
  const x = q.get("x") as ParticleKind | null;
  const v = q.get("v");
  return {
    section: "explore",
    stage: 0,
    proteinId: p as ProteinId,
    level: (Number.isFinite(l) ? Math.min(5, Math.max(1, l)) - 1 : 0) as Level,
    seq: Number.isFinite(r) ? r : undefined,
    atomId: q.get("a") ?? undefined,
    particle: x && PARTICLES.includes(x) ? x : undefined,
    scientific: q.get("m") === "sci",
    view: v === "unfolded" || v === "free" || v === "cloud" ? v : undefined,
    hotspots: q.get("h") === "1",
  };
}

/** The view requested by the page address, consumed once its protein has loaded. */
let pending: UrlView | null = typeof window === "undefined" ? null : parse(window.location.search);

/** Protein the address asks for, so the explorer loads it first instead of the default one. */
export function pendingProtein(): ProteinId | null {
  return pending?.proteinId ?? null;
}

/** Applies the linked view once its protein is ready (before the 3D scene mounts, so there is no transition). */
export function applyPendingView(id: ProteinId, protein: ProteinModel, moleculeAt: (index: number) => ResidueMolecule) {
  const v = pending;
  if (!v || v.proteinId !== id) return;
  pending = null;
  const st = useExplorerStore.getState();
  if (v.section === "make") {
    st.restoreView({ section: "make", mode: v.scientific ? "scientific" : st.mode });
    usePipelineStore.setState({ stage: v.stage, transition: null });
    return;
  }
  let residueIndex = st.selection.residueIndex;
  if (v.seq !== undefined) {
    const i = protein.residues.findIndex((r) => r.seq === v.seq);
    if (i >= 0) residueIndex = i;
  }
  if (residueIndex < 0) residueIndex = 0;
  const molecule = moleculeAt(residueIndex);
  const atom = (v.atomId && molecule.atomById[v.atomId] && !molecule.atomById[v.atomId].context ? molecule.atomById[v.atomId] : null) ?? molecule.atomById.CA;
  st.restoreView({
    level: v.level,
    selection: {
      ...st.selection,
      proteinId: id,
      residueIndex,
      regionId: protein.residues[residueIndex].regionId,
      atomId: atom.id,
      atomElement: atom.element,
      particle: v.particle ?? "proton",
      particleIndex: -1,
    },
    mode: v.scientific ? "scientific" : st.mode,
    chainUnfolded: v.view === "unfolded",
    aminoAcidForm: v.view === "free" ? "free" : "residue",
    atomView: v.view === "cloud" ? "cloud" : "orbits",
    showHotspots: v.hotspots === true && !!PROTEINS[id].hotspots?.length,
  });
}

/** The address for the current view (only the parameters that matter at this level). */
export function currentViewUrl(protein: ProteinModel | null, { forSharing = false } = {}): string {
  const s = useExplorerStore.getState();
  const url = new URL(window.location.href);
  for (const k of OWN_KEYS) url.searchParams.delete(k);
  if (forSharing) url.searchParams.delete("debug");
  if (s.section === "make") {
    url.searchParams.set("view", "make");
    url.searchParams.set("s", String(usePipelineStore.getState().stage + 1));
    if (s.mode === "scientific") url.searchParams.set("m", "sci");
    return url.toString();
  }
  const sel = s.selection;
  url.searchParams.set("p", sel.proteinId);
  if (s.level > 0) url.searchParams.set("l", String(s.level + 1));
  if (s.level >= 1 && protein && protein.residues[sel.residueIndex]) url.searchParams.set("r", String(protein.residues[sel.residueIndex].seq));
  if (s.level >= 3) url.searchParams.set("a", sel.atomId);
  if (s.level === 4) url.searchParams.set("x", sel.particle);
  if (s.mode === "scientific") url.searchParams.set("m", "sci");
  if (s.level === 1 && s.chainUnfolded) url.searchParams.set("v", "unfolded");
  if (s.level === 2 && s.aminoAcidForm === "free") url.searchParams.set("v", "free");
  if (s.level === 3 && s.atomView === "cloud") url.searchParams.set("v", "cloud");
  if (s.level <= 1 && s.showHotspots) url.searchParams.set("h", "1");
  return url.toString();
}

/** Keeps the address bar in step with the view (replaceState, so the back button is not flooded). */
export function syncUrl(protein: ProteinModel | null) {
  if (pending || useExplorerStore.getState().transition || usePipelineStore.getState().transition) return;
  const next = currentViewUrl(protein);
  if (next !== window.location.href) {
    try {
      window.history.replaceState(window.history.state, "", next);
    } catch {
      // some sandboxed frames do not allow history changes; links still work via the Share button
    }
  }
}
