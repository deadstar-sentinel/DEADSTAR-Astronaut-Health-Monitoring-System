"""Scorecard: computed only from ledger records whose outcome is now known.

Per horizon: MAE, 80 % / 95 % interval coverage, skill vs. "same hour
yesterday", and a reliability diagram for threshold probabilities
(predicted P vs. observed frequency). Label shown on screen:
"Pipeline validation on a synthetic crew" until real data is uploaded.

TODO(engine): implement scorecard(ledger, observed) -> dict
"""


def scorecard(ledger, observed) -> dict:
    raise NotImplementedError("engine workstream: see module docstring")
