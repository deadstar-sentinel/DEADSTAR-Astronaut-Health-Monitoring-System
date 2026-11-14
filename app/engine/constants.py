"""Every constant SENTINEL uses, next to its source.

Rule (Design Bible): a judge must be able to audit any number in 10 seconds.
`verified=False` means a teammate has not yet checked the value against the
cited source. The Methods tab shows unverified constants in CAUTION colour,
so nothing unchecked can hide. Flip to True only after checking the source.
"""
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Const:
    value: object
    unit: str
    source: str
    url: str = ""
    verified: bool = False


# --- Physics (exact by definition) -------------------------------------------
C_KM_S = Const(299_792.458, "km/s", "Speed of light, SI definition", verified=True)
AU_KM = Const(149_597_870.7, "km", "Astronomical unit, IAU 2012 Resolution B2", verified=True)

# --- Radiation -----------------------------------------------------------------
MARS_CRUISE_DOSE = Const(
    1.84, "mSv/day",
    "Zeitlin et al. 2013, Science 340:1080, Curiosity MSL/RAD cruise measurements",
    "https://doi.org/10.1126/science.1235989",
)
CAREER_DOSE_LIMIT = Const(
    600, "mSv",
    "NASA-STD-3001 Vol. 1 Rev. B (2022) career effective dose limit",
)

# --- Bone ----------------------------------------------------------------------
BMD_LOSS_PER_MONTH = Const(
    (1.0, 1.5), "% per month (hip and spine)",
    "NASA HRP Evidence Report: Risk of Bone Fracture due to Spaceflight-induced Changes to Bone (2017)",
)

# --- Clinical thresholds (general adult reference values) ---------------------
FEVER_C = Const(38.0, "degC", "Common clinical fever threshold")
SPO2_ACT = Const(92, "%", "Common clinical action threshold for supplemental oxygen")
CO2_LIMIT = Const(
    3.0, "mmHg (1-h average)",
    "NASA-STD-3001 Vol. 2, cabin CO2 limit",
)

# --- Gravity -------------------------------------------------------------------
G_MOON = Const(0.166, "g", "Lunar surface gravity, NASA planetary fact sheet")
G_MARS = Const(0.38, "g", "Mars surface gravity, NASA planetary fact sheet")

# --- Earth-Moon light time -----------------------------------------------------
MOON_ONE_WAY_S = Const(1.28, "s", "Mean Earth-Moon distance / c")

# --- JPL approximate Keplerian elements, Table 1 (valid 1800-2050) -------------
# [a (au), e, I (deg), L (deg), long.peri (deg), long.node (deg)] + rates per century
JPL_URL = "https://ssd.jpl.nasa.gov/planets/approx_pos.html"
ELEMENTS = {
    "earth": Const(
        ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
         (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
        "au/deg", "JPL Approximate Positions of the Planets, Table 1 (EM barycenter)", JPL_URL),
    "mars": Const(
        ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
         (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
        "au/deg", "JPL Approximate Positions of the Planets, Table 1 (Mars)", JPL_URL),
}

# --- Mission profiles ----------------------------------------------------------
MISSIONS = {
    "iss": {"label": "ISS", "gravity_g": 0.0, "delay": "fixed", "one_way_s": 0.0},
    "artemis": {"label": "Artemis lunar surface", "gravity_g": G_MOON.value, "delay": "fixed",
                "one_way_s": MOON_ONE_WAY_S.value},
    "mars_transit": {"label": "Mars transit", "gravity_g": 0.0, "delay": "live",
                     "dose_msv_day": MARS_CRUISE_DOSE.value},
    "mars_surface": {"label": "Mars surface", "gravity_g": G_MARS.value, "delay": "live"},
}


def all_constants():
    """Return every Const in this module for the Methods tab."""
    out = []
    for name, val in globals().items():
        if isinstance(val, Const):
            out.append({"name": name, **asdict(val)})
    for body, val in ELEMENTS.items():
        out.append({"name": f"ELEMENTS.{body}", **asdict(val)})
    return out
