/**
 * Spaceflight Emergency visualization engine.
 *
 * Reuses the twin's existing meshes: only the structures a scenario affects get
 * a severity-coloured material, and every effect object lives in one group
 * that is removed on reset, so the original anatomy is restored exactly
 * without reloading the model.
 */
import * as THREE from "three";
import type { AnatomyMeshEntry, BuiltAnatomyTwin } from "./anatomyBuilder.ts";
import {
  severityHex,
  type EmergencyScenario,
  type FlowMode,
  type MeshPoint,
} from "../data/emergencyScenarios.ts";
import { createOrganHoloMaterial } from "./shaders.ts";

export interface EmergencyVisualState {
  scenario: EmergencyScenario | null;
  /** Target severity 0..4 (already 0 in Normal view). */
  level: number;
  /** Scenario picked but not activated: highlight affected structures only. */
  preview: boolean;
  view: "emergency" | "normal" | "compare";
  paused: boolean;
}

const PULSE_HZ = [0.35, 0.55, 0.9, 1.35, 2.3];
const PULSE_AMT = [0.18, 0.16, 0.24, 0.34, 0.62];
const ACCENT_HOT = new THREE.Color("#FF8C42");
const URINE = new THREE.Color("#FFD45C");
const VENOUS = new THREE.Color("#008CFF");
const NEURAL = new THREE.Color("#8A5CFF");
const O2 = new THREE.Color("#7FF6FF");
const CO2 = new THREE.Color("#FFB020");
const IMMUNE = new THREE.Color("#8A5CFF");
const MAGENTA = new THREE.Color("#FF3DAD");
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

function matches(name: string, patterns: string[]): boolean {
  return patterns.some((p) => name === p || name.startsWith(p));
}

function createEmergencyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#00E5FF") },
      uAccent: { value: new THREE.Color("#8A5CFF") },
      uOpacity: { value: 0.95 },
      uIntensity: { value: 1.0 },
      uPulseHz: { value: 0.5 },
      uPulseAmt: { value: 0.2 },
      uPorosity: { value: 0 },
      uShrink: { value: 0 },
      uHotspot: { value: new THREE.Vector3(0, -100, 0) },
      uHotRadius: { value: 0.03 },
      uHotAmt: { value: 0 },
      uDim: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uShrink;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec3 vLocal;
      void main() {
        vec3 p = position - normal * uShrink;
        vLocal = position;
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPos = viewMatrix * worldPos;
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uAccent;
      uniform float uOpacity;
      uniform float uIntensity;
      uniform float uPulseHz;
      uniform float uPulseAmt;
      uniform float uPorosity;
      uniform vec3 uHotspot;
      uniform float uHotRadius;
      uniform float uHotAmt;
      uniform float uDim;
      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec3 vLocal;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        // Bone lattice thinning: discard a growing share of micro-cells.
        if (uPorosity > 0.001) {
          float h = hash(floor(vLocal * 320.0));
          if (h < uPorosity) discard;
        }
        float ndotv = abs(dot(normalize(vNormalView), normalize(vViewDir)));
        float rim = pow(1.0 - clamp(ndotv, 0.0, 1.0), 1.7);
        float core = 0.32 + 0.26 * ndotv;
        float pulse = 1.0 + uPulseAmt * (0.5 + 0.5 * sin(uTime * 6.2831853 * uPulseHz));
        vec3 col = mix(uColor, uAccent, rim * 0.3) * (rim * 1.3 + core) * uIntensity * pulse;
        // Localized injury zone: deep crimson, darker than the surrounding tissue.
        float hot = uHotAmt * (1.0 - smoothstep(uHotRadius * 0.35, uHotRadius, distance(vWorldPos, uHotspot)));
        vec3 injured = vec3(0.62, 0.02, 0.10) * (0.75 + 0.25 * sin(uTime * 4.0));
        col = mix(col, injured, clamp(hot, 0.0, 0.92));
        col *= mix(1.0, 0.25, uDim);
        float alpha = clamp((rim * 0.95 + core * 0.7) * uOpacity * mix(1.0, 0.85, hot), 0.06, 0.98);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function createPointsMaterial(pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: pixelRatio } },
    vertexShader: /* glsl */ `
      uniform float uPixelRatio;
      attribute vec3 aColor;
      attribute float aAlpha;
      attribute float aSize;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(aSize * uPixelRatio * (2.2 / max(0.05, -mv.z)), 20.0 * uPixelRatio);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * a * 1.7, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}

/** A fixed-size particle buffer with per-particle colour, alpha and size. */
class ParticleSet {
  readonly points: THREE.Points;
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly alpha: Float32Array;
  readonly size: Float32Array;
  constructor(readonly count: number, material: THREE.ShaderMaterial, baseSize: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count).fill(baseSize);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }
  set(i: number, p: THREE.Vector3, c: THREE.Color, a: number, s?: number) {
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.alpha[i] = a;
    if (s !== undefined) this.size[i] = s;
  }
  commit() {
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface FlowSystem {
  set: ParticleSet;
  curve: THREE.CatmullRomCurve3;
  length: number;
  mode: FlowMode;
  kind: "blood" | "neural" | "urine";
  u: Float32Array;
  rand: Float32Array;
  held: Uint8Array;
  holdUntil: Float32Array;
  holdPos: Float32Array;
  /** Obstruction position along the path (0..1), or -1. */
  gate: number;
  /** For urine retention: bladder box particles settle into. */
  sink: THREE.Box3 | null;
}

interface GasSystem {
  set: ParticleSet;
  inlet: THREE.Vector3;
  targets: THREE.Vector3[];
  kind: "o2" | "co2";
  phase: Float32Array;
  speed: Float32Array;
  slot: Uint16Array;
}

export class EmergencyEngine {
  private twin: BuiltAnatomyTwin;
  private group = new THREE.Group();
  private pointsMat: THREE.ShaderMaterial;
  private mats = new Map<AnatomyMeshEntry, THREE.ShaderMaterial>();
  private shrinkMax = new Map<AnatomyMeshEntry, number>();
  private ghostMat: THREE.ShaderMaterial | null = null;
  private ghosts: THREE.Mesh[] = [];
  private disposables: { dispose: () => void }[] = [];
  private fxMat: THREE.ShaderMaterial | null = null;

  private scenario: EmergencyScenario | null = null;
  private vs: EmergencyVisualState = { scenario: null, level: 0, preview: false, view: "emergency", paused: false };
  private shownLevel = 0;
  private fxTime = 0;
  private anchorLocal: THREE.Vector3 | null = null;
  private hotspotLocal: THREE.Vector3 | null = null;

  private flows: FlowSystem[] = [];
  private gases: GasSystem[] = [];
  private immune: { set: ParticleSet; home: THREE.Vector3[]; rand: Float32Array; cluster: THREE.Vector3 } | null = null;
  private rings: THREE.Mesh[] = [];
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private clot: THREE.Group | null = null;
  private marker: THREE.Object3D | null = null;
  private markerMats: THREE.Material[] = [];
  private nextBeat = 0;
  private beatStart = -10;
  private beatAmp = 1;
  private levelColor = new THREE.Color("#00E5FF");
  private flowColor = new THREE.Color("#00E5FF");

  constructor(twin: BuiltAnatomyTwin, pixelRatio: number) {
    this.twin = twin;
    this.group.name = "EMERGENCY_FX";
    this.group.renderOrder = 30;
    twin.twinGroup.add(this.group);
    this.pointsMat = createPointsMaterial(Math.min(2, pixelRatio));
  }

  get active(): boolean {
    return this.scenario !== null;
  }

  get scenarioId(): string | null {
    return this.scenario?.id ?? null;
  }

  get currentLevel(): number {
    return this.shownLevel;
  }

  /** Update the requested state. Returns true when materials must be re-applied. */
  setState(vs: EmergencyVisualState): boolean {
    const prevId = this.scenario?.id ?? null;
    const nextId = vs.scenario?.id ?? null;
    this.vs = vs;
    if (nextId && nextId !== prevId) {
      this.build(vs.scenario as EmergencyScenario);
      if (!prevId) this.shownLevel = 0;
      return true;
    }
    return false;
  }

  isTarget(entry: AnatomyMeshEntry): boolean {
    return Boolean(this.scenario && matches(entry.mesh.name, this.scenario.fx.targets));
  }

  /** Applied after the viewport's normal material pass. */
  applyMaterials(entries: AnatomyMeshEntry[], suitVisible: boolean) {
    const sc = this.scenario;
    if (!sc) return;
    const emphasise = this.vs.preview || this.shownLevel > 0.05 || this.vs.level > 0;
    const dims = sc.fx.dim ?? [];
    for (const entry of entries) {
      const name = entry.mesh.name;
      if (matches(name, sc.fx.targets)) {
        entry.mesh.visible = true;
        const mat = this.materialFor(entry);
        mat.depthTest = !suitVisible;
        entry.mesh.material = mat;
        continue;
      }
      if (!entry.mesh.visible || !emphasise) continue;
      const m = entry.mesh.material as THREE.Material & { uniforms?: Record<string, THREE.IUniform> };
      const dimHard = dims.length > 0 && matches(name, dims);
      if (m.uniforms?.uDimmed) {
        m.uniforms.uDimmed.value = Math.max(Number(m.uniforms.uDimmed.value) || 0, dimHard ? 0.9 : 0.5);
      } else if (m instanceof THREE.MeshPhysicalMaterial) {
        if (!m.transparent) {
          m.transparent = true;
          m.depthWrite = false;
          m.needsUpdate = true;
        }
        m.opacity = Math.min(m.opacity, dimHard ? 0.12 : 0.4);
      }
    }
  }

  /** Per-frame update. Returns true when the viewport must re-apply materials. */
  update(dt: number, playing: boolean): boolean {
    const sc = this.scenario;
    if (!sc) return false;

    let target = this.vs.scenario ? this.vs.level : 0;
    if (this.vs.scenario && this.vs.view === "compare" && !this.vs.preview) {
      const phase = Math.floor(performance.now() / 2400) % 2;
      target = phase === 0 ? 0 : this.vs.level;
    }
    if (dt <= 0) {
      this.shownLevel = target;
    } else {
      this.shownLevel = THREE.MathUtils.damp(this.shownLevel, target, 2.6, dt);
      if (Math.abs(this.shownLevel - target) < 0.004) this.shownLevel = target;
    }

    // Recovery finished after Reset: drop every effect and give materials back.
    if (!this.vs.scenario && this.shownLevel < 0.02) {
      this.clear();
      return true;
    }

    const fxDt = playing && !this.vs.paused ? dt : 0;
    this.fxTime += fxDt;
    const L = this.shownLevel;
    const n = Math.min(1, L / 4);
    const li = Math.min(4, Math.round(L));
    const preview = this.vs.preview;

    const color = this.levelColor.set(severityHex(L));
    const accent = L > 2.5 ? ACCENT_HOT : L > 0.5 ? MAGENTA : NEURAL;
    const hotWorld = this.hotspotLocal ? _v2.copy(this.hotspotLocal).applyMatrix4(this.twin.twinGroup.matrixWorld) : null;

    for (const [entry, mat] of this.mats) {
      const u = mat.uniforms;
      u.uTime.value = this.fxTime;
      u.uColor.value.copy(color);
      u.uAccent.value.copy(accent);
      u.uPulseHz.value = preview ? 0.6 : PULSE_HZ[li];
      u.uPulseAmt.value = preview ? 0.3 : PULSE_AMT[li];
      u.uIntensity.value = 1.0 + n * 0.45;
      u.uPorosity.value = sc.fx.porosity ? 0.6 * n : 0;
      u.uShrink.value = sc.fx.shrink ? (this.shrinkMax.get(entry) ?? 0) * n : 0;
      if (hotWorld && sc.fx.hotspot) {
        u.uHotspot.value.copy(hotWorld);
        u.uHotRadius.value = sc.fx.hotspot.radius * (0.55 + 0.75 * n);
        u.uHotAmt.value = n > 0.05 ? Math.min(1, n * 1.4) : 0;
      }
    }
    if (this.fxMat) {
      const u = this.fxMat.uniforms;
      u.uTime.value = this.fxTime;
      u.uColor.value.copy(color);
      u.uAccent.value.copy(accent);
      u.uPulseHz.value = PULSE_HZ[li];
      u.uPulseAmt.value = PULSE_AMT[li];
    }
    for (const g of this.ghosts) g.visible = n > 0.04;

    for (const f of this.flows) this.updateFlow(f, n, fxDt);
    for (const g of this.gases) this.updateGas(g, n, fxDt, sc.fx.gas ?? "both");
    if (this.immune) this.updateImmune(n, sc.fx.immune ?? "reduced");
    this.updateRings(n, color);
    this.updateClotAndMarker(n, color);
    if (playing && !this.vs.paused && sc.fx.beat) this.updateBeat(sc.fx.beat, L);
    return false;
  }

  /** Anchor in twin-local coordinates (independent of the twin's turntable rotation). */
  getAnchorLocal(out: THREE.Vector3): boolean {
    if (!this.anchorLocal || !this.scenario) return false;
    out.copy(this.anchorLocal);
    return true;
  }

  getAnchorWorld(out: THREE.Vector3): boolean {
    if (!this.anchorLocal || !this.scenario) return false;
    out.copy(this.anchorLocal).applyMatrix4(this.twin.twinGroup.matrixWorld);
    return true;
  }

  dispose() {
    this.clear();
    this.pointsMat.dispose();
    this.twin.twinGroup.remove(this.group);
  }

  /* --------------------------------------------------------------- */

  private materialFor(entry: AnatomyMeshEntry): THREE.ShaderMaterial {
    let m = this.mats.get(entry);
    if (!m) {
      m = createEmergencyMaterial();
      this.mats.set(entry, m);
      const box = new THREE.Box3().setFromBufferAttribute(entry.mesh.geometry.attributes.position as THREE.BufferAttribute);
      const size = box.getSize(_v);
      this.shrinkMax.set(entry, Math.min(size.x, size.y, size.z) * 0.24);
    }
    return m;
  }

  private matrixToLocal(mesh: THREE.Object3D): THREE.Matrix4 {
    const inv = new THREE.Matrix4().copy(this.twin.twinGroup.matrixWorld).invert();
    return inv.multiply(mesh.matrixWorld);
  }

  private meshesNamed(pattern: string): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const e of this.twin.organEntries) {
      if (e.mesh.name === pattern || e.mesh.name.startsWith(pattern)) out.push(e.mesh);
    }
    return out;
  }

  private localVertices(meshes: THREE.Mesh[], stride = 1): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const mesh of meshes) {
      const m = this.matrixToLocal(mesh);
      const attr = mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i += stride) {
        out.push(new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(m));
      }
    }
    return out;
  }

  private localBox(pattern: string): THREE.Box3 | null {
    const verts = this.localVertices(this.meshesNamed(pattern), 2);
    if (verts.length === 0) return null;
    return new THREE.Box3().setFromPoints(verts);
  }

  private pointAt(mp: MeshPoint): THREE.Vector3 | null {
    const box = this.localBox(mp.mesh);
    if (!box) return null;
    return new THREE.Vector3(
      THREE.MathUtils.lerp(box.min.x, box.max.x, mp.at[0]),
      THREE.MathUtils.lerp(box.min.y, box.max.y, mp.at[1]),
      THREE.MathUtils.lerp(box.min.z, box.max.z, mp.at[2]),
    );
  }

  /** Approximate a tube-like mesh's centreline by averaging vertices in height bins. */
  private centreline(pattern: string, from: "top" | "bottom"): THREE.CatmullRomCurve3 | null {
    const verts = this.localVertices(this.meshesNamed(pattern));
    if (verts.length < 8) return null;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const v of verts) {
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const bins = 18;
    const sums = Array.from({ length: bins }, () => ({ p: new THREE.Vector3(), n: 0 }));
    for (const v of verts) {
      const b = Math.min(bins - 1, Math.floor(((v.y - minY) / Math.max(1e-6, maxY - minY)) * bins));
      sums[b].p.add(v);
      sums[b].n++;
    }
    let pts = sums.filter((s) => s.n > 0).map((s) => s.p.divideScalar(s.n));
    if (pts.length < 2) return null;
    if (from === "top") pts = pts.reverse();
    return new THREE.CatmullRomCurve3(pts, false, "centripetal");
  }

  private build(sc: EmergencyScenario) {
    this.clear();
    this.scenario = sc;
    this.twin.twinGroup.updateMatrixWorld(true);
    this.fxMat = createEmergencyMaterial();
    this.disposables.push(this.fxMat);

    this.anchorLocal = this.pointAt(sc.fx.anchor);
    this.hotspotLocal = sc.fx.hotspot ? this.pointAt(sc.fx.hotspot) : null;

    if (sc.fx.flow) {
      const curve = this.centreline(sc.fx.flow.mesh, sc.fx.flow.from);
      if (curve) this.flows.push(this.makeFlow(curve, sc.fx.flow.mode, sc.fx.flow.kind ?? "blood", sc.fx.clot ? 0.55 : -1));
      if (curve && sc.fx.clot) this.makeClot(curve.getPointAt(0.55));
    }
    if (sc.fx.gas) this.makeGas();
    if (sc.fx.immune) this.makeImmune();
    if (sc.fx.rings) this.makeRings();
    if (sc.fx.opticNerve) this.makeOpticNerves();
    if (sc.fx.marker) this.makeMarker(sc.fx.marker.kind, sc.fx.marker);
    if (sc.fx.urine) this.makeUrine(sc.fx.urine, sc.fx.marker?.kind === "stone" ? sc.fx.marker.mesh : null);
    if (sc.fx.shrink) this.makeGhosts(sc);
  }

  private clear() {
    for (const f of this.flows) f.set.points.geometry.dispose();
    for (const g of this.gases) g.set.points.geometry.dispose();
    if (this.immune) this.immune.set.points.geometry.dispose();
    for (const d of this.disposables) d.dispose();
    for (const m of this.markerMats) m.dispose();
    for (const g of this.ghosts) g.parent?.remove(g);
    for (const m of this.mats.values()) m.dispose();
    this.ghostMat?.dispose();
    this.ghostMat = null;
    this.mats.clear();
    this.shrinkMax.clear();
    this.flows = [];
    this.gases = [];
    this.immune = null;
    this.rings = [];
    this.ringMat = null;
    this.clot = null;
    this.marker = null;
    this.markerMats = [];
    this.ghosts = [];
    this.disposables = [];
    this.fxMat = null;
    this.anchorLocal = null;
    this.hotspotLocal = null;
    this.group.clear();
    // Hearts return to the viewport's normal beat scale.
    for (const e of this.twin.organEntries) {
      if (e.organId === "heart") e.mesh.scale.copy(e.baseScale);
    }
    this.scenario = null;
    this.shownLevel = 0;
  }

  /* ----------------------------- flow ----------------------------- */

  private makeFlow(
    curve: THREE.CatmullRomCurve3,
    mode: FlowMode,
    kind: FlowSystem["kind"],
    gate: number,
    sink: THREE.Box3 | null = null,
    count = kind === "neural" ? 46 : kind === "urine" ? 28 : 72,
  ): FlowSystem {
    const set = new ParticleSet(count, this.pointsMat, kind === "urine" ? 5 : 6.5);
    const u = new Float32Array(count);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      u[i] = i / count;
      rand[i] = Math.random();
    }
    this.group.add(set.points);
    const f: FlowSystem = {
      set,
      curve,
      length: Math.max(0.05, curve.getLength()),
      mode,
      kind,
      u,
      rand,
      held: new Uint8Array(count),
      holdUntil: new Float32Array(count),
      holdPos: new Float32Array(count * 3),
      gate,
      sink,
    };
    this.updateFlow(f, 0, 0);
    return f;
  }

  private updateFlow(f: FlowSystem, n: number, dt: number) {
    const base = (f.kind === "neural" ? 0.32 : f.kind === "urine" ? 0.06 : 0.13) / f.length;
    let v = base;
    switch (f.mode) {
      case "reduced":
        v = base * (1 - 0.78 * n);
        break;
      case "stasis":
        v = base * (1 - 0.96 * n);
        break;
      case "retrograde":
        v = base * (1 - 1.75 * n);
        break;
      case "pooling":
        v = base * (1 - 1.35 * n);
        break;
      case "cephalad":
        v = base * (1 + 1.3 * n);
        break;
      default:
        break;
    }
    const blockage = f.gate >= 0 ? Math.min(1, n * 1.2) : 0;
    const neutral = f.kind === "neural" ? NEURAL : f.kind === "urine" ? URINE : VENOUS;
    const sev = this.flowColor.set(severityHex(n * 4));
    const t = this.fxTime;

    for (let i = 0; i < f.set.count; i++) {
      const r = f.rand[i];
      if (f.held[i]) {
        // Particles waiting behind a clot or settled in the bladder.
        const release = f.sink ? t > f.holdUntil[i] : Math.random() < dt * (1 - blockage) * 2.5;
        if (release) {
          f.held[i] = 0;
          f.u[i] = f.sink ? 0 : f.gate + 0.01;
        } else {
          _v.set(f.holdPos[i * 3], f.holdPos[i * 3 + 1], f.holdPos[i * 3 + 2]);
          const jig = 0.0012 + 0.001 * Math.sin(t * 3 + r * 20);
          _v.x += Math.sin(t * 2.1 + r * 30) * jig;
          _v.z += Math.cos(t * 1.7 + r * 40) * jig;
          _c.copy(neutral).lerp(sev, 0.8);
          f.set.set(i, _v, _c, 0.95);
          continue;
        }
      }
      const prev = f.u[i];
      let next = prev + v * (0.75 + 0.5 * r) * dt;
      if (f.mode === "stasis") next += Math.sin(t * 2.3 + r * 50) * 0.02 * n * dt * 6;
      if (f.mode === "retrograde" && n > 0.3 && n < 0.75) next += Math.sin(t * 2.6 + r * 9) * 0.25 * dt;

      if (blockage > 0 && prev < f.gate && next >= f.gate && r < blockage) {
        // Stall in a queue just upstream of the obstruction.
        f.held[i] = 1;
        const q = f.gate - 0.012 - r * 0.07 * Math.max(0.3, n);
        f.curve.getPointAt(Math.max(0, q), _v);
        f.holdPos.set([_v.x, _v.y, _v.z], i * 3);
        continue;
      }
      if (next > 1) {
        if (f.sink && Math.random() < n) {
          f.held[i] = 1;
          f.holdUntil[i] = t + 3 + 9 * n * Math.random();
          const b = f.sink;
          f.holdPos.set(
            [
              THREE.MathUtils.lerp(b.min.x, b.max.x, 0.2 + 0.6 * Math.random()),
              THREE.MathUtils.lerp(b.min.y, b.max.y, 0.15 + 0.5 * Math.random()),
              THREE.MathUtils.lerp(b.min.z, b.max.z, 0.2 + 0.6 * Math.random()),
            ],
            i * 3,
          );
          continue;
        }
        next -= 1;
      }
      if (next < 0) next = f.mode === "pooling" ? 0 : next + 1;
      f.u[i] = next;

      f.curve.getPointAt(Math.min(1, Math.max(0, next)), _v);
      const wob = f.kind === "neural" ? 0.0015 : 0.0024;
      _v.x += Math.sin(r * 91 + next * 40) * wob;
      _v.z += Math.cos(r * 57 + next * 33) * wob;
      // Particles past a heavy obstruction thin out (downstream flow is reduced).
      let a = f.kind === "neural" ? 0.9 * (1 - 0.5 * n) : 0.85;
      if (blockage > 0 && next > f.gate) a *= 1 - blockage * 0.7;
      if (f.kind === "urine" && f.mode === "reduced") a *= 1 - 0.7 * n;
      _c.copy(neutral).lerp(sev, Math.min(1, n * 1.1));
      f.set.set(i, _v, _c, a);
    }
    f.set.commit();
  }

  private makeClot(at: THREE.Vector3) {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.0042, 1);
    const mat = new THREE.MeshBasicMaterial({ color: "#B3122E", transparent: true, opacity: 0.95, depthTest: false });
    const halo = new THREE.MeshBasicMaterial({
      color: "#FF3158",
      transparent: true,
      opacity: 0.25,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const offsets = [
      [0, 0, 0],
      [0.0028, 0.002, 0.001],
      [-0.0024, -0.0018, 0.0015],
      [0.001, -0.0034, -0.0012],
      [-0.001, 0.0036, -0.001],
    ];
    for (const o of offsets) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(o[0], o[1], o[2]);
      m.renderOrder = 31;
      g.add(m);
    }
    const haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), halo);
    haloMesh.renderOrder = 31;
    g.add(haloMesh);
    g.position.copy(at);
    this.group.add(g);
    this.clot = g;
    this.disposables.push(geo, mat, halo, haloMesh.geometry);
  }

  /* ------------------------------ gas ------------------------------ */

  private makeGas() {
    const lungVerts = this.localVertices(this.meshesNamed("ORG_lung_"), 3);
    const airway = this.localBox("ORG_airways");
    if (lungVerts.length === 0 || !airway) return;
    const center = new THREE.Box3().setFromPoints(lungVerts).getCenter(new THREE.Vector3());
    // Pull surface samples inward so particles sit inside the lung volume.
    const targets = lungVerts.map((v) => v.clone().lerp(center, 0.25 + Math.random() * 0.35));
    const inlet = new THREE.Vector3((airway.min.x + airway.max.x) / 2, airway.max.y - 0.01, (airway.min.z + airway.max.z) / 2);
    const mk = (k: "o2" | "co2", count: number) => {
      const set = new ParticleSet(count, this.pointsMat, 5.5);
      const g: GasSystem = {
        set,
        inlet,
        targets,
        kind: k,
        phase: new Float32Array(count).map(() => Math.random()),
        speed: new Float32Array(count).map(() => 0.35 + Math.random() * 0.3),
        slot: new Uint16Array(count).map(() => Math.floor(Math.random() * targets.length)),
      };
      this.group.add(set.points);
      this.gases.push(g);
    };
    mk("o2", 130);
    mk("co2", 190);
  }

  private updateGas(g: GasSystem, n: number, dt: number, kind: "o2_low" | "co2_high" | "both") {
    const o2Loss = kind === "co2_high" ? 0.25 * n : n;
    const co2Gain = kind === "o2_low" ? 0.15 * n : n;
    const active =
      g.kind === "o2" ? Math.round(g.set.count * (1 - 0.82 * o2Loss)) : Math.round(18 + (g.set.count - 18) * co2Gain);
    const clearSpeed = g.kind === "co2" ? 1 - 0.85 * co2Gain : 1;
    for (let i = 0; i < g.set.count; i++) {
      if (i >= active) {
        g.set.set(i, _v.set(0, -50, 0), CO2, 0);
        continue;
      }
      g.phase[i] += dt * g.speed[i] * (g.kind === "co2" ? clearSpeed * 0.8 : 1);
      if (g.phase[i] > 1) {
        g.phase[i] -= 1;
        g.slot[i] = Math.floor(Math.random() * g.targets.length);
      }
      const p = g.phase[i];
      const tgt = g.targets[g.slot[i]];
      if (g.kind === "o2") {
        // Inhaled oxygen travels from the airway into the lung tissue.
        const e = 1 - Math.pow(1 - p, 2);
        _v.copy(g.inlet).lerp(tgt, e);
        g.set.set(i, _v, O2, Math.sin(Math.PI * p) * 0.9);
      } else {
        // CO₂ leaves the tissue toward the airway; when clearance fails it lingers.
        const e = p * p * clearSpeed;
        _v.copy(tgt).lerp(g.inlet, e);
        _v.x += Math.sin(p * 12 + i) * 0.004 * co2Gain;
        _v.y += Math.cos(p * 9 + i * 0.7) * 0.004 * co2Gain;
        const a = (0.35 + 0.6 * co2Gain) * Math.min(1, Math.sin(Math.PI * Math.min(1, p * 1.05)) + 0.35 * co2Gain);
        g.set.set(i, _v, CO2, a);
      }
    }
    g.set.commit();
  }

  /* ----------------------------- immune ---------------------------- */

  private makeImmune() {
    const verts = this.localVertices(this.meshesNamed("ORG_lymph"), 1);
    if (verts.length === 0) return;
    const count = 110;
    const home: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) home.push(verts[Math.floor(Math.random() * verts.length)].clone());
    const set = new ParticleSet(count, this.pointsMat, 6);
    this.group.add(set.points);
    this.immune = {
      set,
      home,
      rand: new Float32Array(count).map(() => Math.random()),
      cluster: this.anchorLocal?.clone() ?? home[0].clone(),
    };
  }

  private updateImmune(n: number, mode: "reduced" | "reactivation" | "cluster") {
    const im = this.immune;
    if (!im) return;
    const t = this.fxTime;
    for (let i = 0; i < im.set.count; i++) {
      const r = im.rand[i];
      const twinkle = 0.55 + 0.45 * Math.sin(t * (1.5 + r * 2) + r * 40);
      _v.copy(im.home[i]);
      let a = 0.75 * twinkle;
      let c = IMMUNE;
      let size = 6;
      if (mode === "reduced") {
        if (r < 0.7 * n) a = 0;
        else a *= 1 - 0.55 * n;
      } else if (mode === "reactivation") {
        const flare = Math.max(0, Math.sin(t * (0.8 + r) + r * 60));
        const lit = r < 0.25 + 0.55 * n;
        if (lit) {
          a = Math.min(1, a + flare * n * 1.2);
          size = 6 + flare * 8 * n;
          c = _c.copy(IMMUNE).lerp(MAGENTA, flare * n);
        }
      } else {
        // Immune cells converge on a local cluster.
        const pull = n * (0.45 + 0.5 * r);
        _v.lerp(im.cluster, pull);
        _v.x += Math.sin(t * 2 + r * 30) * 0.006 * pull;
        _v.y += Math.cos(t * 1.6 + r * 20) * 0.006 * pull;
        a = Math.min(1, a + pull * 0.4);
        c = _c.copy(IMMUNE).lerp(MAGENTA, pull * 0.7);
      }
      im.set.set(i, _v, c, a, size);
    }
    im.set.commit();
  }

  /* --------------------------- rings / nerves ------------------------ */

  private makeRings() {
    const box = this.localBox("PROC_brain_");
    if (!box) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(_v).x, box.getSize(_v).y) * 0.95;
    const geo = new THREE.TorusGeometry(r, r * 0.012, 6, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: "#00E5FF",
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.disposables.push(geo, mat);
    this.ringMat = mat;
    const base = [
      [Math.PI / 2, 0, 0],
      [0, Math.PI / 2, 0],
      [0, 0, 0],
    ];
    for (const b of base) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(c);
      m.rotation.set(b[0], b[1], b[2]);
      m.userData.base = b;
      m.renderOrder = 31;
      this.group.add(m);
      this.rings.push(m);
    }
  }

  private updateRings(n: number, color: THREE.Color) {
    if (!this.ringMat) return;
    this.ringMat.color.copy(color);
    this.ringMat.opacity = 0.35 + 0.45 * Math.max(n, 0.2);
    const t = this.fxTime;
    this.rings.forEach((m, i) => {
      const b = m.userData.base as number[];
      const wob = n * 0.7;
      m.rotation.set(
        b[0] + Math.sin(t * (0.9 + i * 0.37)) * wob,
        b[1] + Math.sin(t * (0.6 + i * 0.21) + i) * wob + t * n * (i === 1 ? 0.9 : 0),
        b[2] + Math.cos(t * (0.75 + i * 0.29)) * wob,
      );
    });
  }

  private makeOpticNerves() {
    const chiasm = this.localBox("PROC_brain_optic_chiasm");
    if (!chiasm || !this.fxMat) return;
    const cc = chiasm.getCenter(new THREE.Vector3());
    for (const side of ["ORG_eye_L", "ORG_eye_R"]) {
      const eye = this.localBox(side);
      if (!eye) continue;
      const ec = eye.getCenter(new THREE.Vector3());
      const back = new THREE.Vector3(ec.x, ec.y, eye.min.z);
      const mid = back.clone().lerp(cc, 0.5);
      mid.y += 0.004;
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([back, mid, cc]), 24, 0.0024, 8, false);
      const mesh = new THREE.Mesh(geo, this.fxMat);
      mesh.renderOrder = 31;
      this.group.add(mesh);
      this.disposables.push(geo);
    }
  }

  /* ----------------------- markers, clot, ghosts --------------------- */

  private makeMarker(kind: "fracture" | "injury" | "stone" | "edema", mp: MeshPoint) {
    const at = this.pointAt(mp);
    if (!at) return;
    const glow = (radius: number) => {
      const mat = new THREE.MeshBasicMaterial({
        color: "#FF3158",
        transparent: true,
        opacity: 0.6,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const geo = new THREE.SphereGeometry(radius, 20, 14);
      this.markerMats.push(mat);
      this.disposables.push(geo);
      return new THREE.Mesh(geo, mat);
    };
    const g = new THREE.Group();
    if (kind === "fracture") {
      const mat = new THREE.MeshBasicMaterial({
        color: "#FF3158",
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0016, 6, 48), mat);
      ring.rotation.x = Math.PI / 2;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(-0.03 + i * 0.0075, (i % 2 === 0 ? 1 : -1) * 0.004, 0.012));
      const crackGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const crack = new THREE.Line(crackGeo, new THREE.LineBasicMaterial({ color: "#FFE7A0", transparent: true, depthTest: false }));
      g.add(ring, crack);
      this.markerMats.push(mat, crack.material as THREE.Material);
      this.disposables.push(ring.geometry, crackGeo);
    } else if (kind === "stone") {
      const mat = new THREE.MeshBasicMaterial({ color: "#FFE7A0", transparent: true, depthTest: false });
      const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.004, 0), mat);
      stone.name = "stone";
      g.add(stone, glow(0.009));
      this.markerMats.push(mat);
      this.disposables.push(stone.geometry);
    } else {
      g.add(glow(kind === "edema" ? 0.0035 : 0.011));
    }
    g.children.forEach((c) => (c.renderOrder = 32));
    g.position.copy(at);
    g.userData.kind = kind;
    this.group.add(g);
    this.marker = g;
  }

  private updateClotAndMarker(n: number, color: THREE.Color) {
    const t = this.fxTime;
    if (this.clot) {
      const s = 0.25 + 1.0 * n;
      this.clot.scale.setScalar(s);
      this.clot.visible = n > 0.03;
    }
    if (this.marker) {
      const kind = this.marker.userData.kind as string;
      this.marker.visible = n > 0.03;
      const pulse = 1 + 0.18 * Math.sin(t * (2 + n * 4));
      if (kind === "stone") {
        const stone = this.marker.getObjectByName("stone");
        stone?.scale.setScalar(0.4 + 1.6 * n);
        this.marker.children[1]?.scale.setScalar((0.5 + n) * pulse);
      } else if (kind === "edema") {
        this.marker.scale.setScalar((0.7 + 1.4 * n) * pulse);
      } else {
        this.marker.scale.setScalar((0.6 + 0.6 * n) * pulse);
      }
      for (const m of this.markerMats) {
        if (m instanceof THREE.MeshBasicMaterial && m.color.getHex() !== 0xffe7a0) {
          m.color.copy(color);
          m.opacity = 0.35 + 0.5 * n;
        }
      }
    }
  }

  private makeUrine(mode: "normal" | "retention" | "reduced", stoneMesh: string | null) {
    const bladder = this.localBox("ORG_bladder");
    if (!bladder) return;
    const top = new THREE.Vector3((bladder.min.x + bladder.max.x) / 2, bladder.max.y, (bladder.min.z + bladder.max.z) / 2);
    for (const side of ["ORG_kidney_L", "ORG_kidney_R"]) {
      const k = this.localBox(side);
      if (!k) continue;
      const kc = k.getCenter(new THREE.Vector3());
      const inner = kc.x > top.x ? k.min.x : k.max.x;
      const start = new THREE.Vector3(THREE.MathUtils.lerp(kc.x, inner, 0.7), k.min.y + (k.max.y - k.min.y) * 0.3, kc.z);
      const mid = new THREE.Vector3(THREE.MathUtils.lerp(start.x, top.x, 0.45), (start.y + top.y) / 2, kc.z - 0.006);
      const curve = new THREE.CatmullRomCurve3([start, mid, top]);
      const tube = new THREE.TubeGeometry(curve, 30, 0.0016, 6, false);
      const tubeMesh = new THREE.Mesh(tube, this.fxMat ?? undefined);
      tubeMesh.renderOrder = 30;
      this.group.add(tubeMesh);
      this.disposables.push(tube);
      const blocked = stoneMesh === side;
      const flowMode: FlowMode = blocked ? "obstructed" : mode === "reduced" ? "reduced" : "normal";
      const f = this.makeFlow(curve, flowMode, "urine", blocked ? 0.12 : -1, mode === "retention" ? bladder : null);
      this.flows.push(f);
    }
  }

  private makeGhosts(sc: EmergencyScenario) {
    this.ghostMat = createOrganHoloMaterial("#00E5FF", "#008CFF");
    this.ghostMat.uniforms.uOpacity.value = 0.16;
    this.ghostMat.uniforms.uScanEnabled.value = 0;
    for (const e of this.twin.organEntries) {
      if (!matches(e.mesh.name, sc.fx.targets) || e.role !== "muscle" || !e.mesh.parent) continue;
      const ghost = new THREE.Mesh(e.mesh.geometry, this.ghostMat);
      ghost.position.copy(e.mesh.position);
      ghost.quaternion.copy(e.mesh.quaternion);
      ghost.scale.copy(e.mesh.scale);
      ghost.renderOrder = 29;
      ghost.visible = false;
      e.mesh.parent.add(ghost);
      this.ghosts.push(ghost);
    }
  }

  /* ------------------------------ heart ------------------------------ */

  private updateBeat(kind: "irregular" | "weak", level: number) {
    const t = this.fxTime;
    const n = Math.min(1, level / 4);
    let s: number;
    if (kind === "irregular") {
      const hr = 64 + 84 * n * n;
      if (t >= this.nextBeat) {
        this.beatStart = t;
        const rr = 60 / hr;
        const jitter = 1 + (Math.random() * 2 - 1) * 0.5 * n;
        const skip = Math.random() < 0.18 * n ? 1.6 : 1;
        this.nextBeat = t + rr * jitter * skip;
        this.beatAmp = 0.75 + Math.random() * 0.5 * (0.3 + n);
      }
      const dtb = t - this.beatStart;
      s = 1 + 0.06 * this.beatAmp * Math.exp(-Math.pow(dtb / 0.09, 2));
      s += 0.006 * n * Math.sin(t * 47); // fibrillatory tremor at high severity
    } else {
      const phase = (t * 1.15) % 1;
      s = 1 + 0.055 * (1 - 0.7 * n) * Math.exp(-Math.pow((phase - 0.2) * 14, 2));
    }
    for (const e of this.twin.organEntries) {
      if (e.organId === "heart" && e.role === "organ") e.mesh.scale.copy(e.baseScale).multiplyScalar(s);
    }
  }
}
