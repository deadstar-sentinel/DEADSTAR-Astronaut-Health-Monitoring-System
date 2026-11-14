import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { ANATOMY_BY_ID, type AnatomyId } from "../data/anatomyCatalog.ts";

export interface AnatomyMeshEntry {
  mesh: THREE.Mesh;
  organId: AnatomyId | "lymph";
  role: "organ" | "bone" | "muscle" | "nerve" | "vessel" | "lymph";
  baseScale: THREE.Vector3;
  realisticColor: THREE.Color;
  realisticRoughness: number;
  thermalHeat: number;
}

export interface BuiltAnatomyTwin {
  twinGroup: THREE.Group;
  bodySkinMeshes: THREE.Mesh[];
  organEntries: AnatomyMeshEntry[];
  interactables: THREE.Object3D[];
  fxRings: THREE.Mesh[];
  surfaceParticles: THREE.Points | null;
  surfaceParticleMat: THREE.ShaderMaterial | null;
  emitterMotes: THREE.Points;
  emitterMoteGeo: THREE.BufferGeometry;
  emitterMoteSpeeds: Float32Array;
  organCenters: Partial<Record<AnatomyId, THREE.Vector3>>;
  dispose: () => void;
}

function makeTube(
  points: [number, number, number][],
  radius: number,
  tubularSegments = 48,
  radialSegments = 10,
): THREE.TubeGeometry {
  const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(vectors);
  return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
}

function mapTwinMeshToAnatomy(name: string): {
  organId: AnatomyId | "lymph";
  role: AnatomyMeshEntry["role"];
} | null {
  if (name === "ORG_brain" || name.startsWith("ORG_eye") || name.startsWith("ORG_ear")) {
    return { organId: "brain", role: "organ" };
  }
  if (name === "ORG_heart") {
    return { organId: "heart", role: "organ" };
  }
  if (name === "ORG_vessels") {
    return { organId: "circulatory", role: "vessel" };
  }
  if (name.startsWith("ORG_lung") || name === "ORG_airways") {
    return { organId: "lungs", role: "organ" };
  }
  if (name === "ORG_liver") {
    return { organId: "liver", role: "organ" };
  }
  if (name === "ORG_stomach") {
    return { organId: "stomach", role: "organ" };
  }
  if (name.startsWith("ORG_kidney") || name === "ORG_bladder") {
    return { organId: "kidneys", role: "organ" };
  }
  if (name === "ORG_spine") {
    return { organId: "spine", role: "bone" };
  }
  if (
    name === "ORG_skull" ||
    name === "ORG_ribs" ||
    name === "ORG_pelvis" ||
    name === "ORG_shoulders" ||
    name === "ORG_bones_arm" ||
    name === "ORG_bones_leg"
  ) {
    return { organId: "skeletal", role: "bone" };
  }
  if (name === "ORG_lymph") {
    return { organId: "lymph", role: "lymph" };
  }
  return null;
}

function buildProceduralPancreas(stomachBox: THREE.Box3, parent: THREE.Group): THREE.Mesh[] {
  const center = stomachBox.getCenter(new THREE.Vector3());
  const headPos = new THREE.Vector3(center.x - 0.045, center.y - 0.032, center.z - 0.025);

  const meshes: THREE.Mesh[] = [];
  const headGeo = new THREE.SphereGeometry(0.021, 20, 14);
  headGeo.scale(1.0, 1.15, 0.72);
  const head = new THREE.Mesh(headGeo);
  head.position.copy(headPos);
  head.name = "PROC_pancreas_head";
  parent.add(head);
  meshes.push(head);

  const bodyGeo = makeTube(
    [
      [headPos.x, headPos.y, headPos.z],
      [headPos.x + 0.036, headPos.y + 0.012, headPos.z - 0.014],
      [headPos.x + 0.078, headPos.y + 0.022, headPos.z - 0.018],
      [headPos.x + 0.112, headPos.y + 0.03, headPos.z - 0.008],
    ],
    0.012,
    28,
    10,
  );
  const body = new THREE.Mesh(bodyGeo);
  body.name = "PROC_pancreas_body";
  parent.add(body);
  meshes.push(body);

  const ductGeo = makeTube(
    [
      [headPos.x + 0.004, headPos.y - 0.002, headPos.z + 0.004],
      [headPos.x + 0.04, headPos.y + 0.012, headPos.z - 0.01],
      [headPos.x + 0.105, headPos.y + 0.028, headPos.z - 0.006],
    ],
    0.0032,
    24,
    8,
  );
  const duct = new THREE.Mesh(ductGeo);
  duct.name = "PROC_pancreas_duct";
  parent.add(duct);
  meshes.push(duct);

  return meshes;
}

