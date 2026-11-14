import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SUIT_COMPONENT_BY_ID, type SuitComponentId } from "../data/spacesuitCatalog.ts";
import type { SuitTelemetrySnapshot } from "../utils/telemetryEngine.ts";

export interface SuitMeshEntry {
  mesh: THREE.Mesh;
  componentId: SuitComponentId;
  layer: "outer" | "plss_shell" | "internal" | "visor" | "hud" | "bladder" | "mli";
  restPosition: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  baseRealisticMat: THREE.Material;
  realisticColor: THREE.Color;
  thermalHeat: number;
  isZ2Baked: boolean;
}

export interface BuiltSpacesuit {
  suitGroup: THREE.Group;
  entries: SuitMeshEntry[];
  interactables: THREE.Object3D[];
  componentCenters: Partial<Record<SuitComponentId, THREE.Vector3>>;
  dcmScreenCanvas: HTMLCanvasElement;
  dcmScreenCtx: CanvasRenderingContext2D | null;
  dcmScreenTex: THREE.CanvasTexture;
  wristScreenCanvas: HTMLCanvasElement;
  wristScreenCtx: CanvasRenderingContext2D | null;
  wristScreenTex: THREE.CanvasTexture;
  updateHudDisplays: (snapshot: SuitTelemetrySnapshot) => void;
  setExplode: (progress: number) => void;
  dispose: () => void;
}

function makeTube(
  points: [number, number, number][],
  radius: number,
  tubularSegments = 28,
  radialSegments = 8,
): THREE.TubeGeometry {
  const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vectors);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

/**
 * Classifies a normalized triangle centroid inside NASA z2.glb into a modular SuitComponentId
 * plus lateral sign (-1 right / 0 center / +1 left) for symmetric exploded disassembly.
 */
function classifyZ2Triangle(
  cx: number,
  cy: number,
  cz: number,
): { componentId: SuitComponentId; side: -1 | 0 | 1 } {
  const absX = Math.abs(cx);
  const side: -1 | 0 | 1 = absX < 0.04 ? 0 : cx >= 0 ? 1 : -1;

  // 1. Helmet assembly (top cranial dome)
  if (cy >= 1.56) {
    return { componentId: "helmet_assembly", side: 0 };
  }

  // 2. Dorsal PLSS backpack cowling
  if (cz <= -0.155 && cy >= 0.94 && cy < 1.60 && absX <= 0.27) {
    return { componentId: "plss", side: 0 };
  }

  // 3. Footwear & Lower Torso / Leg sections
  if (cy < 0.20) {
    return { componentId: "boots", side };
  }
  if (cy < 0.45) {
    return { componentId: "leg_assemblies", side };
  }
  if (cy < 0.61) {
    return { componentId: "knee_joints", side };
  }
  if (cy < 0.85) {
    return { componentId: "hip_joints", side };
  }
  if (cy < 1.07 && absX <= 0.24 && cz > -0.16) {
    return { componentId: "waist_assembly", side: 0 };
  }

  // 4. Arms, Elbows & Gloves (reaching laterally & forward +Z)
  if (cz > 0.34 && cy >= 0.92 && cy <= 1.34 && absX >= 0.15) {
    return { componentId: "gloves", side };
  }
  if (cz > 0.15 && cz <= 0.34 && cy >= 0.95 && cy <= 1.38 && absX >= 0.20) {
    return { componentId: "elbow_joints", side };
  }
  if (absX >= 0.215 && cy >= 1.22 && cy < 1.56) {
    return { componentId: "shoulder_joints", side };
  }

  // 5. Hard Upper Torso & Thermal Micrometeoroid Garment outer shell
  return { componentId: "thermal_protection_layers", side: 0 };
}

/**
 * Splits a single indexed NASA z2.glb mesh into cleanly isolated BufferGeometries per SuitComponentId + side.
 */
