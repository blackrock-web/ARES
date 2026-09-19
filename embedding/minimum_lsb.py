"""
Minimum-LSB + change-minimizing matrix embedding + optimal ±1 matching.

Goal: fewest pixel changes and smallest |Δ| per change → maximize PSNR.

- Skip when cover LSB already matches payload
- ±1 direction chosen to stay closest to original / local mean
- Optional (3,2) Hamming-style group coding: ~2 bits / 3 LSBs with ≤1 flip
  → lower change rate than independent LSB (~0.5 → ~0.25–0.37 flips/bit)
"""
from __future__ import annotations

from typing import List, Tuple, Optional, Dict
import numpy as np
import torch


def _optimal_pm1(val: int, target_lsb: int, local_mean: float) -> int:
    """
    Set LSB to target_lsb with |Δ| = 0 or 1.
    If flip needed, choose +1 or -1 toward local_mean (and in [0,255]).
    """
    cur = val & 1
    if cur == target_lsb:
        return val
    up = val + 1
    down = val - 1
    candidates = []
    if 0 <= up <= 255 and (up & 1) == target_lsb:
        candidates.append(up)
    if 0 <= down <= 255 and (down & 1) == target_lsb:
        candidates.append(down)
    if not candidates:
        # fallback XOR single bit
        return val ^ 1
    # pick closest to local mean, then closest to original
    def score(v):
        return (abs(v - local_mean), abs(v - val))

    candidates.sort(key=score)
    return candidates[0]


