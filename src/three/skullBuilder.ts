/**
 * Procedural skull for the anatomy twin.
 *
 * The GLB's ORG_skull is a ~1.8k-vertex shell with no orbits, nose, cheekbones or jaw,
 * so the head never read as a skull. This builds the landmarks that make a skull
 * recognisable (cranial vault, occiput, brow ridge, orbit rims, nasal aperture,
 * zygomatic arches, upper jaw, mandible and teeth), sized from the measured skull
 * and eye positions. Every facial landmark is pushed behind the skin surface, found
 * by ray-casting the body mesh, so nothing pokes out of the face.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface SkullFit {
  /** Bounds of the original ORG_skull in twin-local space. */
  skullBox: THREE.Box3;
  /** Bounds of the left and right eye meshes (after re-seating) in twin-local space. */
  eyeBoxes: THREE.Box3[];
  /** Returns the skin's front surface z at (x, y) in twin-local space, or null. */
  skinFrontZ: (x: number, y: number) => number | null;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function tube(points: THREE.Vector3[], radius: number, segments = 48, closed = false): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, "centripetal"), segments, radius, 10, closed);
}

/** Torus facing +z (the default torus plane is XY), scaled into an oval. */
function ring(center: THREE.Vector3, radius: number, tubeR: number, sx: number, sy: number, yaw = 0): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tubeR, 10, 48);
  g.scale(sx, sy, 1);
  g.rotateY(yaw);
  g.translate(center.x, center.y, center.z);
  return g;
}