function buildProceduralIntestines(gutBox: THREE.Box3, parent: THREE.Group): {
  smallMeshes: THREE.Mesh[];
  largeMeshes: THREE.Mesh[];
} {
  const c = gutBox.getCenter(new THREE.Vector3());
  const sz = gutBox.getSize(new THREE.Vector3());
  const rx = Math.max(0.068, sz.x * 0.44);
  const ry = Math.max(0.068, sz.y * 0.46);
  const rz = Math.max(0.03, sz.z * 0.35);

  // Small intestine: coiled jejunal & ileal loops + C-duodenum
  const smallPoints: [number, number, number][] = [];
  const turns = 34;
  for (let i = 0; i <= turns; i++) {
    const u = i / turns;
    const angle = u * Math.PI * 7.2;
    const radial = rx * 0.62 * (1 - 0.22 * u);
    const px = c.x + Math.cos(angle) * radial;
    const py = c.y + ry * 0.48 - u * ry * 0.96 + Math.sin(angle * 2) * 0.008;
    const pz = c.z + Math.sin(angle) * rz * 0.65;
    smallPoints.push([px, py, pz]);
  }
  const smallTube = new THREE.Mesh(makeTube(smallPoints, 0.0085, 96, 10));
  smallTube.name = "PROC_small_intestine_coil";
  parent.add(smallTube);

  const duodenum = new THREE.Mesh(
    makeTube(
      [
        [c.x + 0.022, c.y + ry * 0.68, c.z + 0.01],
        [c.x - 0.024, c.y + ry * 0.62, c.z - 0.005],
        [c.x - 0.032, c.y + ry * 0.34, c.z - 0.015],
        [c.x + 0.012, c.y + ry * 0.25, c.z - 0.005],
      ],
      0.009,
      24,
      8,
    ),
  );
  duodenum.name = "PROC_small_intestine_duodenum";
  parent.add(duodenum);

  // Large intestine: cecum + ascending + transverse + descending + sigmoid frame
  const colonPoints: [number, number, number][] = [
    [c.x - rx * 0.85, c.y - ry * 0.65, c.z],
    [c.x - rx * 0.92, c.y - ry * 0.15, c.z + 0.008],
    [c.x - rx * 0.88, c.y + ry * 0.55, c.z + 0.012],
    [c.x - rx * 0.45, c.y + ry * 0.72, c.z + 0.022],
    [c.x, c.y + ry * 0.68, c.z + 0.026],
    [c.x + rx * 0.55, c.y + ry * 0.72, c.z + 0.02],
    [c.x + rx * 0.9, c.y + ry * 0.52, c.z + 0.01],
    [c.x + rx * 0.9, c.y - ry * 0.2, c.z + 0.005],
    [c.x + rx * 0.82, c.y - ry * 0.68, c.z - 0.006],
    [c.x + rx * 0.34, c.y - ry * 0.84, c.z - 0.015],
    [c.x, c.y - ry * 0.96, c.z - 0.022],
  ];
  const colonTube = new THREE.Mesh(makeTube(colonPoints, 0.0145, 72, 12));
  colonTube.name = "PROC_large_intestine_colon";
  parent.add(colonTube);

  return {
    smallMeshes: [smallTube, duodenum],
    largeMeshes: [colonTube],
  };
}

interface MuscleShapeOptions {
  tubularSegments?: number;
  radialSegments?: number;
  peakShift?: number;
  bellyPower?: number;
  flattenAxis?: THREE.Vector3;
  tendonThreshold?: number;
  notchPositions?: number[];
  bellyHex?: string;
}

