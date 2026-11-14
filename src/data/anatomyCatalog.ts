export type VisualizationMode =
  | "holographic"
  | "xray"
  | "organ"
  | "muscular"
  | "nervous"
  | "thermal"
  | "realistic"
  | "engineering"
  | "ai_monitoring";

export type BodySystemId =
  | "all"
  | "nervous"
  | "cardiovascular"
  | "respiratory"
  | "digestive"
  | "renal"
  | "musculoskeletal";

export type AnatomyId =
  | "brain"
  | "heart"
  | "lungs"
  | "liver"
  | "kidneys"
  | "stomach"
  | "pancreas"
  | "small_intestine"
  | "large_intestine"
  | "spine"
  | "skeletal"
  | "muscular"
  | "nervous"
  | "circulatory";

export type CameraPresetId = "front" | "back" | "left" | "right" | "reset";

export type AnimationMode = "playing" | "paused" | "disabled";

export interface VisualizationModeMeta {
  id: VisualizationMode;
  label: string;
  shortLabel: string;
  description: string;
  accentHex: string;
}

export interface BodySystemMeta {
  id: BodySystemId;
  label: string;
}

export interface AnatomyStructure {
  id: AnatomyId;
  name: string;
  latinName: string;
  system: Exclude<BodySystemId, "all">;
  location: string;
  biologicalFunction: string;
  medicalDetails: string;
  keyStructures: string[];
  thermalBias: number;
  realisticColor: string;
  realisticRoughness: number;
  assetSource: "twin.glb" | "procedural" | "hybrid";
  assetNote: string;
  focusTarget: [number, number, number];
  focusCameraOffset: [number, number, number];
  labelOffset: [number, number, number];
}

export const VISUALIZATION_MODES: VisualizationModeMeta[] = [
  {
    id: "holographic",
    label: "Holographic Mode",
    shortLabel: "Holo",
    description: "Transparent neon-cyan holographic silhouette with luminous anatomical rims and scan sweep.",
    accentHex: "#00E5FF",
  },
  {
    id: "xray",
    label: "X-Ray Mode",
    shortLabel: "X-Ray",
    description: "High-contrast skeletal radiography with sheer translucent outer tissue envelope.",
    accentHex: "#9FE8FF",
  },
  {
    id: "organ",
    label: "Organ Mode",
    shortLabel: "Organs",
    description: "Detailed visceral organ inspection with outer body and muscular layers suppressed.",
    accentHex: "#FF3DAD",
  },
  {
    id: "muscular",
    label: "Muscular Mode",
    shortLabel: "Muscular",
    description: "Sculpted striated muscle groups with fascial sheen over skeletal landmarks.",
    accentHex: "#FF5E7E",
  },
  {
    id: "nervous",
    label: "Nervous System Mode",
    shortLabel: "Nervous",
    description: "Brain, spinal cord, cranial tracts, and peripheral neural pathways with impulse flow.",
    accentHex: "#8A5CFF",
  },
  {
    id: "thermal",
    label: "Thermal Mode",
    shortLabel: "Thermal",
    description: "Smooth multi-stop infrared visualization layer with animated gradient sweeps and edge glow.",
    accentHex: "#FF8C42",
  },
  {
    id: "realistic",
    label: "Realistic Anatomy",
    shortLabel: "Realistic",
    description: "Natural anatomical PBR shading with calibrated medical studio lighting and environment reflections.",
    accentHex: "#38BDF8",
  },
  {
    id: "engineering",
    label: "Engineering Mode",
    shortLabel: "Engineer",
    description: "Spacesuit structural CAD view exposing mechanical bearings, fluid umbilical hoses, internal PLSS modules, and pressure layers.",
    accentHex: "#00E5FF",
  },
  {
    id: "ai_monitoring",
    label: "AI Monitoring Mode",
    shortLabel: "AI Monitor",
    description: "Intelligent spacesuit life-support HUD mode linking chest DCM, PLSS telemetry, active alerts, and 48h predictive forecasts.",
    accentHex: "#8A5CFF",
  },
];

