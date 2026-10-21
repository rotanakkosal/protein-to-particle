import { Color } from "three";
import type { Theme } from "@/store/explorerStore";

/** Scene colours: a navy-led blue family on a cool near-white ground (matches the UI tokens). */
export const BG = "#F4F6F9";

/** Colours that change with the light / dark theme (backgrounds match --color-paper). */
export const SCENE_THEME: Record<Theme, { bg: string; accent: string; gluon: string }> = {
  light: { bg: BG, accent: "#07265A", gluon: "#5D6779" },
  dark: { bg: "#0C1320", accent: "#9DBDF5", gluon: "#97A3B8" },
};

/** Live scene colours, updated in place by SceneThemeSync so per-frame colour mixing follows the theme. */
export const sceneColors = { bg: new Color(BG) };

export const SS_COLORS = {
  helix: "#2A5CB8",
  helix310: "#8D7BD6",
  strand: "#7FB2EC",
  coil: "#B4BDCB",
} as const;

export const PEPTIDE_BOND = "#C99A2E";
export const CHAIN_LINK = "#BAC3D1";
export const ACCENT = "#07265A";
/** Cancer-hotspot red (3D markers; reads on both the light and the dark background) */
export const HOTSPOT = "#E0453B";

export const PARTICLE_COLORS = {
  proton: "#E0544C",
  neutron: "#9BA4B5",
  electron: "#2F72E4",
  up: "#F2A33A",
  down: "#24A79A",
} as const;
