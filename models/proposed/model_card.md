# ARES-Steg-Q (Proposed)

- Status: TRAINED
- Weights: proposed_model.pt
- Architecture: AES-GCM + QRNG/BB84 + keyed multi-bit LSB + residual CNN
- Residual never modifies payload LSBs; CRC guarantees exact recovery
