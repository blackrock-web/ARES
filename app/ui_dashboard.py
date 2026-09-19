#!/usr/bin/env python3
"""
ARES-Upgraded — Live research dashboard (Gradio)

Tabs:
  1. Live Compare  — one image, all models, true-positive only, best model
  2. Full Benchmark — multi-image batch comparison
  3. Models
  4. Latest Results
  5. How to run
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
from PIL import Image

try:
    import gradio as gr
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "gradio"])
    import gradio as gr

from benchmark.runner import run_benchmark, make_sample_covers
from benchmark.registry import load_registry
from app.live_compare import live_compare


def _load_latest_summary():
    results = sorted((ROOT / "results").glob("run_*/summary.json"))
    if not results:
        return None, None
    p = results[-1]
    return json.loads(p.read_text()), p.parent


def run_live(cover, secret, size, only_tp, progress=gr.Progress()):
    progress(0.05, desc="Loading models…")
    size = int(size or 256)
    out = live_compare(
        cover,
        secret or "ARES live benchmark secret",
        password="benchmark",
        image_size=size,
        only_true_positive=bool(only_tp),
    )
    progress(1.0, desc="Done")
    return (
        out["banner"],
        out["rows"],
        out["stego_gallery"],
        out["residual_gallery"],
        out["fail_md"],
        out["best_name"],
    )


def run_full_comparison(img1, img2, img3, img4, img5, secret_text, progress=gr.Progress()):
    progress(0.05, desc="Preparing images…")
    images = []
    for im in [img1, img2, img3, img4, img5]:
        if im is not None:
            if isinstance(im, np.ndarray):
                images.append(Image.fromarray(im.astype(np.uint8)).convert("RGB"))
            elif isinstance(im, Image.Image):
                images.append(im.convert("RGB"))
            else:
                images.append(Image.open(im).convert("RGB"))
    if not images:
        images = make_sample_covers(5, 256, 42)
        status_note = "No images uploaded — using 5 synthetic textured covers."
    else:
        while len(images) < 5:
            images.append(images[-1].copy())
        images = images[:5]
        status_note = f"Using {len(images)} uploaded cover(s)."

    secret = (secret_text or "").strip() or None
    progress(0.15, desc="Running multi-model benchmark…")
    result = run_benchmark(images=images, secret=secret)
    progress(0.9, desc="Formatting…")

    summary = result["summary"]
    ranked = summary.get("ranked") or []
    best = summary.get("best_measured_model", "N/A")
    score = summary.get("best_score")

    # Keep only rows with true recovery when available
    rows = []
    for r in ranked:
        rec = r.get("Secret_Recovery_Accuracy", 0) or 0
        rows.append([
            r.get("rank"),
            r.get("model_name"),
            r.get("overall_score"),
            round(r.get("PSNR", 0) or 0, 2),
            round(r.get("SSIM", 0) or 0, 4),
            round(rec, 1),
            "TRUE +" if rec >= 99.9 else "NO",
            round(r.get("Robustness", 0) or 0, 1),
            round(r.get("Inference_Time_ms", 0) or 0, 1),
            r.get("security_gate"),
        ])

    banner = (
        f"### Best measured model (this run)\n\n"
        f"## **{best}**\n\n"
        f"**Overall score:** `{score}`\n\n"
        f"{status_note}\n\n"
        f"Results: `{result['out_dir']}`"
    )

    stego_paths = list(Path(result["out_dir"]).glob("images/stego_img1_*.png"))
    cover_paths = list(Path(result["out_dir"]).glob("images/cover_1.png"))
    vis = []
    if cover_paths:
        vis.append((Image.open(cover_paths[0]), "COVER"))
    for sp in sorted(stego_paths)[:8]:
        vis.append((Image.open(sp), sp.stem))

    progress(1.0, desc="Done")
    return banner, rows, vis, str(result["out_dir"])


def show_models():
    reg = load_registry()
    lines = [
        "| ID | Name | Status | Type |",
        "|----|------|--------|------|",
    ]
    for m in reg["models"]:
        lines.append(
            f"| `{m['id']}` | **{m['name']}** | {m['status']} | {m.get('type', '—')} |"
        )
    return "\n".join(lines)


def show_latest():
    summary, folder = _load_latest_summary()
    if not summary:
        return "No benchmark runs yet.", []
    ranked = summary.get("ranked") or []
    best = summary.get("best_measured_model")
    banner = (
        f"### Latest run: `{summary.get('run_id')}`\n\n"
        f"**Best measured model:** **{best}**  \n"
        f"**Score:** `{summary.get('best_score')}`"
    )
    rows = []
    for r in ranked:
        rec = r.get("Secret_Recovery_Accuracy", 0) or 0
        rows.append([
            r.get("rank"),
            r.get("model_name"),
            round(r.get("PSNR", 0) or 0, 2),
            round(rec, 1),
            "TRUE +" if rec >= 99.9 else "NO",
            r.get("security_gate"),
        ])
    return banner, rows


def build_ui():
    with gr.Blocks(title="ARES-Upgraded Live Benchmark", theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            """
