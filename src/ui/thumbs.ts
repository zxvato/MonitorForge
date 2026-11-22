// Renders small preview images of parts (in print orientation) with one shared renderer.
import {
  AmbientLight, Box3, Color, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { Settings } from '../model/types';
import type { PartSpec } from '../geometry/parts';
import { printMesh } from '../geometry/cache';
import { threeGeometry } from './three-helpers';

let renderer: WebGLRenderer | null = null;
const cache = new Map<string, string>();

export function thumbnail(spec: PartSpec, s: Settings, color: string): string {
  const key = `${spec.key}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!renderer) {
    renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setSize(240, 180);
    renderer.setPixelRatio(2);
  }
  const pm = printMesh(spec, s);
  const geom = threeGeometry(`print|${spec.key}`, pm);
  const scene = new Scene();
  const mesh = new Mesh(geom, new MeshStandardMaterial({ color: new Color(color), roughness: 0.55 }));
  mesh.rotation.x = -Math.PI / 2; // print Z-up → three Y-up
  scene.add(mesh, new AmbientLight('#ffffff', 1.2));
  const sun = new DirectionalLight('#ffffff', 2.2);
  sun.position.set(1, 2, 1.4);
  scene.add(sun);
  const back = new DirectionalLight('#ffffff', 0.6);
  back.position.set(-1, 0.5, -1);
  scene.add(back);
  const box = new Box3().setFromObject(mesh);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const r = Math.max(size.x, size.y, size.z);
  const cam = new PerspectiveCamera(30, 240 / 180, 1, r * 20);
  cam.position.copy(center).add(new Vector3(0.9, 0.8, 1.25).multiplyScalar(r * 1.7));
  cam.lookAt(center);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  (mesh.material as MeshStandardMaterial).dispose();
  cache.set(key, url);
  return url;
}
