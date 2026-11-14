"""DEADSTAR SENTINEL: cinematic Cycles (ray-traced) render of the hologram twin for the demo video.

Run in Blender after build_twin.py (it builds the twin first if it isn't in the scene).
Writes to ~/Downloads/deadstar_render/: turntable.mp4 (4 s, 1080p) + hero_1..3.png.
The live web hologram stays real-time; this is only for the 30 s video and the slides.
"""
import math
import os

import bpy

HOME = os.path.expanduser("~")
OUT = os.path.join(HOME, "Downloads", "deadstar_render")
os.makedirs(OUT, exist_ok=True)

if "Body" not in bpy.data.objects:                       # build the twin first if needed
    for name in ("build_twin_v7.py", "build_twin.py"):
        p = os.path.join(HOME, "Downloads", name)
        if os.path.exists(p):
            exec(compile(open(p, encoding="utf-8").read(), p, "exec"))
            break

sc = bpy.context.scene

# ---------------------------------------------------------------- engine: Cycles on the GPU
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(d.type == kind for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == kind
            sc.cycles.device = "GPU"
            break
    except Exception:
        continue
sc.cycles.samples = 24
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.05
sc.render.use_persistent_data = True
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.cycles.transparent_max_bounces = 16                    # see-through skin over organs
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - Punchy"
except Exception:
    pass

# ---------------------------------------------------------------- world: deep space blue-black
w = sc.world or bpy.data.worlds.new("World")
sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.004, 0.008, 0.016, 1)
bg.inputs[1].default_value = 1.0

# ---------------------------------------------------------------- hologram materials
STATUS = {"crit": (1.0, 0.18, 0.22), "cau": (1.0, 0.62, 0.12), "nom": (0.15, 0.85, 1.0)}
ORGAN_STATUS = {"brain": "crit", "lymph": "cau", "eye": "cau", "pelvis": "cau", "kidney": "cau", "bladder": "cau"}
CYAN = (0.18, 0.85, 1.0)


def holo(name, rgb, edge=6.0, core=0.25, alpha=0.08):
    """Fresnel hologram: glowing rim, nearly clear centre."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.15, 0.85
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    strength = nt.nodes.new("ShaderNodeMapRange")
    strength.inputs["To Min"].default_value, strength.inputs["To Max"].default_value = core, edge
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    opac = nt.nodes.new("ShaderNodeMapRange")
    opac.inputs["To Min"].default_value, opac.inputs["To Max"].default_value = alpha, 1.0
    nt.links.new(lw.outputs["Facing"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], strength.inputs["Value"])
    nt.links.new(strength.outputs["Result"], em.inputs["Strength"])
    nt.links.new(ramp.outputs["Color"], opac.inputs["Value"])
    nt.links.new(opac.outputs["Result"], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


def glow(name, rgb, strength):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def assign(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


M_SKIN = holo("R_skin", CYAN, edge=5.0, core=0.05, alpha=0.02)
M_BONE = holo("R_bone", (0.8, 0.95, 1.0), edge=5.0, core=0.6, alpha=0.3)
M_ST = {k: holo("R_" + k, v, edge=9.0, core=1.2, alpha=0.35) for k, v in STATUS.items()}
M_RING = glow("R_ring", CYAN, 8.0)
M_BEAM = holo("R_beam", CYAN, edge=0.25, core=0.0, alpha=0.0)

BONES = ("skull", "ribs", "spine", "shoulders", "bones_arm", "bones_leg")
for ob in bpy.data.objects:
    if ob.type != "MESH":
        continue
    n = ob.name
    ob.hide_render = False
    if n == "Body":
        assign(ob, M_SKIN)
    elif n.startswith("ORG_"):
        key = n[4:].split("_")[0] if not n[4:].startswith("bones") else n[4:]
        if n[4:] in BONES:
            assign(ob, M_BONE)
        else:
            assign(ob, M_ST[ORGAN_STATUS.get(key, "nom")])
    elif n.startswith("FX_ring") or n == "FX_platform":
        assign(ob, M_RING if n.startswith("FX_ring") else holo("R_plat", CYAN, edge=4.0, core=0.4, alpha=0.6))
    elif n.startswith("FX_beam"):
        assign(ob, M_BEAM)

# ---------------------------------------------------------------- camera: slow orbit around the twin
for n in ("CamPivot", "TwinCam", "CamTarget"):
    if n in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
target = bpy.data.objects.new("CamTarget", None)
target.location = (0, 0, 0.92)
pivot = bpy.data.objects.new("CamPivot", None)
for o in (target, pivot):
    sc.collection.objects.link(o)
cam_data = bpy.data.cameras.new("TwinCam")
cam_data.lens = 42
cam_data.dof.use_dof = True
cam_data.dof.focus_object = target
cam_data.dof.aperture_fstop = 2.8
cam = bpy.data.objects.new("TwinCam", cam_data)
sc.collection.objects.link(cam)
cam.parent = pivot
cam.location = (0, -5.0, 1.1)
tt = cam.constraints.new("TRACK_TO")
tt.target, tt.track_axis, tt.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
sc.camera = cam

sc.frame_start, sc.frame_end = 1, 96
sc.render.fps = 24
pivot.rotation_euler = (0, 0, math.radians(-25))
pivot.keyframe_insert("rotation_euler", frame=1)
pivot.rotation_euler = (0, 0, math.radians(-25 + 360))
pivot.keyframe_insert("rotation_euler", frame=97)
for fc in pivot.animation_data.action.fcurves if pivot.animation_data.action else []:
    for k in fc.keyframe_points:
        k.interpolation = "LINEAR"
try:                                                     # Blender 4.4+ layered actions
    for layer in pivot.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for k in fc.keyframe_points:
                        k.interpolation = "LINEAR"
except Exception:
    pass

# ---------------------------------------------------------------- compositor: bloom + slight vignette
sc.use_nodes = True
ct = sc.node_tree
ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers")
comp = ct.nodes.new("CompositorNodeComposite")
glare = ct.nodes.new("CompositorNodeGlare")
for gt in ("BLOOM", "FOG_GLOW"):
    try:
        glare.glare_type = gt
        break
    except Exception:
        continue
try:
    glare.quality = "HIGH"
    glare.size = 8
except Exception:
    pass
ct.links.new(rl.outputs["Image"], glare.inputs["Image"])
ct.links.new(glare.outputs["Image"], comp.inputs["Image"])

# ---------------------------------------------------------------- render: hero stills, then the turntable
sc.render.image_settings.file_format = "PNG"
open(os.path.join(OUT, "device.txt"), "w").write(sc.cycles.device + " " + str([d.name for d in prefs.devices if d.use]))
for i, f in enumerate((1, 25, 49), 1):
    sc.frame_set(f)
    sc.render.filepath = os.path.join(OUT, f"hero_{i}.png")
    bpy.ops.render.render(write_still=True)

sc.render.image_settings.file_format = "FFMPEG"
sc.render.ffmpeg.format = "MPEG4"
sc.render.ffmpeg.codec = "H264"
sc.render.ffmpeg.constant_rate_factor = "HIGH"
sc.render.ffmpeg.ffmpeg_preset = "GOOD"
sc.render.filepath = os.path.join(OUT, "turntable.mp4")
bpy.ops.render.render(animation=True)
print("DEADSTAR render done ->", OUT)
