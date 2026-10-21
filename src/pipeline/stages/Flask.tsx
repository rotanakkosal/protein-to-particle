"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { useExplorerStore } from "@/store/explorerStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { useStage } from "@/scene/StageGroup";

/*
 * A 250 mL Erlenmeyer flask of LB broth clamped on an orbital shaker at 37 °C (typical set-up).
 * 1 unit ≈ 2.5 cm. The parent stage drives it through `state`: how cloudy the culture is, and a
 * pipette that adds a few drops (antibiotic, IPTG).
 */
export interface FlaskState {
  /** 0 = clear broth, 1 = dense culture */
  turbidity: number;
  /** 0…1 progress of the pipette: lower, drip, rise (0 or 1 = out of sight) */
  add: number;
  addColor: string;
}

/** Where the broth sits: the point a zoom into the culture dives toward */
export const BROTH_CENTRE = new Vector3(0, 0.7, 0);
const FILL = 1.3; // broth height
const BODY = [
  [0.01, 0],
  [1.85, 0],
  [1.95, 0.1],
  [1.93, 0.4],
  [0.62, 3.0],
  [0.55, 3.25],
  [0.55, 4.0],
  [0.64, 4.08],
  [0.62, 4.16],
];
/** Inner radius of the cone at a height */
const radiusAt = (y: number) => (y < 0.4 ? 1.86 : 1.86 - ((1.86 - 0.58) * (y - 0.4)) / 2.6);
const CLEAR = new Color("#EDCB7B");
const CLOUDY = new Color("#E9DDC2");

