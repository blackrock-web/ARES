"""
Full research validation benchmark:
- 4 paper baselines + ARES-Hybrid-INN (five-model fair comparison)
- identical cover/secret/resolution/payload protocol
- per-image CSV, aggregates, PSNR generalization, LSB audit
- does NOT hard-code target PSNR values
"""
from __future__ import annotations

import hashlib
import json
import platform
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from datasets.protocol import (
    build_manifest,
    get_split_images,
    load_cover,
    load_manifest,
    dataset_availability,
)
from evaluation.research_metrics import (
    mse_rgb,
    psnr_rgb,
    ssim_rgb,
    ms_ssim_rgb,
    metric_failsafe,
    format_mse,
    format_psnr,
)
from evaluation.lsb_analysis import analyze_lsb
from benchmark.registry import instantiate_models, load_registry

# Exactly five models for primary comparison
FIVE_MODEL_IDS = [
    "paper_model_01",
    "paper_model_02",
    "paper_model_03",
    "paper_model_04",
    "ares_hybrid_inn",
]

FIXED_SECRET = "ARES_RESEARCH_BENCHMARK_SECRET"
SECRET_ID = "fixed_v1"


def _env_info() -> dict:
    try:
        import torch
        torch_v = torch.__version__
        cuda = torch.cuda.is_available()
        gpu = torch.cuda.get_device_name(0) if cuda else None
    except Exception:
        torch_v, cuda, gpu = None, False, None
    return {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "pytorch": torch_v,
        "cuda_available": cuda,
        "gpu": gpu,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def _select_models(device: str = "cpu"):
    all_m = instantiate_models(device=device)
    by_id = {m.model_id: m for m in all_m}
    selected = []
    for mid in FIVE_MODEL_IDS:
        if mid in by_id:
            selected.append(by_id[mid])
        else:
            print(f"  [WARN] model {mid} missing from registry")
    return selected


def _secret_bits(secret: str) -> int:
    return len(secret.encode("utf-8")) * 8


def _ber_approx(recovered: str, secret: str) -> float:
    if not recovered:
        return 1.0
    a = secret.encode("utf-8", errors="replace")
    b = recovered.encode("utf-8", errors="replace")
    n = max(len(a), len(b)) * 8
    if n == 0:
        return 0.0
    # byte-level Hamming as proxy
    mismatches = 0
    for i in range(max(len(a), len(b))):
        ca = a[i] if i < len(a) else 0
        cb = b[i] if i < len(b) else 0
        mismatches += bin(ca ^ cb).count("1")
    return mismatches / n


def run_research_benchmark(
    split: str = "test",
    resolution: int = 256,
    n_images: int = 20,
    secret: str = FIXED_SECRET,
    secret_id: str = SECRET_ID,
    category: str = "FINAL_TEST",
    out_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Primary experiment: identical conditions, five models, per-image metrics.
    """
    # ensure manifest
    man = load_manifest()
    if not man.get("leakage_check", {}).get("passed", True):
        raise RuntimeError("Benchmark refused: train/val/test hash overlap")

    entries = get_split_images(split, limit=n_images)
    if not entries:
        build_manifest()
        entries = get_split_images(split, limit=n_images)
    if not entries:
        raise RuntimeError(f"No images in split={split}")

    run_id = datetime.now().strftime("research_%Y%m%d_%H%M%S")
    out = Path(out_root or ROOT / "results" / run_id)
    out.mkdir(parents=True, exist_ok=True)
    (out / "images").mkdir(exist_ok=True)
    (out / "per_image").mkdir(exist_ok=True)

    env = _env_info()
    models = _select_models(device="cpu")
    print(f"Research benchmark {run_id}")
    print(f"  split={split} resolution={resolution} n={len(entries)} models={len(models)}")
    print(f"  category={category} secret_id={secret_id}")

    per_image_rows: List[dict] = []
    invalid = []
    lsb_audits = []

    for i, entry in enumerate(entries):
        cover = load_cover(entry, resolution)
        img_dir = out / "per_image" / entry["image_id"]
        img_dir.mkdir(parents=True, exist_ok=True)
        cover.save(img_dir / "cover.png")
        print(f"\n[{i+1}/{len(entries)}] {entry['image_id']}")

        comparison = {"image_id": entry["image_id"], "models": {}}

        for model in models:
            mid = model.model_id
            print(f"  {model.model_name} …", end=" ", flush=True)
            t0 = time.perf_counter()
            try:
                result = model.evaluate(cover, secret, "benchmark")
            except Exception as e:
                result = {"status": "FAILED", "error": str(e)}
            total_ms = (time.perf_counter() - t0) * 1000

            row = {
                "experiment_id": run_id,
                "dataset": entry.get("dataset"),
                "split": split,
                "category": category,
                "image_id": entry["image_id"],
                "resolution": resolution,
                "payload_bpp": None,
                "secret_id": secret_id,
                "secret_bits": _secret_bits(secret),
                "model": mid,
                "model_name": model.model_name,
                "status": result.get("status"),
                "exact_recovery": False,
                "psnr": None,
                "mse": None,
                "ssim": None,
                "ms_ssim": None,
                "ber": None,
                "secret_accuracy": 0.0,
                "lsb_change_percent": None,
                "pixel_change_percent": None,
                "channel_change_percent": None,
                "residual_rms": None,
                "residual_max": None,
                "encode_ms": result.get("encode_time_ms"),
                "decode_ms": result.get("decode_time_ms"),
                "total_ms": total_ms,
                "error": result.get("error"),
            }

            if result.get("status") == "ok" and result.get("stego") is not None:
                stego = result["stego"]
                mdir = img_dir / mid
                mdir.mkdir(exist_ok=True)
                stego.save(mdir / "stego.png")

                mse_v = mse_rgb(cover, stego)
                psnr_v = psnr_rgb(cover, stego)
                ssim_v = ssim_rgb(cover, stego)
                ms_v = ms_ssim_rgb(cover, stego)
                lsb = analyze_lsb(cover, stego)
                recovered = result.get("recovered") or ""
                exact = bool(result.get("recovery_ok")) and recovered == secret
                ber = _ber_approx(recovered, secret)
                acc = 100.0 if exact else float(result.get("secret_recovery_accuracy") or 0.0)
                bpp = (result.get("payload_bits") or 0) / max(1, resolution * resolution)

                # residual maps
                c = np.asarray(cover, dtype=np.float32)
                s = np.asarray(stego, dtype=np.float32)
                diff = np.abs(s - c)
                Image.fromarray(np.clip(diff * 12, 0, 255).astype(np.uint8)).save(mdir / "residual.png")
                lsb_map = ((np.asarray(cover, dtype=np.int16) & 1) != (np.asarray(stego, dtype=np.int16) & 1))
                Image.fromarray((lsb_map.any(axis=2).astype(np.uint8) * 255)).save(mdir / "lsb_map.png")
                (mdir / "metrics.json").write_text(json.dumps({
                    "psnr": psnr_v, "mse": mse_v, "ssim": ssim_v,
                    "exact_recovery": exact, "ber": ber,
                }, indent=2))

                row.update({
                    "psnr": round(psnr_v, 4),
                    "mse": mse_v,
                    "ssim": round(ssim_v, 6),
                    "ms_ssim": round(ms_v, 6),
                    "ber": round(ber, 6),
                    "secret_accuracy": round(acc, 2),
                    "exact_recovery": exact,
                    "payload_bpp": round(bpp, 6),
                    "payload_bits": result.get("payload_bits"),
                    "lsb_change_percent": round(lsb["lsb_change_pct"], 4),
                    "pixel_change_percent": round(lsb["pixel_change_pct"], 4),
                    "channel_change_percent": round(100.0 * lsb["changed_channels"] / max(1, resolution * resolution * 3), 4),
                    "residual_rms": round(lsb["rms_residual"], 6),
                    "residual_max": float(lsb["max_residual"]),
                })
                print(f"PSNR={format_psnr(psnr_v)} MSE={format_mse(mse_v)} TP={exact}")
                comparison["models"][mid] = {
                    "psnr": row["psnr"], "ssim": row["ssim"], "exact_recovery": exact,
                    "lsb_change_percent": row["lsb_change_percent"],
                }
                lsb_audits.append({
                    "image_id": entry["image_id"], "model": mid,
                    **{k: lsb[k] for k in lsb},
                })
            else:
                print(f"FAILED {result.get('error', '')[:50]}")

            ok, reason = metric_failsafe(row)
            row["metric_valid"] = ok
            row["metric_note"] = reason
            if not ok and row["psnr"] is not None:
                invalid.append({"image_id": entry["image_id"], "model": mid, "reason": reason})
            per_image_rows.append(row)

        (img_dir / "comparison.json").write_text(json.dumps(comparison, indent=2))

    # write CSV
    import csv
    csv_path = out / "per_image_results.csv"
    if per_image_rows:
        keys = list(per_image_rows[0].keys())
        with open(csv_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
            w.writeheader()
            w.writerows(per_image_rows)

    # aggregates
    aggregates = _aggregate(per_image_rows, resolution)
    gen = _psnr_generalization(per_image_rows, resolution)

    manifest = {
        "experiment_id": run_id,
        "category": category,
        "split": split,
        "resolution": resolution,
        "n_images": len(entries),
        "n_models": len(models),
        "model_ids": [m.model_id for m in models],
        "secret_id": secret_id,
        "secret_bits": _secret_bits(secret),
        "environment": env,
        "dataset_manifest_sha256": hashlib.sha256(
            (ROOT / "datasets" / "dataset_manifest.json").read_bytes()
        ).hexdigest() if (ROOT / "datasets" / "dataset_manifest.json").exists() else None,
        "availability": dataset_availability(),
        "invalid_metrics": invalid,
        "metric_version": "research_metrics_v1",
        "note": "PSNR values are measured, not targets. Pilot 75/81 dB must be re-validated here.",
    }
    (out / "experiment_manifest.json").write_text(json.dumps(manifest, indent=2))
    (out / "aggregate_stats.json").write_text(json.dumps(aggregates, indent=2))
    (out / "psnr_generalization.json").write_text(json.dumps(gen, indent=2))
    (out / "lsb_audit.json").write_text(json.dumps(lsb_audits[:500], indent=2))
    (out / "environment.json").write_text(json.dumps(env, indent=2))

    # resolution-specific CSV
    _write_model_summary_csv(out / f"benchmark_{resolution}.csv", aggregates)

    summary = {
        "run_id": run_id,
        "out_dir": str(out),
        "category": category,
        "aggregates": aggregates,
        "psnr_generalization": gen,
        "n_invalid": len(invalid),
        "best_true_positive": _best_tp(per_image_rows),
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    print("\n" + "=" * 60)
    print("SUMMARY (measured)")
    for mid, st in aggregates.items():
        if st.get("n_tp", 0) == 0:
            print(f"  {mid}: no true positives")
            continue
        print(
            f"  {mid}: mean_PSNR={st['psnr']['mean']:.4f}  "
            f"median={st['psnr']['median']:.4f}  "
            f"%≥75dB={st['psnr'].get('pct_ge_75', 0):.1f}  "
            f"TP={st['n_tp']}/{st['n']}"
        )
    print("Results:", out)
    return summary


def _stats(vals: List[float]) -> dict:
    if not vals:
        return {"n": 0, "mean": None, "median": None, "std": None, "min": None, "max": None,
                "ci95_low": None, "ci95_high": None}
    a = np.array(vals, dtype=np.float64)
    n = len(a)
    mean = float(a.mean())
    std = float(a.std(ddof=1)) if n > 1 else 0.0
    se = std / max(1, n ** 0.5)
    return {
        "n": n,
        "mean": mean,
        "median": float(np.median(a)),
        "std": std,
        "min": float(a.min()),
        "max": float(a.max()),
        "ci95_low": mean - 1.96 * se,
        "ci95_high": mean + 1.96 * se,
        "pct_ge_70": float(100.0 * (a >= 70).mean()),
        "pct_ge_75": float(100.0 * (a >= 75).mean()),
        "pct_ge_80": float(100.0 * (a >= 80).mean()),
    }


def _aggregate(rows: List[dict], resolution: int) -> dict:
    by_model: Dict[str, List[dict]] = {}
    for r in rows:
        if r.get("psnr") is None:
            continue
        by_model.setdefault(r["model"], []).append(r)
    out = {}
    for mid, rs in by_model.items():
        tp = [r for r in rs if r.get("exact_recovery")]
        use = tp if tp else rs
        out[mid] = {
            "model_name": rs[0].get("model_name"),
            "resolution": resolution,
            "n": len(rs),
            "n_tp": len(tp),
            "psnr": _stats([r["psnr"] for r in use if r["psnr"] is not None]),
            "ssim": _stats([r["ssim"] for r in use if r["ssim"] is not None]),
            "mse": _stats([r["mse"] for r in use if r["mse"] is not None]),
            "ber": _stats([r["ber"] for r in use if r["ber"] is not None]),
            "lsb_change_percent": _stats([r["lsb_change_percent"] for r in use if r["lsb_change_percent"] is not None]),
            "total_ms": _stats([r["total_ms"] for r in use if r["total_ms"] is not None]),
            "exact_recovery_rate": 100.0 * len(tp) / max(1, len(rs)),
        }
    return out


def _psnr_generalization(rows: List[dict], resolution: int) -> List[dict]:
    agg = _aggregate(rows, resolution)
    gen = []
    for mid, st in agg.items():
        p = st["psnr"]
        gen.append({
            "dataset": "mixed_test",
            "resolution": resolution,
            "model": mid,
            "model_name": st["model_name"],
            "mean_psnr": p["mean"],
            "median_psnr": p["median"],
            "std_psnr": p["std"],
            "min_psnr": p["min"],
            "max_psnr": p["max"],
            "ci95_low": p["ci95_low"],
            "ci95_high": p["ci95_high"],
            "pct_ge_70": p.get("pct_ge_70"),
            "pct_ge_75": p.get("pct_ge_75"),
            "pct_ge_80": p.get("pct_ge_80"),
            "n_tp": st["n_tp"],
            "exact_recovery_rate": st["exact_recovery_rate"],
        })
    return gen


def _write_model_summary_csv(path: Path, aggregates: dict):
    import csv
    rows = []
    for mid, st in aggregates.items():
        rows.append({
            "model": mid,
            "model_name": st["model_name"],
            "resolution": st["resolution"],
            "n": st["n"],
            "n_tp": st["n_tp"],
            "mean_psnr": st["psnr"]["mean"],
            "std_psnr": st["psnr"]["std"],
            "median_psnr": st["psnr"]["median"],
            "pct_ge_75": st["psnr"].get("pct_ge_75"),
            "mean_ssim": st["ssim"]["mean"],
            "mean_mse": st["mse"]["mean"],
            "exact_recovery_rate": st["exact_recovery_rate"],
            "mean_lsb_change_pct": st["lsb_change_percent"]["mean"],
            "mean_time_ms": st["total_ms"]["mean"],
        })
    if not rows:
        return
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def _best_tp(rows: List[dict]) -> Optional[dict]:
    tp = [r for r in rows if r.get("exact_recovery") and r.get("psnr") is not None]
    if not tp:
        return None
    best = max(tp, key=lambda r: (r["psnr"], r.get("ssim") or 0))
    return {
        "model": best["model"],
        "model_name": best["model_name"],
        "psnr": best["psnr"],
        "image_id": best["image_id"],
        "note": "Best single-image true-positive observation (not a claim of overall superiority)",
    }


def run_multi_resolution(
    resolutions: List[int] = None,
    n_images: int = 15,
    split: str = "test",
    category: str = "FINAL_TEST",
) -> Dict[str, Any]:
    resolutions = resolutions or [128, 256, 512]
    results = {}
    for res in resolutions:
        print("\n" + "#" * 60)
        print(f"RESOLUTION {res}")
        results[str(res)] = run_research_benchmark(
            split=split,
            resolution=res,
            n_images=n_images,
            category=category,
        )
    return results
