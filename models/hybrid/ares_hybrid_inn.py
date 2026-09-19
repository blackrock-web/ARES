"""
ARES-Hybrid-INN
================
CNN feature extractor + Invertible Neural Network + Adaptive Minimum-LSB
+ Residual learning + Attention + Robustness-aware design.

Pipeline:
  Cover → CNN features / texture / attention → Adaptive mask M
  Secret bits → payload packing
  Cover features + secret conditioning → INN coupling transform
  → CNN residual head → Minimum-LSB constraint → Stego
  Decode: INN inverse + CNN decoder + LSB extract

Compatible with existing ARES crypto/ECC/packaging.
"""
from __future__ import annotations

import hashlib
import math
import struct
import json
import zlib
import secrets
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path

import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F

# reuse crypto / ECC / positions from upgraded ARES
import sys
_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))

from models.upgraded.ares_upgraded import (
    MAGIC,
    VERSION as ARES_VERSION,
    DEVICE,
    ECC_MODES,
    encrypt_secret,
    decrypt_secret,
    pack_payload,
    unpack_payload,
    compute_attention_map,
    adaptive_positions,
    keyed_positions,
    psnr,
    mse,
    ssim_global,
    residual_stats,
    ResidualBlock,
    SpatialAttention,
    ChannelAttention,
    PayloadConditioner,
)
from models.invertible.inn import InvertibleNetwork
from embedding.minimum_lsb import (
    minimum_lsb_embed,
    minimum_lsb_extract,
    matrix_embed_32,
    matrix_extract_32,
    matrix_embed_74,
    matrix_extract_74,
    soft_lsb_approx,
    high_psnr_compensate,
)
from embedding.adaptive_mask import build_adaptive_mask

HYBRID_VERSION = 5


# ---------------------------------------------------------------------------
# CNN feature extractor (shared with residual / mask heads)
# ---------------------------------------------------------------------------
class CNNFeatureExtractor(nn.Module):
    def __init__(self, in_ch: int = 4, base: int = 32):
        super().__init__()
        self.enc1 = nn.Sequential(
            nn.Conv2d(in_ch, base, 3, padding=1),
            nn.ReLU(True),
            ResidualBlock(base),
        )
        self.enc2 = nn.Sequential(
            nn.Conv2d(base, base * 2, 3, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base * 2),
        )
        self.bot = ResidualBlock(base * 2)
        self.ca = ChannelAttention(base * 2)
        self.sa = SpatialAttention(base * 2)
        self.base = base

    def forward(self, x: torch.Tensor):
        e1 = self.enc1(x)
        e2 = self.enc2(e1)
        b = self.bot(e2)
        b = self.ca(b)
        b, att = self.sa(b)
        return e1, e2, b, att


class ARESHybridINN(nn.Module):
    """
    Full hybrid model for training-time residual + mask prediction.
    Inference-time LSB embedding is handled outside (integer domain).
    """

    def __init__(self, base: int = 32, inn_channels: int = 8, n_inn_blocks: int = 4):
        super().__init__()
        self.base = base
        self.inn_channels = inn_channels
        self.feat = CNNFeatureExtractor(in_ch=4, base=base)
        self.cond = PayloadConditioner(base)

        # project bottleneck features to INN channel width
        self.to_inn = nn.Conv2d(base * 2 + base, inn_channels, 1)
        self.inn = InvertibleNetwork(
            channels=inn_channels,
            n_blocks=n_inn_blocks,
            hidden=max(base, 32),
            coupling="affine",
            clamp=2.0,
        )
        self.from_inn = nn.Conv2d(inn_channels, base * 2, 1)

        # residual + mask heads (upsample back)
        self.res_head = nn.Sequential(
            nn.ConvTranspose2d(base * 2, base, 4, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base),
            nn.Conv2d(base, 1, 3, padding=1),
            nn.Tanh(),
        )
        self.mask_head = nn.Sequential(
            nn.ConvTranspose2d(base * 2, base, 4, stride=2, padding=1),
            nn.ReLU(True),
            nn.Conv2d(base, 1, 3, padding=1),
            nn.Sigmoid(),
        )
        self.alpha = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(base * 2, 3),
            nn.Sigmoid(),
        )

        # optional decoder for soft bit recovery (training)
        self.decoder = nn.Sequential(
            nn.Conv2d(3, base, 3, padding=1),
            nn.ReLU(True),
            ResidualBlock(base),
            nn.Conv2d(base, base * 2, 3, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base * 2),
            nn.ConvTranspose2d(base * 2, base, 4, stride=2, padding=1),
            nn.ReLU(True),
            nn.Conv2d(base, 1, 3, padding=1),
            nn.Sigmoid(),
        )

    def forward(self, cover_att: torch.Tensor, rate: torch.Tensor, reverse_inn: bool = False):
        """
        cover_att: (B,4,H,W) RGB + attention
        rate: (B,1)
        Returns residual (B,1,H,W), mask (B,1,H,W), alphas (B,3), inn_feat, log_det
        """
        e1, e2, b, att = self.feat(cover_att)
        c = self.cond(rate)
        c = c.unsqueeze(-1).unsqueeze(-1).expand(-1, -1, b.shape[2], b.shape[3])
        fused = torch.cat([b, c], dim=1)
        z = self.to_inn(fused)
        z, log_det = self.inn(z, reverse=reverse_inn)
        feat = self.from_inn(z)
        residual = self.res_head(feat)
        mask = self.mask_head(feat)
        alphas = self.alpha(feat)
        return residual, mask, alphas, z, log_det

    def decode_soft(self, stego: torch.Tensor) -> torch.Tensor:
        return self.decoder(stego)

    def inn_inverse(self, z: torch.Tensor):
        return self.inn.inverse(z)


