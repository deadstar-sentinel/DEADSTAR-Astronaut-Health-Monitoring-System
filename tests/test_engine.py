from datetime import datetime, timedelta, timezone

import numpy as np

from app.engine.isolator import isolate
from app.engine.ledger import Ledger
from app.engine.lightdelay import earth_mars_distance_au, must_act_onboard


def utc(*a):
    return datetime(*a, tzinfo=timezone.utc)


def test_earth_mars_distance_is_physical():
    for day in range(0, 800, 7):
        d = earth_mars_distance_au(utc(2026, 1, 1) + timedelta(days=day))
        assert 0.37 < d < 2.68


def test_known_geometry():
    # Mars solar conjunction Jan 2026 (far), opposition Feb 2027 (near).
    assert earth_mars_distance_au(utc(2026, 1, 9)) > 2.3
    assert earth_mars_distance_au(utc(2027, 2, 20)) < 0.75


def test_light_cone_rule():
    assert must_act_onboard(30 * 60, 14 * 60)["act_onboard"] is True
    assert must_act_onboard(48 * 3600, 14 * 60)["act_onboard"] is False


def test_ledger_detects_tampering(tmp_path):
    led = Ledger(tmp_path / "l.jsonl")
    led.append({"who": "MORI", "p_fever_24h": 0.62})
    led.append({"who": "NOVAK", "onsd_mm_30d": 5.4})
    assert led.verify()["ok"]
    text = (tmp_path / "l.jsonl").read_text().replace("0.62", "0.91")
    (tmp_path / "l.jsonl").write_text(text)
    assert not led.verify()["ok"]


def test_isolator_ship_vs_body():
    crew = ["MORI", "NOVAK", "VASQUEZ", "OKAFOR"]
    t = np.linspace(0, 1, 50)
    co2 = 2000 + 3000 * t
    ship = np.tile(3 * t, (4, 1))
    assert isolate(ship, crew, env=co2)["verdict"]["kind"] == "SHIP"
    body = np.zeros((4, 50)); body[0] = 3 * t
    v = isolate(body, crew)["verdict"]
    assert v["kind"] == "BODY" and v["who"] == "MORI"
