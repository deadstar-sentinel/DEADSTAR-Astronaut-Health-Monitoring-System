# NASA data and evidence used by LIFELINE

Every constant lives with its source in `app/engine/constants.py`.

| Source | What it gives | How LIFELINE uses it |
|---|---|---|
| [NASA HRP — Human Health and Performance Risks](https://www.nasa.gov/hrp/risks/) | The 17 official risks | Risk taxonomy; every alert links to NASA's page |
| [NASA HRP — Ongoing Research](https://www.nasa.gov/hrp/ongoing-hrp-research/) | ARCHeR actigraphy, Standard Measures, B-Complex, Thigh Cuff, CIPHER | Data schema (wrist actigraphy, standard measures) and countermeasures in the what-if panel |
| [HRP Evidence Report: Bone (2017)](https://ntrs.nasa.gov/api/citations/20170004597/downloads/20170004597.pdf) | Hip/spine BMD fall 1–1.5 % per month | Prior on the bone-loss slope; fracture-risk band |
| [Lang et al. 2004, JBMR](https://pubmed.ncbi.nlm.nih.gov/15125798/) | ~1 %/month spine, ~1.5 %/month hip | Calibration of the bone model |
| [MSL/RAD cruise (Zeitlin et al. 2013)](https://www.swri.org/press-release/swri-led-team-calculates-radiation-exposure-associated-trip-mars) | 1.8 mSv/day inside a Mars cruise vehicle | Mars-transit dose rate |
| [MSL/RAD surface (Hassler et al. 2014)](https://www.science.org/doi/10.1126/science.1244797) | ~0.64 mSv/day on Mars | Mars-surface dose rate |
| [Chang'e-4 LND (Zhang et al. 2020)](https://www.science.org/doi/10.1126/sciadv.aaz1334) | ~1.37 mSv/day on the Moon | Artemis dose rate |
| [NASA-STD-3001](https://www.nasa.gov/reference/nasa-std-3001-technical-documents/) | 600 mSv career limit | Radiation risk and projections |
| [OCHMO-TB-002 ECLSS](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-002-eclss.pdf) | 1-hour average ppCO₂ < 3 mmHg | Ship-vs-body CO₂ limit |
| [OCHMO-TB-004 CO₂](https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/) | Headache risk < 1 % needs 7-day CO₂ < 2.5 mmHg | Chronic CO₂ flag |
| [NASA Twins Study (Science 2019)](https://pubmed.ncbi.nlm.nih.gov/30975860/) | 25-month multi-system trajectory | Shape of long-duration change the twin reproduces |
| [Inspiration4 data on NASA OSDR](https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/) | Open human clinical + omics data | Reference ranges; plug-in source via CSV upload |
| [NASA OSDR (GeneLab + ALSDA)](https://osdr.nasa.gov/bio/) | Open spaceflight biology | Extension path for molecular markers |
| [Stahn et al. 2017, Sci Rep](https://www.nature.com/articles/s41598-017-15560-w) | Core temperature rises ~1 °C on long missions | "Space fever" drift in the temperature model |
| [Barger et al. 2014, Lancet Neurology](https://pubmed.ncbi.nlm.nih.gov/25127232/) | ~6 h sleep per night on ISS | Sleep baseline |
| [CCMC DONKI](https://ccmc.gsfc.nasa.gov/tools/DONKI/) | Live SEP, flare and CME events | Live radiation alerts |
| [JPL approximate planetary positions](https://ssd.jpl.nasa.gov/planets/approx_pos.html) | Keplerian elements | Today's Earth–Mars light time |
