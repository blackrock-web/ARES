"""Generate markdown research report from latest measured results."""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def latest_research_run():
    runs = sorted((ROOT / "results").glob("research_*"))
    return runs[-1] if runs else None


def _fmt(x, d=2):
    return f"{x:.{d}f}" if x is not None else "—"


def generate(run_dir: Path = None) -> Path:
    run_dir = Path(run_dir) if run_dir else latest_research_run()
    if not run_dir:
        raise FileNotFoundError("No research_* results found")

    summary = json.loads((run_dir / "summary.json").read_text())
    manifest = json.loads((run_dir / "experiment_manifest.json").read_text())
    gen = summary.get("psnr_generalization") or []
    agg = summary.get("aggregates") or {}

    lines = []
    lines.append("# ARES-Hybrid-INN — Research Validation Report")
    lines.append("")
    lines.append(f"**Generated:** {datetime.utcnow().isoformat()}Z  ")
    lines.append(f"**Experiment ID:** `{manifest.get('experiment_id')}`  ")
    lines.append(f"**Category:** `{manifest.get('category')}`  ")
    lines.append(
        f"**Split:** `{manifest.get('split')}` @ "
        f"**{manifest.get('resolution')}×{manifest.get('resolution')}**  "
    )
    lines.append(f"**Images:** {manifest.get('n_images')}  ")
    lines.append("")
    lines.append(
        "> All PSNR/SSIM/MSE values below are **measured**. "
        "Pilot observations (~75 dB / ~81 dB) are **not** treated as guaranteed outcomes."
    )
    lines.append("")
    lines.append("## 1. Abstract")
    lines.append("")
    lines.append(
        "This report validates ARES-Hybrid-INN against four paper baselines under "
        "identical cover, secret, resolution, and evaluation conditions. "
        "True-positive recovery (exact secret match) is required for primary ranking."
    )
    lines.append("")
    lines.append("## 2. Models")
    lines.append("")
    lines.append("| ID | Role | n | TP |")
    lines.append("|----|------|---|----|")
    for mid in manifest.get("model_ids", []):
        st = agg.get(mid, {})
        role = "Proposed" if ("hybrid" in mid or mid.startswith("ares")) else "Baseline reproduction"
        lines.append(f"| `{mid}` | {role} | {st.get('n', '—')} | {st.get('n_tp', '—')} |")
    lines.append("")
    lines.append(
        "Baselines are REPRODUCED/APPROXIMATION when official weights were unavailable."
    )
    lines.append("")
    lines.append("## 3. Dataset protocol")
    lines.append("")
    avail = manifest.get("availability") or {}
    for ds, info in avail.items():
        status = "available" if info.get("available") else "UNAVAILABLE"
        reason = info.get("reason") or str(info.get("n_images", ""))
        lines.append(f"- **{ds}**: {status} — {reason}")
    lines.append("")
    lines.append("## 4. PSNR generalization (measured)")
    lines.append("")
    lines.append(
        "| Model | Mean PSNR | Median | Std | %≥70 | %≥75 | %≥80 | Exact recovery % |"
    )
    lines.append("|-------|-----------|--------|-----|------|------|------|------------------|")
    for g in gen:
        name = g.get("model_name") or g["model"]
        lines.append(
            f"| {name} | {_fmt(g.get('mean_psnr'), 4)} | {_fmt(g.get('median_psnr'), 4)} | "
            f"{_fmt(g.get('std_psnr'), 4)} | {_fmt(g.get('pct_ge_70'))} | "
            f"{_fmt(g.get('pct_ge_75'))} | {_fmt(g.get('pct_ge_80'))} | "
            f"{_fmt(g.get('exact_recovery_rate'))} |"
        )
    lines.append("")
    lines.append("## 5. Quality & efficiency")
    lines.append("")
    lines.append("| Model | Mean SSIM | Mean MSE | Mean LSB% | Mean time (ms) |")
    lines.append("|-------|-----------|----------|-----------|----------------|")
    for mid, st in agg.items():
        name = st.get("model_name", mid)
        ssim_m = st.get("ssim", {}).get("mean")
        mse_m = st.get("mse", {}).get("mean")
        lsb_m = st.get("lsb_change_percent", {}).get("mean")
        t_m = st.get("total_ms", {}).get("mean")
        lines.append(
            f"| {name} | {_fmt(ssim_m, 6)} | "
            f"{(f'{mse_m:.6e}' if mse_m is not None else '—')} | "
            f"{_fmt(lsb_m, 3)} | {_fmt(t_m, 1)} |"
        )
    lines.append("")
    lines.append("## 6. Research question")
    lines.append("")
    lines.append(
        "**Does ARES-Hybrid-INN retain high-PSNR behavior on unseen images while "
        "maintaining secret recovery, low LSB modification, and reasonable cost?**"
    )
    lines.append("")
    hybrid = next((g for g in gen if "hybrid" in str(g.get("model", ""))), None)
    if hybrid and hybrid.get("mean_psnr") is not None:
        lines.append(
            f"On this run ({manifest.get('n_images')} images, "
            f"{manifest.get('resolution')}², category `{manifest.get('category')}`), "
            f"**ARES-Hybrid-INN** measured **mean PSNR = {hybrid['mean_psnr']:.4f} dB**, "
            f"**median = {hybrid.get('median_psnr'):.4f} dB**, "
            f"**{hybrid.get('pct_ge_75', 0):.1f}% of images ≥ 75 dB**, "
            f"**exact recovery rate = {hybrid.get('exact_recovery_rate', 0):.1f}%**."
        )
    else:
        lines.append("_Insufficient true-positive measurements for Hybrid on this run._")
    lines.append("")
    lines.append("## 7. Limitations")
    lines.append("")
    lines.append("- Results apply only to the listed split, resolution, and secret_id.")
    lines.append("- Paper baselines may be partial reproductions without official weights.")
    lines.append("- CelebA/BOSSBase cross-domain is PENDING when datasets are unavailable.")
    lines.append("- Steganalysis scores are proxy metrics unless a trained detector is configured.")
    lines.append("")
    lines.append("## 8. Reproducibility")
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(manifest.get("environment"), indent=2))
    lines.append("```")
    lines.append("")
    lines.append(f"Artifacts: `{run_dir}`")
    lines.append("")

    out = ROOT / "reports" / f"ARES_Hybrid_INN_Report_{manifest.get('experiment_id')}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines))
    print("Report written:", out)
    return out


if __name__ == "__main__":
    generate(Path(sys.argv[1]) if len(sys.argv) > 1 else None)
