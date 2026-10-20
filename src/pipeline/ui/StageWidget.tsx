"use client";

import { useEffect, useRef, useState } from "react";
import { AA_CLASS_INFO, type AminoAcidClass } from "@/content/aminoAcids";
import type { PipelineContext } from "@/content/pipeline";
import { useExplorerStore } from "@/store/explorerStore";
import { STAGE_KEYS, usePipelineStore } from "@/store/pipelineStore";
import { TAG_COLORS } from "../stages/ConstructStage";
import { diffractionView, IMAGE_BINS } from "../stages/DiffractionStage";
import { BIN_COUNT } from "../lib/diffraction";

const Dot = ({ color }: { color: string }) => <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: color }} />;

function Key({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <Dot color={i.color} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ chromatograms */

interface Peak {
  id: string;
  at: number;
  height: number;
  width: number;
  label: string;
  detail: string;
}

const gauss = (x: number, p: Peak) => p.height * Math.exp(-((x - p.at) ** 2) / (2 * p.width ** 2));

/**
 * One schematic chromatogram: protein absorbance (A280) against elution volume. A single series,
 * so no legend; peaks carry sparing direct labels and a hover description.
 */
function Chromatogram({ title, peaks, band, empty }: { title: string; peaks: Peak[]; band?: { from: number; label: string }; empty?: string }) {
  const W = 290;
  const H = 82;
  const pad = { l: 6, r: 6, t: 14, b: 14 };
  const x = (v: number) => pad.l + (v / 40) * (W - pad.l - pad.r);
  const y = (a: number) => H - pad.b - a * (H - pad.t - pad.b);
  const pts = Array.from({ length: 161 }, (_, i) => {
    const v = (i / 160) * 40;
    return [v, Math.min(1, 0.02 + peaks.reduce((s, p) => s + gauss(v, p), 0))] as const;
  });
  const line = pts.map(([v, a], i) => `${i ? "L" : "M"}${x(v).toFixed(1)},${y(a).toFixed(1)}`).join(" ");
  const area = `${line} L${x(40)},${y(0)} L${x(0)},${y(0)} Z`;
  const setHover = useExplorerStore.getState().setHover;
  return (
    <figure className="mt-3">
      <figcaption className="mb-1 flex items-baseline justify-between text-[10.5px] tracking-wide text-muted uppercase">
        <span>{title}</span>
        <span className="normal-case">schematic</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}: ${peaks.length ? peaks.map((p) => p.label).join(", ") : "no peaks yet"}`}>
        {band && <rect x={x(band.from)} y={pad.t - 4} width={x(40) - x(band.from)} height={H - pad.t - pad.b + 4} className="fill-[#A98BE6]/12" />}
        {band && (
          <text x={x(band.from) + 3} y={pad.t + 4} className="fill-muted text-[8.5px]">
            {band.label}
          </text>
        )}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="stroke-line" strokeWidth={1} />
        <path d={area} className="fill-chart/10" />
        <path d={line} className="fill-none stroke-chart" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {peaks.map((p) => (
          <g key={p.id}>
            <text x={x(p.at)} y={Math.max(9, y(p.height) - 3)} textAnchor="middle" className="fill-body text-[9px] font-semibold">
              {p.label}
            </text>
            <rect
              x={x(p.at - p.width * 2.2)}
              y={pad.t - 6}
              width={x(p.width * 4.4) - x(0)}
              height={H - pad.t}
              fill="transparent"
              onMouseEnter={() => setHover({ key: `peak:${p.id}`, title: p.label, subtitle: p.detail })}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        <text x={W - pad.r} y={H - 2} textAnchor="end" className="fill-muted text-[8.5px]">
          volume →
        </text>
        <text x={pad.l} y={H - 2} className="fill-muted text-[8.5px]">
          protein (A280)
        </text>
        {empty && !peaks.length && (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-muted text-[9.5px]">
            {empty}
          </text>
        )}
      </svg>
    </figure>
  );
}

function PurificationCharts() {
  const step = usePipelineStore((s) => s.steps.purification);
  const ni: Peak[] = [];
  if (step >= 2) ni.push({ id: "ft", at: 6, height: 0.95, width: 2.6, label: "flow-through", detail: "E. coli proteins without a His-tag pass straight through." });
  if (step >= 3) ni.push({ id: "wash", at: 16, height: 0.16, width: 1.4, label: "wash", detail: "Proteins that stuck loosely are rinsed off." });
  if (step >= 4) ni.push({ id: "elute", at: 29, height: 0.78, width: 1.8, label: "KRAS", detail: "Imidazole releases the His-tagged KRAS." });
  const sec: Peak[] =
    step >= 6
      ? [
          { id: "agg", at: 9, height: 0.12, width: 1.2, label: "clumps", detail: "Large aggregates cannot enter the pores, so they come out first." },
          { id: "kras", at: 22, height: 0.95, width: 1.5, label: "KRAS", detail: "Single KRAS molecules: one clean, symmetric peak." },
        ]
      : [];
  return (
    <>
      <Chromatogram title="Nickel column" peaks={ni} band={step >= 4 ? { from: 24, label: "imidazole" } : undefined} empty="Load the column to see the trace" />
      <Chromatogram title="Size exclusion" peaks={sec} empty={step >= 5 ? "Polish by size to see the trace" : "Comes last"} />
    </>
  );
}

/* ------------------------------------------------------------------ thermometer */

const TEMPS = [4, 4, 4, -196, -80];
const MARKS = [
  { t: 20, label: "room" },
  { t: 0, label: "ice" },
  { t: -80, label: "freezer" },
  { t: -196, label: "liquid nitrogen" },
];

function Thermometer() {
  const step = usePipelineStore((s) => s.steps.storage);
  const t = TEMPS[step];
  const W = 290;
  const H = 46;
  const x = (c: number) => 14 + ((c + 200) / 225) * (W - 28);
  return (
    <figure className="mt-3" aria-label={`Sample temperature ${t} °C`}>
      <figcaption className="flex items-baseline justify-between text-[10.5px] tracking-wide text-muted uppercase">
        <span>Sample temperature</span>
        <span className="font-display text-[20px] font-extrabold tracking-normal text-ink normal-case tabular-nums">{t > 0 ? `+${t}` : `−${Math.abs(t)}`} °C</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="presentation">
        <defs>
          <linearGradient id="thermo" x1="0" x2="1">
            <stop offset="0" stopColor="#2F72E4" />
            <stop offset="0.6" stopColor="#8EC5F0" />
            <stop offset="1" stopColor="#E8862A" />
          </linearGradient>
        </defs>
        <rect x={14} y={10} width={W - 28} height={6} rx={3} fill="url(#thermo)" opacity={0.85} />
        {MARKS.map((m) => (
          <g key={m.t}>
            <line x1={x(m.t)} x2={x(m.t)} y1={18} y2={23} className="stroke-faint" strokeWidth={1} />
            <text x={x(m.t)} y={33} textAnchor="middle" className="fill-muted text-[8.5px]">
              {m.t > 0 ? `+${m.t}` : m.t === 0 ? "0" : `−${Math.abs(m.t)}`} °C
            </text>
            <text x={x(m.t)} y={43} textAnchor="middle" className="fill-muted text-[8.5px]">
              {m.label}
            </text>
          </g>
        ))}
        <circle cx={x(t)} cy={13} r={6} className="fill-surface stroke-ink transition-all duration-700" strokeWidth={2} />
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------------ detector image */

const IMAGE_BG = "#0D1A31";

/**
 * The current diffraction image, flat and seen from the crystal: the spots recorded during the
 * last 1° of rotation, calculated from 4OBE (see DiffractionStage), with the beamstop's shadow.
 * Hover a spot for its Miller indices and resolution.
 */
function DetectorImage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawn = useRef<{ x: number; y: number; e: number }[]>([]);
  const [status, setStatus] = useState({ ready: false, progress: 0, phi: 0, spots: 0 });
  const setHover = useExplorerStore.getState().setHover;

  useEffect(() => {
    let raf = 0;
    let last = "";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = canvas.current;
      const m = diffractionView.model;
      if (!cv) return;
      const size = cv.clientWidth;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const ready = !!m?.ready;
      const bin = ready ? m!.binOf(diffractionView.phi) : -1;
      const key = `${size}|${bin}|${diffractionView.showRings}|${ready}|${m ? Math.round(m.progress * 20) : -1}`;
      if (key === last) return;
      last = key;
      if (cv.width !== Math.round(size * dpr)) {
        cv.width = Math.round(size * dpr);
        cv.height = Math.round(size * dpr);
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = IMAGE_BG;
      ctx.fillRect(0, 0, size, size);
      drawn.current = [];
      if (!m || !ready) {
        setStatus((s) => ({ ...s, ready: false, progress: m?.progress ?? 0 }));
        return;
      }
      const half = m.options.halfSize;
      const px = size / (2 * half); // pixels per mm
      // seen from the crystal: spindle (+z) to the right, up is up
      const X = (z: number) => size / 2 + z * px;
      const Y = (y: number) => size / 2 - y * px;

      // beamstop shadow: the stop and its arm, magnified from 32 mm to the detector distance
      const mag = m.options.distance / 32;
      ctx.fillStyle = "#08111F";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 2 * mag * px, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(size / 2 - 0.4 * mag * px, size / 2, 0.8 * mag * px, size / 2);

      // the 3 × 3 CCD modules
      ctx.strokeStyle = "#22355A";
      ctx.lineWidth = 1;
      for (const t of [-half / 3, half / 3]) {
        ctx.beginPath();
        ctx.moveTo(X(t), 0);
        ctx.lineTo(X(t), size);
        ctx.moveTo(0, Y(t));
        ctx.lineTo(size, Y(t));
        ctx.stroke();
      }

      if (diffractionView.showRings) {
        ctx.strokeStyle = "#7C9BE0";
        ctx.fillStyle = "#A9BCE6";
        ctx.font = "9px system-ui, sans-serif";
        ctx.setLineDash([3, 3]);
        for (const d of [4, 2, m.options.dMin]) {
          const r = m.radiusOf(d) * px;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillText(`${d} Å`, size / 2 + r * 0.7071 + 3, size / 2 - r * 0.7071 - 2);
        }
        ctx.setLineDash([]);
      }

      const ev = m.events;
      ctx.fillStyle = "#FFF2CF";
      let spots = 0;
      for (let k = IMAGE_BINS - 1; k >= 0; k--) {
        const b = (bin - k + BIN_COUNT) % BIN_COUNT;
        for (let e = ev.start[b]; e < ev.start[b + 1]; e++) {
          const strength = Math.min(1, (m.intensityOf(ev.reflection[e]) / m.reference) ** 0.4);
          if (strength < 0.05) continue;
          const x = X(ev.z[e]);
          const y = Y(ev.y[e]);
          const r = Math.max(0.6, (0.35 + 0.8 * strength) * px);
          ctx.globalAlpha = 0.3 + 0.7 * strength;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          drawn.current.push({ x, y, e });
          spots++;
        }
      }
      ctx.globalAlpha = 1;
      const phi = (((diffractionView.phi * 180) / Math.PI) % 360 + 360) % 360;
      setStatus({ ready: true, progress: 1, phi, spots });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const m = diffractionView.model;
    if (!m?.ready) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: { e: number; d: number } | null = null;
    for (const s of drawn.current) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 7 && (!best || d < best.d)) best = { e: s.e, d };
    }
    if (!best) return setHover(null);
    const i = m.events.reflection[best.e];
    const [h, k, l] = [m.hkl[i * 3], m.hkl[i * 3 + 1], m.hkl[i * 3 + 2]];
    const strength = Math.min(1, (m.intensityOf(i) / m.reference) ** 0.4);
    setHover({
      key: `spot:${i}`,
      title: `Reflection ${h} ${k} ${l}`,
      subtitle: `Resolution ${(1 / m.dInv[i]).toFixed(2)} Å · ${strength > 0.7 ? "strong" : strength > 0.3 ? "medium" : "weak"}. Calculated from the 4OBE atoms (|F|²).`,
    });
  };

  return (
    <figure className="mt-3">
      <figcaption className="mb-1 flex items-baseline justify-between text-[10.5px] tracking-wide text-muted uppercase">
        <span>Detector image · last 1°</span>
        <span className="normal-case tabular-nums">{status.ready ? `φ ${status.phi.toFixed(1)}° · ${status.spots.toLocaleString("en-US")} spots` : `calculating ${Math.round(status.progress * 100)}%`}</span>
      </figcaption>
      <canvas
        ref={canvas}
        className="aspect-square w-full rounded-md"
        style={{ background: IMAGE_BG }}
        role="img"
        aria-label={status.ready ? `Calculated diffraction image with ${status.spots} spots` : "Diffraction image being calculated"}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      />
      <p className="mt-1 text-[11px] text-muted">Calculated from the 4OBE atoms, cell and symmetry. Hover a spot for its indices.</p>
    </figure>
  );
}

/** Stage-specific key, chart or gauge shown in the stage card. */
export function StageWidget({ ctx }: { ctx: PipelineContext }) {
  const stage = usePipelineStore((s) => s.transition?.to ?? s.stage);
  void ctx;
  switch (STAGE_KEYS[stage]) {
    case "gene":
      return (
        <Key
          items={[
            { color: "#4FAF5C", label: "A (adenine)" },
            { color: "#E0544C", label: "T (thymine)" },
            { color: "#E2B93B", label: "G (guanine)" },
            { color: "#2F72E4", label: "C (cytosine)" },
            { color: "#BCC5D3", label: "letters not shown" },
            { color: "#E8862A", label: "phosphate backbone" },
          ]}
        />
      );
    case "construct":
      return (
        <Key
          items={[
            { color: TAG_COLORS.his, label: "His-tag" },
            { color: TAG_COLORS.tev, label: "TEV cut site" },
            { color: TAG_COLORS.gly0, label: "Gly0 (stays)" },
            { color: "#B4BDCB", label: "tail left out" },
            ...(Object.entries(AA_CLASS_INFO) as [AminoAcidClass, (typeof AA_CLASS_INFO)[AminoAcidClass]][]).map(([, v]) => ({ color: v.color, label: v.beginner })),
          ]}
        />
      );
    case "purification":
      return <PurificationCharts />;
    case "storage":
      return <Thermometer />;
    case "diffraction":
      return <DetectorImage />;
    default:
      return null;
  }
}
