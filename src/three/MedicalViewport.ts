import * as THREE from "three";
import gsap from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  ANATOMY_BY_ID,
  CAMERA_PRESETS,
  type AnatomyId,
  type CameraPresetId,
} from "../data/anatomyCatalog.ts";
import { SUIT_COMPONENT_BY_ID, type SuitComponentId } from "../data/spacesuitCatalog.ts";
import {
  isStructureDimmed,
  isStructureHiddenByIsolation,
  isSuitComponentDimmed,
  isSuitComponentHiddenByIsolation,
  type SimulationState,
} from "../utils/simulationState.ts";
import {
  buildTelemetrySnapshot,
  type SuitTelemetrySnapshot,
} from "../utils/telemetryEngine.ts";
import {
  loadAndBuildAnatomyTwin,
  type AnatomyMeshEntry,
  type BuiltAnatomyTwin,
} from "./anatomyBuilder.ts";
import {
  loadAndBuildSpacesuit,
  type BuiltSpacesuit,
  type SuitMeshEntry,
} from "./spacesuitBuilder.ts";
import { EmergencyEngine, type EmergencyVisualState } from "./emergencyEngine.ts";
import {
  createHologramShellMaterial,
  createLabBackdropTexture,
  createOrganHoloMaterial,
  createPathwayPulseMaterial,
  createStriatedMuscleTextures,
  createThermalMaterial,
} from "./shaders.ts";

export interface LabelProjection {
  id: string;
  kind: "organ" | "suit";
  name: string;
  x: number;
  y: number;
  visible: boolean;
  selected: boolean;
  alertSeverity?: "warning" | "critical";
}

export interface TelemetryReadout {
  azimuthDeg: number;
  elevationDeg: number;
  zoomDistance: number;
  /** MRI mode: height of the scan slice above the floor (m). */
  mriSliceY?: number;
}

/** A choreographed camera move for the guided walkthrough. */
export interface CinematicShot {
  focus: { kind: "body" } | { kind: "organ"; id: AnatomyId } | { kind: "emergency" } | { kind: "point"; p: [number, number, number] };
  /** Camera distance from the focus point (m). */
  distance: number;
  /** Horizontal angle around the subject (deg, 0 = front, + = to the subject's left). */
  azimuth?: number;
  /** Height angle (deg). */
  elevation?: number;
  /** Seconds for the move. */
  duration?: number;
  ease?: string;
  /** After arriving, drift this many degrees around the subject... */
  orbit?: number;
  /** ...over this many seconds. */
  orbitDuration?: number;
}

export interface ViewportCallbacks {
  onLoadProgress: (pct: number) => void;
  onReady: (isSoftwareGl: boolean) => void;
  onError: (message: string) => void;
  onSelectOrgan: (id: AnatomyId | null, focusZoom: boolean) => void;
  onSelectSuitComponent: (
    id: SuitComponentId | null,
    focusZoom: boolean,
    openHud?: boolean,
  ) => void;
  onTelemetry: (telemetry: TelemetryReadout) => void;
  onLabelsProject: (labels: LabelProjection[]) => void;
  /** Name of the mesh under a click (lets Emergency mode tell eyes from brain, veins from heart). */
  onPickMesh?: (meshName: string) => void;
  /** Screen position of the active emergency's anatomical anchor, or null. */
  onEmergencyAnchor?: (anchor: { x: number; y: number; visible: boolean } | null) => void;
}

interface EntryMaterials {
  holo: THREE.ShaderMaterial;
  thermal: THREE.ShaderMaterial;
  realistic: THREE.MeshPhysicalMaterial;
  xray: THREE.ShaderMaterial;
  pulse?: THREE.ShaderMaterial;
}

interface SuitEntryMaterials {
  realistic: THREE.Material;
  holo: THREE.ShaderMaterial;
  xray: THREE.ShaderMaterial;
  thermal: THREE.ShaderMaterial;
  engineering: THREE.MeshPhysicalMaterial;
}

