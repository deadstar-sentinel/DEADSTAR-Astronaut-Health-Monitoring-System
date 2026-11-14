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
  ANATOMY_CATALOG,
  CAMERA_PRESETS,
  type AnatomyId,
  type CameraPresetId,
} from "../data/anatomyCatalog.ts";
import {
  isStructureDimmed,
  isStructureHiddenByIsolation,
  type SimulationState,
} from "../utils/simulationState.ts";
import {
  loadAndBuildAnatomyTwin,
  type AnatomyMeshEntry,
  type BuiltAnatomyTwin,
} from "./anatomyBuilder.ts";
import {
  createHologramShellMaterial,
  createLabBackdropTexture,
  createOrganHoloMaterial,
  createPathwayPulseMaterial,
  createStriatedMuscleTextures,
  createThermalMaterial,
} from "./shaders.ts";

export interface LabelProjection {
  id: AnatomyId;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  selected: boolean;
}

export interface TelemetryReadout {
  azimuthDeg: number;
  elevationDeg: number;
  zoomDistance: number;
}

export interface ViewportCallbacks {
  onLoadProgress: (pct: number) => void;
  onReady: (isSoftwareGl: boolean) => void;
  onError: (message: string) => void;
  onSelectOrgan: (id: AnatomyId | null, focusZoom: boolean) => void;
  onTelemetry: (telemetry: TelemetryReadout) => void;
  onLabelsProject: (labels: LabelProjection[]) => void;
}

interface EntryMaterials {
  holo: THREE.ShaderMaterial;
  thermal: THREE.ShaderMaterial;
  realistic: THREE.MeshPhysicalMaterial;
  xray: THREE.ShaderMaterial;
  pulse?: THREE.ShaderMaterial;
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

  private skinHoloMat: THREE.ShaderMaterial;
  private skinThermalMat: THREE.ShaderMaterial;
  private skinXrayMat: THREE.ShaderMaterial;
  private skinRealisticMat: THREE.MeshPhysicalMaterial;
  private fxHoloMat: THREE.ShaderMaterial;
  private beamMat: THREE.ShaderMaterial;
  private muscleTextures: { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture };
  private entryMats = new Map<AnatomyMeshEntry, EntryMaterials>();

  private state: SimulationState;
  private clock = new THREE.Clock();
  private elapsedTime = 0;
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private disposed = false;
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

    // Cancel scripted camera tweens immediately if user interacts manually
    this.controls.addEventListener("start", () => {
      this.cancelCameraTweens();
    });
    this.controls.addEventListener("change", () => {
      if (this.state.animationMode !== "playing") {
        this.requestRender();
      }
    });

    // Studio 3-point medical lighting rig
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

    // Post-processing on hardware GPU only
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
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
      this.scene.add(built.twinGroup);

