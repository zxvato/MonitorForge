import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Grid, Html, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Mesh, Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three';
import { useStore } from '../model/store';
import type { Design, Selection } from '../model/types';
import type { Report } from '../export/report';
import { beamLabel, postLabel } from '../export/report';
import { partMesh } from '../geometry/cache';
import type { PartInstance } from '../geometry/parts';
import { dims } from '../geometry/dims';
import { mixColor, snap, threeGeometry, toModel, toThree } from './three-helpers';
import { planDrop, type Hit, type PaletteKind } from './interactions';
import { getReport, useReport } from './useReport';

const WOOD = '#c99b6a';
const WOOD_SEL = '#f0c27a';

/** Functions exposed by the 3D scene to the rest of the UI. */
export const sceneApi: {
  drop?: (clientX: number, clientY: number, kind: PaletteKind) => void;
  snapshot?: () => string | undefined;
} = {};

export function Viewport() {
  const report = useReport();
  const view = useStore((s) => s.view);
  const select = useStore((s) => s.select);

  return (
    <div
      className="viewport"
      data-testid="viewport"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const kind = e.dataTransfer.getData('application/x-part') as PaletteKind;
        if (kind) sceneApi.drop?.(e.clientX, e.clientY, kind);
      }}
    >
      <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} onPointerMissed={() => select(null)}>
        <color attach="background" args={['#eef0f3']} />
        {view === 'persp' ? (
          <PerspectiveCamera makeDefault fov={38} near={5} far={40000} position={[900, 900, 1500]} />
        ) : (
          <OrthographicCamera makeDefault near={-20000} far={40000} zoom={0.5} position={[0, 3000, 0]} />
        )}
        <Scene report={report} />
      </Canvas>
      <ViewControls />
      <Toast />
      <div className="hint">
        Drag from the left onto the desk or frame · drag posts to move (Shift = whole frame) · drag beams and add-ons to slide them · Del deletes
      </div>
    </div>
  );
}

function ViewControls() {
  const view = useStore((s) => s.view);
  const showDims = useStore((s) => s.showDims);
  const set = useStore((s) => s.set);
  return (
    <div className="view-controls">
      <div className="seg">
        {(['persp', 'top', 'front'] as const).map((v) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => set({ view: v })}>
            {v === 'persp' ? '3D' : v === 'top' ? 'Top' : 'Front'}
          </button>
        ))}
      </div>
      <button className={showDims ? 'on' : ''} onClick={() => set({ showDims: !showDims })} title="Show dimensions">
        Dimensions
      </button>
      <button onClick={() => useStore.setState((s) => ({ fitToken: s.fitToken + 1 }))} title="Frame everything">
        Fit
      </button>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  return toast ? <div className="toast">{toast}</div> : null;
}

// ---------------------------------------------------------------------------