const _vec3 = new THREE.Vector3();
const _projVec = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class MedicalViewportController {
  private container: HTMLElement;
  private callbacks: ViewportCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private twin: BuiltAnatomyTwin | null = null;
  private suit: BuiltSpacesuit | null = null;
  private suitLoadingPromise: Promise<void> | null = null;
  private suitWorldCenters: Partial<Record<SuitComponentId, THREE.Vector3>> = {};

  private skinHoloMat: THREE.ShaderMaterial;
  private skinThermalMat: THREE.ShaderMaterial;
  private skinXrayMat: THREE.ShaderMaterial;
  private skinRealisticMat: THREE.MeshPhysicalMaterial;
  private fxHoloMat: THREE.ShaderMaterial;
  private beamMat: THREE.ShaderMaterial;
  private muscleTextures: { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture };
  private entryMats = new Map<AnatomyMeshEntry, EntryMaterials>();
  private suitEntryMats = new Map<SuitMeshEntry, SuitEntryMaterials>();

  private state: SimulationState;
  private latestSnapshot: SuitTelemetrySnapshot;
  private currentSuitProgress = 0;
  private currentExplodeProgress = 0;
  private lastHudDrawTime = 0;

  private clock = new THREE.Clock();
  private elapsedTime = 0;
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  // MRI mode: a scan plane sweeps the body; the axial slab at that height is drawn as a slice monitor.
  private mriPlane: THREE.Mesh | null = null;
  private mriCam = new THREE.OrthographicCamera(-0.34, 0.34, 0.34, -0.34, 0.01, 4);
  private mriBox: THREE.Box3 | null = null;
  private mriSliceY = 0;
  private mriManual: number | null = null;
  private mriScene: THREE.Scene | null = null;
  private mriProxies: { src: THREE.Mesh; back: THREE.Mesh; front: THREE.Mesh; cap: THREE.Mesh }[] = [];
  private disposed = false;
  private emergency: EmergencyEngine | null = null;
  private emergencyVisual: EmergencyVisualState | null = null;
  private lastAnchorReported = false;
  private cinematicActive = false;
  private orbitTween: gsap.core.Tween | null = null;
  private activeCameraTween: gsap.core.Tween | null = null;
  private activeTargetTween: gsap.core.Tween | null = null;
  private activeRotationTween: gsap.core.Tween | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private lastHoverCheck = 0;
  private lastTelemetryTime = 0;

  constructor(
    container: HTMLElement,
    initialState: SimulationState,
    callbacks: ViewportCallbacks,
  ) {
    this.container = container;
    this.state = initialState;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.latestSnapshot = buildTelemetrySnapshot(initialState.suitScenarioId, 0);
    this.currentSuitProgress = initialState.suitActive ? 1 : 0;
    this.currentExplodeProgress = initialState.explodeProgress;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = createLabBackdropTexture();
    this.scene.fog = new THREE.FogExp2(0x040b18, 0.06);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.05, 80);
    const resetPose = CAMERA_PRESETS.reset;
    this.camera.position.set(...resetPose.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...resetPose.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = true;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 6.5;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI - 0.08;
    this.controls.update();

    this.controls.addEventListener("start", () => {
      this.cancelCameraTweens();
    });
    this.controls.addEventListener("change", () => {
      if (this.state.animationMode !== "playing") {
        this.requestRender();
      }
    });

    // Studio 3-point medical & aerospace lighting rig
    const hemi = new THREE.HemisphereLight(0x7ad7ff, 0x09182e, 0.72);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.45);
    keyLight.position.set(2.4, 3.2, 2.8);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 10;
      keyLight.shadow.camera.left = -1.5;
      keyLight.shadow.camera.right = 1.5;
      keyLight.shadow.camera.top = 1.5;
      keyLight.shadow.camera.bottom = -1.5;
      keyLight.shadow.bias = -0.0005;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8a5cff, 1.05);
    rimLight.position.set(-2.2, 1.6, -2.6);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x00e5ff, 0.65);
    fillLight.position.set(-2.4, 0.4, 1.8);
    this.scene.add(fillLight);

    // Contact shadow grounding disc below projector pedestal
    const shadowDiscGeo = new THREE.CircleGeometry(0.75, 48);
    const shadowDiscMat = new THREE.MeshBasicMaterial({
      color: 0x010409,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const shadowDisc = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = -0.945;
    this.scene.add(shadowDisc);

    // Laboratory reference grid floor
    const gridHelper = new THREE.GridHelper(6.5, 26, 0x008cff, 0x0c2440);
    gridHelper.position.y = -0.955;
    const gridMat = gridHelper.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.25;
    this.scene.add(gridHelper);

    if (!this.isSoftwareGl) {
      const pr = this.renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(Math.max(1, width * pr), Math.max(1, height * pr), {
        type: THREE.HalfFloatType,
        samples: 4, // MSAA: EffectComposer ignores the renderer's antialias, which made rims crawl and sparkle
      });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.34, 0.45, 0.72);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    // Shared materials
    this.skinHoloMat = createHologramShellMaterial();
    this.skinThermalMat = createThermalMaterial(0.32, true);
    this.skinXrayMat = createHologramShellMaterial();
    this.skinXrayMat.uniforms.uPrimary.value.set("#008CFF");
    this.skinXrayMat.uniforms.uSecondary.value.set("#00E5FF");
    this.skinXrayMat.uniforms.uOpacity.value = 0.2;

    this.skinRealisticMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#b8d4e8"),
      roughness: 0.35,
      metalness: 0.04,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.fxHoloMat = createOrganHoloMaterial("#00E5FF", "#008CFF");
    this.fxHoloMat.uniforms.uOpacity.value = 0.65;

    this.beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#00E5FF") },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float fade = pow(1.0 - clamp(vUv.y, 0.0, 1.0), 2.4);
          float alpha = fade * 0.08 * (0.85 + 0.15 * sin(vUv.x * 40.0 + uTime));
          gl_FragColor = vec4(uColor * alpha, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.muscleTextures = createStriatedMuscleTextures();
    this.muscleTextures.map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.bindDomEvents();
    this.initModel();
  }

  private async initModel() {
    try {
      const built = await loadAndBuildAnatomyTwin(this.isSoftwareGl, (pct) =>
        this.callbacks.onLoadProgress(pct),
      );
      if (this.disposed) {
        built.dispose();
        return;
      }
      this.twin = built;
      built.twinGroup.updateMatrixWorld(true);
      this.mriBox = new THREE.Box3();
      for (const m of built.bodySkinMeshes) this.mriBox.expandByObject(m);
      if (!this.mriBox.isEmpty()) {
        const sz = this.mriBox.getSize(new THREE.Vector3());
        const planeGeo = new THREE.PlaneGeometry(Math.max(sz.x, 0.7) * 1.15, Math.max(sz.z, 0.35) * 1.8);
        planeGeo.rotateX(-Math.PI / 2);
        const plane = new THREE.Mesh(
          planeGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
        );
        plane.add(new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
        plane.visible = false;
        plane.renderOrder = 10;
        this.scene.add(plane);
        this.mriPlane = plane;
      }
      this.scene.add(built.twinGroup);

      built.twinGroup.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.name === "FX_beam") {
          obj.material = this.beamMat;
        } else if (obj.name.startsWith("FX_")) {
          obj.material = this.fxHoloMat;
        }
      });

      for (const entry of built.organEntries) {
        const holoColor =
          entry.role === "bone"
            ? "#9FE8FF"
            : entry.role === "nerve"
              ? "#A97BFF"
              : entry.role === "vessel"
                ? "#FF3DAD"
                : entry.role === "muscle"
                  ? "#FF4E78"
                  : "#00E5FF";

        const holo = createOrganHoloMaterial(holoColor, "#8A5CFF");
        const thermal = createThermalMaterial(entry.thermalHeat, false);
        const xray = createOrganHoloMaterial(
          entry.role === "bone" ? "#E8FAFF" : "#1D5E82",
          "#00E5FF",
        );
        xray.uniforms.uOpacity.value = entry.role === "bone" ? 0.95 : 0.12;

        const isMuscle = entry.role === "muscle";
        const hasVertexColors = Boolean(entry.mesh.geometry.getAttribute("color"));
        const isBrainMesh = entry.mesh.name.startsWith("PROC_brain_");
        const realistic = new THREE.MeshPhysicalMaterial({
          color: isMuscle || hasVertexColors ? new THREE.Color("#ffffff") : entry.realisticColor,
          vertexColors: isMuscle || hasVertexColors,
          map: isMuscle ? this.muscleTextures.map : null,
          bumpMap: isMuscle ? this.muscleTextures.bumpMap : null,
          bumpScale: isMuscle ? 0.011 : 0,
          roughness: isBrainMesh ? 0.52 : entry.realisticRoughness,
          metalness: 0.03,
          sheen: isMuscle ? 0.36 : isBrainMesh ? 0.2 : 0,
          sheenColor: new THREE.Color(isBrainMesh ? "#ffdbe2" : "#ffd4dc"),
          sheenRoughness: 0.48,
          clearcoat: isBrainMesh ? 0.16 : entry.role === "organ" || entry.role === "vessel" ? 0.35 : 0.06,
          clearcoatRoughness: isBrainMesh ? 0.44 : 0.32,
          transparent: !isBrainMesh,
          opacity: isBrainMesh ? 1.0 : 0.96,
        });

        let pulse: THREE.ShaderMaterial | undefined;
        if (entry.role === "nerve") {
          pulse = createPathwayPulseMaterial("#5E4BFF", "#00E5FF", 1.5);
        } else if (entry.role === "vessel") {
          pulse = createPathwayPulseMaterial("#B51D4A", "#FF3DAD", 1.25);
        }

        this.entryMats.set(entry, { holo, thermal, realistic, xray, pulse });
      }

      this.emergency = new EmergencyEngine(built, this.renderer.getPixelRatio());
      if (this.emergencyVisual) this.emergency.setState(this.emergencyVisual);

      this.applyStateVisuals();

      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }

      this.callbacks.onReady(this.isSoftwareGl);
      this.startOrSyncLoop();

      // Background preload of NASA Z2 spacesuit + modular engineering assemblies
      void this.ensureSpacesuitLoaded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load 3D anatomy twin";
      this.callbacks.onError(msg);
    }
  }

  private async ensureSpacesuitLoaded() {
    if (this.suit || this.suitLoadingPromise || !this.twin) return;
    this.suitLoadingPromise = (async () => {
      try {
        const builtSuit = await loadAndBuildSpacesuit(this.latestSnapshot);
        if (this.disposed || !this.twin) {
          builtSuit.dispose();
          return;
        }
        this.suit = builtSuit;
        this.twin.twinGroup.add(builtSuit.suitGroup);
        builtSuit.suitGroup.visible = this.currentSuitProgress > 0.01;
        this.twin.twinGroup.updateMatrixWorld(true);

        // Compute world-space component centers cleanly inside twinGroup
        const accumBoxes: Partial<Record<SuitComponentId, THREE.Box3>> = {};
        for (const entry of builtSuit.entries) {
          const holoPrimary =
            entry.layer === "internal"
              ? "#00E5FF"
              : entry.layer === "bladder"
                ? "#008CFF"
                : entry.layer === "mli"
                  ? "#FFD45C"
                  : entry.layer === "visor"
                    ? "#00E5FF"
                    : "#00E5FF";

          const holo = createOrganHoloMaterial(holoPrimary, "#8A5CFF");
          const thermal = createThermalMaterial(entry.thermalHeat, entry.layer === "outer");
          const xray = createOrganHoloMaterial(
            entry.layer === "internal" ? "#00E5FF" : "#9FE8FF",
            "#008CFF",
          );

          const eng = new THREE.MeshPhysicalMaterial({
            color:
              entry.layer === "mli"
                ? new THREE.Color("#FFD45C")
                : entry.layer === "internal" || entry.layer === "hud" || entry.layer === "bladder"
                  ? entry.realisticColor
                  : new THREE.Color("#1E3A5F"),
            roughness: entry.layer === "internal" ? 0.25 : 0.45,
            metalness: entry.layer === "internal" ? 0.78 : 0.35,
            wireframe: entry.layer === "bladder",
            transparent: true,
            opacity:
              entry.layer === "outer" || entry.layer === "plss_shell"
                ? 0.2
                : entry.layer === "bladder" || entry.layer === "mli"
                  ? 0.22
                  : 0.94,
            depthWrite: entry.layer === "internal" || entry.layer === "hud",
            side: THREE.DoubleSide,
          });

          this.suitEntryMats.set(entry, {
            realistic: entry.baseRealisticMat,
            holo,
            xray,
            thermal,
            engineering: eng,
          });

          // Measure rest bounds relative to unrotated twinGroup in world coords
          const prevRotY = this.twin.twinGroup.rotation.y;
          this.twin.twinGroup.rotation.y = 0;
          this.twin.twinGroup.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(entry.mesh);
          this.twin.twinGroup.rotation.y = prevRotY;

          if (!accumBoxes[entry.componentId]) accumBoxes[entry.componentId] = b;
          else accumBoxes[entry.componentId]!.union(b);
        }

        for (const [id, box] of Object.entries(accumBoxes)) {
          if (box) {
            this.suitWorldCenters[id as SuitComponentId] = box.getCenter(new THREE.Vector3());
          }
        }

        builtSuit.setExplode(this.currentExplodeProgress);
        this.applyStateVisuals();
        if (this.state.animationMode !== "playing") {
          this.requestRender();
        }
      } catch (err) {
        console.warn("Spacesuit preload failed:", err);
      }
    })();
    return this.suitLoadingPromise;
  }

  public updateState(nextState: SimulationState) {
    const scenarioChanged = nextState.suitScenarioId !== this.state.suitScenarioId;
    this.state = nextState;
    if (nextState.suitActive && !this.suit) {
      void this.ensureSpacesuitLoaded();
    }
    if (scenarioChanged) {
      this.latestSnapshot = buildTelemetrySnapshot(nextState.suitScenarioId, this.elapsedTime);
      this.suit?.updateHudDisplays(this.latestSnapshot);
    }
    this.applyStateVisuals();
    this.startOrSyncLoop();
    if (this.state.animationMode !== "playing") {
      this.requestRender();
    }
  }

  /** Spaceflight Emergency Simulation state (null = no scenario). */
  public setEmergency(visual: EmergencyVisualState | null) {
    this.emergencyVisual = visual;
    this.emergency?.setState(
      visual ?? { scenario: null, level: 0, preview: false, view: "emergency", paused: false },
    );
    this.applyStateVisuals();
    this.startOrSyncLoop();
    if (this.state.animationMode !== "playing") this.requestRender();
  }

  public updateTelemetrySnapshot(snapshot: SuitTelemetrySnapshot) {
    this.latestSnapshot = snapshot;
    this.suit?.updateHudDisplays(snapshot);
    this.applyStateVisuals();
  }

  public focusCameraPreset(preset: CameraPresetId) {
    const p = CAMERA_PRESETS[preset] || CAMERA_PRESETS.reset;
    this.animateCameraTo(p.position, p.target);
  }

  public focusOnOrgan(organId: AnatomyId, closeZoom = false) {
    const meta = ANATOMY_BY_ID[organId];
    if (!meta) return;

    const measured = this.twin?.organCenters[organId];
    const target: [number, number, number] = measured
      ? [measured.x, measured.y, measured.z]
      : meta.focusTarget;

    const offset = meta.focusCameraOffset;
    const scale = closeZoom ? 0.72 : 1.0;
    // The mode switch and vitals HUD sit over the top of the viewport, so aim slightly
    // above the organ: it then lands a little below centre, clear of the overlays.
    const dist = Math.hypot(offset[0], offset[1], offset[2]) * scale;
    const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const lift = viewH * 0.07;
    const aim: [number, number, number] = [target[0], target[1] + lift, target[2]];
    const pos: [number, number, number] = [
      aim[0] + offset[0] * scale,
      aim[1] + offset[1] * scale,
      aim[2] + offset[2] * scale,
    ];
    this.animateCameraTo(pos, aim);
  }

  private shotTarget(focus: CinematicShot["focus"]): THREE.Vector3 | null {
    if (focus.kind === "point") return new THREE.Vector3(...focus.p);
    if (focus.kind === "organ") {
      const c = this.twin?.organCenters[focus.id];
      if (c) return c.clone();
      const meta = ANATOMY_BY_ID[focus.id];
      return meta ? new THREE.Vector3(...meta.focusTarget) : null;
    }
    if (focus.kind === "emergency") {
      if (!this.twin || !this.emergency?.getAnchorLocal(_vec3)) return null;
      const g = this.twin.twinGroup;
      const unrotated = new THREE.Matrix4().compose(g.position, new THREE.Quaternion(), g.scale);
      if (g.parent) unrotated.premultiply(g.parent.matrixWorld);
      return _vec3.clone().applyMatrix4(unrotated);
    }
    return new THREE.Vector3(...CAMERA_PRESETS.reset.target);
  }

  /** Choreographed camera move: dolly to a framing, then an optional slow orbit while the narrator speaks. */
  public cinematic(shot: CinematicShot): boolean {
    const target = this.shotTarget(shot.focus);
    if (!target) return false;
    this.cinematicActive = true;
    this.cancelCameraTweens();
    const d = shot.distance;
    const el = THREE.MathUtils.degToRad(shot.elevation ?? 6);
    const az0 = THREE.MathUtils.degToRad(shot.azimuth ?? 0);
    const place = (az: number, out: THREE.Vector3) =>
      out.set(target.x + d * Math.sin(az) * Math.cos(el), target.y + d * Math.sin(el), target.z + d * Math.cos(az) * Math.cos(el));
    const pos = place(az0, new THREE.Vector3());
    const duration = this.isSoftwareGl ? Math.min(1, shot.duration ?? 2.4) : shot.duration ?? 2.4;
    const ease = shot.ease ?? "power3.inOut";
    const redraw = () => {
      this.controls.update();
      if (this.state.animationMode !== "playing") this.requestRender();
    };

    if (this.twin) {
      const cur = this.twin.twinGroup.rotation.y;
      this.twin.twinGroup.rotation.y = Math.atan2(Math.sin(cur), Math.cos(cur));
      this.activeRotationTween = gsap.to(this.twin.twinGroup.rotation, { y: 0, duration, ease });
    }
    this.activeTargetTween = gsap.to(this.controls.target, { x: target.x, y: target.y, z: target.z, duration, ease, onUpdate: redraw });
    this.activeCameraTween = gsap.to(this.camera.position, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      duration,
      ease,
      onUpdate: redraw,
      onComplete: () => {
        if (!shot.orbit) return;
        const proxy = { a: az0 };
        const tmp = new THREE.Vector3();
        this.orbitTween = gsap.to(proxy, {
          a: az0 + THREE.MathUtils.degToRad(shot.orbit),
          duration: shot.orbitDuration ?? 10,
          ease: "sine.inOut",
          onUpdate: () => {
            this.camera.position.copy(place(proxy.a, tmp));
            redraw();
          },
        });
      },
    });
    return true;
  }

  /** Hand the camera back to the user: stop choreography and resume normal behaviour. */
  public endCinematic() {
    this.cinematicActive = false;
    this.orbitTween?.kill();
    this.orbitTween = null;
  }

  /** Frame the active emergency's anatomical anchor (e.g. the jugular vein, not the whole torso). */
  public focusOnEmergency(closeZoom = false): boolean {
    if (!this.twin || !this.emergency?.getAnchorLocal(_vec3)) return false;
    const g = this.twin.twinGroup;
    // animateCameraTo turns the twin back to rotation 0, so frame the anchor as it will sit then.
    const unrotated = new THREE.Matrix4().compose(g.position, new THREE.Quaternion(), g.scale);
    if (g.parent) unrotated.premultiply(g.parent.matrixWorld);
    const target = _vec3.clone().applyMatrix4(unrotated);
    const dist = closeZoom ? 0.55 : 0.9;
    const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const aim: [number, number, number] = [target.x, target.y + viewH * 0.06, target.z];
    const pos: [number, number, number] = [aim[0] + dist * 0.12, aim[1] + dist * 0.06, aim[2] + dist];
    this.animateCameraTo(pos, aim);
    return true;
  }

  public focusOnSuitComponent(componentId: SuitComponentId, closeZoom = false) {
    const meta = SUIT_COMPONENT_BY_ID[componentId];
    if (!meta) return;

    const measured = this.suitWorldCenters[componentId];
    const target: [number, number, number] = measured
      ? [measured.x, measured.y, measured.z]
      : meta.focusTarget;

    const offset = meta.focusCameraOffset;
    const scale = closeZoom ? 0.74 : 1.0;
    const pos: [number, number, number] = [
      target[0] + offset[0] * scale,
      target[1] + offset[1] * scale,
      target[2] + offset[2] * scale,
    ];
    this.animateCameraTo(pos, target);
  }

  private animateCameraTo(
    pos: [number, number, number],
    target: [number, number, number],
  ) {
    this.cancelCameraTweens();
    const duration = this.isSoftwareGl ? 0.35 : 0.75;

    if (this.twin) {
      const cur = this.twin.twinGroup.rotation.y;
      const shortest = Math.atan2(Math.sin(cur), Math.cos(cur));
      this.twin.twinGroup.rotation.y = shortest;
      if (Math.abs(shortest) > 0.001) {
        this.activeRotationTween = gsap.to(this.twin.twinGroup.rotation, {
          y: 0,
          duration,
          ease: "power2.out",
        });
      }
    }

    this.activeCameraTween = gsap.to(this.camera.position, {
      x: pos[0],
      y: pos[1],
      z: pos[2],
      duration,
      ease: "power2.out",
      onUpdate: () => {
        this.controls.update();
        if (this.state.animationMode !== "playing") {
          this.requestRender();
        }
      },
    });

    this.activeTargetTween = gsap.to(this.controls.target, {
      x: target[0],
      y: target[1],
      z: target[2],
      duration,
      ease: "power2.out",
      onUpdate: () => {
        this.controls.update();
        if (this.state.animationMode !== "playing") {
          this.requestRender();
        }
      },
    });
  }

  private cancelCameraTweens() {
    this.orbitTween?.kill();
    this.orbitTween = null;
    this.activeCameraTween?.kill();
    this.activeTargetTween?.kill();
    this.activeRotationTween?.kill();
    this.activeCameraTween = null;
    this.activeTargetTween = null;
    this.activeRotationTween = null;
  }

  private getAlertSeverityForComponent(componentId: SuitComponentId): "warning" | "critical" | null {
    let worst: "warning" | "critical" | null = null;
    for (const alert of this.latestSnapshot.alerts) {
      if (alert.componentId === componentId) {
        if (alert.severity === "critical") return "critical";
        worst = "warning";
      }
    }
    return worst;
  }

  private applyStateVisuals() {
    if (!this.twin) return;
    const {
      mode: rawMode,
      selectedOrganId,
      selectedSuitComponentId,
      isolated,
      visualizationIntensity,
      thermalIntensity,
      display,
      suitActive,
    } = this.state;
    // MRI reuses the x-ray tissue materials; the grayscale look and the slice are layered on top.
    const mode = rawMode === "mri" ? "xray" : rawMode;

    const suitAlpha = this.currentSuitProgress;
    const explodeAmt = this.currentExplodeProgress;
    const suitVisibleNow = suitAlpha > 0.01 && Boolean(this.suit);

    // 1. Surface & emitter particles
    if (this.twin.surfaceParticles && this.twin.surfaceParticleMat) {
      const showSurfacePts =
        display.showParticles &&
        !isolated &&
        !suitVisibleNow &&
        (mode === "holographic" || mode === "nervous" || mode === "organ");
      this.twin.surfaceParticles.visible = showSurfacePts;
      this.twin.surfaceParticleMat.uniforms.uOpacity.value =
        mode === "holographic" ? 0.65 * visualizationIntensity : 0.25;
      this.twin.surfaceParticleMat.uniforms.uColor.value.set(
        mode === "nervous" ? "#8A5CFF" : "#00E5FF",
      );
    }

    this.twin.emitterMotes.visible = display.showParticles;

    // 2. Outer Human Body Skin Silhouette (becomes sheer inner silhouette when suit is worn)
    const showBodySkin = display.showSkinShell && !(isolated && selectedOrganId === null ? false : isolated && selectedSuitComponentId !== null);
    for (const skin of this.twin.bodySkinMeshes) {
      skin.visible = showBodySkin && !(isolated && selectedSuitComponentId !== null);
      if (!skin.visible) continue;

      const suitDim = suitVisibleNow ? 0.38 : 1.0;

      if (mode === "thermal") {
        skin.material = this.skinThermalMat;
        this.skinThermalMat.uniforms.uIntensity.value = thermalIntensity;
        this.skinThermalMat.uniforms.uOpacity.value =
          (selectedOrganId || selectedSuitComponentId ? 0.22 : 0.6) * suitDim;
      } else if (mode === "xray") {
        skin.material = this.skinXrayMat;
        this.skinXrayMat.uniforms.uIntensity.value = visualizationIntensity;
        this.skinXrayMat.uniforms.uOpacity.value = 0.16 * suitDim;
      } else if (mode === "realistic" && !suitVisibleNow) {
        skin.material = this.skinRealisticMat;
        this.skinRealisticMat.opacity = selectedOrganId ? 0.1 : 0.2;
      } else {
        skin.material = this.skinHoloMat;
        this.skinHoloMat.uniforms.uIntensity.value = visualizationIntensity;
        this.skinHoloMat.uniforms.uScanEnabled.value = display.showScanLines ? 1.0 : 0.0;
        const opacityByMode =
          mode === "holographic"
            ? 0.44
            : mode === "organ"
              ? 0.12
              : mode === "muscular"
                ? 0.08
                : 0.18;
        this.skinHoloMat.uniforms.uOpacity.value =
          (selectedOrganId || selectedSuitComponentId ? opacityByMode * 0.55 : opacityByMode) *
          suitDim;
      }
    }

    // 3. Internal Human Organs / Bones / Muscles / Nerves / Vessels
    for (const entry of this.twin.organEntries) {
      const mats = this.entryMats.get(entry);
      if (!mats) continue;

      if (entry.organId === "lymph") {
        entry.mesh.visible =
          !isolated && !suitVisibleNow && (mode === "holographic" || mode === "organ");
        entry.mesh.material = mats.holo;
        mats.holo.uniforms.uOpacity.value = 0.45;
        mats.holo.uniforms.uDimmed.value = selectedOrganId ? 1.0 : 0.0;
        continue;
      }

      const organId = entry.organId;
      const hiddenByIsolation = isStructureHiddenByIsolation(this.state, organId);
      if (hiddenByIsolation) {
        entry.mesh.visible = false;
        continue;
      }

      const isSelected =
        selectedOrganId === organId ||
        (selectedOrganId === "nervous" && organId === "brain") ||
        (selectedOrganId === "circulatory" && organId === "heart") ||
        (selectedOrganId === "skeletal" && organId === "spine");

      const dimmed = isStructureDimmed(this.state, organId) && !isSelected;

      let modeVisible = true;
      let modeOpacity = 0.92;

      if (!isSelected && !isolated) {
        if (suitVisibleNow) {
          // Inside Spacesuit: preserve anatomy gently according to visualization mode!
          if (mode === "realistic") {
            modeVisible = false;
          } else if (mode === "xray") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.86;
            else modeOpacity = 0.18;
          } else if (mode === "organ") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.16;
            else modeOpacity = 0.92;
          } else if (mode === "muscular") {
            if (entry.role === "muscle") modeOpacity = 0.94;
            else if (entry.role === "bone") modeOpacity = 0.24;
            else modeVisible = false;
          } else if (mode === "nervous") {
            if (entry.role === "nerve" || organId === "brain") modeOpacity = 0.96;
            else if (entry.role === "bone") modeOpacity = 0.16;
            else modeVisible = false;
          } else if (mode === "engineering") {
            if (entry.role === "bone") modeOpacity = 0.22;
            else if (entry.role === "organ" && (organId === "heart" || organId === "lungs" || organId === "brain"))
              modeOpacity = 0.34;
            else modeVisible = false;
          } else if (mode === "ai_monitoring") {
            if (organId === "heart" || organId === "lungs" || organId === "brain") modeOpacity = 0.78;
            else if (entry.role === "bone") modeOpacity = 0.18;
            else modeVisible = false;
          } else if (mode === "thermal") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.35;
            else modeOpacity = 0.88;
          } else {
            // holographic astronaut shows glowing internal spine, skull, heart, lungs, brain subtly
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.34;
            else modeOpacity = 0.62;
          }
        } else {
          if (mode === "holographic") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.62;
            else modeOpacity = 0.88;
          } else if (mode === "xray") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.96;
            else modeOpacity = 0.14;
          } else if (mode === "organ") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.18;
            else if (entry.role === "nerve") modeOpacity = 0.25;
            else modeOpacity = 0.96;
          } else if (mode === "muscular") {
            if (entry.role === "muscle") modeOpacity = 0.98;
            else if (entry.role === "bone") modeOpacity = 0.28;
            else modeVisible = false;
          } else if (mode === "nervous") {
            if (entry.role === "nerve" || organId === "brain") modeOpacity = 0.98;
            else if (entry.role === "bone") modeOpacity = 0.18;
            else modeVisible = false;
          } else if (mode === "thermal") {
            if (entry.role === "muscle") modeVisible = false;
            else if (entry.role === "bone") modeOpacity = 0.45;
            else modeOpacity = 0.95;
          } else if (mode === "realistic") {
            if (entry.role === "muscle") modeOpacity = 0.22;
            else modeOpacity = 0.96;
          }
        }
      }

      entry.mesh.visible = modeVisible;
      if (!modeVisible) continue;

      if (mode === "thermal") {
        entry.mesh.material = mats.thermal;
        mats.thermal.uniforms.uIntensity.value = thermalIntensity;
        mats.thermal.uniforms.uOpacity.value = isSelected ? 1.0 : modeOpacity;
        mats.thermal.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
        mats.thermal.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
      } else if (mode === "xray") {
        entry.mesh.material = mats.xray;
        mats.xray.uniforms.uIntensity.value = visualizationIntensity;
        mats.xray.uniforms.uOpacity.value = isSelected ? 0.98 : modeOpacity;
        mats.xray.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
        mats.xray.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
      } else if (mode === "realistic" || (mode === "muscular" && entry.role === "muscle")) {
        entry.mesh.material = mats.realistic;
        const targetOp = dimmed ? 0.18 : isSelected ? 1.0 : modeOpacity;
        const useTransparent = targetOp < 0.97;
        if (mats.realistic.transparent !== useTransparent) {
          mats.realistic.transparent = useTransparent;
          mats.realistic.depthWrite = !useTransparent;
          mats.realistic.needsUpdate = true;
        }
        mats.realistic.opacity = targetOp;
        const showCyanTint = isSelected && !isolated && !entry.mesh.name.startsWith("PROC_brain_");
        mats.realistic.emissive.set(showCyanTint ? "#00E5FF" : "#000000");
        mats.realistic.emissiveIntensity = showCyanTint ? 0.14 : 0.0;
      } else if ((mode === "nervous" || mode === "holographic" || mode === "ai_monitoring") && mats.pulse) {
        entry.mesh.material = mats.pulse;
        mats.pulse.uniforms.uIntensity.value = visualizationIntensity;
        mats.pulse.uniforms.uOpacity.value = isSelected ? 1.0 : modeOpacity;
        mats.pulse.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
        mats.pulse.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
      } else {
        entry.mesh.material = mats.holo;
        mats.holo.uniforms.uIntensity.value = visualizationIntensity;
        mats.holo.uniforms.uOpacity.value = isSelected ? 1.0 : modeOpacity;
        mats.holo.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
        mats.holo.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
        mats.holo.uniforms.uScanEnabled.value = display.showScanLines ? 1.0 : 0.0;
      }
    }

    // 4. Astronaut Spacesuit & Modular Sub-Assemblies
    if (this.suit) {
      this.suit.suitGroup.visible = suitAlpha > 0.01;
      const scaleBlend = 0.94 + 0.06 * suitAlpha;
      this.suit.suitGroup.scale.setScalar(scaleBlend);

      if (this.suit.suitGroup.visible) {
        for (const entry of this.suit.entries) {
          const mats = this.suitEntryMats.get(entry);
          if (!mats) continue;

          if (isSuitComponentHiddenByIsolation(this.state, entry.componentId)) {
            entry.mesh.visible = false;
            continue;
          }

          const isSelected = selectedSuitComponentId === entry.componentId;
          const dimmed =
            (Boolean(selectedOrganId) && !isSelected) ||
            (isSuitComponentDimmed(this.state, entry.componentId) && !isSelected);

          const isInternalLayer =
            entry.layer === "internal" || entry.layer === "bladder" || entry.layer === "mli";
          const isOuterShell = entry.layer === "outer" || entry.layer === "plss_shell";

          // Layer visibility by mode & explodeProgress
          let visible = true;
          let opacity = 0.94;

          if (!isSelected && !isolated) {
            if (mode === "realistic") {
              if (isInternalLayer && explodeAmt < 0.08) visible = false;
              else opacity = entry.layer === "visor" ? 0.58 : 0.98;
            } else if (mode === "engineering") {
              if (isOuterShell) opacity = 0.16;
              else if (entry.layer === "bladder") opacity = 0.28;
              else if (entry.layer === "mli") opacity = 0.14;
              else opacity = 0.96;
            } else if (mode === "ai_monitoring") {
              if (entry.layer === "hud") opacity = 1.0;
              else if (entry.layer === "internal") opacity = 0.88;
              else if (entry.layer === "bladder" || entry.layer === "mli") visible = explodeAmt > 0.08;
              else if (entry.layer === "visor") opacity = 0.36;
              else opacity = 0.32;
            } else if (mode === "xray") {
              if (entry.layer === "internal") opacity = 0.85;
              else if (entry.layer === "bladder" || entry.layer === "mli") opacity = 0.25;
              else opacity = 0.15;
            } else if (mode === "organ" || mode === "muscular" || mode === "nervous") {
              if (isInternalLayer) visible = explodeAmt > 0.12;
              else opacity = 0.14;
            } else if (mode === "thermal") {
              if (entry.layer === "bladder" || entry.layer === "mli") visible = explodeAmt > 0.1;
              else if (entry.layer === "internal") opacity = 0.88;
              else opacity = 0.58;
            } else {
              // holographic suit mode
              if (entry.layer === "bladder" || entry.layer === "mli") visible = explodeAmt > 0.08;
              else if (entry.layer === "internal") opacity = explodeAmt > 0.08 ? 0.92 : 0.52;
              else if (entry.layer === "visor") opacity = 0.44;
              else opacity = 0.42;
            }
          }

          entry.mesh.visible = visible;
          if (!visible) continue;

          const effectiveOpacity = Math.max(0.06, opacity * suitAlpha);
          const alertSev =
            mode === "ai_monitoring" || this.latestSnapshot.overallStatus !== "normal"
              ? this.getAlertSeverityForComponent(entry.componentId)
              : null;

          // Select active material shader for suit entry
          if (entry.layer === "hud" && (entry.mesh.name.includes("screen"))) {
            // Keep live CanvasTexture crisp in every visualization mode!
            entry.mesh.material = mats.realistic;
            const bm = mats.realistic as THREE.MeshBasicMaterial;
            bm.opacity = Math.min(1, suitAlpha * (dimmed ? 0.35 : 0.98));
            continue;
          }

          if (mode === "thermal") {
            entry.mesh.material = mats.thermal;
            // Cooling loop shifts cooler when healthy, hotter during thermal spike scenario
            let dynamicHeat = entry.thermalHeat;
            if (entry.componentId === "cooling_system") {
              dynamicHeat = this.latestSnapshot.lifeSupport.coolingPerformancePct.status === "critical" ? 0.92 : 0.18;
            } else if (entry.componentId === "electrical_power") {
              dynamicHeat = 0.82;
            }
            mats.thermal.uniforms.uBaseHeat.value = dynamicHeat;
            mats.thermal.uniforms.uIntensity.value = thermalIntensity;
            mats.thermal.uniforms.uOpacity.value = isSelected ? 0.98 : effectiveOpacity;
            mats.thermal.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
            mats.thermal.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
          } else if (mode === "xray") {
            entry.mesh.material = mats.xray;
            mats.xray.uniforms.uIntensity.value = visualizationIntensity;
            mats.xray.uniforms.uOpacity.value = isSelected ? 0.96 : effectiveOpacity;
            mats.xray.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
            mats.xray.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
          } else if (mode === "realistic" && (entry.isZ2Baked || entry.layer === "visor" || entry.layer === "hud" || entry.layer === "internal")) {
            entry.mesh.material = mats.realistic;
            const std = mats.realistic as THREE.MeshStandardMaterial;
            const targetOp = dimmed ? 0.16 * suitAlpha : isSelected ? 1.0 : effectiveOpacity;
            const isVisor = entry.layer === "visor";
            const useTransparent = isVisor || dimmed || suitAlpha < 0.98 || targetOp < 0.97;
            if (std.transparent !== useTransparent) {
              std.transparent = useTransparent;
              std.depthWrite = !useTransparent;
              std.needsUpdate = true;
            }
            std.opacity = targetOp;
            if ("emissive" in std) {
              if (alertSev === "critical") {
                std.emissive.set("#FF3158");
                std.emissiveIntensity = 0.45;
              } else if (alertSev === "warning") {
                std.emissive.set("#FF8C42");
                std.emissiveIntensity = 0.32;
              } else {
                std.emissive.set(isSelected ? "#00E5FF" : "#000000");
                std.emissiveIntensity = isSelected ? 0.25 : 0.0;
              }
            }
          } else if (mode === "engineering") {
            if (isOuterShell) {
              entry.mesh.material = mats.holo;
              mats.holo.uniforms.uColor.value.set(
                alertSev === "critical" ? "#FF3158" : alertSev === "warning" ? "#FF8C42" : "#008CFF",
              );
              mats.holo.uniforms.uIntensity.value = visualizationIntensity;
              mats.holo.uniforms.uOpacity.value = isSelected ? 0.85 : effectiveOpacity;
              mats.holo.uniforms.uHighlight.value = isSelected ? 1.0 : 0.0;
              mats.holo.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
              mats.holo.uniforms.uScanEnabled.value = display.showScanLines ? 1.0 : 0.0;
            } else {
              entry.mesh.material = mats.engineering;
              mats.engineering.opacity = dimmed ? 0.18 : isSelected ? 1.0 : effectiveOpacity;
              mats.engineering.emissive.set(
                alertSev === "critical"
                  ? "#FF3158"
                  : alertSev === "warning"
                    ? "#FF8C42"
                    : isSelected
                      ? "#00E5FF"
                      : "#001428",
              );
              mats.engineering.emissiveIntensity = alertSev || isSelected ? 0.35 : 0.08;
            }
          } else {
            // Holographic / AI Monitoring / Inner-Anatomy-overlaid suit shell
            entry.mesh.material = mats.holo;
            const alertColor =
              alertSev === "critical"
                ? "#FF3158"
                : alertSev === "warning"
                  ? "#FF8C42"
                  : entry.layer === "mli"
                    ? "#FFD45C"
                    : entry.layer === "bladder"
                      ? "#008CFF"
                      : entry.componentId === "emergency_oxygen_system"
                        ? "#FF3158"
                        : "#00E5FF";

            mats.holo.uniforms.uColor.value.set(alertColor);
            mats.holo.uniforms.uAccent.value.set(
              alertSev === "critical" ? "#FF8C42" : "#8A5CFF",
            );
            mats.holo.uniforms.uIntensity.value = visualizationIntensity * (alertSev ? 1.25 : 1.0);
            mats.holo.uniforms.uOpacity.value = isSelected ? 0.98 : effectiveOpacity;
            mats.holo.uniforms.uHighlight.value = isSelected || alertSev ? 1.0 : 0.0;
            mats.holo.uniforms.uDimmed.value = dimmed ? 1.0 : 0.0;
            mats.holo.uniforms.uScanEnabled.value = display.showScanLines ? 1.0 : 0.0;
          }
        }
      }
    }

    // Update FX ring accent if alert active in Astronaut Mode
    const alertFxHex =
      suitActive && this.latestSnapshot.overallStatus === "critical"
        ? "#FF3158"
        : suitActive && this.latestSnapshot.overallStatus === "warning"
          ? "#FF8C42"
          : "#00E5FF";
    this.fxHoloMat.uniforms.uColor.value.set(alertFxHex);
    this.beamMat.uniforms.uColor.value.set(alertFxHex);

    // 5. Spaceflight Emergency Simulation overlay: only affected structures change.
    if (this.emergency?.active) {
      this.emergency.applyMaterials(this.twin.organEntries, suitVisibleNow);
      if (suitVisibleNow && this.suit) {
        // Keep the suit on screen but see-through, like an X-ray diagnostic overlay.
        for (const entry of this.suit.entries) {
          const mats = this.suitEntryMats.get(entry);
          if (!mats || !entry.mesh.visible) continue;
          const m = entry.mesh.material as THREE.Material & { uniforms?: Record<string, THREE.IUniform> };
          if (m.uniforms?.uOpacity) {
            m.uniforms.uOpacity.value = Math.min(Number(m.uniforms.uOpacity.value), 0.22);
          } else if ("opacity" in m) {
            if (!m.transparent) {
              m.transparent = true;
              m.depthWrite = false;
              m.needsUpdate = true;
            }
            m.opacity = Math.min(m.opacity, 0.26);
          }
        }
      }
    }
  }

  private bindDomEvents() {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      // Touching the scene always wins over choreography.
      this.endCinematic();
      this.cancelCameraTweens();
    };

    const pickTargetAt = (
      e: MouseEvent,
    ):
      | { kind: "organ"; id: AnatomyId; meshName: string }
      | { kind: "suit"; id: SuitComponentId; openHud: boolean }
      | null => {
      if (!this.twin) return null;
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      // In Astronaut Spacesuit mode, prioritize suit components unless anatomy mode or anatomy-focused
      if (this.state.suitActive && this.suit) {
        const anatomyFocusMode =
          this.state.mode === "organ" ||
          this.state.mode === "muscular" ||
          this.state.mode === "nervous" ||
          Boolean(this.emergency?.active) ||
          Boolean(this.emergencyVisual);

        if (!anatomyFocusMode) {
          const suitHits = this.raycaster.intersectObjects(this.suit.interactables, false);
          const suitHit = suitHits.find((h) => h.object.visible && h.object.userData.suitComponentId);
          if (suitHit) {
            const id = suitHit.object.userData.suitComponentId as SuitComponentId;
            const openHud =
              id === "chest_display" ||
              suitHit.object.name === "SUIT_PROC_wrist_hud_screen";
            return { kind: "suit", id, openHud };
          }
        }
      }

      const organHits = this.raycaster.intersectObjects(this.twin.interactables, false);
      const organHit = organHits.find((h) => h.object.visible && h.object.userData.anatomyId);
      if (organHit) {
        return {
          kind: "organ",
          id: organHit.object.userData.anatomyId as AnatomyId,
          meshName: organHit.object.name,
        };
      }

      if (this.state.suitActive && this.suit) {
        const suitHits = this.raycaster.intersectObjects(this.suit.interactables, false);
        const suitHit = suitHits.find((h) => h.object.visible && h.object.userData.suitComponentId);
        if (suitHit) {
          const id = suitHit.object.userData.suitComponentId as SuitComponentId;
          const openHud =
            id === "chest_display" ||
            suitHit.object.name === "SUIT_PROC_wrist_hud_screen";
          return { kind: "suit", id, openHud };
        }
      }

      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - this.lastHoverCheck < 45) return;
      this.lastHoverCheck = now;
      const hit = pickTargetAt(e);
      dom.style.cursor = hit ? "pointer" : "grab";
    };

    const onClick = (e: MouseEvent) => {
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      if (dist > 6) return;
      const hit = pickTargetAt(e);
      if (!hit) return;
      if (hit.kind === "suit") {
        this.callbacks.onSelectSuitComponent(hit.id, true, hit.openHud);
      } else {
        this.callbacks.onPickMesh?.(hit.meshName);
        this.callbacks.onSelectOrgan(hit.id, true);
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const hit = pickTargetAt(e);
      if (!hit) {
        this.callbacks.onSelectOrgan(null, false);
        this.callbacks.onSelectSuitComponent(null, false);
        this.focusCameraPreset("reset");
        return;
      }
      if (hit.kind === "suit") {
        this.callbacks.onSelectSuitComponent(hit.id, true, hit.openHud);
        this.focusOnSuitComponent(hit.id, true);
      } else {
        this.callbacks.onPickMesh?.(hit.meshName);
        this.callbacks.onSelectOrgan(hit.id, true);
        this.focusOnOrgan(hit.id, true);
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      this.stopLoop();
      this.callbacks.onError("WebGL context lost. Reload or reset viewport.");
    };

    const onResize = () => {
      if (this.disposed) return;
      const w = Math.max(1, this.container.clientWidth);
      const h = Math.max(1, this.container.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer?.setSize(w, h);
      this.bloomPass?.setSize(w, h);
      if (this.state.animationMode !== "playing") {
        this.requestRender();
      }
    };

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(this.container);

    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("click", onClick);
    dom.addEventListener("dblclick", onDblClick);
    dom.addEventListener("webglcontextlost", onContextLost);

    this.cleanupEvents = () => {
      resizeObserver.disconnect();
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("click", onClick);
      dom.removeEventListener("dblclick", onDblClick);
      dom.removeEventListener("webglcontextlost", onContextLost);
    };
  }

  private cleanupEvents: () => void = () => {};

  private stopLoop() {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.frameId = 0;
  }

  private startOrSyncLoop() {
    if (this.disposed) return;
    if (this.state.animationMode === "playing") {
      if (!this.frameId) {
        this.clock.getDelta();
        this.tick();
      }
    } else {
      this.stopLoop();
      this.requestRender();
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === "function") {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private requestRender() {
    if (this.disposed) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      this.renderDirty = false;
      this.advanceScene(0);
      this.drawFrame();
      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty && !this.disposed) {
          this.requestRender();
        }
      };
      if (this.isSoftwareGl) this.afterDraw(done);
      else done();
    });
  }

  private tick = () => {
    if (this.disposed || this.state.animationMode !== "playing") {
      this.frameId = 0;
      return;
    }
    const dt = Math.min(0.1, this.clock.getDelta());
    this.advanceScene(dt);
    this.drawFrame();

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private advanceScene(dt: number) {
    const playing = this.state.animationMode === "playing";
    const disabled = this.state.animationMode === "disabled";
    if (playing) {
      this.elapsedTime += dt;
    }
    const t = disabled ? 0 : this.elapsedTime;

    // Smoothly animate Human <-> Astronaut suit assembly & Exploded View
    const targetSuit = this.state.suitActive ? 1 : 0;
    const targetExplode = this.state.suitActive ? this.state.explodeProgress : 0;
    let needsVisualSync = false;

    if (disabled || dt === 0) {
      if (Math.abs(this.currentSuitProgress - targetSuit) > 0.001) {
        this.currentSuitProgress = targetSuit;
        needsVisualSync = true;
      }
      this.currentExplodeProgress = targetExplode;
    } else {
      const nextSuit = THREE.MathUtils.damp(this.currentSuitProgress, targetSuit, 6.5, dt);
      if (Math.abs(nextSuit - this.currentSuitProgress) > 0.0005) {
        this.currentSuitProgress = Math.abs(nextSuit - targetSuit) < 0.003 ? targetSuit : nextSuit;
        needsVisualSync = true;
      }
      this.currentExplodeProgress = THREE.MathUtils.damp(
        this.currentExplodeProgress,
        targetExplode,
        7.5,
        dt,
      );
      if (Math.abs(this.currentExplodeProgress - targetExplode) < 0.002) {
        this.currentExplodeProgress = targetExplode;
      }
    }

    if (this.suit) {
      this.suit.setExplode(this.currentExplodeProgress);
      const nowHud = performance.now();
      if (playing && this.state.suitActive && nowHud - this.lastHudDrawTime > 1200) {
        this.lastHudDrawTime = nowHud;
        this.latestSnapshot = buildTelemetrySnapshot(this.state.suitScenarioId, t);
        this.suit.updateHudDisplays(this.latestSnapshot);
      }
    }

    if (needsVisualSync) {
      this.applyStateVisuals();
    }

    // Update shader clocks
    this.skinHoloMat.uniforms.uTime.value = t;
    this.skinHoloMat.uniforms.uFlickerEnabled.value = playing ? 1.0 : 0.0;
    this.skinThermalMat.uniforms.uTime.value = t;
    this.skinXrayMat.uniforms.uTime.value = t;
    this.fxHoloMat.uniforms.uTime.value = t;
    this.beamMat.uniforms.uTime.value = t;

    if (this.twin?.surfaceParticleMat) {
      this.twin.surfaceParticleMat.uniforms.uTime.value = t;
    }

    for (const mats of this.entryMats.values()) {
      mats.holo.uniforms.uTime.value = t;
      mats.thermal.uniforms.uTime.value = t;
      mats.xray.uniforms.uTime.value = t;
      if (mats.pulse) mats.pulse.uniforms.uTime.value = t;
    }

    for (const mats of this.suitEntryMats.values()) {
      mats.holo.uniforms.uTime.value = t;
      mats.thermal.uniforms.uTime.value = t;
      mats.xray.uniforms.uTime.value = t;
    }

    if (this.twin) {
      const hasSelection = Boolean(this.state.selectedOrganId || this.state.selectedSuitComponentId);
      // Auto-rotation pauses while an emergency is on screen so it can be inspected.
      if (playing && !hasSelection && !this.activeCameraTween && !this.emergency?.active && !this.cinematicActive) {
        this.twin.twinGroup.rotation.y += dt * 0.14;
      }

      if (playing) {
        const beatScale =
          this.latestSnapshot.vitals.heartRateBpm.value / 72;
        const beatPhase = (t * 1.12 * beatScale) % 1;
        const beat = 1 + 0.055 * Math.exp(-Math.pow((beatPhase - 0.2) * 14, 2));
        const breath = 1 + 0.025 * Math.sin(t * 1.65);

        for (const entry of this.twin.organEntries) {
          if (entry.organId === "heart") {
            entry.mesh.scale.set(
              entry.baseScale.x * beat,
              entry.baseScale.y * beat,
              entry.baseScale.z * beat,
            );
          } else if (entry.organId === "lungs") {
            entry.mesh.scale.set(
              entry.baseScale.x * breath,
              entry.baseScale.y * (1 + (breath - 1) * 1.2),
              entry.baseScale.z * breath,
            );
          }
        }

        this.twin.fxRings.forEach((ring, idx) => {
          ring.rotation.y = t * (idx % 2 === 0 ? 0.18 : -0.14);
        });

        const moteAttr = this.twin.emitterMoteGeo.attributes.position as THREE.BufferAttribute;
        const arr = moteAttr.array as Float32Array;
        const speeds = this.twin.emitterMoteSpeeds;
        for (let i = 0; i < speeds.length; i++) {
          arr[i * 3 + 1] += dt * speeds[i];
          if (arr[i * 3 + 1] > 2.0) arr[i * 3 + 1] = -0.05;
        }
        moteAttr.needsUpdate = true;
      }

      if (this.emergency?.active && this.emergency.update(dt, playing)) {
        this.applyStateVisuals();
      }
    }

    if (this.mriPlane && this.mriBox) {
      const on = this.state.mode === "mri";
      this.mriPlane.visible = on;
      if (on) {
        const f = this.mriManual ?? 0.5 - 0.5 * Math.cos(this.elapsedTime * 0.35); // manual, or feet -> head -> feet in ~18 s
        const lo = this.mriBox.min.y + 0.04;
        this.mriSliceY = lo + f * (this.mriBox.max.y - 0.04 - lo);
        this.mriPlane.position.y = this.mriSliceY;
      }
    }

    this.controls.update();

    const now = performance.now();
    if (now - this.lastTelemetryTime > 85) {
      this.lastTelemetryTime = now;

      _vec3.copy(this.camera.position).sub(this.controls.target);
      const dist = _vec3.length();
      const azimuth = Math.round((Math.atan2(_vec3.x, _vec3.z) * 180) / Math.PI);
      const elevation = Math.round(
        (Math.asin(THREE.MathUtils.clamp(_vec3.y / Math.max(0.001, dist), -1, 1)) * 180) /
          Math.PI,
      );

      this.callbacks.onTelemetry({
        azimuthDeg: azimuth,
        elevationDeg: elevation,
        zoomDistance: Number(dist.toFixed(2)),
        mriSliceY:
          this.state.mode === "mri" && this.mriBox ? Number((this.mriSliceY - this.mriBox.min.y).toFixed(2)) : undefined,
      });

      this.projectLabels();
      this.projectEmergencyAnchor();
    }
  }

  private projectEmergencyAnchor() {
    const cb = this.callbacks.onEmergencyAnchor;
    if (!cb) return;
    if (!this.emergency?.active || !this.emergency.getAnchorWorld(_projVec)) {
      if (this.lastAnchorReported) cb(null);
      this.lastAnchorReported = false;
      return;
    }
    _projVec.project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const sx = (_projVec.x * 0.5 + 0.5) * w;
    const sy = (-_projVec.y * 0.5 + 0.5) * h;
    const visible = _projVec.z > -1 && _projVec.z < 1 && sx > 8 && sx < w - 8 && sy > 8 && sy < h - 8;
    cb({ x: Math.round(sx), y: Math.round(sy), visible });
    this.lastAnchorReported = true;
  }

  private projectLabels() {
    if (!this.twin || !this.state.display.showLabels) {
      this.callbacks.onLabelsProject([]);
      return;
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const rotY = this.twin.twinGroup.rotation.y;
    const labels: LabelProjection[] = [];

    const hasSelection = Boolean(this.state.selectedOrganId || this.state.selectedSuitComponentId);

    // Project suit labels when Astronaut Suit Mode is active & either suit component selected or viewing suit
    const showSuitLabels =
      this.state.suitActive &&
      this.suit &&
      !this.state.selectedOrganId &&
      this.state.mode !== "organ" &&
      this.state.mode !== "muscular" &&
      this.state.mode !== "nervous";

    if (showSuitLabels) {
      const defaultSuitIds: SuitComponentId[] =
        this.state.mode === "engineering"
          ? [
              "helmet_visor",
              "oxygen_supply",
              "co2_removal",
              "cooling_system",
              "electrical_power",
              "pressure_bladder",
            ]
          : this.state.mode === "ai_monitoring"
            ? [
                "helmet_visor",
                "chest_display",
                "wrist_bearings",
                "plss",
                "emergency_oxygen_system",
              ]
            : ["helmet_assembly", "chest_display", "plss", "gloves", "boots"];

      const suitIds: SuitComponentId[] = this.state.selectedSuitComponentId
        ? [this.state.selectedSuitComponentId]
        : defaultSuitIds;

      for (const id of suitIds) {
        const meta = SUIT_COMPONENT_BY_ID[id];
        const baseCenter = this.suitWorldCenters[id];
        if (!meta || !baseCenter) continue;

        _projVec.copy(baseCenter);
        _projVec.addScaledVector(
          new THREE.Vector3(...meta.explodeOffset),
          this.currentExplodeProgress,
        );
        _projVec.x += meta.labelOffset[0] * 0.45;
        _projVec.y += meta.labelOffset[1] * 0.45;
        _projVec.z += meta.labelOffset[2] * 0.45;

        if (!hasSelection) {
          _projVec.applyAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
        }

        _projVec.project(this.camera);
        const inFront = _projVec.z > -1 && _projVec.z < 1;
        const sx = (_projVec.x * 0.5 + 0.5) * width;
        const sy = (-_projVec.y * 0.5 + 0.5) * height;
        const inBounds = sx > 24 && sx < width - 24 && sy > 24 && sy < height - 24;

        labels.push({
          id,
          kind: "suit",
          name: meta.name,
          x: Math.round(sx),
          y: Math.round(sy),
          visible: inFront && inBounds,
          selected: this.state.selectedSuitComponentId === id,
          alertSeverity: this.getAlertSeverityForComponent(id) ?? undefined,
        });
      }
      this.callbacks.onLabelsProject(labels);
      return;
    }

    // Human Anatomy floating holographic labels
    let defaultIds: AnatomyId[] = ["brain", "heart", "lungs", "liver", "stomach", "kidneys"];
    if (this.state.mode === "muscular") {
      defaultIds = ["muscular", "spine"];
    } else if (this.state.mode === "nervous") {
      defaultIds = ["brain", "nervous", "spine"];
    } else if (this.state.mode === "xray") {
      defaultIds = ["skeletal", "spine"];
    }

    const labelIds: AnatomyId[] = this.state.selectedOrganId
      ? [this.state.selectedOrganId]
      : defaultIds;

    for (const id of labelIds) {
      const meta = ANATOMY_BY_ID[id];
      const baseCenter = this.twin.organCenters[id];
      if (!meta || !baseCenter) continue;

      _projVec.copy(baseCenter);
      _projVec.x += meta.labelOffset[0] * 0.45;
      _projVec.y += meta.labelOffset[1] * 0.45;
      _projVec.z += meta.labelOffset[2] * 0.45;
      if (!hasSelection) {
        _projVec.applyAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
      }

      _projVec.project(this.camera);
      const inFront = _projVec.z > -1 && _projVec.z < 1;
      const sx = (_projVec.x * 0.5 + 0.5) * width;
      const sy = (-_projVec.y * 0.5 + 0.5) * height;
      const inBounds = sx > 24 && sx < width - 24 && sy > 24 && sy < height - 24;

      labels.push({
        id,
        kind: "organ",
        name: meta.name,
        x: Math.round(sx),
        y: Math.round(sy),
        visible: inFront && inBounds,
        selected: this.state.selectedOrganId === id,
      });
    }

    this.callbacks.onLabelsProject(labels);
  }

  private drawFrame() {
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.state.mode === "mri" && this.mriBox && this.twin) this.drawMriSlice();
  }

  /** Manual MRI slice position (0 = soles, 1 = crown); null resumes the automatic sweep. */
  public setMriSlice(frac: number | null) {
    this.mriManual = frac === null ? null : THREE.MathUtils.clamp(frac, 0, 1);
    this.requestRender();
  }

  /**
   * Builds the cross-section scene once. Every tissue gets three proxies drawn in order:
   * back faces (+1 stencil), front faces (-1 stencil), then a cap plane where the stencil is non-zero,
   * i.e. exactly where the scan plane is inside that closed mesh. Greys follow a T1-weighted look
   * (fat bright, muscle mid, air and flowing blood dark).
   */
  private buildMriScene() {
    if (!this.twin) return;
    const scene = new THREE.Scene();
    const stencilMat = (side: THREE.Side, op: THREE.StencilOp) => {
      const m = new THREE.MeshBasicMaterial({ side, colorWrite: false, depthWrite: false, depthTest: false });
      m.stencilWrite = true;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilFail = op;
      m.stencilZFail = op;
      m.stencilZPass = op;
      return m;
    };
    const backMat = stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp);
    const frontMat = stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp);
    const capGeo = new THREE.PlaneGeometry(4, 4);
    capGeo.rotateX(-Math.PI / 2);
    const grey = (g: number) => {
      const m = new THREE.MeshBasicMaterial({ depthWrite: false, depthTest: false, toneMapped: false });
      m.color.setRGB(g, g, g, THREE.SRGBColorSpace);
      m.stencilWrite = true;
      m.stencilRef = 0;
      m.stencilFunc = THREE.NotEqualStencilFunc;
      m.stencilFail = THREE.ReplaceStencilOp;
      m.stencilZFail = THREE.ReplaceStencilOp;
      m.stencilZPass = THREE.ReplaceStencilOp;
      return m;
    };
    const ORGAN_GREY: Partial<Record<string, number>> = {
      lungs: 0.05, liver: 0.5, kidneys: 0.56, stomach: 0.3, pancreas: 0.53,
      small_intestine: 0.34, large_intestine: 0.28, heart: 0.42, brain: 0.6,
    };
    const ORGAN_ORDER = ["lungs", "liver", "stomach", "small_intestine", "large_intestine", "pancreas", "kidneys", "heart", "brain"];
    type Src = { mesh: THREE.Mesh; grey: number; rank: number };
    const srcs: Src[] = this.twin.bodySkinMeshes.map((mesh) => ({ mesh, grey: 0.74, rank: 0 }));
    for (const e of this.twin.organEntries) {
      const id = String(e.organId);
      if (e.role === "muscle") srcs.push({ mesh: e.mesh, grey: 0.36, rank: 1 });
      else if (e.role === "bone") srcs.push({ mesh: e.mesh, grey: 0.9, rank: 2 });
      else if (e.role === "nerve") srcs.push({ mesh: e.mesh, grey: 0.66, rank: 20 });
      else if (e.role === "vessel") srcs.push({ mesh: e.mesh, grey: 0.1, rank: 21 });
      else if (e.role === "lymph") srcs.push({ mesh: e.mesh, grey: 0.5, rank: 22 });
      else {
        const i = ORGAN_ORDER.indexOf(id);
        srcs.push({ mesh: e.mesh, grey: ORGAN_GREY[id] ?? 0.46, rank: 3 + (i < 0 ? 4 : i) });
      }
    }
    srcs.sort((p, q) => p.rank - q.rank);
    const greys = new Map<number, THREE.MeshBasicMaterial>();
    this.mriProxies = [];
    srcs.forEach((src, i) => {
      const back = new THREE.Mesh(src.mesh.geometry, backMat);
      const front = new THREE.Mesh(src.mesh.geometry, frontMat);
      let capMat = greys.get(src.grey);
      if (!capMat) {
        capMat = grey(src.grey);
        greys.set(src.grey, capMat);
      }
      const cap = new THREE.Mesh(capGeo, capMat);
      back.renderOrder = i * 3;
      front.renderOrder = i * 3 + 1;
      cap.renderOrder = i * 3 + 2;
      for (const m of [back, front, cap]) {
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        scene.add(m);
      }
      this.mriProxies.push({ src: src.mesh, back, front, cap });
    });
    this.mriScene = scene;
  }

  /** Axial slice monitor (bottom-right): a true filled cross-section of the twin at the scan height. */
  private drawMriSlice() {
    if (!this.mriBox || !this.twin) return;
    if (!this.mriScene) this.buildMriScene();
    if (!this.mriScene) return;
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const s = Math.round(Math.min(size.x, size.y) * 0.3);
    const x = size.x - s - 16;
    const y = 16;
    const y0 = this.mriSliceY;
    const g = this.twin.twinGroup;
    const half = Math.max(this.mriBox.max.x - this.mriBox.min.x, this.mriBox.max.z - this.mriBox.min.z) * 0.36;
    const cam = this.mriCam;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.position.set(g.position.x, y0 + 2, g.position.z);
    cam.up.set(0, 0, -1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, g.rotation.y); // slice stays upright while the twin turns
    cam.lookAt(g.position.x, y0, g.position.z);
    cam.updateMatrixWorld(true);

    for (const p of this.mriProxies) {
      p.back.matrix.copy(p.src.matrixWorld);
      p.front.matrix.copy(p.src.matrixWorld);
      p.back.matrixWorld.copy(p.src.matrixWorld);
      p.front.matrixWorld.copy(p.src.matrixWorld);
      p.cap.matrix.makeTranslation(g.position.x, y0 - 0.0008, g.position.z);
      p.cap.matrixWorld.copy(p.cap.matrix);
    }

    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    r.autoClear = true;
    r.setScissorTest(true);
    r.setScissor(x, y, s, s);
    r.setViewport(x, y, s, s);
    r.setClearColor(0x000000, 1);
    r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), y0)];
    r.render(this.mriScene, cam);
    r.clippingPlanes = [];
    r.setClearColor(prevColor, prevAlpha);
    r.autoClear = prevAuto;
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
  }

  public dispose() {
    this.disposed = true;
    this.cancelCameraTweens();
    this.stopLoop();
    this.cleanupEvents();
    this.emergency?.dispose();
    this.emergency = null;
    this.twin?.dispose();
    this.suit?.dispose();
    this.skinHoloMat.dispose();
    this.skinThermalMat.dispose();
    this.skinXrayMat.dispose();
    this.skinRealisticMat.dispose();
    this.fxHoloMat.dispose();
    this.beamMat.dispose();
    this.muscleTextures.map.dispose();
    this.muscleTextures.bumpMap.dispose();
    for (const mats of this.entryMats.values()) {
      mats.holo.dispose();
      mats.thermal.dispose();
      mats.realistic.dispose();
      mats.xray.dispose();
      mats.pulse?.dispose();
    }
    for (const mats of this.suitEntryMats.values()) {
      mats.holo.dispose();
      mats.thermal.dispose();
      mats.xray.dispose();
      mats.engineering.dispose();
    }
    this.controls.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
