"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
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
 * Two views. The hanging drop (schematic): a drop of protein and reservoir solution hangs under a
 * sealed cover slip; water moves to the more concentrated reservoir, the drop shrinks and crystals
 * grow. Inside the crystal (real data): the 4OBE unit cell with every symmetry copy of the two
 * deposited molecules, drawn as Cα traces, and the neighbouring cells faintly around it.
 */
const EQUILIBRATE = 7; // seconds standing in for days
const DROP = new Vector3(0, 0.66, 0); // centre of the drop's flat top, under the cover slip
const N_PROTEIN = 110;
const N_VAPOUR = 28;
const RESERVOIR_TOP = -1.2;
const LATTICE_SCALE = 0.1; // Å → scene units
const CRYSTALS = [
  { at: new Vector3(-0.38, -0.46, 0.14), turn: [0.4, 0.8, 0.2], size: 1, delay: 0 },
  { at: new Vector3(0.5, -0.32, -0.26), turn: [1.2, 0.3, 0.9], size: 0.72, delay: 0.12 },
  { at: new Vector3(0.05, -0.52, 0.48), turn: [0.2, 2.1, 1.4], size: 0.58, delay: 0.24 },
];

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/** Deterministic pseudo-random in [0, 1) */
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* ------------------------------------------------------------------ hanging drop */

