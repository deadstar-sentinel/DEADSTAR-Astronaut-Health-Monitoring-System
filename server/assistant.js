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

function buildFallbackAnswer({ question, selectedOrganId, mode }) {
  const organ = selectedOrganId ? STRUCTURE_KNOWLEDGE[selectedOrganId] : null;
  const q = question.toLowerCase();

  if (mode === "thermal" && (q.includes("temp") || q.includes("thermal") || q.includes("heat") || q.includes("color"))) {
    return (
      "In Thermal Mode, the color spectrum (Deep Navy -> Neon Blue -> Cyan -> Violet -> Magenta/Red -> Orange/Yellow) " +
      "is a relative visualization layer designed to distinguish deeper/metabolically active anatomical zones from superficial tissue. " +
      "It does not display measured patient temperatures." +
      (organ ? ` Currently focused on ${organ.name}: ${organ.location}` : "")
    );
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

  for (const [id, info] of Object.entries(STRUCTURE_KNOWLEDGE)) {
    if (q.includes(id.replace("_", " ")) || q.includes(info.name.toLowerCase())) {
      return `${info.name} — Location: ${info.location} Function: ${info.function} ${info.details} (Educational simulation reference.)`;
    }
  }

  return (
    "Select any organ in the 3D viewport or directory (e.g., Brain, Heart, Lungs, Liver, Kidneys, Pancreas) to inspect its anatomical location, " +
    "biological function, and isolated view. You can switch between Holographic, X-Ray, Organ, Muscular, Nervous, Thermal, and Realistic modes " +
    "from the left panel. (Educational anatomical simulation; non-diagnostic.)"
  );
}

export async function answerMedicalQuery({ question, selectedOrganId, mode, isolated }) {
  const cleanQuestion = String(question || "").trim().slice(0, 600);
  if (!cleanQuestion) {
    return {
      answer: "Please enter an anatomical or visualization question.",
      source: "knowledge-base",
    };
  }

  const organ = selectedOrganId && STRUCTURE_KNOWLEDGE[selectedOrganId] ? STRUCTURE_KNOWLEDGE[selectedOrganId] : null;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return {
      answer: buildFallbackAnswer({ question: cleanQuestion, selectedOrganId, mode }),
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

    const contextLines = [
      `Active Visualization Mode: ${mode || "holographic"}`,
      `Selected Structure: ${organ ? `${organ.name} (${organ.location})` : "Full Body Overview"}`,
      `Isolation Active: ${isolated ? "Yes (organ isolated)" : "No (full body)"}`,
      organ ? `Biological Function: ${organ.function}` : "",
      organ ? `Model Details: ${organ.details}` : "",
      "Strict Rules:",
      "- Provide concise, medically accurate educational anatomy explanations in 2-4 crisp sentences.",
      "- Never invent patient vital signs, clinical measurements, or temperatures.",
      "- If asked about Thermal Mode colors, state clearly that thermal colors are an illustrative visualization layer, not measured patient temperature.",
      "- Include a brief non-diagnostic reminder only if giving clinical context.",
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
    answer: buildFallbackAnswer({ question: cleanQuestion, selectedOrganId, mode }),
    source: "knowledge-base",
  };
}
