"""Analyze research benchmark results and print measured conclusions only."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def latest_research_run() -> Optional[Path]:
    runs = sorted((ROOT / "results").glob("research_*"))
    return runs[-1] if runs else None


def analyze(run_dir: Optional[Path] = None) -> dict:
    run_dir = Path(run_dir) if run_dir else latest_research_run()
    if not run_dir or not run_dir.exists():
        print("No research run found. Execute: python main.py benchmark-research")
        return {}
    summary = json.loads((run_dir / "summary.json").read_text())
    gen = summary.get("psnr_generalization") or []
    print("=" * 60)
    print(f"Analysis: {run_dir.name}")
    print(f"Category: {summary.get('category')}")
    print("=" * 60)
    print("\nPSNR generalization (TRUE POSITIVES / measured):")
    print(f"{'Model':30s} {'Mean':>8} {'Median':>8} {'%≥70':>7} {'%≥75':>7} {'%≥80':>7} {'TP rate':>8}")
    for g in gen:
        name = (g.get("model_name") or g["model"])[:30]
        def f(x):
            return f"{x:7.2f}" if x is not None else "    n/a"
        print(
            f"{name:30s} {f(g.get('mean_psnr'))} {f(g.get('median_psnr'))} "
            f"{f(g.get('pct_ge_70'))} {f(g.get('pct_ge_75'))} {f(g.get('pct_ge_80'))} "
            f"{f(g.get('exact_recovery_rate'))}"
        )
    best = summary.get("best_true_positive")
    if best:
        print(
            f"\nBest single-image TP observation: {best['model_name']} "
            f"PSNR={best['psnr']:.4f} on {best['image_id']}"
        )
        print("(This is not an overall superiority claim.)")
    print(f"\nFull data: {run_dir}")
    return summary


if __name__ == "__main__":
    analyze(Path(sys.argv[1]) if len(sys.argv) > 1 else None)