def load_hybrid(path: Optional[str] = None, base: int = 32) -> ARESHybridINN:
    model = ARESHybridINN(base=base).to(DEVICE)
    if path and Path(path).exists():
        ckpt = torch.load(path, map_location=DEVICE, weights_only=False)
        state = ckpt.get("model", ckpt.get("hybrid", ckpt))
        if isinstance(state, dict):
            try:
                model.load_state_dict(state, strict=False)
            except Exception:
                pass
    model.eval()
    return model


def apply_hybrid_residual(
    cover_rgb: np.ndarray,
    stego_ch: np.ndarray,
    att: np.ndarray,
    model: ARESHybridINN,
    strength: float = 0.35,
    bpp: int = 1,
    rate: float = 0.1,
    channel: int = 2,
) -> np.ndarray:
    """Apply bounded CNN+INN residual without destroying LSB payload bits."""
    model.eval()
    h, w = stego_ch.shape
    rgb = cover_rgb.astype(np.float32) / 255.0
    inp = np.concatenate([rgb.transpose(2, 0, 1), att[None, ...]], 0)
    t = torch.from_numpy(inp).float().unsqueeze(0).to(DEVICE)
    rate_t = torch.tensor([[rate]], dtype=torch.float32, device=DEVICE)
    with torch.no_grad():
        residual, mask, alphas, _, _ = model(t, rate_t)
        residual = residual.squeeze().cpu().numpy()
        mask = mask.squeeze().cpu().numpy()
    # keep residual small; protect lower bpp bits
    delta = residual * mask * strength * 3.0
    out = stego_ch.astype(np.int16).copy()
    low_mask = (1 << bpp) - 1
    for i in range(h):
        for j in range(w):
            low = int(out[i, j]) & low_mask
            high = int(out[i, j]) >> bpp
            high = high + int(round(delta[i, j]))
            out[i, j] = max(0, min(255, (high << bpp) | low))
    return out.astype(np.uint8)


