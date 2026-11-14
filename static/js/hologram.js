// SENTINEL body twin (Three.js).
//
// Views:  hologram · realistic · x-ray        Wear:  cabin  ·  NASA Z2 exploration suit (EVA)
// - Anatomical human (Mixamo "X Bot" rig from the three.js examples) with a live idle animation.
// - X-ray skeleton (skull, spine, ribcage, pelvis, long bones) and organs bound to the rig's bones,
//   so they breathe and sway with the body; organs are coloured by live HRP risk.
// - NASA Z2 spacesuit (NASA 3D Resources) for EVA mode: realistic PBR, holographic or x-ray shell.
// - Heart beats at the astronaut's heart rate; the mission-day slider morphs the body
//   (fluid shift to the face, leg-volume and bone loss).
// - Cinematic fly-in, smooth focus on a tapped organ, orbit / pitch / zoom with damping.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const STATUS = { nominal: new THREE.Color("#3a8de8"), watch: new THREE.Color("#e0901c"), act: new THREE.Color("#e05cc6") };
const CYAN = new THREE.Color("#5ce1e6");
const BONE_WHITE = new THREE.Color("#cfe9ff");
const REGION_LABEL = {
  head: "Vestibular", eyes: "Eyes · SANS", brain: "Brain · behaviour", heart: "Heart", lungs: "Lungs",
  gut: "Gut · nutrition", lymph: "Immune", spine: "Spine", hips: "Hips · bone", legs: "Legs · muscle",
  joints: "Joints · EVA", body: "Radiation",
};
const BONES_KEYS = new Set(["spine", "hips", "legs", "joints"]);

