"""DEADSTAR SENTINEL - realistic X-ray digital twin, designed in Blender, exported as twin.glb

Run (Blender 4.2 / 4.5 LTS): Scripting tab > Open > build_twin.py > Run Script (Alt+P)
Headless:                     blender --background --python blender/build_twin.py
Output:                       Downloads/twin.glb -> app/static/models/twin.glb

Rule: every 3D object in SENTINEL is designed here. The browser only adds what
reacts to live data (glow, particles, touch ripples, telemetry).

Units are metres, Z up, figure 1.80 m, facing -Y (its right side is -X).
Metaball note: an ellipsoid's size_x/y/z are MULTIPLIERS of its radius, and with
stiffness 2 / threshold 0.6 the visible surface sits at about 0.575 x radius.
The helpers below take real semi-axes in metres and do that conversion.

Objects (names are the contract with the web app):
  Body                         anatomical skin, voxel-remeshed and smoothed
  ORG_brain                    cerebrum (folded), cerebellum, brainstem
  ORG_eye_L/R                  eyes + optic nerves (SANS)
  ORG_ear_L/R                  cochlea + three semicircular canals (balance)
  ORG_heart                    ventricles, atria
  ORG_vessels                  aortic arch, descending aorta, carotids, subclavian/brachial, iliac/femoral
  ORG_lung_L/R                 lungs, left one with the cardiac notch
  ORG_airways                  trachea + branching bronchial tree
  ORG_liver, ORG_stomach, ORG_gut (small intestine coil + colon)
  ORG_kidney_L/R, ORG_bladder  kidneys, ureters, bladder
  ORG_lymph                    nodes at neck, armpits, groin
  ORG_skull, ORG_ribs, ORG_spine, ORG_pelvis, ORG_shoulders, ORG_bones_arm, ORG_bones_leg
  FX_platform, FX_ring_1..3, FX_beam   projector the hologram stands on
  HS_*                         hotspot empties (tap targets)
"""
import math
import os
import random

import bpy
from mathutils import Vector

random.seed(7)
K = 0.575                 # visible radius / metaball radius (stiffness 2, threshold 0.6)


# ================================================================ helpers
def activate(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_modifiers(obj):
    activate(obj)
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def tris(obj):
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


def finish(obj, name, mat, budget=5000, smooth=True):
    obj.name = obj.data.name = name
    activate(obj)
    if smooth:
        bpy.ops.object.shade_smooth()
    t = tris(obj)
    if t > budget:
        d = obj.modifiers.new("Decimate", "DECIMATE")
        d.ratio = budget / t
        apply_modifiers(obj)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def join(objs):
    objs = [o for o in objs if o is not None]
    activate(*objs)
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def E(c, semi, neg=False):
    """Ellipsoid with real semi-axes (m)."""
    return ("E", c, semi, neg)


def C(a, b, r):
    """Capsule from a to b with real visible radius r (m)."""
    return ("C", a, b, r)


def metaballs(name, parts, res=0.01):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name, mb)
    bpy.context.collection.objects.link(ob)
    for p in parts:
        e = mb.elements.new()
        e.stiffness = 2.0
        if p[0] == "E":
            semi = Vector(p[2])
            big = max(semi)
            e.type = "ELLIPSOID"
            e.co, e.radius = Vector(p[1]), big / K
            e.size_x, e.size_y, e.size_z = semi.x / big, semi.y / big, semi.z / big
            e.use_negative = p[3]
        else:
            a, b = Vector(p[1]), Vector(p[2])
            e.type = "CAPSULE"
            e.co, e.radius = (a + b) / 2, p[3] / K
            e.size_x = (b - a).length / 2
            e.rotation = Vector((1, 0, 0)).rotation_difference((b - a).normalized())
    activate(ob)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.view_layer.objects.active


def sphere(loc, semi, segs=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=loc)
    o = bpy.context.active_object
    o.scale = semi
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o