export function buildProceduralSkull(fit: SkullFit, parent: THREE.Group): THREE.Mesh[] {
  const sb = fit.skullBox;
  const size = sb.getSize(new THREE.Vector3());
  const center = sb.getCenter(new THREE.Vector3());
  const meshes: THREE.Mesh[] = [];
  const add = (name: string, geo: THREE.BufferGeometry) => {
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo);
    m.name = name;
    parent.add(m);
    meshes.push(m);
  };

  // Eye landmarks (fall back to proportions of the skull box if the eyes are missing).
  const eyes = fit.eyeBoxes.filter((b) => !b.isEmpty());
  const eyeY = eyes.length ? eyes.reduce((s, b) => s + (b.min.y + b.max.y) / 2, 0) / eyes.length : sb.min.y + size.y * 0.47;
  const eyeX = eyes.length ? eyes.reduce((s, b) => s + Math.abs((b.min.x + b.max.x) / 2), 0) / eyes.length : size.x * 0.2;
  const eyeR = eyes.length ? eyes.reduce((s, b) => s + (b.max.y - b.min.y) / 2, 0) / eyes.length : size.x * 0.09;
  const eyeFront = eyes.length ? Math.max(...eyes.map((b) => b.max.z)) : sb.max.z;
  const halfW = size.x / 2;
  const top = sb.max.y;

  /** Keep a facial landmark at least `inset` behind the skin. */
  const inside = (p: THREE.Vector3, inset = 0.004) => {
    const skin = fit.skinFrontZ(p.x, p.y);
    if (skin !== null && p.z > skin - inset) p.z = skin - inset;
    return p;
  };
  const insideAll = (pts: THREE.Vector3[], inset?: number) => pts.map((p) => inside(p, inset));

  // 1. Cranial vault: upper half-ellipsoid from the brow line to the crown, inside the original shell.
  const browY = eyeY + eyeR * 1.15;
  const ry = top - browY;
  const vault = new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2);
  vault.scale(halfW * 0.98, ry, size.z * 0.48);
  // Slightly flatter temples and a gently sloped forehead.
  const vp = vault.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < vp.count; i++) {
    const x = vp.getX(i);
    const y = vp.getY(i);
    const z = vp.getZ(i);
    const h = y / ry; // 0 at brow line, 1 at crown
    const temple = 1 - 0.07 * Math.exp(-Math.pow((h - 0.25) / 0.25, 2));
    vp.setXYZ(i, x * temple, y, z > 0 ? z * (1 - 0.05 * h) : z);
  }
  vault.translate(center.x, browY, center.z - size.z * 0.02);
  add("PROC_skull_vault", vault);

  // 2. Occiput and skull base: the back half continues down behind the ears.
  const occ = new THREE.SphereGeometry(1, 40, 10, Math.PI - 0.45, Math.PI + 0.9, Math.PI / 2, Math.PI * 0.2);
  occ.scale(halfW * 0.96, ry * 0.95, size.z * 0.47);
  occ.translate(center.x, browY, center.z - size.z * 0.02);
  add("PROC_skull_occiput", occ);

  // 3. Brow ridge (supraorbital margin).
  const browZ = eyeFront - eyeR * 0.35;
  add(
    "PROC_skull_brow",
    tube(
      insideAll([
        V(-eyeX - eyeR * 1.7, browY - eyeR * 0.3, browZ - eyeR * 1.4),
        V(-eyeX, browY + eyeR * 0.05, browZ),
        V(0, browY - eyeR * 0.1, browZ + eyeR * 0.35),
        V(eyeX, browY + eyeR * 0.05, browZ),
        V(eyeX + eyeR * 1.7, browY - eyeR * 0.3, browZ - eyeR * 1.4),
      ]),
      eyeR * 0.22,
      56,
    ),
  );

  // 4. Orbit rims around each eye: slightly squarish ovals, lateral edge set back.
  for (const side of [1, -1]) {
    const c = inside(V(side * eyeX, eyeY, eyeFront - eyeR * 0.35));
    add(`PROC_skull_orbit_${side > 0 ? "L" : "R"}`, ring(c, eyeR * 1.35, eyeR * 0.2, 1.08, 0.92, side * 0.32));
  }

  // 5. Nasal bridge and pear-shaped nasal aperture.
  const noseY = eyeY - eyeR * 2.6;
  const nasalZ = eyeFront - eyeR * 0.15;
  add(
    "PROC_skull_nasal",
    mergeGeometries([
      ring(inside(V(0, noseY, nasalZ), 0.003), eyeR * 0.62, eyeR * 0.15, 0.78, 1.35),
      tube(insideAll([V(0, browY - eyeR * 0.2, nasalZ - eyeR * 0.3), V(0, eyeY, nasalZ + eyeR * 0.05), V(0, noseY + eyeR * 0.9, nasalZ + eyeR * 0.25)], 0.003), eyeR * 0.14, 20),
    ]) as THREE.BufferGeometry,
  );

  // 6. Zygomatic arches (cheekbones) from below the orbit back toward the ear.
  for (const side of [1, -1]) {
    add(
      `PROC_skull_zygoma_${side > 0 ? "L" : "R"}`,
      tube(
        insideAll([
          V(side * (eyeX + eyeR * 0.6), eyeY - eyeR * 1.45, eyeFront - eyeR * 0.9),
          V(side * (eyeX + eyeR * 1.5), eyeY - eyeR * 1.7, eyeFront - eyeR * 2.0),
          V(side * halfW * 0.93, eyeY - eyeR * 1.5, center.z + size.z * 0.12),
          V(side * halfW * 0.9, eyeY - eyeR * 1.3, center.z + size.z * 0.0),
        ]),
        eyeR * 0.26,
        36,
      ),
    );
  }

  // 7. Upper jaw (maxilla) arch and 8. mandible: U-shaped arches, mandible with ramus up to the jaw joint.
  const jawFrontZ = eyeFront - eyeR * 0.6;
  const upperY = eyeY - eyeR * 4.6;
  const maxillaPts = insideAll([
    V(-halfW * 0.62, upperY + eyeR * 0.4, center.z + size.z * 0.12),
    V(-halfW * 0.5, upperY, jawFrontZ - eyeR * 1.6),
    V(0, upperY - eyeR * 0.1, jawFrontZ),
    V(halfW * 0.5, upperY, jawFrontZ - eyeR * 1.6),
    V(halfW * 0.62, upperY + eyeR * 0.4, center.z + size.z * 0.12),
  ]);
  add("PROC_skull_maxilla", tube(maxillaPts, eyeR * 0.3, 48));

  const chinY = eyeY - eyeR * 9.4;
  const lowerY = upperY - eyeR * 1.3;
  const condyleY = eyeY - eyeR * 1.6;
  const condyleZ = center.z + size.z * 0.02;
  const mandiblePts = insideAll([
    V(-halfW * 0.86, condyleY, condyleZ),
    V(-halfW * 0.84, lowerY - eyeR * 0.5, condyleZ + eyeR * 0.3),
    V(-halfW * 0.78, chinY + eyeR * 1.6, condyleZ + eyeR * 1.0),
    V(-halfW * 0.55, chinY + eyeR * 0.6, jawFrontZ - eyeR * 2.0),
    V(-halfW * 0.24, chinY + eyeR * 0.1, jawFrontZ - eyeR * 0.4),
    V(0, chinY, jawFrontZ + eyeR * 0.05),
    V(halfW * 0.24, chinY + eyeR * 0.1, jawFrontZ - eyeR * 0.4),
    V(halfW * 0.55, chinY + eyeR * 0.6, jawFrontZ - eyeR * 2.0),
    V(halfW * 0.78, chinY + eyeR * 1.6, condyleZ + eyeR * 1.0),
    V(halfW * 0.84, lowerY - eyeR * 0.5, condyleZ + eyeR * 0.3),
    V(halfW * 0.86, condyleY, condyleZ),
  ]);
  add("PROC_skull_mandible", tube(mandiblePts, eyeR * 0.34, 96));

  // 9. Teeth: small blocks along each dental arch (inside the jaw outline).
  const teeth = (y: number, name: string) => {
    const arc = new THREE.CatmullRomCurve3(
      insideAll([
        V(-halfW * 0.44, y, jawFrontZ - eyeR * 1.9),
        V(-halfW * 0.3, y, jawFrontZ - eyeR * 0.8),
        V(0, y, jawFrontZ - eyeR * 0.15),
        V(halfW * 0.3, y, jawFrontZ - eyeR * 0.8),
        V(halfW * 0.44, y, jawFrontZ - eyeR * 1.9),
      ], 0.006),
      false,
      "centripetal",
    );
    const parts: THREE.BufferGeometry[] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = arc.getPointAt(t);
      const tan = arc.getTangentAt(t);
      const molar = Math.abs(t - 0.5) > 0.3;
      const b = new THREE.BoxGeometry(eyeR * (molar ? 0.62 : 0.4), eyeR * 0.62, eyeR * (molar ? 0.55 : 0.32));
      b.rotateY(Math.atan2(tan.x, tan.z) + Math.PI / 2);
      b.translate(p.x, p.y, p.z);
      parts.push(b);
    }
    add(name, mergeGeometries(parts) as THREE.BufferGeometry);
  };
  teeth(upperY - eyeR * 0.45, "PROC_skull_teeth_upper");
  teeth(upperY - eyeR * 1.15, "PROC_skull_teeth_lower");

  return meshes;
}

/**
 * Build a skin ray-caster: front-surface z of the body at (x, y), in twin-local space.
 * Uses double-sided clones so it works whatever the skin's winding is.
 */
export function makeSkinProbe(skinMeshes: THREE.Mesh[], twinGroup: THREE.Object3D): (x: number, y: number) => number | null {
  twinGroup.updateMatrixWorld(true);
  const probeMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const probes = skinMeshes.map((m) => {
    const p = new THREE.Mesh(m.geometry, probeMat);
    p.matrixWorld.copy(m.matrixWorld);
    p.matrixAutoUpdate = false;
    return p;
  });
  const toWorld = twinGroup.matrixWorld.clone();
  const toLocal = toWorld.clone().invert();
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(toWorld);
  return (x, y) => {
    if (probes.length === 0) return null;
    const origin = new THREE.Vector3(x, y, 1.5).applyMatrix4(toWorld);
    ray.set(origin, dir);
    const hit = ray.intersectObjects(probes, false)[0];
    return hit ? hit.point.clone().applyMatrix4(toLocal).z : null;
  };
}
