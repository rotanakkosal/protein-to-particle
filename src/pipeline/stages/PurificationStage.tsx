"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { CapsuleGeometry, Color, CylinderGeometry, InstancedMesh, LatheGeometry, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector2, Vector3 } from "three";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { setBaseOpacity, useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";
import { TAG_COLORS } from "./ConstructStage";

/*
 * Purification as particles moving through glassware (not to scale): steps 1–6 are
 * lyse → load the nickel column → wash → elute with imidazole → cut the tag (TEV) → size exclusion.
 * Every particle has a resting place at the end of each step; a step animates between them.
 */
const COL = { x: 0, r: 2.0, top: 6, bedTop: 0.6, bedBottom: -4, outlet: -6 };
const SEC = { x: 7.2, r: 1.15, top: 3, bottom: -4.6 };
const TUBE = new Vector3(0, -9.4, 0);
const FINAL = new Vector3(SEC.x, -8.2, 0);
const CLOUD = new Vector3(0, 9.6, 0);
const N_KRAS = 36;
const N_HOST = 70;
const N_STICKY = 6;
const N_AGG = 3;
const STEP_SECONDS = 3.4;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Point along a polyline at fraction f (0–1), by length. */
function along(points: Vector3[], f: number, out: Vector3) {
  const lens = points.slice(1).map((p, i) => p.distanceTo(points[i]));
  const total = lens.reduce((a, b) => a + b, 0);
  let d = Math.min(1, Math.max(0, f)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) return out.lerpVectors(points[i], points[i + 1], lens[i] ? Math.min(1, d / lens[i]) : 1);
    d -= lens[i];
  }
  return out.copy(points[points.length - 1]);
}

interface Particle {
  kind: "kras" | "host" | "sticky" | "agg";
  radius: number;
  color: string;
  /** Resting position at the end of each step 0–6 (null = gone) */
  rest: (Vector3 | null)[];
  /** Route taken into step k (from rest[k-1] to rest[k]); empty = straight line */
  route: Vector3[][];
  delay: number;
}

function inBed(r: () => number) {
  const a = r() * Math.PI * 2;
  const rad = Math.sqrt(r()) * (COL.r - 0.45);
  return new Vector3(COL.x + Math.cos(a) * rad, COL.bedBottom + 0.4 + r() * (COL.bedTop - COL.bedBottom - 0.8), Math.sin(a) * rad * 0.6);
}
function inCloud(r: () => number) {
  return CLOUD.clone().add(new Vector3((r() - 0.5) * 7, (r() - 0.5) * 3, (r() - 0.5) * 2.4));
}
function inTube(r: () => number, centre: Vector3) {
  return centre.clone().add(new Vector3((r() - 0.5) * 1.1, (r() - 0.3) * 1.6, (r() - 0.5) * 0.6));
}

function buildParticles(): Particle[] {
  const r = rng(5);
  const down = (from: Vector3) => [new Vector3(COL.x + (r() - 0.5) * 2.4, COL.top, (r() - 0.5) * 0.8), new Vector3(COL.x + (r() - 0.5) * 2, COL.bedTop, 0), from];
  const out: Particle[] = [];
  const waste = () => new Vector3(COL.x + (r() - 0.5) * 0.6, COL.outlet - 2.2, 0);
  for (let i = 0; i < N_KRAS + N_AGG; i++) {
    const agg = i >= N_KRAS;
    const cloud = inCloud(r);
    const bed = inBed(r);
    const tube = inTube(r, TUBE);
    const final = agg ? new Vector3(SEC.x + 2.4, SEC.bottom - 1.6, 0) : inTube(r, FINAL);
    out.push({
      kind: agg ? "agg" : "kras",
      radius: agg ? 0.55 : 0.32,
      color: agg ? "#5C7FC9" : "#2A5CB8",
      rest: [null, cloud, bed, bed, tube, tube, agg ? null : final],
      route: [[], [], [cloud, ...down(bed)], [], [bed, new Vector3(COL.x, COL.outlet, 0), tube], [], [tube, new Vector3(SEC.x, SEC.top + 0.8, 0), new Vector3(SEC.x, SEC.top, 0), new Vector3(SEC.x, SEC.bottom, 0), final]],
      // clumps race through the size-exclusion column, single molecules lag behind
      delay: agg ? 0.02 : 0.15 + r() * 0.3,
    });
  }
  for (let i = 0; i < N_HOST; i++) {
    const sticky = i < N_STICKY;
    const cloud = inCloud(r);
    const bed = inBed(r);
    const palette = ["#C9BC9F", "#AEB8C8", "#D7C9A8", "#B9B0C9", "#A7B9AD"];
    out.push({
      kind: sticky ? "sticky" : "host",
      radius: 0.2 + r() * 0.26,
      color: palette[i % palette.length],
      rest: sticky ? [null, cloud, bed, null, null, null, null] : [null, cloud, null, null, null, null, null],
      route: sticky
        ? [[], [], [cloud, ...down(bed)], [bed, new Vector3(COL.x, COL.outlet, 0), waste()], [], [], []]
        : [[], [], [cloud, ...down(new Vector3(COL.x + (r() - 0.5) * 2, COL.bedBottom, 0)), new Vector3(COL.x, COL.outlet, 0), waste()], [], [], [], []],
      delay: r() * 0.4,
    });
  }
  return out;
}