function DropView({ crystal, active }: { crystal: CrystalInfo; active: boolean }) {
  const { protein } = useProteinData();
  const { role } = useStage();
  const step = usePipelineStore((s) => s.steps.crystal);
  const group = useViewFade(active);
  const clock = useRef({ step, t: step ? EQUILIBRATE : 0 });
  const [grown, setGrown] = useState(step > 0);
  const drop = useRef<Mesh>(null);
  const dots = useRef<InstancedMesh>(null);
  const vapour = useRef<InstancedMesh>(null);
  const gems = useRef<Group>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), v: new Vector3() }), []);

  const res = useMemo(() => {
    const glass = (color: string, opacity: number) => {
      const m = new MeshPhysicalMaterial({ color, roughness: 0.08, transparent: true, opacity, depthWrite: false, side: 2 });
      m.userData.forceTransparent = true;
      m.userData.viewMax = opacity;
      return m;
    };
    const well = new CylinderGeometry(2.1, 2.0, 2.6, 48, 1, true);
    const wellMat = glass("#DCE8F6", 0.3);
    const reservoir = new CylinderGeometry(1.98, 1.95, 0.8, 48);
    const reservoirMat = glass("#BFD9F5", 0.6);
    const grease = new TorusGeometry(2.1, 0.07, 8, 64);
    const greaseMat = new MeshStandardMaterial({ color: "#E7E1CC", roughness: 0.8 });
    const slip = new CylinderGeometry(2.6, 2.6, 0.06, 4, 1);
    const slipMat = glass("#E6F0FA", 0.35);
    // lower half of a sphere, flattened into a lens that hangs from the slip
    const dropGeo = new SphereGeometry(1, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const dropMat = new MeshPhysicalMaterial({ color: "#CFE3FA", roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55, depthWrite: false });
    dropMat.userData.forceTransparent = true;
    dropMat.userData.viewMax = 0.55;
    const dot = new SphereGeometry(0.04, 6, 5);
    const dotMat = new MeshStandardMaterial({ color: "#2F72E4", roughness: 0.5 });
    const steam = new SphereGeometry(0.03, 6, 5);
    const steamMat = new MeshStandardMaterial({ color: "#7FB2EC", roughness: 0.5, transparent: true, opacity: 0.8 });
    steamMat.userData.viewMax = 0.8;
    const gem = crystalGeometry(crystal, [0.5, 0.2, 0.36]);
    const gemMat = new MeshPhysicalMaterial({ color: "#A9CFF5", roughness: 0.04, clearcoat: 1, metalness: 0.05, emissive: "#3F74D3", emissiveIntensity: 0.18, flatShading: true });
    return { well, wellMat, reservoir, reservoirMat, grease, greaseMat, slip, slipMat, dropGeo, dropMat, dot, dotMat, steam, steamMat, gem, gemMat };
  }, [crystal]);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  // protein molecules: a home position inside the unit lens and the crystal each one joins
  const molecules = useMemo(
    () =>
      Array.from({ length: N_PROTEIN }, (_, i) => {
        const r = Math.sqrt(rand(i, 1)) * 0.85;
        const a = rand(i, 2) * Math.PI * 2;
        const depth = Math.sqrt(Math.max(0, 1 - r * r)) * (0.15 + 0.75 * rand(i, 3));
        return { home: new Vector3(r * Math.cos(a), -depth, r * Math.sin(a)), crystal: i % 3, joinAt: 0.1 + 0.85 * rand(i, 4), phase: rand(i, 5) * 10 };
      }),
    [],
  );
  const steamPaths = useMemo(
    () =>
      Array.from({ length: N_VAPOUR }, (_, i) => {
        const a = rand(i, 6) * Math.PI * 2;
        const from = new Vector3(Math.cos(a) * 1.0, -0.3, Math.sin(a) * 1.0);
        const to = new Vector3(Math.cos(a) * (1.2 + 0.6 * rand(i, 7)), RESERVOIR_TOP - DROP.y + 0.05, Math.sin(a) * (1.2 + 0.6 * rand(i, 7)));
        return { from, to, offset: rand(i, 8) };
      }),
    [],
  );

  useFrame((state, delta) => {
    const goal = usePipelineStore.getState().steps.crystal;
    const c = clock.current;
    if (goal !== c.step) {
      c.t = 0;
      c.step = goal;
    }
    if (c.step > 0) c.t = Math.min(EQUILIBRATE, c.t + stageDelta(delta));
    else c.t = 0;
    const k = c.t / EQUILIBRATE;
    if ((k > 0.5) !== grown) setGrown(k > 0.5);
    const time = state.clock.elapsedTime;

    // the drop loses about a quarter of its width as water leaves it
    const shrink = 1 - 0.24 * smooth(k / 0.9);
    const lens = tmp.s.set(1.45 * shrink, 0.85 * shrink, 1.45 * shrink);
    drop.current?.scale.copy(lens);

    const growth = CRYSTALS.map((g) => smooth((k - 0.35 - g.delay) / 0.5));
    gems.current?.children.forEach((child, i) => child.scale.setScalar(Math.max(0.0001, growth[i] * CRYSTALS[i].size)));

    const dm = dots.current;
    if (dm) {
      molecules.forEach((m, i) => {
        const free = tmp.v
          .set(m.home.x * lens.x, m.home.y * lens.y, m.home.z * lens.z)
          .add(DROP)
          .add(new Vector3(Math.sin(time * 1.3 + m.phase) * 0.04, Math.sin(time * 1.7 + m.phase * 2) * 0.03, Math.cos(time * 1.1 + m.phase) * 0.04));
        // once its crystal has grown past this molecule's turn, it travels to the crystal and joins it
        const join = smooth((growth[m.crystal] - m.joinAt) * 5);
        const target = CRYSTALS[m.crystal].at.clone().add(DROP);
        dm.setMatrixAt(i, tmp.m.compose(free.lerp(target, join), tmp.q.identity(), new Vector3().setScalar(1 - join)));
      });
      dm.instanceMatrix.needsUpdate = true;
    }

    // water vapour leaves the drop for the reservoir while it equilibrates
    const vm = vapour.current;
    if (vm) {
      const on = c.step > 0 && k < 1 ? Math.min(1, k * 8, (1 - k) * 8) : 0;
      steamPaths.forEach((p, i) => {
        const f = (time * 0.45 + p.offset) % 1;
        const pos = p.from.clone().lerp(p.to, f).add(DROP);
        vm.setMatrixAt(i, tmp.m.compose(pos, tmp.q.identity(), new Vector3().setScalar(on * Math.sin(f * Math.PI))));
      });
      vm.instanceMatrix.needsUpdate = true;
    }
  });

  const interactive = role === "current" && active;
  const hover = (title: string, subtitle: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `crystal:${title}`, title, subtitle });
  };
  const out = () => useExplorerStore.getState().setHover(null);
  const ingredients = recipe(protein.experiment?.crystal.details ?? null);
  const peg = ingredients.find((s) => /PEG/i.test(s));

  return (
    <group ref={group}>
      <mesh geometry={res.well} material={res.wellMat} position={[0, -0.7, 0]} onPointerMove={hover("Crystallization well", "One of 24 small wells in a plastic tray, sealed so no water can escape to the room.")} onPointerOut={out} />
      <mesh
        geometry={res.reservoir}
        material={res.reservoirMat}
        position={[0, -1.6, 0]}
        onPointerMove={hover("Reservoir", `${ingredients.join(" · ") || "Precipitant solution"}. It holds more precipitant than the drop, so it slowly pulls water out of the drop.`)}
        onPointerOut={out}
      />
      <mesh geometry={res.grease} material={res.greaseMat} position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} />
      <mesh geometry={res.slip} material={res.slipMat} position={[0, 0.69, 0]} rotation={[0, Math.PI / 4, 0]} onPointerMove={hover("Cover slip", "A thin glass square, sealed onto the well with grease. The drop hangs from its underside.")} onPointerOut={out} />
      <mesh ref={drop} geometry={res.dropGeo} material={res.dropMat} position={DROP} onPointerMove={hover("Hanging drop", "About 2 µL: equal parts KRAS solution and reservoir solution. As water leaves, KRAS gets crowded.")} onPointerOut={out} />
      <instancedMesh ref={dots} frustumCulled={false} args={[res.dot, res.dotMat, N_PROTEIN]} raycast={() => null} />
      <instancedMesh ref={vapour} frustumCulled={false} args={[res.steam, res.steamMat, N_VAPOUR]} raycast={() => null} />
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

      {active && (
        <>
          <SceneLabel position={[0, 1.05, 0]} essential>
            cover slip
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
      <DropView crystal={crystal} active={view === "drop"} />
      <LatticeView crystal={crystal} active={view === "lattice"} />
    </group>
  );
}

export const crystalFraming = () => (usePipelineStore.getState().crystalView === "lattice" ? framing([0, 0, 0], 8.6, [0.18, 0.2, 1]) : framing([0, -0.15, 0], 2.45, [0, 0.16, 1]));
