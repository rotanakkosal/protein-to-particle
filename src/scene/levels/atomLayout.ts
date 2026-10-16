import { Euler, Quaternion, Vector3 } from "three";
import { ELEMENTS, type ElementSymbol } from "@/lib/chem/elements";
import { packNucleus, sampleElectronCloud, shellRadius, type CloudSample, type Nucleon } from "@/lib/atom/atomModel";

/** Orbit-plane tilt of each Bohr shell (purely for a readable 3D picture). */
const SHELL_TILTS = [new Euler(1.2, 0.0, 0.25), new Euler(-0.32, 0.25, 0.12), new Euler(0.55, -0.4, -0.5)];
export const shellQuaternion = (i: number) => new Quaternion().setFromEuler(SHELL_TILTS[i % SHELL_TILTS.length]);

export interface ElectronSlot {
  shell: number;
  index: number;
  count: number;
}

export function electronSlots(symbol: ElementSymbol): ElectronSlot[] {
  const slots: ElectronSlot[] = [];
  ELEMENTS[symbol].shells.forEach((count, shell) => {
    for (let index = 0; index < count; index++) slots.push({ shell, index, count });
  });
  return slots;
}

export const shellSpeed = (shell: number) => 0.75 / Math.pow(shell + 1, 1.3);

/** Electron position on its (tilted) Bohr orbit at time `t` seconds. */
export function electronPosition(slot: ElectronSlot, t: number, out = new Vector3()): Vector3 {
  const r = shellRadius(slot.shell + 1);
  const angle = (slot.index / slot.count) * Math.PI * 2 + t * shellSpeed(slot.shell) + slot.shell * 0.6;
  out.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  return out.applyQuaternion(shellQuaternion(slot.shell));
}

const nucleusCache = new Map<ElementSymbol, Nucleon[]>();
export function getNucleus(symbol: ElementSymbol): Nucleon[] {
  let n = nucleusCache.get(symbol);
  if (!n) {
    const el = ELEMENTS[symbol];
    n = packNucleus(el.Z, el.massNumber - el.Z);
    nucleusCache.set(symbol, n);
  }
  return n;
}

const cloudCache = new Map<ElementSymbol, CloudSample>();
export function getCloud(symbol: ElementSymbol): CloudSample {
  let c = cloudCache.get(symbol);
  if (!c) {
    c = sampleElectronCloud(symbol, symbol === "S" ? 700 : 1500);
    cloudCache.set(symbol, c);
  }
  return c;
}

export function atomRadius(symbol: ElementSymbol, view: "orbits" | "cloud"): number {
  if (view === "cloud") return getCloud(symbol).outerRadius * 1.25;
  return shellRadius(ELEMENTS[symbol].shells.length) + 1.2;
}

/** Nucleus size in the electron-cloud view (shrunk so the 1s density near the centre is visible). */
export const NUCLEUS_CLOUD_SCALE = 0.2;

/** Shared clock for orbit animation so anchors can be computed outside the component. */
export const atomClock = { t: 0 };

/* ---------- Level V layout ---------- */

export const PARTICLE_LAYOUT = {
  proton: { position: new Vector3(-4.3, 0, 0), radius: 1.45 },
  neutron: { position: new Vector3(-0.85, 0, 0), radius: 1.45 },
  electron: { position: new Vector3(4.1, 0, 0), radius: 0.42 },
} as const;
