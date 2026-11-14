import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Everything the scroll story drives. The render loop reads this object every frame. */
export interface StageRig {
  m: number;        // morph position along SHAPES (0 = first shape, 1 = second, ...)
  form: number;     // 0 = stardust, 1 = formed
  burst: number;    // exit explosion
  x: number;        // horizontal offset of the subject
  rotY: number;     // extra yaw
  camZ: number;     // camera distance
  organs: number;   // how strongly organs and bones glow inside the body
  alert: number;    // red pulse through the body
  photon: number;   // 0 = at the ship, 1 = at Earth
  photonA: number;  // photon visibility
  bright: number;
  scrollV: number;  // scroll speed, for the star warp
}

export type ShapeId = "body" | "earth" | "helix";
export const SHAPES: ShapeId[] = ["body", "earth", "body", "body", "helix", "body"];
export const EARTH_X = -2.25;
export const SHIP_X = 2.25;
const MID_Y = 0.95;

interface Shape {
  pos: Float32Array;
  col: Float32Array;
}

const ORGANS: [string, number, [number, number, number]][] = [
  ["ORG_vessels", 0.1, [1.0, 0.16, 0.3]],
  ["ORG_heart", 0.03, [1.0, 0.22, 0.32]],
  ["ORG_lung_L", 0.025, [0.4, 0.72, 1.0]],
  ["ORG_lung_R", 0.025, [0.4, 0.72, 1.0]],
  ["ORG_brain", 0.035, [1.0, 0.45, 0.7]],
  ["ORG_liver", 0.025, [0.95, 0.5, 0.22]],
  ["ORG_stomach", 0.015, [1.0, 0.55, 0.45]],
  ["ORG_gut", 0.03, [1.0, 0.72, 0.4]],
  ["ORG_kidney_L", 0.008, [0.9, 0.45, 0.35]],
  ["ORG_kidney_R", 0.008, [0.9, 0.45, 0.35]],
];
const BONES: [string, number][] = [
  ["ORG_ribs", 0.035],
  ["ORG_spine", 0.025],
  ["ORG_skull", 0.015],
  ["ORG_pelvis", 0.015],
  ["ORG_bones_arm", 0.015],
  ["ORG_bones_leg", 0.02],
];
const SKIN_COL: [number, number, number] = [0.1, 0.62, 0.85];
const BONE_COL: [number, number, number] = [0.72, 0.84, 1.0];

/** Stand-in figure if the model cannot be fetched: the story still plays. */
function fallbackBody(n: number, pos: Float32Array, col: Float32Array, kind: Float32Array) {
  const parts: [number, number, number, number, number, number, number][] = [
    [0, 1.68, 0, 0.1, 0.12, 0.1, 0.1], // head
    [0, 1.25, 0, 0.19, 0.3, 0.11, 0.38], // torso
    [0, 0.95, 0, 0.17, 0.12, 0.1, 0.1], // hips
    [-0.27, 1.15, 0, 0.045, 0.32, 0.045, 0.08],
    [0.27, 1.15, 0, 0.045, 0.32, 0.045, 0.08],
    [-0.11, 0.45, 0, 0.07, 0.45, 0.07, 0.13],
    [0.11, 0.45, 0, 0.07, 0.45, 0.07, 0.13],
  ];
  let i = 0;
  for (const [cx, cy, cz, rx, ry, rz, share] of parts) {
    const count = Math.round(n * share);
    for (let k = 0; k < count && i < n; k++, i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([cx + rx * r * Math.cos(t), cy + ry * u, cz + rz * r * Math.sin(t)], i * 3);
      col.set(SKIN_COL, i * 3);
      kind[i] = 0;
    }
  }
  for (; i < n; i++) {
    pos.set([(Math.random() - 0.5) * 0.3, 1.0 + Math.random() * 0.5, (Math.random() - 0.5) * 0.15], i * 3);
    col.set(SKIN_COL, i * 3);
    kind[i] = 0;
  }
}

