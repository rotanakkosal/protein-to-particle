"use client";

import { Environment, Lightformer } from "@react-three/drei";

/**
 * Soft studio lighting: low-contrast ambient + hemisphere fill, one key light and procedural
 * light-formers for glossy reflections (no network-loaded HDR files).
 */
export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#ffffff", "#d3dae5", 0.75]} />
      <directionalLight position={[6, 10, 8]} intensity={1.55} color="#ffffff" />
      <directionalLight position={[-8, -3, -6]} intensity={0.45} color="#dfe8ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 6]} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-8, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[8, -2, 3]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} color="#f2f6ff" />
        <Lightformer form="circle" intensity={1.4} position={[0, -6, -4]} scale={4} color="#eef3ff" />
      </Environment>
    </>
  );
}
