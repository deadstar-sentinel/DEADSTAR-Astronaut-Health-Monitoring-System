"""Decision layer stubs (feature canon ranks 3-6, 9-10).

- early_warning(): pattern signature with lead time (infection: temp up, HR up,
  HRV down together while each value is still in range).
- hrp_risks(): map every alert to one of NASA's 17 HRP risks, with its page
  https://www.nasa.gov/hrp/risks/
- eva_go_no_go(): mission-control style poll, one GO / NO-GO per body system,
  readiness from the two-process (sleep pressure + circadian) model.
- what_if(): countermeasures (exercise, sleep, B-vitamins, thigh cuffs,
  bisphosphonates, storm shelter). B-Complex and Thigh Cuff are ongoing NASA
  studies: their effects are shown as hypotheses under test.
- inventory_check(): never propose a protocol whose kit item is not aboard
  (data/inventory.json); a Mars crew has no resupply.
- space_weather(): NASA DONKI events via a personal api.nasa.gov key (env
  NASA_API_KEY), falling back to data/cache/ when the venue has no internet.

Wording rule: SENTINEL starts the onboard protocol and alerts the crew at
once; the crew medical officer confirms. Decision support, never diagnosis.
"""


def early_warning(*a, **k): raise NotImplementedError
def hrp_risks(*a, **k): raise NotImplementedError
def eva_go_no_go(*a, **k): raise NotImplementedError
def what_if(*a, **k): raise NotImplementedError
def inventory_check(*a, **k): raise NotImplementedError
def space_weather(*a, **k): raise NotImplementedError
