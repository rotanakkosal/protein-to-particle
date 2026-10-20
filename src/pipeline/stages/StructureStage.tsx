"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, InstancedMesh, LineBasicMaterial, Matrix4, MeshPhysicalMaterial, Quaternion, SphereGeometry, Vector3 } from "three";
import { longDate } from "@/content/pipeline";
import type { ProteinModel } from "@/lib/structure/protein";
import { paintRibbon } from "@/lib/geometry/ribbon";
import { useDataStore, useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { cylinderMatrix } from "@/scene/shared/geometry";
import { getRibbon, residueBaseColors } from "@/scene/levels/ProteinLevel";
import { setBaseOpacity, useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";
import { chickenWire, densityGrid, matchedLevel, type DensityAtom } from "../lib/density";

/*
 * From data to model, on the P-loop with its GDP and Mg²⁺. A search model (drawn with 4OBE's own
 * atoms, slightly misplaced) is rotated and shifted into place, which gives a first, blurry map;
 * refinement then settles the atoms onto their deposited positions while the map sharpens. Both
 * maps are calculated from the deposited atoms and B-factors; the blurry one adds 50 Å² to every B.
 */
const SCALE = 0.42; // Å → scene units
const P_LOOP = [10, 18]; // G10 to S17, plus A18 which caps the loop
const LEVEL = 1.2; // e/Å³ for the final map
const BLUR = 50; // Å² added to every B-factor for the first map
const DURATION = [0, 3, 4, 2.5];
const SEARCH_TURN = { axis: new Vector3(0.3, 1, 0.2).normalize(), angle: 0.75 };
const SEARCH_SHIFT = new Vector3(5.5, 2.5, -3);
const JITTER = 0.7; // Å, how far the unrefined atoms sit from their final positions
const ELEMENT_COLORS: Record<string, string> = { C: "#7A8394", N: "#3D5FD9", O: "#E0413A", P: "#E8862A", S: "#E2B93B", MG: "#4FAF5C" };
const SEARCH_COLOR = new Color("#A9B1BF");
const BOND_COLOR = new Color("#8E97A8");
const IDENTITY = new Quaternion();
const Z: Record<string, number> = { C: 6, N: 7, O: 8, P: 15, S: 16, MG: 12 };

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 91.7 + salt * 47.3) * 43758.5453;
  return x - Math.floor(x);
};

interface SiteAtom extends DensityAtom {
  label: string;
  element: string;
  group: "ploop" | "GDP" | "MG";
}

/** P-loop, GDP and Mg²⁺ atoms in the model frame, with B-factors from the deposited file. */
function siteAtoms(protein: ProteinModel): SiteAtom[] {
  const crystal = protein.crystal;
  const { centroid, axes } = protein.frame;
  const deposited: { p: Vector3; b: number }[] = [];
  if (crystal) {
    const { asu } = crystal;
    const chain = asu.chains.indexOf(protein.chainId);
    for (let i = 0; i < asu.count; i++) {
      if (asu.chain[i] !== chain) continue;
      const d = new Vector3(asu.xyz[i * 3], asu.xyz[i * 3 + 1], asu.xyz[i * 3 + 2]).sub(centroid);
      deposited.push({ p: new Vector3(axes[0].dot(d), axes[1].dot(d), axes[2].dot(d)), b: asu.bFactor[i] });
    }
  }
  const bAt = (p: Vector3) => {
    let best = 20;
    let bd = 0.05;
    for (const a of deposited) {
      const d = a.p.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = a.b;
      }
    }
    return best;
  };
  const out: SiteAtom[] = [];
  for (const r of protein.residues) {
    if (r.seq < P_LOOP[0] || r.seq > P_LOOP[1]) continue;
    for (const [name, p] of Object.entries(r.atoms)) {
      const element = r.elements[name] as string;
      out.push({ position: p, z: Z[element] ?? 6, b: bAt(p), label: `${r.resName[0]}${r.resName.slice(1).toLowerCase()}${r.seq} · ${name}`, element, group: "ploop" });
    }
  }
  for (const l of protein.ligands) {
    if (l.resName !== "GDP" && l.resName !== "MG") continue;
    for (const a of l.atoms) {
      const element = a.element.toUpperCase();
      out.push({ position: a.position, z: Z[element] ?? 6, b: bAt(a.position), label: l.resName === "MG" ? "Mg²⁺ ion" : `GDP · ${a.name}`, element, group: l.resName === "MG" ? "MG" : "GDP" });
    }
  }
  return out;
}