export const BODY_SYSTEMS: BodySystemMeta[] = [
  { id: "all", label: "All Systems" },
  { id: "nervous", label: "Nervous" },
  { id: "cardiovascular", label: "Cardiovascular" },
  { id: "respiratory", label: "Respiratory" },
  { id: "digestive", label: "Digestive" },
  { id: "renal", label: "Renal" },
  { id: "musculoskeletal", label: "Musculoskeletal" },
];

export const ANATOMY_CATALOG: AnatomyStructure[] = [
  {
    id: "brain",
    name: "Brain",
    latinName: "Encephalon",
    system: "nervous",
    location: "Cranial cavity, superior to the brainstem and protected by the neurocranium.",
    biologicalFunction:
      "Integrates sensory input, coordinates motor output, regulates autonomic homeostasis, and supports cognition, memory, and consciousness.",
    medicalDetails:
      "Comprises folded cerebral hemispheres, cerebellum for balance and fine motor coordination, and brainstem centers governing respiration and heart rate.",
    keyStructures: [
      "Frontal, parietal, temporal & occipital lobes",
      "Cortical gyri & Sylvian fissure",
      "Foliated cerebellum",
      "Corpus callosum & pons/medulla brainstem",
    ],
    thermalBias: 0.88,
    realisticColor: "#D89A9E",
    realisticRoughness: 0.38,
    assetSource: "hybrid",
    assetNote:
      "Sculpted multi-part cerebrum, foliated cerebellum, corpus callosum & brainstem + twin.glb cranial sensory tracts",
    focusTarget: [0, 0.77, -0.008],
    focusCameraOffset: [0.28, 0.06, 0.44],
    labelOffset: [0.16, 0.04, 0.0],
  },
  {
    id: "heart",
    name: "Heart",
    latinName: "Cor",
    system: "cardiovascular",
    location: "Middle mediastinum of the thoracic cavity, tilted slightly leftward behind the sternum.",
    biologicalFunction:
      "Drives systemic and pulmonary circulation through synchronized atrial and ventricular contractions, delivering oxygen and nutrients.",
    medicalDetails:
      "Four-chambered muscular pump seated inside the pericardium, nestled adjacent to the cardiac notch of the left lung and connected to the aortic arch.",
    keyStructures: ["Left & right ventricles", "Atria", "Cardiac apex", "Aortic root"],
    thermalBias: 0.96,
    realisticColor: "#B3394B",
    realisticRoughness: 0.36,
    assetSource: "twin.glb",
    assetNote: "Mesh ORG_heart from twin.glb",
    focusTarget: [0.03, 0.41, 0.05],
    focusCameraOffset: [0.24, 0.05, 0.56],
    labelOffset: [0.18, 0.03, 0.04],
  },
  {
    id: "lungs",
    name: "Lungs",
    latinName: "Pulmones",
    system: "respiratory",
    location: "Left and right pleural cavities of the thorax, flanking the mediastinum above the diaphragm.",
    biologicalFunction:
      "Performs alveolar gas exchange—diffusing inhaled oxygen into pulmonary capillaries while expelling carbon dioxide.",
    medicalDetails:
      "Paired spongy parenchymal organs fed by the trachea and branching bronchial tree; the left lung features a distinct cardiac notch accommodating the heart.",
    keyStructures: ["Trachea", "Bronchial tree", "Right & left lobes", "Cardiac notch"],
    thermalBias: 0.62,
    realisticColor: "#CC7E8B",
    realisticRoughness: 0.58,
    assetSource: "twin.glb",
    assetNote: "Meshes ORG_lung_L, ORG_lung_R, and ORG_airways from twin.glb",
    focusTarget: [0, 0.45, 0.01],
    focusCameraOffset: [-0.28, 0.08, 0.78],
    labelOffset: [-0.22, 0.06, 0.02],
  },
  {
    id: "liver",
    name: "Liver",
    latinName: "Hepar",
    system: "digestive",
    location: "Right upper abdominal quadrant directly beneath the diaphragm and lower rib cage.",
    biologicalFunction:
      "Synthesizes bile and plasma proteins, regulates glycogen storage, metabolizes lipids and pharmaceuticals, and detoxifies venous blood.",
    medicalDetails:
      "Largest internal visceral gland, divided into major right and left lobes receiving dual blood supply from the hepatic artery and portal vein.",
    keyStructures: ["Right hepatic lobe", "Left hepatic lobe", "Biliary tract"],
    thermalBias: 0.92,
    realisticColor: "#8A3336",
    realisticRoughness: 0.34,
    assetSource: "twin.glb",
    assetNote: "Mesh ORG_liver from twin.glb",
    focusTarget: [-0.05, 0.31, 0.04],
    focusCameraOffset: [-0.24, 0.04, 0.58],
    labelOffset: [-0.2, 0.02, 0.04],
  },
  {
    id: "kidneys",
    name: "Kidneys",
    latinName: "Renes",
    system: "renal",
    location: "Retroperitoneal posterior abdominal wall flanking the lumbar spine (T12–L3).",
    biologicalFunction:
      "Filters metabolic waste from blood plasma, maintains electrolyte and acid-base balance, regulates blood pressure, and produces urine.",
    medicalDetails:
      "Bean-shaped paired organs draining via ureters into the pelvic urinary bladder; the right kidney sits slightly lower beneath the liver.",
    keyStructures: ["Renal cortex", "Renal pelvis", "Ureters", "Urinary bladder"],
    thermalBias: 0.78,
    realisticColor: "#8F4049",
    realisticRoughness: 0.4,
    assetSource: "twin.glb",
    assetNote: "Meshes ORG_kidney_L, ORG_kidney_R, and ORG_bladder from twin.glb",
    focusTarget: [0, 0.2, -0.05],
    focusCameraOffset: [0.28, 0.06, -0.68],
    labelOffset: [0.19, 0.02, -0.04],
  },
  {
    id: "stomach",
    name: "Stomach",
    latinName: "Gaster",
    system: "digestive",
    location: "Left upper abdominal quadrant between the esophagus and the proximal duodenum.",
    biologicalFunction:
      "Mechanically churns food and secretes hydrochloric acid and pepsinogen to initiate protein digestion and form chyme.",
    medicalDetails:
      "J-shaped muscular reservoir composed of cardia, fundus, body, and pyloric antrum regulating controlled gastric emptying.",
    keyStructures: ["Fundus", "Gastric body", "Pylorus", "Greater curvature"],
    thermalBias: 0.74,
    realisticColor: "#C9756F",
    realisticRoughness: 0.48,
    assetSource: "twin.glb",
    assetNote: "Mesh ORG_stomach from twin.glb",
    focusTarget: [0.04, 0.27, 0.05],
    focusCameraOffset: [0.22, 0.04, 0.56],
    labelOffset: [0.18, 0.02, 0.05],
  },
  {
    id: "pancreas",
    name: "Pancreas",
    latinName: "Pancreas",
    system: "digestive",
    location: "Retroperitoneal epigastrium posterior to the stomach, spanning from duodenum to splenic hilum.",
    biologicalFunction:
      "Dual endocrine and exocrine gland secreting digestive enzymes into the duodenum and regulating blood glucose via insulin and glucagon.",
    medicalDetails:
      "Elongated lobulated organ comprising a head cradled inside the duodenal C-loop, a central neck/body over the aorta, and a tapering tail.",
    keyStructures: ["Pancreatic head", "Body & neck", "Tail", "Main pancreatic duct"],
    thermalBias: 0.84,
    realisticColor: "#D69E6B",
    realisticRoughness: 0.52,
    assetSource: "procedural",
    assetNote: "Procedural sculpted 3-part anatomical geometry anchored to stomach/duodenum bounds",
    focusTarget: [0.01, 0.24, 0.01],
    focusCameraOffset: [0.2, 0.03, 0.52],
    labelOffset: [0.17, -0.02, 0.03],
  },
  {
    id: "small_intestine",
    name: "Small intestine",
    latinName: "Intestinum tenue",
    system: "digestive",
    location: "Central and lower abdominal cavity framed circumferentially by the large intestine.",
    biologicalFunction:
      "Completes enzymatic breakdown of macronutrients and absorbs over 90% of dietary nutrients, water, and electrolytes across villi.",
    medicalDetails:
      "Convoluted tubular tract divided into the retroperitoneal duodenum, mid-abdominal jejunum, and distal ileum joining the cecum.",
    keyStructures: ["Duodenum", "Jejunal coils", "Ileal loops"],
    thermalBias: 0.69,
    realisticColor: "#D4857D",
    realisticRoughness: 0.46,
    assetSource: "procedural",
    assetNote: "Procedural coiled tubular geometry aligned inside twin.glb abdominal envelope",
    focusTarget: [0, 0.14, 0.04],
    focusCameraOffset: [0.18, 0.04, 0.6],
    labelOffset: [-0.18, -0.02, 0.05],
  },
  {
    id: "large_intestine",
    name: "Large intestine",
    latinName: "Intestinum crassum",
    system: "digestive",
    location: "Peripheral abdominal frame ascending on the right, crossing beneath stomach, and descending on the left.",
    biologicalFunction:
      "Reabsorbs residual water and electrolytes, hosts symbiotic gut microbiota synthesizing vitamin K, and consolidates fecal matter.",
    medicalDetails:
      "Segmented haustrated colon consisting of cecum, ascending, transverse, descending, and sigmoid segments leading to the rectum.",
    keyStructures: ["Ascending colon", "Transverse colon", "Descending colon", "Sigmoid colon"],
    thermalBias: 0.56,
    realisticColor: "#BA6F69",
    realisticRoughness: 0.5,
    assetSource: "procedural",
    assetNote: "Procedural haustrated colon frame aligned inside twin.glb abdominal cavity",
    focusTarget: [0, 0.16, 0.035],
    focusCameraOffset: [-0.22, 0.04, 0.66],
    labelOffset: [0.19, 0.02, 0.04],
  },
  {
    id: "spine",
    name: "Spine",
    latinName: "Columna vertebralis",
    system: "musculoskeletal",
    location: "Dorsal midline extending from the base of the skull to the sacrum and pelvis.",
    biologicalFunction:
      "Supports axial body weight, enables flexible trunk posture and movement, and houses the spinal cord inside the vertebral canal.",
    medicalDetails:
      "Articulated column of cervical, thoracic, and lumbar vertebrae with spinous processes and intervertebral spacing.",
    keyStructures: ["Cervical curve", "Thoracic curve", "Lumbar curve", "Spinous processes"],
    thermalBias: 0.42,
    realisticColor: "#DDD6C7",
    realisticRoughness: 0.62,
    assetSource: "twin.glb",
    assetNote: "Mesh ORG_spine from twin.glb",
    focusTarget: [0, 0.34, -0.07],
    focusCameraOffset: [0.32, 0.06, -0.82],
    labelOffset: [0.14, 0.04, -0.08],
  },
  {
    id: "skeletal",
    name: "Skeletal system",
    latinName: "Systema skeletale",
    system: "musculoskeletal",
    location: "Full-body internal structural framework spanning cranium, thorax, spine, pelvis, and limbs.",
    biologicalFunction:
      "Provides rigid mechanical leverage for movement, protects vital organs, stores calcium/phosphate minerals, and houses bone marrow.",
    medicalDetails:
      "Includes axial skeleton (skull, rib cage, sternum, vertebral column) and appendicular girdles and long bones of upper and lower extremities.",
    keyStructures: ["Cranium & mandible", "Rib cage & sternum", "Pelvic girdle", "Limb long bones"],
    thermalBias: 0.31,
    realisticColor: "#E5DEC9",
    realisticRoughness: 0.65,
    assetSource: "twin.glb",
    assetNote: "Meshes ORG_skull, ORG_ribs, ORG_spine, ORG_pelvis, ORG_shoulders, ORG_bones_arm, ORG_bones_leg",
    focusTarget: [0, 0.05, 0],
    focusCameraOffset: [0.4, 0.12, 2.35],
    labelOffset: [0.25, 0.38, 0.0],
  },
  {
    id: "muscular",
    name: "Muscular system",
    latinName: "Systema musculare",
    system: "musculoskeletal",
    location: "Superficial and deep myofascial layers enveloping the torso, shoulder girdle, and limbs.",
    biologicalFunction:
      "Generates contractile force for locomotion, joint stabilization, posture maintenance, and metabolic thermogenesis.",
    medicalDetails:
      "Striated skeletal muscle groups including pectoralis major, deltoids, rectus abdominis, obliques, trapezius, quadriceps, and gastrocnemius.",
    keyStructures: ["Pectorals & deltoids", "Rectus abdominis", "Quadriceps", "Trapezius & calves"],
    thermalBias: 0.58,
    realisticColor: "#A63A46",
    realisticRoughness: 0.54,
    assetSource: "procedural",
    assetNote: "Procedural sculpted muscle groups fitted to twin.glb body proportions",
    focusTarget: [0, 0.1, 0],
    focusCameraOffset: [-0.35, 0.1, 2.25],
    labelOffset: [-0.28, 0.36, 0.0],
  },
  {
    id: "nervous",
    name: "Nervous system",
    latinName: "Systema nervosum",
    system: "nervous",
    location: "Central cranial-spinal axis branching radially into brachial, intercostal, femoral, and sciatic trunks.",
    biologicalFunction:
      "Transmits rapid electrochemical action potentials to coordinate voluntary movement, sensation, reflexes, and autonomic control.",
    medicalDetails:
      "Combines central brain and spinal cord structures with procedural peripheral nerve plexuses tracing upper and lower extremity pathways.",
    keyStructures: ["Brain & brainstem", "Spinal cord", "Brachial plexus", "Sciatic & femoral nerves"],
    thermalBias: 0.72,
    realisticColor: "#D6B778",
    realisticRoughness: 0.45,
    assetSource: "hybrid",
    assetNote: "ORG_brain & ORG_eye from twin.glb + procedural spinal cord and peripheral nerve tracts",
    focusTarget: [0, 0.25, 0],
    focusCameraOffset: [0.32, 0.14, 2.15],
    labelOffset: [0.22, 0.52, 0.0],
  },
  {
    id: "circulatory",
    name: "Circulatory system",
    latinName: "Systema cardiovasculare",
    system: "cardiovascular",
    location: "Central cardiac pump extending through carotid, subclavian, aortic, iliac, and femoral vascular trees.",
    biologicalFunction:
      "Circulates oxygenated blood, carbon dioxide, hormones, immune cells, and thermal energy throughout every tissue bed.",
    medicalDetails:
      "Integrates the heart and great arteries from twin.glb with procedural systemic venous return trunks and extremity vessels.",
    keyStructures: ["Heart & aortic arch", "Carotid & brachial arteries", "Vena cava", "Iliac & femoral vessels"],
    thermalBias: 0.85,
    realisticColor: "#C83244",
    realisticRoughness: 0.38,
    assetSource: "hybrid",
    assetNote: "ORG_heart & ORG_vessels from twin.glb + procedural venous return pathways",
    focusTarget: [0, 0.18, 0],
    focusCameraOffset: [-0.28, 0.1, 2.15],
    labelOffset: [-0.24, 0.24, 0.0],
  },
];

export const ANATOMY_BY_ID: Record<AnatomyId, AnatomyStructure> = Object.fromEntries(
  ANATOMY_CATALOG.map((item) => [item.id, item]),
) as Record<AnatomyId, AnatomyStructure>;

export const CAMERA_PRESETS: Record<
  CameraPresetId,
  { label: string; position: [number, number, number]; target: [number, number, number] }
> = {
  front: {
    label: "Front",
    position: [0, 0.08, 3.62],
    target: [0, -0.02, 0],
  },
  back: {
    label: "Back",
    position: [0, 0.08, -3.62],
    target: [0, -0.02, 0],
  },
  left: {
    label: "Left",
    position: [3.55, 0.08, 0.0],
    target: [0, -0.02, 0],
  },
  right: {
    label: "Right",
    position: [-3.55, 0.08, 0.0],
    target: [0, -0.02, 0],
  },
  reset: {
    label: "Reset",
    position: [0.56, 0.16, 3.56],
    target: [0, -0.02, 0],
  },
};
