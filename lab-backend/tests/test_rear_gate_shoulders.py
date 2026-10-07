"""The rear body-visibility gate must be able to exclude the shoulders, so
lower-body-only captures (shoulders out of frame) are not rejected."""
from __future__ import annotations


class _LM:
    def __init__(self, v: float):
        self.visibility = v
        self.x = 0.5
        self.y = 0.5


def _landmarks(shoulder_vis: float, body_vis: float = 0.8):
    arr = [_LM(body_vis) for _ in range(26)]  # HALPE-26
    arr[5] = _LM(shoulder_vis)   # L_SHOULDER
    arr[6] = _LM(shoulder_vis)   # R_SHOULDER
    return arr


def test_body_gate_includes_shoulders_by_default():
    from core.pose.rear_metrics import _body_gate_visibility

    lm = _landmarks(shoulder_vis=0.2, body_vis=0.8)
    assert _body_gate_visibility(lm, gate_shoulders=True) == 0.2


def test_body_gate_excludes_shoulders_when_disabled():
    from core.pose.rear_metrics import _body_gate_visibility

    lm = _landmarks(shoulder_vis=0.2, body_vis=0.8)
    assert _body_gate_visibility(lm, gate_shoulders=False) == 0.8


def test_config_has_gate_shoulders_default_true():
    from core.pose.rear_metrics import RearMetricConfig

    assert RearMetricConfig().gate_shoulders is True
    assert RearMetricConfig(gate_shoulders=False).gate_shoulders is False
