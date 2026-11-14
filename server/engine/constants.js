export const SOURCES = {
  hrp_risks: {
    title: "NASA Human Research Program — Human Health and Performance Risks",
    url: "https://www.nasa.gov/hrp/risks/",
  },
  hrp_research: {
    title: "NASA HRP — Ongoing Research (ARCHeR, Standard Measures, B-Complex, Thigh Cuff, CIPHER ...)",
    url: "https://www.nasa.gov/hrp/ongoing-hrp-research/",
  },
  bone_evidence: {
    title: "HRP Evidence Report: Risk of Bone Fracture due to Spaceflight-induced Changes to Bone (2017)",
    url: "https://ntrs.nasa.gov/api/citations/20170004597/downloads/20170004597.pdf",
    note: "BMD declines 1-1.5% per month at weight-bearing sites (hip, lumbar spine).",
  },
  bone_qct: {
    title: "Lang et al. 2004, J Bone Miner Res — Cortical and trabecular bone loss from spine and hip in long-duration spaceflight",
    url: "https://pubmed.ncbi.nlm.nih.gov/15125798/",
    note: "~1%/month spine, ~1.5%/month hip (Mir cosmonauts, DXA).",
  },
  msl_rad_cruise: {
    title: "Zeitlin et al. 2013, Science — MSL/RAD measurements in transit to Mars",
    url: "https://www.swri.org/press-release/swri-led-team-calculates-radiation-exposure-associated-trip-mars",
    note: "Average 1.8 mSv/day dose equivalent inside the MSL cruise vehicle.",
  },
  msl_rad_surface: {
    title: "Hassler et al. 2014, Science — Mars surface radiation environment measured by Curiosity RAD",
    url: "https://www.science.org/doi/10.1126/science.1244797",
    note: "~0.64 mSv/day dose equivalent on the Martian surface.",
  },
  lunar_lnd: {
    title: "Zhang et al. 2020, Science Advances — First measurements of radiation dose on the lunar surface (Chang'e-4 LND)",
    url: "https://www.science.org/doi/10.1126/sciadv.aaz1334",
    note: "~1.37 mSv/day dose equivalent on the lunar surface.",
  },
  nasa_std_3001: {
    title: "NASA-STD-3001 Vol. 1 — career effective dose limit of 600 mSv",
    url: "https://www.nasa.gov/reference/nasa-std-3001-technical-documents/",
  },
  twins: {
    title: "Garrett-Bakelman et al. 2019, Science — The NASA Twins Study",
    url: "https://pubmed.ncbi.nlm.nih.gov/30975860/",
    note: "25-month multi-system reference trajectory for a 340-day mission.",
  },
  i4_osdr: {
    title: "Inspiration4 human data on NASA Open Science Data Repository (OSDR)",
    url: "https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/",
    note: "First open-access human clinical + omics data from a commercial crew (CBC, CMP, cytokines, omics).",
  },
  osdr: {
    title: "NASA Open Science Data Repository (GeneLab + ALSDA)",
    url: "https://osdr.nasa.gov/bio/",
  },
  donki: {
    title: "NASA CCMC DONKI — Space Weather Database of Notifications, Knowledge, Information",
    url: "https://ccmc.gsfc.nasa.gov/tools/DONKI/",
  },
  space_fever: {
    title: "Stahn et al. 2017, Scientific Reports — Increased core body temperature in astronauts during long-duration space missions",
    url: "https://www.nature.com/articles/s41598-017-15560-w",
    note: "Resting core temperature rose by ~1 °C over long-duration ISS missions.",
  },
  isssleep: {
    title: "Barger et al. 2014, Lancet Neurology — Sleep deficiency in astronauts on Shuttle and ISS missions",
    url: "https://pubmed.ncbi.nlm.nih.gov/25127232/",
    note: "ISS astronauts averaged ~6 h of sleep per night.",
  },
  two_process: {
    title: "Borbély 1982 / Daan, Beersma & Borbély 1984 — Two-process model of sleep regulation",
    url: "https://pubmed.ncbi.nlm.nih.gov/7185792/",
  },
  mars_light_time: {
    title: "ESA Mars Express — Spacecraft event time vs. Earth receive time (one-way light time ~4 to ~24 min)",
    url: "https://blogs.esa.int/mex/2012/08/05/time-delay-between-mars-and-earth/",
  },
  co2_std: {
    title: "NASA OCHMO Technical Brief OCHMO-TB-002 (ECLSS) — average 1-hour ppCO2 < 3 mmHg",
    url: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf",
  },
  co2_headache: {
    title: "NASA OCHMO-TB-004 Carbon Dioxide — headache risk <1% needs 7-day average CO2 < 2.5 mmHg",
    url: "https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/",
  },
  jpl_elements: {
    title: "JPL Solar System Dynamics — Approximate Positions of the Planets (Keplerian elements)",
    url: "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
  },
};

