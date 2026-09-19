"""
Adaptive embedding mask from texture / edge / variance / attention.
Smooth → low modification preference; textured → controlled modification.
"""
from __future__ import annotations

import numpy as np
from typing import Optional


def texture_features(gray: np.ndarray) -> dict:
    """Local variance, Sobel-like gradient, Laplacian energy."""
    g = gray.astype(np.float32)
    # local variance (3x3)
    from numpy.lib.stride_tricks import sliding_window_view
    h, w = g.shape
    pad = np.pad(g, 1, mode="edge")
    windows = sliding_window_view(pad, (3, 3))
    local_var = windows.reshape(h, w, -1).var(axis=-1)
    # gradient
    gx = np.abs(np.diff(g, axis=1, prepend=g[:, :1]))
    gy = np.abs(np.diff(g, axis=0, prepend=g[:1, :]))
    grad = gx + gy
    # Laplacian
    lap = np.abs(
        -4 * g
        + np.roll(g, 1, 0)
        + np.roll(g, -1, 0)
        + np.roll(g, 1, 1)
        + np.roll(g, -1, 1)
    )
    return {
        "variance": local_var,
        "gradient": grad,
        "laplacian": lap,
    }


def build_adaptive_mask(
    gray: np.ndarray,
    attention: Optional[np.ndarray] = None,
    smooth_weight: float = 0.25,
) -> np.ndarray:
    """
    Returns mask in [0, 1]. Higher = more embedding tolerance (textured).
    Smooth regions get lower values → minimum modification preference.
    """
    feats = texture_features(gray)
    v = feats["variance"]
    g = feats["gradient"]
    l = feats["laplacian"]

    def _norm(x):
        mx = float(x.max()) + 1e-8
        return x / mx

    score = 0.40 * _norm(v) + 0.35 * _norm(g) + 0.25 * _norm(l)
    if attention is not None:
        score = 0.7 * score + 0.3 * attention.astype(np.float32)
    # floor so smooth areas still allow tiny residual if needed
    mask = smooth_weight + (1.0 - smooth_weight) * np.clip(score, 0, 1)
    return mask.astype(np.float32)
