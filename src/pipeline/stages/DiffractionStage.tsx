"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type { CrystalInfo } from "@/lib/pdb/experiment";
import { useProteinData } from "@/store/dataStore";
import { useExplorerStore } from "@/store/explorerStore";
import { usePipelineStore } from "@/store/pipelineStore";
import { SceneLabel } from "@/scene/shared/SceneLabel";
import { cylinderMatrix, placeBetween } from "@/scene/shared/geometry";
import { useStage } from "@/scene/StageGroup";
import { framing, stageDelta } from "../runtime";
import { crystalGeometry } from "../lib/crystalPacking";
import { BIN_COUNT, Diffraction } from "../lib/diffraction";

/*
 * The beamline, to scale where it matters: the detector (an ADSC Quantum 315, 315 mm square) sits
 * at the distance that puts the 1.24 Å data limit at its edge, and every spot is calculated from
 * the 4OBE atoms, cell and symmetry at the recorded wavelength. The crystal, loop and pin are
 * enlarged. Lab frame = scene frame: beam along +x, spindle along +z.
 */
const MM = 1 / 20; // scene units per millimetre
const HALF = 157.5; // mm, half the detector's side
const SPEED = (2 * Math.PI) / 180; // 2° of rotation per second
export const IMAGE_BINS = 20; // one image = 1° of rotation (bins of 0.05°)
const TAIL_BINS = 40; // older spots fade out over the next 2°
const CAPACITY = 9000;
const RAYS = 14;
const BEAMSTOP_X = 1.6;
const NOZZLE = new Vector3(-1.2, 3.6, 1.1);

/** Crystal orientation on the loop (crystal frame → lab at φ = 0): an arbitrary but fixed mounting */
const ORIENTATION = (() => {
  const m = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0.45, 0.8, 0.3).normalize(), 0.9));
  const e = m.elements; // column-major
  return [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]];
})();

/** Shared with the detector-image widget in the stage panel */
export const diffractionView = { model: null as Diffraction | null, phi: 0, showRings: true };

const models = new WeakMap<CrystalInfo, Diffraction>();
/** One calculated experiment per structure, kept while the page lives (the intensities are the slow part). */
function experimentFor(crystal: CrystalInfo, wavelength: number, dMin: number) {
  let m = models.get(crystal);
  if (!m) {
    const distance = HALF / Math.tan(2 * Math.asin(wavelength / (2 * dMin)));
    m = new Diffraction(crystal, { dMin, wavelength, distance, halfSize: HALF, orientation: ORIENTATION });
    models.set(crystal, m);
  }
  return m;
}

const FACE = new Color("#0D1A31");
const SPOT = new Color("#FFF2CF");

export function DiffractionStage() {
  const { protein } = useProteinData();
  const crystal = protein.crystal;
  const exp = protein.experiment;
  if (!crystal || !exp) return null;
  return <Beamline crystal={crystal} wavelength={exp.diffraction.wavelength ?? 1} dMin={exp.reflections.resolutionHigh ?? 2} />;
}

