"""Normalization and composite score — transparent, config-driven."""
from __future__ import annotations
from typing import Dict, List, Any
import json
from pathlib import Path


def load_config(path: str = None) -> dict:
    p = Path(path or Path(__file__).parent / "config.json")
    return json.loads(p.read_text())


def normalize_metric(values: List[float], higher_is_better: bool) -> List[float]:
    if not values:
        return []
    mn, mx = min(values), max(values)
    if abs(mx - mn) < 1e-12:
        return [0.5] * len(values)
    if higher_is_better:
        return [(v - mn) / (mx - mn) for v in values]
    return [(mx - v) / (mx - mn) for v in values]


def composite_scores(rows: List[Dict[str, Any]], config: dict = None) -> List[Dict[str, Any]]:
    """
    rows: list of per-model aggregate metric dicts (must share same metric keys).
    Returns rows with normalized_* and overall_score fields added.
    """
    cfg = config or load_config()
    weights = cfg["weights"]
    hib = set(cfg["higher_is_better"])
    lib = set(cfg["lower_is_better"])

    metric_keys = [k for k in weights.keys() if any(k in r for r in rows)]
    # collect values
    col = {k: [] for k in metric_keys}
    for r in rows:
        for k in metric_keys:
            col[k].append(float(r.get(k, 0.0)))

    norms = {}
    for k in metric_keys:
        higher = k in hib
        norms[k] = normalize_metric(col[k], higher)

    out = []
    for i, r in enumerate(rows):
        nr = dict(r)
        score = 0.0
        wsum = 0.0
        for k in metric_keys:
            nval = norms[k][i]
            nr[f"norm_{k}"] = round(nval, 4)
            w = weights.get(k, 0.0)
            score += nval * w
            wsum += w
        base = score / wsum if wsum else 0.0
        # Security gate: models with zero attack-recovery are penalized.
        # Rationale: for confidential stego, robustness is a hard requirement.
        # gate = 0.55 + 0.45 * norm_robustness  → zero-robustness models keep 55% of quality score
        rob_n = nr.get("norm_Robustness", 0.0)
        gate = 0.55 + 0.45 * float(rob_n)
        nr["overall_score"] = round(base * gate, 4)
        nr["security_gate"] = round(gate, 4)
        out.append(nr)

    # rank
    ranked = sorted(out, key=lambda x: x["overall_score"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
    return ranked