def minimum_lsb_embed(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    bits: List[int],
    channel: int = 2,
    bpp: int = 1,
    use_pm1: bool = True,
) -> Tuple[np.ndarray, dict]:
    """Independent minimum-LSB (optional optimal ±1)."""
    out = arr.copy()
    ch = out[:, :, channel].astype(np.int16)
    h, w = ch.shape
    changed_lsb = 0
    changed_pixels = set()
    abs_sum = 0
    idx = 0
    n = len(bits)
    for y, x in positions:
        if idx >= n:
            break
        val = int(ch[y, x])
        orig = val
        # local mean for ±1 guidance
        y0, y1 = max(0, y - 1), min(h, y + 2)
        x0, x1 = max(0, x - 1), min(w, x + 2)
        local_mean = float(ch[y0:y1, x0:x1].mean())
        for b in range(bpp):
            if idx >= n:
                break
            bit = bits[idx] & 1
            if bpp == 1 and use_pm1:
                new_val = _optimal_pm1(val, bit, local_mean)
                if new_val != val:
                    changed_lsb += 1
                    abs_sum += abs(new_val - val)
                val = new_val
            else:
                cur = (val >> b) & 1
                if cur != bit:
                    val = val ^ (1 << b)
                    changed_lsb += 1
                    abs_sum += 1
            idx += 1
        val = max(0, min(255, int(val)))
        if val != orig:
            changed_pixels.add((y, x))
        ch[y, x] = val
    out[:, :, channel] = ch.astype(np.uint8)
    stats = {
        "changed_lsb": changed_lsb,
        "changed_pixels": len(changed_pixels),
        "total_bits": n,
        "lsb_change_pct": 100.0 * changed_lsb / max(1, n),
        "pixel_change_pct": 100.0
        * len(changed_pixels)
        / max(1, len(positions[: max(1, (n + bpp - 1) // bpp)])),
        "abs_delta_sum": abs_sum,
        "method": "min_lsb_pm1" if use_pm1 else "min_lsb",
    }
    return out, stats


def matrix_embed_32(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    bits: List[int],
    channel: int = 2,
) -> Tuple[np.ndarray, dict]:
    """
    (3,2) group coding: every 3 cover LSBs carry 2 message bits with ≤1 change.

    Syndrome:
      s0 = c0 XOR c1
      s1 = c1 XOR c2
    Flip the unique bit that corrects (s0,s1) to (m0,m1), or none if already match.
    Average changes ≈ 0.75 per 2 bits ≈ 0.375 / bit (vs ~0.5 independent).
    """
    out = arr.copy()
    ch = out[:, :, channel].astype(np.int16)
    h, w = ch.shape
    # pad bits to even length
    msg = list(bits)
    if len(msg) % 2 == 1:
        msg.append(0)
    changed = 0
    changed_pixels = set()
    abs_sum = 0
    pos_i = 0
    bit_i = 0
    n_pos = len(positions)

    while bit_i + 1 < len(msg) and pos_i + 2 < n_pos:
        m0, m1 = msg[bit_i] & 1, msg[bit_i + 1] & 1
        coords = [positions[pos_i], positions[pos_i + 1], positions[pos_i + 2]]
        vals = [int(ch[y, x]) for y, x in coords]
        c = [v & 1 for v in vals]
        s0 = c[0] ^ c[1]
        s1 = c[1] ^ c[2]
        # which index to flip: 0→c0, 1→c1, 2→c2, -1→none
        # target syndrome (m0, m1)
        # flipping c0 toggles s0 only
        # flipping c2 toggles s1 only
        # flipping c1 toggles both
        need0 = s0 ^ m0
        need1 = s1 ^ m1
        flip = -1
        if need0 == 0 and need1 == 0:
            flip = -1
        elif need0 == 1 and need1 == 0:
            flip = 0
        elif need0 == 0 and need1 == 1:
            flip = 2
        else:
            flip = 1

        if flip >= 0:
            y, x = coords[flip]
            val = vals[flip]
            y0, y1 = max(0, y - 1), min(h, y + 2)
            x0, x1 = max(0, x - 1), min(w, x + 2)
            local_mean = float(ch[y0:y1, x0:x1].mean())
            new_val = _optimal_pm1(val, 1 - (val & 1), local_mean)
            ch[y, x] = new_val
            changed += 1
            changed_pixels.add((y, x))
            abs_sum += abs(new_val - val)

        pos_i += 3
        bit_i += 2

    # remainder bits: plain min-LSB
    rem_bits = msg[bit_i:]
    rem_pos = positions[pos_i:]
    if rem_bits and rem_pos:
        tmp = out.copy()
        tmp[:, :, channel] = ch.astype(np.uint8)
        tmp, st = minimum_lsb_embed(tmp, rem_pos, rem_bits, channel=channel, bpp=1, use_pm1=True)
        ch = tmp[:, :, channel].astype(np.int16)
        changed += st["changed_lsb"]
        abs_sum += st.get("abs_delta_sum", st["changed_lsb"])
        # approximate pixel set
        changed_pixels.add(("rem", st["changed_pixels"]))

    out[:, :, channel] = ch.astype(np.uint8)
    n = len(bits)
    stats = {
        "changed_lsb": changed,
        "changed_pixels": len([p for p in changed_pixels if not (isinstance(p, tuple) and p[0] == "rem")])
        + (0 if not rem_bits else int(rem_bits and True) * 0),
        "total_bits": n,
        "lsb_change_pct": 100.0 * changed / max(1, n),
        "pixel_change_pct": 100.0 * changed / max(1, n),
        "abs_delta_sum": abs_sum,
        "method": "matrix_32_pm1",
    }
    # fix changed_pixels count
    stats["changed_pixels"] = changed
    return out, stats


def matrix_extract_32(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    n_bits: int,
    channel: int = 2,
) -> List[int]:
    """Inverse of matrix_embed_32."""
    ch = arr[:, :, channel]
    msg_len = n_bits + (n_bits % 2)  # even
    bits: List[int] = []
    pos_i = 0
    n_pos = len(positions)
    while len(bits) < msg_len and pos_i + 2 < n_pos:
        coords = [positions[pos_i], positions[pos_i + 1], positions[pos_i + 2]]
        c = [int(ch[y, x]) & 1 for y, x in coords]
        m0 = c[0] ^ c[1]
        m1 = c[1] ^ c[2]
        bits.extend([m0, m1])
        pos_i += 3
    # remainder
    rem_need = msg_len - len(bits)
    if rem_need > 0:
        rem = minimum_lsb_extract(arr, positions[pos_i:], rem_need, channel=channel, bpp=1)
        bits.extend(rem)
    return bits[:n_bits]


def minimum_lsb_extract(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    n_bits: int,
    channel: int = 2,
    bpp: int = 1,
) -> List[int]:
    bits = []
    ch = arr[:, :, channel]
    for y, x in positions:
        if len(bits) >= n_bits:
            break
        val = int(ch[y, x])
        for b in range(bpp):
            if len(bits) >= n_bits:
                break
            bits.append((val >> b) & 1)
    return bits




def matrix_embed_74(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    bits: List[int],
    channel: int = 2,
) -> Tuple[np.ndarray, dict]:
    """
    Hamming embedding: 3 message bits per 7 cover LSBs, at most 1 flip.
    H columns = 1..7; syndrome s = xor of positions (1-based) where LSB=1.
    Flip position (s XOR msg) to make syndrome equal message.
    Change rate ≈ 7/8 per block / 3 bits ≈ 0.29 flips/bit.
    """
    out = arr.copy()
    ch = out[:, :, channel].astype(np.int16)
    h, w = ch.shape
    msg = list(bits)
    while len(msg) % 3 != 0:
        msg.append(0)

    changed = 0
    abs_sum = 0
    pos_i = 0
    bit_i = 0
    n_pos = len(positions)

    while bit_i + 2 < len(msg) and pos_i + 6 < n_pos:
        # 3-bit message as integer 0..7
        mval = (msg[bit_i] & 1) | ((msg[bit_i + 1] & 1) << 1) | ((msg[bit_i + 2] & 1) << 2)
        coords = [positions[pos_i + k] for k in range(7)]
        vals = [int(ch[y, x]) for y, x in coords]
        c = [v & 1 for v in vals]
        # current syndrome
        syn = 0
        for i in range(7):
            if c[i]:
                syn ^= (i + 1)
        flip_at = syn ^ mval  # 0 = no flip, 1..7 = flip that index
        if flip_at != 0:
            fi = flip_at - 1
            y, x = coords[fi]
            val = vals[fi]
            y0, y1 = max(0, y - 1), min(h, y + 2)
            x0, x1 = max(0, x - 1), min(w, x + 2)
            local_mean = float(ch[y0:y1, x0:x1].mean())
            new_val = _optimal_pm1(val, 1 - (val & 1), local_mean)
            ch[y, x] = new_val
            changed += 1
            abs_sum += abs(new_val - val)
        pos_i += 7
        bit_i += 3

    rem_bits = msg[bit_i:]
    rem_pos = positions[pos_i:]
    if rem_bits and rem_pos:
        tmp = out.copy()
        tmp[:, :, channel] = ch.astype(np.uint8)
        tmp, st = minimum_lsb_embed(tmp, rem_pos, rem_bits, channel=channel, bpp=1, use_pm1=True)
        ch = tmp[:, :, channel].astype(np.int16)
        changed += st["changed_lsb"]
        abs_sum += st.get("abs_delta_sum", st["changed_lsb"])

    out[:, :, channel] = ch.astype(np.uint8)
    n = len(bits)
    return out, {
        "changed_lsb": changed,
        "changed_pixels": changed,
        "total_bits": n,
        "lsb_change_pct": 100.0 * changed / max(1, n),
        "pixel_change_pct": 100.0 * changed / max(1, n),
        "abs_delta_sum": abs_sum,
        "method": "hamming_7_3_pm1",
    }


def matrix_extract_74(
    arr: np.ndarray,
    positions: List[Tuple[int, int]],
    n_bits: int,
    channel: int = 2,
) -> List[int]:
    ch = arr[:, :, channel]
    target = n_bits + (3 - n_bits % 3) % 3
    bits: List[int] = []
    pos_i = 0
    n_pos = len(positions)
    while len(bits) < target and pos_i + 6 < n_pos:
        coords = [positions[pos_i + k] for k in range(7)]
        c = [int(ch[y, x]) & 1 for y, x in coords]
        syn = 0
        for i in range(7):
            if c[i]:
                syn ^= (i + 1)
        bits.append(syn & 1)
        bits.append((syn >> 1) & 1)
        bits.append((syn >> 2) & 1)
        pos_i += 7
    rem_need = target - len(bits)
    if rem_need > 0:
        bits.extend(minimum_lsb_extract(arr, positions[pos_i:], rem_need, channel=channel, bpp=1))
    return bits[:n_bits]



def soft_lsb_approx(
    cover: torch.Tensor,
    residual: torch.Tensor,
    mask: torch.Tensor,
    strength: float = 1.0,
) -> torch.Tensor:
    delta = strength * mask * residual
    return torch.clamp(cover + delta, 0.0, 1.0)


def lsb_difference_map(cover: np.ndarray, stego: np.ndarray, channel: int = 2) -> np.ndarray:
    c = cover[:, :, channel].astype(np.int16)
    s = stego[:, :, channel].astype(np.int16)
    return ((c & 1) != (s & 1)).astype(np.uint8)


def high_psnr_compensate(
    cover_rgb: np.ndarray,
    stego_rgb: np.ndarray,
    bpp: int = 1,
    channel: int = 2,
    passes: int = 3,
    strength: float = 0.85,
) -> np.ndarray:
    """
    Multi-pass residual compensation on HIGH bits only (LSB payload preserved).
    Pulls stego toward cover in a local sense while locking lower `bpp` bits.
    Also lightly balances R/G toward cover when blue was changed (MSE split).
    """
    out = stego_rgb.astype(np.int16).copy()
    cover = cover_rgb.astype(np.int16)
    h, w = out.shape[:2]
    low_mask = (1 << bpp) - 1

    for _ in range(passes):
        diff = out[:, :, channel].astype(np.float32) - cover[:, :, channel].astype(np.float32)
        # local average error
        pad = np.pad(diff, 1, mode="edge")
        local = (
            pad[0:-2, 0:-2]
            + pad[0:-2, 1:-1]
            + pad[0:-2, 2:]
            + pad[1:-1, 0:-2]
            + pad[1:-1, 1:-1]
            + pad[1:-1, 2:]
            + pad[2:, 0:-2]
            + pad[2:, 1:-1]
            + pad[2:, 2:]
        ) / 9.0

        ch = out[:, :, channel]
        for i in range(h):
            for j in range(w):
                err = float(local[i, j])
                if abs(err) < 0.15:
                    continue
                low = int(ch[i, j]) & low_mask
                high = int(ch[i, j]) >> bpp
                # move high bits opposite to error
                adj = int(round(-strength * err / max(1, 1 << bpp)))
                if adj == 0 and abs(err) >= 0.5:
                    adj = -1 if err > 0 else 1
                high = high + adj
                new_v = (high << bpp) | low
                out[i, j, channel] = max(0, min(255, new_v))

        # optional tiny R/G pull toward cover (does not affect blue payload)
        for c in (0, 1):
            d = out[:, :, c] - cover[:, :, c]
            # only adjust pixels where |d|>=1 and blue also differs
            blue_d = out[:, :, channel] - cover[:, :, channel]
            mask = (np.abs(blue_d) > 0) & (np.abs(d) > 0)
            # move R/G one step toward cover on those pixels
            step = np.sign(d).astype(np.int16)
            out[:, :, c] = np.where(mask, out[:, :, c] - step, out[:, :, c])
            out[:, :, c] = np.clip(out[:, :, c], 0, 255)

    return out.astype(np.uint8)
