export type SuitSubsystemId =
  | "all"
  | "helmet"
  | "life_support"
  | "mobility"
  | "protection"
  | "avionics";

export type SuitComponentId =
  | "helmet_assembly"
  | "helmet_visor"
  | "communication_system"
  | "chest_display"
  | "plss"
  | "oxygen_supply"
  | "co2_removal"
  | "cooling_system"
  | "pressure_regulation"
  | "electrical_power"
  | "shoulder_joints"
  | "elbow_joints"
  | "wrist_bearings"
  | "gloves"
  | "waist_assembly"
  | "hip_joints"
  | "knee_joints"
  | "leg_assemblies"
  | "boots"
  | "thermal_protection_layers"
  | "pressure_bladder"
  | "emergency_oxygen_system";

export interface SuitSubsystemMeta {
  id: SuitSubsystemId;
  label: string;
}

export interface SpacesuitComponent {
  id: SuitComponentId;
  name: string;
  code: string;
  subsystem: Exclude<SuitSubsystemId, "all">;
  location: string;
  purpose: string;
  operatingPrinciples: string;
  keySpecs: string[];
  thermalBias: number;
  realisticColor: string;
  assetSource: "z2.glb" | "procedural" | "hybrid";
  assetNote: string;
  focusTarget: [number, number, number];
  focusCameraOffset: [number, number, number];
  labelOffset: [number, number, number];
  explodeOffset: [number, number, number];
}

export const SUIT_SUBSYSTEMS: SuitSubsystemMeta[] = [
  { id: "all", label: "All Subsystems" },
  { id: "life_support", label: "Life Support" },
  { id: "helmet", label: "Helmet & Visor" },
  { id: "avionics", label: "Avionics & Power" },
  { id: "mobility", label: "Mobility & Joints" },
  { id: "protection", label: "Protection Layers" },
];

