import { Vector3 } from "three";
import { useDataStore, getResidueMolecule } from "@/store/dataStore";
import { useExplorerStore, type Level } from "@/store/explorerStore";
import { atomClock, atomRadius, electronPosition, electronSlots, getNucleus, NUCLEUS_CLOUD_SCALE, PARTICLE_LAYOUT } from "./levels/atomLayout";

export interface Framing {
  target: Vector3;
  radius: number;
  /** Preferred view direction (target → camera); null keeps the current one */
  direction: Vector3 | null;
}

const dir = (x: number, y: number, z: number) => new Vector3(x, y, z).normalize();

/** How the camera frames each level once it has settled. */
export function getFraming(level: Level): Framing {
  const { protein, chain } = useDataStore.getState();
  const s = useExplorerStore.getState();
  if (!protein || !chain) return { target: new Vector3(), radius: 10, direction: null };

  switch (level) {
    case 0:
      return { target: new Vector3(), radius: protein.radius * 0.8, direction: dir(0.18, 0.22, 1) };
    case 1: {
      if (s.chainUnfolded) return { target: new Vector3(), radius: chain.unfoldedRadius * 0.92, direction: dir(0, 0.12, 1) };
      const region = protein.regionById[s.selection.regionId];
      const target = region ? region.centroid.clone().multiplyScalar(0.55) : new Vector3();
      return { target, radius: protein.radius * 0.8, direction: null };
    }
    case 2: {
      const m = getResidueMolecule(protein, s.selection.residueIndex);
      return { target: m.center.clone(), radius: Math.max(4.2, m.radius * 0.98), direction: dir(0.14, 0.18, 1) };
    }
    case 3:
      return { target: new Vector3(), radius: atomRadius(s.selection.atomElement, s.atomView), direction: dir(0.28, 0.5, 1) };
    case 4:
    default:
      return { target: new Vector3(0, -0.3, 0), radius: 5.9, direction: dir(0, 0.12, 1) };
  }
}

/** Where the currently selected child component sits, in the coordinates of `level`. */
export function getAnchor(level: Level): Vector3 {
  const { protein, chain } = useDataStore.getState();
  const s = useExplorerStore.getState();
  if (!protein || !chain) return new Vector3();
  const sel = s.selection;

  switch (level) {
    case 0:
      return protein.residues[sel.residueIndex].atoms.CA.clone();
    case 1:
      return (s.chainUnfolded ? chain.unfolded : chain.folded)[sel.residueIndex].clone();
    case 2: {
      const m = getResidueMolecule(protein, sel.residueIndex);
      return (m.atomById[sel.atomId] ?? m.atomById.CA).position.clone();
    }
    case 3: {
      if (sel.particle === "electron") {
        const slots = electronSlots(sel.atomElement);
        const slot = slots[Math.max(0, Math.min(slots.length - 1, sel.particleIndex))] ?? slots[0];
        return electronPosition(slot, atomClock.t);
      }
      const nucleus = getNucleus(sel.atomElement);
      const hit = nucleus[sel.particleIndex]?.kind === sel.particle ? nucleus[sel.particleIndex] : nucleus.find((n) => n.kind === sel.particle);
      return (hit?.position ?? new Vector3()).clone().multiplyScalar(s.atomView === "cloud" ? NUCLEUS_CLOUD_SCALE : 1);
    }
    case 4:
    default:
      return PARTICLE_LAYOUT[sel.particle].position.clone();
  }
}