export function Flask({ state, label, show }: { state: MutableRefObject<FlaskState>; label: string; show: boolean }) {
  const { role } = useStage();
  const rig = useRef<Group>(null);
  const broth = useRef<Mesh>(null);
  const pipette = useRef<Group>(null);
  const drops = useRef<InstancedMesh>(null);
  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      s: new Vector3(),
      v: new Vector3(),
    }),
    [],
  );

  const res = useMemo(() => {
    const glassGeo = new LatheGeometry(
      BODY.map(([r, y]) => new Vector2(r, y)),
      48,
    );
    const glass = new MeshPhysicalMaterial({
      color: "#E3EEF8",
      roughness: 0.06,
      clearcoat: 1,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: 2,
    });
    glass.userData.forceTransparent = true;
    glass.userData.viewMax = 0.3;
    const liquidGeo = new LatheGeometry(
      [
        [0.01, 0.04],
        [1.8, 0.04],
        [1.86, 0.12],
        [1.84, 0.4],
        [radiusAt(FILL) - 0.04, FILL],
        [0.01, FILL],
      ].map(([r, y]) => new Vector2(r, y)),
      48,
    );
    const liquid = new MeshPhysicalMaterial({
      color: CLEAR.clone(),
      roughness: 0.15,
      clearcoat: 0.6,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    liquid.userData.forceTransparent = true;
    liquid.userData.viewMax = 0.78;
    const plug = new CylinderGeometry(0.6, 0.52, 0.5, 24);
    const plugMat = new MeshStandardMaterial({
      color: "#C9CED6",
      roughness: 0.35,
      metalness: 0.6,
    });
    const platform = new BoxGeometry(5.6, 0.22, 5.6);
    const platformMat = new MeshStandardMaterial({
      color: "#D7DEE8",
      roughness: 0.5,
      metalness: 0.2,
    });
    const base = new BoxGeometry(6.2, 1.3, 6.2);
    const baseMat = new MeshPhysicalMaterial({
      color: "#EEF2F7",
      roughness: 0.45,
      clearcoat: 0.3,
    });
    const panel = new BoxGeometry(2.6, 0.62, 0.06);
    const panelMat = new MeshStandardMaterial({
      color: "#14284A",
      roughness: 0.3,
      emissive: "#14284A",
      emissiveIntensity: 0.4,
    });
    const clamp = new TorusGeometry(1.98, 0.06, 8, 48);
    const clampMat = new MeshStandardMaterial({
      color: "#9AA3B2",
      metalness: 0.7,
      roughness: 0.3,
    });
    const post = new CylinderGeometry(0.07, 0.07, 0.7, 10);
    const barrel = new CylinderGeometry(0.13, 0.13, 1.6, 16);
    const barrelMat = new MeshPhysicalMaterial({
      color: "#F4F6FA",
      roughness: 0.4,
    });
    const tip = new CylinderGeometry(0.05, 0.015, 1.1, 12);
    const tipMat = new MeshPhysicalMaterial({
      color: "#F2E7B5",
      roughness: 0.3,
      transparent: true,
      opacity: 0.8,
    });
    tipMat.userData.viewMax = 0.8;
    const drop = new SphereGeometry(0.07, 10, 8);
    const dropMat = new MeshPhysicalMaterial({
      color: "#2F72E4",
      roughness: 0.1,
      clearcoat: 1,
    });
    return {
      glassGeo,
      glass,
      liquidGeo,
      liquid,
      plug,
      plugMat,
      platform,
      platformMat,
      base,
      baseMat,
      panel,
      panelMat,
      clamp,
      clampMat,
      post,
      barrel,
      barrelMat,
      tip,
      tipMat,
      drop,
      dropMat,
    };
  }, []);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);

  useFrame((frame) => {
    const t = frame.clock.elapsedTime;
    const st = state.current;
    // orbital shaking: the platform and flask circle a few millimetres, the broth sloshes
    const phase = t * 2 * Math.PI * 1.1;
    rig.current?.position.set(Math.cos(phase) * 0.06, 0, Math.sin(phase) * 0.06);
    if (broth.current) {
      broth.current.rotation.set(Math.sin(phase) * 0.06, 0, Math.cos(phase) * 0.06);
      res.liquid.color.copy(CLEAR).lerp(CLOUDY, st.turbidity);
    }
    res.dropMat.color.set(st.addColor);

    // pipette: lowers to the neck, lets three drops fall, rises again
    const a = st.add;
    const p = pipette.current;
    if (p) {
      const lower = a <= 0 || a >= 1 ? 0 : Math.min(1, a / 0.2, (1 - a) / 0.2);
      p.visible = lower > 0.01;
      p.position.set(0.15, 6.4 - 1.7 * lower, 0);
    }
    const dm = drops.current;
    if (dm) {
      for (let i = 0; i < 3; i++) {
        const start = 0.25 + i * 0.16;
        const f = (a - start) / 0.22;
        const on = f > 0 && f < 1;
        const y = 3.9 - f * (3.9 - FILL);
        dm.setMatrixAt(i, tmp.m.compose(tmp.v.set(0.15, y, 0), tmp.q.identity(), tmp.s.setScalar(on ? 1 : 0)));
      }
      dm.instanceMatrix.needsUpdate = true;
    }
  });

  const interactive = role === "current" && show;
  const hover = (title: string, subtitle: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `flask:${title}`, title, subtitle });
  };
  const out = () => useExplorerStore.getState().setHover(null);

  return (
    <group>
      {/* shaker body stays put; the platform and everything on it circles */}
      <mesh
        geometry={res.base}
        material={res.baseMat}
        position={[0, -1.0, 0]}
        onPointerMove={hover("Shaking incubator", "Keeps the culture at 37 °C and swirls it so every cell gets air.")}
        onPointerOut={out}
      />
      <mesh geometry={res.panel} material={res.panelMat} position={[0, -1.0, 3.11]} raycast={() => null} />
      <group ref={rig}>
        <mesh geometry={res.platform} material={res.platformMat} position={[0, -0.24, 0]} raycast={() => null} />
        <mesh geometry={res.clamp} material={res.clampMat} position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} />
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} geometry={res.post} material={res.clampMat} position={[Math.cos((i * Math.PI) / 2) * 1.98, 0.0, Math.sin((i * Math.PI) / 2) * 1.98]} raycast={() => null} />
        ))}
        <mesh
          geometry={res.glassGeo}
          material={res.glass}
          onPointerMove={hover("Erlenmeyer flask", "The wide base and narrow neck let the broth swirl without spilling.")}
          onPointerOut={out}
        />
        <mesh ref={broth} geometry={res.liquidGeo} material={res.liquid} raycast={() => null} />
        <mesh geometry={res.plug} material={res.plugMat} position={[0, 4.1, 0]} onPointerMove={hover("Foil cap", "Lets air in and keeps other microbes out.")} onPointerOut={out} />
      </group>
      <group ref={pipette} visible={false}>
        <mesh geometry={res.barrel} material={res.barrelMat} position={[0, 1.35, 0]} raycast={() => null} />
        <mesh geometry={res.tip} material={res.tipMat} position={[0, 0, 0]} raycast={() => null} />
      </group>
      <instancedMesh ref={drops} frustumCulled={false} args={[res.drop, res.dropMat, 3]} raycast={() => null} />

      {show && (
        <>
          <SceneLabel position={[2.6, FILL * 0.6, 0]} essential>
            {label}
          </SceneLabel>
          <SceneLabel position={[0, -2.15, 3.2]} tone="muted" essential>
            shaking incubator · 37 °C
          </SceneLabel>
        </>
      )}
    </group>
  );
}
