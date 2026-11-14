"""Forecast ledger: every forecast is written, hash-chained, BEFORE its outcome
is known. The scorecard is computed only from this ledger, so the team cannot
quietly edit a forecast after the fact (pre-registration, as in science).
"""
import hashlib
import json
from pathlib import Path

GENESIS = "0" * 64


def _digest(prev_hash: str, body: dict) -> str:
    payload = prev_hash + json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()


class Ledger:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.touch(exist_ok=True)

    def records(self) -> list[dict]:
        lines = self.path.read_text().splitlines()
        return [json.loads(l) for l in lines if l.strip()]

    def append(self, body: dict) -> dict:
        recs = self.records()
        prev = recs[-1]["hash"] if recs else GENESIS
        rec = {"body": body, "prev": prev, "hash": _digest(prev, body)}
        with self.path.open("a") as f:
            f.write(json.dumps(rec, sort_keys=True) + "\n")
        return rec

    def verify(self) -> dict:
        prev = GENESIS
        for n, rec in enumerate(self.records()):
            if rec["prev"] != prev or rec["hash"] != _digest(prev, rec["body"]):
                return {"ok": False, "broken_at": n}
            prev = rec["hash"]
        return {"ok": True, "records": len(self.records()), "head": prev}
