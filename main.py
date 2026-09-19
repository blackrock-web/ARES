#!/usr/bin/env python3
"""ARES-Upgraded entry point — research validation CLI."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def cmd_benchmark(args):
    from benchmark.runner import run_benchmark
    from PIL import Image

    images = None
    if args.images:
        images = [Image.open(p).convert("RGB") for p in args.images]
    result = run_benchmark(images=images, secret=args.secret)
    print("Done. Results at:", result["out_dir"])
    summary = result["summary"]
    print("Best measured model:", summary.get("best_measured_model"))
    print("Score:", summary.get("best_score"))


def cmd_benchmark_research(args):
    from datasets.protocol import build_manifest
    from evaluation.research_benchmark import run_research_benchmark, run_multi_resolution

    build_manifest()
    if getattr(args, "full", False) or (getattr(args, "resolutions", None) and len(args.resolutions) > 1):
        res_list = args.resolutions or [128, 256, 512]
        run_multi_resolution(
            resolutions=res_list,
            n_images=args.n_images,
            split=args.split,
            category=args.category,
        )
    else:
        run_research_benchmark(
            split=args.split,
            resolution=args.resolution,
            n_images=args.n_images,
            category=args.category,
        )


def cmd_analyze(args):
    from evaluation.analyze_results import analyze
    from pathlib import Path as P

    analyze(P(args.run) if args.run else None)


def cmd_report(args):
    from evaluation.generate_report import generate
    from pathlib import Path as P

    generate(P(args.run) if args.run else None)


def cmd_list_models(args):
    from benchmark.registry import load_registry

    for m in load_registry()["models"]:
        print(f"{m['id']:20s}  {m['name']:40s}  status={m['status']}")


def cmd_ui(args):
    from app.ui_dashboard import build_ui

    demo = build_ui()
    demo.launch(server_name="0.0.0.0", server_port=args.port, share=False)


def cmd_dataset(args):
    from datasets.protocol import build_manifest, dataset_availability
    import json

    man = build_manifest()
    print(json.dumps({
        "availability": dataset_availability(),
        "counts": man["counts"],
        "leakage_passed": man["leakage_check"]["passed"],
    }, indent=2))


def main():
    p = argparse.ArgumentParser(description="ARES-Upgraded research platform")
    sub = p.add_subparsers(dest="cmd")

    b = sub.add_parser("benchmark", help="Legacy multi-model UI benchmark")
    b.add_argument("--images", nargs="*")
    b.add_argument("--secret", default=None)
    b.set_defaults(func=cmd_benchmark)

    br = sub.add_parser(
        "benchmark-research",
        help="Full research validation (5 models, per-image metrics, generalization)",
    )
    br.add_argument("--split", default="test", choices=["test", "validation", "cross_domain"])
    br.add_argument("--resolution", type=int, default=256)
    br.add_argument("--resolutions", type=int, nargs="*", default=None)
    br.add_argument("--n-images", type=int, default=15)
    br.add_argument(
        "--category",
        default="FINAL_TEST",
        choices=["PILOT", "VALIDATION", "FINAL_TEST", "CROSS_DOMAIN"],
    )
    br.add_argument("--full", action="store_true", help="Run 128/256/512")
    br.set_defaults(func=cmd_benchmark_research)

    bf = sub.add_parser("benchmark-full", help="Research benchmark at 128/256/512")
    bf.add_argument("--n-images", type=int, default=10)
    bf.add_argument("--split", default="test")
    bf.add_argument("--category", default="FINAL_TEST")

    def _full(a):
        a.full = True
        a.resolution = 256
        a.resolutions = [128, 256, 512]
        cmd_benchmark_research(a)

    bf.set_defaults(func=_full)

    an = sub.add_parser("analyze-results", help="Print PSNR generalization from latest run")
    an.add_argument("--run", default=None)
    an.set_defaults(func=cmd_analyze)

    rp = sub.add_parser("generate-report", help="Write markdown research report")
    rp.add_argument("--run", default=None)
    rp.set_defaults(func=cmd_report)

    ds = sub.add_parser("dataset-status", help="Build manifest + show availability")
    ds.set_defaults(func=cmd_dataset)

    l = sub.add_parser("list-models")
    l.set_defaults(func=cmd_list_models)

    u = sub.add_parser("ui", help="Launch Gradio live dashboard")
    u.add_argument("--port", type=int, default=7860)
    u.set_defaults(func=cmd_ui)

    args = p.parse_args()
    if not args.cmd:
        p.print_help()
        return
    args.func(args)


if __name__ == "__main__":
    main()
