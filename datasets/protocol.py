"""
Strict dataset protocol: roles, hashing, leakage prevention.
Real datasets (COCO/DIV2K/CelebA/BOSSBase) are used when present under datasets/.
Otherwise a synthetic research set is generated and labeled SYNTHETIC_PILOT.
"""
from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "datasets"


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def sha256_image_array(arr: np.ndarray) -> str:
    return hashlib.sha256(arr.tobytes()).hexdigest()


def scan_image_dir(folder: Path) -> List[Path]:
    if not folder.exists():
        return []
    exts = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in exts)


def dataset_availability() -> Dict[str, dict]:
    """Report which real datasets are present."""
    status = {}
    for name, sub in [
        ("coco", "coco"),
        ("div2k", "div2k"),
        ("celeba", "celeba"),
        ("bossbase", "bossbase"),
    ]:
        paths = scan_image_dir(DATA_ROOT / sub)
        status[name] = {
            "available": len(paths) > 0,
            "n_images": len(paths),
            "path": str(DATA_ROOT / sub),
            "reason": None if paths else "not found under datasets/" + sub,
        }
    # CelebA Google Drive quota note
    if not status["celeba"]["available"]:
        status["celeba"]["reason"] = (
            "UNAVAILABLE — place images under datasets/celeba/ "
            "(Google Drive quota may block automatic download)"
        )
        status["celeba"]["status_label"] = "UNAVAILABLE"
    return status


def make_synthetic_split(
    n_train: int = 40,
    n_val: int = 10,
    n_test: int = 20,
    size: int = 256,
    seed: int = 42,
) -> Dict[str, List[dict]]:
    """Deterministic synthetic textured covers for pilot / offline research."""
    rng = np.random.RandomState(seed)
    out_dir = DATA_ROOT / "synthetic"
    out_dir.mkdir(parents=True, exist_ok=True)
    splits = {"train": [], "validation": [], "test": [], "cross_domain": []}
    counts = {"train": n_train, "validation": n_val, "test": n_test, "cross_domain": 10}
    bases = [(90, 110, 140), (120, 80, 60), (60, 100, 80), (140, 100, 120), (80, 90, 110)]

    idx = 0
    for split, n in counts.items():
        for i in range(n):
            base = bases[idx % len(bases)]
            arr = np.array(Image.new("RGB", (size, size), color=base), dtype=np.int16)
            local_rng = np.random.RandomState(seed + idx * 17)
            for scale, amp in [(1, 40), (4, 20), (16, 12)]:
                noise = local_rng.randint(-amp, amp + 1, (max(1, size // scale), max(1, size // scale), 3))
                noise = np.repeat(np.repeat(noise, scale, axis=0), scale, axis=1)[:size, :size]
                arr = arr + noise
            arr = np.clip(arr, 0, 255).astype(np.uint8)
            path = out_dir / f"{split}_{idx:04d}.png"
            Image.fromarray(arr).save(path)
            digest = sha256_image_array(arr)
            splits[split].append({
                "image_path": str(path.relative_to(ROOT)),
                "dataset": "synthetic",
                "split": split,
                "sha256": digest,
                "resolution": [size, size],
                "image_id": f"syn_{idx:04d}",
            })
            idx += 1
    return splits


def build_manifest(
    seed: int = 42,
    prefer_real: bool = True,
) -> dict:
    """
    Build dataset_manifest.json with train/val/test/cross_domain.
    Real images used if present; otherwise synthetic.
    """
    avail = dataset_availability()
    entries: List[dict] = []
    source = "synthetic"

    real_pool: List[Tuple[str, Path]] = []
    if prefer_real:
        for ds in ("coco", "div2k"):
            if avail[ds]["available"]:
                for p in scan_image_dir(DATA_ROOT / ds):
                    real_pool.append((ds, p))

    if real_pool:
        source = "real+optional_synthetic"
        rng = random.Random(seed)
        rng.shuffle(real_pool)
        n = len(real_pool)
        n_train = max(1, int(0.7 * n))
        n_val = max(1, int(0.15 * n))
        # rest test
        for i, (ds, p) in enumerate(real_pool):
            if i < n_train:
                split = "train"
            elif i < n_train + n_val:
                split = "validation"
            else:
                split = "test"
            try:
                im = Image.open(p).convert("RGB")
                arr = np.asarray(im)
                digest = sha256_file(p)
                entries.append({
                    "image_path": str(p.relative_to(ROOT)) if str(p).startswith(str(ROOT)) else str(p),
                    "dataset": ds,
                    "split": split,
                    "sha256": digest,
                    "resolution": [im.size[0], im.size[1]],
                    "image_id": f"{ds}_{i:05d}",
                })
            except Exception:
                continue
        # cross-domain
        for ds in ("celeba", "bossbase"):
            if avail[ds]["available"]:
                for j, p in enumerate(scan_image_dir(DATA_ROOT / ds)[:50]):
                    try:
                        im = Image.open(p).convert("RGB")
                        entries.append({
                            "image_path": str(p),
                            "dataset": ds,
                            "split": "cross_domain",
                            "sha256": sha256_file(p),
                            "resolution": [im.size[0], im.size[1]],
                            "image_id": f"{ds}_cd_{j:04d}",
                        })
                    except Exception:
                        pass
            else:
                # record unavailable
                pass
    else:
        syn = make_synthetic_split(seed=seed)
        for split, items in syn.items():
            entries.extend(items)

    # leakage check
    by_split: Dict[str, set] = {}
    for e in entries:
        by_split.setdefault(e["split"], set()).add(e["sha256"])

    leaks = []
    pairs = [("train", "validation"), ("train", "test"), ("validation", "test")]
    for a, b in pairs:
        inter = by_split.get(a, set()) & by_split.get(b, set())
        if inter:
            leaks.append({"splits": [a, b], "n_overlap": len(inter), "hashes": list(inter)[:5]})

    manifest = {
        "created": datetime.utcnow().isoformat() + "Z",
        "source": source,
        "availability": avail,
        "n_entries": len(entries),
        "counts": {s: len(by_split.get(s, [])) for s in ("train", "validation", "test", "cross_domain")},
        "leakage_check": {
            "passed": len(leaks) == 0,
            "overlaps": leaks,
        },
        "entries": entries,
        "celeba_status": avail.get("celeba", {}),
        "bossbase_status": avail.get("bossbase", {}),
    }
    out = DATA_ROOT / "dataset_manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2))
    return manifest


def load_manifest() -> dict:
    p = DATA_ROOT / "dataset_manifest.json"
    if not p.exists():
        return build_manifest()
    return json.loads(p.read_text())


def get_split_images(split: str = "test", limit: Optional[int] = None) -> List[dict]:
    man = load_manifest()
    if not man.get("leakage_check", {}).get("passed", True):
        raise RuntimeError(
            "DATASET LEAKAGE DETECTED — refusing to run benchmark. "
            f"Overlaps: {man['leakage_check']['overlaps']}"
        )
    items = [e for e in man["entries"] if e["split"] == split]
    if limit is not None:
        items = items[:limit]
    return items


def load_cover(entry: dict, size: int) -> Image.Image:
    path = ROOT / entry["image_path"]
    if not path.exists():
        path = Path(entry["image_path"])
    im = Image.open(path).convert("RGB")
    return im.resize((size, size), Image.BILINEAR)
