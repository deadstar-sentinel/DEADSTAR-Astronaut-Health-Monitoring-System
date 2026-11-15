import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildProceduralSkull } from "../three/skullBuilder.ts";

// Exact ORG_skull and ORG_eye bounds from public/models/twin.glb (twin-local metres).
const skullBox = new THREE.Box3(new THREE.Vector3(-0.068, 1.5591, -0.0831), new THREE.Vector3(0.068, 1.765, 0.0821));
const eyeL = new THREE.Box3(new THREE.Vector3(0.0078, 1.643, 0.0138), new THREE.Vector3(0.046, 1.667, 0.08));
const eyeR = new THREE.Box3(new THREE.Vector3(-0.046, 1.643, 0.0138), new THREE.Vector3(-0.0078, 1.667, 0.08));
const SKIN_Z = 0.088;

describe("procedural skull", () => {
  const group = new THREE.Group();
  const meshes = buildProceduralSkull({ skullBox, eyeBoxes: [eyeL, eyeR], skinFrontZ: () => SKIN_Z }, group);

  it("builds every landmark once", () => {
    const names = meshes.map((m) => m.name).sort();
    assert.deepEqual(names, [
      "PROC_skull_brow",
      "PROC_skull_mandible",
      "PROC_skull_maxilla",
      "PROC_skull_nasal",
      "PROC_skull_occiput",
      "PROC_skull_orbit_L",
      "PROC_skull_orbit_R",
      "PROC_skull_teeth_lower",
      "PROC_skull_teeth_upper",
      "PROC_skull_vault",
      "PROC_skull_zygoma_L",
      "PROC_skull_zygoma_R",
    ]);
    assert.equal(group.children.length, meshes.length);
  });

  it("stays inside the head: within the original shell's width and crown, jaw above the neck", () => {
    for (const m of meshes) {
      const b = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute);
      for (const v of [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]) assert.ok(Number.isFinite(v), `${m.name} finite`);
      assert.ok(b.max.x <= skullBox.max.x + 0.005 && b.min.x >= skullBox.min.x - 0.005, `${m.name} width`);
      assert.ok(b.max.y <= skullBox.max.y + 0.002, `${m.name} below the crown`);
      assert.ok(b.min.y >= 1.5, `${m.name} above the neck`);
    }
  });

  it("keeps every facial landmark behind the skin", () => {
    for (const m of meshes) {
      if (m.name.includes("vault") || m.name.includes("occiput")) continue;
      const b = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute);
      assert.ok(b.max.z <= SKIN_Z, `${m.name} front ${b.max.z.toFixed(4)} behind skin ${SKIN_Z}`);
    }
  });

  it("places the jaw below the eyes and the orbits around them", () => {
    const box = (n: string) => new THREE.Box3().setFromObject(meshes.find((m) => m.name === n)!);
    const orbit = box("PROC_skull_orbit_L");
    assert.ok(orbit.min.x < 0.027 && orbit.max.x > 0.027, "left orbit surrounds the left eye");
    assert.ok(box("PROC_skull_mandible").min.y < box("PROC_skull_maxilla").min.y, "mandible below maxilla");
    assert.ok(box("PROC_skull_maxilla").max.y < 1.643, "upper jaw below the eyes");
  });
});
