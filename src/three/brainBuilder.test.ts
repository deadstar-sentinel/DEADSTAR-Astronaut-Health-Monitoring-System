import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildProceduralBrain } from "./brainBuilder.ts";

describe("brainBuilder", () => {
  it("constructs a multi-part anatomical brain fitted cleanly inside the cranial envelope", () => {
    // Matches exact ORG_brain & ORG_skull bounds from twin.glb
    const brainBox = new THREE.Box3(
      new THREE.Vector3(-0.0614, 1.554, -0.086),
      new THREE.Vector3(0.0615, 1.748, 0.07),
    );
    const skullBox = new THREE.Box3(
      new THREE.Vector3(-0.068, 1.559, -0.094),
      new THREE.Vector3(0.068, 1.765, 0.07),
    );

    const group = new THREE.Group();
    const meshes = buildProceduralBrain(brainBox, group);

    assert.equal(meshes.length, 6);
    assert.ok(meshes.some((m) => m.name === "PROC_brain_cerebrum_L"));
    assert.ok(meshes.some((m) => m.name === "PROC_brain_cerebrum_R"));
    assert.ok(meshes.some((m) => m.name === "PROC_brain_cerebellum"));
    assert.ok(meshes.some((m) => m.name === "PROC_brain_brainstem"));
    assert.ok(meshes.some((m) => m.name === "PROC_brain_corpus_callosum"));
    assert.ok(meshes.some((m) => m.name === "PROC_brain_optic_chiasm"));

    const combined = new THREE.Box3();
    for (const mesh of meshes) {
      const pos = mesh.geometry.getAttribute("position");
      const norm = mesh.geometry.getAttribute("normal");
      const col = mesh.geometry.getAttribute("color");
      assert.ok(pos && pos.count > 100);
      assert.ok(norm && norm.count === pos.count);
      assert.ok(col && col.count === pos.count);

      for (let i = 0; i < pos.count; i++) {
        assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
        assert.ok(Number.isFinite(norm.getX(i)) && Number.isFinite(norm.getY(i)) && Number.isFinite(norm.getZ(i)));
      }
      combined.union(new THREE.Box3().setFromObject(mesh));
    }

    // Must fit comfortably inside the neurocranium walls & never drop below cervical brainstem junction
    assert.ok(combined.min.x >= skullBox.min.x + 0.002, `Left X overflow: ${combined.min.x}`);
    assert.ok(combined.max.x <= skullBox.max.x - 0.002, `Right X overflow: ${combined.max.x}`);
    assert.ok(combined.min.y >= brainBox.min.y - 0.005, `Inferior Y underflow: ${combined.min.y}`);
    assert.ok(combined.max.y <= skullBox.max.y - 0.004, `Superior Y overflow: ${combined.max.y}`);
    assert.ok(combined.min.z >= skullBox.min.z + 0.002, `Occipital Z overflow: ${combined.min.z}`);
    assert.ok(combined.max.z <= skullBox.max.z - 0.002, `Frontal Z overflow: ${combined.max.z}`);
  });

  it("forms a true longitudinal fissure gap between left and right cerebral hemispheres", () => {
    const brainBox = new THREE.Box3(
      new THREE.Vector3(-0.0614, 1.554, -0.086),
      new THREE.Vector3(0.0615, 1.748, 0.07),
    );
    const group = new THREE.Group();
    const meshes = buildProceduralBrain(brainBox, group);
    const left = meshes.find((m) => m.name === "PROC_brain_cerebrum_L")!;
    const right = meshes.find((m) => m.name === "PROC_brain_cerebrum_R")!;

    const leftBox = new THREE.Box3().setFromObject(left);
    const rightBox = new THREE.Box3().setFromObject(right);

    assert.ok(leftBox.min.x > 0.0005, `Left hemisphere crosses midline: ${leftBox.min.x}`);
    assert.ok(rightBox.max.x < -0.0005, `Right hemisphere crosses midline: ${rightBox.max.x}`);
    assert.ok(leftBox.min.x - rightBox.max.x >= 0.0015, "Longitudinal fissure cleft too narrow");
  });
});
