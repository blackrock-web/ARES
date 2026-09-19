"""
Pilot / full training for ARES-Hybrid-INN.

Preserves existing ARES checkpoints. Writes to:
  models/hybrid/ares_hybrid_inn.pt
  models/hybrid/ares_hybrid_inn_best.pt
  models/hybrid/ares_hybrid_inn_latest.pt
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.hybrid.ares_hybrid_inn import ARESHybridINN, DEVICE
from models.upgraded.ares_upgraded import compute_attention_map
from embedding.minimum_lsb import soft_lsb_approx


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class SimpleImageFolder(Dataset):
    def __init__(self, paths: List[Path], size: int = 128):
        self.paths = [p for p in paths if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".bmp")]
        self.size = size

    def __len__(self):
        return max(1, len(self.paths))

    def __getitem__(self, idx):
        if not self.paths:
            # synthetic fallback for pilot without dataset
            arr = np.random.randint(0, 256, (self.size, self.size, 3), dtype=np.uint8)
            img = Image.fromarray(arr)
        else:
            img = Image.open(self.paths[idx % len(self.paths)]).convert("RGB")
            img = img.resize((self.size, self.size), Image.BILINEAR)
        arr = np.asarray(img, dtype=np.float32) / 255.0
        gray = (arr.mean(axis=2) * 255).astype(np.uint8)
        att = compute_attention_map(gray)
        cover_att = np.concatenate([arr.transpose(2, 0, 1), att[None, ...]], 0)
        return (
            torch.from_numpy(cover_att).float(),
            torch.from_numpy(arr.transpose(2, 0, 1)).float(),
        )


def ssim_loss(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    C1, C2 = 0.01 ** 2, 0.03 ** 2
    mu_x = F.avg_pool2d(x, 3, 1, 1)
    mu_y = F.avg_pool2d(y, 3, 1, 1)
    sigma_x = F.avg_pool2d(x ** 2, 3, 1, 1) - mu_x ** 2
    sigma_y = F.avg_pool2d(y ** 2, 3, 1, 1) - mu_y ** 2
    sigma_xy = F.avg_pool2d(x * y, 3, 1, 1) - mu_x * mu_y
    ssim_map = ((2 * mu_x * mu_y + C1) * (2 * sigma_xy + C2)) / (
        (mu_x ** 2 + mu_y ** 2 + C1) * (sigma_x + sigma_y + C2) + 1e-8
    )
    return 1 - ssim_map.mean()


def train_one_epoch(model, loader, opt, device, lambdas, epoch: int):
    model.train()
    totals = {k: 0.0 for k in ("loss", "mse", "l1", "ssim", "res", "secret")}
    n = 0
    for cover_att, cover in loader:
        cover_att = cover_att.to(device)
        cover = cover.to(device)
        B = cover.shape[0]
        rate = torch.rand(B, 1, device=device) * 0.5 + 0.05  # 0.05–0.55 bpp

        residual, mask, alphas, z, log_det = model(cover_att, rate)
        # soft residual embedding (training proxy)
        stego = soft_lsb_approx(cover, residual.expand_as(cover[:, :1]).repeat(1, 3, 1, 1) * 0.1,
                                mask.expand_as(cover[:, :1]).repeat(1, 3, 1, 1), strength=0.5)
        # bias residual toward blue channel only for realism
        delta = (0.5 * mask * residual).clamp(-0.05, 0.05)
        stego = cover.clone()
        stego[:, 2:3] = (cover[:, 2:3] + delta).clamp(0, 1)

        L_mse = F.mse_loss(stego, cover)
        L_l1 = F.l1_loss(stego, cover)
        L_ssim = ssim_loss(stego, cover)
        L_res = residual.abs().mean() + (residual ** 2).mean()
        # secret soft map: encourage decoder to see structure
        soft_bits = model.decode_soft(stego)
        target_bits = (cover[:, 2:3] * 0 + 0.5)  # neutral prior
        L_secret = F.mse_loss(soft_bits, target_bits)

        loss = (
            lambdas["mse"] * L_mse
            + lambdas["l1"] * L_l1
            + lambdas["ssim"] * L_ssim
            + lambdas["residual"] * L_res
            + lambdas["secret"] * L_secret
        )
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()

        totals["loss"] += float(loss.item())
        totals["mse"] += float(L_mse.item())
        totals["l1"] += float(L_l1.item())
        totals["ssim"] += float(L_ssim.item())
        totals["res"] += float(L_res.item())
        totals["secret"] += float(L_secret.item())
        n += 1
    return {k: v / max(1, n) for k, v in totals.items()}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pilot", action="store_true")
    p.add_argument("--epochs", type=int, default=3)
    p.add_argument("--size", type=int, default=64)
    p.add_argument("--batch", type=int, default=4)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--data", type=str, default="")
    p.add_argument("--out", type=str, default=str(ROOT / "models" / "hybrid"))
    args = p.parse_args()

    set_seed(42)
    device = DEVICE
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    paths: List[Path] = []
    if args.data:
        paths = list(Path(args.data).rglob("*"))

    ds = SimpleImageFolder(paths, size=args.size)
    # for pilot without images, synthetic works
    loader = DataLoader(ds, batch_size=args.batch, shuffle=True, num_workers=0)

    model = ARESHybridINN(base=24, inn_channels=8, n_inn_blocks=3).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    lambdas = {
        "mse": 10.0,
        "l1": 5.0,
        "ssim": 2.0,
        "residual": 1.0,
        "secret": 0.1,
    }

    best_loss = float("inf")
    history = []
    epochs = args.epochs if not args.pilot else min(args.epochs, 3)

    print(f"Training ARES-Hybrid-INN on {device}, epochs={epochs}, samples={len(ds)}")
    for ep in range(1, epochs + 1):
        t0 = time.time()
        stats = train_one_epoch(model, loader, opt, device, lambdas, ep)
        dt = time.time() - t0
        # PSNR proxy from MSE on [0,1]
        mse_v = stats["mse"]
        psnr_proxy = 99.0 if mse_v < 1e-12 else 10 * math.log10(1.0 / mse_v)
        print(
            f"epoch {ep}/{epochs}  loss={stats['loss']:.6f}  "
            f"mse={mse_v:.6e}  psnr_proxy={psnr_proxy:.2f}  "
            f"ssim_loss={stats['ssim']:.4f}  time={dt:.1f}s"
        )
        history.append({"epoch": ep, **stats, "psnr_proxy": psnr_proxy})

        ckpt = {
            "model": model.state_dict(),
            "optimizer": opt.state_dict(),
            "epoch": ep,
            "stats": stats,
            "config": {"base": 24, "inn_channels": 8, "n_inn_blocks": 3},
        }
        torch.save(ckpt, out_dir / "ares_hybrid_inn_latest.pt")
        if stats["loss"] < best_loss:
            best_loss = stats["loss"]
            torch.save(ckpt, out_dir / "ares_hybrid_inn_best.pt")
            torch.save(ckpt, out_dir / "ares_hybrid_inn.pt")

    with open(out_dir / "train_history.json", "w") as f:
        json.dump(history, f, indent=2)
    print("Saved checkpoints to", out_dir)


if __name__ == "__main__":
    main()