function splitZ2GeometryIntoParts(
  sourceGeo: THREE.BufferGeometry,
  normalizeMatrix: THREE.Matrix4,
): Map<string, { geo: THREE.BufferGeometry; componentId: SuitComponentId; side: -1 | 0 | 1 }> {
  const posAttr = sourceGeo.getAttribute("position");
  const normAttr = sourceGeo.getAttribute("normal");
  const uvAttr = sourceGeo.getAttribute("uv");
  const indexAttr = sourceGeo.getIndex();

  const buckets = new Map<
    string,
    {
      componentId: SuitComponentId;
      side: -1 | 0 | 1;
      positions: number[];
      normals: number[];
      uvs: number[];
    }
  >();

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  const nC = new THREE.Vector3();
  const normalMat = new THREE.Matrix3().getNormalMatrix(normalizeMatrix);

  const triCount = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

    vA.fromBufferAttribute(posAttr, i0).applyMatrix4(normalizeMatrix);
    vB.fromBufferAttribute(posAttr, i1).applyMatrix4(normalizeMatrix);
    vC.fromBufferAttribute(posAttr, i2).applyMatrix4(normalizeMatrix);

    const cx = (vA.x + vB.x + vC.x) / 3;
    const cy = (vA.y + vB.y + vC.y) / 3;
    const cz = (vA.z + vB.z + vC.z) / 3;

    const { componentId, side } = classifyZ2Triangle(cx, cy, cz);
    const key = `${componentId}_${side}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { componentId, side, positions: [], normals: [], uvs: [] };
      buckets.set(key, bucket);
    }

    bucket.positions.push(vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, vC.x, vC.y, vC.z);

    if (normAttr) {
      nA.fromBufferAttribute(normAttr, i0).applyMatrix3(normalMat).normalize();
      nB.fromBufferAttribute(normAttr, i1).applyMatrix3(normalMat).normalize();
      nC.fromBufferAttribute(normAttr, i2).applyMatrix3(normalMat).normalize();
      bucket.normals.push(nA.x, nA.y, nA.z, nB.x, nB.y, nB.z, nC.x, nC.y, nC.z);
    }

    if (uvAttr) {
      bucket.uvs.push(
        uvAttr.getX(i0),
        uvAttr.getY(i0),
        uvAttr.getX(i1),
        uvAttr.getY(i1),
        uvAttr.getX(i2),
        uvAttr.getY(i2),
      );
    }
  }

  const out = new Map<
    string,
    { geo: THREE.BufferGeometry; componentId: SuitComponentId; side: -1 | 0 | 1 }
  >();

  for (const [key, b] of buckets.entries()) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(b.positions, 3));
    if (b.normals.length > 0) {
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.normals, 3));
    } else {
      geo.computeVertexNormals();
    }
    if (b.uvs.length > 0) {
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uvs, 2));
    }
    out.set(key, { geo, componentId: b.componentId, side: b.side });
  }

  return out;
}

function drawHudCanvas(
  ctx: CanvasRenderingContext2D | null,
  w: number,
  h: number,
  snapshot: SuitTelemetrySnapshot,
  compact: boolean,
) {
  if (!ctx) return;

  const statusColor =
    snapshot.overallStatus === "critical"
      ? "#FF3158"
      : snapshot.overallStatus === "warning"
        ? "#FF8C42"
        : "#00E5FF";

  ctx.fillStyle = "#030B16";
  ctx.fillRect(0, 0, w, h);

  // Border frame
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = compact ? 4 : 5;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Header bar
  ctx.fillStyle = snapshot.overallStatus === "critical" ? "#3B0A17" : "#08203B";
  ctx.fillRect(8, 8, w - 16, compact ? 36 : 44);

  ctx.fillStyle = statusColor;
  ctx.font = `bold ${compact ? 18 : 20}px monospace`;
  ctx.fillText(
    snapshot.overallStatus === "critical"
      ? "EVA ALERT"
      : snapshot.overallStatus === "warning"
        ? "CAUTION"
        : "EVA NOMINAL",
    16,
    compact ? 32 : 36,
  );

  if (compact) {
    // Wrist telemetry display
    ctx.fillStyle = "#E6F1FF";
    ctx.font = "bold 26px monospace";
    ctx.fillText(`HR ${snapshot.vitals.heartRateBpm.value} BPM`, 16, 80);
    ctx.fillStyle = "#00E5FF";
    ctx.font = "22px monospace";
    ctx.fillText(`O2 ${snapshot.lifeSupport.remainingO2Pct.value}%`, 16, 114);
    ctx.fillText(`SUIT ${snapshot.lifeSupport.suitPressureKpa.value}kPa`, 16, 146);
    ctx.fillStyle = "#8A5CFF";
    ctx.font = "17px monospace";
    ctx.fillText(`BAT ${snapshot.power.batteryPct.value}%`, 16, 176);
  } else {
    // Chest DCM display
    ctx.fillStyle = "#94A3B8";
    ctx.font = "15px monospace";
    ctx.fillText("SIMULATED HUD · CLICK FOR AI MONITOR", 16, 72);

    const rows: [string, string, string][] = [
      [
        "O2 RES",
        `${snapshot.lifeSupport.remainingO2Pct.value}% (${snapshot.lifeSupport.o2TankPressureKpa.value} kPa)`,
        snapshot.lifeSupport.remainingO2Pct.status === "critical" ? "#FF3158" : "#00E5FF",
      ],
      [
        "pCO2",
        `${snapshot.lifeSupport.co2MmHg.value} mmHg`,
        snapshot.lifeSupport.co2MmHg.status === "critical" ? "#FF3158" : "#E6F1FF",
      ],
      [
        "SUIT P",
        `${snapshot.lifeSupport.suitPressureKpa.value} kPa`,
        snapshot.lifeSupport.suitPressureKpa.status === "critical" ? "#FF3158" : "#38BDF8",
      ],
      [
        "HEART",
        `${snapshot.vitals.heartRateBpm.value} BPM · SpO2 ${snapshot.vitals.spo2Pct.value}%`,
        snapshot.vitals.heartRateBpm.status === "critical" ? "#FF3158" : "#34D399",
      ],
      [
        "POWER",
        `${snapshot.power.batteryPct.value}% (${snapshot.power.estOperatingHours}h)`,
        snapshot.power.batteryPct.status === "critical" ? "#FF3158" : "#FFD45C",
      ],
    ];

    rows.forEach(([label, val, col], idx) => {
      const y = 104 + idx * 30;
      ctx.fillStyle = "#64748B";
      ctx.font = "bold 16px monospace";
      ctx.fillText(label, 16, y);
      ctx.fillStyle = col;
      ctx.font = "bold 17px monospace";
      ctx.fillText(val, 98, y);
    });
  }
}

export async function loadAndBuildSpacesuit(
  initialSnapshot: SuitTelemetrySnapshot,
): Promise<BuiltSpacesuit> {
  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.load(
      "/static/models/z2.glb",
      (res) => resolve(res),
      undefined,
      reject,
    );
  });

  const suitGroup = new THREE.Group();
  suitGroup.name = "ASTRONAUT_SPACESUIT_ROOT";

  // Normalize z2.glb geometry onto twinGroup's local coordinates (y ∈ [-0.015, 1.915])
  gltf.scene.updateMatrixWorld(true);
  let rawMesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && !rawMesh) {
      rawMesh = o;
    }
  });
  if (!rawMesh) {
    throw new Error("Spacesuit z2.glb does not contain a valid mesh");
  }
  const z2Mesh = rawMesh as THREE.Mesh;

  const worldBox = new THREE.Box3().setFromObject(z2Mesh);
  const rawHeight = Math.max(0.01, worldBox.max.y - worldBox.min.y);
  const uniformScale = 1.93 / rawHeight;

  const scaledCenter = new THREE.Vector3();
  worldBox.getCenter(scaledCenter).multiplyScalar(uniformScale);
  const scaledMinY = worldBox.min.y * uniformScale;

  // Center X, plant boots at y = -0.015 (same floor contact as twin.glb soles), align Z torso cleanly
  const alignMatrix = new THREE.Matrix4()
    .makeTranslation(-scaledCenter.x, -scaledMinY - 0.015, -scaledCenter.z + 0.07)
    .multiply(new THREE.Matrix4().makeScale(uniformScale, uniformScale, uniformScale))
    .multiply(z2Mesh.matrixWorld);

  const z2Mat = (z2Mesh.material as THREE.MeshStandardMaterial).clone();
  if ("specularIntensity" in z2Mat) {
    (z2Mat as THREE.MeshPhysicalMaterial).specularIntensity = 0.16;
    (z2Mat as THREE.MeshPhysicalMaterial).specularIntensityMap = null;
    (z2Mat as THREE.MeshPhysicalMaterial).specularColorMap = null;
  }
  z2Mat.roughness = 0.72;
  z2Mat.metalness = 0.06;
  if ("bumpScale" in z2Mat) {
    z2Mat.bumpScale = 0.003;
  }
  z2Mat.transparent = false;
  z2Mat.opacity = 1.0;
  z2Mat.side = THREE.FrontSide;
  z2Mat.needsUpdate = true;

  const entries: SuitMeshEntry[] = [];
  const interactables: THREE.Object3D[] = [];

  const registerEntry = (
    mesh: THREE.Mesh,
    componentId: SuitComponentId,
    layer: SuitMeshEntry["layer"],
    realisticMat: THREE.Material,
    explodeScale: [number, number, number] | null = null,
    isZ2Baked = false,
  ) => {
    const meta = SUIT_COMPONENT_BY_ID[componentId];
    mesh.userData.suitComponentId = componentId;
    mesh.material = realisticMat;

    const ex = explodeScale ?? meta.explodeOffset;
    entries.push({
      mesh,
      componentId,
      layer,
      restPosition: mesh.position.clone(),
      explodeOffset: new THREE.Vector3(ex[0], ex[1], ex[2]),
      baseRealisticMat: realisticMat,
      realisticColor: new THREE.Color(meta.realisticColor),
      thermalHeat: meta.thermalBias,
      isZ2Baked,
    });
    interactables.push(mesh);
  };

  // 1. Segmented real NASA z2.glb exterior & modular joint assemblies
  const splitParts = splitZ2GeometryIntoParts(z2Mesh.geometry, alignMatrix);
  for (const [bucketKey, part] of splitParts.entries()) {
    const mesh = new THREE.Mesh(part.geo);
    mesh.name = `SUIT_Z2_${bucketKey}`;
    suitGroup.add(mesh);

    const meta = SUIT_COMPONENT_BY_ID[part.componentId];
    const sideSign = part.side === 0 ? 1 : part.side;
    const explode: [number, number, number] = [
      meta.explodeOffset[0] * (part.side === 0 ? 0 : sideSign),
      meta.explodeOffset[1],
      meta.explodeOffset[2],
    ];

    const layer: SuitMeshEntry["layer"] =
      part.componentId === "plss" ? "plss_shell" : "outer";
    registerEntry(mesh, part.componentId, layer, z2Mat.clone(), explode, true);
  }
  z2Mat.dispose();

  // Helper material builder for crisp aerospace hardware
  const metalMat = (hex: string, roughness = 0.3, metalness = 0.78) =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(hex),
      roughness,
      metalness,
      clearcoat: 0.25,
      clearcoatRoughness: 0.2,
      transparent: true,
      opacity: 0.98,
    });

  // 2. Helmet Visor (Gold-Cyan dichroic curved shield covering faceplate)
  const visorGeo = new THREE.SphereGeometry(0.145, 32, 24, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.22, Math.PI * 0.56);
  visorGeo.scale(0.95, 1.0, 0.98);
  const visorMesh = new THREE.Mesh(visorGeo);
  visorMesh.name = "SUIT_PROC_helmet_visor";
  visorMesh.position.set(0, 1.70, 0.085);
  visorMesh.rotation.y = Math.PI * 0.5;
  suitGroup.add(visorMesh);
  const visorRealisticMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#D49B38"),
    emissive: new THREE.Color("#005577"),
    emissiveIntensity: 0.25,
    roughness: 0.08,
    metalness: 0.65,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
  });
  registerEntry(visorMesh, "helmet_visor", "visor", visorRealisticMat);

  // 3. Helmet Locking Neck Ring (part of helmet_assembly)
  const neckRing = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.015, 14, 36));
  neckRing.name = "SUIT_PROC_neck_collar";
  neckRing.position.set(0, 1.545, 0.015);
  neckRing.rotation.x = Math.PI / 2 - 0.14;
  suitGroup.add(neckRing);
  registerEntry(neckRing, "helmet_assembly", "outer", metalMat("#64748B", 0.26, 0.85));

  // 4. Communication System (Ear housings + boom mic + dorsal blade antenna)
  const antennaMast = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.14, 0.055));
  antennaMast.name = "SUIT_PROC_comm_antenna";
  antennaMast.position.set(0.085, 1.84, -0.22);
  antennaMast.rotation.x = -0.25;
  suitGroup.add(antennaMast);
  registerEntry(antennaMast, "communication_system", "internal", metalMat("#38BDF8", 0.25, 0.65));

  for (const s of [-1, 1]) {
    const earPod = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 18));
    earPod.name = `SUIT_PROC_comm_ear_${s}`;
    earPod.rotation.z = Math.PI / 2;
    earPod.position.set(s * 0.125, 1.69, 0.01);
    suitGroup.add(earPod);
    registerEntry(earPod, "communication_system", "internal", metalMat("#1E3A5F", 0.35, 0.72), [
      s * 0.26,
      0.26,
      -0.05,
    ]);
  }

  // 5. Chest Display (DCM) with Live Telemetry CanvasTexture Screen
  const dcmCanvas = document.createElement("canvas");
  dcmCanvas.width = 360;
  dcmCanvas.height = 260;
  const dcmCtx = dcmCanvas.getContext("2d");
  const dcmTex = new THREE.CanvasTexture(dcmCanvas);
  dcmTex.colorSpace = THREE.SRGBColorSpace;

  const dcmBody = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.165, 0.068));
  dcmBody.name = "SUIT_PROC_chest_dcm_housing";
  dcmBody.position.set(0, 1.33, 0.205);
  dcmBody.rotation.x = -0.18;
  suitGroup.add(dcmBody);
  registerEntry(dcmBody, "chest_display", "hud", metalMat("#1E293B", 0.38, 0.72));

  const dcmScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.184, 0.132));
  dcmScreen.name = "SUIT_PROC_chest_dcm_screen";
  dcmScreen.position.set(0, 1.336, 0.241);
  dcmScreen.rotation.x = -0.18;
  suitGroup.add(dcmScreen);
  const dcmScreenMat = new THREE.MeshBasicMaterial({
    map: dcmTex,
    transparent: true,
    opacity: 0.96,
  });
  registerEntry(dcmScreen, "chest_display", "hud", dcmScreenMat);

  // DCM guarded toggle switches
  for (let i = 0; i < 3; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.018, 12));
    knob.name = `SUIT_PROC_dcm_valve_${i}`;
    knob.rotation.x = Math.PI / 2 - 0.18;
    knob.position.set(-0.065 + i * 0.065, 1.242, 0.222);
    suitGroup.add(knob);
    registerEntry(knob, "chest_display", "hud", metalMat(i === 1 ? "#FF3158" : "#00E5FF", 0.28, 0.75));
  }

  // 6. Wrist Bearings & Left-Forearm Interactive Telemetry HUD
  const wristCanvas = document.createElement("canvas");
  wristCanvas.width = 256;
  wristCanvas.height = 196;
  const wristCtx = wristCanvas.getContext("2d");
  const wristTex = new THREE.CanvasTexture(wristCanvas);
  wristTex.colorSpace = THREE.SRGBColorSpace;

  for (const s of [-1, 1]) {
    const wristRing = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.011, 12, 24));
    wristRing.name = `SUIT_PROC_wrist_bearing_${s}`;
    wristRing.position.set(s * 0.295, 1.07, 0.42);
    wristRing.rotation.set(0.35, s * -0.15, 0);
    suitGroup.add(wristRing);
    registerEntry(wristRing, "wrist_bearings", "outer", metalMat("#00A8E8", 0.25, 0.85), [
      s * 0.28,
      -0.02,
      0.16,
    ]);
  }

  const wristPad = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.068));
  wristPad.name = "SUIT_PROC_wrist_hud_screen";
  wristPad.position.set(0.305, 1.13, 0.35);
  wristPad.rotation.set(-0.65, 0.38, 0.25);
  suitGroup.add(wristPad);
  registerEntry(
    wristPad,
    "wrist_bearings",
    "hud",
    new THREE.MeshBasicMaterial({ map: wristTex, side: THREE.DoubleSide, transparent: true, opacity: 0.96 }),
    [0.28, 0.02, 0.16],
  );

  // 7. Shoulder Joint Scye Bearing Rings
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.013, 12, 28));
    ring.name = `SUIT_PROC_shoulder_ring_${s}`;
    ring.position.set(s * 0.22, 1.40, 0.025);
    ring.rotation.y = s * (Math.PI / 2 - 0.25);
    suitGroup.add(ring);
    registerEntry(ring, "shoulder_joints", "outer", metalMat("#64748B", 0.28, 0.86), [
      s * 0.22,
      0.08,
      0.02,
    ]);
  }

  // 8. Internal PLSS Core Subsystems
  for (const s of [-1, 1]) {
    const o2Tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.22, 10, 20));
    o2Tank.name = `SUIT_PROC_o2_tank_${s}`;
    o2Tank.position.set(s * 0.082, 1.38, -0.245);
    suitGroup.add(o2Tank);
    registerEntry(o2Tank, "oxygen_supply", "internal", metalMat("#0096D6", 0.25, 0.72), [
      s * 0.22,
      0.06,
      -0.34,
    ]);
  }

  for (const s of [-1, 1]) {
    const scrub = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.18, 18));
    scrub.name = `SUIT_PROC_co2_canister_${s}`;
    scrub.position.set(s * 0.056, 1.50, -0.235);
    suitGroup.add(scrub);
    registerEntry(scrub, "co2_removal", "internal", metalMat("#7C4DFF", 0.34, 0.58), [
      s * 0.2,
      0.12,
      -0.34,
    ]);
  }

  const sublimator = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.095, 0.065));
  sublimator.name = "SUIT_PROC_cooling_sublimator";
  sublimator.position.set(0, 1.24, -0.245);
  suitGroup.add(sublimator);
  registerEntry(sublimator, "cooling_system", "internal", metalMat("#00E5FF", 0.22, 0.78));

  for (const s of [-1, 1]) {
    const coolantPipe = new THREE.Mesh(
      makeTube(
        [
          [s * 0.075, 1.24, -0.22],
          [s * 0.165, 1.21, -0.14],
          [s * 0.175, 1.25, 0.04],
          [s * 0.085, 1.31, 0.19],
        ],
        0.0085,
        24,
        8,
      ),
    );
    coolantPipe.name = `SUIT_PROC_cooling_umbilical_${s}`;
    suitGroup.add(coolantPipe);
    registerEntry(coolantPipe, "cooling_system", "internal", metalMat("#00E5FF", 0.3, 0.55));
  }

  const regBlock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.055));
  regBlock.name = "SUIT_PROC_pressure_regulator";
  regBlock.position.set(0.145, 1.31, -0.13);
  suitGroup.add(regBlock);
  registerEntry(regBlock, "pressure_regulation", "internal", metalMat("#F59E0B", 0.24, 0.84));

  const regHose = new THREE.Mesh(
    makeTube(
      [
        [0.145, 1.31, -0.10],
        [0.165, 1.34, 0.06],
        [0.08, 1.34, 0.195],
      ],
      0.007,
      20,
      8,
    ),
  );
  regHose.name = "SUIT_PROC_pressure_hose";
  suitGroup.add(regHose);
  registerEntry(regHose, "pressure_regulation", "internal", metalMat("#FBBF24", 0.28, 0.78));

  const batteryBrick = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.082, 0.085));
  batteryBrick.name = "SUIT_PROC_battery_pack";
  batteryBrick.position.set(0, 1.14, -0.255);
  suitGroup.add(batteryBrick);
  registerEntry(batteryBrick, "electrical_power", "internal", metalMat("#10B981", 0.28, 0.68));

  const sopTank = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.23, 18));
  sopTank.name = "SUIT_PROC_sop_cylinder";
  sopTank.rotation.z = Math.PI / 2;
  sopTank.position.set(0, 1.03, -0.265);
  suitGroup.add(sopTank);
  registerEntry(sopTank, "emergency_oxygen_system", "internal", metalMat("#FF3158", 0.26, 0.76));

  // 9. Protective Suit Layers: Ribbed Restraint Pressure Bladder + Translucent Gold MLI Shield Rings
  const bladderGeo = new THREE.CylinderGeometry(0.165, 0.15, 0.52, 24, 6, true);
  bladderGeo.scale(1.18, 1.0, 0.78);
  const bladderMesh = new THREE.Mesh(bladderGeo);
  bladderMesh.name = "SUIT_PROC_pressure_bladder_torso";
  bladderMesh.position.set(0, 1.24, 0.012);
  suitGroup.add(bladderMesh);
  const bladderMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#008CFF"),
    emissive: new THREE.Color("#0055AA"),
    emissiveIntensity: 0.32,
    roughness: 0.32,
    metalness: 0.12,
    wireframe: true,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  registerEntry(bladderMesh, "pressure_bladder", "bladder", bladderMat);

  const mliLinerGeo = new THREE.CylinderGeometry(0.182, 0.166, 0.54, 24, 4, true);
  mliLinerGeo.scale(1.22, 1.0, 0.82);
  const mliLinerMesh = new THREE.Mesh(mliLinerGeo);
  mliLinerMesh.name = "SUIT_PROC_mli_baffle_liner";
  mliLinerMesh.position.set(0, 1.245, 0.012);
  suitGroup.add(mliLinerMesh);
  const mliMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#FFD45C"),
    emissive: new THREE.Color("#8A4F00"),
    emissiveIntensity: 0.2,
    roughness: 0.35,
    metalness: 0.45,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  registerEntry(mliLinerMesh, "thermal_protection_layers", "mli", mliMat, [0, 0.09, 0.18]);

  // Measure centers of every SuitComponentId for accurate camera focusing & projected labels
  suitGroup.updateMatrixWorld(true);
  const accumBoxes: Partial<Record<SuitComponentId, THREE.Box3>> = {};
  for (const entry of entries) {
    const b = new THREE.Box3().setFromObject(entry.mesh);
    if (!accumBoxes[entry.componentId]) {
      accumBoxes[entry.componentId] = b;
    } else {
      accumBoxes[entry.componentId]!.union(b);
    }
  }
  const componentCenters: Partial<Record<SuitComponentId, THREE.Vector3>> = {};
  for (const [id, box] of Object.entries(accumBoxes)) {
    if (box) {
      componentCenters[id as SuitComponentId] = box.getCenter(new THREE.Vector3());
    }
  }

  const updateHudDisplays = (snapshot: SuitTelemetrySnapshot) => {
    drawHudCanvas(dcmCtx, dcmCanvas.width, dcmCanvas.height, snapshot, false);
    dcmTex.needsUpdate = true;
    drawHudCanvas(wristCtx, wristCanvas.width, wristCanvas.height, snapshot, true);
    wristTex.needsUpdate = true;
  };

  updateHudDisplays(initialSnapshot);

  const setExplode = (progress: number) => {
    const p = Math.max(0, Math.min(1, progress));
    for (const entry of entries) {
      entry.mesh.position.copy(entry.restPosition).addScaledVector(entry.explodeOffset, p);
    }
  };

  const dispose = () => {
    dcmTex.dispose();
    wristTex.dispose();
    for (const entry of entries) {
      entry.mesh.geometry?.dispose();
      if (Array.isArray(entry.baseRealisticMat)) {
        entry.baseRealisticMat.forEach((m) => m.dispose());
      } else {
        entry.baseRealisticMat.dispose();
      }
    }
  };

  return {
    suitGroup,
    entries,
    interactables,
    componentCenters,
    dcmScreenCanvas: dcmCanvas,
    dcmScreenCtx: dcmCtx,
    dcmScreenTex: dcmTex,
    wristScreenCanvas: wristCanvas,
    wristScreenCtx: wristCtx,
    wristScreenTex: wristTex,
    updateHudDisplays,
    setExplode,
    dispose,
  };
}
