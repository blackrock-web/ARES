"""
Genuine invertible coupling layers.

Affine coupling (RealNVP-style):
  x1, x2 = split(x)
  y1 = x1
  s, t = NN(x1)
  y2 = x2 * exp(clamp(s)) + t

Inverse is exact:
  x1 = y1
  s, t = NN(x1)
  x2 = (y2 - t) * exp(-clamp(s))
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


def _clamp_log_scale(s: torch.Tensor, clamp: float = 2.0) -> torch.Tensor:
    """Bound log-scale for numerical stability (no unbounded exp)."""
    return clamp * torch.tanh(s / clamp)


class _CouplingNet(nn.Module):
    """Small residual CNN used inside coupling transforms."""

    def __init__(self, channels: int, hidden: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(channels, hidden, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden, hidden, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden, channels * 2, 3, padding=1),  # scale + translate
        )
        # zero-init last layer so transform starts near identity
        nn.init.zeros_(self.net[-1].weight)
        nn.init.zeros_(self.net[-1].bias)

    def forward(self, x: torch.Tensor):
        out = self.net(x)
        s, t = out.chunk(2, dim=1)
        return s, t


class AffineCoupling(nn.Module):
    """
    Affine coupling split along channel dimension.
    Channels must be even.
    """

    def __init__(self, channels: int, hidden: int = 64, clamp: float = 2.0):
        super().__init__()
        assert channels % 2 == 0, "channels must be even for channel-split coupling"
        self.channels = channels
        self.half = channels // 2
        self.clamp = clamp
        self.net = _CouplingNet(self.half, hidden)

    def forward(self, x: torch.Tensor, reverse: bool = False):
        x1, x2 = x[:, : self.half], x[:, self.half :]
        if not reverse:
            s, t = self.net(x1)
            s = _clamp_log_scale(s, self.clamp)
            y2 = x2 * torch.exp(s) + t
            y1 = x1
            log_det = s.flatten(1).sum(dim=1)
            return torch.cat([y1, y2], dim=1), log_det
        else:
            s, t = self.net(x1)
            s = _clamp_log_scale(s, self.clamp)
            y1 = x1
            y2 = (x2 - t) * torch.exp(-s)
            log_det = -s.flatten(1).sum(dim=1)
            return torch.cat([y1, y2], dim=1), log_det


class AdditiveCoupling(nn.Module):
    """
    Additive coupling (simpler, volume-preserving):
      y1 = x1
      y2 = x2 + F(x1)
    """

    def __init__(self, channels: int, hidden: int = 64):
        super().__init__()
        assert channels % 2 == 0
        self.half = channels // 2
        self.net = nn.Sequential(
            nn.Conv2d(self.half, hidden, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden, hidden, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden, self.half, 3, padding=1),
        )
        nn.init.zeros_(self.net[-1].weight)
        nn.init.zeros_(self.net[-1].bias)

    def forward(self, x: torch.Tensor, reverse: bool = False):
        x1, x2 = x[:, : self.half], x[:, self.half :]
        t = self.net(x1)
        if not reverse:
            y2 = x2 + t
            log_det = x.new_zeros(x.shape[0])
            return torch.cat([x1, y2], dim=1), log_det
        else:
            y2 = x2 - t
            log_det = x.new_zeros(x.shape[0])
            return torch.cat([x1, y2], dim=1), log_det