function buildEarth(n: number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const nShip = Math.round(n * 0.07);
  const nPath = Math.round(n * 0.05);
  const nEarth = n - nShip - nPath;
  const R = 0.78;
  for (let i = 0; i < nEarth; i++) {
    const halo = i % 11 === 0;
    const y = 1 - (2 * (i + 0.5)) / nEarth;
    const r = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    const dx = r * Math.cos(th);
    const dz = r * Math.sin(th);
    const rr = halo ? R * (1.06 + Math.random() * 0.06) : R;
    pos.set([EARTH_X + dx * rr, MID_Y + y * rr, dz * rr], i * 3);
    // cheap continents: a few interfering waves over the sphere
    const land = Math.sin(dx * 5.1 + 1.3) * Math.cos(y * 4.3 - 0.6) + Math.sin(dz * 6.2 + y * 3.1) * 0.6;
    const ice = Math.abs(y) > 0.86;
    if (halo) col.set([0.25, 0.55, 1.0], i * 3);
    else if (ice) col.set([0.85, 0.95, 1.0], i * 3);
    else if (land > 0.45) col.set([0.2, 0.85, 0.5], i * 3);
    else col.set([0.08, 0.38, 1.0], i * 3);
  }
  for (let k = 0; k < nShip; k++) {
    const i = nEarth + k;
    const ring = k % 3 === 0;
    const t = Math.random() * Math.PI * 2;
    if (ring) {
      pos.set([SHIP_X + (Math.random() - 0.5) * 0.03, MID_Y + Math.cos(t) * 0.2, Math.sin(t) * 0.2], i * 3);
    } else {
      const a = (Math.random() - 0.5) * 0.62;
      const rr = 0.055 * (1 - Math.abs(a) * 0.9);
      pos.set([SHIP_X + a, MID_Y + Math.cos(t) * rr, Math.sin(t) * rr], i * 3);
    }
    col.set([1.0, 0.55, 0.6], i * 3);
  }
  for (let k = 0; k < nPath; k++) {
    const i = nEarth + nShip + k;
    const f = (k + Math.random()) / nPath;
    pos.set([EARTH_X + R + 0.1 + f * (SHIP_X - EARTH_X - R - 0.5), MID_Y + (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.012], i * 3);
    col.set([0.5, 0.75, 0.9], i * 3);
  }
  return { pos, col };
}

function buildHelix(n: number): Shape {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const TURNS = 3.2;
  const R = 0.36;
  for (let i = 0; i < n; i++) {
    const kindR = i % 5; // 0,1 strand A · 2,3 strand B · 4 rung
    let t = Math.random();
    const j = () => (Math.random() - 0.5) * 0.022;
    if (kindR < 4) {
      const ph = t * TURNS * Math.PI * 2 + (kindR < 2 ? 0 : Math.PI);
      pos.set([Math.cos(ph) * R + j(), 0.05 + t * 1.8 + j(), Math.sin(ph) * R + j()], i * 3);
      col.set(kindR < 2 ? [0.15, 0.8, 1.0] : [0.62, 0.4, 1.0], i * 3);
    } else {
      t = (Math.floor(t * 30) + 0.5) / 30;
      const ph = t * TURNS * Math.PI * 2;
      const s = Math.random() * 2 - 1;
      pos.set([Math.cos(ph) * R * s, 0.05 + t * 1.8, Math.sin(ph) * R * s], i * 3);
      col.set([0.8, 0.9, 1.0], i * 3);
    }
  }
  return { pos, col };
}

const VERT = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute vec3 aColFrom;
  attribute vec3 aColTo;
  attribute vec4 aSeed;
  attribute float aKind;
  uniform float uMix, uSwirl, uForm, uBurst, uTime, uPx, uOrgans, uAlert, uKindOn, uBright;
  uniform vec3 uMouse;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float m = smoothstep(0.0, 1.0, clamp(uMix * 1.3 - aSeed.w * 0.3, 0.0, 1.0));
    vec3 p = mix(aFrom, aTo, m);
    float arc = sin(m * 3.14159265) * uSwirl;
    p += aSeed.xyz * arc * (0.35 + 0.5 * aSeed.w);
    p.y += arc * 0.12 * sin(aSeed.w * 30.0);
    // living drift
    p += 0.0045 * vec3(sin(uTime * 0.9 + aSeed.w * 40.0), cos(uTime * 0.7 + aSeed.x * 30.0), sin(uTime * 0.8 + aSeed.y * 20.0));
    // stardust -> formed
    float f = smoothstep(0.0, 1.0, clamp(uForm * 1.35 - aSeed.w * 0.35, 0.0, 1.0));
    vec3 dust = vec3(0.0, 0.95, 0.0) + aSeed.xyz * (2.2 + 5.0 * aSeed.w);
    float spin = (1.0 - f) * 2.4;
    dust.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * dust.xz;
    p = mix(dust, p, f);
    // the cursor parts the particles
    vec3 d = p - uMouse;
    float push = exp(-dot(d, d) * 26.0);
    p += normalize(d + vec3(0.0001)) * push * 0.16;
    // exit
    p += aSeed.xyz * uBurst * (1.5 + 5.0 * aSeed.w);

    vec3 c = mix(aColFrom, aColTo, m);
    float inner = step(0.5, aKind);
    c *= mix(1.0, mix(1.25 - 0.55 * uOrgans, 0.35 + 1.1 * uOrgans, inner), uKindOn);
    // scan sweep up the subject
    float sweep = exp(-pow((p.y - (mod(uTime * 0.45, 2.6) - 0.3)) * 9.0, 2.0));
    c += vec3(0.25, 0.6, 0.7) * sweep * 0.55 * uKindOn;
    // alert: red pressure waves from the chest
    float wave = 0.5 + 0.5 * sin(uTime * 5.0 - distance(p, vec3(0.0, 1.3, 0.05)) * 10.0);
    c = mix(c, vec3(1.0, 0.16, 0.22) * (0.55 + 0.9 * wave), uAlert * uKindOn * 0.85);
    vCol = c * uBright * (0.75 + 0.5 * aSeed.w);
    vA = (0.35 + 0.65 * f) * (1.0 - uBurst);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float size = (0.75 + 1.1 * aSeed.w) * (1.0 + sweep * 0.8 * uKindOn + push * 2.0);
    gl_PointSize = max(1.6, size * uPx / -mv.z);
  }
