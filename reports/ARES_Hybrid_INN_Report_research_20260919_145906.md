# ARES-Hybrid-INN — Research Validation Report

**Generated:** 2026-09-19T15:00:42.339529Z  
**Experiment ID:** `research_20260919_145906`  
**Category:** `FINAL_TEST`  
**Split:** `test` @ **256×256**  
**Images:** 6  

> All PSNR/SSIM/MSE values below are **measured**. Pilot observations (~75 dB / ~81 dB) are **not** treated as guaranteed outcomes.

## 1. Abstract

This report validates ARES-Hybrid-INN against four paper baselines under identical cover, secret, resolution, and evaluation conditions. True-positive recovery (exact secret match) is required for primary ranking.

## 2. Models

| ID | Role | n | TP |
|----|------|---|----|
| `paper_model_01` | Baseline reproduction | 6 | 6 |
| `paper_model_02` | Baseline reproduction | 6 | 6 |
| `paper_model_03` | Baseline reproduction | 6 | 6 |
| `paper_model_04` | Baseline reproduction | 6 | 6 |
| `ares_hybrid_inn` | Proposed | 6 | 6 |

Baselines are REPRODUCED/APPROXIMATION when official weights were unavailable.

## 3. Dataset protocol

- **coco**: UNAVAILABLE — not found under datasets/coco
- **div2k**: UNAVAILABLE — not found under datasets/div2k
- **celeba**: UNAVAILABLE — UNAVAILABLE — place images under datasets/celeba/ (Google Drive quota may block automatic download)
- **bossbase**: UNAVAILABLE — not found under datasets/bossbase

## 4. PSNR generalization (measured)

| Model | Mean PSNR | Median | Std | %≥70 | %≥75 | %≥80 | Exact recovery % |
|-------|-----------|--------|-----|------|------|------|------------------|
| Kanimozhi RNN+Fuzzy (2025) | 74.8365 | 74.8759 | 0.2002 | 100.00 | 16.67 | 0.00 | 100.00 |
| Sanjalawe Huffman+LSB+DL (2025) | 73.1334 | 73.1466 | 0.1022 | 100.00 | 0.00 | 0.00 | 100.00 |
| Rahman LSB+MagicMatrix (2025) | 74.4912 | 74.4773 | 0.1187 | 100.00 | 0.00 | 0.00 | 100.00 |
| Aljarf DL-Steg ECC+SAE (2025) | 74.7556 | 74.7473 | 0.1270 | 100.00 | 0.00 | 0.00 | 100.00 |
| ARES-Hybrid-INN | 75.3384 | 75.3323 | 0.0591 | 100.00 | 100.00 | 0.00 | 100.00 |

## 5. Quality & efficiency

| Model | Mean SSIM | Mean MSE | Mean LSB% | Mean time (ms) |
|-------|-----------|----------|-----------|----------------|
| Kanimozhi RNN+Fuzzy (2025) | 0.999999 | 2.137078e-03 | 0.214 | 113.5 |
| Sanjalawe Huffman+LSB+DL (2025) | 0.999999 | 3.161112e-03 | 0.316 | 106.5 |
| Rahman LSB+MagicMatrix (2025) | 0.999999 | 2.312554e-03 | 0.231 | 107.1 |
| Aljarf DL-Steg ECC+SAE (2025) | 0.999999 | 2.176073e-03 | 0.218 | 108.5 |
| ARES-Hybrid-INN | 0.999999 | 1.902262e-03 | 0.190 | 889.1 |

## 6. Research question

**Does ARES-Hybrid-INN retain high-PSNR behavior on unseen images while maintaining secret recovery, low LSB modification, and reasonable cost?**

On this run (6 images, 256², category `FINAL_TEST`), **ARES-Hybrid-INN** measured **mean PSNR = 75.3384 dB**, **median = 75.3323 dB**, **100.0% of images ≥ 75 dB**, **exact recovery rate = 100.0%**.

## 7. Limitations

- Results apply only to the listed split, resolution, and secret_id.
- Paper baselines may be partial reproductions without official weights.
- CelebA/BOSSBase cross-domain is PENDING when datasets are unavailable.
- Steganalysis scores are proxy metrics unless a trained detector is configured.

## 8. Reproducibility

```json
{
  "python": "3.12.3",
  "platform": "Linux-6.12.8+-x86_64-with-glibc2.39",
  "pytorch": "2.12.0+cu130",
  "cuda_available": false,
  "gpu": null,
  "timestamp": "2026-09-19T14:59:12.405623Z"
}
```

Artifacts: `results/research_20260919_145906`
