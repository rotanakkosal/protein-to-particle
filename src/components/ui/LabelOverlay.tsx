"use client";

import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { useLabelStore, type LabelTone } from "@/scene/shared/labelRegistry";
import { sceneRefs } from "@/scene/runtime";

const TONES: Record<LabelTone, string> = {
  default: "bg-surface/90 text-ink border-line",
  accent: "bg-brand text-white border-brand",
  muted: "bg-paper/85 text-muted border-line",
  gold: "bg-gold-bg text-gold-ink border-gold-line",
  strong: "bg-ink text-white border-ink dark:bg-surface dark:text-ink dark:border-line",
  hotspot: "bg-hotspot text-white border-hotspot font-semibold dark:text-paper",
};

/** Renders every registered 3D label and keeps it pinned to its anchor each animation frame. */
export function LabelOverlay() {
  const labels = useLabelStore((s) => s.labels);
  const layer = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let raf = 0;
    const v = new Vector3();
    // Screen areas covered by the interface (elements marked data-label-block), refreshed a few times a second
    let zones: { l: number; t: number; r: number; b: number }[] = [];
    const sizes = new Map<HTMLDivElement, { w: number; h: number }>();
    let lastZoneUpdate = -Infinity;
    const updateZones = (el: HTMLDivElement) => {
      const origin = el.getBoundingClientRect();
      zones = [];
      document.querySelectorAll<HTMLElement>("[data-label-block]").forEach((z) => {
        const r = z.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        zones.push({ l: r.left - origin.left - 4, t: r.top - origin.top - 4, r: r.right - origin.left + 4, b: r.bottom - origin.top + 4 });
      });
      sizes.clear();
      nodes.current.forEach((node) => {
        const pill = node.firstElementChild as HTMLElement | null;
        if (pill) sizes.set(node, { w: pill.offsetWidth, h: pill.offsetHeight });
      });
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const camera = sceneRefs.controls?.camera;
      const el = layer.current;
      if (!camera || !el) return;
      if (now - lastZoneUpdate > 250) {
        lastZoneUpdate = now;
        updateZones(el);
      }
      const w = el.clientWidth;
      const h = el.clientHeight;
      const entries = useLabelStore.getState().labels;
      // Keep labels out of the strip occupied by the (transparent) level navigation
      const navStrip = w >= 1280 ? 175 : w >= 768 ? 85 : 52;
      nodes.current.forEach((node, id) => {
        const entry = entries[id];
        if (!entry) return;
        entry.anchor.getWorldPosition(v).project(camera);
        const x = ((v.x + 1) / 2) * w;
        const y = ((1 - v.y) / 2) * h;
        const size = sizes.get(node) ?? { w: 60, h: 20 };
        const box = { l: x - size.w / 2, t: y - size.h / 2, r: x + size.w / 2, b: y + size.h / 2 };
        const covered = zones.some((z) => box.l < z.r && box.r > z.l && box.t < z.b && box.b > z.t);
        if (v.z > 1 || v.z < -1 || x > w - navStrip || covered) {
          node.style.visibility = "hidden";
          return;
        }
        node.style.visibility = "visible";
        node.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-[15] overflow-hidden" aria-hidden>
      {Object.values(labels)
        .filter((l) => l.visible)
        .map((l) => (
          <div
            key={l.id}
            ref={(node) => {
              if (node) nodes.current.set(l.id, node);
              else nodes.current.delete(l.id);
            }}
            className="absolute top-0 left-0"
            style={{ visibility: "hidden" }}
          >
            <div
              className={`label-pop rounded-full border px-2 py-[2px] font-sans text-[11px] leading-4 font-medium whitespace-nowrap shadow-[0_1px_4px_rgba(7,38,90,0.12)] select-none ${TONES[l.tone]} ${l.className}`}
            >
              {l.content}
            </div>
          </div>
        ))}
    </div>
  );
}