export const BMD_LOSS_PER_MONTH_HIP = 0.015;
export const BMD_LOSS_PER_MONTH_SPINE = 0.010;
export const CAREER_DOSE_LIMIT_MSV = 600.0;
export const CORE_TEMP_RISE_LONG_DURATION_C = 1.0;
export const ISS_MEAN_SLEEP_H = 6.0;

export const TAU_RISE_H = 18.2;
export const TAU_DECAY_H = 4.2;
export const C_AMPLITUDE = 0.12;
export const C_ACROPHASE_H = 16.8;

export const SPEED_OF_LIGHT_KM_S = 299_792.458;
export const AU_KM = 149_597_870.7;

export const MISSIONS = {
  mars_transit: {
    id: "mars_transit",
    name: "Mars Transit — Outbound",
    short: "MARS TRANSIT",
    duration_days: 210,
    current_day: 150,
    gravity_g: 0.0,
    dose_msv_day: 1.84,
    dose_source: "msl_rad_cruise",
    light_time: "earth_mars",
    eva: false,
    description:
      "Deep-space cruise between Earth and Mars. Highest chronic GCR exposure, " +
      "no resupply, and a communication delay that makes real-time ground support impossible.",
  },
  mars_surface: {
    id: "mars_surface",
    name: "Mars Surface Stay",
    short: "MARS SURFACE",
    duration_days: 500,
    current_day: 160,
    gravity_g: 0.38,
    dose_msv_day: 0.64,
    dose_source: "msl_rad_surface",
    light_time: "earth_mars",
    eva: true,
    description:
      "Long surface campaign at 0.38 g with frequent EVAs, partial atmospheric shielding " +
      "and Earth-independent medical operations.",
  },
  artemis: {
    id: "artemis",
    name: "Artemis Lunar Surface Campaign",
    short: "ARTEMIS",
    duration_days: 30,
    current_day: 18,
    gravity_g: 0.166,
    dose_msv_day: 1.37,
    dose_source: "lunar_lnd",
    light_time: "moon",
    eva: true,
    description:
      "Gateway plus surface operations at 1/6 g. EVA-heavy schedule, 1.3-second light delay.",
  },
  iss: {
    id: "iss",
    name: "ISS Long-Duration Expedition",
    short: "ISS",
    duration_days: 180,
    current_day: 120,
    gravity_g: 0.0,
    dose_msv_day: 0.50,
    dose_source: "hrp_risks",
    light_time: "leo",
    eva: true,
    description:
      "Low Earth orbit, inside the magnetosphere. Near-real-time ground support — " +
      "the reference case every deep-space mission is compared against.",
  },
};

export const DEFAULT_MISSION = "mars_transit";

export const SIGNALS = {
  hr:        { label: "Heart rate", unit: "bpm", kind: "hourly", normal: [50, 100], decimals: 0 },
  hrv:       { label: "HRV (RMSSD)", unit: "ms", kind: "hourly", normal: [25, 120], decimals: 0 },
  spo2:      { label: "SpO₂", unit: "%", kind: "hourly", normal: [94, 100], decimals: 1 },
  rr:        { label: "Respiratory rate", unit: "br/min", kind: "hourly", normal: [10, 20], decimals: 1 },
  temp:      {
    label: "Core temperature", unit: "°C", kind: "hourly", normal: [36.1, 37.9], decimals: 2,
    threshold: { value: 38.0, dir: "above", label: "fever ≥ 38.0 °C" },
  },
  sbp:       { label: "Systolic BP", unit: "mmHg", kind: "hourly", normal: [90, 135], decimals: 0 },
  dbp:       { label: "Diastolic BP", unit: "mmHg", kind: "hourly", normal: [55, 85], decimals: 0 },
  sleep_h:   {
    label: "Sleep duration", unit: "h", kind: "daily", normal: [6.0, 9.5], decimals: 1,
    threshold: { value: 5.0, dir: "below", label: "sleep < 5 h" },
  },
  cognition: { label: "Cognition composite", unit: "pts", kind: "daily", normal: [85, 115], decimals: 1 },
  mood:      { label: "Mood / stress index", unit: "pts", kind: "daily", normal: [55, 100], decimals: 0 },
  mass:      { label: "Body mass", unit: "kg", kind: "daily", normal: [0, 999], decimals: 1 },
  bmd:       {
    label: "Hip BMD (est.)", unit: "% baseline", kind: "daily", normal: [94, 101], decimals: 2,
    threshold: { value: 90.0, dir: "below", label: "−10 % hip BMD" },
  },
  muscle:    { label: "Leg strength", unit: "% baseline", kind: "daily", normal: [90, 105], decimals: 1 },
  vo2:       { label: "VO₂max", unit: "% baseline", kind: "daily", normal: [88, 105], decimals: 1 },
  onsd:      {
    label: "Optic nerve sheath Ø", unit: "mm", kind: "daily", normal: [4.2, 5.7], decimals: 2,
    threshold: { value: 6.0, dir: "above", label: "ONSD ≥ 6.0 mm (SANS)" },
  },
  plasma:    { label: "Plasma volume", unit: "% baseline", kind: "daily", normal: [85, 102], decimals: 1 },
  dose:      {
    label: "Cumulative dose", unit: "mSv", kind: "daily", normal: [0, 600], decimals: 1,
    threshold: { value: 600.0, dir: "above", label: "NASA career limit 600 mSv" },
  },
  exercise:  { label: "Exercise", unit: "min", kind: "daily", normal: [120, 240], decimals: 0 },
  glucose:   {
    label: "Blood glucose (fasting)", unit: "mg/dL", kind: "daily", normal: [70, 105], decimals: 0,
    threshold: { value: 126.0, dir: "above", label: "fasting ≥ 126 mg/dL" },
  },
  pvt:       { label: "Reaction time (PVT)", unit: "ms", kind: "daily", normal: [200, 320], decimals: 0 },
};

