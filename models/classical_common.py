"""Shared classical steganography primitives for paper-model reproductions."""
from __future__ import annotations
import hashlib, struct, math, json, zlib
from typing import List, Tuple
from PIL import Image
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def psnr(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a, dtype=np.float64)
    y = np.asarray(b, dtype=np.float64)
    mse_val = float(((x - y) ** 2).mean())
    return 99.0 if mse_val == 0 else 10 * math.log10((255 ** 2) / mse_val)


def mse(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a, dtype=np.float64)
    y = np.asarray(b, dtype=np.float64)
    return float(((x - y) ** 2).mean())


def ssim_global(a: Image.Image, b: Image.Image) -> float:
    x = np.asarray(a, dtype=np.float64)
    y = np.asarray(b, dtype=np.float64)
    mu_x, mu_y = x.mean(), y.mean()
    vx, vy = x.var(), y.var()
    cov = ((x - mu_x) * (y - mu_y)).mean()
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    den = (mu_x ** 2 + mu_y ** 2 + c1) * (vx + vy + c2)
    return 1.0 if den == 0 else float(((2 * mu_x * mu_y + c1) * (2 * cov + c2)) / den)


def _key(password: str, salt: bytes, n: int = 32) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000, n)


def aes_encrypt(text: str, password: str) -> bytes:
    salt = hashlib.sha256((password + "|salt").encode()).digest()[:16]
    nonce = hashlib.sha256((password + "|nonce").encode()).digest()[:12]
    # use deterministic salt/nonce derived from password for reproducible benchmarks
    # (production would use random; benchmark needs determinism)
    key = _key(password, salt)
    ct = AESGCM(key).encrypt(nonce, text.encode(), b"steg-bench")
    return b"BENCH" + salt + nonce + ct


def aes_decrypt(blob: bytes, password: str) -> str:
    if not blob.startswith(b"BENCH") or len(blob) < 5 + 16 + 12 + 16:
        raise ValueError("bad ciphertext")
    salt, nonce, ct = blob[5:21], blob[21:33], blob[33:]
    key = _key(password, salt)
    return AESGCM(key).decrypt(nonce, ct, b"steg-bench").decode()


def keyed_order(h: int, w: int, password: str) -> List[Tuple[int, int]]:
    seed = int.from_bytes(hashlib.sha256(password.encode()).digest()[:8], "big")
    rng = np.random.RandomState(seed % (2 ** 32))
    coords = [(i, j) for i in range(h) for j in range(w)]
    rng.shuffle(coords)
    return coords


def bits_from_bytes(data: bytes) -> List[int]:
    out = []
    for b in data:
        for k in range(8):
            out.append((b >> k) & 1)
    return out


def bytes_from_bits(bits: List[int]) -> bytes:
    out = bytearray()
    for i in range(0, len(bits) - 7, 8):
        v = 0
        for k in range(8):
            v |= (bits[i + k] << k)
        out.append(v)
    return bytes(out)


def embed_lsb(arr: np.ndarray, positions, bits: List[int], nbits: int = 1) -> None:
    idx = 0
    n = len(bits)
    for y, x in positions:
        if idx >= n:
            break
        val = int(arr[y, x])
        for b in range(nbits):
            if idx >= n:
                break
            val = (val & ~(1 << b)) | (bits[idx] << b)
            idx += 1
        arr[y, x] = val & 0xFF


def extract_lsb(arr: np.ndarray, positions, n_bits: int, nbits: int = 1) -> List[int]:
    bits = []
    for y, x in positions:
        if len(bits) >= n_bits:
            break
        val = int(arr[y, x])
        for b in range(nbits):
            if len(bits) >= n_bits:
                break
            bits.append((val >> b) & 1)
    return bits


def pack_simple(payload: bytes, method: str) -> bytes:
    meta = json.dumps({"m": method}).encode()
    return b"PKG1" + struct.pack(">I", len(meta)) + meta + struct.pack(">I", len(payload)) + payload


def unpack_simple(data: bytes):
    if not data.startswith(b"PKG1"):
        raise ValueError("bad package")
    ml = struct.unpack(">I", data[4:8])[0]
    meta = json.loads(data[8:8 + ml])
    p = 8 + ml
    pl = struct.unpack(">I", data[p:p + 4])[0]
    p += 4
    return meta, data[p:p + pl]


def generic_lsb_encode(cover: Image.Image, secret: str, password: str, method: str, nbits: int = 1):
    arr = np.array(cover.convert("RGB"))
    h, w = arr.shape[:2]
    pos = keyed_order(h, w, password + method)
    ct = aes_encrypt(secret, password)
    frame = pack_simple(ct, method)
    bits = bits_from_bytes(frame)
    capacity = h * w * nbits
    if len(bits) > capacity:
        raise ValueError(f"payload {len(bits)} > capacity {capacity}")
    blue = arr[:, :, 2].copy()
    embed_lsb(blue, pos, bits, nbits)
    out = arr.copy()
    out[:, :, 2] = blue
    stego = Image.fromarray(out)
    return stego, len(bits), capacity


def generic_lsb_decode(stego: Image.Image, password: str, method: str, nbits: int = 1) -> str:
    arr = np.array(stego.convert("RGB"))
    h, w = arr.shape[:2]
    pos = keyed_order(h, w, password + method)
    # read generous header
    max_bits = min(h * w * nbits, 8 * 4096)
    bits = extract_lsb(arr[:, :, 2], pos, max_bits, nbits)
    raw = bytes_from_bits(bits)
    meta, ct = unpack_simple(raw)
    return aes_decrypt(ct, password)
