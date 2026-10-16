"use client";

import { LEVELS } from "@/content/levels";
import { useExplorerStore } from "@/store/explorerStore";

/** CSS reference pixel = 1/96 inch = 0.2646 mm */
const METERS_PER_CSS_PX = 0.0254 / 96;

const NICE: { m: number; label: string }[] = [
  { m: 1e-10, label: "1 Å" },
  { m: 2e-10, label: "2 Å" },
  { m: 5e-10, label: "5 Å" },
  { m: 1e-9, label: "1 nm" },
  { m: 2e-9, label: "2 nm" },
  { m: 5e-9, label: "5 nm" },
  { m: 1e-8, label: "10 nm" },
];

function formatMag(mag: number, scientific: boolean): string {
  if (scientific) {
    const exp = Math.floor(Math.log10(mag));
    const mant = mag / 10 ** exp;
    const sup = String(exp)
      .split("")
      .map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)])
      .join("");
    return `${mant.toFixed(1)}×10${sup}`;
  }
  if (mag >= 1e9) return `${(mag / 1e9).toFixed(1)} billion×`;
  if (mag >= 1e6) return `${Math.round(mag / 1e6)} million×`;
  return `${Math.round(mag).toLocaleString("en-US")}×`;
}

/** "LEVEL I · Mag 26 million× | ├──┤ 1 nm", updated live as you zoom. */
export function ScalePill() {
  const level = useExplorerStore((s) => s.transition?.to ?? s.level);
  const pxPerUnit = useExplorerStore((s) => s.pxPerUnit);
  const scientific = useExplorerStore((s) => s.mode === "scientific");
  const meta = LEVELS[level];

  let bar: { px: number; label: string } | null = null;
  let mag = 0;
  if (meta.metersPerUnit) {
    const pxPerMeter = pxPerUnit / meta.metersPerUnit;
    mag = pxPerMeter * METERS_PER_CSS_PX;
    let pick = NICE[0];
    for (const n of NICE) if (n.m * pxPerMeter <= 96) pick = n;
    bar = { px: Math.max(18, Math.min(120, pick.m * pxPerMeter)), label: pick.label };
  }

  return (
    <div className="flex h-8 items-center gap-2 rounded-md bg-white/95 px-2.5 text-[11.5px] whitespace-nowrap shadow-[0_1px_3px_rgba(7,38,90,0.12)] sm:h-9 sm:px-3 sm:text-[12px]">
      <span className="font-semibold tracking-[0.08em] text-brand">LEVEL {meta.numeral}</span>
      <span className="text-faint">·</span>
      {bar ? (
        <>
          <span className="text-muted">Mag:</span>
          <span className="text-[12.5px] font-semibold text-ink tabular-nums sm:text-[13.5px]">{formatMag(mag, scientific)}</span>
          <span className="hidden text-line sm:inline">|</span>
          <span className="hidden items-center gap-1.5 sm:flex" aria-label={`Scale bar: ${bar.label}`}>
            <span className="relative h-2.5 transition-[width] duration-200" style={{ width: bar.px }}>
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink" />
              <span className="absolute top-0 left-0 h-full w-px bg-ink" />
              <span className="absolute top-0 right-0 h-full w-px bg-ink" />
            </span>
            <span className="font-semibold text-ink">{bar.label}</span>
          </span>
        </>
      ) : (
        <span className="font-medium text-muted">{meta.schematicNote}</span>
      )}
    </div>
  );
}
