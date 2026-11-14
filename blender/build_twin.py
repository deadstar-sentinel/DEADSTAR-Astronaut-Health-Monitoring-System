"""DEADSTAR SENTINEL - design the X-ray digital twin in Blender, export twin.glb

Run (Blender 3.6+):  Scripting tab > Open > build_twin.py > Run Script (Alt+P)
Headless:           blender --background --python blender/build_twin.py

Builds, in metres (Z up, figure faces -Y):
  Body            translucent skin (metaballs -> mesh)
  ORG_brain       two hemispheres with folded surface (displacement)
  ORG_eye_L/R     eyes                ORG_ear_L/R   inner ears (balance)
  ORG_heart       atria + ventricles  ORG_lung_L/R  lungs with lower lobes
  ORG_ribs        11 rib pairs + sternum
  ORG_spine       24 vertebrae on an S-curve
  ORG_pelvis      pelvis ring + sacrum
  ORG_bones_arm   humerus, radius, ulna     ORG_bones_leg  femur, tibia, fibula, knee caps
  ORG_gut         coiled small intestine + colon frame
  ORG_kidney_L/R  bent bean shapes    ORG_lymph     nodes at neck, armpits, groin
  FX_platform     projector base: bevelled disc, rims, 72 engraved ticks, lens
  FX_ring_1..3    arc rings the web app rotates     FX_beam  tapered light beam
  HS_*            hotspot empties the web app reads by name
Rule: every 3D object in SENTINEL is designed here. The browser only adds what
reacts to live data: glow, particles, touch ripples, telemetry.
Every ORG_ object has its origin at its own centre, so the web app can make
the heart beat at the live heart rate and the lungs breathe at the live
respiration rate. Output: Desktop/twin.glb -> copy to app/static/models/twin.glb
"""
import math
import os
import random

import bpy
from mathutils import Vector

random.seed(7)
BODY_TRIS, ORGAN_TRIS = 40_000, 5_000


