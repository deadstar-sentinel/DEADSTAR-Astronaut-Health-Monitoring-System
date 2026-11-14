import * as THREE from "three";

export interface BrainBuildBounds {
  brainCenter: THREE.Vector3;
  neurocraniumMaxHalfWidth: number;
  neurocraniumMinY: number;
  neurocraniumMaxY: number;
  neurocraniumMinZ: number;
  neurocraniumMaxZ: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates domain-warped serpentine cortical folding in 3D coordinates (seamless across UV seams).
 * Produces broad convex gyral crowns separated by deep narrow winding sulcal valleys.
 */
function sampleCorticalGyrus(ux: number, uy: number, uz: number, side: -1 | 1): number {
  const sx = ux * side;
  const wx = sx + 0.28 * Math.sin(uy * 5.8 + uz * 4.5);
  const wy = uy + 0.28 * Math.sin(uz * 6.2 + sx * 4.9);
  const wz = uz + 0.28 * Math.sin(sx * 5.6 + uy * 5.2);

  // Primary & secondary serpentine sulcal zero-set contours
  const fieldA =
    Math.sin(wx * 13.0 + 1.45 * Math.cos(wy * 9.2 + wz * 4.6)) *
      Math.cos(wz * 12.2 + 1.35 * Math.sin(wx * 8.4)) +
    0.36 * Math.sin(wy * 16.5 - wz * 13.4 + 1.15 * Math.cos(wx * 10.2));

  const fieldB =
    Math.sin(wz * 18.2 + 1.25 * Math.sin(wy * 12.8)) *
    Math.cos(wy * 15.0 - wx * 10.4);

  // Sharp valleys (near 0) + broad smooth rounded gyri (near 1)
  const sA = Math.pow(clamp01(Math.abs(fieldA) / 0.68), 0.48);
  const sB = Math.pow(clamp01(Math.abs(fieldB) / 0.62), 0.54);
  return clamp01(sA * 0.72 + sB * 0.28);
}

/**
 * Computes anatomical vertex position & cortical sulcal depth factor for one cerebral hemisphere.
 */
function shapeHemisphereVertex(
  ux: number,
  uy: number,
  uz: number,
  side: -1 | 1,
  center: THREE.Vector3,
): { x: number; y: number; z: number; crownFactor: number } {
  // lat > 0 => lateral convex cortex; lat < 0 => medial longitudinal wall
  const lat = ux * side;

  // 1. Smoothly beveled longitudinal medial wall (C1-continuous rim, zero sharp normal crease)
  const medialBlend = smoothstep(-0.45, 0.35, lat);
  const flatMedial = -0.006 * Math.pow(Math.max(0, -lat), 0.85);
  const xNorm = flatMedial * (1 - medialBlend) + Math.max(0, lat) * medialBlend;

  // 2. Antero-posterior cerebral taper (narrower frontal pole, distinct tapered occipital pole)
  const frontalTaper =
    uz > 0.05 ? 1 - 0.28 * Math.pow(smoothstep(0.05, 1.0, uz), 1.4) : 1;
  const occipitalTaper =
    uz < -0.15 ? 1 - 0.36 * Math.pow(smoothstep(-0.15, -1.0, uz), 1.32) : 1;
  const poleWidthFactor = frontalTaper * occipitalTaper;

  // Parietal superior-posterior crown
  const crownLift =
    0.005 *
    Math.exp(-Math.pow((uz + 0.14) / 0.52, 2)) *
    smoothstep(0.12, 0.9, uy);

  // Orbital frontal base & occipital tentorial shelf arching closely above cerebellum
  const orbitalFloorLift =
    0.0155 * smoothstep(0.06, 0.78, uz) * smoothstep(0.04, -0.92, uy);
  const tentorialArchLift =
    0.0225 * smoothstep(-0.08, -0.82, uz) * smoothstep(0.06, -0.95, uy);

  // 3. Prominent Temporal Lobe (lateral-inferior-anterior projecting bulge below Sylvian fissure)
  const temporalEnv =
    Math.exp(-Math.pow((uz - 0.08) / 0.42, 2) - Math.pow((uy + 0.36) / 0.36, 2)) *
    smoothstep(0.12, 0.65, lat);
  const temporalOutX = 0.008 * temporalEnv;
  const temporalDropY = -0.0205 * temporalEnv;
  const temporalFwdZ =
    0.0105 *
    Math.exp(-Math.pow((uz - 0.28) / 0.24, 2) - Math.pow((uy + 0.32) / 0.34, 2)) *
    smoothstep(0.18, 0.7, lat);

  // 4. Deep Macro-Anatomical Fissures (Sylvian Lateral Fissure + Central Sulcus + Parieto-Occipital notch)
  const sylvianY = -0.15 + (0.44 - uz) * 0.52;
  const sylvianDist = Math.abs(uy - sylvianY);
  const sylvianMask =
    Math.exp(-Math.pow(sylvianDist / 0.068, 2)) *
    smoothstep(-0.32, -0.12, uz) *
    smoothstep(0.5, 0.3, uz) *
    smoothstep(0.22, 0.68, lat);

  const centralZ = 0.08 - uy * 0.24;
  const centralDist = Math.abs(uz - centralZ);
  const centralMask =
    Math.exp(-Math.pow(centralDist / 0.05, 2)) *
    smoothstep(0.06, 0.3, uy) *
    smoothstep(0.98, 0.72, uy) *
    smoothstep(0.14, 0.58, lat);

  const parietoOccDist = Math.abs(uz + 0.56 - uy * 0.18);
  const parietoOccMask =
    Math.exp(-Math.pow(parietoOccDist / 0.055, 2)) *
    smoothstep(0.12, 0.45, uy) *
    smoothstep(0.1, 0.5, lat);

  // 5. Deep Cortical Gyri & Sulci serpentine relief
  const ridge = sampleCorticalGyrus(ux, uy, uz, side);
  const lateralReliefGain =
    (0.18 + 0.82 * smoothstep(-0.18, 0.28, lat)) *
    (1 - 0.4 * smoothstep(-0.35, -0.95, uy));
  const gyralDisplace =
    (ridge - 0.48) * 0.0046 * lateralReliefGain * (1 - 0.7 * sylvianMask);

  const fissureCarve =
    -0.0085 * sylvianMask - 0.0042 * centralMask - 0.0032 * parietoOccMask;

  // Base cerebral hemisphere semi-axes calibrated inside neurocranium
  const halfLatSpan = 0.0515;
  const halfHeight = 0.0475;
  const halfLength = 0.072;
  const medialGap = 0.0022;

  const rx = xNorm * halfLatSpan * poleWidthFactor + temporalOutX;
  const ry =
    uy * halfHeight * (0.94 + 0.06 * smoothstep(-0.4, 0.5, uz)) +
    crownLift +
    orbitalFloorLift +
    tentorialArchLift +
    temporalDropY;
  const rz = uz * halfLength + temporalFwdZ;

  // Apply outward/inward cortical relief smoothly (attenuated on medial wall so hemispheres never cross)
  const medialAtten = smoothstep(-0.2, 0.25, lat);
  const nx = Math.max(0.05, Math.abs(ux)) * medialAtten;
  const nLen = Math.hypot(nx, uy, uz) || 1;
  const relief = gyralDisplace + fissureCarve;

  const localX = Math.max(0.0018, medialGap + rx + (nx / nLen) * relief);
  const worldX = center.x + side * localX;
  const worldY = center.y + ry + (uy / nLen) * relief * (0.35 + 0.65 * medialAtten);
  const worldZ = center.z + rz + (uz / nLen) * relief * (0.35 + 0.65 * medialAtten);

  const crownFactor = clamp01(
    ridge * (1 - 0.9 * sylvianMask) * (1 - 0.75 * centralMask) * (1 - 0.6 * parietoOccMask),
  );

  return { x: worldX, y: worldY, z: worldZ, crownFactor };
}

function buildCerebralHemisphere(
  side: -1 | 1,
  center: THREE.Vector3,
): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 80, 60);
  const posAttr = geo.getAttribute("position");
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const gyrusCrown = new THREE.Color("#E5A9B1");
  const sulcusCrevice = new THREE.Color("#6E303D");
  const medialTint = new THREE.Color("#C98B95");
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const ux = posAttr.getX(i);
    const uy = posAttr.getY(i);
    const uz = posAttr.getZ(i);

    const shaped = shapeHemisphereVertex(ux, uy, uz, side, center);
    posAttr.setXYZ(i, shaped.x, shaped.y, shaped.z);

    const lat = ux * side;
    tmpColor.copy(sulcusCrevice).lerp(gyrusCrown, Math.pow(shaped.crownFactor, 0.85));
    if (lat < 0) {
      tmpColor.lerp(medialTint, 0.45 * smoothstep(0, -0.6, lat));
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  posAttr.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo);
  mesh.name = side < 0 ? "PROC_brain_cerebrum_R" : "PROC_brain_cerebrum_L";
  return mesh;
}

