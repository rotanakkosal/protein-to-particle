"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { CapsuleGeometry, Color, InstancedMesh, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { setBaseOpacity, useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";
import { useZoom } from "../lib/zoom";
import { BROTH_CENTRE, Flask, type FlaskState } from "./Flask";

/*
 * Opens on the culture: a flask of broth on a shaker, just after the plasmid went into the cells.
 * Step 1: a few drops of antibiotic go into the flask, then the view zooms into the cells
 * (rod-shaped E. coli, ≈ 2 µm × 0.8 µm; 1 unit ≈ 0.5 µm), where it kills the one cell that did not
 * take up the plasmid.
 * Step 2: three rounds of division turn the three survivors into 24 cells.
 */
const ADD = 1.8; // seconds of pipetting before the zoom
const ZOOM = 1.4;
const LENGTH = 4;
const RADIUS = 0.85;
const GENERATIONS = 3;
const PLASMIDS_PER_CELL = 3;

/** Small deterministic random generator so the colony looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface CellState {
  pos: Vector3;
  /** Long axis angle in the x–z plane */
  angle: number;
}

/** Positions of every generation; daughters start end-to-end where the parent was, then relax apart. */
function buildColony() {
  const rand = rng(7);
  const gens: CellState[][] = [];
  gens.push([
    { pos: new Vector3(-3.2, 0, -1.2), angle: 0.3 },
    { pos: new Vector3(2.8, 0, -2.0), angle: -0.6 },
    { pos: new Vector3(0.2, 0, 2.6), angle: 1.2 },
  ]);
  for (let g = 1; g <= GENERATIONS; g++) {
    const prev = gens[g - 1];
    const next: CellState[] = [];
    for (const p of prev) {
      const axis = new Vector3(Math.cos(p.angle), 0, Math.sin(p.angle));
      for (const side of [-1, 1]) next.push({ pos: p.pos.clone().addScaledVector(axis, side * (LENGTH / 2 + 0.15)), angle: p.angle + (rand() - 0.5) * 0.5 });
    }
    // relax overlaps so the colony spreads out: each rod is treated as three touching discs along its axis
    const discs = [-1.15, 0, 1.15];
    const minGap = 2 * RADIUS + 0.12;
    for (let it = 0; it < 160; it++) {
      for (let i = 0; i < next.length; i++)
        for (let j = i + 1; j < next.length; j++) {
          const ai = new Vector3(Math.cos(next[i].angle), 0, Math.sin(next[i].angle));
          const aj = new Vector3(Math.cos(next[j].angle), 0, Math.sin(next[j].angle));
          for (const di of discs)
            for (const dj of discs) {
              const pi = next[i].pos.clone().addScaledVector(ai, di);
              const pj = next[j].pos.clone().addScaledVector(aj, dj);
              const d = new Vector3().subVectors(pj, pi);
              const dist = d.length() || 0.001;
              if (dist < minGap) {
                d.multiplyScalar(((minGap - dist) / dist) * 0.25);
                next[i].pos.sub(d);
                next[j].pos.add(d);
              }
            }
        }
      // a gentle pull toward the centre keeps the colony compact
      for (const c of next) c.pos.multiplyScalar(0.997);
    }
    gens.push(next);
  }
  return gens;
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const UP = new Vector3(0, 1, 0);

export function CellStage() {
  const { protein } = useProteinData();
  const exp = protein.experiment;
  const { role } = useStage();
  const step = usePipelineStore((s) => s.steps.cell);
  const view = usePipelineStore((s) => s.subViews.cell ?? (s.steps.cell > 0 ? "cells" : "flask"));
  const clock = useRef({ step, t: 99 });
  const flask = useRef<FlaskState>({ turbidity: 0.2, add: 0, addColor: "#E8862A" });
  const [arrived, setArrived] = useState(view === "cells");
  const zoom = useZoom(view === "cells", { outerPivot: BROTH_CENTRE, innerPivot: new Vector3(0, 0, 0), outerScale: 12, seconds: ZOOM });
  const cells = useRef<InstancedMesh>(null);
  const plasmids = useRef<InstancedMesh>(null);
  const loner = useRef<InstancedMesh>(null);
  const drugs = useRef<InstancedMesh>(null);
  const kill = useRef(step >= 1 ? 1 : 0);
  const grow = useRef(step >= 2 ? GENERATIONS : 0);
  const colony = useMemo(() => buildColony(), []);
  const maxCells = colony[GENERATIONS].length;
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), v: new Vector3(), c: new Color() }), []);
  const drugSeeds = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: 70 }, () => new Vector3((r() - 0.5) * 22, 4 + r() * 6, (r() - 0.5) * 16));
  }, []);

  const res = useMemo(() => {
    const capsule = new CapsuleGeometry(RADIUS, LENGTH - 2 * RADIUS, 8, 20);
    capsule.rotateZ(Math.PI / 2); // long axis along x
    const cellMat = new MeshPhysicalMaterial({ color: "#78C69B", roughness: 0.35, transparent: true, opacity: 0.62, clearcoat: 0.5, depthWrite: false });
    cellMat.userData.forceTransparent = true;
    cellMat.userData.viewMax = 0.62;
    const deadMat = new MeshPhysicalMaterial({ color: "#A7AFBC", roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
    deadMat.userData.forceTransparent = true;
    deadMat.userData.ownFade = true;
    const ring = new TorusGeometry(0.26, 0.07, 8, 20);
    const ringMat = new MeshStandardMaterial({ color: "#E2B93B", emissive: "#E2B93B", emissiveIntensity: 0.3, roughness: 0.4 });
    const dot = new SphereGeometry(0.12, 8, 6);
    const dotMat = new MeshStandardMaterial({ color: "#E8862A", emissive: "#E8862A", emissiveIntensity: 0.4 });
    return { capsule, cellMat, deadMat, ring, ringMat, dot, dotMat };
  }, []);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  // pin the view on arrival, so the first step's flask scene is not skipped
  useEffect(() => {
    const store = usePipelineStore.getState();
    if (!store.subViews.cell) store.setSubView("cell", store.steps.cell > 0 ? "cells" : "flask");
  }, []);

  // the plasmid-free cell sits apart from the others
  const lonerPos = useMemo(() => new Vector3(-0.8, 0, -4.8), []);

  useFrame((state, delta) => {
    const store = usePipelineStore.getState();
    const st = store.steps.cell;
    delta = stageDelta(delta);
    const c = clock.current;
    if (st !== c.step) {
      c.t = st === 1 && c.step === 0 ? 0 : 99;
      // a fresh "Add antibiotic" stays on the flask until the drops are in
      store.setSubView("cell", st === 0 || (st === 1 && c.step === 0) ? "flask" : "cells");
      c.step = st;
    }
    c.t += delta;
    // step 1 starts in the flask: pipette the antibiotic in, then dive into the culture
    flask.current.add = st === 1 && c.t < ADD ? c.t / ADD : 0;
    if (st === 1 && c.t >= ADD) store.setSubView("cell", "cells");
    const k = st >= 1 && c.t >= ADD + ZOOM ? 1 : 0;
    // labels wait until the zoom has nearly landed
    const near = zoom.progress.current > 0.85;
    if (near !== arrived) setArrived(near);
    kill.current += Math.sign(k - kill.current) * Math.min(Math.abs(k - kill.current), delta / 2.2);
    const g = st >= 2 ? GENERATIONS : 0;
    grow.current += Math.sign(g - grow.current) * Math.min(Math.abs(g - grow.current), delta / 1.6);

    const cm = cells.current;
    const pm = plasmids.current;
    if (!cm || !pm) return;
    const p = grow.current;
    const gen = Math.min(GENERATIONS - 1, Math.floor(p));
    const f = ease(Math.min(1, p - gen));
    const parents = colony[gen];
    const daughters = colony[gen + 1];
    let n = 0;
    let rings = 0;
    const place = (pos: Vector3, angle: number, lengthScale: number, i: number) => {
      tmp.q.setFromAxisAngle(UP, -angle);
      cm.setMatrixAt(n++, tmp.m.compose(pos, tmp.q, tmp.s.set(lengthScale, 1, 1)));
      const axis = tmp.v.set(Math.cos(angle), 0, Math.sin(angle));
      for (let r = 0; r < PLASMIDS_PER_CELL; r++) {
        const along = ((r - 1) * LENGTH * 0.24 + Math.sin(state.clock.elapsedTime * 0.8 + i * 1.7 + r) * 0.12) * lengthScale;
        const at = pos.clone().addScaledVector(axis, along);
        at.y += 0.1 * Math.sin(i + r);
        tmp.q.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 + r);
        pm.setMatrixAt(rings++, tmp.m.compose(at, tmp.q, tmp.s.setScalar(1)));
      }
    };
    if (p <= 0.0001) {
      parents.forEach((c, i) => place(c.pos, c.angle, 1, i));
    } else {
      // each parent splits into two half-length cells that grow and separate
      parents.forEach((c, i) => {
        for (const side of [0, 1]) {
          const d = daughters[i * 2 + side];
          const axis = new Vector3(Math.cos(c.angle), 0, Math.sin(c.angle));
          const startPos = c.pos.clone().addScaledVector(axis, (side ? 1 : -1) * (LENGTH / 4));
          const pos = startPos.lerp(d.pos, f);
          const angle = c.angle + (d.angle - c.angle) * f;
          place(pos, angle, 0.5 + 0.5 * f, i * 2 + side);
        }
      });
    }
    cm.count = n;
    pm.count = rings;
    cm.instanceMatrix.needsUpdate = true;
    pm.instanceMatrix.needsUpdate = true;
    cm.computeBoundingSphere();

    // the cell without a plasmid shrivels and fades once the antibiotic arrives
    const lm = loner.current;
    if (lm) {
      const kk = kill.current;
      tmp.q.setFromAxisAngle(UP, -0.9);
      lm.setMatrixAt(0, tmp.m.compose(lonerPos, tmp.q, tmp.s.set(1 - 0.35 * kk, 1 - 0.55 * kk, 1 - 0.55 * kk)));
      lm.instanceMatrix.needsUpdate = true;
      lm.computeBoundingSphere();
      lm.visible = kk < 0.98;
      setBaseOpacity(res.deadMat, 0.55 * (1 - kk) * zoom.progress.current);
    }
    // antibiotic molecules drift down while it acts
    const dm = drugs.current;
    if (dm) {
      const show = kill.current > 0.01 && kill.current < 0.99 ? 1 : 0;
      drugSeeds.forEach((s0, i) => {
        const y = s0.y - kill.current * 9;
        dm.setMatrixAt(i, tmp.m.compose(tmp.v.set(s0.x, y, s0.z), tmp.q.identity(), tmp.s.setScalar(show)));
      });
      dm.instanceMatrix.needsUpdate = true;
    }
  });

  const interactive = role === "current" && view === "cells";
  const hover = (title: string, subtitle: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `cell:${title}`, title, subtitle, swatch: "#78C69B" });
  };
  const out = () => useExplorerStore.getState().setHover(null);
  const strain = exp?.expression.strain ?? "BL21 (DE3)";

  return (
    <group>
      <group ref={zoom.outer}>
        <Flask state={flask} show={view === "flask"} label={step === 0 ? "transformed cells in LB broth" : "adding antibiotic"} />
      </group>
      <group ref={zoom.inner}>
        <instancedMesh
          ref={cells}
          args={[res.capsule, res.cellMat, maxCells]}
          onPointerMove={hover(`E. coli ${strain}`, "Carries the KRAS plasmid (gold rings); the resistance gene lets it survive the antibiotic.")}
          onPointerOut={out}
        />
        <instancedMesh ref={plasmids} frustumCulled={false} args={[res.ring, res.ringMat, maxCells * PLASMIDS_PER_CELL]} raycast={() => null} />
        <instancedMesh
          ref={loner}
          args={[res.capsule, res.deadMat, 1]}
          onPointerMove={hover("Cell without the plasmid", "It never took up the plasmid, so it has no resistance gene: the antibiotic kills it.")}
          onPointerOut={out}
        />
        <instancedMesh ref={drugs} frustumCulled={false} args={[res.dot, res.dotMat, drugSeeds.length]} raycast={() => null} />
      </group>
      {view === "cells" && arrived && (
        <>
          <SceneLabel position={[0, 2.2, -8.5]} essential>
            E. coli {strain} · about 2 µm long
          </SceneLabel>
          {step === 0 && (
            <SceneLabel position={[lonerPos.x, 1.6, lonerPos.z - 1.2]} tone="muted" essential>
              no plasmid
            </SceneLabel>
          )}
          {step === 1 && (
            <SceneLabel position={[0, 1.8, 6.6]} tone="gold" essential>
              survivors carry the plasmid
            </SceneLabel>
          )}
          {step === 2 && (
            <SceneLabel position={[0, 1.8, 9.8]} tone="accent" essential>
              3 cells → 24 after three divisions
            </SceneLabel>
          )}
          <SceneLabel position={[6.8, 1.4, -4.6]} tone="gold">
            plasmids (gold rings)
          </SceneLabel>
        </>
      )}
    </group>
  );
}

export const cellFraming = () => {
  const { steps, subViews } = usePipelineStore.getState();
  if ((subViews.cell ?? (steps.cell > 0 ? "cells" : "flask")) === "flask") return framing([0, 1.2, 0], 4.8, [0.12, 0.42, 1]);
  return steps.cell >= 2 ? framing([0, 0, 1], 13.5, [0.25, 1.1, 0.9]) : framing([0, 0, 0], 10, [0.25, 1.1, 0.9]);
};