def tube(points, radius, name="tube", taper_to=None):
    """Smooth tube through points; optional taper to a smaller end radius."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth, cu.bevel_resolution = radius, 3
    cu.use_fill_caps = True
    sp = cu.splines.new("NURBS")
    sp.points.add(len(points) - 1)
    for i, (pt, xyz) in enumerate(zip(sp.points, points)):
        pt.co = (*xyz, 1)
        if taper_to is not None:
            pt.radius = 1 - (1 - taper_to / radius) * i / max(1, len(points) - 1)
    sp.use_endpoint_u, sp.order_u = True, min(4, len(points))
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    activate(ob)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.view_layer.objects.active


def torus(loc, R, r, rot=(0, 0, 0), seg=48):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=10,
                                     location=loc, rotation=rot)
    return bpy.context.active_object


def mirror(fn):
    """Build a left/right pair: fn(s) with s = -1 (figure's right) and +1 (figure's left)."""
    return [fn(-1), fn(1)]


# ================================================================ scene + materials
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
CYAN = (0.36, 0.88, 0.90)
M_SKIN = material("MAT_skin", CYAN, .5)
M_BONE = material("MAT_bone", (0.78, 0.93, 0.96), .8)
M_FX = material("MAT_fx", CYAN, 1.5)
M = {s: material(f"MAT_{s}", CYAN, 1.2) for s in
     ("brain", "eyes", "ear", "heart", "lungs", "spine", "hip", "leg", "gut", "kidney", "lymph")}

# ================================================================ body: muscle-group metaballs -> remesh -> smooth
B = [E((0, .012, 1.685), (.074, .088, .086)),            # cranium
     E((0, -.03, 1.605), (.056, .052, .052)),            # face / jaw
     E((0, -.088, 1.628), (.009, .014, .017)),           # nose
     E((0, -.068, 1.566), (.024, .02, .017)),            # chin
     C((0, .008, 1.49), (0, .0, 1.58), .052),            # neck
     E((0, -.004, 1.355), (.152, .1, .15)),              # rib cage
     E((0, -.008, 1.17), (.122, .086, .12)),             # abdomen
     E((0, .004, .985), (.15, .1, .09))]                 # pelvis
for s in (-1, 1):
    B += [E((s * .075, -.02, 1.648), (.008, .016, .026)),                     # ear
          C((s * .03, -.02, 1.52), (s * .02, 0, 1.6), .02),                   # sternocleidomastoid
          C((s * .05, .03, 1.535), (s * .15, .02, 1.475), .034),              # trapezius
          E((s * .075, -.068, 1.385), (.07, .03, .052)),                      # pectoral
          E((s * .19, 0, 1.44), (.052, .052, .062)),                          # deltoid
          E((s * .1, 0, 1.13), (.042, .06, .085)),                            # oblique
          E((s * .07, .062, .93), (.072, .062, .072)),                        # gluteus
          C((s * .2, -.012, 1.4), (s * .24, -.012, 1.2), .046),               # biceps
          C((s * .212, .026, 1.4), (s * .246, .022, 1.2), .043),              # triceps
          E((s * .25, .01, 1.165), (.03, .03, .03)),                          # elbow
          C((s * .255, 0, 1.15), (s * .285, -.02, .94), .041),                # forearm (flexors)
          C((s * .27, .004, 1.06), (s * .29, -.02, .92), .03),                # forearm (extensors)
          E((s * .29, -.02, .91), (.022, .015, .015)),                        # wrist
          E((s * .3, -.026, .86), (.012, .03, .04)),                          # palm
          C((s * .29, -.046, .865), (s * .296, -.07, .812), .0095),           # thumb
          C((s * .1, -.022, .9), (s * .11, -.03, .53), .076),                 # quadriceps
          C((s * .1, .03, .9), (s * .105, .02, .56), .066),                   # hamstrings
          E((s * .06, 0, .82), (.03, .04, .08)),                              # adductors
          E((s * .11, -.02, .5), (.045, .04, .04)),                           # knee
          E((s * .11, .035, .38), (.045, .04, .09)),                          # calf
          C((s * .11, -.01, .48), (s * .11, 0, .1), .045),                    # shin
          E((s * .11, .01, .08), (.03, .03, .025)),                           # ankle
          E((s * .11, .03, .04), (.03, .035, .03)),                           # heel
          C((s * .11, .02, .03), (s * .115, -.12, .02), .035),                # foot
          E((s * .115, -.13, .02), (.035, .02, .015))]                        # toes
    for f, (length, dy) in enumerate(((.072, -.045), (.082, -.03), (.077, -.015), (.062, 0))):  # fingers
        B.append(C((s * .302, dy, .825), (s * .304, dy - .004, .825 - length), .0085))
body = metaballs("Body", B, .009)
for kind, args in (("REMESH", {"mode": "VOXEL", "voxel_size": .005}),
                   ("SMOOTH", {"factor": .6, "iterations": 6})):
    m = body.modifiers.new(kind, kind)
    for k, v in args.items():
        setattr(m, k, v)
apply_modifiers(body)
finish(body, "Body", M_SKIN, 45000)

# ================================================================ skull, brain, eyes, ears
skull = sphere((0, .012, 1.685), (.068, .082, .08), 48, 24)
mandible = tube([(-.048, .0, 1.6), (-.042, -.045, 1.57), (0, -.068, 1.56), (.042, -.045, 1.57), (.048, .0, 1.6)], .006)
finish(join([skull, mandible]), "ORG_skull", M_BONE, 5000)

folds = bpy.data.textures.new("brain_folds", "CLOUDS")
folds.noise_scale, folds.noise_depth = .009, 2
cerebrum = []
for s in (-1, 1):
    h = sphere((s * .031, .0, 1.695), (.03, .07, .052), 64, 32)
    h.modifiers.new("Sub", "SUBSURF").levels = 1
    d = h.modifiers.new("Folds", "DISPLACE")
    d.texture, d.strength = folds, .005
    apply_modifiers(h)
    cerebrum.append(h)
cerebellum = sphere((0, .058, 1.638), (.045, .028, .024), 32, 16)
brainstem = tube([(0, .035, 1.645), (0, .032, 1.6), (0, .028, 1.555)], .011, taper_to=.008)
finish(join(cerebrum + [cerebellum, brainstem]), "ORG_brain", M["brain"], 12000)

for s, side in ((-1, "R"), (1, "L")):
    eye = sphere((s * .034, -.074, 1.655), (.012, .012, .012), 32, 16)
    nerve = tube([(s * .034, -.062, 1.655), (s * .024, -.04, 1.657), (s * .01, -.015, 1.66)], .0025)
    finish(join([eye, nerve]), f"ORG_eye_{side}", M["eyes"], 1500)
    cochlea = torus((s * .066, .0, 1.64), .006, .002, (0, math.pi / 2, 0), 24)
    canals = [torus((s * .068, .008, 1.648), .005, .0012, rot, 24)
              for rot in ((0, 0, 0), (math.pi / 2, 0, 0), (0, math.pi / 2, 0))]
    finish(join([cochlea] + canals), f"ORG_ear_{side}", M["ear"], 1500)

# ================================================================ heart, great vessels, lungs, airways
heart = metaballs("Heart", [E((.028, -.05, 1.3), (.042, .036, .052)),      # ventricles
                            E((.04, -.055, 1.262), (.02, .018, .022)),     # apex (figure's left, down, front)
                            E((-.005, -.036, 1.338), (.03, .026, .024)),   # right atrium
                            E((.03, -.025, 1.345), (.026, .022, .02))],    # left atrium
                  .005)
finish(heart, "ORG_heart", M["heart"], 6000)

vessels = [tube([(.005, -.04, 1.35), (.005, -.035, 1.42), (-.005, .0, 1.445), (-.018, .04, 1.42),
                 (-.018, .048, 1.3), (-.015, .05, 1.1), (-.012, .05, 1.0)], .011, taper_to=.008),      # aorta
           tube([(.02, -.06, 1.35), (.03, -.055, 1.395), (.06, -.02, 1.39)], .008),                    # pulmonary trunk
           tube([(.03, -.055, 1.395), (-.06, -.02, 1.39)], .007)]
for s in (-1, 1):
    vessels += [tube([(s * .012, -.02, 1.44), (s * .03, -.03, 1.53), (s * .034, -.025, 1.63)], .0045),              # carotid
                tube([(s * .02, -.015, 1.44), (s * .12, -.01, 1.45), (s * .2, 0, 1.4), (s * .245, -.02, 1.17),
                      (s * .28, -.03, .93)], .0042, taper_to=.0025),                                                  # subclavian + brachial
                tube([(-.012, .05, 1.0), (s * .06, .0, .93), (s * .1, -.03, .7), (s * .105, -.02, .5),
                      (s * .11, .0, .3), (s * .11, .0, .1)], .006, taper_to=.0035)]                                   # iliac + femoral
finish(join(vessels), "ORG_vessels", M["heart"], 9000)

for s, side in ((-1, "R"), (1, "L")):
    parts = [E((s * .072, .0, 1.425), (.04, .045, .06)),           # apex
             E((s * .078, .002, 1.33), (.06, .058, .075)),         # base
             E((s * .086, .01, 1.27), (.052, .05, .03))]           # diaphragm surface
    if s == 1:
        parts.append(E((.035, -.05, 1.3), (.04, .035, .05), neg=True))   # cardiac notch around the heart
    finish(metaballs(f"Lung{side}", parts, .007), f"ORG_lung_{side}", M["lungs"], 7000)

airways = [tube([(0, -.035, 1.56), (0, -.025, 1.42)], .009)]           # trachea


def bronchus(p, d, length, r, depth):
    if depth == 0 or r < .0012:
        return
    q = p + d * length
    airways.append(tube([tuple(p), tuple(p + d * length * .5), tuple(q)], r, taper_to=r * .75))
    for turn in (-1, 1):
        nd = (d + Vector((turn * .55, random.uniform(-.25, .25), random.uniform(-.35, .1)))).normalized()
        bronchus(q, nd, length * .72, r * .72, depth - 1)


for s in (-1, 1):
    bronchus(Vector((0, -.025, 1.42)), Vector((s * .8, .1, -.6)).normalized(), .045, .0065, 5)
finish(join(airways), "ORG_airways", M["lungs"], 12000)

# ================================================================ abdomen: liver, stomach, intestines, kidneys, bladder
finish(metaballs("Liver", [E((-.06, -.03, 1.2), (.08, .06, .045)), E((-.005, -.04, 1.215), (.05, .04, .03))], .008),
       "ORG_liver", M["gut"], 5000)
finish(tube([(.03, -.03, 1.25), (.07, -.045, 1.2), (.06, -.06, 1.15), (.02, -.055, 1.13), (-.01, -.05, 1.15)],
            .028, taper_to=.012), "ORG_stomach", M["gut"], 4000)
coil = []
for k in range(110):
    u = k / 109
    a = u * 11 * math.pi
    coil.append((.048 * math.cos(a) * (1 - .25 * u), -.045 + .018 * math.sin(a * 1.3), 1.09 - .1 * u))
colon = [(-.085, -.03, .99), (-.09, -.035, 1.07), (-.07, -.045, 1.12), (0, -.05, 1.13),
         (.07, -.045, 1.12), (.09, -.035, 1.07), (.08, -.03, .99), (.03, -.01, .96)]
finish(join([tube(coil, .008), tube(colon, .013)]), "ORG_gut", M["gut"], 10000)

for s, side in ((-1, "R"), (1, "L")):
    k = sphere((s * .058, .055, 1.10 - (.01 if s < 0 else 0)), (.02, .015, .038))    # right kidney sits lower
    bend = k.modifiers.new("Bend", "SIMPLE_DEFORM")
    bend.deform_method, bend.angle, bend.deform_axis = "BEND", math.radians(-35 * s), "Z"
    apply_modifiers(k)
    ureter = tube([(s * .05, .045, 1.07), (s * .045, .03, 1.0), (s * .02, -.03, .93)], .0022)
    finish(join([k, ureter]), f"ORG_kidney_{side}", M["kidney"], 2500)
finish(sphere((0, -.045, .925), (.03, .026, .025)), "ORG_bladder", M["kidney"], 1200)

finish(join([sphere(p, (.006, .006, .006), 12, 8) for s in (-1, 1) for p in
             ((s * .035, -.02, 1.52), (s * .042, -.012, 1.49), (s * .15, 0, 1.38), (s * .08, -.05, .93))]),
       "ORG_lymph", M["lymph"], 2000)

# ================================================================ skeleton
ribs = []
for i in range(12):
    z = 1.45 - i * .023
    w = math.sin(math.pi * (i + 2) / 16)
    rx, ry = .10 + .055 * w, .075 + .02 * w
    span = 140 if i < 7 else (115 if i < 10 else 70)                  # true, false, floating ribs
    for s in (-1, 1):
        pts = [(s * rx * math.sin(math.radians(12 + k * span / 8)),
                ry * math.cos(math.radians(12 + k * span / 8)) + .01, z - .035 * k / 8) for k in range(9)]
        ribs.append(tube(pts, .0042))
ribs.append(sphere((0, -.088, 1.37), (.012, .006, .075), 16, 8))      # sternum
finish(join(ribs), "ORG_ribs", M_BONE, 12000)

verts = []
for i in range(24):
    u = i / 23
    z, y, r = .98 + u * .57, .065 + .014 * math.sin(u * 2.2 * math.pi), .016 - .007 * u
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=r, depth=.013, location=(0, y, z))
    verts.append(bpy.context.active_object)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y + r + .008, z - .003))
    sp = bpy.context.active_object
    sp.scale = (.004, .012, .006)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    verts.append(sp)
finish(join(verts), "ORG_spine", M["spine"], 6000, smooth=False)

wings = mirror(lambda s: sphere((s * .085, .02, .99), (.055, .012, .045)))
for s, wgt in zip((-1, 1), wings):
    wgt.rotation_euler = (0, math.radians(-25 * s), math.radians(30 * s))
    activate(wgt)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
pubis = torus((0, -.02, .93), .045, .011, (math.radians(70), 0, 0))
sacrum = sphere((0, .06, .97), (.03, .015, .045))
finish(join(wings + [pubis, sacrum]), "ORG_pelvis", M["hip"], 6000)

shoulders = []
for s in (-1, 1):
    shoulders += [tube([(s * .02, -.06, 1.47), (s * .09, -.05, 1.485), (s * .17, -.01, 1.475)], .0055),       # clavicle
                  sphere((s * .1, .075, 1.38), (.045, .008, .06), 24, 12)]                                     # scapula
finish(join(shoulders), "ORG_shoulders", M_BONE, 3000)

arm, leg = [], []
for s in (-1, 1):
    arm += [C((s * .2, 0, 1.43), (s * .255, .01, 1.17), .011), C((s * .255, 0, 1.155), (s * .285, -.025, .915), .007),
            C((s * .268, .02, 1.15), (s * .298, -.01, .91), .0065)]
    leg += [C((s * .085, 0, .935), (s * .125, 0, .915), .013),                       # femoral neck
            C((s * .12, 0, .915), (s * .11, -.01, .52), .014),                       # femur shaft
            C((s * .11, -.005, .49), (s * .11, .01, .1), .012),                      # tibia
            C((s * .13, .01, .48), (s * .125, .015, .11), .006),                     # fibula
            E((s * .11, -.036, .51), (.014, .008, .016))]                            # knee cap
finish(metaballs("Arms", arm, .004), "ORG_bones_arm", M_BONE, 5000)
finish(metaballs("Legs", leg, .004), "ORG_bones_leg", M["leg"], 7000)

# ================================================================ projector platform
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=.5, depth=.03, location=(0, 0, -.035))
base = bpy.context.active_object
bev = base.modifiers.new("Bevel", "BEVEL")
bev.width, bev.segments = .006, 3
apply_modifiers(base)
ticks = []
for i in range(72):
    a = i * 2 * math.pi / 72
    bpy.ops.mesh.primitive_cube_add(size=1, location=(math.cos(a) * .43, math.sin(a) * .43, -.019), rotation=(0, 0, a))
    tk = bpy.context.active_object
    tk.scale = (.03 if i % 6 == 0 else .014, .0022, .002)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ticks.append(tk)
finish(join([base, torus((0, 0, -.019), .47, .004, seg=128), torus((0, 0, -.019), .31, .0025, seg=128),
             sphere((0, 0, -.02), (.07, .07, .012), 48, 12)] + ticks), "FX_platform", M_FX, 12000)
for n, (r, sweep, z) in enumerate(((.38, 250, -.012), (.56, 300, -.010), (.66, 200, -.008)), 1):
    finish(tube([(r * math.cos(math.radians(d)), r * math.sin(math.radians(d)), z) for d in range(0, sweep + 1, 6)],
                .0028), f"FX_ring_{n}", M_FX, 3000)
bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=.5, depth=2.9, end_fill_type="NOTHING", location=(0, 0, 1.43))
beam = bpy.context.active_object
for v in beam.data.vertices:
    if v.co.z > 0:
        v.co.x *= .88
        v.co.y *= .88
finish(beam, "FX_beam", M_FX, 400)

# ================================================================ hotspots + export
HOTSPOTS = {
    "HS_brain": (0, .01, 1.70), "HS_eyes_L": (.034, -.08, 1.655), "HS_eyes_R": (-.034, -.08, 1.655),
    "HS_ear_L": (.07, 0, 1.645), "HS_ear_R": (-.07, 0, 1.645), "HS_lymph": (.05, -.04, 1.52),
    "HS_heart": (.03, -.07, 1.31), "HS_lungs_L": (.08, -.04, 1.36), "HS_lungs_R": (-.08, -.04, 1.36),
    "HS_spine": (0, .08, 1.20), "HS_gut": (0, -.08, 1.07), "HS_kidney_L": (.058, .07, 1.10), "HS_kidney_R": (-.058, .07, 1.09),
    "HS_hip_L": (.10, -.02, .93), "HS_hip_R": (-.10, -.02, .93), "HS_leg_L": (.11, -.05, .50), "HS_leg_R": (-.11, -.05, .50),
}
for name, loc in HOTSPOTS.items():
    e = bpy.data.objects.new(name, None)
    e.empty_display_type, e.empty_display_size, e.location = "SPHERE", .015, loc
    bpy.context.collection.objects.link(e)

home = os.path.expanduser("~")
out_dir = next((os.path.join(home, d) for d in ("Downloads", "Desktop") if os.path.isdir(os.path.join(home, d))), home)
out = os.path.join(out_dir, "twin.glb")
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False)
total = sum(tris(o) for o in bpy.data.objects if o.type == "MESH")
print(f"SENTINEL: exported {out}  ({total} triangles, {len(HOTSPOTS)} hotspots)")