`;
const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vCol * a * vA, a * vA);
  }
`;

export function ParticleStage({ rig, onReady }: { rig: StageRig; onReady: () => void }) {
  const mount = useRef<HTMLDivElement | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch {
      ready.current();
      return;
    }
    const small = window.innerWidth < 820;
    const N = small ? 16000 : 38000;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x02060f, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02060f, 0.035);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
    const group = new THREE.Group();
    group.position.y = -MID_Y;
    scene.add(group);

    // ---- particle system
    const shapes: Record<ShapeId, Shape> = {
      body: { pos: new Float32Array(N * 3), col: new Float32Array(N * 3) },
      earth: buildEarth(N),
      helix: buildHelix(N),
    };
    const kind = new Float32Array(N);
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      seed.set([r * Math.cos(t), u, r * Math.sin(t), Math.random()], i * 4);
    }
    fallbackBody(N, shapes.body.pos, shapes.body.col, kind);

    const geo = new THREE.BufferGeometry();
    const aFrom = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const aTo = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const aColFrom = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const aColTo = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const aKind = new THREE.BufferAttribute(kind, 1);
    geo.setAttribute("position", aFrom); // three needs one; the shader reads aFrom/aTo
    geo.setAttribute("aFrom", aFrom);
    geo.setAttribute("aTo", aTo);
    geo.setAttribute("aColFrom", aColFrom);
    geo.setAttribute("aColTo", aColTo);
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    geo.setAttribute("aKind", aKind);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, MID_Y, 0), 40);

    const uniforms = {
      uMix: { value: 0 }, uSwirl: { value: 0 }, uForm: { value: 0 }, uBurst: { value: 0 }, uTime: { value: 0 },
      uPx: { value: 1 }, uOrgans: { value: 0.5 }, uAlert: { value: 0 }, uKindOn: { value: 1 }, uBright: { value: 1 },
      uMouse: { value: new THREE.Vector3(99, 99, 99) },
    };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    group.add(points);

    let seg = -1;
    const setSeg = (s: number) => {
      seg = s;
      const a = shapes[SHAPES[s]];
      const b = shapes[SHAPES[s + 1]];
      (aFrom.array as Float32Array).set(a.pos);
      (aTo.array as Float32Array).set(b.pos);
      (aColFrom.array as Float32Array).set(a.col);
      (aColTo.array as Float32Array).set(b.col);
      aFrom.needsUpdate = aTo.needsUpdate = aColFrom.needsUpdate = aColTo.needsUpdate = true;
    };
    setSeg(0);

    // ---- photon (the signal crossing to Earth and back)
    const photonGeo = new THREE.BufferGeometry();
    photonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
    const photonMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const photon = new THREE.Points(photonGeo, photonMat);
    photon.frustumCulled = false;
    group.add(photon);

    // ---- stars that stream past with scroll speed
    const SN = small ? 700 : 1500;
    const sp = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) sp.set([(Math.random() - 0.5) * 26, (Math.random() - 0.5) * 16, -Math.random() * 30], i * 3);
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const starUni = { uWarp: { value: 0 }, uPx: { value: 1 }, uStretch: { value: 0 } };
    const starMat = new THREE.ShaderMaterial({
      uniforms: starUni,
      vertexShader: /* glsl */ `
        uniform float uWarp, uPx, uStretch;
        varying float vA;
        void main() {
          vec3 p = position;
          p.z = mod(p.z + uWarp, 30.0) - 24.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = smoothstep(-24.0, -14.0, p.z) * (0.35 + 0.65 * fract(position.x * 12.7));
          gl_PointSize = max(1.2, (0.035 + uStretch * 0.05) * uPx / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(0.7, 0.85, 1.0) * a * vA, a * vA);
        }`,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);

    // ---- glow
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.75, 0.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const px = (h * dpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      uniforms.uPx.value = px * 0.011;
      starUni.uPx.value = px;
    };
    resize();
    window.addEventListener("resize", resize);

    // ---- pointer: parallax + parting the particles
    const mouse = new THREE.Vector2(0, 0);
    let hasMouse = false;
    const onMove = (e: PointerEvent) => {
      mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      hasMouse = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();

    // ---- the real body: sampled from the Blender twin
    let disposed = false;
    new GLTFLoader().load(
      "/models/twin.glb",
      (gltf) => {
        if (disposed) return;
        gltf.scene.updateMatrixWorld(true);
        const meshes = new Map<string, THREE.Mesh>();
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) meshes.set(o.name, o);
        });
        const body = shapes.body;
        const p = new THREE.Vector3();
        let i = 0;
        const fill = (name: string, count: number, col: [number, number, number], k: number) => {
          const mesh = meshes.get(name);
          if (!mesh) return 0;
          const sampler = new MeshSurfaceSampler(mesh).build();
          const end = Math.min(N, i + count);
          const start = i;
          for (; i < end; i++) {
            sampler.sample(p);
            p.applyMatrix4(mesh.matrixWorld);
            body.pos.set([p.x, p.y, p.z], i * 3);
            body.col.set(col, i * 3);
            kind[i] = k;
          }
          return i - start;
        };
        if (meshes.has("Body")) {
          for (const [name, share, col] of ORGANS) fill(name, Math.round(N * share), col, 1);
          for (const [name, share] of BONES) fill(name, Math.round(N * share), BONE_COL, 1);
          fill("Body", N - i, SKIN_COL, 0);
          aKind.needsUpdate = true;
          if (seg >= 0) setSeg(seg);
        }
        gltf.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => x.dispose());
            else m.dispose();
          }
        });
        ready.current();
      },
      undefined,
      () => {
        if (!disposed) ready.current();
      },
    );

    // ---- loop
    let raf = 0;
    let last = performance.now();
    let time = 0;
    let yaw = 0;
    let mx = 0;
    let my = 0;
    let warp = 0;
    const lerp = THREE.MathUtils.lerp;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;

      const mm = THREE.MathUtils.clamp(rig.m, 0, SHAPES.length - 1);
      const s = Math.min(SHAPES.length - 2, Math.floor(mm));
      if (s !== seg) setSeg(s);
      const t = mm - s;
      const from = SHAPES[s];
      const to = SHAPES[s + 1];
      uniforms.uMix.value = t;
      uniforms.uSwirl.value = from === to ? 0 : 1;
      uniforms.uKindOn.value = (from === "body" ? 1 - t : 0) + (to === "body" ? t : 0);
      uniforms.uForm.value = rig.form;
      uniforms.uBurst.value = rig.burst;
      uniforms.uTime.value = time;
      uniforms.uOrgans.value = rig.organs;
      uniforms.uAlert.value = rig.alert;
      uniforms.uBright.value = rig.bright;

      // subject: slow turn for bodies and the helix, still for the Earth–ship scene
      const spinning = uniforms.uKindOn.value + (from === "helix" ? 1 - t : 0) + (to === "helix" ? t : 0);
      yaw += dt * 0.22 * spinning;
      const still = 1 - Math.min(1, spinning);
      mx = lerp(mx, hasMouse ? mouse.x : 0, 0.06);
      my = lerp(my, hasMouse ? mouse.y : 0, 0.06);
      const aspect = camera.aspect;
      const side = aspect < 1 ? 0.12 : Math.min(1, (aspect - 0.8) / 0.9);
      if (yaw > Math.PI) yaw -= Math.PI * 2; // keep the turn short when the subject settles
      group.rotation.y = (yaw + rig.rotY) * (1 - still) + mx * 0.45 * (1 - still * 0.8);
      group.position.x = rig.x * side;
      const fit = aspect < 1.25 && (from === "earth" || to === "earth") ? 1 + (1.25 - aspect) * 1.6 * (from === "earth" ? 1 - t : t) : 1;
      camera.position.set(mx * 0.18, my * 0.12, rig.camZ * fit);
      camera.lookAt(0, 0, 0);

      // cursor in the subject's local space
      if (hasMouse) {
        ray.setFromCamera(mouse, camera);
        if (ray.ray.intersectPlane(plane, hit)) {
          group.worldToLocal(hit);
          uniforms.uMouse.value.copy(hit);
        }
      }

      // photon
      photonMat.opacity = rig.photonA;
      const ph = photonGeo.getAttribute("position") as THREE.BufferAttribute;
      ph.setXYZ(0, lerp(SHIP_X - 0.35, EARTH_X + 0.8, rig.photon), MID_Y, 0);
      ph.needsUpdate = true;

      // stars
      warp += dt * 0.25 + Math.min(4, Math.abs(rig.scrollV)) * dt * 9;
      starUni.uWarp.value = warp;
      starUni.uStretch.value = lerp(starUni.uStretch.value, Math.min(1, Math.abs(rig.scrollV)), 0.1);
      rig.scrollV *= 0.9;

      composer.render();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      geo.dispose();
      mat.dispose();
      photonGeo.dispose();
      photonMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [rig]);

  return <div ref={mount} className="absolute inset-0" aria-hidden="true" />;
}