def hybrid_embed(
    cover: Image.Image,
    secret: str,
    password: str = "benchmark",
    max_bpp: int = 1,
    hybrid_model: Optional[ARESHybridINN] = None,
    use_residual: bool = True,
    ecc_mode: str = "HEADER_REP3",
    adaptive: bool = True,
    payload_rate: Optional[float] = None,
) -> Tuple[Image.Image, dict]:
    """
    Hybrid embed: Minimum-LSB (integer) + optional CNN/INN residual compensation.
    """
    if cover.mode != "RGB":
        cover = cover.convert("RGB")
    arr = np.array(cover)
    h, w = arr.shape[:2]
    gray = np.mean(arr, axis=2).astype(np.uint8)
    ct = encrypt_secret(secret, password)
    att = compute_attention_map(gray)
    mask_np = build_adaptive_mask(gray, attention=att)

    if adaptive:
        rg = (arr[:, :, 0].astype(np.float32) + arr[:, :, 1].astype(np.float32)) / 2
        att_rg = compute_attention_map(rg.astype(np.uint8))
        # R+G only so extract (stego) matches embed (cover) positions
        positions = adaptive_positions(h, w, password, att_rg)
    else:
        positions = keyed_positions(h, w, password)

    payload = pack_payload(
        ct, {"m": "AHI", "e": ecc_mode, "b": max_bpp, "x": "m32" if max_bpp == 1 else "lsb"}, ecc_mode=ecc_mode
    )
    bits = []
    for byte in payload:
        for i in range(8):
            bits.append((byte >> i) & 1)

    capacity = h * w * max_bpp
    if len(bits) > capacity:
        raise ValueError(f"payload {len(bits)} > capacity {capacity}")

    rate = payload_rate if payload_rate is not None else (len(bits) / max(1, h * w))

    # Change-minimizing matrix (3,2) embedding + optimal ±1 when bpp==1
    if max_bpp == 1:
        stego_arr, lsb_stats = matrix_embed_74(arr, positions, bits, channel=2)
        embed_method = "matrix_74_pm1"
    else:
        stego_arr, lsb_stats = minimum_lsb_embed(
            arr, positions, bits, channel=2, bpp=max_bpp, use_pm1=True
        )
        embed_method = "min_lsb_pm1"

    residual_kind = "none"
    if use_residual and hybrid_model is not None:
        blue = stego_arr[:, :, 2]
        blue = apply_hybrid_residual(
            arr, blue, att, hybrid_model, strength=0.25, bpp=max_bpp, rate=rate
        )
        stego_arr = stego_arr.copy()
        stego_arr[:, :, 2] = blue
        residual_kind = "hybrid_inn"
    elif use_residual:
        residual_kind = "high_psnr_compensate"

    # Multi-pass high-bit residual + light R/G balance (LSB locked)
    stego_arr = high_psnr_compensate(
        arr, stego_arr, bpp=max_bpp, channel=2, passes=4, strength=0.9
    )
    if residual_kind == "none":
        residual_kind = "high_psnr_compensate"

    stego = Image.fromarray(stego_arr)
    lsb_stats = dict(lsb_stats)
    lsb_stats["embed_method"] = embed_method

    rs = residual_stats(cover, stego)
    info = {
        "method": "ARES-Hybrid-INN",
        "payload_bits": len(bits),
        "raw_payload_bits": len(bits),
        "effective_secret_bits": len(secret.encode()) * 8,
        "ecc_mode": ecc_mode,
        "ecc_overhead_bits": max(0, len(bits) - len(ct) * 8 - 80),
        "capacity_bits": capacity,
        "utilisation": round(len(bits) / max(1, capacity) * 100, 2),
        "payload_rate_bpp": round(rate, 6),
        "psnr": psnr(cover, stego),
        "mse": mse(cover, stego),
        "ssim": ssim_global(cover, stego),
        "residual": residual_kind,
        "adaptive": adaptive,
        "max_bpp": max_bpp,
        "version": HYBRID_VERSION,
        "changed_lsb": lsb_stats["changed_lsb"],
        "lsb_change_pct": lsb_stats["lsb_change_pct"],
        "changed_pixels_lsb": lsb_stats["changed_pixels"],
        **{f"res_{k}": v for k, v in rs.items()},
    }
    return stego, info


def hybrid_extract(
    stego: Image.Image,
    password: str = "benchmark",
    max_bpp: int = 1,
    ecc_mode: str = "HEADER_REP3",
    adaptive: bool = True,
) -> str:
    if stego.mode != "RGB":
        stego = stego.convert("RGB")
    arr = np.array(stego)
    h, w = arr.shape[:2]
    if adaptive:
        rg = (arr[:, :, 0].astype(np.float32) + arr[:, :, 1].astype(np.float32)) / 2
        att_rg = compute_attention_map(rg.astype(np.uint8))
        positions = adaptive_positions(h, w, password, att_rg)
    else:
        positions = keyed_positions(h, w, password)

    need = min(h * w * max_bpp, 8 * 8192)
    if max_bpp == 1:
        raw_bits = matrix_extract_74(arr, positions, need, channel=2)
    else:
        raw_bits = minimum_lsb_extract(arr, positions, need, channel=2, bpp=max_bpp)
    raw = bytearray()
    for i in range(0, len(raw_bits) - 7, 8):
        byte = 0
        for b in range(8):
            byte |= raw_bits[i + b] << b
        raw.append(byte)

    last = None
    for L in range(min(len(raw), 8000), 40, -1):
        try:
            meta, ct = unpack_payload(bytes(raw[:L]), ecc_mode=ecc_mode)
            return decrypt_secret(ct, password)
        except Exception as e:
            last = e
            continue
    raise ValueError(f"hybrid extract failed: {last}")
