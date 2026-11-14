import { GoogleGenAI } from "@google/genai";

const MODEL_ID = "gemini-4-hydrogen";

const STRUCTURE_KNOWLEDGE = {
  brain: {
    name: "Brain",
    location: "Cranial cavity inside the neurocranium, continuous with the brainstem and spinal cord.",
    function:
      "Integrates sensory perception, initiates voluntary motor commands, coordinates balance via the cerebellum, and maintains autonomic regulation.",
    details:
      "Visible structures in the 3D twin include the folded cerebral hemispheres, cerebellum, brainstem, and cranial optic/vestibular pathways.",
  },
  heart: {
    name: "Heart",
    location: "Middle mediastinum between the lungs, angled left into the left lung's cardiac notch.",
    function:
      "Pumps deoxygenated blood to the lungs via the pulmonary trunk and oxygenated blood systemically through the aorta.",
    details:
      "Includes right and left ventricles, atria, and cardiac apex with cyclic systolic-diastolic motion when animation is active.",
  },
  lungs: {
    name: "Lungs",
    location: "Left and right pleural cavities superior to the diaphragm.",
    function:
      "Facilitate alveolar O₂/CO₂ gas exchange across pulmonary capillary membranes supplied by the trachea and bronchial tree.",
    details:
      "Shows paired lungs, bronchial arborization, and the left cardiac notch accommodating the heart.",
  },
  liver: {
    name: "Liver",
    location: "Right upper abdominal quadrant beneath the diaphragm.",
    function:
      "Performs metabolic processing, bile synthesis, plasma protein production, glycogen regulation, and detoxification.",
    details: "Modeled with primary right and left lobes overlapping the upper gastric region.",
  },
  kidneys: {
    name: "Kidneys",
    location: "Retroperitoneal space flanking the lumbar spine (T12–L3).",
    function:
      "Filter blood plasma, balance electrolytes and fluid volume, regulate systemic arterial pressure, and excrete urine via ureters.",
    details: "Right kidney sits slightly lower due to the liver; ureters descend to the bladder.",
  },
  stomach: {
    name: "Stomach",
    location: "Left upper abdominal quadrant between esophagus and duodenum.",
    function:
      "Secretes gastric acid and digestive enzymes while churning ingested food into chyme.",
    details: "Curved muscular chamber resting anterior to the pancreas.",
  },
  pancreas: {
    name: "Pancreas",
    location: "Retroperitoneal epigastrium posterior to the stomach.",
    function:
      "Exocrine acini release digestive enzymes into the duodenum; endocrine islets secrete insulin and glucagon for glucose regulation.",
    details:
      "Sculpted procedurally with head, body, tapering tail, and main pancreatic duct aligned to the twin's abdominal bounds.",
  },
  small_intestine: {
    name: "Small intestine",
    location: "Central abdominal cavity encircled by the colon.",
    function:
      "Primary site of enzymatic digestion and nutrient/micronutrient absorption across duodenal, jejunal, and ileal mucosa.",
    details: "Procedural multi-loop intestinal coil fitted inside the colon frame.",
  },
  large_intestine: {
    name: "Large intestine",
    location: "Peripheral abdominal frame from right iliac fossa to pelvic sigmoid colon.",
    function:
      "Absorbs remaining water and electrolytes, hosts microbiome fermentation, and consolidates stool.",
    details: "Procedural haustrated ascending, transverse, descending, and sigmoid colon segments.",
  },
  spine: {
    name: "Spine",
    location: "Dorsal midline from base of skull to sacrum.",
    function:
      "Supports axial posture, absorbs compressive loads, and protects the spinal cord and exiting nerve roots.",
    details: "Segmented vertebral bodies and spinous processes with physiological curvature.",
  },
  skeletal: {
    name: "Skeletal system",
    location: "Full-body axial and appendicular bony framework.",
    function:
      "Provides structural support, organ protection, muscle attachment levers, mineral storage, and hematopoiesis.",
    details: "Comprises skull, rib cage, sternum, shoulder girdle, spine, pelvis, and limb bones.",
  },
  muscular: {
    name: "Muscular system",
    location: "Myofascial envelopes surrounding trunk, shoulders, arms, and legs.",
    function:
      "Produces voluntary locomotion, joint stability, posture control, and metabolic heat.",
    details: "Procedural striated muscle layer fitted inside the outer body silhouette.",
  },
  nervous: {
    name: "Nervous system",
    location: "Central brain/spinal axis and branching peripheral nerve plexuses.",
    function:
      "Conducts rapid bio-electric action potentials for sensation, cognition, motor control, and autonomic reflexes.",
    details: "Combines GLB cranial structures with procedural spinal cord and peripheral nerve tracts.",
  },
  circulatory: {
    name: "Circulatory system",
    location: "Heart and systemic arterial/venous pathways throughout head, torso, and limbs.",
    function:
      "Transports oxygen, nutrients, immune mediators, and metabolic byproducts across capillary beds.",
    details: "Combines heart and major arteries from twin.glb with procedural venous return trunks.",
  },
};

