# ARES-Hybrid-INN Architecture Notes

## Design

Hybrid of:
- **CNN** feature extractor (multi-scale residual, channel + spatial attention)
- **Invertible Neural Network** (affine coupling blocks with clamped log-scale)
- **Adaptive embedding mask** (variance + gradient + Laplacian + attention)
- **Minimum-LSB** integer embedding (modify bit only on mismatch)
- **Bounded residual** compensation that preserves payload LSB planes

## Information flow

```
Cover → CNN features → Adaptive mask M
Secret → AES-GCM + ECC pack → bit stream
Bit stream → Minimum-LSB on ordered positions (R+G attention order)
CNN+INN residual → high bits only (LSB planes protected)
→ Stego
Extract: same positions from R+G → unpack ECC → decrypt
```

## Invertibility

Affine coupling:

```
y1 = x1
y2 = x2 * exp(clamp(s)) + t
```

Inverse is exact; clamp keeps exp stable. Verified numerical error ~0 on float32.

## Training vs inference

| Stage | Operation |
|-------|-----------|
| Training | Soft residual / MSE / SSIM / residual penalty (differentiable) |
| Inference | True minimum-LSB integer ops + optional residual on high bits |

Do **not** claim hard LSB was differentiated through; residual is the trainable path.

## Checkpoints

- `models/upgraded/ares_upgraded.pt` — preserved
- `models/hybrid/ares_hybrid_inn.pt` — hybrid
- `models/hybrid/ares_hybrid_inn_best.pt`
- `models/hybrid/ares_hybrid_inn_latest.pt`

## Measured pilot (synthetic 128×128, CPU)

See live benchmark output; PSNR/SSIM/LSB% depend on payload and cover texture.
Always re-measure on the target test set.

## Paper baselines (registry)

1. Kanimozhi RNN+Fuzzy  
2. Sanjalawe Huffman+LSB+DL  
3. Rahman LSB+Magic Matrix  
4. Aljarf DL-Steg SAE+LSTM+ECC  
5. Zhang ISS multi-image  

Status labels: REPRODUCED / PARTIAL / APPROXIMATION as in model cards.