const sites = new WeakMap<ProteinModel, ReturnType<typeof buildSite>>();
/** The site's atoms, bonds, refinement offsets and landmarks (cached per structure). */
function siteFor(protein: ProteinModel) {
  let site = sites.get(protein);
  if (!site) sites.set(protein, (site = buildSite(protein)));
  return site;
}

function buildSite(protein: ProteinModel) {
  const atoms = siteAtoms(protein);
  const centre = atoms.reduce((s, a) => s.add(a.position), new Vector3()).divideScalar(Math.max(1, atoms.length));
  const bonds: [number, number][] = [];
  for (let i = 0; i < atoms.length; i++)
    for (let j = i + 1; j < atoms.length; j++) {
      if (atoms[i].group === "MG" || atoms[j].group === "MG") continue;
      if (atoms[i].position.distanceTo(atoms[j].position) < 1.95) bonds.push([i, j]);
    }
  const jitter = atoms.map((_, i) => new Vector3(rand(i, 1) - 0.5, rand(i, 2) - 0.5, rand(i, 3) - 0.5).normalize().multiplyScalar(JITTER * (0.5 + rand(i, 4) * 0.5)));
  const centreOf = (g: SiteAtom["group"]) => {
    const list = atoms.filter((a) => a.group === g);
    return list.reduce((s, a) => s.add(a.position), new Vector3()).divideScalar(Math.max(1, list.length));
  };
  const colors = atoms.map((a) => new Color(ELEMENT_COLORS[a.element] ?? ELEMENT_COLORS.C));
  // looking at the site from outside the protein
  const outward = centre.clone().normalize();
  return { atoms, centre, bonds, jitter, colors, outward, gdp: centreOf("GDP"), mg: centreOf("MG"), ploop: centreOf("ploop") };
}