function createTaperedMuscleGeometry(
  points: [number, number, number][],
  rx: number,
  rz: number,
  options: MuscleShapeOptions = {},
): THREE.BufferGeometry {
  const tubularSegments = options.tubularSegments ?? 20;
  const radialSegments = options.radialSegments ?? 12;
  const peakShift = options.peakShift ?? 1.0;
  const bellyPower = options.bellyPower ?? 0.62;
  const flattenAxis = (options.flattenAxis ?? new THREE.Vector3(0, 0, 1)).clone().normalize();
  const tendonThreshold = options.tendonThreshold ?? 0.22;
  const notchPositions = options.notchPositions ?? [];
  const bellyBase = new THREE.Color(options.bellyHex ?? "#be2537");
  const tendonColor = new THREE.Color("#e4d4ce");

  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  );

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i <= tubularSegments; i++) {
    const v = i / tubularSegments;
    curve.getPointAt(v, pt);
    curve.getTangentAt(v, tangent).normalize();

    // Stabilized parallel orientation so flattened muscles never twist
    binormal.copy(flattenAxis).addScaledVector(tangent, -flattenAxis.dot(tangent));
    if (binormal.lengthSq() < 1e-4) {
      const alt = Math.abs(tangent.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      binormal.copy(alt).addScaledVector(tangent, -alt.dot(tangent));
    }
    binormal.normalize();
    normal.crossVectors(binormal, tangent).normalize();

    let radiusFactor: number;
    if (i === 0 || i === tubularSegments) {
      radiusFactor = 0.002;
    } else {
      const shifted = Math.pow(v, peakShift);
      const sine = Math.max(0.03, Math.sin(Math.PI * shifted));
      radiusFactor = 0.16 + 0.84 * Math.pow(sine, bellyPower);

      for (const nPos of notchPositions) {
        const d = (v - nPos) * 16;
        radiusFactor *= 1 - 0.36 * Math.exp(-d * d);
      }
    }

    // Smooth blend from muscle belly crimson to ivory tendon ends
    const edgeDist = Math.min(v, 1 - v);
    const tendonMix = edgeDist < tendonThreshold
      ? Math.pow(1 - edgeDist / tendonThreshold, 1.8)
      : 0;
    let notchTint = 0;
    for (const nPos of notchPositions) {
      const d = (v - nPos) * 18;
      notchTint = Math.max(notchTint, 0.55 * Math.exp(-d * d));
    }
    const finalTendonMix = Math.min(1, Math.max(tendonMix, notchTint));

    const rN = rx * radiusFactor;
    const rB = rz * radiusFactor;

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      vertex
        .copy(pt)
        .addScaledVector(normal, cosT * rN)
        .addScaledVector(binormal, sinT * rB);
      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(u, v);

      // Subtle edge-groove shading around the bundle perimeter
      const ridgeShade = 0.86 + 0.14 * Math.abs(sinT);
      c.copy(bellyBase).lerp(tendonColor, finalTendonMix).multiplyScalar(ridgeShade);
      colors.push(c.r, c.g, c.b);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const d = (i + 1) * stride + (j + 1);
      const e = i * stride + (j + 1);
      indices.push(a, b, e);
      indices.push(b, d, e);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildProceduralMuscularSystem(bodyBox: THREE.Box3, parent: THREE.Group): THREE.Mesh[] {
  const minY = bodyBox.min.y;
  const h = bodyBox.getSize(new THREE.Vector3()).y || 1.8;
  const yAt = (frac: number) => minY + h * frac;
  const meshes: THREE.Mesh[] = [];

  const addMuscle = (
    name: string,
    points: [number, number, number][],
    rx: number,
    rz: number,
    options?: MuscleShapeOptions,
  ) => {
    const geo = createTaperedMuscleGeometry(points, rx, rz, options);
    const mesh = new THREE.Mesh(geo);
    mesh.name = name;
    parent.add(mesh);
    meshes.push(mesh);
  };

  for (const s of [-1, 1]) {
    const zAxis = new THREE.Vector3(0, 0, 1);
    const xAxis = new THREE.Vector3(s, 0, 0);
    const diagAxis = new THREE.Vector3(s * 0.7, 0, 0.7).normalize();

    // Neck: Sternocleidomastoid + Cervical Splenius + Masseter
    addMuscle(
      `PROC_muscle_scm_${s}`,
      [
        [s * 0.052, yAt(0.892), -0.01],
        [s * 0.04, yAt(0.858), 0.022],
        [s * 0.015, yAt(0.818), 0.056],
      ],
      0.013,
      0.009,
      { flattenAxis: diagAxis, tendonThreshold: 0.2 },
    );
    addMuscle(
      `PROC_muscle_neck_deep_${s}`,
      [
        [s * 0.032, yAt(0.89), -0.04],
        [s * 0.048, yAt(0.855), -0.03],
        [s * 0.068, yAt(0.822), -0.018],
      ],
      0.018,
      0.015,
      { flattenAxis: zAxis, bellyHex: "#a21e2f" },
    );
    addMuscle(
      `PROC_muscle_masseter_${s}`,
      [
        [s * 0.056, yAt(0.916), 0.022],
        [s * 0.058, yAt(0.898), 0.028],
        [s * 0.052, yAt(0.88), 0.03],
      ],
      0.012,
      0.007,
      { flattenAxis: xAxis, tubularSegments: 12, radialSegments: 10 },
    );

    // Pectoralis Major (Clavicular upper fan + Sternocostal lower fan converging on humerus)
    addMuscle(
      `PROC_muscle_pec_clav_${s}`,
      [
        [s * 0.022, yAt(0.802), 0.072],
        [s * 0.088, yAt(0.794), 0.078],
        [s * 0.168, yAt(0.775), 0.03],
      ],
      0.024,
      0.012,
      { flattenAxis: zAxis, peakShift: 0.85, tendonThreshold: 0.22 },
    );
    addMuscle(
      `PROC_muscle_pec_stern_${s}`,
      [
        [s * 0.014, yAt(0.766), 0.086],
        [s * 0.086, yAt(0.762), 0.086],
        [s * 0.17, yAt(0.768), 0.025],
      ],
      0.038,
      0.014,
      { flattenAxis: zAxis, peakShift: 0.82, tendonThreshold: 0.24 },
    );
    addMuscle(
      `PROC_muscle_pec_lower_${s}`,
      [
        [s * 0.024, yAt(0.728), 0.084],
        [s * 0.095, yAt(0.736), 0.076],
        [s * 0.168, yAt(0.76), 0.02],
      ],
      0.026,
      0.012,
      { flattenAxis: zAxis, peakShift: 0.85, tendonThreshold: 0.22, bellyHex: "#ae2031" },
    );

    // Rectus Abdominis (continuous multi-segmented anterior abdominal sheath)
    addMuscle(
      `PROC_muscle_rectus_abs_${s}`,
      [
        [s * 0.028, yAt(0.724), 0.08],
        [s * 0.029, yAt(0.672), 0.083],
        [s * 0.026, yAt(0.618), 0.08],
        [s * 0.018, yAt(0.545), 0.072],
      ],
      0.024,
      0.012,
      {
        flattenAxis: zAxis,
        tubularSegments: 28,
        tendonThreshold: 0.18,
        notchPositions: [0.22, 0.44, 0.66],
      },
    );

    // External Oblique & Serratus Anterior flank sheets wrapping torso
    addMuscle(
      `PROC_muscle_oblique_ant_${s}`,
      [
        [s * 0.125, yAt(0.715), 0.032],
        [s * 0.126, yAt(0.65), 0.044],
        [s * 0.118, yAt(0.578), 0.048],
      ],
      0.032,
      0.018,
      { flattenAxis: xAxis, tendonThreshold: 0.26, bellyHex: "#a81f30" },
    );
    addMuscle(
      `PROC_muscle_oblique_lat_${s}`,
      [
        [s * 0.132, yAt(0.71), -0.015],
        [s * 0.132, yAt(0.642), -0.005],
        [s * 0.126, yAt(0.572), 0.008],
      ],
      0.034,
      0.016,
      { flattenAxis: xAxis, tendonThreshold: 0.25, bellyHex: "#9b1c2c" },
    );

    // Trapezius (upper neck-shoulder hood + lower thoracic diamond)
    addMuscle(
      `PROC_muscle_trap_upper_${s}`,
      [
        [s * 0.018, yAt(0.882), -0.056],
        [s * 0.078, yAt(0.838), -0.034],
        [s * 0.168, yAt(0.812), -0.008],
      ],
      0.028,
      0.014,
      { flattenAxis: zAxis, tendonThreshold: 0.22 },
    );
    addMuscle(
      `PROC_muscle_trap_lower_${s}`,
      [
        [s * 0.016, yAt(0.675), -0.078],
        [s * 0.078, yAt(0.748), -0.068],
        [s * 0.155, yAt(0.805), -0.02],
      ],
      0.038,
      0.013,
      { flattenAxis: zAxis, tendonThreshold: 0.24, bellyHex: "#ad2032" },
    );

    // Latissimus Dorsi & Erector Spinae (posterior V-taper)
    addMuscle(
      `PROC_muscle_lat_${s}`,
      [
        [s * 0.025, yAt(0.585), -0.078],
        [s * 0.095, yAt(0.675), -0.068],
        [s * 0.164, yAt(0.758), -0.022],
      ],
      0.044,
      0.016,
      { flattenAxis: zAxis, peakShift: 1.15, tendonThreshold: 0.25 },
    );
    addMuscle(
      `PROC_muscle_erector_${s}`,
      [
        [s * 0.03, yAt(0.545), -0.078],
        [s * 0.032, yAt(0.65), -0.074],
        [s * 0.03, yAt(0.765), -0.07],
      ],
      0.022,
      0.016,
      { flattenAxis: zAxis, bellyHex: "#9b1c2d" },
    );

    // Shoulder: Anterior, Lateral, Posterior Deltoid converging to deltoid tuberosity
    addMuscle(
      `PROC_muscle_delt_ant_${s}`,
      [
        [s * 0.152, yAt(0.808), 0.032],
        [s * 0.194, yAt(0.778), 0.026],
        [s * 0.208, yAt(0.734), 0.008],
      ],
      0.022,
      0.016,
      { flattenAxis: diagAxis, peakShift: 0.85, tendonThreshold: 0.2 },
    );
    addMuscle(
      `PROC_muscle_delt_lat_${s}`,
      [
        [s * 0.172, yAt(0.816), 0.0],
        [s * 0.214, yAt(0.78), 0.0],
        [s * 0.212, yAt(0.732), 0.0],
      ],
      0.026,
      0.02,
      { flattenAxis: xAxis, peakShift: 0.85, tendonThreshold: 0.2 },
    );
    addMuscle(
      `PROC_muscle_delt_post_${s}`,
      [
        [s * 0.148, yAt(0.805), -0.034],
        [s * 0.195, yAt(0.775), -0.025],
        [s * 0.208, yAt(0.734), -0.006],
      ],
      0.022,
      0.016,
      { flattenAxis: zAxis, peakShift: 0.85, tendonThreshold: 0.2, bellyHex: "#a81f30" },
    );

    // Upper Arm: Biceps Brachii & Triceps Brachii
    addMuscle(
      `PROC_muscle_biceps_${s}`,
      [
        [s * 0.198, yAt(0.765), 0.016],
        [s * 0.222, yAt(0.695), 0.022],
        [s * 0.242, yAt(0.625), 0.016],
      ],
      0.022,
      0.022,
      { flattenAxis: xAxis, tendonThreshold: 0.2 },
    );
    addMuscle(
      `PROC_muscle_triceps_${s}`,
      [
        [s * 0.202, yAt(0.765), -0.018],
        [s * 0.23, yAt(0.698), -0.024],
        [s * 0.248, yAt(0.628), -0.016],
      ],
      0.024,
      0.02,
      { flattenAxis: xAxis, peakShift: 0.82, tendonThreshold: 0.24, bellyHex: "#a51e2f" },
    );

    // Forearm: Brachioradialis + Anterior Flexors + Posterior Extensors tapering cleanly to wrist
    addMuscle(
      `PROC_muscle_forearm_flex_${s}`,
      [
        [s * 0.245, yAt(0.628), 0.012],
        [s * 0.266, yAt(0.568), 0.018],
        [s * 0.288, yAt(0.492), 0.016],
      ],
      0.02,
      0.017,
      { flattenAxis: xAxis, peakShift: 0.72, tendonThreshold: 0.28 },
    );
    addMuscle(
      `PROC_muscle_forearm_ext_${s}`,
      [
        [s * 0.252, yAt(0.628), -0.012],
        [s * 0.275, yAt(0.568), -0.014],
        [s * 0.292, yAt(0.492), -0.008],
      ],
      0.019,
      0.016,
      { flattenAxis: xAxis, peakShift: 0.72, tendonThreshold: 0.28, bellyHex: "#a81f30" },
    );

    // Gluteus Maximus & Medius
    addMuscle(
      `PROC_muscle_glute_max_${s}`,
      [
        [s * 0.042, yAt(0.558), -0.088],
        [s * 0.085, yAt(0.512), -0.092],
        [s * 0.118, yAt(0.468), -0.056],
      ],
      0.048,
      0.032,
      { flattenAxis: zAxis, tendonThreshold: 0.2 },
    );
    addMuscle(
      `PROC_muscle_glute_med_${s}`,
      [
        [s * 0.125, yAt(0.565), -0.025],
        [s * 0.142, yAt(0.532), -0.032],
        [s * 0.145, yAt(0.495), -0.02],
      ],
      0.028,
      0.022,
      { flattenAxis: xAxis, bellyHex: "#ab2031" },
    );

    // Anterior & Medial Thigh: Rectus Femoris, Vastus Lateralis, Vastus Medialis, Sartorius, Adductors
    addMuscle(
      `PROC_muscle_rectus_fem_${s}`,
      [
        [s * 0.098, yAt(0.515), 0.048],
        [s * 0.101, yAt(0.398), 0.048],
        [s * 0.104, yAt(0.285), 0.038],
      ],
      0.025,
      0.024,
      { flattenAxis: zAxis, peakShift: 0.85, tendonThreshold: 0.22 },
    );
    addMuscle(
      `PROC_muscle_vastus_lat_${s}`,
      [
        [s * 0.135, yAt(0.485), 0.014],
        [s * 0.138, yAt(0.382), 0.018],
        [s * 0.122, yAt(0.29), 0.026],
      ],
      0.026,
      0.032,
      { flattenAxis: xAxis, peakShift: 0.88, tendonThreshold: 0.2, bellyHex: "#ae2031" },
    );
    addMuscle(
      `PROC_muscle_vastus_med_${s}`,
      [
        [s * 0.068, yAt(0.455), 0.022],
        [s * 0.072, yAt(0.36), 0.028],
        [s * 0.088, yAt(0.292), 0.032],
      ],
      0.024,
      0.025,
      { flattenAxis: xAxis, peakShift: 1.28, tendonThreshold: 0.22 },
    );
    addMuscle(
      `PROC_muscle_sartorius_${s}`,
      [
        [s * 0.128, yAt(0.518), 0.048],
        [s * 0.095, yAt(0.395), 0.044],
        [s * 0.076, yAt(0.278), 0.008],
      ],
      0.011,
      0.009,
      { flattenAxis: zAxis, bellyPower: 0.35, tendonThreshold: 0.16, bellyHex: "#cc2b3d" },
    );
    addMuscle(
      `PROC_muscle_adductor_${s}`,
      [
        [s * 0.044, yAt(0.495), 0.005],
        [s * 0.062, yAt(0.41), 0.005],
        [s * 0.082, yAt(0.32), 0.002],
      ],
      0.024,
      0.028,
      { flattenAxis: xAxis, peakShift: 0.72, tendonThreshold: 0.22, bellyHex: "#9b1c2d" },
    );

    // Posterior Thigh: Hamstrings (Biceps Femoris + Semitendinosus)
    addMuscle(
      `PROC_muscle_ham_lat_${s}`,
      [
        [s * 0.095, yAt(0.475), -0.048],
        [s * 0.112, yAt(0.375), -0.044],
        [s * 0.124, yAt(0.278), -0.024],
      ],
      0.024,
      0.025,
      { flattenAxis: zAxis, tendonThreshold: 0.24, bellyHex: "#a31e2f" },
    );
    addMuscle(
      `PROC_muscle_ham_med_${s}`,
      [
        [s * 0.08, yAt(0.475), -0.048],
        [s * 0.082, yAt(0.375), -0.042],
        [s * 0.086, yAt(0.278), -0.022],
      ],
      0.022,
      0.024,
      { flattenAxis: zAxis, tendonThreshold: 0.26, bellyHex: "#9c1c2c" },
    );

    // Lower Leg: Gastrocnemius medial/lateral heads converging into Achilles + Tibialis Anterior
    addMuscle(
      `PROC_muscle_gastroc_med_${s}`,
      [
        [s * 0.092, yAt(0.268), -0.025],
        [s * 0.092, yAt(0.205), -0.056],
        [s * 0.106, yAt(0.035), -0.048],
      ],
      0.02,
      0.022,
      { flattenAxis: zAxis, peakShift: 0.62, bellyPower: 0.75, tendonThreshold: 0.42 },
    );
    addMuscle(
      `PROC_muscle_gastroc_lat_${s}`,
      [
        [s * 0.122, yAt(0.268), -0.025],
        [s * 0.124, yAt(0.205), -0.054],
        [s * 0.108, yAt(0.035), -0.048],
      ],
      0.02,
      0.022,
      { flattenAxis: zAxis, peakShift: 0.62, bellyPower: 0.75, tendonThreshold: 0.42, bellyHex: "#ab2031" },
    );
    addMuscle(
      `PROC_muscle_tibialis_${s}`,
      [
        [s * 0.118, yAt(0.258), 0.014],
        [s * 0.118, yAt(0.182), 0.018],
        [s * 0.108, yAt(0.058), 0.015],
      ],
      0.016,
      0.018,
      { flattenAxis: xAxis, peakShift: 0.72, tendonThreshold: 0.3 },
    );
  }

  return meshes;
}

function buildProceduralNervousSystem(spineBox: THREE.Box3, bodyBox: THREE.Box3, parent: THREE.Group): THREE.Mesh[] {
  const minY = bodyBox.min.y;
  const h = bodyBox.getSize(new THREE.Vector3()).y || 1.8;
  const yAt = (frac: number) => minY + h * frac;
  const sc = spineBox.getCenter(new THREE.Vector3());
  const meshes: THREE.Mesh[] = [];

  const addNerve = (name: string, pts: [number, number, number][], r: number) => {
    const mesh = new THREE.Mesh(makeTube(pts, r, 40, 8));
    mesh.name = name;
    parent.add(mesh);
    meshes.push(mesh);
  };

  // Central spinal cord + cauda equina
  addNerve(
    "PROC_nerve_spinal_cord",
    [
      [0, yAt(0.88), sc.z + 0.02],
      [0, yAt(0.8), sc.z + 0.005],
      [0, yAt(0.68), sc.z],
      [0, yAt(0.56), sc.z + 0.008],
    ],
    0.0065,
  );

  for (const s of [-1, 1]) {
    // Brachial plexus -> median / ulnar arm nerves
    addNerve(
      `PROC_nerve_brachial_${s}`,
      [
        [s * 0.01, yAt(0.83), sc.z + 0.005],
        [s * 0.09, yAt(0.81), 0.0],
        [s * 0.185, yAt(0.79), 0.0],
        [s * 0.235, yAt(0.65), 0.005],
        [s * 0.285, yAt(0.51), 0.015],
      ],
      0.0036,
    );

    // Intercostal thoracic branches
    for (let i = 0; i < 4; i++) {
      const yy = yAt(0.76 - i * 0.032);
      addNerve(
        `PROC_nerve_intercostal_${s}_${i}`,
        [
          [s * 0.01, yy, sc.z],
          [s * 0.095, yy - 0.008, 0.0],
          [s * 0.075, yy - 0.015, 0.07],
        ],
        0.002,
      );
    }

    // Sciatic & tibial nerve down lower limb
    addNerve(
      `PROC_nerve_sciatic_${s}`,
      [
        [s * 0.012, yAt(0.56), sc.z + 0.005],
        [s * 0.078, yAt(0.51), -0.025],
        [s * 0.105, yAt(0.36), -0.015],
        [s * 0.108, yAt(0.22), -0.012],
        [s * 0.11, yAt(0.06), -0.005],
      ],
      0.0042,
    );

    // Femoral nerve anterior branch
    addNerve(
      `PROC_nerve_femoral_${s}`,
      [
        [s * 0.015, yAt(0.58), sc.z + 0.01],
        [s * 0.085, yAt(0.5), 0.025],
        [s * 0.102, yAt(0.36), 0.025],
      ],
      0.0028,
    );
  }

  return meshes;
}

function buildProceduralVenousNetwork(bodyBox: THREE.Box3, parent: THREE.Group): THREE.Mesh[] {
  const minY = bodyBox.min.y;
  const h = bodyBox.getSize(new THREE.Vector3()).y || 1.8;
  const yAt = (frac: number) => minY + h * frac;
  const meshes: THREE.Mesh[] = [];

  const addVessel = (name: string, pts: [number, number, number][], r: number) => {
    const mesh = new THREE.Mesh(makeTube(pts, r, 36, 8));
    mesh.name = name;
    parent.add(mesh);
    meshes.push(mesh);
  };

  // Superior & Inferior Vena Cava
  addVessel(
    "PROC_vein_vena_cava",
    [
      [-0.016, yAt(0.84), 0.015],
      [-0.018, yAt(0.75), 0.025],
      [-0.018, yAt(0.64), 0.012],
      [-0.012, yAt(0.55), 0.005],
    ],
    0.0075,
  );

  for (const s of [-1, 1]) {
    // Internal jugular vein
    addVessel(
      `PROC_vein_jugular_${s}`,
      [
        [s * 0.028, yAt(0.91), 0.01],
        [s * 0.026, yAt(0.85), 0.015],
        [-0.016, yAt(0.81), 0.018],
      ],
      0.0036,
    );

    // Subclavian / basilic arm vein
    addVessel(
      `PROC_vein_arm_${s}`,
      [
        [-0.016, yAt(0.81), 0.018],
        [s * 0.11, yAt(0.815), 0.008],
        [s * 0.21, yAt(0.74), 0.012],
        [s * 0.255, yAt(0.63), 0.018],
        [s * 0.285, yAt(0.51), 0.02],
      ],
      0.0034,
    );

    // Iliac / femoral vein
    addVessel(
      `PROC_vein_leg_${s}`,
      [
        [-0.012, yAt(0.55), 0.005],
        [s * 0.068, yAt(0.5), 0.01],
        [s * 0.102, yAt(0.36), 0.015],
        [s * 0.108, yAt(0.18), 0.008],
        [s * 0.11, yAt(0.06), 0.005],
      ],
      0.0044,
    );
  }

  return meshes;
}

export async function loadAndBuildAnatomyTwin(
  isSoftwareGl: boolean,
  onProgress?: (pct: number) => void,
): Promise<BuiltAnatomyTwin> {
  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.load(
      "/models/twin.glb",
      (res) => resolve(res),
      (evt) => {
        if (evt.total > 0 && onProgress) {
          onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        }
      },
      reject,
    );
  });

  const twinGroup = new THREE.Group();
  twinGroup.position.set(0, -0.9, 0);
  twinGroup.add(gltf.scene);
  twinGroup.updateMatrixWorld(true);

  const bodySkinMeshes: THREE.Mesh[] = [];
  const organEntries: AnatomyMeshEntry[] = [];
  const interactables: THREE.Object3D[] = [];
  const fxRings: THREE.Mesh[] = [];

  let stomachMesh: THREE.Mesh | null = null;
  let gutMesh: THREE.Mesh | null = null;
  let spineMesh: THREE.Mesh | null = null;
  let bodyMesh: THREE.Mesh | null = null;

  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    if (obj.name.startsWith("FX_")) {
      if (obj.name.startsWith("FX_ring")) fxRings.push(obj);
      return;
    }

    if (obj.name === "ORG_gut") {
      gutMesh = obj;
      obj.visible = false; // Replaced by independently selectable Small & Large Intestine meshes
      return;
    }

    if (obj.name.startsWith("ORG_")) {
      const mapping = mapTwinMeshToAnatomy(obj.name);
      if (!mapping) return;
      if (obj.name === "ORG_stomach") stomachMesh = obj;
      if (obj.name === "ORG_spine") spineMesh = obj;

      const meta = mapping.organId === "lymph" ? null : ANATOMY_BY_ID[mapping.organId];
      obj.userData.anatomyId = mapping.organId === "lymph" ? null : mapping.organId;

      organEntries.push({
        mesh: obj,
        organId: mapping.organId,
        role: mapping.role,
        baseScale: obj.scale.clone(),
        realisticColor: new THREE.Color(meta?.realisticColor ?? "#6AD8E8"),
        realisticRoughness: meta?.realisticRoughness ?? 0.5,
        thermalHeat: meta?.thermalBias ?? 0.45,
      });

      if (mapping.organId !== "lymph") {
        interactables.push(obj);
      }
      return;
    }

    // Outer body skin mesh
    bodyMesh = obj;
    bodySkinMeshes.push(obj);
  });

  // Compute exact world-aligned local bounding boxes inside gltf.scene
  const bodyBox = new THREE.Box3();
  if (bodyMesh) bodyBox.setFromObject(bodyMesh);
  else bodyBox.set(new THREE.Vector3(-0.32, 0, -0.15), new THREE.Vector3(0.32, 1.8, 0.15));

  const stomachBox = new THREE.Box3();
  if (stomachMesh) stomachBox.setFromObject(stomachMesh);
  else stomachBox.set(new THREE.Vector3(0.0, 1.12, -0.02), new THREE.Vector3(0.09, 1.25, 0.08));

  const gutBox = new THREE.Box3();
  if (gutMesh) gutBox.setFromObject(gutMesh);
  else gutBox.set(new THREE.Vector3(-0.1, 0.95, -0.02), new THREE.Vector3(0.1, 1.14, 0.08));

  const spineBox = new THREE.Box3();
  if (spineMesh) spineBox.setFromObject(spineMesh);
  else spineBox.set(new THREE.Vector3(-0.03, 0.96, -0.09), new THREE.Vector3(0.03, 1.56, -0.04));

  // Convert world-space Box3 into twinGroup local space
  const invTwin = new THREE.Matrix4().copy(twinGroup.matrixWorld).invert();
  bodyBox.applyMatrix4(invTwin);
  stomachBox.applyMatrix4(invTwin);
  gutBox.applyMatrix4(invTwin);
  spineBox.applyMatrix4(invTwin);

  const registerProcedural = (
    meshes: THREE.Mesh[],
    organId: AnatomyId,
    role: AnatomyMeshEntry["role"],
  ) => {
    const meta = ANATOMY_BY_ID[organId];
    for (const mesh of meshes) {
      mesh.userData.anatomyId = organId;
      organEntries.push({
        mesh,
        organId,
        role,
        baseScale: mesh.scale.clone(),
        realisticColor: new THREE.Color(meta.realisticColor),
        realisticRoughness: meta.realisticRoughness,
        thermalHeat: meta.thermalBias,
      });
      interactables.push(mesh);
    }
  };

  const pancreasMeshes = buildProceduralPancreas(stomachBox, twinGroup);
  registerProcedural(pancreasMeshes, "pancreas", "organ");

  const { smallMeshes, largeMeshes } = buildProceduralIntestines(gutBox, twinGroup);
  registerProcedural(smallMeshes, "small_intestine", "organ");
  registerProcedural(largeMeshes, "large_intestine", "organ");

  const muscularMeshes = buildProceduralMuscularSystem(bodyBox, twinGroup);
  registerProcedural(muscularMeshes, "muscular", "muscle");

  const nervousMeshes = buildProceduralNervousSystem(spineBox, bodyBox, twinGroup);
  registerProcedural(nervousMeshes, "nervous", "nerve");

  const veinMeshes = buildProceduralVenousNetwork(bodyBox, twinGroup);
  registerProcedural(veinMeshes, "circulatory", "vessel");

  // Sample holographic surface points on Body mesh
  let surfaceParticles: THREE.Points | null = null;
  let surfaceParticleMat: THREE.ShaderMaterial | null = null;
  if (bodySkinMeshes.length > 0) {
    const sampleCount = isSoftwareGl ? 7500 : 14000;
    const positions: number[] = [];
    const normals: number[] = [];
    const randoms: number[] = [];
    const pos = new THREE.Vector3();
    const norm = new THREE.Vector3();

    twinGroup.updateMatrixWorld(true);
    const localInv = new THREE.Matrix4().copy(twinGroup.matrixWorld).invert();
    for (const skin of bodySkinMeshes) {
      const m4 = new THREE.Matrix4().multiplyMatrices(localInv, skin.matrixWorld);
      const n3 = new THREE.Matrix3().getNormalMatrix(m4);
      const sampler = new MeshSurfaceSampler(skin).build();
      const perMesh = Math.round(sampleCount / bodySkinMeshes.length);
      for (let i = 0; i < perMesh; i++) {
        sampler.sample(pos, norm);
        pos.applyMatrix4(m4);
        norm.applyMatrix3(n3).normalize();
        positions.push(pos.x, pos.y, pos.z);
        normals.push(norm.x, norm.y, norm.z);
        randoms.push(Math.random());
      }
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    pGeo.setAttribute("aNormal", new THREE.Float32BufferAttribute(normals, 3));
    pGeo.setAttribute("aRand", new THREE.Float32BufferAttribute(randoms, 1));

    surfaceParticleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#00E5FF") },
        uOpacity: { value: 0.72 },
        uPointScale: { value: isSoftwareGl ? 1.8 : 2.3 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uPointScale;
        attribute vec3 aNormal;
        attribute float aRand;
        varying float vGlow;
        void main() {
          vec3 p = position;
          float sweepY = mod(uTime * 0.42, 2.2) - 0.15;
          float sweep = exp(-pow((p.y - sweepY) * 18.0, 2.0));
          vGlow = 0.26 + sweep * 0.85 + 0.08 * aRand;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float size = (1.35 + sweep * 1.5) * uPointScale / max(0.35, -mv.z);
          vGlow *= clamp(size / 2.2, 0.35, 1.0);           // shrink brightness, not size, so points never drop below a pixel
          gl_PointSize = max(size, 2.2);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.05, d) * vGlow * uOpacity;
          gl_FragColor = vec4(uColor * a * 1.35, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    surfaceParticles = new THREE.Points(pGeo, surfaceParticleMat);
    surfaceParticles.frustumCulled = false;
    twinGroup.add(surfaceParticles);
  }

  // Atmospheric laboratory particles rising gently around the twin
  const moteCount = 220;
  const motePos = new Float32Array(moteCount * 3);
  const emitterMoteSpeeds = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    const r = 0.35 + Math.random() * 0.65;
    const angle = Math.random() * Math.PI * 2;
    motePos[i * 3] = Math.cos(angle) * r;
    motePos[i * 3 + 1] = Math.random() * 2.1 - 0.1;
    motePos[i * 3 + 2] = Math.sin(angle) * r;
    emitterMoteSpeeds[i] = 0.08 + Math.random() * 0.14;
  }
  const emitterMoteGeo = new THREE.BufferGeometry();
  emitterMoteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const emitterMotes = new THREE.Points(
    emitterMoteGeo,
    new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 0.014,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  twinGroup.add(emitterMotes);

  // Measure actual world centers of each AnatomyId after assembly
  twinGroup.updateMatrixWorld(true);
  const accumBoxes: Partial<Record<AnatomyId, THREE.Box3>> = {};
  for (const entry of organEntries) {
    if (entry.organId === "lymph") continue;
    const b = new THREE.Box3().setFromObject(entry.mesh);
    if (!accumBoxes[entry.organId]) {
      accumBoxes[entry.organId] = b;
    } else {
      accumBoxes[entry.organId]!.union(b);
    }
  }
  const organCenters: Partial<Record<AnatomyId, THREE.Vector3>> = {};
  for (const [id, box] of Object.entries(accumBoxes)) {
    if (box) {
      organCenters[id as AnatomyId] = box.getCenter(new THREE.Vector3());
    }
  }

  const dispose = () => {
    twinGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
  };

  return {
    twinGroup,
    bodySkinMeshes,
    organEntries,
    interactables,
    fxRings,
    surfaceParticles,
    surfaceParticleMat,
    emitterMotes,
    emitterMoteGeo,
    emitterMoteSpeeds,
    organCenters,
    dispose,
  };
}
