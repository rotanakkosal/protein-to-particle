"use client";

import { create } from "zustand";
import { loadProtein, type ProteinModel } from "@/lib/structure/protein";
import { buildChainLayout, type ChainLayout } from "@/lib/structure/chainLayout";
import { buildResidueMolecule, type ResidueMolecule } from "@/lib/chem/residueMolecule";
import { LIGAND_INFO, PROTEINS, type ProteinId } from "@/content/proteins";
import { useExplorerStore } from "./explorerStore";
import { applyPendingView } from "./urlState";

interface Loaded {
  protein: ProteinModel;
  chain: ChainLayout;
}

interface DataState {
  /** Every protein loaded so far (switching back is instant) */
  loaded: Partial<Record<ProteinId, Loaded>>;
  /** The protein currently on screen */
  currentId: ProteinId | null;
  protein: ProteinModel | null;
  chain: ChainLayout | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  load: (id: ProteinId) => Promise<void>;
}

let latestRequest: ProteinId | null = null;

export const useDataStore = create<DataState>((set, get) => ({
  loaded: {},
  currentId: null,
  protein: null,
  chain: null,
  status: "idle",
  error: null,
  load: async (id) => {
    latestRequest = id;
    const cached = get().loaded[id];
    if (cached) {
      set({ currentId: id, protein: cached.protein, chain: cached.chain, status: "ready", error: null });
      return;
    }
    set({ status: "loading", error: null });
    try {
      const protein = await loadProtein(PROTEINS[id], new Set(Object.keys(LIGAND_INFO)));
      if (latestRequest !== id) return; // the user switched again meanwhile
      const chain = buildChainLayout(protein);
      useExplorerStore.getState().registerProteinDefaults(id, defaultsFor(id, protein));
      // A shared link opens its view directly (before the 3D scene mounts)
      applyPendingView(id, protein, (i) => getResidueMolecule(protein, i));
      set((s) => ({ loaded: { ...s.loaded, [id]: { protein, chain } }, currentId: id, protein, chain, status: "ready" }));
    } catch (err) {
      if (latestRequest !== id) return;
      set({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

/** The tour starts on the protein's showcase glycine (ubiquitin Gly10, KRAS Gly12). */
function defaultsFor(id: ProteinId, protein: ProteinModel) {
  const want = PROTEINS[id].defaultResidueSeq;
  let index = protein.residues.findIndex((r) => r.seq === want);
  if (index < 0) index = Math.max(0, protein.residues.findIndex((r) => r.resName === "GLY"));
  return { residueIndex: index, regionId: protein.residues[index].regionId };
}

const moleculeCache = new WeakMap<ProteinModel, Map<number, ResidueMolecule>>();

/** Ball-and-stick model of one residue (memoised, since it is a pure function of the structure). */
export function getResidueMolecule(protein: ProteinModel, index: number): ResidueMolecule {
  let perProtein = moleculeCache.get(protein);
  if (!perProtein) {
    perProtein = new Map();
    moleculeCache.set(protein, perProtein);
  }
  let m = perProtein.get(index);
  if (!m) {
    m = buildResidueMolecule(protein, index);
    perProtein.set(index, m);
  }
  return m;
}

/** Non-null accessor for components that only render once data is ready. */
export function useProteinData() {
  const protein = useDataStore((s) => s.protein);
  const chain = useDataStore((s) => s.chain);
  if (!protein || !chain) throw new Error("Protein data requested before it finished loading");
  return { protein, chain };
}