export const SPACESUIT_CATALOG: SpacesuitComponent[] = [
  {
    id: "helmet_assembly",
    name: "Helmet Assembly",
    code: "HLM-01",
    subsystem: "helmet",
    location: "Cranial dome and quick-disconnect anodized titanium neck ring atop the Hard Upper Torso.",
    purpose:
      "Maintains a pressurized spherical breathing bubble around the crew member's head while protecting against vacuum, orbital debris, and solar radiation.",
    operatingPrinciples:
      "Dual-seal rotary neck disconnect locks onto the upper torso ring; internal airflow manifold sweeps fresh O2 downward across the inner visor to prevent condensation.",
    keySpecs: ["Pressure Rated: 57.2 kPa proof", "Ring Bore: 31.8 cm", "Impact Polycarbonate"],
    thermalBias: 0.42,
    realisticColor: "#DCE6F2",
    assetSource: "hybrid",
    assetNote: "Segmented cranial shell from NASA z2.glb paired with procedural anodized neck locking collar",
    focusTarget: [0, 0.78, 0.04],
    focusCameraOffset: [0.32, 0.14, 0.84],
    labelOffset: [0.18, 0.14, 0.06],
    explodeOffset: [0, 0.34, 0.04],
  },
  {
    id: "helmet_visor",
    name: "Helmet Visor",
    code: "VSR-02",
    subsystem: "helmet",
    location: "Forward hemispherical optical shield integrated into the EVA helmet assembly.",
    purpose:
      "Filters ultraviolet, infrared, and intense solar glare while projecting crisp holographic heads-up telemetry and preserving wide peripheral vision.",
    operatingPrinciples:
      "Multi-layer optical polycarbonate shield coated with vapor-deposited gold-cyan dichroic thin film reflects infrared thermal load while transmitting visible light and micro-HUD symbology.",
    keySpecs: ["UV Rejection: >99.9%", "Gold-Cyan Dichroic Coat", "Dual Anti-Fog Shield"],
    thermalBias: 0.56,
    realisticColor: "#D9A84E",
    assetSource: "procedural",
    assetNote: "Procedural sculpted optical bubble visor fitted cleanly to z2.glb helmet opening",
    focusTarget: [0, 0.76, 0.15],
    focusCameraOffset: [0.24, 0.08, 0.68],
    labelOffset: [-0.2, 0.1, 0.14],
    explodeOffset: [0, 0.28, 0.28],
  },
  {
    id: "communication_system",
    name: "Communication System",
    code: "COM-03",
    subsystem: "avionics",
    location: "Temporal headset carrier, bone-conduction transceivers, and dorsal helmet conformal S-band antenna.",
    purpose:
      "Provides encrypted full-duplex EVA voice communication and continuous biomedical/PLSS telemetry downlink to habitat and orbital relay.",
    operatingPrinciples:
      "Dual-redundant UHF/S-band transceivers inside the PLSS connect via shielded coax to the helmet conformal antenna and noise-canceling directional boom microphones.",
    keySpecs: ["S-Band / UHF Redundant", "Downlink: 2.4 Mbps", "VOX & PTT Channels"],
    thermalBias: 0.61,
    realisticColor: "#4C6A92",
    assetSource: "procedural",
    assetNote: "Procedural comm carrier ring, microphone boom, and dorsal helmet blade antenna",
    focusTarget: [0.12, 0.77, -0.02],
    focusCameraOffset: [0.44, 0.12, 0.54],
    labelOffset: [0.24, 0.08, 0.0],
    explodeOffset: [0.26, 0.26, -0.06],
  },
  {
    id: "chest_display",
    name: "Chest Display",
    code: "DCM-04",
    subsystem: "avionics",
    location: "Anterior pectoral Display and Control Module (DCM) mounted directly to the Hard Upper Torso.",
    purpose:
      "Serves as the primary tactile and holographic suit command panel for O2 purge control, cooling valve trim, radio channels, and live caution/warning readouts.",
    operatingPrinciples:
      "Backlit OLED/holographic tactical screen paired with guarded toggle switches and rotary valves readable in bright sunlight or orbital eclipse. Clickable in 3D to open the AI Monitoring Dashboard.",
    keySpecs: ["Interactive HUD Link", "IP68 Vacuum Sealed", "Glove-Operable Guarded Valves"],
    thermalBias: 0.68,
    realisticColor: "#14263D",
    assetSource: "procedural",
    assetNote: "Procedural DCM chassis with live telemetry CanvasTexture synced to suit alert state",
    focusTarget: [0, 0.44, 0.22],
    focusCameraOffset: [0.22, 0.08, 0.66],
    labelOffset: [0.58, -0.16, 0.22],
    explodeOffset: [0, 0.04, 0.34],
  },
  {
    id: "plss",
    name: "Primary Life Support System",
    code: "PLSS-05",
    subsystem: "life_support",
    location: "Dorsal backpack enclosure integrated behind the Hard Upper Torso rear hatch.",
    purpose:
      "Houses closed-loop atmospheric regeneration, oxygen storage, CO2 scrubbing, thermal rejection, pressure control, and suit avionics in one modular EVA pack.",
    operatingPrinciples:
      "Draws warm humid CO2-laden gas from limb ventilation ducts, scrubs CO2 and moisture, cools the loop via a sublimator heat exchanger, injects regulated O2, and recirculates conditioned air.",
    keySpecs: ["EVA Endurance Baseline: 8.5 h", "Closed-Loop Ventilation", "Modular Hatch Access"],
    thermalBias: 0.74,
    realisticColor: "#CED8E5",
    assetSource: "hybrid",
    assetNote: "z2.glb dorsal PLSS cowling + procedural internal avionics/structural chassis",
    focusTarget: [0, 0.45, -0.25],
    focusCameraOffset: [0.38, 0.14, -0.96],
    labelOffset: [-0.56, 0.36, -0.22],
    explodeOffset: [0, 0.08, -0.44],
  },
  {
    id: "oxygen_supply",
    name: "Oxygen Supply",
    code: "O2S-06",
    subsystem: "life_support",
    location: "Port and starboard high-pressure composite vessels recessed inside the PLSS core.",
    purpose:
      "Stores breathable medical-grade gaseous oxygen to sustain crew respiration and maintain positive suit pressurization throughout EVA operations.",
    operatingPrinciples:
      "Carbon-overwrapped aluminum-lined pressure vessels store compressed O2 at up to 20,700 kPa (3,000 psi), feeding dual pressure-reducing regulators into the helmet airflow loop.",
    keySpecs: ["Max Storage: 20,700 kPa", "Nominal Flow: 0.9–1.2 L/min", "Dual-Bottle Manifold"],
    thermalBias: 0.38,
    realisticColor: "#00A8E8",
    assetSource: "procedural",
    assetNote: "Procedural twin composite high-pressure O2 cylinders + manifold inside PLSS bay",
    focusTarget: [-0.08, 0.48, -0.25],
    focusCameraOffset: [-0.46, 0.12, -0.78],
    labelOffset: [-0.26, 0.12, -0.18],
    explodeOffset: [-0.22, 0.06, -0.34],
  },
  {
    id: "co2_removal",
    name: "CO2 Removal System",
    code: "CO2-07",
    subsystem: "life_support",
    location: "Central upper PLSS cartridge bay inline with the suit ventilation return blower.",
    purpose:
      "Continuously extracts exhaled carbon dioxide from suit breathing gas to prevent hypercapnia and cognitive impairment during physical exertion.",
    operatingPrinciples:
      "Dual alternating rapid-cycle amine beds adsorb CO2 from cabin return air while vacuum-desorbing the off-line bed to space, eliminating single-use canister saturation during nominal EVA.",
    keySpecs: ["Dual Amine Bed Cycle", "Target pCO2 < 3.0 mmHg", "Auto Bed Regeneration"],
    thermalBias: 0.64,
    realisticColor: "#8A5CFF",
    assetSource: "procedural",
    assetNote: "Procedural dual cylindrical scrubber cartridges and rotary diverter valve inside PLSS",
    focusTarget: [0.07, 0.51, -0.25],
    focusCameraOffset: [0.44, 0.14, -0.76],
    labelOffset: [0.24, 0.14, -0.16],
    explodeOffset: [0.2, 0.1, -0.34],
  },
  {
    id: "cooling_system",
    name: "Cooling System",
    code: "TCL-08",
    subsystem: "life_support",
    location: "Lower-central PLSS sublimator heat exchanger and torso/limb Liquid Cooling & Ventilation Garment (LCVG) umbilical tubes.",
    purpose:
      "Removes metabolic body heat and electronics waste heat inside the insulated pressure suit to prevent heat stress and hyperthermia.",
    operatingPrinciples:
      "Chilled water circulates through thin LCVG capillary tubing against the astronaut's skin and returns to a porous-plate water-membrane evaporator (sublimator) rejecting heat directly to vacuum.",
    keySpecs: ["Heat Rejection: 880 W Peak", "Coolant Temp: 7–15 °C", "Closed Water Loop"],
    thermalBias: 0.24,
    realisticColor: "#00E5FF",
    assetSource: "procedural",
    assetNote: "Procedural sublimator fins, coolant manifold, and routed cyan cooling conduits",
    focusTarget: [0, 0.34, -0.24],
    focusCameraOffset: [-0.38, 0.06, -0.78],
    labelOffset: [-0.24, -0.02, -0.16],
    explodeOffset: [0, -0.14, -0.34],
  },
  {
    id: "pressure_regulation",
    name: "Pressure Regulation",
    code: "PRG-09",
    subsystem: "life_support",
    location: "Anterior-lateral PLSS manifold block coupled to the chest DCM pressure selector.",
    purpose:
      "Maintains stable 29.6 kPa (4.3 psi) internal suit pressure with rapid automatic makeup flow and over-pressure relief protection.",
    operatingPrinciples:
      "Spring-referenced absolute bellows valve modulates O2 inflow from high-pressure tanks while barometric relief valves vent excess gas during airlock repressurization or purge.",
    keySpecs: ["Nominal Suit: 29.6 kPa (4.3 psi)", "Dual-Stage Redundant", "Over-Pressure Relief"],
    thermalBias: 0.52,
    realisticColor: "#F59E0B",
    assetSource: "procedural",
    assetNote: "Procedural titanium regulator valve block, pressure transducers, and braided supply lines",
    focusTarget: [0.14, 0.39, -0.12],
    focusCameraOffset: [0.56, 0.08, -0.45],
    labelOffset: [0.24, 0.02, -0.06],
    explodeOffset: [0.28, 0.02, -0.16],
  },
  {
    id: "electrical_power",
    name: "Electrical Power",
    code: "PWR-10",
    subsystem: "avionics",
    location: "Lower rear PLSS battery compartment and insulated DC power bus.",
    purpose:
      "Supplies isolated low-voltage DC power for ventilation fans, coolant pumps, CO2 cycling valves, heaters, sensors, comms, and holographic HUD avionics.",
    operatingPrinciples:
      "Hot-swappable solid-state lithium-ion battery module outputs 28V regulated DC through triple-fault-tolerant smart solid-state breakers monitored by the AI telemetry core.",
    keySpecs: ["28V DC Regulated Bus", "Capacity: 1.4 kWh", "Triple Fault Isolation"],
    thermalBias: 0.79,
    realisticColor: "#22C55E",
    assetSource: "procedural",
    assetNote: "Procedural Li-Ion cell module with illuminated telemetry bus bar inside lower PLSS bay",
    focusTarget: [0, 0.25, -0.26],
    focusCameraOffset: [0.4, -0.02, -0.78],
    labelOffset: [0.22, -0.12, -0.18],
    explodeOffset: [0, -0.22, -0.32],
  },
  {
    id: "shoulder_joints",
    name: "Shoulder Joints",
    code: "SHJ-11",
    subsystem: "mobility",
    location: "Bilateral glenohumeral scye openings joining the Hard Upper Torso to the upper sleeves.",
    purpose:
      "Enables wide overhead and cross-chest arm reach under internal suit pressure without excessive spring-back torque.",
    operatingPrinciples:
      "Low-friction dual-race ball-bearing scye rings combine with multi-convolute flat-pattern restraint bellows to hold constant internal volume throughout shoulder rotation.",
    keySpecs: ["Constant-Volume Bellows", "360° Bearing Rotation", "Low-Torque Races"],
    thermalBias: 0.45,
    realisticColor: "#94A3B8",
    assetSource: "hybrid",
    assetNote: "z2.glb shoulder sleeve segments paired with procedural titanium scye bearing rings",
    focusTarget: [0.23, 0.48, 0.03],
    focusCameraOffset: [0.64, 0.14, 0.62],
    labelOffset: [0.24, 0.1, 0.04],
    explodeOffset: [0.22, 0.08, 0.02],
  },
  {
    id: "elbow_joints",
    name: "Elbow Joints",
    code: "ELJ-12",
    subsystem: "mobility",
    location: "Mid-arm articulation between upper-arm restraint sleeves and forearm housings.",
    purpose:
      "Supports repetitive tool handling, tether clipping, and hand-to-helmet visor reach with minimal astronaut forearm fatigue.",
    operatingPrinciples:
      "Segmented rolling-convolute bellows constrained by axial Dacron/Vectran restraint cords equalize pressure forces across 120° of elbow flexion.",
    keySpecs: ["Flexion Range: 0–125°", "Axial Restraint Tapes", "Upper-Arm Rotary Bearing"],
    thermalBias: 0.43,
    realisticColor: "#8FA4BC",
    assetSource: "z2.glb",
    assetNote: "Segmented elbow & arm shells extracted from NASA z2.glb",
    focusTarget: [0.3, 0.34, 0.16],
    focusCameraOffset: [0.68, 0.1, 0.6],
    labelOffset: [0.24, 0.04, 0.06],
    explodeOffset: [0.26, 0, 0.1],
  },
  {
    id: "wrist_bearings",
    name: "Wrist Bearings",
    code: "WRB-13",
    subsystem: "mobility",
    location: "Distal forearm quick-disconnect rotary rings and left forearm wrist telemetry cuff.",
    purpose:
      "Permits effortless 360° hand pronation/supination under full pressure while providing a secondary forearm telemetry display.",
    operatingPrinciples:
      "Sealed stainless-steel radial bearings with bayonet locking detents mate the EVA gloves to the forearm; the left cuff integrates an interactive auxiliary biometric HUD.",
    keySpecs: ["Continuous 360° Swivel", "Dual O-Ring Pressure Seal", "Wrist Biometric HUD"],
    thermalBias: 0.51,
    realisticColor: "#38BDF8",
    assetSource: "procedural",
    assetNote: "Procedural anodized rotary wrist disconnect collars + interactive left-wrist HUD screen",
    focusTarget: [0.31, 0.2, 0.42],
    focusCameraOffset: [0.58, 0.1, 0.72],
    labelOffset: [0.22, 0.02, 0.12],
    explodeOffset: [0.28, -0.02, 0.16],
  },
  {
    id: "gloves",
    name: "Gloves",
    code: "GLV-14",
    subsystem: "mobility",
    location: "Terminal left and right pressurized hand assemblies attached at the wrist disconnects.",
    purpose:
      "Protects hands against extreme conductive heat/cold and sharp micrometeoroid edges while retaining fine tactile dexterity for switches and tools.",
    operatingPrinciples:
      "Custom laser-fitted fingers combine a gas-tight urethane bladder, Vectran restraint fabric, textured silicone fingertip pads, and miniature resistive fingertip heaters.",
    keySpecs: ["Active Fingertip Heaters", "Vectran Cut Layer", "High-Dexterity Finger Joints"],
    thermalBias: 0.49,
    realisticColor: "#C8D3E0",
    assetSource: "z2.glb",
    assetNote: "Segmented EVA glove geometry extracted from NASA z2.glb",
    focusTarget: [0.3, 0.16, 0.56],
    focusCameraOffset: [0.52, 0.08, 0.85],
    labelOffset: [0.22, -0.04, 0.14],
    explodeOffset: [0.3, -0.04, 0.24],
  },
  {
    id: "waist_assembly",
    name: "Waist Assembly",
    code: "WST-15",
    subsystem: "mobility",
    location: "Lumbar and pelvic junction coupling the Hard Upper Torso to the Lower Torso Assembly.",
    purpose:
      "Transfers structural loads across the torso, houses the waist bearing for trunk twist, and anchors external EVA safety tethers.",
    operatingPrinciples:
      "Triple-axis rolling-convolute waist brief paired with a large-diameter waist bearing enables bending to pick up planetary geology tools without volume loss.",
    keySpecs: ["3-Axis Brief Geometry", "Integrated Tether Anchors", "Quick-Latched Body Seal"],
    thermalBias: 0.46,
    realisticColor: "#B7C6D8",
    assetSource: "z2.glb",
    assetNote: "Segmented waist brief & pelvic coupling shell extracted from NASA z2.glb",
    focusTarget: [0, 0.1, 0.05],
    focusCameraOffset: [0.52, 0.14, 0.88],
    labelOffset: [-0.24, 0.04, 0.08],
    explodeOffset: [0, -0.04, 0.16],
  },
  {
    id: "hip_joints",
    name: "Hip Joints",
    code: "HPJ-16",
    subsystem: "mobility",
    location: "Bilateral pelvic hip bearings connecting the waist brief to upper thigh assemblies.",
    purpose:
      "Allows natural walking stride, kneeling, and planetary hatch ingress while maintaining uniform internal suit pressure.",
    operatingPrinciples:
      "Twin angled three-bearing hip gimbals convert multi-plane leg motion into smooth rotational bearing movement with minimal resistance.",
    keySpecs: ["Dual Gimbal Hip Bearings", "110° Forward Stride", "Constant Internal Volume"],
    thermalBias: 0.41,
    realisticColor: "#93A7BF",
    assetSource: "z2.glb",
    assetNote: "Segmented upper thigh / hip bearing region extracted from NASA z2.glb",
    focusTarget: [0.16, -0.05, 0.05],
    focusCameraOffset: [0.55, 0.08, 0.88],
    labelOffset: [0.24, 0.0, 0.06],
    explodeOffset: [0.18, -0.06, 0.08],
  },
  {
    id: "knee_joints",
    name: "Knee Joints",
    code: "KNJ-17",
    subsystem: "mobility",
    location: "Articulated mid-limb joints separating upper thigh and lower leg sections.",
    purpose:
      "Provides high-angle knee flexion for walking, kneeling, and climbing planetary ladders without ballooning or binding.",
    operatingPrinciples:
      "Link-net restraint cords and patterned bellows pleats maintain knee cross-section stability and return energy smoothly during stride cycles.",
    keySpecs: ["Flexion: >115°", "Reinforced Orthofabric Knee Pad", "Dust-Sealed Crease"],
    thermalBias: 0.39,
    realisticColor: "#8EA2B8",
    assetSource: "z2.glb",
    assetNote: "Segmented knee bellows & kneecap region extracted from NASA z2.glb",
    focusTarget: [0.15, -0.44, 0.06],
    focusCameraOffset: [0.54, 0.08, 0.86],
    labelOffset: [0.22, 0.0, 0.08],
    explodeOffset: [0.18, -0.1, 0.1],
  },
  {
    id: "leg_assemblies",
    name: "Leg Assemblies",
    code: "LEG-18",
    subsystem: "mobility",
    location: "Pressurized femoral and tibial lower-limb sleeves between the hip bearings and boot disconnects.",
    purpose:
      "Encloses lower limbs in pressurized restraint, dust-shielding outer fabric, and conductive/radiative thermal insulation.",
    operatingPrinciples:
      "Multi-layer soft-goods leg tubes combine inner pressure bladder, Vectran weave load restraint, and outer ruggedized TMG abrasion barriers.",
    keySpecs: ["Dust-Repellent TMG Outer", "Adjustable Sizing Rings", "LCVG Hose Routing"],
    thermalBias: 0.35,
    realisticColor: "#C5D0DC",
    assetSource: "z2.glb",
    assetNote: "Segmented lower-leg pressurized assemblies extracted from NASA z2.glb",
    focusTarget: [0.14, -0.62, 0.05],
    focusCameraOffset: [-0.6, 0.1, 1.0],
    labelOffset: [-0.24, -0.06, 0.06],
    explodeOffset: [0.16, -0.14, 0.06],
  },
  {
    id: "boots",
    name: "Boots",
    code: "BTS-19",
    subsystem: "mobility",
    location: "Terminal left and right lunar/planetary EVA footwear locked onto the lower leg ankle disconnects.",
    purpose:
      "Insulates feet against cryogenic regolith temperatures (-180 °C) and rough basaltic terrain while anchoring into EVA foot restraints.",
    operatingPrinciples:
      "Deep-lugged silicone thermal soles paired with multi-layer aerogel and Dacron felt footbeds block conductive heat loss while ankle bellows preserve natural toe-off.",
    keySpecs: ["Cryo-Rated to -185 °C", "High-Traction Silicone Tread", "Aerogel Sole Barrier"],
    thermalBias: 0.28,
    realisticColor: "#546579",
    assetSource: "z2.glb",
    assetNote: "Segmented EVA planetary boots extracted from NASA z2.glb",
    focusTarget: [0.14, -0.85, 0.08],
    focusCameraOffset: [0.56, 0.14, 0.92],
    labelOffset: [0.24, 0.04, 0.1],
    explodeOffset: [0.16, -0.22, 0.1],
  },
  {
    id: "thermal_protection_layers",
    name: "Thermal Protection Layers",
    code: "TMG-20",
    subsystem: "protection",
    location: "Outermost Thermal Micrometeoroid Garment (TMG) and Multi-Layer Insulation (MLI) wrapping the entire suit.",
    purpose:
      "Shields the pressurized occupant from extreme +120 °C sunlit to -160 °C shadowed radiative swings, hypervelocity micrometeoroids, and abrasive lunar dust.",
    operatingPrinciples:
      "Seven-layer aluminized Mylar/Kapton radiative blankets sandwiched beneath ruggedized white Ortho-Fabric (PTFE/Kevlar/Nomex blend) reflect solar thermal flux and break up impacting micro-particles.",
    keySpecs: ["Range: -160 °C to +125 °C", "7-Layer MLI Aluminized", "Ortho-Fabric MMOD Shield"],
    thermalBias: 0.34,
    realisticColor: "#E8EEF5",
    assetSource: "hybrid",
    assetNote: "z2.glb Hard Upper Torso / outer shell + procedural internal gold Kapton MLI baffle liner",
    focusTarget: [0, 0.42, 0.06],
    focusCameraOffset: [0.68, 0.18, 1.35],
    labelOffset: [-0.28, 0.18, 0.08],
    explodeOffset: [0, 0.12, 0.2],
  },
  {
    id: "pressure_bladder",
    name: "Pressure Bladder",
    code: "PBL-21",
    subsystem: "protection",
    location: "Innermost gas-tight pressurized urethane-coated nylon and Dacron restraint shell directly enveloping the human LCVG.",
    purpose:
      "Contains the 29.6 kPa pure-oxygen breathing atmosphere inside the suit against external vacuum without leakage or ballooning distortion.",
    operatingPrinciples:
      "Radio-frequency welded polyurethane-coated nylon bladder sits inside a structural Dacron restraint net that absorbs hoop and axial pneumatic loads across joints and torso.",
    keySpecs: ["Leak Spec < 0.02 kPa/min", "RF-Welded Urethane Liner", "Dacron Load Netting"],
    thermalBias: 0.62,
    realisticColor: "#3B82F6",
    assetSource: "procedural",
    assetNote: "Procedural translucent ribbed pressurized bladder liner surrounding inner human anatomy",
    focusTarget: [0, 0.3, 0.02],
    focusCameraOffset: [-0.52, 0.14, 1.15],
    labelOffset: [-0.26, -0.06, 0.06],
    explodeOffset: [-0.14, 0.02, 0.08],
  },
  {
    id: "emergency_oxygen_system",
    name: "Emergency Oxygen System",
    code: "SOP-22",
    subsystem: "life_support",
    location: "Inferior Secondary Oxygen Pack (SOP) module bolted below the main PLSS housing.",
    purpose:
      "Automatically injects high-flow emergency breathing and purge oxygen if the primary PLSS loop fails, suit pressure drops, or CO2 spikes dangerously.",
    operatingPrinciples:
      "Dual 41,000 kPa (6,000 psi) micro-cylinders trigger passively when suit differential pressure falls below 24.5 kPa, sustaining 30+ minutes of open-loop purge flow for urgent airlock return.",
    keySpecs: ["Reserve: 30+ min Purge Flow", "Auto-Trigger < 24.5 kPa", "41,000 kPa Reserve Cylinders"],
    thermalBias: 0.55,
    realisticColor: "#FF3158",
    assetSource: "procedural",
    assetNote: "Procedural crimson-accented SOP reserve pack and purge bypass valve beneath PLSS",
    focusTarget: [0, 0.14, -0.27],
    focusCameraOffset: [-0.46, 0.02, -0.78],
    labelOffset: [-0.26, -0.06, -0.18],
    explodeOffset: [0, -0.28, -0.38],
  },
];

export const SUIT_COMPONENT_BY_ID: Record<SuitComponentId, SpacesuitComponent> = Object.fromEntries(
  SPACESUIT_CATALOG.map((item) => [item.id, item]),
) as Record<SuitComponentId, SpacesuitComponent>;