function buildCerebellum(center: THREE.Vector3): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 58, 42);
  const posAttr = geo.getAttribute("position");
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  const foliaRidgeCol = new THREE.Color("#D18E98");
  const foliaGrooveCol = new THREE.Color("#6B2F3B");
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const ux = posAttr.getX(i);
    const uy = posAttr.getY(i);
    const uz = posAttr.getZ(i);

    // Bilateral cerebellar hemispheres with central vermis notch & anterior pons cradle
    const vermisPinch = 1 - 0.28 * Math.exp(-Math.pow(ux / 0.24, 2));
    const anteriorNotch =
      uz > 0.15 ? 1 - 0.36 * Math.exp(-Math.pow(ux / 0.34, 2)) * smoothstep(0.15, 0.9, uz) : 1;

    // Fine horizontal-concentric cerebellar folia striations
    const foliaWave = Math.cos(uy * 36 + 1.15 * Math.cos(ux * 3.8) + 0.65 * uz);
    const foliaFactor = clamp01(0.5 + 0.5 * foliaWave);
    const foliaRelief = (foliaFactor - 0.5) * 0.0017;

    const rx = ux * 0.0445 * (0.94 + 0.06 * (1 - uy * uy));
    const ry = uy * 0.0245 * vermisPinch;
    const rz = uz * 0.0275 * anteriorNotch;

    posAttr.setXYZ(
      i,
      center.x + rx + ux * foliaRelief * 0.35,
      center.y + ry + uy * foliaRelief,
      center.z + rz + uz * foliaRelief,
    );

    tmpColor.copy(foliaGrooveCol).lerp(foliaRidgeCol, Math.pow(foliaFactor, 0.72));
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  posAttr.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo);
  mesh.name = "PROC_brain_cerebellum";
  return mesh;
}