# ---------------------------------------------------------------- helpers
def activate(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_modifiers(obj):
    activate(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def material(name, rgb, strength):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (rgb[0] * .2, rgb[1] * .2, rgb[2] * .2, 1)
    for n in ("Emission Color", "Emission"):
        if n in b.inputs:
            b.inputs[n].default_value = (*rgb, 1)
    if "Emission Strength" in b.inputs:
        b.inputs["Emission Strength"].default_value = strength
    return m


def finish(obj, name, mat, budget=ORGAN_TRIS, smooth=True):
    obj.name = name
    obj.data.name = name
    activate(obj)
    if smooth:
        bpy.ops.object.shade_smooth()
    t = tri_count(obj)
    if t > budget:
        d = obj.modifiers.new("Decimate", "DECIMATE")
        d.ratio = budget / t
        apply_modifiers(obj)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def join(objs):
    activate(*objs)
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def metaballs(name, parts, res=0.012):
    """parts: ('E', centre, size_xyz, radius) or ('C', a, b, radius)."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name, mb)
    bpy.context.collection.objects.link(ob)
    for p in parts:
        e = mb.elements.new()
        e.stiffness = 2.0
        if p[0] == "E":
            e.type = "ELLIPSOID"
            e.co, (e.size_x, e.size_y, e.size_z), e.radius = Vector(p[1]), p[2], p[3]
        else:
            a, b = Vector(p[1]), Vector(p[2])
            e.type = "CAPSULE"
            e.co, e.radius, e.size_x = (a + b) / 2, p[3], (b - a).length / 2
            e.rotation = Vector((1, 0, 0)).rotation_difference((b - a).normalized())
    activate(ob)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.view_layer.objects.active


def sphere(loc, scale, segs=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o


def tube(points, bevel, name, closed=False):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth, cu.bevel_resolution = bevel, 2
    sp = cu.splines.new("NURBS")
    sp.points.add(len(points) - 1)
    for p, xyz in zip(sp.points, points):
        p.co = (*xyz, 1)
    sp.use_endpoint_u, sp.order_u, sp.use_cyclic_u = True, 4, closed
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    activate(ob)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.view_layer.objects.active


# ---------------------------------------------------------------- scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

CYAN = (0.36, 0.88, 0.90)
M_SKIN = material("MAT_skin", CYAN, .5)
M_BONE = material("MAT_bone", (0.75, 0.92, 0.95), .8)
M_ORG = {s: material(f"MAT_{s}", CYAN, 1.2) for s in
         ("brain", "eyes", "ear", "heart", "lungs", "spine", "hip", "leg", "gut", "kidney", "lymph")}

# ---------------------------------------------------------------- body skin
P = [("E", (0, 0, 1.66), (.085, .095, .115), .12), ("C", (0, .005, 1.50), (0, .005, 1.56), .055),
     ("E", (0, 0, 1.34), (.17, .10, .17), .16), ("E", (0, 0, 1.12), (.14, .09, .13), .14),
     ("E", (0, 0, .96), (.16, .10, .09), .14)]
for s in (-1, 1):
    P += [("E", (s * .18, 0, 1.45), (.07, .06, .05), .07),
          ("C", (s * .21, 0, 1.44), (s * .26, .01, 1.16), .052), ("C", (s * .26, .01, 1.16), (s * .29, -.02, .90), .042),
          ("E", (s * .30, -.025, .83), (.035, .02, .06), .05),
          ("C", (s * .095, 0, .92), (s * .11, -.01, .50), .078), ("C", (s * .11, -.01, .50), (s * .11, .01, .09), .058),
          ("E", (s * .11, -.05, .04), (.045, .11, .035), .05)]
body = finish(metaballs("Body", P, .02), "Body", M_SKIN, BODY_TRIS)

# ---------------------------------------------------------------- brain: folded hemispheres
folds = bpy.data.textures.new("brain_folds", "CLOUDS")
folds.noise_scale, folds.noise_depth = .011, 2
halves = []
for s in (-1, 1):
    h = sphere((s * .034, .005, 1.69), (.033, .075, .055), 64, 32)
    sub = h.modifiers.new("Sub", "SUBSURF"); sub.levels = 1
    dis = h.modifiers.new("Folds", "DISPLACE"); dis.texture, dis.strength = folds, .006
    apply_modifiers(h)
    halves.append(h)
finish(join(halves), "ORG_brain", M_ORG["brain"], 9000)

# ---------------------------------------------------------------- eyes, inner ears
for s, side in ((-1, "L"), (1, "R")):
    finish(sphere((s * .035, -.082, 1.665), (.012, .012, .012)), f"ORG_eye_{side}", M_ORG["eyes"], 800)
    bpy.ops.mesh.primitive_torus_add(major_radius=.008, minor_radius=.0025, location=(s * .075, 0, 1.655),
                                     rotation=(0, math.pi / 2, 0))
    finish(bpy.context.active_object, f"ORG_ear_{side}", M_ORG["ear"], 600)

# ---------------------------------------------------------------- heart, lungs
finish(metaballs("Heart", [("E", (.03, -.045, 1.30), (.04, .035, .05), .05),
                           ("E", (.0, -.035, 1.345), (.035, .03, .025), .04),
                           ("E", (.048, -.052, 1.262), (.018, .018, .02), .025)], .006), "ORG_heart", M_ORG["heart"])
for s, side in ((-1, "L"), (1, "R")):
    finish(metaballs(f"Lung{side}", [("E", (s * .075, 0, 1.37), (.05, .05, .09), .07),
                                     ("E", (s * .082, .005, 1.29), (.058, .055, .045), .06)], .008),
           f"ORG_lung_{side}", M_ORG["lungs"])

# ---------------------------------------------------------------- ribs + sternum
ribs = []
for i in range(11):
    z = 1.45 - i * .024
    rx = .10 + .055 * math.sin(math.pi * (i + 2) / 15)
    ry = .075 + .02 * math.sin(math.pi * (i + 2) / 15)
    for s in (-1, 1):
        pts = []
        for k in range(9):
            th = math.radians(12 + k * (140 if i < 7 else 115) / 8)   # lower ribs stop short (floating ribs)
            pts.append((s * rx * math.sin(th), ry * math.cos(th) + .01, z - .035 * k / 8))
        ribs.append(tube(pts, .0045, f"rib{i}{s}"))
sternum = sphere((0, -.088, 1.37), (.012, .006, .075), 16, 8)
finish(join(ribs + [sternum]), "ORG_ribs", M_BONE, 9000)

# ---------------------------------------------------------------- spine: 24 vertebrae on an S-curve
verts = []
for i in range(24):
    u = i / 23
    z = .98 + u * .57
    y = .065 + .014 * math.sin(u * 2.2 * math.pi)                       # lumbar / thoracic / cervical curves
    r = .016 - .007 * u
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=r, depth=.013, location=(0, y, z))
    verts.append(bpy.context.active_object)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y + r + .008, z - .003))
    sp = bpy.context.active_object
    sp.scale = (.004, .012, .006)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    verts.append(sp)
finish(join(verts), "ORG_spine", M_ORG["spine"], 6000, smooth=False)

# ---------------------------------------------------------------- pelvis
bpy.ops.mesh.primitive_torus_add(major_radius=.095, minor_radius=.02, location=(0, .01, .95),
                                 rotation=(math.radians(-18), 0, 0))
pelvis = bpy.context.active_object
pelvis.scale = (1, .72, 1)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
sacrum = sphere((0, .06, .97), (.03, .015, .045))
finish(join([pelvis, sacrum]), "ORG_pelvis", M_ORG["hip"])

# ---------------------------------------------------------------- limb bones
legs, arms = [], []
for s in (-1, 1):
    legs += [("C", (s * .095, 0, .92), (s * .11, -.01, .52), .016), ("C", (s * .11, -.005, .49), (s * .11, .01, .1), .013),
             ("C", (s * .13, .01, .48), (s * .125, .015, .11), .007), ("E", (s * .11, -.035, .51), (.014, .008, .016), .02)]
    arms += [("C", (s * .2, 0, 1.43), (s * .255, .01, 1.17), .012),
             ("C", (s * .255, .0, 1.155), (s * .285, -.025, .915), .008), ("C", (s * .268, .02, 1.15), (s * .298, -.01, .91), .007)]
finish(metaballs("Legs", legs, .006), "ORG_bones_leg", M_ORG["leg"])
finish(metaballs("Arms", arms, .006), "ORG_bones_arm", M_BONE)

# ---------------------------------------------------------------- gut: small intestine coil + colon frame
coil = []
for k in range(90):
    u = k / 89
    a = u * 9 * math.pi
    coil.append((.045 * math.cos(a) * (1 - .25 * u), -.045 + .018 * math.sin(a * 1.3), 1.09 - .09 * u))
colon = [(-.085, -.03, .99), (-.09, -.035, 1.07), (-.07, -.045, 1.12), (0, -.05, 1.13),
         (.07, -.045, 1.12), (.09, -.035, 1.07), (.08, -.03, .99), (.03, -.01, .96)]
finish(join([tube(coil, .009, "small_intestine"), tube(colon, .014, "colon")]), "ORG_gut", M_ORG["gut"], 8000)

# ---------------------------------------------------------------- kidneys
for s, side in ((-1, "L"), (1, "R")):
    k = sphere((s * .058, .055, 1.10), (.02, .015, .038))
    bend = k.modifiers.new("Bend", "SIMPLE_DEFORM")
    bend.deform_method, bend.angle, bend.deform_axis = "BEND", math.radians(-35 * s), "Z"
    apply_modifiers(k)
    finish(k, f"ORG_kidney_{side}", M_ORG["kidney"])

# ---------------------------------------------------------------- lymph nodes
nodes = [sphere(p, (.006, .006, .006), 12, 8) for s in (-1, 1) for p in
         ((s * .035, -.02, 1.52), (s * .042, -.012, 1.49), (s * .15, 0, 1.38), (s * .08, -.05, .93))]
finish(join(nodes), "ORG_lymph", M_ORG["lymph"], 2000)

# ---------------------------------------------------------------- projector platform (FX_*: the web app animates these)
M_FX = material("MAT_fx", CYAN, 1.5)
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=.5, depth=.03, location=(0, 0, -.035))
base = bpy.context.active_object
bev = base.modifiers.new("Bevel", "BEVEL"); bev.width, bev.segments = .006, 3
apply_modifiers(base)
bpy.ops.mesh.primitive_torus_add(major_radius=.47, minor_radius=.004, major_segments=128, location=(0, 0, -.019))
rim = bpy.context.active_object
bpy.ops.mesh.primitive_torus_add(major_radius=.31, minor_radius=.0025, major_segments=128, location=(0, 0, -.019))
inner = bpy.context.active_object
ticks = []
for i in range(72):                                    # engraved tick marks, longer every 30 degrees
    a = i * 2 * math.pi / 72
    long_tick = i % 6 == 0
    bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(a) * .43, math.sin(a) * .43, -.019),
                                    rotation=(0, 0, a))
    tk = bpy.context.active_object
    tk.scale = (.03 if long_tick else .014, .0022, .002)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ticks.append(tk)
lens = sphere((0, 0, -.02), (.07, .07, .012), 48, 12)
finish(join([base, rim, inner, lens] + ticks), "FX_platform", M_FX, 12000)

for n, (r, sweep, z) in enumerate(((.38, 250, -.012), (.56, 300, -.010), (.66, 200, -.008)), 1):
    arc = [(r * math.cos(math.radians(d)), r * math.sin(math.radians(d)), z) for d in range(0, sweep + 1, 6)]
    finish(tube(arc, .0028, f"ring{n}"), f"FX_ring_{n}", M_FX, 3000)

bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.5, depth=2.9, end_fill_type="NOTHING", location=(0, 0, 1.43))
beam = bpy.context.active_object
for v in beam.data.vertices:                            # taper: wide at the emitter, narrower at the top
    if v.co.z > 0:
        v.co.x *= .88
        v.co.y *= .88
finish(beam, "FX_beam", M_FX, 400, smooth=True)

# ---------------------------------------------------------------- hotspots
HOTSPOTS = {
    "HS_brain": (0, .01, 1.70), "HS_eyes_L": (-.035, -.09, 1.665), "HS_eyes_R": (.035, -.09, 1.665),
    "HS_ear_L": (-.08, 0, 1.655), "HS_ear_R": (.08, 0, 1.655), "HS_lymph": (.05, -.04, 1.52),
    "HS_heart": (.035, -.07, 1.33), "HS_lungs_L": (-.08, -.04, 1.36), "HS_lungs_R": (.08, -.04, 1.36),
    "HS_spine": (0, .08, 1.20), "HS_gut": (0, -.08, 1.07), "HS_kidney_L": (-.058, .07, 1.10), "HS_kidney_R": (.058, .07, 1.10),
    "HS_hip_L": (-.10, -.02, .93), "HS_hip_R": (.10, -.02, .93), "HS_leg_L": (-.11, -.05, .50), "HS_leg_R": (.11, -.05, .50),
}
for name, loc in HOTSPOTS.items():
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size, e.location = "SPHERE", .02, loc
    bpy.context.collection.objects.link(e)

# ---------------------------------------------------------------- export
home = os.path.expanduser("~")
out_dir = os.path.join(home, "Desktop") if os.path.isdir(os.path.join(home, "Desktop")) else home
out = os.path.join(out_dir, "twin.glb")
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False)
total = sum(tri_count(o) for o in bpy.data.objects if o.type == "MESH")
print(f"SENTINEL: exported {out}  ({total} triangles, {len(HOTSPOTS)} hotspots)")
