"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector2, Vector3 } from "three";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";

/*
 * Storage, left to right: spin concentrator → eight single-use tubes → liquid-nitrogen dewar
 * → −80 °C freezer. Typical practice; the PDB entry does not record storage.
 */
const CONC = new Vector3(-7.4, 0, 0);
const DEWAR = new Vector3(4.4, -1.8, 0);
const FREEZER = new Vector3(10.4, 0.4, 0);
const N_TUBES = 8;
const STEP_SECONDS = 3;
const PALE = new Color("#B4D0F6");
const DEEP = new Color("#3F74D3");
const FROST = new Color("#E9F2FF");

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const rowPos = (i: number) => new Vector3(-2.8 + i * 0.8, -1.4, 0);
const dewarPos = (i: number) => {
  const a = (i / N_TUBES) * Math.PI * 2;
  return new Vector3(DEWAR.x + Math.cos(a) * 0.9, DEWAR.y + 0.2, Math.sin(a) * 0.6);
};
const freezerPos = (i: number) => new Vector3(FREEZER.x - 1.05 + (i % 4) * 0.7, FREEZER.y - 0.2 + Math.floor(i / 4) * 1.6, 0.3);

/** Point on a two-segment hop from a to b over a raised waypoint. */
function hop(a: Vector3, b: Vector3, f: number, lift: number) {
  const mid = a.clone().lerp(b, 0.5);
  mid.y = Math.max(a.y, b.y) + lift;
  return f < 0.5 ? a.clone().lerp(mid, smooth(f * 2)) : mid.clone().lerp(b, smooth(f * 2 - 1));
}

