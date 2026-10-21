"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { recipe } from "@/content/pipeline";
import type { CrystalInfo } from "@/lib/pdb/experiment";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { cylinderMatrix } from "@/scene/shared/geometry";
import { useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";
import { useViewFade } from "../lib/viewFade";
import { cellEdges, crystalGeometry, formatSymop, fracToCart, packUnitCell } from "../lib/crystalPacking";

/*
 * Two views. The plate (schematic): a 96-well crystallization plate, each well a reservoir with a
 * drop of protein plus reservoir solution hanging from the sealing film above it. Water moves from
 * the drop to the more concentrated reservoir, the drop shrinks and, in the right condition,
 * crystals grow; neighbouring wells with other conditions stay clear or precipitate. Inside the
 * crystal (real data): the 4OBE unit cell with every symmetry copy of the two deposited molecules,
 * drawn as Cα traces, and the neighbouring cells faintly around it.
 */
const EQUILIBRATE = 7; // seconds standing in for days
const ZOOM_DELAY = 1.2; // let the camera arrive at the well first
const DROP = new Vector3(0, 0.62, 0); // centre of the drop's flat top, under the sealing film
const N_PROTEIN = 110;
const N_VAPOUR = 28;
const RESERVOIR_TOP = -1.2;
const LATTICE_SCALE = 0.1; // Å → scene units
const CRYSTALS = [
  { at: new Vector3(-0.38, -0.46, 0.14), turn: [0.4, 0.8, 0.2], size: 1, delay: 0 },
  { at: new Vector3(0.5, -0.32, -0.26), turn: [1.2, 0.3, 0.9], size: 0.72, delay: 0.12 },
  { at: new Vector3(0.05, -0.52, 0.48), turn: [0.2, 2.1, 1.4], size: 0.58, delay: 0.24 },
];
const CLUMPS = [new Vector3(-0.42, -0.5, 0.2), new Vector3(0.38, -0.44, -0.18), new Vector3(0.05, -0.58, 0.5), new Vector3(0.62, -0.3, 0.32), new Vector3(-0.2, -0.42, -0.5)];
// 96-well plate: 8 rows (A at the back) × 12 columns, 9 mm pitch drawn as 4.8 units
const PITCH = 4.8;
const ROWS = 8;
const COLS = 12;
const wellAt = (row: number, col: number) => new Vector3((col - (COLS - 1) / 2) * PITCH, 0, (row - (ROWS - 1) / 2) * PITCH);
type Outcome = "clear" | "crystals" | "precipitate";
/** The front-row wells shown in detail: the 4OBE condition in H6 between two other conditions */
const DETAIL: { row: number; col: number; outcome: Outcome; name: string }[] = [
  { row: 7, col: 4, outcome: "clear", name: "H5" },
  { row: 7, col: 5, outcome: "crystals", name: "H6" },
  { row: 7, col: 6, outcome: "precipitate", name: "H7" },
];
const FOCUS = wellAt(7, 5);

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** Deterministic pseudo-random in [0, 1) */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const glass = (color: string, opacity: number) => {
  const m = new MeshPhysicalMaterial({ color, roughness: 0.08, transparent: true, opacity, depthWrite: false, side: 2 });
  m.userData.forceTransparent = true;
  m.userData.viewMax = opacity;
  return m;
};

/* ------------------------------------------------------------------ one well in detail */

/** A well with its reservoir and hanging drop; `progress` (0…1) is how far it has equilibrated. */
function Well({
  crystal,
  at,
  outcome,
  progress,
  interactive,
  labels,
}: {
  crystal: CrystalInfo;
  at: Vector3;
  outcome: Outcome;
  progress: MutableRefObject<number>;
  interactive: boolean;
  labels: "none" | "well" | "outcome";
}) {
  const { protein } = useProteinData();
  const [grown, setGrown] = useState(progress.current > 0.5);
  const drop = useRef<Mesh>(null);
  const dots = useRef<InstancedMesh>(null);
  const vapour = useRef<InstancedMesh>(null);
  const gems = useRef<Group>(null);
  const clumps = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), v: new Vector3(), w: new Vector3() }), []);

  const res = useMemo(() => {
    const well = new CylinderGeometry(2.05, 1.95, 2.6, 40, 1, true);
    const wellMat = glass("#DCE8F6", 0.3);
    const reservoir = new CylinderGeometry(1.93, 1.9, 0.8, 40);
    const reservoirMat = glass("#BFD9F5", 0.6);
    // lower half of a sphere, flattened into a lens that hangs from the film
    const dropGeo = new SphereGeometry(1, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const dropMat = new MeshPhysicalMaterial({ color: "#CFE3FA", roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55, depthWrite: false });
    dropMat.userData.forceTransparent = true;
    dropMat.userData.viewMax = 0.55;
    const dot = new SphereGeometry(0.04, 6, 5);
    const dotMat = new MeshStandardMaterial({ color: "#2F72E4", roughness: 0.5 });
    const steam = new SphereGeometry(0.03, 6, 5);
    const steamMat = new MeshStandardMaterial({ color: "#7FB2EC", roughness: 0.5, transparent: true, opacity: 0.8 });
    steamMat.userData.viewMax = 0.8;
    const gem = crystalGeometry(crystal, [0.62, 0.25, 0.45]);
    const gemMat = new MeshPhysicalMaterial({ color: "#6FA6EE", roughness: 0.04, clearcoat: 1, metalness: 0.05, emissive: "#2F62D0", emissiveIntensity: 0.35, flatShading: true });
    const speck = new SphereGeometry(0.075, 7, 5);
    const speckMat = new MeshStandardMaterial({ color: "#A27A4A", roughness: 0.85 });
    return { well, wellMat, reservoir, reservoirMat, dropGeo, dropMat, dot, dotMat, steam, steamMat, gem, gemMat, speck, speckMat };
  }, [crystal]);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  // protein molecules: a home position inside the unit lens and the crystal (or clump) each one joins
  const molecules = useMemo(
    () =>
      Array.from({ length: N_PROTEIN }, (_, i) => {
        const r = Math.sqrt(rand(i, 1)) * 0.85;
        const a = rand(i, 2) * Math.PI * 2;
        const depth = Math.sqrt(Math.max(0, 1 - r * r)) * (0.15 + 0.75 * rand(i, 3));
        return { home: new Vector3(r * Math.cos(a), -depth, r * Math.sin(a)), target: i % 3, joinAt: 0.1 + 0.85 * rand(i, 4), phase: rand(i, 5) * 10 };
      }),
    [],
  );
  // amorphous precipitate: a few irregular clumps of specks
  const specks = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => {
        const c = CLUMPS[i % CLUMPS.length];
        return {
          at: c.clone().add(new Vector3(rand(i, 9) - 0.5, (rand(i, 10) - 0.5) * 0.4, rand(i, 11) - 0.5).multiplyScalar(0.34)),
          size: 0.6 + rand(i, 12) * 0.9,
          delay: rand(i, 13) * 0.4,
        };
      }),
    [],
  );
  const steamPaths = useMemo(
    () =>
      Array.from({ length: N_VAPOUR }, (_, i) => {
        const a = rand(i, 6) * Math.PI * 2;
        const from = new Vector3(Math.cos(a) * 1.0, -0.3, Math.sin(a) * 1.0);
        const to = new Vector3(Math.cos(a) * (1.2 + 0.5 * rand(i, 7)), RESERVOIR_TOP - DROP.y + 0.05, Math.sin(a) * (1.2 + 0.5 * rand(i, 7)));
        return { from, to, offset: rand(i, 8) };
      }),
    [],
  );

  useFrame((state) => {
    const k = progress.current;
    if (k > 0.5 !== grown) setGrown(k > 0.5);
    const time = state.clock.elapsedTime;

    // the drop loses about a quarter of its width as water leaves it
    const shrink = 1 - (outcome === "clear" ? 0.12 : 0.24) * smooth(k / 0.9);
    const lens = tmp.s.set(1.45 * shrink, 0.85 * shrink, 1.45 * shrink);
    drop.current?.scale.copy(lens);

    const growth = CRYSTALS.map((g) => (outcome === "crystals" ? smooth((k - 0.35 - g.delay) / 0.5) : 0));
    gems.current?.children.forEach((child, i) => child.scale.setScalar(Math.max(0.0001, growth[i] * CRYSTALS[i].size)));
    // precipitate forms early and fast: the protein crashes out instead of ordering
    const crash = outcome === "precipitate" ? smooth((k - 0.1) / 0.45) : 0;
    const cm = clumps.current;
    if (cm) {
      specks.forEach((p, i) => {
        const f = smooth((crash - p.delay) / 0.6);
        cm.setMatrixAt(i, tmp.m.compose(tmp.v.copy(p.at).add(DROP), tmp.q.identity(), tmp.w.setScalar(Math.max(0.0001, f * p.size))));
      });
      cm.instanceMatrix.needsUpdate = true;
    }

    const dm = dots.current;
    if (dm) {
      molecules.forEach((m, i) => {
        const free = tmp.v
          .set(m.home.x * lens.x, m.home.y * lens.y, m.home.z * lens.z)
          .add(DROP)
          .add(tmp.w.set(Math.sin(time * 1.3 + m.phase) * 0.04, Math.sin(time * 1.7 + m.phase * 2) * 0.03, Math.cos(time * 1.1 + m.phase) * 0.04));
        // once its crystal (or clump) has grown past this molecule's turn, it travels there and joins it
        const join = outcome === "crystals" ? smooth((growth[m.target] - 0.8 * m.joinAt) * 4) : outcome === "precipitate" ? smooth((crash - m.joinAt) * 4) : 0;
        const target = (outcome === "crystals" ? CRYSTALS[m.target].at : CLUMPS[m.target]).clone().add(DROP);
        dm.setMatrixAt(i, tmp.m.compose(free.lerp(target, join), tmp.q.identity(), tmp.w.setScalar(1 - join)));
      });
      dm.instanceMatrix.needsUpdate = true;
    }

    // water vapour leaves the drop for the reservoir while it equilibrates
    const vm = vapour.current;
    if (vm) {
      const on = k > 0 && k < 1 ? Math.min(1, k * 8, (1 - k) * 8) : 0;
      steamPaths.forEach((p, i) => {
        const f = (time * 0.45 + p.offset) % 1;
        const pos = tmp.v.copy(p.from).lerp(p.to, f).add(DROP);
        vm.setMatrixAt(i, tmp.m.compose(pos, tmp.q.identity(), tmp.w.setScalar(on * Math.sin(f * Math.PI))));
      });
      vm.instanceMatrix.needsUpdate = true;
    }
  });

  const hover = (title: string, subtitle: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `crystal:${title}`, title, subtitle });
  };
  const out = () => useExplorerStore.getState().setHover(null);
  const ingredients = recipe(protein.experiment?.crystal.details ?? null);
  const peg = ingredients.find((s) => /PEG/i.test(s));
  const DROP_TEXT: Record<Outcome, [string, string]> = {
    crystals: ["Hanging drop", "About 2 µL: equal parts KRAS solution and reservoir solution. As water leaves, KRAS gets crowded and, here, orders into crystals."],
    clear: ["Clear drop", "A different condition: not crowded enough, so the protein simply stays dissolved."],
    precipitate: ["Precipitate", "A different condition: crowded too hard and too fast, so the protein crashes out as disordered brown clumps instead of crystals."],
  };
  const OUTCOME_LABEL: Record<Outcome, string> = { clear: "clear · stays dissolved", precipitate: "precipitate · crashed out", crystals: "crystals · the 4OBE condition" };

  return (
    <group position={at}>
      <mesh
        geometry={res.well}
        material={res.wellMat}
        position={[0, -0.7, 0]}
        onPointerMove={hover("Crystallization well", "One of 96 small wells in a clear plastic plate, sealed with film so no water can escape to the room.")}
        onPointerOut={out}
      />
      <mesh
        geometry={res.reservoir}
        material={res.reservoirMat}
        position={[0, -1.6, 0]}
        onPointerMove={hover(
          "Reservoir",
          outcome === "crystals"
            ? `${ingredients.join(" · ") || "Precipitant solution"}. It holds more precipitant than the drop, so it slowly pulls water out of the drop.`
            : "A reservoir with a different precipitant mix: screening plates vary the condition from well to well.",
        )}
        onPointerOut={out}
      />
      <mesh ref={drop} geometry={res.dropGeo} material={res.dropMat} position={DROP} onPointerMove={hover(...DROP_TEXT[outcome])} onPointerOut={out} />
      <instancedMesh ref={dots} frustumCulled={false} args={[res.dot, res.dotMat, N_PROTEIN]} raycast={() => null} />
      <instancedMesh ref={vapour} frustumCulled={false} args={[res.steam, res.steamMat, N_VAPOUR]} raycast={() => null} />
      <instancedMesh ref={clumps} frustumCulled={false} args={[res.speck, res.speckMat, specks.length]} raycast={() => null} />
      <group ref={gems} position={DROP}>
        {CRYSTALS.map((g, i) => (
          <mesh
            key={i}
            geometry={res.gem}
            material={res.gemMat}
            position={g.at}
            rotation={g.turn as [number, number, number]}
            scale={0.0001}
            onPointerMove={hover("KRAS crystal", "Billions of KRAS molecules stacked in a repeating lattice. Its slanted faces follow the real cell angle, β = 105°.")}
            onPointerOut={out}
          />
        ))}
      </group>

      {labels === "well" && (
        <>
          <SceneLabel position={[0, 1.05, 0]} essential>
            sealing film
          </SceneLabel>
          <SceneLabel position={[0, DROP.y - 1.15, 0]} essential>
            {grown ? "drop with crystals" : "hanging drop · KRAS + reservoir"}
          </SceneLabel>
          <SceneLabel position={[0, -1.55, 0.8]} essential>
            {peg ? `reservoir · ${peg}` : "reservoir"}
          </SceneLabel>
          {grown && (
            <SceneLabel position={[1.75, DROP.y - 0.55, 0]} tone="accent" essential>
              crystals
            </SceneLabel>
          )}
        </>
      )}
      {labels === "outcome" && (
        <SceneLabel position={[0, -2.55, 0.8]} tone={outcome === "crystals" ? "accent" : "default"} essential>
          {OUTCOME_LABEL[outcome]}
        </SceneLabel>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ the plate */

function PlateView({ crystal, active }: { crystal: CrystalInfo; active: boolean }) {
  const { role } = useStage();
  const step = usePipelineStore((s) => s.steps.crystal);
  const group = useViewFade(active);
  const clock = useRef({ step, t: step ? ZOOM_DELAY + EQUILIBRATE : 0 });
  const progress = useRef(step ? 1 : 0);
  const wells = useRef<InstancedMesh>(null);
  const reservoirs = useRef<InstancedMesh>(null);
  const drops = useRef<InstancedMesh>(null);

  const others = useMemo(() => {
    const list: Vector3[] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!DETAIL.some((d) => d.row === r && d.col === c)) list.push(wellAt(r, c));
    return list;
  }, []);

  const res = useMemo(() => {
    const width = COLS * PITCH + 1.6;
    const depth = ROWS * PITCH + 1.6;
    // the top deck: a clear plate with 96 round openings
    const outline = new Shape();
    outline.moveTo(-width / 2, -depth / 2);
    outline.lineTo(width / 2, -depth / 2);
    outline.lineTo(width / 2, depth / 2);
    outline.lineTo(-width / 2, depth / 2);
    outline.closePath();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const p = wellAt(r, c);
        const hole = new Path();
        hole.absarc(p.x, -p.z, 2.05, 0, Math.PI * 2, true);
        outline.holes.push(hole);
      }
    const deck = new ExtrudeGeometry(outline, { depth: 0.14, bevelEnabled: false, curveSegments: 20 });
    deck.rotateX(-Math.PI / 2);
    deck.translate(0, 0.42, 0);
    const deckMat = glass("#E6EEF7", 0.4);
    const skirt = new BoxGeometry(width, 2.8, depth);
    const skirtMat = glass("#E3EBF5", 0.12);
    const film = new BoxGeometry(width, 0.03, depth);
    const filmMat = glass("#F3F7FC", 0.16);
    const tube = new CylinderGeometry(2.05, 1.95, 2.6, 28, 1, true);
    const tubeMat = glass("#DCE8F6", 0.26);
    const liquid = new CylinderGeometry(1.93, 1.9, 0.8, 28);
    const liquidMat = glass("#BFD9F5", 0.5);
    const lens = new SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    lens.scale(1.45, 0.85, 1.45);
    const lensMat = glass("#CFE3FA", 0.5);
    return { deck, deckMat, skirt, skirtMat, film, filmMat, tube, tubeMat, liquid, liquidMat, lens, lensMat, width, depth };
  }, []);
  useEffect(
    () => () => {
      const { width, depth, ...rest } = res;
      void width;
      void depth;
      Object.values(rest).forEach((r) => r.dispose());
    },
    [res],
  );

  useEffect(() => {
    const m = new Matrix4();
    others.forEach((p, i) => {
      wells.current?.setMatrixAt(i, m.makeTranslation(p.x, -0.7, p.z));
      reservoirs.current?.setMatrixAt(i, m.makeTranslation(p.x, -1.6, p.z));
      drops.current?.setMatrixAt(i, m.makeTranslation(p.x, DROP.y, p.z));
    });
    for (const mesh of [wells.current, reservoirs.current, drops.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [others]);

  useFrame((_, delta) => {
    const goal = usePipelineStore.getState().steps.crystal;
    const c = clock.current;
    if (goal !== c.step) {
      // a fresh "Let it equilibrate" plays from the start; other changes jump to their end state
      c.t = goal === 1 && c.step === 0 ? 0 : goal === 0 ? 0 : ZOOM_DELAY + EQUILIBRATE;
      c.step = goal;
    }
    if (c.step > 0) c.t = Math.min(ZOOM_DELAY + EQUILIBRATE, c.t + stageDelta(delta));
    progress.current = c.step > 0 ? Math.max(0, (c.t - ZOOM_DELAY) / EQUILIBRATE) : 0;
  });

  const interactive = role === "current" && active;
  const view: "plate" | "well" | "outcomes" = step === 0 ? "plate" : step === 1 ? "well" : "outcomes";
  const plateHover = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || view !== "plate") return;
    e.stopPropagation();
    useExplorerStore
      .getState()
      .setHover({
        key: "crystal:plate",
        title: "96-well crystallization plate",
        subtitle: "Each well holds a different reservoir solution, so one plate tests 96 conditions at once. A drop of KRAS hangs above every reservoir.",
      });
  };

  return (
    <group ref={group}>
      <mesh geometry={res.deck} material={res.deckMat} onPointerMove={plateHover} onPointerOut={() => useExplorerStore.getState().setHover(null)} />
      <mesh geometry={res.skirt} material={res.skirtMat} position={[0, -0.92, 0]} raycast={() => null} />
      <mesh geometry={res.film} material={res.filmMat} position={[0, 0.66, 0]} raycast={() => null} />
      <instancedMesh ref={wells} args={[res.tube, res.tubeMat, others.length]} raycast={() => null} />
      <instancedMesh ref={reservoirs} args={[res.liquid, res.liquidMat, others.length]} raycast={() => null} />
      <instancedMesh ref={drops} args={[res.lens, res.lensMat, others.length]} raycast={() => null} />
      {DETAIL.map((d) => (
        <Well
          key={d.name}
          crystal={crystal}
          at={wellAt(d.row, d.col)}
          outcome={d.outcome}
          progress={progress}
          interactive={interactive && view !== "plate"}
          labels={!active ? "none" : view === "well" && d.outcome === "crystals" ? "well" : view === "outcomes" ? "outcome" : "none"}
        />
      ))}
      {active && view === "plate" && (
        <>
          <SceneLabel position={[0, 1.4, -res.depth / 2 - 1]} essential>
            96-well plate · each well tests a different condition
          </SceneLabel>
          <SceneLabel position={[FOCUS.x, 1.6, FOCUS.z + 2.4]} tone="accent" essential>
            H6 · the 4OBE recipe
          </SceneLabel>
        </>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ inside the crystal */

const COLORS = {
  deposited: ["#2F72E4", "#E8862A"],
  copy: ["#9DB9EE", "#F2C08E"],
};

function LatticeView({ crystal, active }: { crystal: CrystalInfo; active: boolean }) {
  const { role } = useStage();
  const dark = useExplorerStore((s) => s.theme === "dark");
  const group = useViewFade(active);
  const shown = useRef(0);
  const pieces = useRef<(Group | null)[]>([]);
  const edges = useRef<InstancedMesh>(null);

  const scene = useMemo(() => {
    const centre = fracToCart(crystal, [0.5, 0.5, 0.5]);
    const packed = packUnitCell(crystal);
    const molecules = packed.map((m) => {
      const centroid = m.trace.reduce((s, p) => s.add(p), new Vector3()).divideScalar(m.trace.length);
      const curve = new CatmullRomCurve3(m.trace.map((p) => p.clone().sub(centroid)));
      const geometry = new TubeGeometry(curve, m.trace.length * 3, 0.9, 6, false);
      const chainIndex = crystal.asu.chains.indexOf(m.chain);
      const deposited = m.op === 0;
      const material = new MeshPhysicalMaterial({ color: (deposited ? COLORS.deposited : COLORS.copy)[chainIndex % 2], roughness: 0.4, clearcoat: 0.4 });
      return { ...m, centroid, geometry, material, deposited, symop: formatSymop(crystal.symops[m.op], m.shift) };
    });
    // neighbouring cells in the a–c plane (the view looks down b), as faint lines
    const lines: number[] = [];
    for (const i of [-1, 0, 1])
      for (const k of [-1, 0, 1]) {
        if (!i && !k) continue;
        for (const m of packUnitCell(crystal, [i, 0, k])) for (let p = 1; p < m.trace.length; p++) lines.push(...m.trace[p - 1].toArray(), ...m.trace[p].toArray());
        for (const [a, b] of cellEdges(crystal, [i, 0, k])) lines.push(...a.toArray(), ...b.toArray());
      }
    const neighbours = new BufferGeometry();
    neighbours.setAttribute("position", new Float32BufferAttribute(lines, 3));
    const neighbourMat = new LineBasicMaterial({ color: "#7F8EA8", transparent: true, opacity: 0.15, depthWrite: false });
    neighbourMat.userData.viewMax = 0.15;
    neighbourMat.userData.forceTransparent = true;
    const edgeGeo = new CylinderGeometry(1, 1, 1, 6);
    const edgeMat = new MeshStandardMaterial({ color: "#07265A", roughness: 0.6 });
    const asuCentre = molecules
      .filter((m) => m.deposited)
      .reduce((s, m) => s.add(m.centroid), new Vector3())
      .divideScalar(Math.max(1, molecules.filter((m) => m.deposited).length));
    return { centre, molecules, neighbours, neighbourMat, edgeGeo, edgeMat, edges: cellEdges(crystal), asuCentre };
  }, [crystal]);
  useEffect(
    () => () => {
      scene.molecules.forEach((m) => {
        m.geometry.dispose();
        m.material.dispose();
      });
      scene.neighbours.dispose();
      scene.neighbourMat.dispose();
      scene.edgeGeo.dispose();
      scene.edgeMat.dispose();
    },
    [scene],
  );

  useEffect(() => void scene.edgeMat.color.set(dark ? "#9FB6DA" : "#07265A"), [scene, dark]);

  useEffect(() => {
    const em = edges.current;
    if (!em) return;
    const m = new Matrix4();
    scene.edges.forEach(([a, b], i) => em.setMatrixAt(i, cylinderMatrix(a, b, 0.35, m)));
    em.instanceMatrix.needsUpdate = true;
    em.computeBoundingSphere();
  }, [scene]);

  // the copies appear one symmetry operator at a time: deposited pair first, then its symmetry mates
  useFrame((_, delta) => {
    shown.current = active ? shown.current + stageDelta(delta) : 0;
    scene.molecules.forEach((m, i) => {
      const g = pieces.current[i];
      if (!g) return;
      const t = (shown.current - 0.25 - m.op * 0.45) / 0.5;
      const x = Math.min(1, Math.max(0, t));
      const back = 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2; // ease out with a small overshoot
      g.scale.setScalar(Math.max(0.0001, x >= 1 ? 1 : back));
    });
  });

  const interactive = role === "current" && active;
  const cell = crystal.cell;
  const corner = fracToCart(crystal, [0, 0, 0]);
  const top = fracToCart(crystal, [0.5, 0.5, 1.08]);
  const side = fracToCart(crystal, [1.5, 0.5, 0.5]);

  return (
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]} scale={LATTICE_SCALE}>
      <group position={scene.centre.clone().negate()}>
        {scene.molecules.map((m, i) => (
          <group key={`${m.chain}${m.op}`} ref={(g) => void (pieces.current[i] = g)} position={m.centroid}>
            <mesh
              geometry={m.geometry}
              material={m.material}
              onPointerMove={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                useExplorerStore.getState().setHover({
                  key: `cell:${m.chain}${m.op}`,
                  title: m.deposited ? `KRAS, chain ${m.chain} · as deposited` : `KRAS copy of chain ${m.chain} · ${m.symop}`,
                  subtitle: m.deposited
                    ? `One of the two molecules the file stores (the asymmetric unit)${m.shift.some(Boolean) ? ", moved by whole cells to sit in this one" : ""}. Every other copy in the crystal is made from these by symmetry.`
                    : `Made from deposited chain ${m.chain} by the crystal's symmetry: each atom at (x, y, z) moves to (${m.symop}) in cell units.`,
                });
              }}
              onPointerOut={() => useExplorerStore.getState().setHover(null)}
            />
          </group>
        ))}
        <instancedMesh ref={edges} args={[scene.edgeGeo, scene.edgeMat, 12]} raycast={() => null} />
        <lineSegments geometry={scene.neighbours} material={scene.neighbourMat} raycast={() => null} />

        {active && (
          <>
            <SceneLabel position={top.toArray()} essential>
              {`unit cell · ${cell.a.toFixed(1)} × ${cell.b.toFixed(1)} × ${cell.c.toFixed(1)} Å`}
            </SceneLabel>
            <SceneLabel position={corner.toArray()} tone="muted" essential>
              {`β = ${cell.beta.toFixed(1)}°`}
            </SceneLabel>
            <SceneLabel position={scene.asuCentre.toArray()} tone="accent" essential>
              2 molecules as deposited
            </SceneLabel>
            <SceneLabel position={side.toArray()} tone="muted">
              neighbouring cells
            </SceneLabel>
          </>
        )}
      </group>
    </group>
  );
}

export function CrystalStage() {
  const { protein } = useProteinData();
  const view = usePipelineStore((s) => s.crystalView);
  const crystal = protein.crystal;
  if (!crystal) return null;
  return (
    <group>
      <PlateView crystal={crystal} active={view === "drop"} />
      <LatticeView crystal={crystal} active={view === "lattice"} />
    </group>
  );
}

/** Lattice; or, on the plate, the whole plate → one well (equilibrating) → three wells side by side. */
export const crystalFraming = () => {
  const { crystalView, steps } = usePipelineStore.getState();
  if (crystalView === "lattice") return framing([0, 0, 0], 8.6, [0.18, 0.2, 1]);
  if (steps.crystal === 0) return framing([0, -0.6, 1.5], 27, [0, 1.15, 0.85]);
  if (steps.crystal === 1) return framing([FOCUS.x, -0.15, FOCUS.z], 2.45, [0, 0.16, 1]);
  return framing([FOCUS.x, 0.0, FOCUS.z], 6.6, [0, 0.36, 1]);
};