export function StructureStage() {
  const { protein } = useProteinData();
  const { role } = useStage();
  const step = usePipelineStore((s) => s.steps.structure);
  const dark = useExplorerStore((s) => s.theme === "dark");
  const clock = useRef({ step, t: DURATION[step] ?? 0 });
  const [phase, setPhase] = useState({ step, done: true });
  const [maps, setMaps] = useState<{ first: BufferGeometry; final: BufferGeometry } | null>(null);
  const balls = useRef<InstancedMesh>(null);
  const sticks = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), w: new Vector3(), c: new Color() }), []);

  const site = useMemo(() => siteFor(protein), [protein]);

  const res = useMemo(() => {
    const ribbon = getRibbon(protein);
    paintRibbon(ribbon, residueBaseColors(protein, "structure"));
    const ribbonMat = new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, clearcoat: 0.55, transparent: true, opacity: 0 });
    ribbonMat.userData.forceTransparent = true;
    const ball = new SphereGeometry(1, 14, 10);
    const ballMat = new MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.7 });
    const stick = new CylinderGeometry(1, 1, 1, 8);
    const stickMat = new MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 0.4 });
    const firstMat = new LineBasicMaterial({ color: "#2F72E4", transparent: true, opacity: 0, depthWrite: false });
    firstMat.userData.forceTransparent = true;
    const finalMat = new LineBasicMaterial({ color: "#2F72E4", transparent: true, opacity: 0, depthWrite: false });
    finalMat.userData.forceTransparent = true;
    return { ribbon, ribbonMat, ball, ballMat, stick, stickMat, firstMat, finalMat };
  }, [protein]);
  useEffect(
    () => () => {
      const { ribbon, ...rest } = res;
      void ribbon; // shared with the explorer, not disposed here
      Object.values(rest).forEach((r) => r.dispose());
    },
    [res],
  );
  useEffect(() => {
    const color = dark ? "#7FA6F2" : "#2F62D0";
    res.firstMat.color.set(color);
    res.finalMat.color.set(color);
  }, [res, dark]);

  // the maps take a moment to calculate, so wait until the stage has settled
  const current = role === "current";
  useEffect(() => {
    if (!current || maps) return;
    const id = window.setTimeout(() => {
      const final = densityGrid(site.atoms, 0.4, 2.2, 0);
      const first = densityGrid(site.atoms, 0.4, 2.2, BLUR);
      const geometry = (lines: Float32Array) => {
        const g = new BufferGeometry();
        g.setAttribute("position", new Float32BufferAttribute(lines, 3));
        return g;
      };
      setMaps({ final: geometry(chickenWire(final, LEVEL)), first: geometry(chickenWire(first, matchedLevel(final, LEVEL, first))) });
    }, 30);
    return () => window.clearTimeout(id);
  }, [current, maps, site]);
  useEffect(
    () => () => {
      maps?.first.dispose();
      maps?.final.dispose();
    },
    [maps],
  );

  useFrame((_, delta) => {
    const goal = usePipelineStore.getState().steps.structure;
    const c = clock.current;
    if (goal !== c.step) {
      c.t = goal > c.step ? 0 : DURATION[goal];
      c.step = goal;
      setPhase({ step: goal, done: goal === 0 });
    }
    const dur = DURATION[c.step];
    c.t = Math.min(dur, c.t + stageDelta(delta));
    const k = dur ? smooth(c.t / dur) : 1;
    if (c.t >= dur && !phase.done) setPhase({ step: c.step, done: true });
    const s = c.step;

    const place = s === 0 ? 0 : s === 1 ? k : 1;
    const refine = s < 2 ? 0 : s === 2 ? k : 1;
    const deposit = s < 3 ? 0 : k;
    setBaseOpacity(res.firstMat, s === 1 ? smooth(k * 2 - 1) : s === 2 ? 1 - k : 0);
    setBaseOpacity(res.finalMat, s === 2 ? k : s === 3 ? 1 - 0.45 * k : 0);
    setBaseOpacity(res.ribbonMat, 0.88 * deposit);

    // search model: a rigid turn and shift away from the answer, plus small per-atom errors
    tmp.q.setFromAxisAngle(SEARCH_TURN.axis, SEARCH_TURN.angle * (1 - place));
    const shift = tmp.w.copy(SEARCH_SHIFT).multiplyScalar(1 - place);
    const pos = site.atoms.map((a, i) =>
      a.position
        .clone()
        .addScaledVector(site.jitter[i], 1 - refine)
        .sub(site.centre)
        .applyQuaternion(tmp.q)
        .add(site.centre)
        .add(shift),
    );

    const bm = balls.current;
    if (bm) {
      site.atoms.forEach((a, i) => {
        const r = a.group === "MG" ? 0.62 : 0.24;
        bm.setMatrixAt(i, tmp.m.compose(pos[i], IDENTITY, tmp.s.setScalar(r)));
        bm.setColorAt(i, tmp.c.copy(SEARCH_COLOR).lerp(site.colors[i], a.group === "ploop" ? refine : Math.max(refine, place * 0.6)));
      });
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
      bm.computeBoundingSphere();
    }
    const sm = sticks.current;
    if (sm) {
      site.bonds.forEach(([i, j], n) => sm.setMatrixAt(n, cylinderMatrix(pos[i], pos[j], 0.11, tmp.m)));
      site.bonds.forEach((_, n) => sm.setColorAt(n, tmp.c.copy(SEARCH_COLOR).lerp(BOND_COLOR, refine)));
      sm.instanceMatrix.needsUpdate = true;
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
      sm.computeBoundingSphere();
    }
  });

  const interactive = current;
  const exp = protein.experiment;
  const ref = exp?.refinement;
  const label = (v: Vector3) => v.clone().toArray();
  const searchCentre = site.centre.clone().add(SEARCH_SHIFT);
  const { step: shownStep, done } = phase;

  return (
    <group scale={SCALE}>
      <mesh geometry={res.ribbon.geometry} material={res.ribbonMat} raycast={() => null} />
      {maps && (
        <>
          <lineSegments geometry={maps.first} material={res.firstMat} raycast={() => null} />
          <lineSegments geometry={maps.final} material={res.finalMat} raycast={() => null} />
        </>
      )}
      <instancedMesh
        ref={balls}
        args={[res.ball, res.ballMat, site.atoms.length]}
        onPointerMove={(e) => {
          if (!interactive || e.instanceId === undefined) return;
          e.stopPropagation();
          const a = site.atoms[e.instanceId];
          useExplorerStore.getState().setHover({ key: `site:${e.instanceId}`, title: a.label, subtitle: `B-factor ${a.b.toFixed(1)} Å² in 4OBE: how much this atom jiggles. Low values give sharp density.` });
        }}
        onPointerOut={() => useExplorerStore.getState().setHover(null)}
      />
      <instancedMesh ref={sticks} args={[res.stick, res.stickMat, Math.max(1, site.bonds.length)]} raycast={() => null} />

      {shownStep === 0 && (
        <SceneLabel position={label(searchCentre.clone().add(new Vector3(0, 6, 0)))} essential>
          search model · not yet placed
        </SceneLabel>
      )}
      {shownStep === 1 && done && (
        <SceneLabel position={label(site.centre.clone().add(new Vector3(0, 7.5, 0)))} essential>
          first map · phases borrowed from the placed model
        </SceneLabel>
      )}
      {shownStep >= 1 && shownStep < 3 && (
        <>
          <SceneLabel position={label(site.gdp.clone().add(new Vector3(0, 0, 4)))} tone="accent">
            GDP
          </SceneLabel>
          <SceneLabel position={label(site.mg.clone().add(new Vector3(0, -2.2, 0)))} tone="accent">
            Mg²⁺
          </SceneLabel>
          <SceneLabel position={label(site.ploop.clone().add(new Vector3(0, 0, -3)))} tone="accent">
            P-loop · G10 to S17
          </SceneLabel>
        </>
      )}
      {shownStep === 2 && done && ref?.rWork && ref.rFree && (
        <SceneLabel position={label(site.centre.clone().add(new Vector3(0, 7.5, 0)))} tone="strong" essential>
          {`refined · R-work ${ref.rWork.toFixed(3)} · R-free ${ref.rFree.toFixed(3)}`}
        </SceneLabel>
      )}
      {shownStep === 3 && done && (
        <SceneLabel position={[0, protein.maxDimension * 0.55, 0]} tone="strong" essential>
          {`PDB ${protein.idCode} · released ${longDate(exp?.dates.released ?? null)}`}
        </SceneLabel>
      )}
    </group>
  );
}

/** Close on the site while the model is placed and refined; the whole molecule once deposited. */
export const structureFraming = () => {
  const protein = useDataStore.getState().protein;
  if (!protein) return framing([0, 0, 0], 10, [0.2, 0.25, 1]);
  const site = siteFor(protein);
  const direction = site.outward.clone().add(new Vector3(0, 0.35, 0)).toArray();
  if (usePipelineStore.getState().steps.structure >= 3) return framing([0, 0, 0], (protein.maxDimension / 2) * SCALE * 1.05, direction);
  const target = site.centre.clone().addScaledVector(SEARCH_SHIFT, 0.3).multiplyScalar(SCALE);
  return framing(target.toArray(), 12 * SCALE, direction);
};
