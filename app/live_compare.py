"""
Live single-image multi-model comparison.
- Runs all registered models on the same cover + secret
- Reports ONLY true-positive recovery (exact secret match)
- Declares best model among successful recoveries by PSNR (then SSIM, then time)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from benchmark.registry import instantiate_models, load_registry
from benchmark.metrics import compute_psnr, compute_ssim, compute_mse, compute_ms_ssim
from evaluation.lsb_analysis import analyze_lsb


def _to_pil(img) -> Optional[Image.Image]:
    if img is None:
        return None
    if isinstance(img, Image.Image):
        return img.convert("RGB")
    if isinstance(img, np.ndarray):
        return Image.fromarray(img.astype(np.uint8)).convert("RGB")
    if isinstance(img, (str, Path)):
        return Image.open(img).convert("RGB")
    return None


def live_compare(
    cover_img,
    secret: str,
    password: str = "benchmark",
    image_size: int = 256,
    only_true_positive: bool = True,
) -> Dict[str, Any]:
    """
    Run every loaded model on one cover.
    Returns tables, stego gallery entries, and best-model banner.
    """
    cover = _to_pil(cover_img)
    if cover is None:
        # synthetic textured cover
        rng = np.random.RandomState(42)
        arr = rng.randint(40, 200, (image_size, image_size, 3), dtype=np.uint8)
        cover = Image.fromarray(arr)
        note = f"No image uploaded — using synthetic {image_size}×{image_size} cover."
    else:
        cover = cover.resize((image_size, image_size), Image.BILINEAR)
        note = f"Cover resized to {image_size}×{image_size} for fair comparison."

    secret = (secret or "").strip() or "ARES live benchmark secret"
    password = password or "benchmark"

    models = instantiate_models(device="cpu")
    rows: List[List[Any]] = []
    stego_gallery: List[Tuple[Image.Image, str]] = [(cover, "COVER")]
    residual_gallery: List[Tuple[Image.Image, str]] = []
    successes: List[Dict[str, Any]] = []
    failures: List[Dict[str, Any]] = []

    for model in models:
        t0 = time.perf_counter()
        try:
            result = model.evaluate(cover, secret, password)
        except Exception as e:
            result = {"status": "FAILED", "error": str(e), "model_id": model.model_id, "model_name": model.model_name}

        elapsed = (time.perf_counter() - t0) * 1000
        name = result.get("model_name") or model.model_name
        mid = result.get("model_id") or model.model_id

        if result.get("status") != "ok" or result.get("stego") is None:
            failures.append({"model": name, "error": result.get("error", "encode/decode failed")})
            if not only_true_positive:
                rows.append([name, "FAIL", "—", "—", "—", "—", "—", "NO", round(elapsed, 1), result.get("error", "")[:40]])
            continue

        stego = result["stego"]
        recovery_ok = bool(result.get("recovery_ok"))
        # strict true positive = exact secret match
        true_positive = recovery_ok and (result.get("recovered") == secret)

        if only_true_positive and not true_positive:
            failures.append({"model": name, "error": "secret not recovered (false/negative)"})
            continue

        psnr = compute_psnr(cover, stego)
        ssim = compute_ssim(cover, stego)
        mse = compute_mse(cover, stego)
        try:
            ms_ssim = compute_ms_ssim(cover, stego)
        except Exception:
            ms_ssim = ssim
        lsb = analyze_lsb(cover, stego)

        row = {
            "model_id": mid,
            "model_name": name,
            "psnr": psnr,
            "ssim": ssim,
            "ms_ssim": ms_ssim,
            "mse": mse,
            "bpp": result.get("payload_bits", 0) / max(1, image_size * image_size),
            "payload_bits": result.get("payload_bits", 0),
            "time_ms": result.get("total_time_ms", elapsed),
            "true_positive": true_positive,
            "lsb_change_pct": lsb["lsb_change_pct"],
            "changed_pixels": lsb["changed_pixels"],
            "stego": stego,
        }
        successes.append(row)

        rows.append([
            name,
            "TRUE +" if true_positive else "NO",
            round(psnr, 3),
            round(ssim, 6),
            f"{mse:.6e}",
            round(ms_ssim, 6),
            round(row["bpp"], 5),
            "YES" if true_positive else "NO",
            round(row["time_ms"], 1),
            f"{lsb['lsb_change_pct']:.2f}%",
        ])
        stego_gallery.append((stego, f"{name} | PSNR {psnr:.2f} dB"))

        # residual visualization (amplified for display only)
        c = np.asarray(cover, dtype=np.float32)
        s = np.asarray(stego, dtype=np.float32)
        diff = np.abs(s - c)
        amp = np.clip(diff * 12.0, 0, 255).astype(np.uint8)
        residual_gallery.append((Image.fromarray(amp), f"Residual ×12 | {name}"))

    # Rank true positives: PSNR ↓, SSIM ↓, time ↑
    successes.sort(key=lambda r: (-r["psnr"], -r["ssim"], r["time_ms"]))

    if successes:
        best = successes[0]
        banner = (
            f"### Best model (true-positive recovery only)\n\n"
            f"## **{best['model_name']}**\n\n"
            f"| Metric | Value |\n|--------|-------|\n"
            f"| **PSNR** | **{best['psnr']:.3f} dB** |\n"
            f"| SSIM | {best['ssim']:.6f} |\n"
            f"| MSE | {best['mse']:.6e} |\n"
            f"| Payload bits | {best['payload_bits']} |\n"
            f"| Time | {best['time_ms']:.1f} ms |\n"
            f"| LSB change | {best['lsb_change_pct']:.2f}% |\n\n"
            f"**True-positive recoveries:** {len(successes)} / {len(models)} models  \n"
            f"**Failed / non-recovering:** {len(failures)}  \n"
            f"{note}\n\n"
            f"_Ranking rule: exact secret recovery required, then highest PSNR, then SSIM, then lowest time._"
        )
        best_name = best["model_name"]
    else:
        banner = (
            "### No true-positive recoveries\n\n"
            "No model recovered the **exact** secret on this image. "
            "Try a larger cover (≥256), a shorter secret, or check model status.\n\n"
            f"{note}"
        )
        best_name = "—"

    headers = [
        "Model", "Status", "PSNR ↑", "SSIM ↑", "MSE ↓", "MS-SSIM ↑",
        "BPP", "True Positive", "Time (ms)", "LSB change %",
    ]

    fail_lines = "\n".join(f"- {f['model']}: {f['error']}" for f in failures) or "_None_"
    fail_md = f"### Excluded (not true positive)\n\n{fail_lines}"

    return {
        "banner": banner,
        "headers": headers,
        "rows": rows,
        "stego_gallery": stego_gallery,
        "residual_gallery": residual_gallery,
        "best_name": best_name,
        "fail_md": fail_md,
        "n_success": len(successes),
        "n_fail": len(failures),
        "cover": cover,
    }