const CELLS = [new Vector3(-2.6, 10.2, 0), new Vector3(0.4, 9.2, 0.6), new Vector3(2.8, 10.4, -0.4)];

export function PurificationStage() {
  const { role } = useStage();
  const step = usePipelineStore((s) => s.steps.purification);
  const particles = useMemo(() => buildParticles(), []);
  const blobs = useRef<InstancedMesh>(null);
  const tags = useRef<InstancedMesh>(null);
  const cells = useRef<InstancedMesh>(null);
  const flow = useRef<InstancedMesh>(null);
  const clock = useRef({ step, t: STEP_SECONDS });
  const [shownStep, setShownStep] = useState(step);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), v: new Vector3(), c: new Color() }), []);
  const flowSeeds = useMemo(() => {
    const r = rng(9);
    return Array.from({ length: 60 }, () => ({ x: (r() - 0.5) * 3.2, z: (r() - 0.5) * 1, o: r() }));
  }, []);

  const res = useMemo(() => {
    // glass column: a lathe profile with a narrow outlet
    const prof = [new Vector2(0.15, COL.outlet - 0.6), new Vector2(0.25, COL.outlet), new Vector2(COL.r, COL.outlet + 1.2), new Vector2(COL.r, COL.top), new Vector2(COL.r + 0.12, COL.top + 0.1)];
    const glass = new LatheGeometry(prof, 48);
    const glassMat = new MeshPhysicalMaterial({ color: "#DCE8F6", roughness: 0.08, transparent: true, opacity: 0.22, depthWrite: false, side: 2 });
    glassMat.userData.forceTransparent = true;
    const bed = new CylinderGeometry(COL.r - 0.08, COL.r - 0.08, COL.bedTop - COL.bedBottom, 40, 1);
    const bedMat = new MeshPhysicalMaterial({ color: "#BFE3CF", roughness: 0.7, transparent: true, opacity: 0.45, depthWrite: false });
    bedMat.userData.forceTransparent = true;
    const secProf = [new Vector2(0.12, SEC.bottom - 0.5), new Vector2(0.2, SEC.bottom), new Vector2(SEC.r, SEC.bottom + 0.6), new Vector2(SEC.r, SEC.top), new Vector2(SEC.r + 0.1, SEC.top + 0.08)];
    const secGlass = new LatheGeometry(secProf, 40);
    const secBed = new CylinderGeometry(SEC.r - 0.06, SEC.r - 0.06, SEC.top - SEC.bottom - 0.9, 32, 1);
    const secBedMat = new MeshPhysicalMaterial({ color: "#D5DEEC", roughness: 0.75, transparent: true, opacity: 0.5, depthWrite: false });
    secBedMat.userData.forceTransparent = true;
    const tubeProf = [new Vector2(0.01, -1.15), new Vector2(0.35, -1.0), new Vector2(0.75, -0.2), new Vector2(0.78, 1.25), new Vector2(0.84, 1.3)];
    const tube = new LatheGeometry(tubeProf, 36);
    const blob = new SphereGeometry(1, 16, 12);
    const blobMat = new MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 0.5 });
    const tag = new SphereGeometry(0.13, 10, 8);
    const tagMat = new MeshStandardMaterial({ color: TAG_COLORS.his, emissive: TAG_COLORS.his, emissiveIntensity: 0.25 });
    const cell = new CapsuleGeometry(0.8, 2.4, 8, 16);
    cell.rotateZ(Math.PI / 2);
    const cellMat = new MeshPhysicalMaterial({ color: "#78C69B", roughness: 0.4, transparent: true, opacity: 0.7, depthWrite: false });
    cellMat.userData.forceTransparent = true;
    const drop = new SphereGeometry(0.11, 8, 6);
    const dropMat = new MeshStandardMaterial({ color: "#8EC5F0", emissive: "#8EC5F0", emissiveIntensity: 0.3 });
    return { glass, glassMat, bed, bedMat, secGlass, secBed, secBedMat, tube, blob, blobMat, tag, tagMat, cell, cellMat, drop, dropMat };
  }, []);
  useEffect(() => () => Object.values(res).forEach((x) => x.dispose()), [res]);

  useFrame((state, delta) => {
    const goal = usePipelineStore.getState().steps.purification;
    const c = clock.current;
    if (goal !== c.step) {
      // forward one step animates; going back (replay) jumps
      c.t = goal === c.step + 1 ? 0 : STEP_SECONDS;
      c.step = goal;
      setShownStep(goal);
    }
    c.t = Math.min(STEP_SECONDS, c.t + stageDelta(delta));
    const k = c.t / STEP_SECONDS;
    const s = c.step;

    const bm = blobs.current;
    const tm = tags.current;
    if (!bm || !tm) return;
    particles.forEach((p, i) => {
      const prev = s > 0 ? p.rest[s - 1] : p.rest[0];
      const cur = p.rest[s];
      const route = p.route[s];
      const f = smooth((k - p.delay) / (1 - p.delay));
      let pos: Vector3 | null = null;
      let scale = p.radius;
      if (route.length >= 2 && k < 1) {
        pos = along(route, f, tmp.v.clone());
        if (!cur) scale *= 1 - smooth((f - 0.75) / 0.25);
      } else if (cur) {
        pos = cur.clone();
        if (!prev && s === 1) scale *= smooth(k * 1.6); // released when the cells burst
      } else if (prev && k < 1 && route.length < 2) {
        pos = prev.clone();
        scale *= 1 - k;
      }
      if (pos) {
        // a little Brownian jiggle
        pos.x += Math.sin(state.clock.elapsedTime * 1.9 + i * 1.3) * 0.05;
        pos.y += Math.cos(state.clock.elapsedTime * 1.6 + i * 0.7) * 0.05;
      }
      bm.setMatrixAt(i, tmp.m.compose(pos ?? tmp.v.set(0, -100, 0), tmp.q.identity(), tmp.s.setScalar(pos ? Math.max(scale, 0.0001) : 0.0001)));
      bm.setColorAt(i, tmp.c.set(p.color));
      // the His-tag rides on KRAS until TEV cuts it (step 5)
      const tagged = (p.kind === "kras" || p.kind === "agg") && pos && s >= 1;
      const cutK = s > 5 ? 1 : s === 5 ? smooth((k - 0.3) / 0.5) : 0;
      if (tagged && pos) {
        const off = tmp.s.set(Math.cos(i), Math.sin(i * 1.7), 0.3).normalize().multiplyScalar(p.radius + 0.06 + cutK * 1.6);
        tm.setMatrixAt(i, tmp.m.compose(pos.clone().add(off), tmp.q.identity(), tmp.v.setScalar(1 - cutK)));
      } else tm.setMatrixAt(i, tmp.m.makeScale(0, 0, 0));
    });
    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    // particles move every frame: refresh the bounds used for culling and picking
    bm.computeBoundingSphere();
    tm.instanceMatrix.needsUpdate = true;

    // cells before lysis
    const cm = cells.current;
    if (cm) {
      const burst = s === 0 ? 0 : s === 1 ? smooth(k * 2) : 1;
      CELLS.forEach((p, i) => cm.setMatrixAt(i, tmp.m.compose(p, tmp.q.setFromAxisAngle(new Vector3(0, 0, 1), i * 0.6 - 0.5), tmp.s.set(1 + burst * 0.4, 1 - burst, 1 - burst))));
      cm.instanceMatrix.needsUpdate = true;
      setBaseOpacity(res.cellMat, 0.7 * (1 - burst));
    }
    // buffer streaming down the column during wash (blue) and elution (imidazole, purple)
    const fm = flow.current;
    if (fm) {
      const active = (s === 3 || s === 4) && k < 1;
      res.dropMat.color.set(s === 4 ? "#A98BE6" : "#8EC5F0");
      res.dropMat.emissive.set(s === 4 ? "#A98BE6" : "#8EC5F0");
      flowSeeds.forEach((d, i) => {
        const y = COL.top + 2 - ((k * 1.6 + d.o) % 1) * (COL.top - COL.outlet + 2);
        fm.setMatrixAt(i, tmp.m.compose(tmp.v.set(COL.x + d.x * (y > COL.outlet + 1 ? 1 : 0.1), y, d.z), tmp.q.identity(), tmp.s.setScalar(active ? 1 : 0)));
      });
      fm.instanceMatrix.needsUpdate = true;
    }
  });

  const interactive = role === "current";
  const hover = (title: string, subtitle: string, swatch?: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `pur:${title}`, title, subtitle, swatch });
  };
  const out = () => useExplorerStore.getState().setHover(null);
  const onBlob = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || e.instanceId == null) return;
    const p = particles[e.instanceId];
    const text: Record<Particle["kind"], [string, string]> = {
      kras: ["KRAS", shownStep >= 5 ? "Tag removed: only Gly0 is left at the start of the chain." : "Carries the His-tag (green), which grips the nickel."],
      agg: ["Clumped KRAS", "A few molecules stick together; size exclusion removes these clumps."],
      host: ["E. coli protein", "No His-tag, so it does not stick to the nickel and flows through."],
      sticky: ["E. coli protein", "Sticks weakly to the column; the wash removes it."],
    };
    hover(text[p.kind][0], text[p.kind][1], p.color)(e);
  };

  const L = (x: number, y: number) => [x, y, 0] as [number, number, number];
  return (
    <group>
      <mesh geometry={res.glass} material={res.glassMat} position={[COL.x, 0, 0]} onPointerMove={hover("Nickel column", "Beads carrying nickel ions (Ni-NTA) that hold on to His-tags.")} onPointerOut={out} />
      <mesh geometry={res.bed} material={res.bedMat} position={[COL.x, (COL.bedTop + COL.bedBottom) / 2, 0]} raycast={() => null} />
      <mesh geometry={res.secGlass} material={res.glassMat} position={[SEC.x, 0, 0]} onPointerMove={hover("Size-exclusion column", "Porous beads: big clumps rush past them, single KRAS molecules wander through the pores and come out later.")} onPointerOut={out} />
      <mesh geometry={res.secBed} material={res.secBedMat} position={[SEC.x, (SEC.top + SEC.bottom) / 2 - 0.2, 0]} raycast={() => null} />
      <mesh geometry={res.tube} material={res.glassMat} position={TUBE} raycast={() => null} />
      <mesh geometry={res.tube} material={res.glassMat} position={FINAL} raycast={() => null} />
      <instancedMesh ref={cells} frustumCulled={false} args={[res.cell, res.cellMat, CELLS.length]} raycast={() => null} />
      <instancedMesh ref={blobs} args={[res.blob, res.blobMat, particles.length]} onPointerMove={onBlob} onPointerOut={out} />
      <instancedMesh ref={tags} frustumCulled={false} args={[res.tag, res.tagMat, particles.length]} raycast={() => null} />
      <instancedMesh ref={flow} frustumCulled={false} args={[res.drop, res.dropMat, flowSeeds.length]} raycast={() => null} />

      <SceneLabel position={L(-4.6, (COL.bedTop + COL.bedBottom) / 2)} essential>
        nickel column
      </SceneLabel>
      <SceneLabel position={L(SEC.x + 3.4, 1)} tone="muted">
        size exclusion
      </SceneLabel>
      {shownStep === 0 && (
        <SceneLabel position={L(0, 12.4)} tone="muted" essential>
          E. coli full of KRAS
        </SceneLabel>
      )}
      {shownStep === 1 && (
        <SceneLabel position={L(5.4, 10.6)} essential>
          KRAS (blue, green tag) among E. coli proteins
        </SceneLabel>
      )}
      {(shownStep === 2 || shownStep === 3) && (
        <SceneLabel position={L(4.8, -1.6)} tone="gold" essential>
          KRAS held by the nickel
        </SceneLabel>
      )}
      {shownStep >= 4 && shownStep < 6 && (
        <SceneLabel position={L(-3.6, TUBE.y)} tone="gold" essential>
          {shownStep === 5 ? "tags cut off" : "collected KRAS"}
        </SceneLabel>
      )}
      {shownStep === 6 && (
        <SceneLabel position={L(FINAL.x - 3.4, FINAL.y)} tone="gold" essential>
          pure KRAS
        </SceneLabel>
      )}
    </group>
  );
}

export const purificationFraming = () => framing([3, 1.2, 0], 13.2, [0.05, 0.12, 1]);