# ARES-Upgraded — Live Benchmark UI
Compare **all models** (paper baselines + **ARES-Upgraded** + **ARES-Hybrid-INN**) on your image.

- **True positive only**: exact secret recovery required to appear in the ranking  
- **Best model** = highest PSNR among true positives (then SSIM, then speed)
            """
        )

        with gr.Tab("Live Compare (1 image)"):
            with gr.Row():
                with gr.Column(scale=1):
                    cover_in = gr.Image(label="Cover image (choose file)", type="pil")
                    secret_in = gr.Textbox(
                        label="Secret message",
                        value="ARES live benchmark secret",
                        lines=2,
                    )
                    size_in = gr.Dropdown(
                        choices=[128, 256, 384, 512],
                        value=256,
                        label="Resize to (fair size)",
                    )
                    only_tp = gr.Checkbox(
                        value=True,
                        label="Show only TRUE POSITIVE recoveries (exact secret match)",
                    )
                    btn_live = gr.Button("RUN LIVE COMPARISON", variant="primary")
                    best_box = gr.Textbox(label="Best model (true positive)", interactive=False)
                with gr.Column(scale=2):
                    banner = gr.Markdown()
                    table = gr.Dataframe(
                        headers=[
                            "Model", "Status", "PSNR ↑", "SSIM ↑", "MSE ↓", "MS-SSIM ↑",
                            "BPP", "True Positive", "Time (ms)", "LSB change %",
                        ],
                        label="Results (true positives only when box checked)",
                        interactive=False,
                    )
            stego_gal = gr.Gallery(label="Cover + Stego outputs", columns=4, height=320)
            res_gal = gr.Gallery(label="Amplified residual maps (display only)", columns=4, height=240)
            fail_md = gr.Markdown()

            btn_live.click(
                run_live,
                inputs=[cover_in, secret_in, size_in, only_tp],
                outputs=[banner, table, stego_gal, res_gal, fail_md, best_box],
            )

        with gr.Tab("Full Benchmark (5 images)"):
            gr.Markdown("Upload up to **5 covers** (optional). Runs the full batch benchmark.")
            with gr.Row():
                i1 = gr.Image(label="Image 1", type="pil")
                i2 = gr.Image(label="Image 2", type="pil")
                i3 = gr.Image(label="Image 3", type="pil")
            with gr.Row():
                i4 = gr.Image(label="Image 4", type="pil")
                i5 = gr.Image(label="Image 5", type="pil")
            secret = gr.Textbox(label="Secret payload", value="ARES-Q secure payload v1.", lines=2)
            btn = gr.Button("RUN FULL BENCHMARK", variant="primary")
            banner2 = gr.Markdown()
            table2 = gr.Dataframe(
                headers=[
                    "Rank", "Model", "Score", "PSNR", "SSIM", "Recovery%",
                    "True Positive", "Robustness%", "Time(ms)", "Sec.Gate",
                ],
                interactive=False,
            )
            gallery2 = gr.Gallery(label="Cover + stegos (image 1)", columns=4, height=280)
            out_dir = gr.Textbox(label="Results directory", interactive=False)
            btn.click(
                run_full_comparison,
                inputs=[i1, i2, i3, i4, i5, secret],
                outputs=[banner2, table2, gallery2, out_dir],
            )

        with gr.Tab("Models"):
            gr.Markdown(show_models())
            gr.Markdown(
                """
**Status**
- `PROPOSED` / `TRAINED` — our models (ARES-Hybrid-INN, ARES-Upgraded)
- `REPRODUCED` — paper baselines (may be partial if authors did not release weights)
                """
            )

        with gr.Tab("Latest Results"):
            refresh = gr.Button("Refresh")
            latest_md = gr.Markdown()
            latest_tbl = gr.Dataframe(
                headers=["Rank", "Model", "PSNR", "Recovery%", "True Positive", "Sec.Gate"],
                interactive=False,
            )

            def _latest():
                return show_latest()

            refresh.click(_latest, outputs=[latest_md, latest_tbl])
            demo.load(_latest, outputs=[latest_md, latest_tbl])

        with gr.Tab("How to run"):
            gr.Markdown(
                """
### Linux / macOS
```bash
cd ARES-Upgraded
chmod +x run_linux.sh
./run_linux.sh
# or UI only:
./run_linux.sh ui
# or CLI benchmark:
./run_linux.sh benchmark
```

### Windows
```bat
cd ARES-Upgraded
run_windows.bat
run_windows.bat ui
run_windows.bat benchmark
```

### Manual
```bash
pip install -r requirements.txt
python main.py ui          # opens http://127.0.0.1:7860
python main.py benchmark
python main.py list-models
```

### Ranking rule (Live Compare)
1. Model must recover the **exact** secret (true positive)  
2. Highest **PSNR** wins  
3. Tie-break: higher SSIM, then lower time  
                """
            )

    return demo


if __name__ == "__main__":
    demo = build_ui()
    demo.launch(server_name="0.0.0.0", server_port=7860, share=False)
