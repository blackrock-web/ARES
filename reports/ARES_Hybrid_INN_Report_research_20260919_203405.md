# ARES-Hybrid-INN — Research Validation Report

**Generated:** 2026-09-19T15:04:50.334752Z  
**Experiment ID:** `research_20260919_203405`  
**Category:** `FINAL_TEST`  
**Split:** `test` @ **512×512**  
**Images:** 10  

> All PSNR/SSIM/MSE values below are **measured**. Pilot observations (~75 dB / ~81 dB) are **not** treated as guaranteed outcomes.

## 1. Abstract

This report validates ARES-Hybrid-INN against four paper baselines under identical cover, secret, resolution, and evaluation conditions. True-positive recovery (exact secret match) is required for primary ranking.

## 2. Models

| ID | Role | n | TP |
|----|------|---|----|
| `paper_model_01` | Baseline reproduction | 10 | 10 |
| `paper_model_02` | Baseline reproduction | 10 | 10 |
| `paper_model_03` | Baseline reproduction | 10 | 10 |
| `paper_model_04` | Baseline reproduction | 10 | 10 |
| `ares_hybrid_inn` | Proposed | 10 | 10 |

Baselines are REPRODUCED/APPROXIMATION when official weights were unavailable.

## 3. Dataset protocol

- **coco**: UNAVAILABLE — not found under datasets/coco
- **div2k**: UNAVAILABLE — not found under datasets/div2k
- **celeba**: UNAVAILABLE — UNAVAILABLE — place images under datasets/celeba/ (Google Drive quota may block automatic download)
- **bossbase**: UNAVAILABLE — not found under datasets/bossbase

## 4. PSNR generalization (measured)

| Model | Mean PSNR | Median | Std | %≥70 | %≥75 | %≥80 | Exact recovery % |
|-------|-----------|--------|-----|------|------|------|------------------|
| Kanimozhi RNN+Fuzzy (2025) | 80.7240 | 80.7026 | 0.1538 | 100.00 | 100.00 | 100.00 | 100.00 |
| Sanjalawe Huffman+LSB+DL (2025) | 79.2440 | 79.2555 | 0.1140 | 100.00 | 100.00 | 0.00 | 100.00 |
| Rahman LSB+MagicMatrix (2025) | 80.5600 | 80.5895 | 0.1897 | 100.00 | 100.00 | 100.00 | 100.00 |
| Aljarf DL-Steg ECC+SAE (2025) | 80.6568 | 80.6136 | 0.1382 | 100.00 | 100.00 | 100.00 | 100.00 |
| ARES-Hybrid-INN | 81.3829 | 81.3820 | 0.0948 | 100.00 | 100.00 | 100.00 | 100.00 |

## 5. Quality & efficiency

| Model | Mean SSIM | Mean MSE | Mean LSB% | Mean time (ms) |
|-------|-----------|----------|-----------|----------------|
| Kanimozhi RNN+Fuzzy (2025) | 1.000000 | 5.507151e-04 | 0.055 | 156.6 |
| Sanjalawe Huffman+LSB+DL (2025) | 0.999999 | 7.741292e-04 | 0.077 | 148.4 |
| Rahman LSB+MagicMatrix (2025) | 1.000000 | 5.720774e-04 | 0.057 | 146.3 |
| Aljarf DL-Steg ECC+SAE (2025) | 1.000000 | 5.592346e-04 | 0.056 | 155.4 |
| ARES-Hybrid-INN | 1.000000 | 4.730225e-04 | 0.047 | 3233.3 |

## 6. Research question

**Does ARES-Hybrid-INN retain high-PSNR behavior on unseen images while maintaining secret recovery, low LSB modification, and reasonable cost?**

On this run (10 images, 512², category `FINAL_TEST`), **ARES-Hybrid-INN** measured **mean PSNR = 81.3829 dB**, **median = 81.3820 dB**, **100.0% of images ≥ 75 dB**, **exact recovery rate = 100.0%**.

## 7. Limitations

- Results apply only to the listed split, resolution, and secret_id.
- Paper baselines may be partial reproductions without official weights.
- CelebA/BOSSBase cross-domain is PENDING when datasets are unavailable.
- Steganalysis scores are proxy metrics unless a trained detector is configured.

## 8. Reproducibility

```json
{
  "python": "3.11.9",
  "platform": "Linux-7.0.12+kali-amd64-x86_64-with-glibc2.42",
  "pytorch": "2.10.0+cu128",
  "cuda_available": true,
  "gpu": "NVIDIA GeForce RTX 3050 Laptop GPU",
  "timestamp": "2026-09-19T15:04:05.265569Z"
}
```

Artifacts: `/home/s0751/Applications/ARES-Upgraded_FINAL/ARES-Hybrid-INN_Upgraded (2)/ARES-Upgraded/results/research_20260919_203405`