const sharedU = { uTime: { value: 0 } };
let holoId = 0;
function holoMat(color = CYAN, opacity = 1, sweep = 1) {
  const m = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  m.toneMapped = false;
  m.userData.u = { uColor: { value: color.clone() }, uOpacity: { value: opacity }, uSweep: { value: sweep } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, sharedU, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uSweep; varying vec3 vWPos;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        vec3 vd = normalize(vViewPosition);
        float fres = pow(1.0 - abs(dot(normal, vd)), 2.3);
        float scan = smoothstep(0.86, 1.0, sin(vWPos.y * 230.0 - uTime * 2.2) * 0.5 + 0.5);
        float sp = fract(uTime * 0.11) * 2.3 - 0.15;
        float sweep = exp(-pow((vWPos.y - sp) * 8.0, 2.0)) * uSweep;
        float flick = 0.95 + 0.05 * sin(uTime * 31.0 + vWPos.y * 4.0);
        float a = (0.035 + fres * 0.9 + scan * 0.06 + sweep * 0.3) * uOpacity * flick;
        vec3 c = mix(uColor * 0.65, vec3(0.86, 1.0, 1.0), fres * 0.5 + sweep * 0.45);
        gl_FragColor = vec4(c, a);`);
  };
  const id = holoId++;
  m.customProgramCacheKey = () => "holo" + (id % 1);
  return m;
}
const glowMat = (c, o = 0.8) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"); const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.22, "rgba(255,255,255,.5)"); grd.addColorStop(0.6, "rgba(255,255,255,.1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ease = t => 1 - Math.pow(1 - t, 3);

export function createHologram(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NoToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
  const HOME = { pos: new THREE.Vector3(0.35, 1.2, 4.35), target: new THREE.Vector3(0, 0.97, 0) };
  camera.position.set(0, 0.45, 10.5);
  let userTouched = 0;
  const controls = opts.quad ? null : new OrbitControls(camera, canvas);
  if (controls) {
    controls.target.copy(HOME.target); controls.enableDamping = true; controls.dampingFactor = 0.07; controls.rotateSpeed = 0.8;
    controls.enablePan = false; controls.minDistance = 1.2; controls.maxDistance = 7.5; controls.minPolarAngle = 0.55; controls.maxPolarAngle = 2.05;
    controls.autoRotateSpeed = 0.45;
    controls.addEventListener("start", () => { userTouched = performance.now(); tween.active = false; });
  }

  // lights (realistic view)
  const hemi = new THREE.HemisphereLight(0xdfe9f3, 0x0a1016, 0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0); key.position.set(2.5, 4, 3.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe3ff, 0); rim.position.set(-3, 2.5, -3.5); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9db8d6, 0); fill.position.set(-2.5, 1, 2.5); scene.add(fill);

  const root = new THREE.Group(); scene.add(root);
  const glowTex = glowTexture();

  // bloom: needs an opaque background, so the stage gradient is drawn into the scene
  let composer = null, bloom = null;
  if (!opts.quad && opts.bloom !== false) {
    const bc = document.createElement("canvas"); bc.width = 64; bc.height = 256;
    const bg = bc.getContext("2d"); const gr = bg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#05080d"); gr.addColorStop(0.55, "#071019"); gr.addColorStop(1, "#0a1a22");
    bg.fillStyle = gr; bg.fillRect(0, 0, 64, 256);
    const bt = new THREE.CanvasTexture(bc); bt.colorSpace = THREE.SRGBColorSpace; scene.background = bt;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.42, 0.38, 0.32);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* projector base */
  const base = new THREE.Group(); root.add(base);
  for (const [r, o] of [[0.5, 0.55], [0.6, 0.3], [0.78, 0.15], [1.05, 0.07]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.004, r, 160), glowMat(CYAN, o)); ring.material.side = THREE.DoubleSide;
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.001; base.add(ring);
  }
  const ticks = new THREE.Group(); base.add(ticks);
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * Math.PI * 2, len = i % 8 === 0 ? 0.055 : 0.02;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 0.64, 0, Math.sin(a) * 0.64), new THREE.Vector3(Math.cos(a) * (0.64 + len), 0, Math.sin(a) * (0.64 + len))]);
    ticks.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, toneMapped: false })));
  }
  const coneMat = new THREE.ShaderMaterial({
    uniforms: { uTime: sharedU.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0-vUv.y, 2.4)*0.1; a *= 0.85+0.15*sin(vUv.x*90.0+uTime*0.7); gl_FragColor=vec4(0.36,0.88,0.9,a);}",
  });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.62, 2.1, 72, 1, true), coneMat); cone.position.y = 1.05; root.add(cone);
  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.002, 6, 160), glowMat(CYAN, 0.5)); scanRing.rotation.x = Math.PI / 2; root.add(scanRing);

  const NP = 520, pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(NP * 3), pSpeed = new Float32Array(NP);
  for (let i = 0; i < NP; i++) { const a = Math.random() * 6.283, r = 0.28 + Math.random() * 0.6; pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = Math.random() * 2.2; pPos[i * 3 + 2] = Math.sin(a) * r; pSpeed[i] = 0.2 + Math.random() * 0.7; }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: CYAN, size: 0.011, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  root.add(new THREE.Points(pGeo, pMat));

  /* state */
  let mode = { view: opts.view || "hologram", suit: false };
  let hr = 62, progress = 1, boneLoss = 0.06, focus = null, hovered = null, radScore = 0, organMap = {};
  let bodyRoot = null, mixer = null, suit = null;
  const bodyHolo = holoMat(CYAN, 0.75), bodyX = holoMat(new THREE.Color("#8fd8ff"), 0.3, 0.3), bodyInSuit = holoMat(CYAN, 0.25, 0.2);
  const bodyReal = new THREE.MeshPhysicalMaterial({ color: 0x24427a, roughness: 0.7, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color(0x8fb4ff) });
  const bodyRealJoint = new THREE.MeshPhysicalMaterial({ color: 0x131f38, roughness: 0.8 });
  const boneMat = glowMat(BONE_WHITE, 0.35);
  const attach = [];
  const organs = {};
  const hitVols = [];
  const parts = {};
  let heart = null;
  const clock = new THREE.Clock();
  const tween = { active: false };
  function flyTo(pos, target, dur = 1.4) {
    if (!controls) return;
    Object.assign(tween, { active: true, t0: clock.getElapsedTime(), dur, p0: camera.position.clone(), p1: pos.clone(), c0: controls.target.clone(), c1: target.clone() });
  }

  /* load the anatomical body */
  const loader = new GLTFLoader();
  const bonesBy = {};
  const B = n => bonesBy[n.toLowerCase()];
  loader.load("/static/models/body.glb", gltf => {
    bodyRoot = gltf.scene;
    bodyRoot.traverse(o => {
      if (o.isSkinnedMesh || o.isMesh) { o.frustumCulled = false; o.userData.realMat = /joint/i.test(o.material?.name || "") ? bodyRealJoint : bodyReal; }
      if (o.isBone) bonesBy[o.name.replace(/[^a-z0-9]/gi, "").replace(/^mixamorig/i, "").toLowerCase()] = o;
    });
    const box = new THREE.Box3().setFromObject(bodyRoot);
    const s = 1.78 / (box.max.y - box.min.y); bodyRoot.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(bodyRoot);
    bodyRoot.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    root.add(bodyRoot);
    mixer = new THREE.AnimationMixer(bodyRoot);
    const idle = gltf.animations.find(a => /idle/i.test(a.name)) || gltf.animations[0];
    if (idle) mixer.clipAction(idle).play();
    mixer.update(0.01); root.updateMatrixWorld(true);
    try { buildAnatomy(); } catch (e) { console.warn("anatomy", e); }
    applyMode();
    if (opts.onReady) opts.onReady();
  });

  const W = o => { const v = new THREE.Vector3(); o.getWorldPosition(v); return root.worldToLocal(v); };
  function groupFor(bone) {
    let a = attach.find(x => x.bone === bone);
    if (a) return a.group;
    const g = new THREE.Group(); g.matrixAutoUpdate = false;
    a = { group: g, bone, setupInv: new THREE.Matrix4().copy(bone.matrixWorld).invert() };
    root.add(g); attach.push(a); return g;
  }
  const tube = (pts, r, mat, bone) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 6), r, 8, false), mat);
    m.userData.isBone = mat === boneMat; groupFor(bone).add(m); return m;
  };
  const blob = (pos, r, scale, mat, bone) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), mat || glowMat(STATUS.nominal)); m.position.copy(pos); if (scale) m.scale.set(...scale);
    m.userData.isBone = mat === boneMat; groupFor(bone).add(m); return m;
  };
  function organ(key, mesh, spriteSize = 0.16, anchor = true) {
    mesh.material = glowMat(STATUS.nominal, 0.6); mesh.userData.baseScale = mesh.scale.clone(); mesh.userData.isBone = false;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: STATUS.nominal, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.position.copy(mesh.position); sp.scale.set(spriteSize, spriteSize, 1); mesh.parent.add(sp);
    const o = organs[key] || (organs[key] = { meshes: [], sprites: [], anchorObj: null, band: "nominal", score: 0 });
    o.meshes.push(mesh); o.sprites.push(sp); if (anchor && !o.anchorObj) o.anchorObj = mesh;
    return mesh;
  }
  function hit(key, pos, r, bone) {
    if (!bone) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.position.copy(pos); m.userData.region = key; m.userData.hit = true; groupFor(bone).add(m); hitVols.push(m);
  }

  function buildAnatomy() {
    const hips = B("hips"), sp0 = B("spine"), sp1 = B("spine1"), sp2 = B("spine2"), neck = B("neck"), head = B("head");
    if (!hips || !head || !sp0 || !sp1 || !sp2 || !neck) return;
    const P = {}; for (const [k, b] of Object.entries(bonesBy)) P[k] = W(b);
    const top = new THREE.Box3().setFromObject(bodyRoot).max.y;
    const shoulderW = P.leftarm && P.rightarm ? P.leftarm.distanceTo(P.rightarm) : 0.36;
    const headC = new THREE.Vector3(P.head.x, (P.head.y + top) / 2 + 0.005, P.head.z + 0.01);
    const skullR = (top - P.head.y) / 2 * 0.86;
    blob(headC, skullR, [0.84, 1.0, 1.0], boneMat, head);
    blob(headC.clone().add(new THREE.Vector3(0, -skullR * 0.74, skullR * 0.42)), skullR * 0.42, [1.1, 0.5, 0.9], boneMat, head);
    // spine
    const spinePts = [P.hips, P.spine, P.spine1, P.spine2, P.neck, P.head].map((p, i) => p.clone().add(new THREE.Vector3(0, i === 0 ? 0.06 : 0, -0.045 + (i === 3 ? -0.012 : 0))));
    const spineCurve = new THREE.CatmullRomCurve3(spinePts);
    const vbones = [sp0, sp0, sp1, sp1, sp2, sp2, neck];
    for (let i = 0; i < 24; i++) {
      const t = i / 23, p = spineCurve.getPoint(t), bone = vbones[Math.min(vbones.length - 1, Math.floor(t * vbones.length))];
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.012 + 0.008 * (1 - t), 0.012 + 0.008 * (1 - t), 0.016, 10)); v.position.copy(p); groupFor(bone).add(v);
      organ("spine", v, 0.045, i === 12);
    }
    // ribcage
    const rib0 = P.spine1.clone(), rib1 = P.spine2.clone().add(new THREE.Vector3(0, 0.12, 0));
    for (let i = 0; i < 12; i++) {
      const t = i / 11, y = THREE.MathUtils.lerp(rib1.y, rib0.y - 0.02, t), cz = THREE.MathUtils.lerp(rib1.z, rib0.z, t);
      const rx = shoulderW * (0.2 + 0.17 * Math.sin(Math.min(1, t * 1.25 + 0.15) * Math.PI * 0.62));
      const rz = 0.085 + 0.03 * Math.sin(t * Math.PI * 0.8);
      for (const s of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 10; k++) {
          const a = -Math.PI / 2 + k / 10 * Math.PI * (i > 9 ? 0.72 : 0.94);
          pts.push(new THREE.Vector3(s * Math.cos(a) * rx, y - 0.045 * Math.sin(k / 10 * Math.PI * 0.5), cz + Math.sin(a) * rz - 0.01));
        }
        tube(pts, 0.0055, boneMat, t < 0.5 ? sp2 : sp1);
      }
    }
    tube([new THREE.Vector3(P.spine2.x, rib1.y - 0.01, P.spine2.z + 0.095), new THREE.Vector3(P.spine1.x, rib0.y + 0.03, P.spine1.z + 0.1)], 0.011, boneMat, sp2);
    for (const s of ["left", "right"]) if (P[s + "arm"]) tube([new THREE.Vector3(0, rib1.y + 0.005, P.spine2.z + 0.08), (P[s + "shoulder"] ? P[s + "shoulder"].clone().lerp(P[s + "arm"], 0.6) : P[s + "arm"].clone()).add(new THREE.Vector3(0, 0.01, 0.02))], 0.007, boneMat, sp2);
    // pelvis
    const pel = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.016, 10, 40, Math.PI * 1.55), boneMat); pel.userData.isBone = true;
    pel.position.copy(P.hips).add(new THREE.Vector3(0, -0.02, 0)); pel.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI * 1.22); groupFor(hips).add(pel);
    for (const s of [-1, 1]) organ("hips", blob(P.hips.clone().add(new THREE.Vector3(s * 0.085, 0.035, -0.005)), 0.06, [0.75, 0.9, 0.35], null, hips), 0.14, s === 1);
    // limbs
    const limb = (a, b, r, keyName, bone) => {
      if (!P[a] || !P[b] || !B(bone)) return;
      const m = tube([P[a], P[a].clone().lerp(P[b], 0.5), P[b]], r, boneMat, B(bone));
      if (keyName) organ(keyName, m, 0.05, false);
    };
    for (const s of ["left", "right"]) {
      limb(s + "arm", s + "forearm", 0.011, null, s + "arm");
      limb(s + "forearm", s + "hand", 0.009, null, s + "forearm");
      limb(s + "upleg", s + "leg", 0.016, "legs", s + "upleg");
      limb(s + "leg", s + "foot", 0.013, "legs", s + "leg");
      if (P[s + "leg"] && B(s + "leg")) organ("joints", blob(P[s + "leg"].clone().add(new THREE.Vector3(0, 0, 0.02)), 0.026, null, null, B(s + "leg")), 0.08, s === "left");
      if (P[s + "arm"] && B(s + "arm")) organ("joints", blob(P[s + "arm"], 0.024, null, null, B(s + "arm")), 0.08, false);
    }
    if (organs.legs) organs.legs.anchorObj = organs.legs.meshes[0];
    // organs
    const chest = P.spine2.clone(), belly = P.spine.clone();
    organ("brain", blob(headC.clone().add(new THREE.Vector3(0, skullR * 0.12, -0.004)), skullR * 0.8, [0.85, 0.72, 1.0], null, head), 0.2);
    for (const s of [-1, 1]) organ("eyes", blob(headC.clone().add(new THREE.Vector3(s * skullR * 0.36, -skullR * 0.08, skullR * 0.86)), 0.015, null, null, head), 0.07, s === 1);
    for (const s of [-1, 1]) organ("head", blob(headC.clone().add(new THREE.Vector3(s * skullR * 0.9, -skullR * 0.12, -0.005)), 0.014, null, null, head), 0.06, s === -1);
    heart = organ("heart", blob(chest.clone().add(new THREE.Vector3(0.028, -0.02, 0.05)), 0.042, [1, 1.18, 0.95], null, sp2), 0.2);
    for (const s of [-1, 1]) organ("lungs", blob(chest.clone().add(new THREE.Vector3(s * shoulderW * 0.2, 0.01, 0)), 0.06, [1.0, 1.85, 0.95], null, sp2), 0.18, s === -1);
    organ("gut", blob(belly.clone().add(new THREE.Vector3(0, -0.03, 0.045)), 0.085, [1.15, 0.85, 0.65], null, sp0), 0.22);
    [[neck, P.neck.clone().add(new THREE.Vector3(0.04, -0.01, 0.03))], [neck, P.neck.clone().add(new THREE.Vector3(-0.04, -0.01, 0.03))],
      [sp2, P.spine2.clone().add(new THREE.Vector3(shoulderW * 0.36, 0.06, 0))], [sp2, P.spine2.clone().add(new THREE.Vector3(-shoulderW * 0.36, 0.06, 0))],
      [hips, P.hips.clone().add(new THREE.Vector3(0.09, -0.04, 0.06))], [hips, P.hips.clone().add(new THREE.Vector3(-0.09, -0.04, 0.06))]]
      .forEach(([b, p], i) => organ("lymph", blob(p, 0.013, null, null, b), 0.06, i === 0));
    organs.body = { meshes: [], sprites: [], anchorObj: null, anchorPos: new THREE.Vector3(0.34, 1.9, 0), band: "nominal", score: 0 };
    // tap targets
    hit("eyes", headC.clone().add(new THREE.Vector3(0, -skullR * 0.08, skullR)), 0.05, head);
    hit("brain", headC.clone().add(new THREE.Vector3(0, skullR * 0.6, 0)), 0.07, head);
    hit("head", headC, skullR * 1.1, head);
    hit("heart", chest.clone().add(new THREE.Vector3(0.04, -0.02, 0.1)), 0.07, sp2);
    for (const s of [-1, 1]) hit("lungs", chest.clone().add(new THREE.Vector3(s * shoulderW * 0.22, 0.03, 0.06)), 0.075, sp2);
    hit("lymph", P.neck.clone().add(new THREE.Vector3(0, 0, 0.05)), 0.05, neck);
    hit("gut", belly.clone().add(new THREE.Vector3(0, -0.03, 0.1)), 0.1, sp0);
    hit("hips", P.hips.clone().add(new THREE.Vector3(0, -0.02, 0.06)), 0.12, hips);
    hit("spine", P.spine1.clone().add(new THREE.Vector3(0, 0, -0.13)), 0.1, sp1);
    for (const s of ["left", "right"]) {
      if (P[s + "upleg"] && P[s + "leg"]) hit("legs", P[s + "upleg"].clone().lerp(P[s + "leg"], 0.5).add(new THREE.Vector3(0, 0, 0.03)), 0.085, B(s + "upleg"));
      if (P[s + "leg"] && P[s + "foot"]) hit("legs", P[s + "leg"].clone().lerp(P[s + "foot"], 0.5), 0.07, B(s + "leg"));
      if (P[s + "leg"]) hit("joints", P[s + "leg"].clone().add(new THREE.Vector3(0, 0, 0.06)), 0.05, B(s + "leg"));
    }
    Object.assign(parts, { head, legs: [B("leftupleg"), B("rightupleg"), B("leftleg"), B("rightleg")].filter(Boolean) });
    setOrgans(organMap);
  }

  /* NASA Z2 suit */
  function loadSuit() {
    if (suit) return;
    suit = "loading";
    loader.load("/static/models/z2.glb", gltf => {
      const g = gltf.scene;
      const box = new THREE.Box3().setFromObject(g); g.scale.setScalar(1.93 / (box.max.y - box.min.y));
      const b2 = new THREE.Box3().setFromObject(g);
      g.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2 + 0.07);
      g.traverse(o => { if (o.isMesh) { if (o.material && 'specularIntensity' in o.material) { o.material.specularIntensity = 0.35; o.material.specularIntensityMap = null; o.material.specularColorMap = null; o.material.needsUpdate = true; } o.userData.real = o.material; o.userData.holo = holoMat(CYAN, 0.95); o.userData.xray = holoMat(new THREE.Color("#9fe7ff"), 0.2, 0.2); } });
      suit = g; root.add(g); applyMode();
      if (opts.onSuit) opts.onSuit();
    }, undefined, () => { suit = null; });
  }

  function applyMode() {
    const v = mode.view;
    if (mode.suit) loadSuit();
    const suitOn = mode.suit && suit && suit !== "loading";
    if (bodyRoot) {
      bodyRoot.visible = !(suitOn && v === "realistic");
      bodyRoot.traverse(o => { if (o.isMesh || o.isSkinnedMesh) o.material = v === "realistic" ? o.userData.realMat : v === "xray" ? bodyX : (suitOn ? bodyInSuit : bodyHolo); });
    }
    if (suit && suit !== "loading") {
      suit.visible = !!suitOn;
      if (suitOn) suit.traverse(o => { if (o.isMesh) o.material = v === "realistic" ? o.userData.real : v === "xray" ? o.userData.xray : o.userData.holo; });
    }
    boneMat.opacity = v === "xray" ? 0.8 : 0.16;
    attach.forEach(a => a.group.children.forEach(c => { if (c.userData.isBone) c.visible = v !== "realistic"; }));
    const showOrgans = v !== "realistic";
    for (const o of Object.values(organs)) { o.meshes.forEach(m => m.visible = showOrgans); o.sprites.forEach(s => s.visible = showOrgans); }
    cone.visible = v !== "realistic"; scanRing.visible = v !== "realistic";
    const L = v === "realistic" ? 1 : 0;
    renderer.toneMapping = L ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    if (bloom) { bloom.strength = v === "realistic" ? 0.08 : v === "xray" ? 0.5 : 0.42; bloom.threshold = v === "realistic" ? 0.85 : 0.32; }
    hemi.intensity = 1.25 * L; key.intensity = 2.2 * L; rim.intensity = 1.1 * L; fill.intensity = 0.7 * L;
    setOrgans(organMap);
  }

  function setOrgans(map) {
    organMap = map || {};
    const v = mode.view;
    for (const [k, val] of Object.entries(organMap)) {
      const o = organs[k]; if (!o) continue;
      o.band = val.band; o.score = val.score; o.driver = val.driver; o.risk = val.risk;
      const c = STATUS[val.band] || STATUS.nominal, isBone = BONES_KEYS.has(k);
      o.meshes.forEach(m => {
        if (isBone && val.band === "nominal") { m.material.color.copy(BONE_WHITE); m.userData.baseOp = v === "xray" ? 0.85 : 0.22; }
        else { m.material.color.copy(c); m.userData.baseOp = val.band === "nominal" ? (v === "xray" ? 0.75 : 0.45) : 0.95; }
      });
      o.sprites.forEach(s => { s.material.color.copy(c); s.userData.baseOp = val.band === "nominal" ? (isBone ? 0 : 0.25) : 0.85; });
    }
    radScore = (organMap.body && organMap.body.score) || 0;
  }
  function setHeartRate(b) { if (b > 20 && b < 220) hr = b; }
  function setProgress(p, loss) { progress = p; if (loss !== undefined) boneLoss = loss; }
  function setFocus(k) {
    focus = k;
    if (!controls) return;
    if (!k) { flyTo(HOME.pos, HOME.target, 1.2); return; }
    const o = organs[k]; const obj = o && (o.anchorObj || o.meshes[0]);
    const p = new THREE.Vector3();
    if (obj) obj.getWorldPosition(p); else if (o && o.anchorPos) { p.copy(o.anchorPos); root.localToWorld(p); } else return;
    const dir = camera.position.clone().sub(controls.target).normalize();
    const dist = ["legs", "joints", "hips", "body"].includes(k) ? 2.4 : 1.7;
    flyTo(p.clone().add(dir.multiplyScalar(dist)), p, 1.3);
  }
  function setMode(m) { mode = { ...mode, ...m }; applyMode(); }

  /* picking */
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects(hitVols, false)[0];
    return h ? h.object.userData.region : null;
  }
  let downAt = null;
  if (!opts.quad) {
    canvas.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointerup", e => {
      if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
      if (moved > 6) return; const k = pick(e); if (k && opts.onRegion) { setFocus(k); opts.onRegion(k); }
    });
    canvas.addEventListener("pointermove", e => { hovered = pick(e); canvas.style.cursor = hovered ? "pointer" : "grab"; });
    canvas.addEventListener("pointerleave", () => { hovered = null; });
  }

  /* callouts with leader lines */
  const labelsEl = opts.labelsEl, labelNodes = {};
  let svgLines = null;
  if (labelsEl) {
    svgLines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgLines.setAttribute("class", "callout-lines"); labelsEl.appendChild(svgLines);
    for (const k of Object.keys(REGION_LABEL)) {
      const d = document.createElement("div"); d.className = "callout hide";
      d.innerHTML = `<div class="c-name"></div><div class="c-drv"></div>`;
      d.addEventListener("click", () => { setFocus(k); opts.onRegion && opts.onRegion(k); });
      labelsEl.appendChild(d); labelNodes[k] = d;
    }
  }
  const v3 = new THREE.Vector3(), c3 = new THREE.Vector3();
  function updateLabels() {
    if (!labelsEl) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    c3.set(0, 1, 0); root.localToWorld(c3); c3.project(camera);
    const cx = (c3.x + 1) / 2 * w;
    const colOff = Math.min(w * 0.17, 150);
    const items = [];
    for (const [k, n] of Object.entries(labelNodes)) {
      const o = organs[k];
      const ok = o && (o.anchorObj || o.anchorPos);
      const show = ok && (mode.view === "realistic" ? o.band === "act" : (o.band !== "nominal" || hovered === k || focus === k));
      if (!show) { n.classList.add("hide"); continue; }
      if (o.anchorObj) o.anchorObj.getWorldPosition(v3); else { v3.copy(o.anchorPos); root.localToWorld(v3); }
      v3.project(camera);
      if (v3.z > 1) { n.classList.add("hide"); continue; }
      const px = (v3.x + 1) / 2 * w, py = (1 - v3.y) / 2 * h;
      items.push({ k, n, o, px, py, side: 1 });
    }
    let paths = "";
    for (const side of [-1, 1]) {
      const col = items.filter(i => i.side === side).sort((a, b) => a.py - b.py);
      let yPrev = 118;
      for (const it of col) {
        const ly = Math.min(h - 70, Math.max(yPrev + 44, it.py, 162));
        yPrev = ly;
        const lx = cx + side * colOff;
        const n = it.n;
        n.className = `callout ${it.o.band} ${side < 0 ? "left" : "right"}`;
        n.style.left = lx + "px"; n.style.top = ly + "px";
        n.firstChild.textContent = `${REGION_LABEL[it.k] || it.k} · ${Math.round(it.o.score)}`;
        n.lastChild.textContent = it.o.driver || it.o.risk || "";
        const col2 = it.o.band === "act" ? "#f19ae0" : it.o.band === "watch" ? "#f0b660" : "#8fbdf2";
        const ex = lx - side * 16;
        paths += `<path d="M${it.px.toFixed(1)},${it.py.toFixed(1)} L${ex.toFixed(1)},${ly.toFixed(1)} L${lx.toFixed(1)},${ly.toFixed(1)}" stroke="${col2}" />` +
          `<circle cx="${it.px.toFixed(1)}" cy="${it.py.toFixed(1)}" r="2.6" fill="${col2}" />`;
      }
    }
    svgLines.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svgLines.innerHTML = paths;
  }

  function resize() {
    const el = canvas.parentElement || canvas;
    const w = canvas.clientWidth || el.clientWidth, h = canvas.clientHeight || el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); composer.setSize(w, h); }
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement || canvas); resize();

  const quadViews = [
    { up: [0, -1, 0], rot: 0, cell: [1, 2] }, { up: [0, 1, 0], rot: Math.PI, cell: [1, 0] },
    { up: [1, 0, 0], rot: Math.PI / 2, cell: [0, 1] }, { up: [-1, 0, 0], rot: -Math.PI / 2, cell: [2, 1] },
  ];
  const tmpM = new THREE.Matrix4(), rootInv = new THREE.Matrix4();
  const syncAttach = () => {
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    for (const a of attach) { a.group.matrix.multiplyMatrices(rootInv, tmpM.multiplyMatrices(a.bone.matrixWorld, a.setupInv)); a.group.matrixWorldNeedsUpdate = true; }
  };

  flyTo(HOME.pos, HOME.target, 2.8);

  let raf = 0, alive = true, last = 0;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime(), dt = Math.min(0.05, t - last); last = t;
    sharedU.uTime.value = t;
    if (mixer) mixer.update(dt);
    if (parts.head) {
      const p = progress, face = 1 + 0.07 * p, leg = 1 - 0.12 * p;
      parts.head.scale.set(face, 1 + 0.015 * p, face);
      parts.legs.forEach(b => b.scale.set(leg, 1, leg));
    }
    scanRing.position.y = 0.08 + (Math.sin(t * 0.55) * 0.5 + 0.5) * 1.72;
    scanRing.material.opacity = 0.2 + 0.3 * Math.sin(t * 0.55 + 1.2) ** 2;
    ticks.rotation.y = t * 0.1;
    const period = 60 / hr, ph = (t % period) / period;
    const beat = Math.exp(-Math.pow((ph - 0.08) * 22, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.28) * 22, 2));
    if (heart) heart.scale.copy(heart.userData.baseScale).multiplyScalar(1 + 0.22 * beat);
    if (organs.heart) organs.heart.sprites.forEach(s => s.scale.setScalar(0.2 * (1 + 0.5 * beat)));
    const boneFade = Math.max(0.3, 1 - 5 * boneLoss * progress);
    for (const [k, o] of Object.entries(organs)) {
      const act = o.band === "act", foc = focus === k || hovered === k, isBone = k === "spine" || k === "hips" || k === "legs";
      o.meshes.forEach(m => {
        let op = m.userData.baseOp ?? 0.5;
        if (isBone) op *= boneFade;
        if (act) op *= 0.65 + 0.35 * Math.sin(t * 4.2) ** 2;
        if (foc) op = 1;
        m.material.opacity = op;
      });
      o.sprites.forEach(s => {
        let op = s.userData.baseOp ?? 0.3;
        if (act) op *= 0.55 + 0.45 * Math.sin(t * 4.2) ** 2;
        if (foc) op = Math.max(op, 0.9);
        s.material.opacity = op;
      });
    }
    const pa = pGeo.attributes.position.array, speed = 0.25 + radScore / 40;
    for (let i = 0; i < NP; i++) { pa[i * 3 + 1] -= pSpeed[i] * 0.004 * speed; if (pa[i * 3 + 1] < 0) pa[i * 3 + 1] = 2.2; }
    pGeo.attributes.position.needsUpdate = true;
    pMat.opacity = mode.view === "realistic" ? 0.06 : 0.1 + Math.min(0.6, radScore / 110);
    pMat.color.copy(radScore >= 60 ? STATUS.act : radScore >= 30 ? STATUS.watch : CYAN);

    if (opts.quad) {
      const Wd = canvas.clientWidth, Hd = canvas.clientHeight, L = Math.min(Wd, Hd), cell = L / 3, ox = (Wd - L) / 2, oy = (Hd - L) / 2;
      renderer.setScissorTest(true); renderer.setClearColor(0x000000, 1); renderer.clear();
      camera.aspect = 1; camera.updateProjectionMatrix();
      for (const v of quadViews) {
        const x = ox + v.cell[0] * cell, y = oy + (2 - v.cell[1]) * cell;
        renderer.setViewport(x, y, cell, cell); renderer.setScissor(x, y, cell, cell);
        root.rotation.y = t * 0.35 + v.rot; syncAttach();
        camera.position.set(0, 0.98, 3.7); camera.up.set(...v.up); camera.lookAt(0, 0.98, 0);
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
      return;
    }
    syncAttach();
    if (tween.active && controls) {
      const k = Math.min(1, (t - tween.t0) / tween.dur), e = ease(k);
      camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.c0, tween.c1, e);
      if (k >= 1) tween.active = false;
    }
    if (controls) { controls.autoRotate = (opts.autoRotate !== false) && !focus && !tween.active && performance.now() - userTouched > 6000; controls.update(); }
    if (composer) composer.render(); else renderer.render(scene, camera);
    updateLabels();
  }
  frame();

  return {
    setOrgans, setHeartRate, setProgress, setFocus, setMode,
    getMode: () => ({ ...mode }),
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); },
    setAutoRotate(b) { if (controls) controls.autoRotate = b; },
  };
}
