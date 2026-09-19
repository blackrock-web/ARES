"""
Invertible Neural Network stack for ARES-Hybrid-INN.

Each InvertibleBlock = ActNorm-like + AffineCoupling (+ optional channel permute).
The full InvertibleNetwork stacks several blocks and supports exact inverse.
"""
from __future__ import annotations

import torch
import torch.nn as nn

from .coupling import AffineCoupling, AdditiveCoupling


class ChannelPermute(nn.Module):
    """Fixed random channel permutation (bijective)."""

    def __init__(self, channels: int):
        super().__init__()
        perm = torch.randperm(channels)
        inv = torch.argsort(perm)
        self.register_buffer("perm", perm)
        self.register_buffer("inv", inv)

    def forward(self, x: torch.Tensor, reverse: bool = False):
        if reverse:
            return x[:, self.inv], x.new_zeros(x.shape[0])
        return x[:, self.perm], x.new_zeros(x.shape[0])


class InvertibleBlock(nn.Module):
    def __init__(
        self,
        channels: int,
        hidden: int = 64,
        coupling: str = "affine",
        clamp: float = 2.0,
    ):
        super().__init__()
        self.permute = ChannelPermute(channels)
        if coupling == "affine":
            self.coupling = AffineCoupling(channels, hidden=hidden, clamp=clamp)
        else:
            self.coupling = AdditiveCoupling(channels, hidden=hidden)

    def forward(self, x: torch.Tensor, reverse: bool = False):
        if not reverse:
            x, ld1 = self.permute(x, reverse=False)
            x, ld2 = self.coupling(x, reverse=False)
            return x, ld1 + ld2
        else:
            x, ld2 = self.coupling(x, reverse=True)
            x, ld1 = self.permute(x, reverse=True)
            return x, ld1 + ld2


class InvertibleNetwork(nn.Module):
    """
    Stack of invertible blocks.
    Input/output channels must match (information-preserving).
    """

    def __init__(
        self,
        channels: int = 8,
        n_blocks: int = 4,
        hidden: int = 64,
        coupling: str = "affine",
        clamp: float = 2.0,
    ):
        super().__init__()
        self.channels = channels
        self.blocks = nn.ModuleList(
            [
                InvertibleBlock(channels, hidden=hidden, coupling=coupling, clamp=clamp)
                for _ in range(n_blocks)
            ]
        )

    def forward(self, x: torch.Tensor, reverse: bool = False):
        log_det = x.new_zeros(x.shape[0])
        if not reverse:
            for blk in self.blocks:
                x, ld = blk(x, reverse=False)
                log_det = log_det + ld
        else:
            for blk in reversed(self.blocks):
                x, ld = blk(x, reverse=True)
                log_det = log_det + ld
        return x, log_det

    def inverse(self, y: torch.Tensor):
        return self.forward(y, reverse=True)
