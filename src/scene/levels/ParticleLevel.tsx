"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  CatmullRomCurve3,
} from "three";
import { useExplorerStore, type ParticleKind } from "@/store/explorerStore";
import { particleHoverText } from "@/content/info";
import { ELEMENTS } from "@/lib/chem/elements";
import { setBaseOpacity, useStage } from "../StageGroup";
import { PARTICLE_COLORS, SCENE_THEME } from "../shared/palette";
import { SceneLabel } from "../shared/SceneLabel";
import { glowTexture, placeBetween } from "../shared/geometry";
import { PARTICLE_LAYOUT } from "./atomLayout";

const KINDS: ParticleKind[] = ["proton", "neutron", "electron"];
const QUARKS: Record<"proton" | "neutron", ("up" | "down")[]> = { proton: ["up", "up", "down"], neutron: ["up", "down", "down"] };
const CHARGE_LABEL: Record<ParticleKind, string> = { proton: "+1", neutron: "0", electron: "−1" };
const ARROWS = 14;

function fibonacciDirs(n: number): Vector3[] {
  const out: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    out.push(new Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r));
  }
  return out;
}

/** Unit-length helical tube along +Y (centred), stretched between two quarks as a "gluon spring". */
function springGeometry() {
  const pts: Vector3[] = [];
  const turns = 6;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = t * turns * Math.PI * 2;
    pts.push(new Vector3(Math.cos(a) * 0.07, t - 0.5, Math.sin(a) * 0.07));
  }
  return new TubeGeometry(new CatmullRomCurve3(pts), 160, 0.018, 6, false);
}

/** Thin "⊔"-shaped bracket grouping particles by where they live. */
function Bracket({ from, to, y, geometry, material }: { from: number; to: number; y: number; geometry: CylinderGeometry; material: MeshStandardMaterial }) {
  return (
    <group>
      <mesh geometry={geometry} material={material} position={[(from + to) / 2, y, 0]} rotation-z={Math.PI / 2} scale={[0.022, to - from, 0.022]} raycast={() => null} />
      <mesh geometry={geometry} material={material} position={[from, y + 0.18, 0]} scale={[0.022, 0.36, 0.022]} raycast={() => null} />
      <mesh geometry={geometry} material={material} position={[to, y + 0.18, 0]} scale={[0.022, 0.36, 0.022]} raycast={() => null} />
    </group>
  );
}

