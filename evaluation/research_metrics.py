"""
Authoritative metric functions + fail-safe validation.
PSNR uses MAX=255 for 8-bit RGB images.
"""
from __future__ import annotations

import math
from typing import Dict, Tuple
import numpy as np
from PIL import Image


def mse_rgb(cover: Image.Image, stego: Image.Image) -> float:
    x = np.asarray(cover.convert("RGB"), dtype=np.float64)
    y = np.asarray(stego.convert("RGB"), dtype=np.float64)
    return float(((x - y) ** 2).mean())


def psnr_rgb(cover: Image.Image, stego: Image.Image, max_val: float = 255.0) -> float:
    m = mse_rgb(cover, stego)
    if m <= 0.0 or not math.isfinite(m):
        return 99.0 if m == 0.0 else float("nan")
    return 10.0 * math.log10((max_val ** 2) / m)


def ssim_rgb(cover: Image.Image, stego: Image.Image) -> float:
    x = np.asarray(cover.convert("RGB"), dtype=np.float64)
    y = np.asarray(stego.convert("RGB"), dtype=np.float64)
    mx, my = x.mean(), y.mean()
    vx, vy = x.var(), y.var()
    cov = ((x - mx) * (y - my)).mean()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    den = (mx ** 2 + my ** 2 + c1) * (vx + vy + c2)
    return 1.0 if den == 0 else float(((2 * mx * my + c1) * (2 * cov + c2)) / den)


def ms_ssim_rgb(cover: Image.Image, stego: Image.Image, levels: int = 3) -> float:
    c, s = cover.convert("RGB"), stego.convert("RGB")
    weights = [0.44, 0.33, 0.23][:levels]
    vals = []
    for i in range(levels):
        vals.append(ssim_rgb(c, s))
        if i < levels - 1:
            w, h = c.size
            c = c.resize((max(1, w // 2), max(1, h // 2)), Image.BILINEAR)
            s = s.resize((max(1, w // 2), max(1, h // 2)), Image.BILINEAR)
    wsum = sum(weights[: len(vals)])
    return float(sum(v * w for v, w in zip(vals, weights)) / wsum)


def verify_psnr_mse(cover: Image.Image, stego: Image.Image, reported_psnr: float, reported_mse: float) -> Dict:
    m = mse_rgb(cover, stego)
    p = psnr_rgb(cover, stego)
    ok = math.isfinite(m) and math.isfinite(p)
    consistent = abs(m - reported_mse) < 1e-6 or (m == 0 and reported_mse == 0)
    if m > 0 and reported_psnr < 98:
        p_from_m = 10 * math.log10((255.0 ** 2) / m)
        consistent = consistent and abs(p_from_m - reported_psnr) < 0.05
    return {
        "valid": ok and consistent,
        "mse_ref": m,
        "psnr_ref": p,
        "mse_reported": reported_mse,
        "psnr_reported": reported_psnr,
    }


def metric_failsafe(row: dict) -> Tuple[bool, str]:
    """Return (ok, reason)."""
    checks = [
        ("psnr", lambda v: v is not None and math.isfinite(v)),
        ("mse", lambda v: v is not None and math.isfinite(v) and v >= 0),
        ("ssim", lambda v: v is not None and 0.0 <= v <= 1.0 + 1e-6),
        ("ber", lambda v: v is None or (0.0 <= v <= 1.0)),
        ("secret_accuracy", lambda v: v is None or (0.0 <= v <= 100.0)),
        ("lsb_change_percent", lambda v: v is None or (0.0 <= v <= 100.0)),
        ("encode_ms", lambda v: v is None or v >= 0),
    ]
    for key, fn in checks:
        if key in row and row[key] is not None and not fn(row[key]):
            return False, f"invalid {key}={row[key]}"
    if row.get("psnr") is not None and row.get("mse") is not None and row["mse"] > 0:
        expect = 10 * math.log10((255.0 ** 2) / row["mse"])
        if abs(expect - row["psnr"]) > 0.15:
            return False, f"PSNR↔MSE inconsistent: PSNR={row['psnr']} vs {expect:.4f} from MSE"
    return True, "ok"


def format_mse(m: float) -> str:
    return f"{m:.6e}"


def format_psnr(p: float) -> str:
    return f"{p:.4f}"
