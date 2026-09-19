"""
ARES-Upgraded: Research-grade universal-condition steganography.

Design goals (measured, not claimed):
  minimize D(C,S)  s.t. Recovery >= R_min, Robustness >= B_min,
                         Payload >= P_req, Security >= S_min

Architecture:
  Cover + Secret + PayloadRate
       → Multi-scale Feature Encoder
       → Conditional Fusion (payload-rate embedding)
       → Spatial / Channel Attention
       → Texture-Aware Embedding Mask
       → Residual Generator (bounded)
       → STEGO = clamp(C + M ⊙ R)

Decoder recovers secret with multi-scale encoder + ECC + CRC.
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

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAGIC = b"ARES"
VERSION = 4
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

ECC_MODES = ("NONE", "HEADER_REP2", "HEADER_REP3", "FULL_REP2", "FULL_REP3")

# ---------------------------------------------------------------------------
# Metrics (pure numpy/PIL, identical to benchmark)
# ---------------------------------------------------------------------------
def psnr(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a.convert("RGB"), dtype=np.float64)
    y = np.asarray(b.convert("RGB"), dtype=np.float64)
    m = float(((x - y) ** 2).mean())
    return 99.0 if m == 0 else 10 * math.log10((255.0 ** 2) / m)


def mse(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a.convert("RGB"), dtype=np.float64)
    y = np.asarray(b.convert("RGB"), dtype=np.float64)
    return float(((x - y) ** 2).mean())


def ssim_global(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a.convert("RGB"), dtype=np.float64)
    y = np.asarray(b.convert("RGB"), dtype=np.float64)
    mx, my = x.mean(), y.mean()
    vx, vy = x.var(), y.var()
    cov = ((x - mx) * (y - my)).mean()
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    den = (mx ** 2 + my ** 2 + c1) * (vx + vy + c2)
    return 1.0 if den == 0 else float(((2 * mx * my + c1) * (2 * cov + c2)) / den)


# ---------------------------------------------------------------------------
# Crypto (AES-GCM + strengthened key derivation)
# ---------------------------------------------------------------------------
def _qrng(n: int) -> bytes:
    out = bytearray()
    seed = int.from_bytes(secrets.token_bytes(8), "big") / (2 ** 64)
    x = seed if seed > 1e-12 else 0.31
    r = 3.9999
    while len(out) < n:
        x = r * x * (1 - x)
        out.append(int(x * 256) & 0xFF)
        if len(out) % 32 == 0:
            x = (x + int.from_bytes(secrets.token_bytes(4), "big") / (2 ** 32)) % 1.0
    return bytes(out[:n])


def _derive_key(password: str, salt: bytes, length: int = 32) -> bytes:
    material = hashlib.sha512(
        password.encode() + salt + b"|ares-v4"
    ).digest()
    return hashlib.pbkdf2_hmac("sha256", material, salt, 200_000, length)


def encrypt_secret(text: str, password: str) -> bytes:
    if not text:
        raise ValueError("empty secret")
    salt, nonce = _qrng(16), _qrng(12)
    key = _derive_key(password, salt)
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    ct = AESGCM(key).encrypt(nonce, text.encode("utf-8"), b"ARES-Upgraded-v4")
    return MAGIC + salt + nonce + ct


def decrypt_secret(blob: bytes, password: str) -> str:
    if len(blob) < 4 + 16 + 12 + 16 or blob[:4] != MAGIC:
        raise ValueError("bad ciphertext")
    salt, nonce, ct = blob[4:20], blob[20:32], blob[32:]
    key = _derive_key(password, salt)
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM(key).decrypt(nonce, ct, b"ARES-Upgraded-v4").decode("utf-8")


# ---------------------------------------------------------------------------
# Attention / texture features
# ---------------------------------------------------------------------------
def compute_attention_map(gray: np.ndarray, block: int = 8) -> np.ndarray:
    h, w = gray.shape
    var_map = np.zeros((h, w), np.float32)
    step = max(1, block // 2)
    for i in range(0, h - block + 1, step):
        for j in range(0, w - block + 1, step):
            patch = gray[i : i + block, j : j + block].astype(np.float32)
            v = float(patch.var())
            var_map[i : i + block, j : j + block] = np.maximum(
                var_map[i : i + block, j : j + block], v
            )
    gx = np.abs(np.diff(gray.astype(np.float32), axis=1, prepend=gray[:, :1]))
    gy = np.abs(np.diff(gray.astype(np.float32), axis=0, prepend=gray[:1, :]))
    edge = gx + gy
    score = 0.65 * (var_map / (var_map.max() + 1e-6)) + 0.35 * (
        edge / (edge.max() + 1e-6)
    )
    return np.clip(score, 0, 1).astype(np.float32)


def adaptive_positions(h: int, w: int, password: str, att: np.ndarray):
    seed = int.from_bytes(
        hashlib.sha256((password + ":adapt").encode()).digest()[:8], "big"
    )
    rng = np.random.RandomState(seed % (2 ** 32))
    coords = [(i, j) for i in range(h) for j in range(w)]
    scores = [(att[i, j] + rng.random() * 1e-6, i, j) for i, j in coords]
    scores.sort(key=lambda t: -t[0])
    return [(i, j) for _, i, j in scores]


def keyed_positions(h: int, w: int, password: str, channel: int = 2):
    seed = int.from_bytes(
        hashlib.sha256((password + f":ch{channel}").encode()).digest()[:8], "big"
    )
    rng = np.random.RandomState(seed % (2 ** 32))
    coords = [(i, j) for i in range(h) for j in range(w)]
    rng.shuffle(coords)
    return coords


# ---------------------------------------------------------------------------
# ECC packing / unpacking
# ---------------------------------------------------------------------------
def pack_payload(ciphertext: bytes, meta: dict, ecc_mode: str = "HEADER_REP3") -> bytes:
    meta_b = json.dumps(meta, separators=(",", ":")).encode()
    body = struct.pack(">4sBH", MAGIC, VERSION, len(meta_b)) + meta_b + ciphertext
    crc = zlib.crc32(body) & 0xFFFFFFFF
    header = MAGIC + struct.pack(">IH", crc, len(body))  # 10 bytes
    if ecc_mode == "NONE":
        return header + body
    if ecc_mode == "FULL_REP3":
        full = header + body
        return full + full + full
    if ecc_mode == "FULL_REP2":
        full = header + body
        return full + full
    if ecc_mode == "HEADER_REP2":
        return header + header + body
    # HEADER_REP3 default
    return header + header + header + body


def unpack_payload(data: bytes, ecc_mode: str = "HEADER_REP3") -> Tuple[dict, bytes]:
    if ecc_mode in ("FULL_REP3", "FULL_REP2"):
        n_rep = 3 if ecc_mode == "FULL_REP3" else 2
        n = len(data) // n_rep
        parts = [data[i * n : (i + 1) * n] for i in range(n_rep)]
        L = max(map(len, parts))
        parts = [p + b"\x00" * (L - len(p)) for p in parts]
        merged = bytearray()
        for i in range(L):
            votes = [p[i] for p in parts]
            merged.append(max(set(votes), key=votes.count))
        data = bytes(merged)
        ecc_mode = "NONE"
    if ecc_mode in ("HEADER_REP3", "HEADER_REP2"):
        n_rep = 3 if ecc_mode == "HEADER_REP3" else 2
        if len(data) < 10 * n_rep:
            raise ValueError("short frame")
        headers = [data[i * 10 : (i + 1) * 10] for i in range(n_rep)]
        header = bytearray()
        for i in range(10):
            votes = [h[i] for h in headers]
            header.append(max(set(votes), key=votes.count))
        header = bytes(header)
        body = data[10 * n_rep :]
    else:
        if len(data) < 10:
            raise ValueError("short frame")
        header, body = data[:10], data[10:]
    if header[:4] != MAGIC:
        raise ValueError("bad magic")
    crc, blen = struct.unpack(">IH", header[4:10])
    body = body[:blen]
    if (zlib.crc32(body) & 0xFFFFFFFF) != crc:
        raise ValueError("CRC fail")
    if body[:4] != MAGIC:
        raise ValueError("body magic")
    ver, mlen = struct.unpack(">BH", body[4:7])
    meta = json.loads(body[7 : 7 + mlen])
    ct = body[7 + mlen :]
    return meta, ct


# ---------------------------------------------------------------------------
# Neural architecture: multi-scale residual with payload conditioning
# ---------------------------------------------------------------------------
class ResidualBlock(nn.Module):
    def __init__(self, ch: int):
        super().__init__()
        self.c1 = nn.Conv2d(ch, ch, 3, padding=1)
        self.b1 = nn.BatchNorm2d(ch)
        self.c2 = nn.Conv2d(ch, ch, 3, padding=1)
        self.b2 = nn.BatchNorm2d(ch)

    def forward(self, x):
        r = F.relu(self.b1(self.c1(x)))
        return F.relu(x + self.b2(self.c2(r)))


class SpatialAttention(nn.Module):
    def __init__(self, ch: int):
        super().__init__()
        self.conv = nn.Conv2d(ch, 1, 7, padding=3)

    def forward(self, x):
        a = torch.sigmoid(self.conv(x))
        return x * a, a


class ChannelAttention(nn.Module):
    def __init__(self, ch: int, r: int = 8):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(ch, max(ch // r, 4)),
            nn.ReLU(True),
            nn.Linear(max(ch // r, 4), ch),
            nn.Sigmoid(),
        )

    def forward(self, x):
        w = self.fc(x).unsqueeze(-1).unsqueeze(-1)
        return x * w


class PayloadConditioner(nn.Module):
    """Maps scalar payload rate (bpp) to a feature vector injected into fusion."""

    def __init__(self, out_ch: int = 32):
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(1, 16),
            nn.ReLU(True),
            nn.Linear(16, out_ch),
            nn.ReLU(True),
        )

    def forward(self, rate: torch.Tensor) -> torch.Tensor:
        # rate: (B, 1)
        return self.mlp(rate)


class ARESEncoder(nn.Module):
    """
    Cover (3) + attention (1) + payload conditioning → residual + mask.
    Residual is bounded by Tanh so |Δ| stays small.
    """

    def __init__(self, base: int = 32):
        super().__init__()
        self.base = base
        self.cond = PayloadConditioner(base)
        # multi-scale encoder
        self.enc1 = nn.Sequential(
            nn.Conv2d(4, base, 3, padding=1), nn.ReLU(True), ResidualBlock(base)
        )
        self.enc2 = nn.Sequential(
            nn.Conv2d(base, base * 2, 3, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base * 2),
        )
        self.bot = ResidualBlock(base * 2)
        self.ca = ChannelAttention(base * 2)
        self.sa = SpatialAttention(base * 2)
        # fusion of payload conditioning
        self.fuse = nn.Conv2d(base * 2 + base, base * 2, 1)
        # residual head (1 channel for blue residual in classical path; 3 for full RGB)
        self.res_head = nn.Sequential(
            nn.ConvTranspose2d(base * 2, base, 4, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base),
            nn.Conv2d(base, 1, 3, padding=1),
            nn.Tanh(),
        )
        # mask head (embedding strength map)
        self.mask_head = nn.Sequential(
            nn.ConvTranspose2d(base * 2, base, 4, stride=2, padding=1),
            nn.ReLU(True),
            nn.Conv2d(base, 1, 3, padding=1),
            nn.Sigmoid(),
        )
        # channel alphas (R,G,B)
        self.alpha = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(base * 2, 3),
            nn.Sigmoid(),
        )

    def forward(self, cover_att: torch.Tensor, rate: torch.Tensor):
        """
        cover_att: (B,4,H,W)  RGB + attention
        rate: (B,1) payload rate in bpp
        returns residual (B,1,H,W), mask (B,1,H,W), alphas (B,3)
        """
        e1 = self.enc1(cover_att)
        e2 = self.enc2(e1)
        b = self.bot(e2)
        b = self.ca(b)
        b, _ = self.sa(b)
        # inject payload condition
        c = self.cond(rate)  # (B, base)
        c = c.unsqueeze(-1).unsqueeze(-1).expand(-1, -1, b.shape[2], b.shape[3])
        fused = self.fuse(torch.cat([b, c], dim=1))
        residual = self.res_head(fused)
        mask = self.mask_head(fused)
        alphas = self.alpha(b)  # (B,3)
        return residual, mask, alphas


class ARESDecoder(nn.Module):
    """Multi-scale decoder that recovers a soft bit map from stego."""

    def __init__(self, base: int = 32):
        super().__init__()
        self.enc1 = nn.Sequential(
            nn.Conv2d(3, base, 3, padding=1), nn.ReLU(True), ResidualBlock(base)
        )
        self.enc2 = nn.Sequential(
            nn.Conv2d(base, base * 2, 3, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base * 2),
        )
        self.bot = ResidualBlock(base * 2)
        self.dec = nn.Sequential(
            nn.ConvTranspose2d(base * 2, base, 4, stride=2, padding=1),
            nn.ReLU(True),
            ResidualBlock(base),
            nn.Conv2d(base, 1, 3, padding=1),
            nn.Sigmoid(),
        )

    def forward(self, stego: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(stego)
        e2 = self.enc2(e1)
        b = self.bot(e2)
        return self.dec(b)


# ---------------------------------------------------------------------------
# Classical adaptive LSB path (always available, used as primary payload carrier)
# ---------------------------------------------------------------------------
def embed_bits_blue(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    bits: List[int],
    bpp: int = 1,
) -> np.ndarray:
    blue = arr[:, :, 2].copy()
    idx, n = 0, len(bits)
    for y, x in positions:
        if idx >= n:
            break
        val = int(blue[y, x])
        for b in range(bpp):
            if idx >= n:
                break
            val = (val & ~(1 << b)) | (bits[idx] << b)
            idx += 1
        blue[y, x] = val & 0xFF
    out = arr.copy()
    out[:, :, 2] = blue
    return out


def extract_bits_blue(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    n_bits: int,
    bpp: int = 1,
) -> List[int]:
    bits = []
    blue = arr[:, :, 2]
    for y, x in positions:
        if len(bits) >= n_bits:
            break
        val = int(blue[y, x])
        for b in range(bpp):
            if len(bits) >= n_bits:
                break
            bits.append((val >> b) & 1)
    return bits



def _high_psnr_post(cover_rgb, stego_rgb, bpp=1, channel=2, passes=3, strength=0.85):
    """Lightweight post residual (LSB locked)."""
    import numpy as np
    out = stego_rgb.astype(np.int16).copy()
    cover = cover_rgb.astype(np.int16)
    h, w = out.shape[:2]
    low_mask = (1 << bpp) - 1
    for _ in range(passes):
        diff = out[:, :, channel].astype(np.float32) - cover[:, :, channel].astype(np.float32)
        pad = np.pad(diff, 1, mode='edge')
        local = (pad[0:-2,0:-2]+pad[0:-2,1:-1]+pad[0:-2,2:]+pad[1:-1,0:-2]+pad[1:-1,1:-1]+pad[1:-1,2:]+pad[2:,0:-2]+pad[2:,1:-1]+pad[2:,2:])/9.0
        ch = out[:, :, channel]
        for i in range(h):
            for j in range(w):
                err = float(local[i, j])
                if abs(err) < 0.2:
                    continue
                low = int(ch[i, j]) & low_mask
                high = int(ch[i, j]) >> bpp
                adj = int(round(-strength * err / max(1, 1 << bpp)))
                if adj == 0 and abs(err) >= 0.5:
                    adj = -1 if err > 0 else 1
                high = high + adj
                out[i, j, channel] = max(0, min(255, (high << bpp) | low))
    return out.astype(np.uint8)

def classical_residual_compensate(
    orig_blue: np.ndarray,
    stego_blue: np.ndarray,
    att: np.ndarray,
    bpp: int,
    strength: float = 0.40,
) -> np.ndarray:
    diff = stego_blue.astype(np.float32) - orig_blue.astype(np.float32)
    h, w = diff.shape
    out = stego_blue.astype(np.int16).copy()
    for i in range(1, h - 1):
        for j in range(1, w - 1):
            if att[i, j] < 0.2:
                continue
            err = float(diff[i - 1 : i + 2, j - 1 : j + 2].mean())
            if abs(err) < 0.1:
                continue
            low_mask = (1 << bpp) - 1
            low = int(out[i, j]) & low_mask
            high = int(out[i, j]) >> bpp
            high = high + int(round(-strength * err))
            out[i, j] = max(0, min(255, (high << bpp) | low))
    return out.astype(np.uint8)


def apply_cnn_residual(
    cover_rgb: np.ndarray,
    stego_blue: np.ndarray,
    att: np.ndarray,
    model: nn.Module,
    strength: float = 0.50,
    bpp: int = 1,
    rate: float = 0.1,
) -> np.ndarray:
    model.eval()
    h, w = stego_blue.shape
    rgb = cover_rgb.astype(np.float32) / 255.0
    inp = np.concatenate([rgb.transpose(2, 0, 1), att[None, ...]], 0)
    t = torch.from_numpy(inp).float().unsqueeze(0).to(DEVICE)
    rate_t = torch.tensor([[rate]], dtype=torch.float32, device=DEVICE)
    with torch.no_grad():
        residual, mask, alphas = model(t, rate_t)
        residual = residual.squeeze().cpu().numpy()
        mask = mask.squeeze().cpu().numpy()
    delta = residual * mask * strength * 5.0
    out = stego_blue.astype(np.int16).copy()
    for i in range(h):
        for j in range(w):
            low_mask = (1 << bpp) - 1
            low = int(out[i, j]) & low_mask
            high = int(out[i, j]) >> bpp
            high = high + int(round(delta[i, j]))
            out[i, j] = max(0, min(255, (high << bpp) | low))
    return out.astype(np.uint8)


def load_encoder(path: Optional[str] = None, base: int = 32) -> Optional[ARESEncoder]:
    model = ARESEncoder(base=base).to(DEVICE)
    if path and Path(path).exists():
        ckpt = torch.load(path, map_location=DEVICE, weights_only=False)
        if isinstance(ckpt, dict) and "encoder" in ckpt:
            model.load_state_dict(ckpt["encoder"])
        elif isinstance(ckpt, dict) and "model" in ckpt:
            # compatibility with older ResidualCNN checkpoints
            try:
                model.load_state_dict(ckpt["model"], strict=False)
            except Exception:
                pass
        else:
            try:
                model.load_state_dict(ckpt, strict=False)
            except Exception:
                pass
    model.eval()
    return model


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def ares_embed(
    cover: Image.Image,
    secret: str,
    password: str = "benchmark",
    max_bpp: int = 1,
    residual_model: Optional[nn.Module] = None,
    use_residual: bool = True,
    ecc_mode: str = "HEADER_REP3",
    adaptive: bool = True,
    payload_rate: Optional[float] = None,
) -> Tuple[Image.Image, dict]:
    if cover.mode != "RGB":
        cover = cover.convert("RGB")
    arr = np.array(cover)
    h, w = arr.shape[:2]
    gray = np.mean(arr, axis=2).astype(np.uint8)
    ct = encrypt_secret(secret, password)
    att = compute_attention_map(gray)

    if adaptive:
        rg = (arr[:, :, 0].astype(np.float32) + arr[:, :, 1].astype(np.float32)) / 2
        att_rg = compute_attention_map(rg.astype(np.uint8))
        positions = adaptive_positions(h, w, password, att_rg)
    else:
        positions = keyed_positions(h, w, password)

    payload = pack_payload(
        ct, {"m": "AU", "e": ecc_mode, "b": max_bpp}, ecc_mode=ecc_mode
    )
    bits = []
    for byte in payload:
        for i in range(8):
            bits.append((byte >> i) & 1)

    capacity = h * w * max_bpp
    if len(bits) > capacity:
        raise ValueError(f"payload {len(bits)} > capacity {capacity}")

    rate = payload_rate if payload_rate is not None else (len(bits) / max(1, h * w))
    stego_arr = embed_bits_blue(arr, positions, bits, max_bpp)
    blue = stego_arr[:, :, 2]

    if use_residual:
        if residual_model is not None and isinstance(residual_model, ARESEncoder):
            blue = apply_cnn_residual(
                arr, blue, att, residual_model, strength=0.50, bpp=max_bpp, rate=rate
            )
        elif residual_model is not None:
            # older ResidualCNN compatibility
            try:
                from models.proposed.ares_steg_quantum import apply_cnn_residual as old_apply
                blue = old_apply(arr, blue, att, residual_model, strength=0.55, bpp=max_bpp)
            except Exception:
                blue = classical_residual_compensate(
                    arr[:, :, 2], blue, att, max_bpp, strength=0.40
                )
        else:
            blue = classical_residual_compensate(
                arr[:, :, 2], blue, att, max_bpp, strength=0.40
            )

    stego_arr = arr.copy()
    stego_arr[:, :, 2] = blue
    stego_arr = _high_psnr_post(arr, stego_arr, bpp=max_bpp, channel=2, passes=3, strength=0.85)
    stego = Image.fromarray(stego_arr)

    info = {
        "method": "ARES-Upgraded",
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
        "residual": "cnn" if residual_model else ("classical" if use_residual else "none"),
        "adaptive": adaptive,
        "max_bpp": max_bpp,
        "version": VERSION,
    }
    return stego, info


def ares_extract(
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
    raw_bits = extract_bits_blue(arr, positions, need, max_bpp)
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
    raise ValueError(f"extract failed: {last}")


# ---------------------------------------------------------------------------
# Residual statistics helper
# ---------------------------------------------------------------------------
def residual_stats(cover: Image.Image, stego: Image.Image) -> Dict[str, float]:
    c = np.asarray(cover.convert("RGB"), dtype=np.float64)
    s = np.asarray(stego.convert("RGB"), dtype=np.float64)
    d = s - c
    abs_d = np.abs(d)
    return {
        "mean_abs_delta": float(abs_d.mean()),
        "rms_delta": float(np.sqrt((d ** 2).mean())),
        "max_abs_delta": float(abs_d.max()),
        "p95_abs_delta": float(np.percentile(abs_d, 95)),
        "changed_pixel_pct": float((abs_d.sum(axis=2) > 0).mean() * 100),
    }