export function StorageStage() {
  const { role } = useStage();
  const step = usePipelineStore((s) => s.steps.storage);
  const clock = useRef({ step, t: STEP_SECONDS });
  const [shown, setShown] = useState(step);
  const tubes = useRef<InstancedMesh>(null);
  const fills = useRef<InstancedMesh>(null);
  const caps = useRef<InstancedMesh>(null);
  const fog = useRef<InstancedMesh>(null);
  const upper = useRef<Mesh>(null);
  const lower = useRef<Mesh>(null);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), c: new Color() }), []);

  const res = useMemo(() => {
    const glassMat = new MeshPhysicalMaterial({ color: "#DCE8F6", roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false, side: 2 });
    glassMat.userData.forceTransparent = true;
    const conc = new LatheGeometry([new Vector2(0.01, -3.2), new Vector2(0.5, -2.9), new Vector2(1.05, -1.9), new Vector2(1.05, 3.4), new Vector2(1.12, 3.5)], 40);
    const insert = new CylinderGeometry(0.78, 0.78, 3.6, 32, 1, true);
    const membrane = new CylinderGeometry(0.78, 0.78, 0.06, 32);
    const membraneMat = new MeshStandardMaterial({ color: "#F1EEE4", roughness: 0.9 });
    const liquidUpper = new CylinderGeometry(0.72, 0.72, 1, 32);
    liquidUpper.translate(0, 0.5, 0); // grows upward from the membrane
    const liquidLower = new CylinderGeometry(0.98, 0.6, 1, 32);
    liquidLower.translate(0, 0.5, 0);
    const proteinMat = new MeshPhysicalMaterial({ color: PALE, roughness: 0.2, transparent: true, opacity: 0.85, clearcoat: 0.6 });
    proteinMat.userData.forceTransparent = true;
    const waterMat = new MeshPhysicalMaterial({ color: "#EAF4FF", roughness: 0.15, transparent: true, opacity: 0.55 });
    waterMat.userData.forceTransparent = true;
    const tube = new LatheGeometry([new Vector2(0.01, -0.62), new Vector2(0.16, -0.55), new Vector2(0.28, -0.1), new Vector2(0.28, 0.55), new Vector2(0.3, 0.58)], 24);
    const fill = new CylinderGeometry(0.24, 0.14, 1, 20);
    fill.translate(0, 0.5, 0);
    const fillMat = new MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 0.5 });
    const cap = new CylinderGeometry(0.31, 0.31, 0.16, 20);
    const capMat = new MeshStandardMaterial({ color: "#E8862A", roughness: 0.5 });
    const dewar = new CylinderGeometry(1.8, 1.65, 3.6, 40, 1, true);
    const dewarMat = new MeshPhysicalMaterial({ color: "#9AA3B2", metalness: 0.7, roughness: 0.3, side: 2 });
    const ln2 = new CylinderGeometry(1.7, 1.7, 0.08, 40);
    const ln2Mat = new MeshPhysicalMaterial({ color: "#CFE6FF", roughness: 0.05, transparent: true, opacity: 0.75, emissive: "#9CC8FF", emissiveIntensity: 0.25 });
    ln2Mat.userData.forceTransparent = true;
    const puff = new SphereGeometry(0.35, 10, 8);
    const puffMat = new MeshStandardMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.35, depthWrite: false });
    puffMat.userData.forceTransparent = true;
    const cabinet = new BoxGeometry(3.6, 5.4, 2.6);
    const cabinetMat = new MeshPhysicalMaterial({ color: "#E9EEF5", roughness: 0.4, transparent: true, opacity: 0.35, depthWrite: false, side: 2 });
    cabinetMat.userData.forceTransparent = true;
    const door = new BoxGeometry(0.12, 5.4, 2.6);
    const doorMat = new MeshPhysicalMaterial({ color: "#D9E2EE", roughness: 0.35, clearcoat: 0.4 });
    const shelf = new BoxGeometry(3.3, 0.08, 2.3);
    const shelfMat = new MeshStandardMaterial({ color: "#C8D7EC", roughness: 0.6 });
    return { glassMat, conc, insert, membrane, membraneMat, liquidUpper, liquidLower, proteinMat, waterMat, tube, fill, fillMat, cap, capMat, dewar, dewarMat, ln2, ln2Mat, puff, puffMat, cabinet, cabinetMat, door, doorMat, shelf, shelfMat };
  }, []);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  const puffs = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ x: Math.sin(i * 2.1) * 1.2, z: Math.cos(i * 1.3) * 0.7, o: (i * 0.37) % 1 })), []);

  useFrame((state, delta) => {
    const goal = usePipelineStore.getState().steps.storage;
    const c = clock.current;
    if (goal !== c.step) {
      c.t = goal === c.step + 1 ? 0 : STEP_SECONDS;
      c.step = goal;
      setShown(goal);
    }
    c.t = Math.min(STEP_SECONDS, c.t + stageDelta(delta));
    const k = smooth(c.t / STEP_SECONDS);
    const s = c.step;

    // concentrator: the protein solution shrinks and darkens while filtrate collects below
    const conc = s === 0 ? 0 : s === 1 ? k : 1;
    const drawn = s < 2 ? 0 : s === 2 ? k : 1;
    if (upper.current) upper.current.scale.set(1, Math.max(0.02, 3.0 - 2.2 * conc - 0.65 * drawn), 1);
    if (lower.current) lower.current.scale.set(1, Math.max(0.02, 1.3 * conc), 1);
    res.proteinMat.color.copy(PALE).lerp(DEEP, conc);

    const tm = tubes.current;
    const fm = fills.current;
    const cm = caps.current;
    if (!tm || !fm || !cm) return;
    for (let i = 0; i < N_TUBES; i++) {
      let pos: Vector3;
      const show = 1;
      let level = 1;
      if (s < 2) {
        // empty tubes, ready for the protein
        pos = rowPos(i);
        level = 0;
      } else if (s === 2) {
        pos = rowPos(i);
        level = smooth(k * 1.4 - i * 0.05);
      } else if (s === 3) {
        pos = hop(rowPos(i), dewarPos(i), Math.min(1, Math.max(0, k * 1.25 - i * 0.03)), 3.2);
      } else {
        pos = hop(dewarPos(i), freezerPos(i), Math.min(1, Math.max(0, k * 1.25 - i * 0.03)), 3.6);
      }
      tmp.q.identity();
      tm.setMatrixAt(i, tmp.m.compose(pos, tmp.q, tmp.s.setScalar(show)));
      fm.setMatrixAt(i, tmp.m.compose(pos.clone().setY(pos.y - 0.5), tmp.q, tmp.s.set(show, Math.max(0.001, 0.75 * level), show)));
      cm.setMatrixAt(i, tmp.m.compose(pos.clone().setY(pos.y + 0.66), tmp.q, tmp.s.setScalar(show)));
      // frozen samples turn frosty
      const frozen = s >= 4 ? 1 : s === 3 ? smooth(k * 1.6 - 0.6) : 0;
      fm.setColorAt(i, tmp.c.copy(DEEP).lerp(FROST, frozen * 0.8));
    }
    tm.instanceMatrix.needsUpdate = true;
    tm.computeBoundingSphere();
    fm.instanceMatrix.needsUpdate = true;
    cm.instanceMatrix.needsUpdate = true;
    if (fm.instanceColor) fm.instanceColor.needsUpdate = true;

    // nitrogen vapour drifting up from the dewar, strongest while the tubes go in
    const pm = fog.current;
    if (pm) {
      const boost = s === 3 ? 1.6 : 1;
      puffs.forEach((p, i) => {
        const f = (state.clock.elapsedTime * 0.25 * boost + p.o) % 1;
        pm.setMatrixAt(i, tmp.m.compose(new Vector3(DEWAR.x + p.x * (1 + f * 0.5), DEWAR.y + 1.6 + f * 3, p.z), tmp.q.identity(), tmp.s.setScalar((0.5 + f) * (1 - f) * 1.6)));
      });
      pm.instanceMatrix.needsUpdate = true;
    }
  });

  const interactive = role === "current";
  const hover = (title: string, subtitle: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `store:${title}`, title, subtitle });
  };
  const out = () => useExplorerStore.getState().setHover(null);

  return (
    <group>
      {/* spin concentrator */}
      <group position={CONC}>
        <mesh geometry={res.conc} material={res.glassMat} onPointerMove={hover("Spin concentrator", "A membrane with tiny pores lets water and salt through but keeps KRAS above it.")} onPointerOut={out} />
        <mesh geometry={res.insert} material={res.glassMat} position={[0, 1.6, 0]} raycast={() => null} />
        <mesh geometry={res.membrane} material={res.membraneMat} position={[0, -0.2, 0]} raycast={() => null} />
        <mesh ref={upper} geometry={res.liquidUpper} material={res.proteinMat} position={[0, -0.17, 0]} raycast={() => null} />
        <mesh ref={lower} geometry={res.liquidLower} material={res.waterMat} position={[0, -2.6, 0]} raycast={() => null} />
      </group>
      {/* aliquots */}
      <instancedMesh ref={tubes} args={[res.tube, res.glassMat, N_TUBES]} onPointerMove={hover("Single-use tube", "One portion of KRAS: thawed once, used once, so the rest stays untouched.")} onPointerOut={out} />
      <instancedMesh ref={fills} frustumCulled={false} args={[res.fill, res.fillMat, N_TUBES]} raycast={() => null} />
      <instancedMesh ref={caps} frustumCulled={false} args={[res.cap, res.capMat, N_TUBES]} raycast={() => null} />
      {/* liquid nitrogen */}
      <group position={DEWAR}>
        <mesh geometry={res.dewar} material={res.dewarMat} onPointerMove={hover("Liquid nitrogen", "At −196 °C it freezes small tubes within seconds, before damaging ice crystals can grow.")} onPointerOut={out} />
        <mesh geometry={res.ln2} material={res.ln2Mat} position={[0, 1.1, 0]} raycast={() => null} />
      </group>
      <instancedMesh ref={fog} frustumCulled={false} args={[res.puff, res.puffMat, puffs.length]} raycast={() => null} />
      {/* −80 °C freezer, door open */}
      <group position={FREEZER}>
        <mesh geometry={res.cabinet} material={res.cabinetMat} onPointerMove={hover("−80 °C freezer", "Frozen KRAS keeps for months here, ready to be thawed for crystallization.")} onPointerOut={out} />
        <mesh geometry={res.door} material={res.doorMat} position={[-1.9, 0, 1.9]} rotation={[0, -1.1, 0]} raycast={() => null} />
        {[-1.0, 0.6, 2.2].map((y) => (
          <mesh key={y} geometry={res.shelf} material={res.shelfMat} position={[0, y - 0.95, 0]} raycast={() => null} />
        ))}
      </group>

      <SceneLabel position={[CONC.x, 4.6, 0]} essential>
        spin concentrator
      </SceneLabel>
      <SceneLabel position={[0, -3.4, 0]} essential tone={shown >= 2 ? "default" : "muted"}>
        {shown >= 2 ? "8 single-use tubes" : "8 empty tubes"}
      </SceneLabel>
      <SceneLabel position={[DEWAR.x, DEWAR.y - 2.8, 0]} essential>
        liquid nitrogen · −196 °C
      </SceneLabel>
      <SceneLabel position={[FREEZER.x, FREEZER.y + 3.6, 0]} essential>
        freezer · −80 °C
      </SceneLabel>
      {shown === 0 && (
        <SceneLabel position={[CONC.x + 3.4, -0.6, 0]} tone="accent" essential>
          pure KRAS · still dilute
        </SceneLabel>
      )}
      {shown === 1 && (
        <SceneLabel position={[CONC.x + 3.2, -1.6, 0]} tone="muted" essential>
          water passes, KRAS stays
        </SceneLabel>
      )}
    </group>
  );
}

export const storageFraming = () => framing([1.5, 0.6, 0], 12.5, [0.08, 0.18, 1]);