const SUIT_KNOWLEDGE = {
  helmet_assembly: {
    name: "Helmet Assembly",
    location: "Cranial dome and quick-disconnect anodized titanium neck ring atop the Hard Upper Torso.",
    purpose: "Maintains a pressurized spherical breathing bubble and protects against vacuum and impact.",
    principles: "Dual-seal rotary neck disconnect locks to the torso; internal ducting directs dry O2 down the inner visor.",
  },
  helmet_visor: {
    name: "Helmet Visor",
    location: "Forward optical shield integrated into the EVA helmet.",
    purpose: "Filters >99.9% UV/IR solar glare while displaying crisp EVA telemetry HUD symbology.",
    principles: "Vapor-deposited gold-cyan dichroic coating reflects infrared thermal load while keeping visual clarity.",
  },
  communication_system: {
    name: "Communication System",
    location: "Headset earcups, boom mic, and dorsal helmet conformal S-band blade antenna.",
    purpose: "Maintains encrypted voice and biometric/PLSS telemetry downlink.",
    principles: "Redundant UHF/S-band transceivers couple to the conformal antenna and noise-canceling mic array.",
  },
  chest_display: {
    name: "Chest Display (DCM)",
    location: "Anterior pectoral Display and Control Module mounted to the Hard Upper Torso.",
    purpose: "Provides glove-accessible O2 purge valves, cooling loop control, and live HUD caution/warning readouts.",
    principles: "Vacuum-sealed OLED/holographic tactical module paired with guarded switches; clickable in 3D to open the AI Monitoring Dashboard.",
  },
  plss: {
    name: "Primary Life Support System (PLSS)",
    location: "Dorsal backpack enclosure mounted behind the upper torso.",
    purpose: "Sustains closed-loop breathable atmosphere, O2 storage, CO2 scrubbing, thermal cooling, and avionics power.",
    principles: "Recirculates humid CO2-laden return air through dual amine beds, sublimator heat exchanger, and pressure regulators.",
  },
  oxygen_supply: {
    name: "Oxygen Supply",
    location: "Port and starboard high-pressure composite bottles inside the PLSS core.",
    purpose: "Stores compressed breathable O2 up to 20,700 kPa (3,000 psi) for respiration and suit pressurization.",
    principles: "Feeds dual-stage pressure reducers that replenish metabolic O2 draw (~0.9–1.2 L/min nominal).",
  },
  co2_removal: {
    name: "CO2 Removal System",
    location: "Upper PLSS cartridge bay inline with the ventilation blower.",
    purpose: "Prevents hypercapnia by scrubbing exhaled carbon dioxide below 3.0 mmHg.",
    principles: "Rapid-cycle dual amine beds alternate between CO2 adsorption inside the suit loop and vacuum regeneration outside.",
  },
  cooling_system: {
    name: "Cooling System",
    location: "Lower PLSS sublimator heat exchanger and LCVG cooling umbilical hoses.",
    purpose: "Rejects astronaut metabolic heat and avionics thermal load to prevent heat stress.",
    principles: "Chilled water circulates through body-hugging LCVG tubes and vents waste heat via a porous-plate vacuum sublimator.",
  },
  pressure_regulation: {
    name: "Pressure Regulation",
    location: "Lateral PLSS regulator valve block feeding chest DCM manifold.",
    purpose: "Maintains stable 29.6 kPa (4.3 psi) internal suit pressure with rapid makeup flow.",
    principles: "Bellows-referenced valves balance O2 inflow against metabolic use and protect against over-pressure.",
  },
  electrical_power: {
    name: "Electrical Power",
    location: "Lower rear PLSS lithium-ion battery compartment and 28V DC bus.",
    purpose: "Powers ventilation blowers, coolant pumps, CO2 cycling valves, heaters, sensors, and HUD avionics.",
    principles: "Hot-swappable solid-state Li-Ion battery pack protected by smart solid-state breakers.",
  },
  shoulder_joints: {
    name: "Shoulder Joints",
    location: "Bilateral glenohumeral scye bearing rings joining torso and arms.",
    purpose: "Permits wide overhead reach under suit pressure without fatiguing spring-back.",
    principles: "Dual-race ball bearings and constant-volume convoluted bellows minimize joint torque.",
  },
  elbow_joints: {
    name: "Elbow Joints",
    location: "Mid-arm articulation between upper sleeve and forearm.",
    purpose: "Supports tool manipulation and visor reach with minimal forearm effort.",
    principles: "Convoluted restraint bellows paired with axial Vectran load tapes preserve internal volume during flexion.",
  },
  wrist_bearings: {
    name: "Wrist Bearings & Wrist HUD",
    location: "Distal forearm quick-disconnect rotary rings and left-forearm biometric cuff.",
    purpose: "Allows continuous 360° glove rotation while providing forearm biometric readout.",
    principles: "Sealed radial bearings mate EVA gloves via bayonet detents; left cuff links directly to the AI Monitoring Dashboard.",
  },
  gloves: {
    name: "Gloves",
    location: "Pressurized left and right hand gauntlets locked onto wrist disconnects.",
    purpose: "Maintains tactile dexterity while insulating hands and preventing cuts.",
    principles: "Gas-tight urethane bladder inside Vectran cut-restraint weave with active fingertip heaters.",
  },
  waist_assembly: {
    name: "Waist Assembly",
    location: "Lumbar and pelvic brief coupling upper and lower torso.",
    purpose: "Transfers structural loads, anchors safety tethers, and enables trunk bending/twisting.",
    principles: "Triple-axis rolling convolutes and large waist bearing allow planetary geology crouch/reach.",
  },
  hip_joints: {
    name: "Hip Joints",
    location: "Bilateral pelvic hip bearings connecting waist brief to thighs.",
    purpose: "Enables walking stride and kneeling under 29.6 kPa internal pressure.",
    principles: "Multi-bearing hip gimbals convert multi-axis leg movement into low-torque rotary motion.",
  },
  knee_joints: {
    name: "Knee Joints",
    location: "Mid-leg articulated bellows between thigh and shin sleeves.",
    purpose: "Supports >115° knee flexion for surface traverse and ladder climbing.",
    principles: "Reinforced Orthofabric knee pads and restraint link-nets hold cross-section stability.",
  },
  leg_assemblies: {
    name: "Leg Assemblies",
    location: "Pressurized femoral and tibial sleeves enclosing lower limbs.",
    purpose: "Contains breathing pressure, shields against abrasive regolith dust, and routes LCVG tubes.",
    principles: "Layered pressure bladder, Vectran restraint fabric, and outer Ortho-Fabric barrier.",
  },
  boots: {
    name: "Boots",
    location: "Ankle-locked EVA footwear with lugged thermal soles.",
    purpose: "Insulates feet down to -185 °C cryogenic shadow regolith while preserving traction.",
    principles: "Aerogel/Dacron thermal soles block conductive heat loss beneath pressurized ankle bellows.",
  },
  thermal_protection_layers: {
    name: "Thermal Protection Layers",
    location: "Outermost Thermal Micrometeoroid Garment (TMG) and internal Multi-Layer Insulation (MLI).",
    purpose: "Protects crew from -160 °C to +125 °C radiative swings and micrometeoroid impacts.",
    principles: "7-layer aluminized Kapton/Mylar MLI blankets beneath PTFE/Kevlar/Nomex Ortho-Fabric shell.",
  },
  pressure_bladder: {
    name: "Pressure Bladder",
    location: "Innermost gas-tight urethane-coated nylon liner enveloping the crew LCVG.",
    purpose: "Contains pure O2 atmosphere at 29.6 kPa against external space vacuum.",
    principles: "RF-welded polyurethane film inside Dacron hoop restraint prevents ballooning or gas leaks.",
  },
  emergency_oxygen_system: {
    name: "Emergency Oxygen System (SOP)",
    location: "Secondary Oxygen Pack bolted beneath the main PLSS housing.",
    purpose: "Delivers 30+ minutes of automatic open-loop emergency purge oxygen if primary pressure fails.",
    principles: "Dual 41,000 kPa reserve cylinders actuate passively below 24.5 kPa suit differential pressure.",
  },
};

