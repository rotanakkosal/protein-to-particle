import { CanvasTexture, Matrix4, Quaternion, Vector3, type Object3D } from "three";

const UP = new Vector3(0, 1, 0);
const tmpDir = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3();
const tmpMid = new Vector3();

/** Matrix for a unit-height, unit-radius Y-aligned cylinder stretched from a to b. */
export function cylinderMatrix(a: Vector3, b: Vector3, radius: number, out: Matrix4): Matrix4 {
  tmpDir.subVectors(b, a);
  const len = tmpDir.length();
  tmpMid.addVectors(a, b).multiplyScalar(0.5);
  if (len < 1e-6) return out.makeScale(0, 0, 0);
  tmpQuat.setFromUnitVectors(UP, tmpDir.divideScalar(len));
  tmpScale.set(radius, len, radius);
  return out.compose(tmpMid, tmpQuat, tmpScale);
}

/** Positions an Object3D (e.g. a cylinder mesh) between two points. */
export function placeBetween(obj: Object3D, a: Vector3, b: Vector3, radius: number) {
  tmpDir.subVectors(b, a);
  const len = tmpDir.length();
  obj.position.addVectors(a, b).multiplyScalar(0.5);
  if (len > 1e-6) obj.quaternion.setFromUnitVectors(UP, tmpDir.divideScalar(len));
  obj.scale.set(radius, len, radius);
}

let glow: CanvasTexture | null = null;
/** Soft radial sprite used for electron glows. */
export function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new CanvasTexture(canvas);
  return glow;
}

let dot: CanvasTexture | null = null;
/** Round point sprite for point clouds. */
export function dotTexture(): CanvasTexture {
  if (dot) return dot;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  dot = new CanvasTexture(canvas);
  return dot;
}
