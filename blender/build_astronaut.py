"""DEADSTAR SENTINEL - build the hologram astronaut in Blender and export astronaut.glb

How to run (Blender 3.6 or newer):
  Blender > Scripting tab > Open this file > Run Script (Alt+P)
  or headless: blender --background --python blender/build_astronaut.py

What it makes:
  - a smooth, stylised human figure (metaballs -> mesh), about 1.8 m tall
  - organ hotspots as named empties (HS_brain, HS_eyes_L, HS_heart ...);
    the web app finds them by name and colours them from live HRP risk scores
  - a cyan emissive material (the app replaces it with its hologram shader)
  - decimated to <= 50k triangles so it runs on a judge's phone (< 5 MB)
Output: <Desktop or home>/astronaut.glb  -> copy to app/static/models/astronaut.glb
"""
import os

import bpy
from mathutils import Vector

TARGET_TRIS = 50_000

# ---- clean scene ------------------------------------------------------------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

mb = bpy.data.metaballs.new("BodyMeta")
mb.resolution = 0.02
mb.render_resolution = 0.02
mb.threshold = 0.6
meta_obj = bpy.data.objects.new("BodyMeta", mb)
bpy.context.collection.objects.link(meta_obj)


def blob(center, size, radius=0.1, stiffness=2.0):
    e = mb.elements.new()
    e.type = "ELLIPSOID"
    e.co = Vector(center)
    e.radius = radius
    e.size_x, e.size_y, e.size_z = size
    e.stiffness = stiffness


def limb(a, b, radius, stiffness=2.0):
    """Capsule from point a to point b (figure faces -Y, Z up)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    e = mb.elements.new()
    e.type = "CAPSULE"
    e.co = (a + b) / 2
    e.radius = radius
    e.size_x = d.length / 2
    e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
    e.stiffness = stiffness


# ---- body (metres) ----------------------------------------------------------
blob((0, 0, 1.66), (0.085, 0.095, 0.115), 0.12)          # head
limb((0, 0.005, 1.50), (0, 0.005, 1.56), 0.055)           # neck
blob((0, 0, 1.34), (0.17, 0.10, 0.17), 0.16)              # chest
blob((0, 0, 1.12), (0.14, 0.09, 0.13), 0.14)              # abdomen
blob((0, 0, 0.96), (0.16, 0.10, 0.09), 0.14)              # pelvis
for s in (-1, 1):
    blob((s * 0.18, 0, 1.45), (0.07, 0.06, 0.05), 0.07)   # shoulder
    limb((s * 0.21, 0, 1.44), (s * 0.26, 0.01, 1.16), 0.052)   # upper arm
    limb((s * 0.26, 0.01, 1.16), (s * 0.29, -0.02, 0.90), 0.042)  # forearm
    blob((s * 0.30, -0.025, 0.83), (0.035, 0.02, 0.06), 0.05)   # hand
    limb((s * 0.095, 0, 0.92), (s * 0.11, -0.01, 0.50), 0.078)  # thigh
    limb((s * 0.11, -0.01, 0.50), (s * 0.11, 0.01, 0.09), 0.058)  # shin
    blob((s * 0.11, -0.05, 0.04), (0.045, 0.11, 0.035), 0.05)   # foot

# ---- metaballs -> mesh --------------------------------------------------------
bpy.context.view_layer.objects.active = meta_obj
meta_obj.select_set(True)
bpy.ops.object.convert(target="MESH")
body = bpy.context.view_layer.objects.active
body.name = "Astronaut"
bpy.ops.object.shade_smooth()

tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
if tris > TARGET_TRIS:
    dec = body.modifiers.new("Decimate", "DECIMATE")
    dec.ratio = TARGET_TRIS / tris
    bpy.ops.object.modifier_apply(modifier=dec.name)

# ---- hologram material ----------------------------------------------------------
mat = bpy.data.materials.new("Hologram")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = (0.02, 0.09, 0.10, 1)
for name in ("Emission Color", "Emission"):                 # Blender 4.x / 3.x
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = (0.36, 0.88, 0.90, 1)  # signal cyan #5CE1E6
if "Emission Strength" in bsdf.inputs:
    bsdf.inputs["Emission Strength"].default_value = 0.6
body.data.materials.append(mat)

# ---- organ hotspots (named empties, read by the web app) ----------------------
HOTSPOTS = {
    "HS_brain": (0, 0.01, 1.70), "HS_eyes_L": (-0.035, -0.09, 1.665), "HS_eyes_R": (0.035, -0.09, 1.665),
    "HS_lymph": (0.05, -0.04, 1.52), "HS_heart": (0.035, -0.07, 1.33),
    "HS_lungs_L": (-0.08, -0.04, 1.36), "HS_lungs_R": (0.08, -0.04, 1.36),
    "HS_spine": (0, 0.08, 1.20), "HS_gut": (0, -0.08, 1.07),
    "HS_hip_L": (-0.10, -0.02, 0.93), "HS_hip_R": (0.10, -0.02, 0.93),
    "HS_leg_L": (-0.11, -0.05, 0.50), "HS_leg_R": (0.11, -0.05, 0.50),
}
for name, loc in HOTSPOTS.items():
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "SPHERE"
    empty.empty_display_size = 0.025
    empty.location = loc
    bpy.context.collection.objects.link(empty)

# ---- export -------------------------------------------------------------------
home = os.path.expanduser("~")
out_dir = os.path.join(home, "Desktop") if os.path.isdir(os.path.join(home, "Desktop")) else home
out = os.path.join(out_dir, "astronaut.glb")
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False)
final_tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
print(f"SENTINEL: exported {out}  ({final_tris} triangles, {len(HOTSPOTS)} hotspots)")