function buildFallbackAnswer({
  question,
  selectedOrganId,
  selectedSuitComponentId,
  suitActive,
  mode,
  alerts = [],
  telemetrySummary,
}) {
  const organ = selectedOrganId ? STRUCTURE_KNOWLEDGE[selectedOrganId] : null;
  const suitPart = selectedSuitComponentId ? SUIT_KNOWLEDGE[selectedSuitComponentId] : null;
  const q = question.toLowerCase();

  if (mode === "thermal" && (q.includes("temp") || q.includes("thermal") || q.includes("heat") || q.includes("color"))) {
    return (
      "In Thermal Mode, the color spectrum (Deep Navy -> Neon Blue -> Cyan -> Violet -> Magenta/Red -> Orange/Yellow) " +
      "is a relative simulated visualization layer highlighting higher thermal load areas (such as PLSS battery/heat zones or internal metabolic cores) versus insulated cool shells. " +
      "It is not measured clinical thermometry." +
      (suitPart ? ` Focused on ${suitPart.name}: ${suitPart.location}` : organ ? ` Focused on ${organ.name}: ${organ.location}` : "")
    );
  }

  if (q.includes("alert") || q.includes("why") || q.includes("emergency") || q.includes("warning") || q.includes("trigger")) {
    if (alerts.length > 0) {
      const top = alerts[0];
      return `${top.title} (${top.severity.toUpperCase()} — ${top.componentName}): Triggered because ${top.reason} Sensor reading: ${top.sensorReading}. Recommended simulated response: ${top.recommendedAction} (Demonstration telemetry model, not flight hardware output.)`;
    }
    if (telemetrySummary) {
      return `All simulated EVA telemetry subsystems are currently NOMINAL (${telemetrySummary}). You can inject a simulated fault (e.g., O2 Leak, CO2 Saturation, Thermal Spike) inside the AI Monitoring Dashboard to inspect emergency alert triggers.`;
    }
  }

  if (q.includes("forecast") || q.includes("48") || q.includes("predict")) {
    return (
      "The 48-Hour Predictive Forecast models simulated consumable trajectories (O2 %, CO2 scrubber capacity, Battery %, and Cooling efficiency) at Current, +6h, +12h, +24h, and +48h horizons. " +
      "Because autonomous portable EVA PLSS consumables typically last 8–10 hours without habitat umbilical replenishment, reaching 0% in long horizons explicitly marks when airlock recharge/cartridge swap is mandatory. " +
      "(Simulated projection for educational planning; non-diagnostic.)"
    );
  }

  if (suitPart) {
    return `${suitPart.name} — Location: ${suitPart.location} Purpose: ${suitPart.purpose} Operating Principle: ${suitPart.principles} (Educational EVA aerospace simulation.)`;
  }

  if (organ) {
    if (q.includes("where") || q.includes("locat")) {
      return `${organ.name}: Located in the ${organ.location} ${organ.details} (Educational 3D anatomical simulation; non-diagnostic.)`;
    }
    if (q.includes("function") || q.includes("do") || q.includes("role") || q.includes("purpose")) {
      return `${organ.name}: ${organ.function} ${organ.details} (Educational 3D anatomical simulation; non-diagnostic.)`;
    }
    return `${organ.name} — Location: ${organ.location} Function: ${organ.function} ${organ.details} (Educational simulation reference, not clinical diagnosis.)`;
  }

  for (const [id, info] of Object.entries(SUIT_KNOWLEDGE)) {
    if (q.includes(id.replaceAll("_", " ")) || q.includes(info.name.toLowerCase())) {
      return `${info.name} — Location: ${info.location} Purpose: ${info.purpose} Principle: ${info.principles}`;
    }
  }

  for (const [id, info] of Object.entries(STRUCTURE_KNOWLEDGE)) {
    if (q.includes(id.replaceAll("_", " ")) || q.includes(info.name.toLowerCase())) {
      return `${info.name} — Location: ${info.location} Function: ${info.function} ${info.details} (Educational simulation reference.)`;
    }
  }

  if (suitActive) {
    return (
      "Astronaut Spacesuit Mode is active. Click any of the 22 spacesuit components (or the glowing Chest DCM / Wrist HUD) to inspect engineering specs, explode suit layers, or analyze live simulated EVA telemetry, alerts, and 48-hour forecasts."
    );
  }

  return (
    "Select any organ in the 3D viewport or switch to Astronaut Spacesuit Mode to inspect the 22 EVA life-support & mobility subsystems, Engineering cutaway, Thermal layers, or AI Telemetry Monitoring Dashboard. (Educational simulation; non-diagnostic.)"
  );
}