export const ENV_SIGNALS = {
  co2: {
    label: "Cabin ppCO₂", unit: "mmHg", normal: [0.5, 3.0], decimals: 2,
    threshold: { value: 3.0, dir: "above", label: "NASA 1-h limit 3 mmHg" },
  },
  rad_rate:   { label: "Dose rate", unit: "µSv/h", normal: [0, 120], decimals: 1 },
  cabin_temp: { label: "Cabin temperature", unit: "°C", normal: [18, 27], decimals: 1 },
  humidity:   { label: "Relative humidity", unit: "%", normal: [25, 70], decimals: 0 },
  pressure:   { label: "Cabin pressure", unit: "kPa", normal: [97, 103], decimals: 1 },
};

export const CO2_LIMIT_1H_MMHG = 3.0;
export const CO2_HEADACHE_7D_MMHG = 2.5;

export const SCENARIOS = {
  baseline: { key: "1", label: "Baseline", desc: "Mission as flown: each astronaut's own storyline." },
  co2:      { key: "2", label: "CO₂ scrubber degradation", desc: "Carbon dioxide removal assembly losing efficiency over the last 6 h." },
  solar:    { key: "3", label: "Solar particle event", desc: "A solar energetic particle event arriving now." },
  fatigue:  { key: "4", label: "Crew fatigue", desc: "Four nights of compressed sleep for the whole crew before a critical task." },
};

export const HOURLY_SIGNALS = Object.keys(SIGNALS).filter((k) => SIGNALS[k].kind === "hourly");
export const FORECAST_DAILY = ["sleep_h", "cognition", "mood", "mass", "bmd", "muscle", "vo2", "onsd", "plasma", "dose", "glucose"];
export const DAILY_SIGNALS = Object.keys(SIGNALS).filter((k) => SIGNALS[k].kind === "daily");

export const HRP_RISKS = [
  { id: "immune", name: "Altered Immune Response", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/", organ: "lymph" },
  { id: "sensorimotor", name: "Sensorimotor / Vestibular", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/", organ: "head" },
  { id: "cardio", name: "Cardiovascular Adaptations", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/", organ: "heart" },
  { id: "dcs", name: "Decompression Sickness", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-decompression-sickness/", organ: "joints" },
  { id: "microbe", name: "Host–Microorganism Interactions", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-host-microorganism-interactions/", organ: "gut" },
  { id: "hypoxia", name: "Hypoxia", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-hypoxia/", organ: "lungs" },
  { id: "nutrition", name: "Food & Nutrition", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/", organ: "gut" },
  { id: "eva", name: "EVA Injury & Performance", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/", organ: "joints" },
  { id: "fitness", name: "Cardiorespiratory & Muscle Fitness", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/", organ: "legs" },
  { id: "sans", name: "SANS (Neuro-ocular)", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/", organ: "eyes" },
  { id: "bone", name: "Bone Changes / Fracture", group: "Physiology", url: "https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/", organ: "hips" },
  { id: "behavior", name: "Behavioral & Psychiatric", group: "Behavior", url: "https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/", organ: "brain" },
  { id: "teamwork", name: "Teamwork & Communication", group: "Behavior", url: "https://www.nasa.gov/reference/risk-of-inadequate-teamwork/", organ: "brain" },
  { id: "sleep", name: "Sleep & Circadian", group: "Behavior", url: "https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/", organ: "brain" },
  { id: "systems", name: "Systems Operations Support", group: "Behavior", url: "https://www.nasa.gov/reference/risk-of-inadequate-systems-operations-support/", organ: "brain" },
  { id: "dynamic", name: "Dynamic Loads (landing)", group: "Behavior", url: "https://www.nasa.gov/reference/risk-of-injury-from-dynamic-loads/", organ: "spine" },
  { id: "cancer", name: "Radiation-Induced Cancer", group: "Radiation", url: "https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/", organ: "body" },
];
