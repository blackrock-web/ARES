"""LSB and residual analysis for fair PSNR interpretation."""
from __future__ import annotations
from typing import Dict
import numpy as np
from PIL import Image


def analyze_lsb(cover: Image.Image, stego: Image.Image) -> Dict[str, float]:
    c = np.asarray(cover.convert("RGB"), dtype=np.int16)
    s = np.asarray(stego.convert("RGB"), dtype=np.int16)
    diff = np.abs(s - c)
    changed_pixels = int((diff.sum(axis=2) > 0).sum())
    changed_channels = int((diff > 0).sum())
    # LSB flips per channel
    lsb_c = c & 1
    lsb_s = s & 1
    changed_lsb = int((lsb_c != lsb_s).sum())
    total_pixels = c.shape[0] * c.shape[1]
    total_channels = total_pixels * 3
    return {
        "changed_pixels": changed_pixels,
        "changed_channels": changed_channels,
        "changed_lsbs": changed_lsb,
        "lsb_change_pct": 100.0 * changed_lsb / max(1, total_channels),
        "pixel_change_pct": 100.0 * changed_pixels / max(1, total_pixels),
        "avg_residual": float(diff.mean()),
        "max_residual": float(diff.max()),
        "rms_residual": float(np.sqrt(((s.astype(np.float64) - c.astype(np.float64)) ** 2).mean())),
    }