export async function answerMedicalQuery({
  question,
  selectedOrganId,
  selectedSuitComponentId,
  suitActive,
  explodeProgress,
  mode,
  isolated,
  alerts = [],
  telemetrySummary = "",
}) {
  const cleanQuestion = String(question || "").trim().slice(0, 600);
  if (!cleanQuestion) {
    return {
      answer: "Please enter an anatomical, spacesuit engineering, or telemetry question.",
      source: "knowledge-base",
    };
  }

  const organ = selectedOrganId && STRUCTURE_KNOWLEDGE[selectedOrganId] ? STRUCTURE_KNOWLEDGE[selectedOrganId] : null;
  const suitPart = selectedSuitComponentId && SUIT_KNOWLEDGE[selectedSuitComponentId] ? SUIT_KNOWLEDGE[selectedSuitComponentId] : null;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return {
      answer: buildFallbackAnswer({
        question: cleanQuestion,
        selectedOrganId,
        selectedSuitComponentId,
        suitActive,
        mode,
        alerts,
        telemetrySummary,
      }),
      source: "knowledge-base",
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const alertSummaryText = alerts.length
      ? alerts.map((a) => `[${a.severity.toUpperCase()}] ${a.title} (${a.componentName}): ${a.sensorReading} — ${a.reason}`).join("; ")
      : "None (All suit subsystems nominal)";

    const contextLines = [
      `Platform State: ${suitActive ? "Astronaut EVA Spacesuit Mode" : "Normal Human Anatomy Mode"}`,
      `Active Visualization Mode: ${mode || "holographic"}`,
      suitActive ? `Exploded View Disassembly: ${Math.round((explodeProgress || 0) * 100)}%` : "",
      `Selected Organ: ${organ ? `${organ.name} (${organ.location})` : "None"}`,
      `Selected Spacesuit Component: ${suitPart ? `${suitPart.name} (${suitPart.location})` : "None"}`,
      `Isolation Active: ${isolated ? "Yes" : "No"}`,
      organ ? `Organ Biological Function: ${organ.function}` : "",
      suitPart ? `Suit Component Purpose: ${suitPart.purpose} | Principle: ${suitPart.principles}` : "",
      telemetrySummary ? `Current Simulated Suit Telemetry: ${telemetrySummary}` : "",
      `Active Simulated Alerts: ${alertSummaryText}`,
      "Strict Rules:",
      "- Provide concise, scientifically accurate medical or aerospace engineering explanations in 2-4 crisp sentences.",
      "- Clearly state that any telemetry, vitals, or 48h forecast values are simulated educational demonstration data, never clinical diagnosis or real patient data.",
      "- If asked about an alert, explain clearly WHY it triggered and WHICH subsystem is affected.",
      "- If asked about Thermal Mode colors, state clearly they are a relative simulated visualization layer.",
    ]
      .filter(Boolean)
      .join("\n");

    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error("Gemini request timed out")), 5000);
    });

    let response;
    try {
      response = await Promise.race([
        ai.models.generateContent({
          model: MODEL_ID,
          contents: `${contextLines}\n\nUser question: ${cleanQuestion}`,
        }),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timerId);
    }

    const text = response.text?.trim();
    if (text) {
      return { answer: text, source: "gemini" };
    }
  } catch (err) {
    console.warn("Gemini assistant fallback:", err?.message || err);
  }

  return {
    answer: buildFallbackAnswer({
      question: cleanQuestion,
      selectedOrganId,
      selectedSuitComponentId,
      suitActive,
      mode,
      alerts,
      telemetrySummary,
    }),
    source: "knowledge-base",
  };
}