function buildBrainstem(baseY: number, centerZ: number): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, baseY + 0.108, centerZ + 0.001), // Midbrain core tucked under thalamus
    new THREE.Vector3(0, baseY + 0.09, centerZ - 0.002), // Cerebral peduncles
    new THREE.Vector3(0, baseY + 0.068, centerZ - 0.006), // Pons bulge center
    new THREE.Vector3(0, baseY + 0.038, centerZ - 0.021), // Medulla oblongata
    new THREE.Vector3(0, baseY + 0.002, centerZ - 0.036), // Cervical spinal cord transition
  ]);

  const tubularSegments = 36;
  const radialSegments = 20;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pt = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const refRight = new THREE.Vector3(1, 0, 0);
  const v = new THREE.Vector3();

  const stemLight = new THREE.Color("#E2C5C7");
  const stemCrease = new THREE.Color("#A8737A");
  const tmpColor = new THREE.Color();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, pt);
    curve.getTangentAt(t, tangent).normalize();

    binormal.copy(refRight).addScaledVector(tangent, -refRight.dot(tangent)).normalize();
    normal.crossVectors(binormal, tangent).normalize(); // +normal points anteriorly (+Z)

    const ponsBulge = Math.exp(-Math.pow((t - 0.36) / 0.16, 2));
    const baseRadiusX = 0.0115 * (1 - 0.34 * t) + 0.0046 * ponsBulge;
    const baseRadiusZ = 0.0102 * (1 - 0.32 * t) + 0.0074 * ponsBulge;

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const anteriorCrease =
        cosT > 0 ? Math.exp(-Math.pow(sinT / 0.24, 2)) : 0;
      const ponsFwdShift = ponsBulge * Math.max(0, cosT) * 0.0062;
      const creasePinch = 1 - 0.14 * anteriorCrease;

      const rFwd = baseRadiusZ * creasePinch;
      const rLat = baseRadiusX;

      v.copy(pt)
        .addScaledVector(normal, cosT * rFwd + ponsFwdShift)
        .addScaledVector(binormal, sinT * rLat);

      positions.push(v.x, v.y, v.z);
      tmpColor.copy(stemLight).lerp(stemCrease, anteriorCrease * 0.7);
      colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo);
  mesh.name = "PROC_brain_brainstem";
  return mesh;
}

