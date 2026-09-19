"""Load models from model_registry.json with a uniform interface."""
from __future__ import annotations
import importlib
import json
import sys
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_registry(path: str = None) -> dict:
    p = Path(path or ROOT / "models" / "model_registry.json")
    return json.loads(p.read_text())


def instantiate_models(device: str = "cpu") -> List:
    reg = load_registry()
    models = []
    for entry in reg["models"]:
        try:
            mod = importlib.import_module(entry["module"])
            cls = getattr(mod, entry["class"])
            weights = entry.get("weights")
            if weights:
                wp = str(ROOT / weights) if not Path(weights).is_absolute() else weights
            else:
                wp = None
            inst = cls(weights_path=wp, device=device)
            ok = inst.load()
            inst._registry_status = entry.get("status", "UNKNOWN")
            inst._ready_flag = ok
            models.append(inst)
            print(f"  [OK] {entry['name']}  status={entry.get('status')}  ready={ok}")
        except Exception as e:
            print(f"  [FAIL] {entry['id']}: {e}")
            # placeholder failed model
            from models.base import BaseStegoModel, EncodeResult, DecodeResult

            class Failed(BaseStegoModel):
                model_id = entry["id"]
                model_name = entry["name"]
                status = "NOT AVAILABLE"

                def load(self):
                    return False

                def encode(self, cover, secret, password="benchmark"):
                    return EncodeResult(stego=None, status="FAILED", error=str(e))

                def decode(self, stego, password="benchmark"):
                    return DecodeResult(secret="", status="FAILED", error=str(e))

            models.append(Failed())
    return models