      // Style projector pedestal FX meshes
      built.twinGroup.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.name === "FX_beam") {
          obj.material = this.beamMat;
        } else if (obj.name.startsWith("FX_")) {
          obj.material = this.fxHoloMat;
        }
      });

      // Build per-entry material bank once
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
        const realistic = new THREE.MeshPhysicalMaterial({
          color: isMuscle ? new THREE.Color("#ffffff") : entry.realisticColor,
          vertexColors: isMuscle,
          map: isMuscle ? this.muscleTextures.map : null,
          bumpMap: isMuscle ? this.muscleTextures.bumpMap : null,
          bumpScale: isMuscle ? 0.011 : 0,
          roughness: entry.realisticRoughness,
          metalness: 0.04,
          sheen: isMuscle ? 0.36 : 0,
          sheenColor: new THREE.Color("#ffd4dc"),
          sheenRoughness: 0.42,
          clearcoat: entry.role === "organ" || entry.role === "vessel" ? 0.35 : 0.06,
          clearcoatRoughness: 0.32,
          transparent: true,
          opacity: 0.96,
        });

        let pulse: THREE.ShaderMaterial | undefined;
        if (entry.role === "nerve") {
          pulse = createPathwayPulseMaterial("#5E4BFF", "#00E5FF", 1.5);
        } else if (entry.role === "vessel") {
          pulse = createPathwayPulseMaterial("#B51D4A", "#FF3DAD", 1.25);
        }

        this.entryMats.set(entry, { holo, thermal, realistic, xray, pulse });
      }

      this.applyStateVisuals();

      if (!this.isSoftwareGl) {
        this.renderer.compile(this.scene, this.camera);
      }

      this.callbacks.onReady(this.isSoftwareGl);
      this.startOrSyncLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load 3D anatomy twin";
      this.callbacks.onError(msg);
    }
  }

  public updateState(nextState: SimulationState) {
    this.state = nextState;
    this.applyStateVisuals();
    this.startOrSyncLoop();
    if (this.state.animationMode !== "playing") {
      this.requestRender();
    }
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
    this.activeCameraTween?.kill();
    this.activeTargetTween?.kill();
    this.activeRotationTween?.kill();
    this.activeCameraTween = null;
    this.activeTargetTween = null;
    this.activeRotationTween = null;
  }

  private applyStateVisuals() {
    if (!this.twin) return;
    const { mode, selectedOrganId, isolated, visualizationIntensity, thermalIntensity, display } =
      this.state;

    // 1. Surface & emitter particles
    if (this.twin.surfaceParticles && this.twin.surfaceParticleMat) {
      const showSurfacePts =
        display.showParticles &&
        !isolated &&
        (mode === "holographic" || mode === "nervous" || mode === "organ");
      this.twin.surfaceParticles.visible = showSurfacePts;
      this.twin.surfaceParticleMat.uniforms.uOpacity.value =
        mode === "holographic" ? 0.65 * visualizationIntensity : 0.25;
      this.twin.surfaceParticleMat.uniforms.uColor.value.set(
        mode === "nervous" ? "#8A5CFF" : "#00E5FF",
      );
    }

    this.twin.emitterMotes.visible = display.showParticles;

    // 2. Outer Body Skin Silhouette
    const showBodySkin = display.showSkinShell && !isolated;
    for (const skin of this.twin.bodySkinMeshes) {
      skin.visible = showBodySkin;
      if (!showBodySkin) continue;

      if (mode === "thermal") {
        skin.material = this.skinThermalMat;
        this.skinThermalMat.uniforms.uIntensity.value = thermalIntensity;
        this.skinThermalMat.uniforms.uOpacity.value = selectedOrganId ? 0.24 : 0.62;
      } else if (mode === "xray") {
        skin.material = this.skinXrayMat;
        this.skinXrayMat.uniforms.uIntensity.value = visualizationIntensity;
        this.skinXrayMat.uniforms.uOpacity.value = 0.16;
      } else if (mode === "realistic") {
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
        this.skinHoloMat.uniforms.uOpacity.value = selectedOrganId
          ? opacityByMode * 0.55
          : opacityByMode;
      }
    }

    // 3. Organ / System meshes
    for (const entry of this.twin.organEntries) {
      const mats = this.entryMats.get(entry);
      if (!mats) continue;

      if (entry.organId === "lymph") {
        entry.mesh.visible = !isolated && (mode === "holographic" || mode === "organ");
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

      // Mode-level structural visibility rules (unless explicitly selected or isolated)
      let modeVisible = true;
      let modeOpacity = 0.92;

      if (!isSelected && !isolated) {
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
        mats.realistic.opacity = dimmed ? 0.18 : isSelected ? 1.0 : modeOpacity;
        mats.realistic.emissive.set(isSelected ? "#00E5FF" : "#000000");
        mats.realistic.emissiveIntensity = isSelected ? 0.22 : 0.0;
      } else if ((mode === "nervous" || mode === "holographic") && mats.pulse) {
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
  }

  private bindDomEvents() {
    const dom = this.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - this.lastHoverCheck < 45) return;
      this.lastHoverCheck = now;
      if (!this.twin) return;

      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.twin.interactables, false);
      const visibleHit = hits.find((h) => h.object.visible && h.object.userData.anatomyId);
      dom.style.cursor = visibleHit ? "pointer" : "grab";
    };

    const pickAnatomyAt = (e: MouseEvent): AnatomyId | null => {
      if (!this.twin) return null;
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.twin.interactables, false);
      const visibleHit = hits.find((h) => h.object.visible && h.object.userData.anatomyId);
      return (visibleHit?.object.userData.anatomyId as AnatomyId) ?? null;
    };

    const onClick = (e: MouseEvent) => {
      const dist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y,
      );
      if (dist > 6) return; // Ignore orbit drags
      const hitId = pickAnatomyAt(e);
      if (hitId) {
        this.callbacks.onSelectOrgan(hitId, true);
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const hitId = pickAnatomyAt(e);
      if (hitId) {
        this.callbacks.onSelectOrgan(hitId, true);
        this.focusOnOrgan(hitId, true);
      } else {
        this.callbacks.onSelectOrgan(null, false);
        this.focusCameraPreset("reset");
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
    if (playing) {
      this.elapsedTime += dt;
    }
    const t = this.state.animationMode === "disabled" ? 0 : this.elapsedTime;

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

    if (this.twin) {
      // Gentle idle rotation when no organ is focused & animation is playing
      if (playing && !this.state.selectedOrganId && !this.activeCameraTween) {
        this.twin.twinGroup.rotation.y += dt * 0.14;
      }

      // Heartbeat & lung respiration & rotating projector rings
      if (playing) {
        const beatPhase = (t * 1.12) % 1;
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
    }

    this.controls.update();

    // Update projected 2D labels & telemetry at ~12Hz to avoid React thrashing
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
      });

      this.projectLabels();
    }
  }

  private projectLabels() {
    if (!this.twin || !this.state.display.showLabels) {
      this.callbacks.onLabelsProject([]);
      return;
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const rotY = this.twin.twinGroup.rotation.y;

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

    const labels: LabelProjection[] = [];
    for (const id of labelIds) {
      const meta = ANATOMY_BY_ID[id];
      const baseCenter = this.twin.organCenters[id];
      if (!meta || !baseCenter) continue;

      _projVec.copy(baseCenter);
      _projVec.x += meta.labelOffset[0] * 0.45;
      _projVec.y += meta.labelOffset[1] * 0.45;
      _projVec.z += meta.labelOffset[2] * 0.45;
      // Rotate local offset with twinGroup Y rotation around world origin
      if (!this.state.selectedOrganId) {
        _projVec.applyAxisAngle(THREE.Object3D.DEFAULT_UP, rotY);
      }

      _projVec.project(this.camera);
      const inFront = _projVec.z > -1 && _projVec.z < 1;
      const sx = (_projVec.x * 0.5 + 0.5) * width;
      const sy = (-_projVec.y * 0.5 + 0.5) * height;
      const inBounds = sx > 24 && sx < width - 24 && sy > 24 && sy < height - 24;

      labels.push({
        id,
        name: meta.name,
        x: Math.round(sx),
        y: Math.round(sy),
        visible: inFront && inBounds,
        selected: this.state.selectedOrganId === id,
      });
    }

    // Also include labels for catalog consistency check if hovered/selected
    void ANATOMY_CATALOG;
    this.callbacks.onLabelsProject(labels);
  }

  private drawFrame() {
    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  public dispose() {
    this.disposed = true;
    this.cancelCameraTweens();
    this.stopLoop();
    this.cleanupEvents();
    this.twin?.dispose();
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
    this.controls.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
