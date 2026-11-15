| engine | all | thai | english | mixed | mac_typical·mixed | win_typical·mixed | fp/1k | p50 ms |
|---|---|---|---|---|---|---|---|---|
| a1_full (openthai-dev-65f373c3) | 3.84% | 3.60% | 5.44% | 2.48% | 1.95% | 3.28% | 0.1 | 1640 |
| a1_ablated (openthai-dev-aeae2682) | 3.86% | 3.62% | 5.50% | 2.46% | 1.95% | 3.19% | 0.1 | 1564 |
| tess_test (tesseract-test-bf21a9e8) | 17.16% | 20.67% | 14.38% | 18.08% | 14.00% | 17.53% | 4.7 | 3879 |
| vision_test (vision-test-bf21a9e8) | 3.17% | 3.24% | 2.70% | 3.06% | 1.68% | 2.62% | 0.1 | 509 |
| ot_dev (openthai-dev-ec4a1dd8) | 2.85% | 2.86% | 4.11% | 2.02% | 1.43% | 2.42% | 0.0 | 3127 |
| ot_test (openthai-test-ec4a1dd8) | 3.01% | 2.88% | 4.54% | 1.89% | 1.48% | 1.84% | 0.1 | 2308 |
| rust_test (rust-ort-test-ec4a1dd8) | 3.00% | 2.92% | 4.50% | 1.84% | 1.40% | 1.81% | 0.1 | 1363 |
| py_for_rust_test (openthai-test-a87d7df0) | 3.02% | 2.89% | 4.56% | 1.88% | 1.48% | 1.82% | 0.1 | 2010 |

| gate | status | why |
|---|---|---|
| H1 | FAIL | tesseract easy·english 7.55% > 3.00% |
| H2 | PASS | every split's GT matches its pixels |
| A1 | PASS | CER(full) − CER(no ori, no split_gap) = -0.02 pt, CI [-0.08, +0.04] |
| Q1a | PASS | both typical slices under 5% |
| Q1b | PASS | mixed 1.89% vs limit 1.5×max(thai 2.88%, english 4.54%) + 0.5 pt = 7.31% |
| Q1c | PASS | every class above its floor on mixed lines |
| W1 | PASS | OpenThai 3.01% vs Tesseract 17.16%: 82.4% lower; ΔCER -14.14 pt, 95% CI [-16.62, -11.99] |
| W2 | PASS | english 4.54% vs 14.38%; fp/1k 0.1 vs 4.7 |
| M1 | PASS (info) | OpenThai 3.01% vs Vision 3.17%, ΔCER -0.16 pt CI [-0.92, +0.57] → equivalent or better |
| R1 | PASS | ΔCER rust−python -0.02 pt; identical lines 98.1% |
| P1 | FAIL | linux (ort) p50_ms 1251 > 1000; mac (ort) rss_mb 2875 > 400 |
| S1 | FAIL | over 12 MB: x86_64-unknown-linux-gnu 12.2 MB |
