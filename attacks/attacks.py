"""Realistic attack suite for robustness evaluation and curriculum training."""
from __future__ import annotations
from typing import Callable, Dict, List, Optional, Tuple
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
import numpy as np
import io


def jpeg_compress(img: Image.Image, quality: int = 90) -> Image.Image:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def gaussian_noise(img: Image.Image, std: float = 5.0) -> Image.Image:
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    noise = np.random.normal(0, std, arr.shape).astype(np.float32)
    out = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def salt_pepper(img: Image.Image, amount: float = 0.01) -> Image.Image:
    arr = np.asarray(img.convert("RGB")).copy()
    h, w = arr.shape[:2]
    n = int(amount * h * w)
    # salt
    ys = np.random.randint(0, h, n)
    xs = np.random.randint(0, w, n)
    arr[ys, xs] = 255
    # pepper
    ys = np.random.randint(0, h, n)
    xs = np.random.randint(0, w, n)
    arr[ys, xs] = 0
    return Image.fromarray(arr)


def gaussian_blur(img: Image.Image, radius: float = 1.0) -> Image.Image:
    return img.filter(ImageFilter.GaussianBlur(radius=radius))


def median_blur(img: Image.Image, size: int = 3) -> Image.Image:
    return img.filter(ImageFilter.MedianFilter(size=size))


def resize_attack(img: Image.Image, scale: float = 0.9) -> Image.Image:
    w, h = img.size
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    small = img.resize((nw, nh), Image.BILINEAR)
    return small.resize((w, h), Image.BILINEAR)


def center_crop(img: Image.Image, ratio: float = 0.9) -> Image.Image:
    w, h = img.size
    nw, nh = int(w * ratio), int(h * ratio)
    left = (w - nw) // 2
    top = (h - nh) // 2
    cropped = img.crop((left, top, left + nw, top + nh))
    return cropped.resize((w, h), Image.BILINEAR)


def small_rotation(img: Image.Image, degrees: float = 2.0) -> Image.Image:
    return img.rotate(degrees, resample=Image.BILINEAR, expand=False, fillcolor=(0, 0, 0))


def brightness(img: Image.Image, factor: float = 1.1) -> Image.Image:
    return ImageEnhance.Brightness(img).enhance(factor)


def contrast(img: Image.Image, factor: float = 1.1) -> Image.Image:
    return ImageEnhance.Contrast(img).enhance(factor)


def gamma_correct(img: Image.Image, gamma: float = 1.1) -> Image.Image:
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    arr = np.clip(arr ** gamma, 0, 1)
    return Image.fromarray((arr * 255).astype(np.uint8))


def combined_weak(img: Image.Image) -> Image.Image:
    img = jpeg_compress(img, 90)
    img = gaussian_noise(img, 2.0)
    return img


def combined_moderate(img: Image.Image) -> Image.Image:
    img = jpeg_compress(img, 80)
    img = gaussian_noise(img, 5.0)
    img = gaussian_blur(img, 0.8)
    return img


def combined_strong(img: Image.Image) -> Image.Image:
    img = jpeg_compress(img, 50)
    img = gaussian_noise(img, 10.0)
    img = gaussian_blur(img, 1.2)
    img = resize_attack(img, 0.85)
    return img


# Named attack registry for evaluation matrix
ATTACKS: Dict[str, Callable[[Image.Image], Image.Image]] = {
    "CLEAN": lambda x: x.copy(),
    "JPEG95": lambda x: jpeg_compress(x, 95),
    "JPEG90": lambda x: jpeg_compress(x, 90),
    "JPEG80": lambda x: jpeg_compress(x, 80),
    "JPEG70": lambda x: jpeg_compress(x, 70),
    "JPEG50": lambda x: jpeg_compress(x, 50),
    "JPEG30": lambda x: jpeg_compress(x, 30),
    "NOISE_G2": lambda x: gaussian_noise(x, 2.0),
    "NOISE_G5": lambda x: gaussian_noise(x, 5.0),
    "NOISE_G10": lambda x: gaussian_noise(x, 10.0),
    "SALT_PEPPER": lambda x: salt_pepper(x, 0.01),
    "BLUR_G1": lambda x: gaussian_blur(x, 1.0),
    "BLUR_MED": lambda x: median_blur(x, 3),
    "RESIZE_90": lambda x: resize_attack(x, 0.9),
    "RESIZE_75": lambda x: resize_attack(x, 0.75),
    "CROP_90": lambda x: center_crop(x, 0.9),
    "ROT_2": lambda x: small_rotation(x, 2.0),
    "BRIGHT_1.1": lambda x: brightness(x, 1.1),
    "CONTRAST_1.1": lambda x: contrast(x, 1.1),
    "GAMMA_1.1": lambda x: gamma_correct(x, 1.1),
    "COMBINED_WEAK": combined_weak,
    "COMBINED_MOD": combined_moderate,
    "COMBINED_STRONG": combined_strong,
}

# Curriculum stages for training
CURRICULUM = [
    ["CLEAN"],
    ["CLEAN", "JPEG95", "NOISE_G2"],
    ["JPEG90", "NOISE_G5", "BLUR_G1", "RESIZE_90"],
    ["JPEG70", "NOISE_G10", "COMBINED_MOD"],
    ["JPEG50", "COMBINED_STRONG", "CROP_90", "ROT_2"],
]


def apply_attack(img: Image.Image, name: str) -> Image.Image:
    fn = ATTACKS.get(name)
    if fn is None:
        raise ValueError(f"Unknown attack: {name}")
    return fn(img)
