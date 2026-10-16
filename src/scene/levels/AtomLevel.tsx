"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import { ELEMENTS } from "@/lib/chem/elements";
import { NUCLEON_RADIUS, shellRadius } from "@/lib/atom/atomModel";
import { getResidueMolecule, useProteinData } from "@/store/dataStore";
import { useExplorerStore, type ParticleKind } from "@/store/explorerStore";
import { particleHoverText } from "@/content/info";
import { setBaseOpacity, useStage } from "../StageGroup";
import { transitionRuntime } from "../runtime";
import { PARTICLE_COLORS } from "../shared/palette";
import { SceneLabel } from "../shared/SceneLabel";
import { dotTexture, glowTexture, placeBetween } from "../shared/geometry";
import { atomClock, electronPosition, electronSlots, getCloud, getNucleus, NUCLEUS_CLOUD_SCALE, shellQuaternion } from "./atomLayout";

const cloudRaycast = Points.prototype.raycast;
const noRaycast = () => null;

/** Torus geometry lies in the XY plane; electrons orbit in XZ before the shell tilt. */
const ringQuaternion = (i: number) => shellQuaternion(i).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2));

export function AtomLevel() {
  const { protein } = useProteinData();
  const { role } = useStage();
  const symbol = useExplorerStore((s) => s.selection.atomElement);
  const atomId = useExplorerStore((s) => s.selection.atomId);
  const residueIndex = useExplorerStore((s) => s.selection.residueIndex);
  const atomView = useExplorerStore((s) => s.atomView);
  const el = ELEMENTS[symbol];
  const nucleus = getNucleus(symbol);
  const slots = useMemo(() => electronSlots(symbol), [symbol]);
  const cloud = getCloud(symbol);

  const res = useMemo(() => {
    const nucleonGeo = new SphereGeometry(NUCLEON_RADIUS, 28, 18);
    const electronGeo = new SphereGeometry(0.22, 20, 14);
    const stubGeo = new CylinderGeometry(1, 1, 1, 10, 1, true);
    const protonMat = new MeshPhysicalMaterial({ color: PARTICLE_COLORS.proton, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.2 });
    const neutronMat = new MeshPhysicalMaterial({ color: PARTICLE_COLORS.neutron, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25 });
    const electronMat = new MeshPhysicalMaterial({ color: PARTICLE_COLORS.electron, roughness: 0.2, clearcoat: 1, emissive: PARTICLE_COLORS.electron, emissiveIntensity: 0.35 });
    const ringMat = new MeshStandardMaterial({ color: "#8E9BB8", roughness: 0.6, transparent: true, opacity: 0.55 });
    const glowMat = new SpriteMaterial({ map: glowTexture(), color: "#6FA0F5", transparent: true, opacity: 0.55, depthWrite: false, blending: NormalBlending });
    const stubMat = new MeshStandardMaterial({ color: "#B4BDCB", roughness: 0.7, transparent: true, opacity: 0.45, depthWrite: false });
    const cloudMat = new PointsMaterial({ size: 0.15, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true, alphaTest: 0.02 });
    [ringMat, glowMat, stubMat, cloudMat].forEach((m) => (m.userData.forceTransparent = true));
    return { nucleonGeo, electronGeo, stubGeo, protonMat, neutronMat, electronMat, ringMat, glowMat, stubMat, cloudMat };
  }, []);
  const rings = useMemo(() => el.shells.map((_, i) => new TorusGeometry(shellRadius(i + 1), 0.018, 6, 160)), [el]);
  const cloudGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(cloud.positions, 3));
    g.setAttribute("color", new BufferAttribute(cloud.colors, 3));
    g.computeBoundingSphere();
    return g;
  }, [cloud]);
  useEffect(() => () => Object.values(res).forEach((r) => r.dispose()), [res]);
  useEffect(() => () => rings.forEach((r) => r.dispose()), [rings]);
  useEffect(() => () => cloudGeo.dispose(), [cloudGeo]);

  // Directions of this atom's real covalent bonds in the amino acid (keeps the link to Level III)
  const bondStubs = useMemo(() => {
    const mol = getResidueMolecule(protein, residueIndex);
    const center = mol.atomById[atomId];
    if (!center) return [];
    const form = useExplorerStore.getState().aminoAcidForm;
    return mol.bonds
      .filter((b) => b.a === atomId || b.b === atomId)
      .map((b) => mol.atomById[b.a === atomId ? b.b : b.a])
      .filter((n) => (form === "free" ? n.inFree : n.inResidue))
      .map((n) => ({ id: n.id, label: n.context ? `${n.display} of ${n.context.residueLabel}` : n.display, dir: n.position.clone().sub(center.position).normalize() }));
  }, [protein, residueIndex, atomId]);

  const nucleusGroup = useRef<Group>(null);
  const nucleonRefs = useRef<(Mesh | null)[]>([]);
  const electronRefs = useRef<(Group | null)[]>([]);
  const glowRefs = useRef<(Sprite | null)[]>([]);
  const stubRefs = useRef<(Mesh | null)[]>([]);
  const orbits = useRef(atomView === "orbits" ? 1 : 0);
  const hoveredKind = useRef<ParticleKind | null>(null);
  const tmp = useMemo(() => new Vector3(), []);

  useFrame((state, delta) => {
    const st = useExplorerStore.getState();
    const rt = transitionRuntime;
    const approaching = role === "outgoing" && rt.active && rt.direction === 1;
    atomClock.t += delta * (approaching ? 0.15 : 1);

    const goal = st.atomView === "orbits" ? 1 : 0;
    orbits.current += Math.sign(goal - orbits.current) * Math.min(Math.abs(goal - orbits.current), delta * 1.6);
    const o = orbits.current;
    const eo = o * o * (3 - 2 * o);

    const dim = approaching ? rt.approach : 0;
    const selKind = st.selection.particle;
    const hk = role === "current" ? hoveredKind.current : null;

    // Nucleus: gentle jiggle; shrinks to near-point size in the cloud view
    const nScale = NUCLEUS_CLOUD_SCALE + (1 - NUCLEUS_CLOUD_SCALE) * eo;
    if (nucleusGroup.current) nucleusGroup.current.scale.setScalar(nScale);
    const t = state.clock.elapsedTime;
    nucleus.forEach((n, i) => {
      const m = nucleonRefs.current[i];
      if (!m) return;
      m.position.set(
        n.position.x + Math.sin(t * 2.1 + i * 1.7) * 0.025,
        n.position.y + Math.sin(t * 1.7 + i * 2.3) * 0.025,
        n.position.z + Math.sin(t * 2.6 + i * 0.9) * 0.025,
      );
    });
    for (const [kind, mat] of [
      ["proton", res.protonMat],
      ["neutron", res.neutronMat],
    ] as const) {
      const lit = hk === kind || (dim > 0 && selKind === kind);
      mat.emissive.set(lit ? "#ffffff" : "#000000");
      mat.emissiveIntensity = lit ? 0.22 : 0;
      setBaseOpacity(mat, dim > 0 && selKind !== kind ? 1 - 0.8 * dim : 1);
    }

    // Electrons on their (schematic) orbits
    slots.forEach((slot, i) => {
      const g = electronRefs.current[i];
      if (!g) return;
      electronPosition(slot, atomClock.t, g.position);
      g.scale.setScalar(Math.max(1e-4, eo * (hk === "electron" ? 1.25 : 1)));
      g.visible = eo > 0.01;
    });
    const eLit = hk === "electron" || (dim > 0 && selKind === "electron");
    res.electronMat.emissiveIntensity = eLit ? 0.7 : 0.35;
    setBaseOpacity(res.electronMat, dim > 0 && selKind !== "electron" ? 1 - 0.8 * dim : 1);
    setBaseOpacity(res.glowMat, 0.55 * eo);
    setBaseOpacity(res.ringMat, 0.55 * eo * (1 - 0.7 * dim));
    setBaseOpacity(res.cloudMat, 0.7 * (1 - eo) * (1 - 0.7 * dim));

    // Bond stubs sit just outside the outermost shell
    const outer = (st.atomView === "orbits" ? shellRadius(el.shells.length) : cloud.outerRadius) + 0.3;
    bondStubs.forEach((b, i) => {
      const m = stubRefs.current[i];
      if (!m) return;
      placeBetween(m, tmp.copy(b.dir).multiplyScalar(outer), b.dir.clone().multiplyScalar(outer + 1.1), 0.045);
    });
    setBaseOpacity(res.stubMat, 0.45 * (1 - dim));
  });

  const interactive = role === "current";
  const hover = (kind: ParticleKind, index: number, shell?: number) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive || useExplorerStore.getState().transition) return;
    e.stopPropagation();
    hoveredKind.current = kind;
    const st = useExplorerStore.getState();
    const text = particleHoverText(kind, el, st.mode, shell);
    st.setHover({ key: `p:${kind}:${index}`, title: text.title, subtitle: text.subtitle, hint: "Click to zoom into this particle", swatch: PARTICLE_COLORS[kind] });
    document.body.style.cursor = "pointer";
  };
  const out = () => {
    hoveredKind.current = null;
    useExplorerStore.getState().setHover(null);
    document.body.style.cursor = "";
  };
  const click = (kind: ParticleKind, index: number) => (e: ThreeEvent<MouseEvent>) => {
    if (!interactive || e.delta > 5) return;
    e.stopPropagation();
    hoveredKind.current = null;
    document.body.style.cursor = "";
    const p = e.object.getWorldPosition(new Vector3());
    if (kind === "electron" && index < 0) p.copy(e.point);
    useExplorerStore.getState().drillDown({ particle: kind, particleIndex: index }, p.toArray());
  };
  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  const nucleusR = Math.max(...nucleus.map((n) => n.position.length())) + NUCLEON_RADIUS;
  // Place each shell label on the right-hand side of its ring, clear of the nucleus
  const shellLabelPos = (i: number): [number, number, number] => {
    let best = new Vector3();
    let score = -Infinity;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const p = new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(shellRadius(i + 1)).applyQuaternion(shellQuaternion(i));
      const sc = p.x + 0.45 * p.y - 0.2 * p.z + (i === 0 ? 0.9 * p.y : 0);
      if (sc > score) {
        score = sc;
        best = p;
      }
    }
    return [best.x + 0.2, best.y + 0.32, best.z];
  };
  const neutrons = el.massNumber - el.Z;

  return (
    <group>
      <group ref={nucleusGroup}>
        {nucleus.map((n, i) => (
          <mesh
            key={i}
            ref={(m) => {
              nucleonRefs.current[i] = m;
            }}
            position={n.position}
            geometry={res.nucleonGeo}
            material={n.kind === "proton" ? res.protonMat : res.neutronMat}
            onPointerOver={hover(n.kind, i)}
            onPointerOut={out}
            onClick={click(n.kind, i)}
          />
        ))}
      </group>

      {rings.map((g, i) => (
        <mesh key={i} geometry={g} material={res.ringMat} quaternion={ringQuaternion(i)} raycast={() => null} />
      ))}

      {slots.map((slot, i) => (
        <group
          key={i}
          ref={(g) => {
            electronRefs.current[i] = g;
          }}
        >
          <mesh geometry={res.electronGeo} material={res.electronMat} onPointerOver={hover("electron", i, slot.shell + 1)} onPointerOut={out} onClick={click("electron", i)} />
          <sprite
            ref={(s) => {
              glowRefs.current[i] = s;
            }}
            material={res.glowMat}
            scale={1.3}
            raycast={() => null}
          />
        </group>
      ))}

      {/* Hidden objects still receive raycasts in three.js, so the cloud only joins picking in cloud view */}
      <points
        geometry={cloudGeo}
        material={res.cloudMat}
        visible={atomView === "cloud"}
        raycast={atomView === "cloud" ? cloudRaycast : noRaycast}
        onPointerOver={hover("electron", -1)}
        onPointerOut={out}
        onClick={click("electron", -1)}
      />

      {bondStubs.map((b, i) => (
        <mesh
          key={b.id}
          ref={(m) => {
            stubRefs.current[i] = m;
          }}
          geometry={res.stubGeo}
          material={res.stubMat}
          raycast={() => null}
        />
      ))}

      {atomView === "orbits" ? (
        <>
          <SceneLabel position={[0, -nucleusR - 0.55, 0]} tone="strong">
            Nucleus · {el.Z} p⁺ + {neutrons} n⁰
          </SceneLabel>
          {el.shells.map((count, i) => (
            <SceneLabel key={i} position={shellLabelPos(i)} tone="muted">
              Shell {i + 1} · {count} e⁻
            </SceneLabel>
          ))}
        </>
      ) : (
        <>
          <SceneLabel position={[0, -0.55, 0]} tone="strong">
            Nucleus (tiny, centre)
          </SceneLabel>
          <SceneLabel position={[0, cloud.outerRadius * 1.15, 0]} tone="muted">
            Electron cloud · denser = more likely
          </SceneLabel>
        </>
      )}
      {bondStubs.map((b) => {
        const r = (atomView === "orbits" ? shellRadius(el.shells.length) : cloud.outerRadius) + 1.75;
        return (
          <SceneLabel key={b.id} position={b.dir.clone().multiplyScalar(r).toArray() as [number, number, number]} tone="muted">
            bond → {b.label}
          </SceneLabel>
        );
      })}
    </group>
  );
}