function buildCorpusCallosumAndChiasm(cerebrumCenter: THREE.Vector3): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];

  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, cerebrumCenter.y - 0.015, cerebrumCenter.z + 0.025),
    new THREE.Vector3(0, cerebrumCenter.y + 0.004, cerebrumCenter.z + 0.018),
    new THREE.Vector3(0, cerebrumCenter.y + 0.01, cerebrumCenter.z - 0.002),
    new THREE.Vector3(0, cerebrumCenter.y + 0.004, cerebrumCenter.z - 0.022),
    new THREE.Vector3(0, cerebrumCenter.y - 0.008, cerebrumCenter.z - 0.03),
  ]);
  const archGeo = new THREE.TubeGeometry(archCurve, 28, 0.0075, 10, false);
  archGeo.translate(0, -cerebrumCenter.y, -cerebrumCenter.z);
  archGeo.scale(1.65, 0.68, 1.0);
  archGeo.translate(0, cerebrumCenter.y, cerebrumCenter.z);

  const archColorAttr = new Float32Array(archGeo.getAttribute("position").count * 3);
  const callosumCol = new THREE.Color("#EAE0DF");
  for (let i = 0; i < archGeo.getAttribute("position").count; i++) {
    archColorAttr[i * 3] = callosumCol.r;
    archColorAttr[i * 3 + 1] = callosumCol.g;
    archColorAttr[i * 3 + 2] = callosumCol.b;
  }
  archGeo.setAttribute("color", new THREE.BufferAttribute(archColorAttr, 3));
  const corpusMesh = new THREE.Mesh(archGeo);
  corpusMesh.name = "PROC_brain_corpus_callosum";
  meshes.push(corpusMesh);

  const chiasmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.012, cerebrumCenter.y - 0.035, cerebrumCenter.z + 0.024),
    new THREE.Vector3(0, cerebrumCenter.y - 0.038, cerebrumCenter.z + 0.014),
    new THREE.Vector3(0.012, cerebrumCenter.y - 0.035, cerebrumCenter.z + 0.024),
  ]);
  const chiasmGeo = new THREE.TubeGeometry(chiasmCurve, 16, 0.0028, 8, false);
  const chiasmCols = new Float32Array(chiasmGeo.getAttribute("position").count * 3);
  for (let i = 0; i < chiasmGeo.getAttribute("position").count; i++) {
    chiasmCols[i * 3] = callosumCol.r;
    chiasmCols[i * 3 + 1] = callosumCol.g;
    chiasmCols[i * 3 + 2] = callosumCol.b;
  }
  chiasmGeo.setAttribute("color", new THREE.BufferAttribute(chiasmCols, 3));
  const chiasmMesh = new THREE.Mesh(chiasmGeo);
  chiasmMesh.name = "PROC_brain_optic_chiasm";
  meshes.push(chiasmMesh);

  return meshes;
}

/**
 * Builds an anatomically sculpted multi-part 3D human brain aligned cleanly inside the neurocranium:
 * - Bilateral Cerebral Hemispheres (Frontal, Parietal, Occipital, Temporal lobes, Sylvian/Central/Longitudinal fissures & deep gyri/sulci)
 * - Bilateral Foliated Cerebellum tucked snugly beneath the occipital tentorial shelf and cradling the dorsal pons
 * - Variable-profile Brainstem (Midbrain, anterior Pons belly, Medulla oblongata meeting cervical spine)
 * - Corpus Callosum arch & Optic Chiasm bridge
 */
export function buildProceduralBrain(
  brainBox: THREE.Box3,
  parent: THREE.Group,
): THREE.Mesh[] {
  const bCenter = brainBox.getCenter(new THREE.Vector3());
  const cerebrumCenter = new THREE.Vector3(
    bCenter.x,
    brainBox.max.y - 0.052,
    bCenter.z - 0.001,
  );
  // Seated snugly beneath the occipital lobe & cradling the dorsal pons
  const cerebellumCenter = new THREE.Vector3(
    bCenter.x,
    brainBox.min.y + 0.088,
    bCenter.z - 0.035,
  );

  const leftHemisphere = buildCerebralHemisphere(1, cerebrumCenter);
  const rightHemisphere = buildCerebralHemisphere(-1, cerebrumCenter);
  const cerebellum = buildCerebellum(cerebellumCenter);
  const brainstem = buildBrainstem(brainBox.min.y, bCenter.z - 0.006);
  const deepStructures = buildCorpusCallosumAndChiasm(cerebrumCenter);

  const allMeshes: THREE.Mesh[] = [
    leftHemisphere,
    rightHemisphere,
    cerebellum,
    brainstem,
    ...deepStructures,
  ];

  for (const mesh of allMeshes) {
    parent.add(mesh);
  }

  return allMeshes;
}