function useDrag() {
  const { camera, gl, controls } = useThree();
  return useCallback(
    (plane: Plane | (() => Plane), onMove: (p: Vector3, ev: PointerEvent) => void) => {
      const st = useStore.getState();
      let moved = false;
      if (controls) (controls as any).enabled = false;
      st.set({ dragging: true });
      const ray = new Raycaster();
      const ndc = new Vector2();
      const hit = new Vector3();
      const pl = typeof plane === 'function' ? plane() : plane;
      const move = (ev: PointerEvent) => {
        const r = gl.domElement.getBoundingClientRect();
        ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        if (!ray.ray.intersectPlane(pl, hit)) return;
        if (!moved) {
          moved = true;
          useStore.getState().checkpoint();
        }
        onMove(hit.clone(), ev);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (controls) (controls as any).enabled = true;
        useStore.getState().set({ dragging: false });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [camera, gl, controls],
  );
}

/** Vertical plane through a point (three space), facing the camera. */
function useFacingPlane() {
  const { camera } = useThree();
  return useCallback(
    (p: Vector3) => {
      const n = new Vector3().subVectors(camera.position, p);
      n.y = 0;
      if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
      n.normalize();
      return new Plane().setFromNormalAndCoplanarPoint(n, p);
    },
    [camera],
  );
}

/** Pointer-down handler that selects a post and drags it on the desk (Shift = whole frame). */
function usePostDrag() {
  const drag = useDrag();
  const select = useStore((s) => s.select);
  const updatePost = useStore((s) => s.updatePost);
  const change = useStore((s) => s.change);
  return (e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    select({ type: 'post', id });
    const g = useStore.getState().design.settings.gridSnap;
    const orig = useStore.getState().design.posts.map((p) => ({ ...p }));
    const me = orig.find((p) => p.id === id);
    if (!me) return;
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const start = new Vector3();
    // project the grab point straight down onto the desk so the post doesn't jump
    if (!new Raycaster(e.ray.origin, e.ray.direction).ray.intersectPlane(plane, start)) return;
    const s0 = toModel(start);
    const all = e.shiftKey;
    drag(plane, (v) => {
      const m = toModel(v);
      const dx = snap(me.x + m[0] - s0[0], g) - me.x;
      const dy = snap(me.y + m[1] - s0[1], g) - me.y;
      if (all)
        change((dd) => ({ ...dd, posts: dd.posts.map((p) => { const o = orig.find((q) => q.id === p.id); return o ? { ...p, x: o.x + dx, y: o.y + dy } : p; }) }), false);
      else updatePost(id, { x: me.x + dx, y: me.y + dy }, false);
    });
  };
}

function Scene({ report }: { report: Report }) {
  const design = report.design;
  const showDims = useStore((s) => s.showDims && s.tab === 'design');
  const persp = useStore((s) => s.view === 'persp');
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b9a68e', 1.1]} />
      <directionalLight position={[800, 1600, 900]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-1500, 1500, 1500, -1500, 10, 5000]} />
      </directionalLight>
      <directionalLight position={[-900, 600, -700]} intensity={0.4} />
      <Desk />
      <group rotation-x={-Math.PI / 2}>
        <Frame report={report} />
        <Parts report={report} />
        {showDims && <Dimensions report={report} />}
      </group>
      {persp && <ContactShadows position={[0, 0.3, 0]} scale={5000} resolution={1024} blur={2.2} far={600} opacity={0.35} frames={Infinity} />}
      <Bridge design={design} />
    </>
  );
}

function Desk() {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.6, 0]} receiveShadow userData={{ type: 'desk' }}>
        <planeGeometry args={[20000, 20000]} />
        <meshStandardMaterial color="#e4e0d8" roughness={0.95} />
      </mesh>
      <Grid
        position={[0, 0.05, 0]}
        args={[6000, 6000]}
        cellSize={10}
        sectionSize={100}
        cellThickness={0.5}
        sectionThickness={1}
        cellColor="#cfc8bc"
        sectionColor="#a99f90"
        fadeDistance={5000}
        fadeStrength={1.5}
        infiniteGrid
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function isSel(sel: Selection, type: string, id: string) {
  return !!sel && sel.type === type && sel.id === id;
}

