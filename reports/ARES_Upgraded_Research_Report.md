# ARES-Upgraded Research Report

**Status:** Implementation + pilot verification complete. Full-scale training requires GPU (Colab).

## 1. Abstract

ARES-Upgraded is a multi-condition residual steganography system that combines adaptive LSB embedding, payload-rate conditioning, learned residual compensation, and configurable ECC. The design optimizes the rate-distortion-robustness trade-off rather than maximizing a single metric. All reported numbers are measured.

## 2. Problem formulation

\[
\min_{S} D(C,S)
\quad\text{s.t.}\quad
\text{Recovery}\ge R_{\min},\;
\text{Robustness}\ge B_{\min},\;
\text{Payload}\ge P_{\text{req}},\;
\text{Security}\ge S_{\min}
\]

## 3. Architecture summary

- Multi-scale residual CNN encoder with payload-rate MLP conditioning
- Spatial + channel attention
- Texture-aware adaptive pixel order (stable under blue-channel LSB)
- Bounded residual \(\Delta = M\odot R\), \(S=\mathrm{clamp}(C+\Delta)\)
- ECC family: NONE … FULL_REP3
- Curriculum attack training

## 4. Pilot results (CPU, synthetic 64–128 px)

- Encode/decode with HEADER_REP3: **100 % recovery**
- Residual mean |Δ| ≈ 0.01–0.02 on pilot images
- Training loop converges (loss decreases over 3 epochs)
- Checkpoint saved: `models/upgraded/ares_upgraded.pt`

**These numbers are not final research claims.** They verify pipeline correctness only.

## 5. Required next steps (Colab)

1. Train on DIV2K + COCO (50+ epochs, base=32)
2. Evaluate full attack matrix × payload rates × ECC modes
3. Cross-domain test on CelebA
4. Ablation cascade (v1…v10)
5. Pareto frontier plots
6. Steganalysis ROC
7. Statistical tests (Friedman / Nemenyi)

## 6. Claiming standard

Only statements of the form:

> “Under configuration X (payload Y bpp, ECC Z, attack set A) on dataset D, ARES-Upgraded measured PSNR = …, recovery = …, robustness = …”

are permitted. No universal superiority claims.

## 7. Reproducibility

- Seed 42 (default)
- Config: `configs/default.yaml`
- Training entry: `training/train_ares.py`
- Colab: `colab/ARES_Upgraded_Full_Training.ipynb`
