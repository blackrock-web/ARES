"""Unified model interface for fair benchmarking."""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
from PIL import Image
import time


@dataclass
class EncodeResult:
    stego: Image.Image
    meta: Dict[str, Any] = field(default_factory=dict)
    encode_time_ms: float = 0.0
    payload_bits: int = 0
    capacity_bits: int = 0
    status: str = "ok"
    error: Optional[str] = None


@dataclass
class DecodeResult:
    secret: str
    decode_time_ms: float = 0.0
    status: str = "ok"
    error: Optional[str] = None
    bit_accuracy: float = 0.0


class BaseStegoModel(ABC):
    model_id: str = "base"
    model_name: str = "Base"
    status: str = "NOT AVAILABLE"

    def __init__(self, weights_path: Optional[str] = None, device: str = "cpu"):
        self.weights_path = weights_path
        self.device = device
        self.ready = False

    @abstractmethod
    def load(self) -> bool:
        ...

    @abstractmethod
    def encode(self, cover: Image.Image, secret: str, password: str = "benchmark") -> EncodeResult:
        ...

    @abstractmethod
    def decode(self, stego: Image.Image, password: str = "benchmark") -> DecodeResult:
        ...

    def evaluate(self, cover: Image.Image, secret: str, password: str = "benchmark") -> Dict[str, Any]:
        """Encode + decode + return raw timing/payload info (metrics computed externally)."""
        er = self.encode(cover, secret, password)
        if er.status != "ok" or er.stego is None:
            return {
                "model_id": self.model_id,
                "status": "FAILED",
                "error": er.error or "encode failed",
                "encode_time_ms": er.encode_time_ms,
            }
        dr = self.decode(er.stego, password)
        recovery_ok = (dr.status == "ok" and dr.secret == secret)
        # bit accuracy approximation
        if recovery_ok:
            bit_acc = 100.0
        elif dr.secret:
            # character-level fallback
            n = min(len(dr.secret), len(secret))
            match = sum(1 for i in range(n) if dr.secret[i] == secret[i])
            bit_acc = 100.0 * match / max(len(secret), 1)
        else:
            bit_acc = 0.0
        return {
            "model_id": self.model_id,
            "model_name": self.model_name,
            "status": "ok",
            "stego": er.stego,
            "recovered": dr.secret,
            "recovery_ok": recovery_ok,
            "secret_recovery_accuracy": bit_acc,
            "payload_bits": er.payload_bits,
            "capacity_bits": er.capacity_bits,
            "encode_time_ms": er.encode_time_ms,
            "decode_time_ms": dr.decode_time_ms,
            "total_time_ms": er.encode_time_ms + dr.decode_time_ms,
            "meta": er.meta,
        }