function Frame({ report }: { report: Report }) {
  const design = report.design;
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const updatePost = useStore((s) => s.updatePost);
  const updateBeam = useStore((s) => s.updateBeam);
  const drag = useDrag();
  const facing = useFacingPlane();
  const d = dims(design.settings);
  const g = design.settings.gridSnap;

  const onPost = usePostDrag();

  const onPostTop = (e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    select({ type: 'post', id });
    drag(facing(e.point.clone()), (v) => {
      const z = snap(toModel(v)[2], g);
      updatePost(id, { height: Math.max(60, z) }, false);
    });
  };

  const onBeam = (e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    select({ type: 'beam', id });
    const b = design.beams.find((x) => x.id === id)!;
    const pa = design.posts.find((p) => p.id === b.a), pb = design.posts.find((p) => p.id === b.b);
    const maxZ = Math.min(pa?.height ?? 0, pb?.height ?? 0);
    drag(facing(e.point.clone()), (v) => {
      const z = Math.max(design.settings.minBeamHeight, Math.min(maxZ, snap(toModel(v)[2], g)));
      updateBeam(id, { z }, false);
    });
  };

  return (
    <group>
      {design.posts.map((p) => {
        const selected = isSel(sel, 'post', p.id);
        return (
          <group key={p.id}>
            <mesh
              position={[p.x, p.y, p.height / 2]}
              rotation-x={Math.PI / 2}
              castShadow
              userData={{ type: 'post', id: p.id }}
              onPointerDown={(e) => onPost(e, p.id)}
              onPointerOver={() => (document.body.style.cursor = 'grab')}
              onPointerOut={() => (document.body.style.cursor = '')}
            >
              <cylinderGeometry args={[d.R, d.R, p.height, 40]} />
              <meshStandardMaterial color={selected ? WOOD_SEL : WOOD} roughness={0.7} />
            </mesh>
            {selected && (
              <mesh
                position={[p.x, p.y, p.height + d.sleeveLen * 0.3 + 30]}
                onPointerDown={(e) => onPostTop(e, p.id)}
                onPointerOver={() => (document.body.style.cursor = 'ns-resize')}
                onPointerOut={() => (document.body.style.cursor = '')}
              >
                <sphereGeometry args={[9, 24, 16]} />
                <meshStandardMaterial color="#ff8a3d" emissive="#ff8a3d" emissiveIntensity={0.4} />
              </mesh>
            )}
          </group>
        );
      })}
      {design.beams.map((b) => {
        const info = report.topo.beams.get(b.id);
        const pa = design.posts.find((p) => p.id === b.a), pb = design.posts.find((p) => p.id === b.b);
        if (!pa || !pb) return null;
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
        const valid = info?.valid;
        const selected = isSel(sel, 'beam', b.id);
        return (
          <mesh
            key={b.id}
            position={[(pa.x + pb.x) / 2, (pa.y + pb.y) / 2, b.z]}
            rotation={[0, 0, ang - Math.PI / 2]}
            castShadow
            userData={{ type: 'beam', id: b.id }}
            onPointerDown={(e) => onBeam(e, b.id)}
            onPointerOver={() => (document.body.style.cursor = 'ns-resize')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <cylinderGeometry args={[d.R, d.R, len, 40]} />
            <meshStandardMaterial
              color={!valid ? '#e5484d' : selected ? WOOD_SEL : WOOD}
              transparent={!valid}
              opacity={valid ? 1 : 0.55}
              roughness={0.7}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------

function Parts({ report }: { report: Report }) {
  const design = report.design;
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const updateAddOn = useStore((s) => s.updateAddOn);
  const drag = useDrag();
  const facing = useFacingPlane();
  const color = design.settings.partColor;
  const addonColor = mixColor(color, '#ffffff', 0.55);
  const g = design.settings.gridSnap;

  const postDrag = usePostDrag();
  const onDown = (e: ThreeEvent<PointerEvent>, inst: PartInstance) => {
    e.stopPropagation();
    const src = inst.source;
    if (src?.type === 'node') return postDrag(e, src.id.split('@')[0]);
    select(src);
    if (src?.type !== 'addon') return;
    const a = design.addons.find((x) => x.id === src.id);
    if (!a) return;
    const start = toModel(e.point);
    if (a.kind === 'shelf' || a.kind === 'drawer') {
      const info = report.topo.beams.get(a.beams[0]);
      if (!info) return;
      const axis = info.axis === 'x' ? 0 : 1;
      drag(new Plane(new Vector3(0, 1, 0), -info.z), (v) => {
        const m = toModel(v);
        updateAddOn(a.id, { center: snap(a.center + m[axis] - start[axis], g / 2) }, false);
      });
    } else if (a.kind === 'watch') {
      drag(facing(e.point.clone()), (v) => updateAddOn(a.id, { z: Math.max(0, snap(a.z + toModel(v)[2] - start[2], g / 2)) }, false));
    } else if (a.kind === 'divider') {
      drag(facing(e.point.clone()), (v) => {
        const dz = snap(toModel(v)[2] - start[2], g / 2);
        if (a.z0 + dz >= 0) updateAddOn(a.id, { z0: a.z0 + dz, z1: a.z1 + dz }, false);
      });
    }
  };

  return (
    <group>
      {report.instances.map((inst, i) => {
        const selected = !!sel && !!inst.source && sel.type === inst.source.type && sel.id === inst.source.id;
        const nodeOfPost = sel?.type === 'post' && inst.source?.type === 'node' && inst.source.id.startsWith(sel.id + '@');
        return (
          <PartMesh
            key={`${inst.source?.id}-${inst.spec.key}-${i}`}
            inst={inst}
            design={design}
            color={inst.spec.group === 'Connectors' ? color : addonColor}
            highlight={selected || nodeOfPost}
            onDown={onDown}
          />
        );
      })}
    </group>
  );
}

function PartMesh({ inst, design, color, highlight, onDown }: { inst: PartInstance; design: Design; color: string; highlight: boolean; onDown: (e: ThreeEvent<PointerEvent>, i: PartInstance) => void }) {
  const ref = useRef<Mesh>(null);
  const geom = useMemo(() => threeGeometry(inst.spec.key, partMesh(inst.spec, design.settings)), [inst.spec, design.settings]);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    m.matrixAutoUpdate = false;
    m.matrix.copy(inst.world);
    m.matrixWorldNeedsUpdate = true;
  }, [inst.world]);
  return (
    <mesh
      ref={ref}
      geometry={geom}
      castShadow
      receiveShadow
      userData={{ type: inst.source?.type, id: inst.source?.id }}
      onPointerDown={(e) => onDown(e, inst)}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.02} emissive={highlight ? '#ff8a3d' : '#000000'} emissiveIntensity={highlight ? 0.35 : 0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------

function Label({ position, children, tone = 'default' }: { position: [number, number, number]; children: React.ReactNode; tone?: 'default' | 'accent' | 'muted' }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`dim-label ${tone}`}>{children}</div>
    </Html>
  );
}

function Dimensions({ report }: { report: Report }) {
  const design = report.design;
  const sel = useStore((s) => s.selection);
  const d = dims(design.settings);
  if (!design.posts.length) return null;
  const xs = design.posts.map((p) => p.x), ys = design.posts.map((p) => p.y);
  const minX = Math.min(...xs) - d.R, maxX = Math.max(...xs) + d.R;
  const minY = Math.min(...ys) - d.R, maxY = Math.max(...ys) + d.R;
  const maxH = Math.max(...design.posts.map((p) => p.height));
  const fy = minY - 90, sx = maxX + 90;
  const lineCol = '#5b6472';

  const items: React.ReactNode[] = [];
  // overall width & depth on the desk
  items.push(
    <Line key="w" points={[[minX, fy, 1], [maxX, fy, 1]]} color={lineCol} lineWidth={1.2} />,
    <Line key="w0" points={[[minX, fy - 12, 1], [minX, fy + 12, 1]]} color={lineCol} lineWidth={1.2} />,
    <Line key="w1" points={[[maxX, fy - 12, 1], [maxX, fy + 12, 1]]} color={lineCol} lineWidth={1.2} />,
    <Label key="wl" position={[(minX + maxX) / 2, fy, 1]} tone="accent">{Math.round(maxX - minX)} mm wide</Label>,
  );
  if (maxY - minY > d.R * 2 + 1)
    items.push(
      <Line key="d" points={[[sx, minY, 1], [sx, maxY, 1]]} color={lineCol} lineWidth={1.2} />,
      <Line key="d0" points={[[sx - 12, minY, 1], [sx + 12, minY, 1]]} color={lineCol} lineWidth={1.2} />,
      <Line key="d1" points={[[sx - 12, maxY, 1], [sx + 12, maxY, 1]]} color={lineCol} lineWidth={1.2} />,
      <Label key="dl" position={[sx, (minY + maxY) / 2, 1]} tone="accent">{Math.round(maxY - minY)} mm deep</Label>,
    );
  const tall = design.posts.find((p) => p.height === maxH)!;
  items.push(
    <Line key="h" points={[[maxX + 60, tall.y, 0], [maxX + 60, tall.y, maxH]]} color={lineCol} lineWidth={1.2} dashed dashSize={8} gapSize={6} />,
    <Label key="hl" position={[maxX + 60, tall.y, maxH + 20]} tone="accent">{maxH} mm high</Label>,
  );

  for (const p of design.posts)
    items.push(
      <Label key={'p' + p.id} position={[p.x, p.y, p.height + d.sleeveLen * 0.3 + (isSel(sel, 'post', p.id) ? 60 : 18)]} tone={isSel(sel, 'post', p.id) ? 'accent' : 'default'}>
        {postLabel(design, p.id)} · {p.height}
      </Label>,
    );

  for (const r of report.topo.rods) {
    if (r.kind !== 'beam') continue;
    const a = report.topo.nodes.get(r.a)!, b = report.topo.nodes.get(r.b)!;
    items.push(
      <Label key={'r' + r.id} position={[(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2, a.pos[2] + d.Ro + 16]} tone={isSel(sel, 'beam', r.sourceId) ? 'accent' : 'muted'}>
        {beamLabel(design, r.sourceId)} · {Math.round(r.length)}
      </Label>,
    );
  }

  if (sel?.type === 'addon') {
    const a = design.addons.find((x) => x.id === sel.id);
    const inst = report.instances.find((i) => i.source?.id === sel.id);
    if (a && inst) {
      const c = new Vector3().setFromMatrixPosition(inst.world);
      let text = '';
      let z = c.z + 60;
      if (a.kind === 'shelf') {
        const A = report.topo.beams.get(a.beams[0]), B = report.topo.beams.get(a.beams[1]);
        const depth = A && B ? Math.abs(A.fixed - B.fixed) + 2 * a.overhang : 0;
        text = `shelf ${a.width} × ${Math.round(depth)} mm`;
      }
      if (a.kind === 'drawer') {
        text = `drawer ${a.width} w × ${a.height} h`;
        z = c.z - a.height / 2;
      }
      if (a.kind === 'divider') {
        text = `${a.z1 - a.z0} mm tall, from ${a.z0}`;
        z = (a.z0 + a.z1) / 2;
      }
      if (a.kind === 'watch') {
        text = `at ${a.z} mm`;
        z = a.z + 80;
      }
      items.push(<Label key="sel" position={[c.x, c.y, z]} tone="accent">{text}</Label>);
    }
  }
  return <group>{items}</group>;
}

// ---------------------------------------------------------------------------

function Bridge({ design }: { design: Design }) {
  const { camera, gl, scene, controls, size } = useThree();
  const fitToken = useStore((s) => s.fitToken);
  const view = useStore((s) => s.view);

  // drop + snapshot API
  useEffect(() => {
    sceneApi.drop = (clientX, clientY, kind) => {
      const r = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      const ray = new Raycaster();
      ray.setFromCamera(ndc, camera);
      const targets: Object3D[] = [];
      scene.traverse((o) => {
        if ((o as Mesh).isMesh && o.userData?.type) targets.push(o);
      });
      let hit: Hit | null = null;
      for (const h of ray.intersectObjects(targets, false)) {
        const t = h.object.userData.type;
        if (t === 'post' || t === 'beam') {
          hit = { type: t, id: h.object.userData.id, point: toModel(h.point) };
          break;
        }
        if (t === 'node') {
          // a connector: treat as hitting its post
          const id = String(h.object.userData.id).split('@')[0];
          hit = { type: 'post', id, point: toModel(h.point) };
          break;
        }
        if (t === 'desk') {
          hit = { type: 'desk', point: toModel(h.point) };
          break;
        }
      }
      // Forgiving drop: snap to the nearest post / beam on screen if the ray missed it.
      const wants = kind === 'shelf' || kind === 'drawer' ? 'beam' : kind === 'post' ? null : 'post';
      if (wants && hit?.type !== wants) {
        const near = nearestOnScreen(wants, clientX, clientY, r, camera, useStore.getState().design);
        if (near) hit = near;
      }
      if (!hit) {
        const v = new Vector3();
        if (ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), v)) hit = { type: 'desk', point: toModel(v) };
      }
      const st = useStore.getState();
      const res = planDrop(kind, hit, st.design, getReport(st.design).topo);
      if (res.action === 'none') st.showToast(res.message);
      else if (res.action === 'post') st.addPost(res.x, res.y, res.height);
      else if (res.action === 'beam') st.addBeam(res.a, res.b, res.z);
      else st.addAddOn(res.addon);
    };
    sceneApi.snapshot = () => {
      gl.render(scene, camera);
      // JPEG, max 1400 px wide: jsPDF embeds JPEGs as-is (PNGs get re-encoded, which is slow).
      const src = gl.domElement;
      const scale = Math.min(1, 1400 / src.width);
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.88);
    };
  }, [camera, gl, scene]);

  // framing
  useEffect(() => {
    const posts = design.posts;
    const xs = posts.map((p) => p.x), ys = posts.map((p) => p.y);
    const cx = posts.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cy = posts.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const w = posts.length ? Math.max(...xs) - Math.min(...xs) + 300 : 1200;
    const dd = posts.length ? Math.max(...ys) - Math.min(...ys) + 300 : 600;
    const h = posts.length ? Math.max(...posts.map((p) => p.height)) : 300;
    const target = new Vector3(cx, h * 0.35, -cy);
    const ext = Math.max(w, dd, h * 1.5);
    if (view === 'persp') {
      const dist = ext * 1.35 + 200;
      camera.position.set(cx + dist * 0.45, h * 0.35 + dist * 0.5, -cy + dist * 0.85);
    } else if (view === 'top') {
      camera.position.set(cx, 3000, -cy + 0.01);
      target.set(cx, 0, -cy);
      (camera as any).zoom = Math.min(size.width / (w + 200), size.height / (dd + 300));
    } else {
      camera.position.set(cx, h / 2, 5000);
      target.set(cx, h / 2, -cy);
      (camera as any).zoom = Math.min(size.width / (w + 200), size.height / (h + 300));
    }
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    if (controls) {
      (controls as any).target.copy(target);
      (controls as any).update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken, view, camera, controls]);

  return <OrbitControls makeDefault enableRotate={view === 'persp'} enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.02} />;
}

/** Nearest post or beam axis to a screen point, within 60 px. */
function nearestOnScreen(type: 'post' | 'beam', cx: number, cy: number, rect: DOMRect, camera: Camera, design: Design): Hit | null {
  const segs: { id: string; a: [number, number, number]; b: [number, number, number] }[] =
    type === 'post'
      ? design.posts.map((p) => ({ id: p.id, a: [p.x, p.y, 0], b: [p.x, p.y, p.height] }))
      : design.beams.flatMap((bm) => {
          const pa = design.posts.find((p) => p.id === bm.a), pb = design.posts.find((p) => p.id === bm.b);
          return pa && pb ? [{ id: bm.id, a: [pa.x, pa.y, bm.z] as [number, number, number], b: [pb.x, pb.y, bm.z] as [number, number, number] }] : [];
        });
  let best: Hit | null = null;
  let bestD = 60;
  const v = new Vector3();
  for (const sg of segs)
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const p: [number, number, number] = [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t, sg.a[2] + (sg.b[2] - sg.a[2]) * t];
      v.copy(toThree(p)).project(camera);
      const sx = rect.left + ((v.x + 1) / 2) * rect.width, sy = rect.top + ((1 - v.y) / 2) * rect.height;
      const dd = Math.hypot(sx - cx, sy - cy);
      if (dd < bestD) {
        bestD = dd;
        best = { type, id: sg.id, point: p };
      }
    }
  return best;
}