function Beamline({ crystal, wavelength, dMin }: { crystal: CrystalInfo; wavelength: number; dMin: number }) {
  const { role } = useStage();
  const showRings = usePipelineStore((s) => s.showRings);
  const model = useMemo(() => experimentFor(crystal, wavelength, dMin), [crystal, wavelength, dMin]);
  const [progress, setProgress] = useState(model.ready ? 1 : 0);
  const D = model.options.distance * MM;
  const spinner = useRef<Group>(null);
  const gem = useRef<Mesh>(null);
  const spots = useRef<InstancedMesh>(null);
  const rays = useRef<InstancedMesh>(null);
  const gas = useRef<InstancedMesh>(null);
  const last = useRef({ bin: -1 });
  const tmp = useMemo(() => ({ m: new Matrix4(), c: new Color(), a: new Vector3(), b: new Vector3() }), []);

  const res = useMemo(() => {
    const metal = new MeshPhysicalMaterial({ color: "#A7B0BE", metalness: 0.75, roughness: 0.32 });
    const dark = new MeshPhysicalMaterial({ color: "#5D6676", metalness: 0.6, roughness: 0.4 });
    const brass = new MeshPhysicalMaterial({ color: "#C9A25B", metalness: 0.8, roughness: 0.3 });
    const rod = new CylinderGeometry(1, 1, 1, 24);
    const beam = new MeshBasicMaterial({ color: "#B48CFF", toneMapped: false });
    const halo = new MeshBasicMaterial({ color: "#B48CFF", transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false });
    halo.userData.forceTransparent = true;
    const tip = new ConeGeometry(1, 1, 24);
    const loop = new TorusGeometry(0.28, 0.016, 8, 40);
    loop.rotateY(Math.PI / 2); // ring in the plane of the pin, so the beam passes through it
    const loopMat = new MeshStandardMaterial({ color: "#8E5BD8", roughness: 0.5 });
    const gemGeo = crystalGeometry(crystal, [0.3, 0.12, 0.22]);
    const gemMat = new MeshPhysicalMaterial({ color: "#A9CFF5", roughness: 0.04, clearcoat: 1, emissive: "#3F74D3", emissiveIntensity: 0.25, flatShading: true });
    const coneGas = new CylinderGeometry(0.2, 0.55, 1, 24, 1, true);
    const gasMat = new MeshStandardMaterial({ color: "#DDEBFF", transparent: true, opacity: 0.16, depthWrite: false, side: 2 });
    gasMat.userData.forceTransparent = true;
    const puff = new SphereGeometry(0.05, 6, 5);
    const puffMat = new MeshStandardMaterial({ color: "#EAF3FF", transparent: true, opacity: 0.7, depthWrite: false });
    puffMat.userData.forceTransparent = true;
    const box = new BoxGeometry(1, 1, 1);
    const face = new PlaneGeometry(2 * HALF * MM, 2 * HALF * MM);
    face.rotateY(-Math.PI / 2); // faces the crystal (−x)
    const faceMat = new MeshStandardMaterial({ color: FACE, roughness: 0.6, metalness: 0.1 });
    const housing = new MeshPhysicalMaterial({ color: "#DCE2EA", roughness: 0.45, metalness: 0.2 });
    // the Quantum 315 tiles its face with 3 × 3 CCD modules
    const grid: number[] = [];
    for (const t of [-HALF / 3, HALF / 3]) {
      grid.push(0, t * MM, -HALF * MM, 0, t * MM, HALF * MM);
      grid.push(0, -HALF * MM, t * MM, 0, HALF * MM, t * MM);
    }
    const gridGeo = new BufferGeometry();
    gridGeo.setAttribute("position", new Float32BufferAttribute(grid, 3));
    const gridMat = new LineBasicMaterial({ color: "#2C4064" });
    const spot = new CircleGeometry(1, 10);
    spot.rotateY(-Math.PI / 2);
    const spotMat = new MeshBasicMaterial({ color: "#FFFFFF", toneMapped: false, depthWrite: false });
    const ring = (d: number) => {
      const r = model.radiusOf(d) * MM;
      const g = new RingGeometry(r - 0.014, r + 0.014, 160);
      g.rotateY(-Math.PI / 2);
      return { d, r, g };
    };
    const rings = [4, 2, dMin].map(ring);
    const ringMat = new MeshBasicMaterial({ color: "#7C9BE0", transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
    ringMat.userData.forceTransparent = true;
    const rayMat = new MeshBasicMaterial({ color: "#FFE7A3", transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
    rayMat.userData.forceTransparent = true;
    return { metal, dark, brass, rod, beam, halo, tip, loop, loopMat, gemGeo, gemMat, coneGas, gasMat, puff, puffMat, box, face, faceMat, housing, gridGeo, gridMat, spot, spotMat, rings, ringMat, rayMat };
  }, [crystal, model, dMin]);
  useEffect(
    () => () => {
      const { rings, ...rest } = res;
      rings.forEach((r) => r.g.dispose());
      Object.values(rest).forEach((r) => r.dispose());
    },
    [res],
  );

  // instance colours for the spots, and the crystal's mounting
  useEffect(() => {
    const sm = spots.current;
    if (sm && !sm.instanceColor) sm.instanceColor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    if (sm) sm.count = 0;
    const U = ORIENTATION;
    gem.current?.quaternion.setFromRotationMatrix(new Matrix4().set(U[0], U[1], U[2], 0, U[3], U[4], U[5], 0, U[6], U[7], U[8], 0, 0, 0, 0, 1));
    last.current.bin = -1;
  }, [res]);

  useEffect(() => {
    diffractionView.model = model;
    return () => {
      if (diffractionView.model === model) diffractionView.model = null;
    };
  }, [model]);
  useEffect(() => void (diffractionView.showRings = showRings), [showRings]);

  // cryostream nozzle and its cone of cold gas (narrow at the nozzle, widening over the crystal)
  const cryo = useMemo(() => {
    const place = (a: Vector3, b: Vector3, radius: number) => {
      const m = new Mesh();
      placeBetween(m, a, b, radius);
      return { position: m.position.clone(), quaternion: m.quaternion.clone(), scale: m.scale.clone() };
    };
    return { nozzle: place(NOZZLE.clone().multiplyScalar(0.64), NOZZLE.clone().multiplyScalar(1.6), 0.2), gas: place(new Vector3(0, 0, 0), NOZZLE.clone().multiplyScalar(0.62), 1) };
  }, []);

  useFrame((state, delta) => {
    const current = role === "current";
    if (!model.ready) {
      if (current) model.work(6);
      const p = Math.floor(model.progress * 20) / 20;
      if (p !== progress) setProgress(p);
      if (!model.ready) return;
    }
    if (progress !== 1) setProgress(1);

    const st = usePipelineStore.getState();
    if (current && st.rotating) diffractionView.phi += stageDelta(delta) * SPEED;
    const phi = diffractionView.phi;
    if (spinner.current) spinner.current.rotation.z = phi;
    const bin = model.binOf(phi);
    const ev = model.events;
    if (current) model.prefetch(ev.start[bin], 3);

    // cold nitrogen gas flowing from the nozzle over the crystal
    const gm = gas.current;
    if (gm) {
      for (let i = 0; i < 24; i++) {
        const f = (state.clock.elapsedTime * 0.6 + i / 24) % 1;
        const spread = 0.12 + 0.35 * f;
        tmp.a.copy(NOZZLE).multiplyScalar(0.62 * (1 - f) + 0.02);
        tmp.a.x += Math.sin(i * 2.4) * spread;
        tmp.a.z += Math.cos(i * 2.4) * spread;
        gm.setMatrixAt(i, tmp.m.makeScale(1 - f * 0.6, 1 - f * 0.6, 1 - f * 0.6).setPosition(tmp.a));
      }
      gm.instanceMatrix.needsUpdate = true;
    }

    if (bin === last.current.bin) return;
    last.current.bin = bin;

    // the spots of the current 1° image, and the previous 2° fading out
    const sm = spots.current;
    const colors = sm?.instanceColor;
    if (!sm || !colors) return;
    const mat = sm.instanceMatrix.array as Float32Array;
    const col = colors.array as Float32Array;
    const strongest: { e: number; v: number }[] = [];
    let n = 0;
    for (let k = TAIL_BINS + IMAGE_BINS - 1; k >= 0 && n < CAPACITY; k--) {
      const b = (bin - k + BIN_COUNT) % BIN_COUNT;
      const fade = k < IMAGE_BINS ? 1 : 1 - (k - IMAGE_BINS) / TAIL_BINS;
      for (let e = ev.start[b]; e < ev.start[b + 1] && n < CAPACITY; e++) {
        const strength = Math.min(1, (model.intensityOf(ev.reflection[e]) / model.reference) ** 0.4);
        const v = strength * fade;
        if (v < 0.05) continue;
        const r = (0.55 + 1.1 * strength) * MM;
        const o = n * 16;
        mat.fill(0, o, o + 16);
        mat[o] = r;
        mat[o + 5] = r;
        mat[o + 10] = r;
        mat[o + 12] = D - 0.02;
        mat[o + 13] = ev.y[e] * MM;
        mat[o + 14] = ev.z[e] * MM;
        mat[o + 15] = 1;
        tmp.c.copy(FACE).lerp(SPOT, v);
        col[n * 3] = tmp.c.r;
        col[n * 3 + 1] = tmp.c.g;
        col[n * 3 + 2] = tmp.c.b;
        n++;
        if (k < 2) strongest.push({ e, v });
      }
    }
    sm.count = n;
    sm.instanceMatrix.needsUpdate = true;
    colors.needsUpdate = true;

    // a few diffracted rays from the crystal to the newest strong spots
    const rm = rays.current;
    if (rm) {
      strongest.sort((a, b) => b.v - a.v);
      let r = 0;
      for (const { e } of strongest.slice(0, RAYS)) rm.setMatrixAt(r++, cylinderMatrix(tmp.a.set(0, 0, 0), tmp.b.set(D - 0.03, ev.y[e] * MM, ev.z[e] * MM), 0.012, tmp.m));
      rm.count = r;
      rm.instanceMatrix.needsUpdate = true;
    }
  });

  const interactive = role === "current";
  const hover = (title: string, subtitle: string) => (e: ThreeEvent<PointerEvent>) => {
    if (!interactive) return;
    e.stopPropagation();
    useExplorerStore.getState().setHover({ key: `xray:${title}`, title, subtitle });
  };
  const out = () => useExplorerStore.getState().setHover(null);
  const perImage = model.ready ? Math.round(model.events.count / 360).toLocaleString("en-US") : null;
  const beamLength = BEAMSTOP_X - 0.15 + 1.6;

  return (
    <group>
      {/* X-ray beam: collimator, beam, beamstop */}
      <mesh geometry={res.rod} material={res.metal} position={[-5.6, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.22, 7.6, 0.22]} onPointerMove={hover("Collimator", "The end of the beamline: X-rays from the synchrotron arrive through this tube.")} onPointerOut={out} />
      <mesh geometry={res.tip} material={res.metal} position={[-1.65, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[0.22, 0.3, 0.22]} raycast={() => null} />
      <mesh geometry={res.rod} material={res.beam} position={[(BEAMSTOP_X - 0.15 - 1.6) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.022, beamLength, 0.022]} raycast={() => null} />
      <mesh
        geometry={res.rod}
        material={res.halo}
        position={[(BEAMSTOP_X - 0.15 - 1.6) / 2, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[0.08, beamLength, 0.08]}
        onPointerMove={hover("X-ray beam", `Wavelength ${wavelength} Å, about the size of an atom. Most of the beam passes straight through the crystal.`)}
        onPointerOut={out}
      />
      <mesh geometry={res.rod} material={res.dark} position={[BEAMSTOP_X, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.1, 0.3, 0.1]} onPointerMove={hover("Beamstop", "Catches the strong direct beam so it does not damage the detector; it leaves a small shadow in the centre of every image.")} onPointerOut={out} />
      <mesh geometry={res.rod} material={res.dark} position={[BEAMSTOP_X, -1.6, 0]} scale={[0.02, 3.2, 0.02]} raycast={() => null} />

      {/* goniometer: fixed housing, then the turning pin, loop and crystal */}
      <mesh geometry={res.rod} material={res.metal} position={[0, 0, -4.6]} rotation={[Math.PI / 2, 0, 0]} scale={[0.7, 4.8, 0.7]} onPointerMove={hover("Goniometer", "Turns the crystal precisely about this axis while the detector records an image every fraction of a degree.")} onPointerOut={out} />
      <group ref={spinner}>
        <mesh geometry={res.rod} material={res.brass} position={[0, 0, -1.8]} rotation={[Math.PI / 2, 0, 0]} scale={[0.35, 0.8, 0.35]} raycast={() => null} />
        <mesh geometry={res.rod} material={res.dark} position={[0, 0, -0.85]} rotation={[Math.PI / 2, 0, 0]} scale={[0.04, 1.1, 0.04]} raycast={() => null} />
        <mesh geometry={res.loop} material={res.loopMat} position={[0, 0, -0.02]} raycast={() => null} />
        <mesh ref={gem} geometry={res.gemGeo} material={res.gemMat} onPointerMove={hover("KRAS crystal (enlarged)", "Really about 0.2 mm across, held by surface tension in a nylon loop and kept frozen at 100 K.")} onPointerOut={out} />
      </group>

      {/* cryostream */}
      <mesh
        geometry={res.rod}
        material={res.metal}
        position={cryo.nozzle.position}
        quaternion={cryo.nozzle.quaternion}
        scale={cryo.nozzle.scale}
        onPointerMove={hover("Cryostream", "A steady stream of nitrogen gas at 100 K keeps the crystal frozen and slows radiation damage.")}
        onPointerOut={out}
      />
      <mesh geometry={res.coneGas} material={res.gasMat} position={cryo.gas.position} quaternion={cryo.gas.quaternion} scale={[1, cryo.gas.scale.y, 1]} raycast={() => null} />
      <instancedMesh ref={gas} frustumCulled={false} args={[res.puff, res.puffMat, 24]} raycast={() => null} />

      {/* detector */}
      <mesh geometry={res.box} material={res.housing} position={[D + 0.42, 0, 0]} scale={[0.8, 2 * HALF * MM + 0.6, 2 * HALF * MM + 0.6]} raycast={() => null} />
      <mesh
        geometry={res.face}
        material={res.faceMat}
        position={[D, 0, 0]}
        onPointerMove={hover(
          "Detector · ADSC Quantum 315",
          `A 315 mm square CCD camera made of 3 × 3 modules. Each 1° turn of the crystal is one image${perImage ? `: about ${perImage} spots here` : ""}.`,
        )}
        onPointerOut={out}
      />
      <lineSegments geometry={res.gridGeo} material={res.gridMat} position={[D - 0.008, 0, 0]} raycast={() => null} />
      <instancedMesh ref={spots} frustumCulled={false} args={[res.spot, res.spotMat, CAPACITY]} raycast={() => null} />
      <instancedMesh ref={rays} frustumCulled={false} args={[res.rod, res.rayMat, RAYS]} raycast={() => null} />
      <group visible={showRings}>
        {res.rings.map((r) => (
          <mesh key={r.d} geometry={r.g} material={res.ringMat} position={[D - 0.03, 0, 0]} raycast={() => null} />
        ))}
      </group>

      <SceneLabel position={[-5.2, 0.55, 0]} essential>
        {`X-ray beam · ${wavelength} Å`}
      </SceneLabel>
      <SceneLabel position={[0, -0.75, 0.6]} essential>
        crystal in a loop (enlarged)
      </SceneLabel>
      <SceneLabel position={NOZZLE.clone().multiplyScalar(1.15).toArray()} tone="muted">
        cold nitrogen · 100 K
      </SceneLabel>
      <SceneLabel position={[D, HALF * MM + 0.75, 0]} essential>
        detector · ADSC Quantum 315
      </SceneLabel>
      {progress < 1 && (
        <SceneLabel position={[D, 0, 0]} tone="strong" essential>
          {`Calculating spots from the 4OBE atoms · ${Math.round(progress * 100)}%`}
        </SceneLabel>
      )}
      {showRings &&
        progress === 1 &&
        res.rings.map((r) => (
          <SceneLabel key={r.d} position={[D - 0.05, r.r * 0.7071, -r.r * 0.7071]} tone="muted" essential>
            {`${r.d} Å`}
          </SceneLabel>
        ))}
    </group>
  );
}

export const diffractionFraming = () => framing([1.2, 0.2, 0], 9.4, [-0.62, 0.3, 0.72]);
