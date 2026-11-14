// Holographic body twin (Three.js).
// A procedural astronaut rendered with a fresnel/scan-line hologram shader. Organ systems
// are coloured by live HRP risk, the heart beats at the astronaut's heart rate, and the
// mission-progress slider morphs the body (fluid shift to the face, leg-volume loss,
// thinning bone). Drop a Blender export at /static/models/astronaut.glb to replace the
// procedural body; organs and interaction stay the same.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const STATUS = { nominal: new THREE.Color("#3a8de8"), watch: new THREE.Color("#e0901c"), act: new THREE.Color("#e05cc6") };
const CYAN = new THREE.Color("#5ce1e6");

const holoVert = `
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  vN = normalize(normalMatrix * normal);
  vec4 mv = viewMatrix * w;
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const holoFrag = `
uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uSweep;
varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float scan = smoothstep(0.82, 1.0, sin(vW.y * 210.0 - uTime * 2.4) * 0.5 + 0.5);
  float sweepPos = fract(uTime * 0.12) * 2.2 - 0.1;
  float sweep = exp(-pow((vW.y - sweepPos) * 9.0, 2.0)) * uSweep;
  float flick = 0.94 + 0.06 * sin(uTime * 37.0 + vW.y * 3.0);
  float a = (0.05 + fres * 0.85 + scan * 0.07 + sweep * 0.35) * uOpacity * flick;
  vec3 c = mix(uColor * 0.7, vec3(0.85, 1.0, 1.0), fres * 0.55 + sweep * 0.5);
  gl_FragColor = vec4(c, a);
}`;

function holoMaterial(color = CYAN, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: color.clone() }, uOpacity: { value: opacity }, uSweep: { value: 1 } },
    vertexShader: holoVert, fragmentShader: holoFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
}

function glowTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, "rgba(255,255,255,.55)");
  grd.addColorStop(0.6, "rgba(255,255,255,.12)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const REGION_LABEL = {
  head: "Vestibular", eyes: "Eyes · SANS", brain: "Brain · behaviour", heart: "Heart", lungs: "Lungs",
  gut: "Gut · nutrition", lymph: "Immune", spine: "Spine", hips: "Hips · bone", legs: "Legs · muscle",
  joints: "Joints · EVA", body: "Radiation",
};

export function createHologram(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  camera.position.set(0.0, 1.12, 4.1);
  const controls = opts.quad ? null : new OrbitControls(camera, canvas);
  if (controls) {
    controls.target.set(0, 0.98, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false; controls.minDistance = 2.2; controls.maxDistance = 6.5;
    controls.minPolarAngle = 0.9; controls.maxPolarAngle = 1.95;
    controls.autoRotate = opts.autoRotate !== false; controls.autoRotateSpeed = 0.55;
  }

  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); root.add(body);
  const mats = [];
  const parts = {};
  const mkPart = (name, geo, pos, scale = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = holoMaterial(); mats.push(m);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos); mesh.scale.set(...scale); mesh.rotation.set(...rot);
    mesh.userData.baseScale = new THREE.Vector3(...scale);
    body.add(mesh); parts[name] = mesh; return mesh;
  };
  const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 10, 24);
  mkPart("head", new THREE.SphereGeometry(0.112, 40, 32), [0, 1.645, 0], [1, 1.17, 1.06]);
  mkPart("neck", new THREE.CylinderGeometry(0.048, 0.056, 0.1, 24), [0, 1.5, -0.005]);
  mkPart("torso", cap(0.165, 0.34), [0, 1.235, 0], [1.28, 1, 0.74]);
  mkPart("pelvis", cap(0.145, 0.1), [0, 0.95, 0], [1.22, 1, 0.78]);
  for (const s of [-1, 1]) {
    mkPart(`uarm${s}`, cap(0.048, 0.25), [s * 0.268, 1.27, 0], [1, 1, 1], [0, 0, s * 0.11]);
    mkPart(`farm${s}`, cap(0.04, 0.24), [s * 0.3, 0.985, 0.02], [1, 1, 1], [0, 0, s * 0.05]);
    mkPart(`hand${s}`, new THREE.SphereGeometry(0.045, 20, 16), [s * 0.312, 0.805, 0.03], [0.8, 1.25, 0.6]);
    mkPart(`thigh${s}`, cap(0.074, 0.34), [s * 0.098, 0.655, 0], [1, 1, 1], [0, 0, s * -0.03]);
    mkPart(`shin${s}`, cap(0.054, 0.34), [s * 0.104, 0.265, -0.005]);
    mkPart(`foot${s}`, cap(0.04, 0.12), [s * 0.106, 0.03, 0.05], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
  }

  // wire ring "scanner" around the body
  const scanRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.0025, 6, 120),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  scanRing.rotation.x = Math.PI / 2; root.add(scanRing);

  // projector base
  const base = new THREE.Group(); root.add(base);
  for (const [r, o] of [[0.52, 0.55], [0.62, 0.3], [0.78, 0.16]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.004, r, 128),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.005; base.add(ring);
  }
  const ticks = new THREE.Group(); base.add(ticks);
  for (let i = 0; i < 72; i++) {
    const a = i / 72 * Math.PI * 2, len = i % 6 === 0 ? 0.05 : 0.022;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 0.66, 0, Math.sin(a) * 0.66), new THREE.Vector3(Math.cos(a) * (0.66 + len), 0, Math.sin(a) * (0.66 + len))]);
    ticks.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })));
  }
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 2.0, 64, 1, true),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0-vUv.y, 2.2)*0.11; a *= 0.85+0.15*sin(vUv.x*80.0+uTime); gl_FragColor=vec4(0.36,0.88,0.9,a);}",
    }));
  cone.position.y = 1.0; root.add(cone);

  // radiation particles (intensity follows the radiation risk)
  const NP = 420;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(NP * 3), pSpeed = new Float32Array(NP);
  for (let i = 0; i < NP; i++) {
    const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.55;
    pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = Math.random() * 2.1; pPos[i * 3 + 2] = Math.sin(a) * r; pSpeed[i] = 0.2 + Math.random() * 0.6;
  }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: CYAN, size: 0.012, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const particles = new THREE.Points(pGeo, pMat); root.add(particles);

  // ---- organs ---------------------------------------------------------------
  const glowTex = glowTexture();
  const organs = {};      // key -> {meshes:[], sprites:[], anchor:Vector3, band, score}
  const hitVols = [];
  const organGroup = new THREE.Group(); root.add(organGroup);
  const addOrgan = (key, geo, pos, scale = [1, 1, 1], spriteSize = 0.16) => {
    const mat = new THREE.MeshBasicMaterial({ color: STATUS.nominal, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); mesh.scale.set(...scale);
    mesh.userData.baseScale = new THREE.Vector3(...scale);
    organGroup.add(mesh);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: STATUS.nominal, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(...pos); sp.scale.set(spriteSize, spriteSize, 1); organGroup.add(sp);
    const o = organs[key] || (organs[key] = { meshes: [], sprites: [], anchor: new THREE.Vector3(...pos), band: "nominal", score: 0 });
    o.meshes.push(mesh); o.sprites.push(sp);
    return mesh;
  };
  const addHit = (key, pos, r) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(...pos); m.userData.region = key; organGroup.add(m); hitVols.push(m);
  };
  const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  addOrgan("brain", S(0.07, 24, 18), [0, 1.672, -0.005], [1, 0.82, 1.1], 0.2);
  for (const s of [-1, 1]) addOrgan("eyes", S(0.017), [s * 0.04, 1.645, 0.1], [1, 1, 1], 0.07);
  for (const s of [-1, 1]) addOrgan("head", S(0.016), [s * 0.104, 1.64, -0.005], [1, 1, 1], 0.06);
  const heart = addOrgan("heart", S(0.043, 24, 18), [0.045, 1.258, 0.055], [1, 1.15, 0.95], 0.2);
  for (const s of [-1, 1]) addOrgan("lungs", S(0.06, 20, 16), [s * 0.085, 1.29, 0.0], [1.05, 1.9, 0.95], 0.18);
  addOrgan("gut", S(0.1, 20, 16), [0, 1.02, 0.03], [1.05, 0.75, 0.6], 0.22);
  for (let i = 0; i < 17; i++) addOrgan("spine", new THREE.BoxGeometry(0.03, 0.022, 0.026), [0, 0.96 + i * 0.032, -0.085], [1, 1, 1], 0.05);
  for (const s of [-1, 1]) {
    addOrgan("hips", S(0.042), [s * 0.088, 0.875, 0.0], [1, 1, 1], 0.12);
    addOrgan("legs", new THREE.CylinderGeometry(0.016, 0.014, 0.36, 10), [s * 0.098, 0.655, 0.0], [1, 1, 1], 0.05);
    addOrgan("legs", new THREE.CylinderGeometry(0.013, 0.012, 0.34, 10), [s * 0.104, 0.265, 0.005], [1, 1, 1], 0.05);
    addOrgan("joints", S(0.026), [s * 0.1, 0.465, 0.02], [1, 1, 1], 0.08);
    addOrgan("joints", S(0.026), [s * 0.235, 1.39, 0.0], [1, 1, 1], 0.08);
    addOrgan("lymph", S(0.014), [s * 0.05, 1.5, 0.03], [1, 1, 1], 0.06);
    addOrgan("lymph", S(0.014), [s * 0.165, 1.33, 0.0], [1, 1, 1], 0.06);
    addOrgan("lymph", S(0.014), [s * 0.11, 0.86, 0.05], [1, 1, 1], 0.06);
  }
  organs.body = { meshes: [], sprites: [], anchor: new THREE.Vector3(0.36, 1.85, 0), band: "nominal", score: 0 };
  organs.legs.anchor.set(0.12, 0.5, 0); organs.spine.anchor.set(0, 1.2, -0.09); organs.lymph.anchor.set(0.05, 1.5, 0.03);
  organs.joints.anchor.set(0.1, 0.465, 0.02); organs.hips.anchor.set(0.09, 0.875, 0); organs.lungs.anchor.set(-0.085, 1.33, 0);
  organs.eyes.anchor.set(0.04, 1.645, 0.1); organs.head.anchor.set(-0.104, 1.64, 0);
  addHit("eyes", [0, 1.645, 0.11], 0.05); addHit("brain", [0, 1.73, 0], 0.07); addHit("head", [0, 1.62, -0.02], 0.12);
  addHit("heart", [0.05, 1.25, 0.1], 0.07); for (const s of [-1, 1]) addHit("lungs", [s * 0.1, 1.3, 0.05], 0.075);
  addHit("lymph", [0, 1.5, 0.05], 0.05); addHit("gut", [0, 1.02, 0.1], 0.1); addHit("hips", [0, 0.88, 0.06], 0.12);
  addHit("spine", [0, 1.2, -0.13], 0.1);
  for (const s of [-1, 1]) { addHit("legs", [s * 0.1, 0.65, 0.02], 0.085); addHit("legs", [s * 0.105, 0.27, 0.02], 0.07); addHit("joints", [s * 0.1, 0.465, 0.06], 0.05); }

  // ---- optional Blender model ------------------------------------------------
  const tryGLB = async () => {
    try {
      if (!opts.modelAvailable) return;
      new GLTFLoader().load("/static/models/astronaut.glb", gltf => {
        const g = gltf.scene;
        const box = new THREE.Box3().setFromObject(g);
        const h = box.max.y - box.min.y || 1;
        const s = 1.78 / h; g.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(g);
        g.position.y -= box2.min.y; g.position.x -= (box2.min.x + box2.max.x) / 2; g.position.z -= (box2.min.z + box2.max.z) / 2;
        g.traverse(o => { if (o.isMesh) { const m = holoMaterial(); mats.push(m); o.material = m; } });
        body.visible = false; root.add(g);
      });
    } catch (e) { /* procedural body stays */ }
  };
  if (opts.loadModel !== false) tryGLB();

  // ---- state -------------------------------------------------------------------
  let hr = 62, progress = 1, boneLoss = 0.06, focus = null, hovered = null, radScore = 0;
  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();

  function setOrgans(map) {
    for (const [k, v] of Object.entries(map || {})) {
      const o = organs[k]; if (!o) continue;
      o.band = v.band; o.score = v.score;
      const c = STATUS[v.band] || STATUS.nominal;
      o.meshes.forEach(m => { m.material.color.copy(c); m.material.opacity = v.band === "nominal" ? 0.55 : 0.9; });
      o.sprites.forEach(s => { s.material.color.copy(c); s.material.opacity = v.band === "nominal" ? 0.32 : 0.8; });
    }
    radScore = (map && map.body && map.body.score) || 0;
  }
  function setHeartRate(b) { if (b > 20 && b < 220) hr = b; }
  function setProgress(p, loss) { progress = p; if (loss !== undefined) boneLoss = loss; applyMorph(); }
  function setFocus(k) { focus = k; }
  function applyMorph() {
    const p = progress;
    const face = 1 + 0.075 * p, leg = 1 - 0.13 * p;
    if (parts.head) parts.head.scale.set(face, 1.17 * (1 + 0.02 * p), 1.06 * face);
    if (parts.neck) parts.neck.scale.set(1 + 0.05 * p, 1, 1 + 0.05 * p);
    for (const s of [-1, 1]) {
      const t = parts[`thigh${s}`], sh = parts[`shin${s}`];
      if (t) t.scale.set(leg, 1, leg); if (sh) sh.scale.set(leg * 0.98, 1, leg * 0.98);
    }
    if (parts.torso) parts.torso.scale.set(1.28, 1 + 0.025 * p, 0.74 * (1 + 0.03 * p));
    const boneOp = Math.max(0.25, 0.85 - 6 * boneLoss * p);
    ["hips", "legs", "spine"].forEach(k => organs[k] && organs[k].meshes.forEach(m => m.userData.boneOp = boneOp));
  }

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement || canvas); resize();

  function pick(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitVols, false)[0];
    return hit ? hit.object.userData.region : null;
  }
  let downAt = null;
  if (!opts.quad) {
    canvas.addEventListener("pointerdown", e => { downAt = [e.clientX, e.clientY]; });
    canvas.addEventListener("pointerup", e => {
      if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
      if (moved > 6) return;
      const k = pick(e); if (k && opts.onRegion) { focus = k; opts.onRegion(k); }
    });
    canvas.addEventListener("pointermove", e => { hovered = pick(e); canvas.style.cursor = hovered ? "pointer" : "grab"; });
    canvas.addEventListener("pointerleave", () => { hovered = null; });
  }

  // labels
  const labelsEl = opts.labelsEl;
  const labelNodes = {};
  if (labelsEl) {
    for (const k of Object.keys(organs)) {
      const d = document.createElement("div"); d.className = "olabel hide"; d.dataset.k = k;
      d.addEventListener("click", () => { focus = k; opts.onRegion && opts.onRegion(k); });
      labelsEl.appendChild(d); labelNodes[k] = d;
    }
  }
  const v3 = new THREE.Vector3();
  function updateLabels() {
    if (!labelsEl) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const [k, o] of Object.entries(organs)) {
      const n = labelNodes[k]; if (!n) continue;
      const show = o.band !== "nominal" || hovered === k || focus === k;
      if (!show) { n.classList.add("hide"); continue; }
      v3.copy(o.anchor); root.localToWorld(v3); v3.project(camera);
      if (v3.z > 1) { n.classList.add("hide"); continue; }
      n.classList.remove("hide");
      n.className = `olabel ${o.band}`;
      n.style.left = ((v3.x + 1) / 2 * w) + "px"; n.style.top = ((1 - v3.y) / 2 * h) + "px";
      n.textContent = `${REGION_LABEL[k] || k} ${Math.round(o.score)}`;
    }
  }

  // quad (Pepper's ghost) rendering
  const quadViews = [
    { up: [0, -1, 0], rot: 0, cell: [1, 2] },          // bottom → front view, upside down
    { up: [0, 1, 0], rot: Math.PI, cell: [1, 0] },     // top → back view
    { up: [1, 0, 0], rot: Math.PI / 2, cell: [0, 1] }, // left
    { up: [-1, 0, 0], rot: -Math.PI / 2, cell: [2, 1] } // right
  ];

  let raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    mats.forEach(m => { m.uniforms.uTime.value = t; });
    cone.material.uniforms.uTime.value = t;
    scanRing.position.y = 0.1 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 1.65;
    scanRing.material.opacity = 0.25 + 0.25 * Math.sin(t * 0.6 + 1.2) ** 2;
    ticks.rotation.y = t * 0.12;
    // heartbeat: lub-dub at the live heart rate
    const period = 60 / hr, ph = (t % period) / period;
    const beat = Math.exp(-Math.pow((ph - 0.08) * 22, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.28) * 22, 2));
    const hb = 1 + 0.22 * beat;
    heart.scale.set(heart.userData.baseScale.x * hb, heart.userData.baseScale.y * hb, heart.userData.baseScale.z * hb);
    organs.heart.sprites.forEach(s => s.scale.setScalar(0.2 * (1 + 0.5 * beat)));
    // pulse acting organs
    for (const [k, o] of Object.entries(organs)) {
      const act = o.band === "act", foc = focus === k || hovered === k;
      o.meshes.forEach(m => {
        const bo = m.userData.boneOp;
        let op = (o.band === "nominal" ? 0.55 : 0.9) * (bo !== undefined ? bo / 0.85 : 1);
        if (act) op *= 0.7 + 0.3 * Math.sin(t * 4.2) ** 2;
        if (foc) op = 1;
        m.material.opacity = op;
      });
      o.sprites.forEach(s => {
        let op = o.band === "nominal" ? 0.28 : 0.75;
        if (act) op *= 0.6 + 0.4 * Math.sin(t * 4.2) ** 2;
        if (foc) op = 1;
        s.material.opacity = op;
      });
    }
    // radiation particles
    const pa = pGeo.attributes.position.array;
    const speed = 0.25 + radScore / 40;
    for (let i = 0; i < NP; i++) { pa[i * 3 + 1] -= pSpeed[i] * 0.004 * speed; if (pa[i * 3 + 1] < 0) pa[i * 3 + 1] = 2.1; }
    pGeo.attributes.position.needsUpdate = true;
    pMat.opacity = 0.12 + Math.min(0.6, radScore / 110);
    pMat.color.copy(radScore >= 60 ? STATUS.act : radScore >= 30 ? STATUS.watch : CYAN);

    if (opts.quad) {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const L = Math.min(W, H), cell = L / 3, ox = (W - L) / 2, oy = (H - L) / 2;
      renderer.setScissorTest(true); renderer.setClearColor(0x000000, 1); renderer.clear();
      camera.aspect = 1; camera.updateProjectionMatrix();
      const dpr = 1;
      for (const v of quadViews) {
        const x = ox + v.cell[0] * cell, y = oy + (2 - v.cell[1]) * cell;
        renderer.setViewport(x * dpr, y * dpr, cell * dpr, cell * dpr); renderer.setScissor(x * dpr, y * dpr, cell * dpr, cell * dpr);
        root.rotation.y = t * 0.35 + v.rot;
        camera.position.set(0, 0.98, 3.6); camera.up.set(...v.up); camera.lookAt(0, 0.98, 0);
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
    } else {
      controls && controls.update();
      renderer.render(scene, camera);
      updateLabels();
    }
  }
  frame();
  applyMorph();

  return {
    setOrgans, setHeartRate, setProgress, setFocus,
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); },
    setAutoRotate(b) { if (controls) controls.autoRotate = b; },
  };
}