export function ParticleLevel() {
  const { role } = useStage();
  const showQuarks = useExplorerStore((s) => s.showQuarks);
  const element = useExplorerStore((s) => s.selection.atomElement);

  const res = useMemo(() => {
    const shellGeo = new SphereGeometry(1, 48, 32);
    const quarkGeo = new SphereGeometry(0.3, 24, 16);
    const electronGeo = new SphereGeometry(1, 32, 20);
    const ringGeo = new TorusGeometry(1, 0.035, 8, 96);
    const coneGeo = new ConeGeometry(0.1, 0.28, 12);
    const shaftGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
    const lineGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
    const spring = springGeometry();
    const shellMats = {
      proton: new MeshPhysicalMaterial({ color: PARTICLE_COLORS.proton, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false }),
      neutron: new MeshPhysicalMaterial({ color: PARTICLE_COLORS.neutron, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, depthWrite: false }),
    };
    const electronMat = new MeshPhysicalMaterial({ color: PARTICLE_COLORS.electron, roughness: 0.15, clearcoat: 1, emissive: PARTICLE_COLORS.electron, emissiveIntensity: 0.45 });
    const quarkMats = {
      up: new MeshPhysicalMaterial({ color: PARTICLE_COLORS.up, roughness: 0.25, clearcoat: 0.8, emissive: PARTICLE_COLORS.up, emissiveIntensity: 0.15 }),
      down: new MeshPhysicalMaterial({ color: PARTICLE_COLORS.down, roughness: 0.25, clearcoat: 0.8, emissive: PARTICLE_COLORS.down, emissiveIntensity: 0.15 }),
    };
    const gluonMat = new MeshStandardMaterial({ roughness: 0.5 });
    const ringMat = new MeshStandardMaterial({ emissiveIntensity: 0.4 });
    const glowMat = new SpriteMaterial({ map: glowTexture(), color: "#6FA0F5", transparent: true, opacity: 0.6, depthWrite: false });
    const fieldMats = {
      proton: new MeshStandardMaterial({ color: "#E36A62", roughness: 0.5, transparent: true, opacity: 0.75 }),
      electron: new MeshStandardMaterial({ color: "#4D86EA", roughness: 0.5, transparent: true, opacity: 0.75 }),
    };
    const bracketMat = new MeshStandardMaterial({ color: "#98A3B5", roughness: 0.8 });
    glowMat.userData.forceTransparent = true;
    shellMats.proton.userData.forceTransparent = true;
    shellMats.neutron.userData.forceTransparent = true;
    return { shellGeo, quarkGeo, electronGeo, ringGeo, coneGeo, shaftGeo, lineGeo, spring, shellMats, electronMat, quarkMats, gluonMat, ringMat, glowMat, fieldMats, bracketMat };
  }, []);
  useEffect(
    () => () => {
      const { shellMats, quarkMats, fieldMats, ...rest } = res;
      [...Object.values(shellMats), ...Object.values(quarkMats), ...Object.values(fieldMats), ...Object.values(rest)].forEach((r) => r.dispose());
    },
    [res],
  );
  const theme = useExplorerStore((s) => s.theme);
  useEffect(() => {
    const t = SCENE_THEME[theme];
    res.ringMat.color.set(t.accent);
    res.ringMat.emissive.set(t.accent);
    res.gluonMat.color.set(t.gluon);
  }, [res, theme]);

  const groups = useRef<Record<string, Group | null>>({});
  const quarkRefs = useRef<Record<string, (Group | null)[]>>({ proton: [], neutron: [] });
  const springRefs = useRef<Record<string, (Mesh | null)[]>>({ proton: [], neutron: [] });
  const ring = useRef<Group>(null);
  const fieldRefs = useRef<Record<string, InstancedMesh | null>>({});
  const shaftRefs = useRef<Record<string, InstancedMesh | null>>({});
  const hovered = useRef<ParticleKind | null>(null);
  const dirs = useMemo(() => fibonacciDirs(ARROWS), []);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), s: new Vector3(), p: new Vector3(), a: new Vector3(), b: new Vector3(), up: new Vector3(0, 1, 0) }), []);
  const scales = useRef<Record<ParticleKind, number>>({ proton: 1, neutron: 1, electron: 1 });

  useFrame((state, delta) => {
    const st = useExplorerStore.getState();
    const t = state.clock.elapsedTime;
    const sel = st.selection.particle;
    const quarks = st.showQuarks;

    for (const kind of KINDS) {
      const g = groups.current[kind];
      if (!g) continue;
      const goal = kind === sel ? 1.08 : hovered.current === kind ? 1.04 : 0.92;
      scales.current[kind] += (goal - scales.current[kind]) * Math.min(1, delta * 6);
      g.scale.setScalar(scales.current[kind]);
      g.position.y = PARTICLE_LAYOUT[kind].position.y + Math.sin(t * 0.9 + kind.length) * 0.06;
    }
    // Shell transparency reveals the quarks; non-selected particles are softened
    for (const kind of ["proton", "neutron"] as const) {
      const base = quarks ? 0.34 : 0.96;
      setBaseOpacity(res.shellMats[kind], base * (kind === sel ? 1 : 0.7));
      quarkRefs.current[kind].forEach((q, i) => {
        if (!q) return;
        const ph = (i * Math.PI * 2) / 3 + (kind === "neutron" ? 0.7 : 0);
        q.position.set(
          Math.cos(ph + t * 0.8) * 0.62 + Math.sin(t * 2.3 + i) * 0.06,
          Math.sin(t * 1.1 + i * 2.1) * 0.32,
          Math.sin(ph + t * 0.8) * 0.62 + Math.cos(t * 1.9 + i) * 0.06,
        );
        q.visible = quarks;
      });
      const qs = quarkRefs.current[kind];
      springRefs.current[kind].forEach((sp, k) => {
        const a = qs[k];
        const b = qs[(k + 1) % 3];
        if (!sp || !a || !b) return;
        placeBetween(sp, a.position, b.position, 1);
        sp.visible = quarks;
      });
    }
    setBaseOpacity(res.electronMat, sel === "electron" ? 1 : 0.8);

    // Electric field arrows: outward from + charge, inward toward − charge
    for (const kind of ["proton", "electron"] as const) {
      const cones = fieldRefs.current[kind];
      const shafts = shaftRefs.current[kind];
      if (!cones || !shafts) continue;
      const show = st.showField ? 1 : 0;
      const outward = kind === "proton";
      dirs.forEach((d, i) => {
        const f = (t * 0.35 + i * 0.137) % 1;
        const r = outward ? 1.85 + f * 1.15 : 2.35 - f * 1.05;
        const fade = Math.sin(Math.PI * f) * show;
        tmp.p.copy(d).multiplyScalar(r);
        tmp.q.setFromUnitVectors(tmp.up, outward ? d : tmp.a.copy(d).negate());
        tmp.m.compose(tmp.p, tmp.q, tmp.s.setScalar(Math.max(1e-4, fade)));
        cones.setMatrixAt(i, tmp.m);
        tmp.a.copy(d).multiplyScalar(outward ? r - 0.45 * fade : r + 0.45 * fade);
        tmp.b.copy(d).multiplyScalar(r);
        tmp.m.compose(tmp.p.addVectors(tmp.a, tmp.b).multiplyScalar(0.5), tmp.q.setFromUnitVectors(tmp.up, d), tmp.s.set(0.025 * fade + 1e-4, 0.45 * fade + 1e-4, 0.025 * fade + 1e-4));
        shafts.setMatrixAt(i, tmp.m);
      });
      cones.instanceMatrix.needsUpdate = true;
      shafts.instanceMatrix.needsUpdate = true;
    }

    if (ring.current) {
      const L = PARTICLE_LAYOUT[sel];
      ring.current.position.set(L.position.x, groups.current[sel]?.position.y ?? 0, L.position.z);
      const r = (L.radius + 0.32) * scales.current[sel] * (1 + Math.sin(t * 3) * 0.02);
      ring.current.scale.setScalar(role === "current" ? r : 1e-4);
    }
  });

  const interactive = role === "current";
  const over = (kind: ParticleKind) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || useExplorerStore.getState().transition) return;
    e.stopPropagation();
    hovered.current = kind;
    const st = useExplorerStore.getState();
    const text = particleHoverText(kind, ELEMENTS[st.selection.atomElement], st.mode);
    st.setHover({ key: `l5:${kind}`, title: text.title, subtitle: text.subtitle, hint: kind === st.selection.particle ? "Selected: details on the left" : "Click to select", swatch: PARTICLE_COLORS[kind] });
    document.body.style.cursor = "pointer";
  };
  const out = () => {
    hovered.current = null;
    useExplorerStore.getState().setHover(null);
    document.body.style.cursor = "";
  };
  const click = (kind: ParticleKind) => (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > 5) return;
    e.stopPropagation();
    useExplorerStore.getState().select({ particle: kind });
  };
  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  const nucleonBracket = { from: PARTICLE_LAYOUT.proton.position.x - 1.6, to: PARTICLE_LAYOUT.neutron.position.x + 1.6, y: -2.45 };
  const electronBracket = { from: PARTICLE_LAYOUT.electron.position.x - 1.2, to: PARTICLE_LAYOUT.electron.position.x + 1.2, y: -2.45 };

  return (
    <group>
      {(["proton", "neutron"] as const).map((kind) => (
        <group
          key={kind}
          ref={(g) => {
            groups.current[kind] = g;
          }}
          position={PARTICLE_LAYOUT[kind].position}
        >
          <mesh geometry={res.shellGeo} material={res.shellMats[kind]} scale={PARTICLE_LAYOUT[kind].radius} renderOrder={2} onPointerOver={over(kind)} onPointerOut={out} onClick={click(kind)} />
          {QUARKS[kind].map((flavor, i) => (
            <group
              key={i}
              ref={(q) => {
                quarkRefs.current[kind][i] = q;
              }}
            >
              <mesh geometry={res.quarkGeo} material={res.quarkMats[flavor]} raycast={() => null} />
              {showQuarks && (
                <SceneLabel position={[0, 0.5, 0]} tone="muted" className="!px-1.5 !text-[10px]">
                  {flavor === "up" ? "u" : "d"}
                </SceneLabel>
              )}
            </group>
          ))}
          {[0, 1, 2].map((k) => (
            <mesh
              key={k}
              ref={(m) => {
                springRefs.current[kind][k] = m;
              }}
              geometry={res.spring}
              material={res.gluonMat}
              raycast={() => null}
            />
          ))}
          {kind === "proton" && (
            <>
              <instancedMesh ref={(m) => void (fieldRefs.current.proton = m)} args={[res.coneGeo, res.fieldMats.proton, ARROWS]} raycast={() => null} />
              <instancedMesh ref={(m) => void (shaftRefs.current.proton = m)} args={[res.shaftGeo, res.fieldMats.proton, ARROWS]} raycast={() => null} />
            </>
          )}
          <SceneLabel position={[0, PARTICLE_LAYOUT[kind].radius + 0.55, 0]} tone={kind === "proton" ? "default" : "muted"} essential className={kind === "proton" ? "!text-[#B23A33] !font-semibold dark:!text-[#FF8A80]" : "!font-semibold"}>
            charge {CHARGE_LABEL[kind]}
          </SceneLabel>
        </group>
      ))}

      <group
        ref={(g) => {
          groups.current.electron = g;
        }}
        position={PARTICLE_LAYOUT.electron.position}
      >
        <mesh geometry={res.electronGeo} material={res.electronMat} scale={PARTICLE_LAYOUT.electron.radius} onPointerOver={over("electron")} onPointerOut={out} onClick={click("electron")} />
        <sprite material={res.glowMat} scale={2.1} raycast={() => null} />
        {/* generous invisible hit target, because the electron is drawn small */}
        <mesh scale={1.1} onPointerOver={over("electron")} onPointerOut={out} onClick={click("electron")} visible={false}>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
        <instancedMesh ref={(m) => void (fieldRefs.current.electron = m)} args={[res.coneGeo, res.fieldMats.electron, ARROWS]} raycast={() => null} />
        <instancedMesh ref={(m) => void (shaftRefs.current.electron = m)} args={[res.shaftGeo, res.fieldMats.electron, ARROWS]} raycast={() => null} />
        <SceneLabel position={[0, 1.15, 0]} essential className="!text-[#1F59C4] !font-semibold dark:!text-[#8DB6FF]">
          charge {CHARGE_LABEL.electron}
        </SceneLabel>
      </group>

      <Billboard ref={ring}>
        <mesh geometry={res.ringGeo} material={res.ringMat} raycast={() => null} />
      </Billboard>

      <Bracket {...nucleonBracket} geometry={res.lineGeo} material={res.bracketMat} />
      <Bracket {...electronBracket} geometry={res.lineGeo} material={res.bracketMat} />
      <SceneLabel position={[PARTICLE_LAYOUT.proton.position.x, -1.85, 0]} tone="strong" essential>
        Proton
      </SceneLabel>
      <SceneLabel position={[PARTICLE_LAYOUT.neutron.position.x, -1.85, 0]} tone="strong" essential>
        Neutron
      </SceneLabel>
      <SceneLabel position={[PARTICLE_LAYOUT.electron.position.x, -1.85, 0]} tone="strong" essential>
        Electron
      </SceneLabel>
      <SceneLabel position={[(nucleonBracket.from + nucleonBracket.to) / 2, nucleonBracket.y - 0.45, 0]} tone="muted" essential>
        found inside the nucleus
      </SceneLabel>
      <SceneLabel position={[(electronBracket.from + electronBracket.to) / 2, electronBracket.y - 0.45, 0]} tone="muted" essential>
        found around the nucleus
      </SceneLabel>
      <SceneLabel position={[0, 3.1, 0]} tone="muted">
        from the {ELEMENTS[element].name.toLowerCase()} atom · not to scale
      </SceneLabel>
    </group>
  );
}
