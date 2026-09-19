# ARES-Upgraded

Research-grade **universal-condition** image steganography framework.

## Scientific objective

Minimize distortion \(D(C,S)\) subject to recovery, robustness, payload and security constraints.
Do **not** claim universal superiority. Report measured configurations only.

## Current measured pilot (CPU, synthetic)

| Configuration              | PSNR (approx) | Recovery | Notes                          |
|----------------------------|---------------|----------|--------------------------------|
| Classical residual         | ~64–75 dB*    | 100%     | Depends on payload & texture   |
| ARES-Upgraded + CNN residual (3-epoch pilot) | similar on random noise | 100% | Full training required on real data |
| Legacy ARES HEADER_REP3    | ~73.5 dB      | 100%     | Low robustness                 |
| Legacy ARES FULL_REP3      | ~69–70 dB     | 100%     | ~14% soft-attack robustness    |

\*PSNR is highly payload- and image-dependent; always re-measure on the target test set.

## Architecture

### ARES-Upgraded (v4) — preserved
- Multi-scale residual encoder with **payload-rate conditioning**
- Learned spatial embedding mask + channel alphas
- Texture-aware adaptive LSB order (R+G stable under blue embedding)
- ECC modes: NONE / HEADER_REP2 / HEADER_REP3 / FULL_REP2 / FULL_REP3
- AES-GCM + strengthened key derivation
- Curriculum robustness training (CLEAN → strong mixed attacks)

### ARES-Hybrid-INN (v5) — new proposed
- CNN feature extractor + **Invertible Neural Network** (affine coupling)
- **Minimum-LSB** embedding (change bit only on mismatch)
- Adaptive texture/edge mask (variance, gradient, Laplacian)
- Bounded residual on high bits (LSB payload protected)
- Same ECC / crypto stack as v4
- Checkpoints under `models/hybrid/` (does not overwrite v4)

## Quick start

```bash
cd ARES-Upgraded
pip install -r requirements.txt
python -c "from models.hybrid.ares_hybrid_inn import hybrid_embed, hybrid_extract; ..."
python training/train_hybrid_inn.py --pilot --epochs 3   # hybrid smoke test
python training/train_ares.py --pilot --epochs 3         # original ARES
python main.py list-models
python main.py benchmark
python main.py ui
```

## Full training (Colab)

See `colab/ARES_Upgraded_Full_Training.ipynb`.
Drive path: `/content/drive/MyDrive/ARES_Upgraded/`

## Fair comparison

All models share the same:
- test images
- payload / secret
- metric implementations
- attack definitions
via `benchmark/` and `benchmark_manifest.yaml` (to be generated per run).

## Papers integrated as baselines

1. Kanimozhi – RNN + Fuzzy
2. Sanjalawe – Huffman + LSB + DL
3. Rahman – LSB + Magic Matrix
4. Aljarf – DL-Steg (SAE + LSTM + ECC)
5. Zhang – ISS multi-image

## Reproducibility

Record seed, git commit, dataset hashes, PyTorch/CUDA versions, and config YAML for every experiment.
