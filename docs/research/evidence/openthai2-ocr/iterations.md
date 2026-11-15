# OpenThai sweep — iterations log


## Sweep started 2026-11-15T17:38:20 on `dev`

Base config: `{"runtime": {"backend": "onnxruntime"}}`

| run | change | CER | CER_e2e | mixed | mac·mixed | win·mixed | decision |
|---|---|---|---|---|---|---|---|
| 20261115-173820-openthai-dev-65f373c3 | base | 3.84% | 3.85% | 2.48% | 1.95% | 3.28% | baseline |
| 20261115-173933-openthai-dev-dbe3b598 | pass 1: det.limit=960 | 3.74% | 3.75% | 2.40% | 2.27% | 2.80% | reject (-0.10 pt) |
| 20261115-174030-openthai-dev-47dbb723 | pass 1: det.limit=1600 | 3.98% | 3.98% | 2.74% | 1.97% | 3.83% | reject (+0.14 pt) |
| 20261115-174202-openthai-dev-67022de7 | pass 1: det.limit=1920 | 4.05% | 4.05% | 2.65% | 2.04% | 3.35% | reject (+0.21 pt) |
| 20261115-174415-openthai-dev-af66d60a | pass 1: det.limit=2560 | 4.08% | 4.08% | 2.69% | 2.09% | 3.39% | reject (+0.23 pt) |
| 20261115-174719-openthai-dev-574c1c85 | pass 1: det.limit=0 | 3.93% | 3.94% | 2.64% | 2.04% | 3.57% | reject (+0.09 pt) |
| 20261115-174910-openthai-dev-550bf684 | pass 1: pre.scale=1.5 | 3.70% | 3.70% | 2.28% | 1.93% | 2.83% | reject (-0.15 pt) |
| 20261115-175025-openthai-dev-bc479346 | pass 1: pre.scale=2.0 | 3.85% | 3.85% | 2.39% | 2.04% | 3.01% | reject (+0.00 pt) |
| 20261115-175141-openthai-dev-bab442ec | pass 1: rec.color=stretch | 3.74% | 3.75% | 2.37% | 1.91% | 3.06% | reject (-0.10 pt) |
| 20261115-175252-openthai-dev-7527c554 | pass 1: rec.color=gray_inv | 4.21% | 4.21% | 2.83% | 2.00% | 3.36% | reject (+0.36 pt) |
| 20261115-175445-openthai-dev-27761f56 | pass 1: rec.color=gray | 53.71% | 53.71% | 59.07% | 25.39% | 69.79% | reject (+49.86 pt) |
| 20261115-175625-openthai-dev-612df542 | pass 1: det.v_pad=0.15 | 3.07% | 3.07% | 2.02% | 1.43% | 2.42% | ADOPT (−0.78 pt) |
| 20261115-175737-openthai-dev-1d48e0a2 | pass 1: det.v_pad=0.3 | 3.75% | 3.75% | 3.16% | 1.43% | 2.65% | reject (+0.68 pt) |
| 20261115-175916-openthai-dev-dfbb2872 | pass 1: det.box_thresh=0.5 | 3.08% | 3.08% | 2.02% | 1.43% | 2.43% | reject (+0.01 pt) |
| 20261115-180039-openthai-dev-dbc3628d | pass 1: det.box_thresh=0.6 | 3.45% | 3.45% | 2.48% | 1.45% | 4.62% | reject (+0.38 pt) |
| 20261115-180149-openthai-dev-65b08817 | pass 1: det.unclip=1.5 | 3.22% | 3.22% | 2.36% | 1.41% | 2.64% | reject (+0.15 pt) |
| 20261115-180303-openthai-dev-0e1bcaac | pass 1: det.unclip=1.7 | 3.70% | 3.70% | 3.24% | 1.32% | 2.45% | reject (+0.63 pt) |
| 20261115-180416-openthai-dev-13136be2 | pass 1: det.unclip=2.0 | 5.68% | 5.68% | 6.13% | 1.95% | 3.51% | reject (+2.61 pt) |
| 20261115-180549-openthai-dev-213d500b | pass 1: det.thresh=0.3 | 3.08% | 3.08% | 2.03% | 1.52% | 2.43% | reject (+0.01 pt) |
| 20261115-180707-openthai-dev-fbcc26d3 | pass 1: rec.drop_below=0.0 | 2.90% | 2.92% | 2.03% | 1.43% | 2.42% | reject (-0.15 pt) |
| 20261115-180824-openthai-dev-79d1ab50 | pass 1: rec.drop_below=0.5 | 2.90% | 2.91% | 2.03% | 1.43% | 2.42% | reject (-0.16 pt) |
| 20261115-181024-openthai-dev-ec4a1dd8 | pass 1: rec.min_chars=1 | 2.85% | 2.85% | 2.02% | 1.43% | 2.42% | ADOPT (−0.23 pt) |
| 20261115-181155-openthai-dev-72ddb53a | pass 2: det.limit=960 | 3.41% | 3.41% | 2.51% | 1.50% | 2.98% | reject (+0.57 pt) |
| 20261115-181309-openthai-dev-85524505 | pass 2: det.limit=1600 | 2.98% | 2.98% | 2.24% | 1.41% | 3.62% | reject (+0.13 pt) |
| 20261115-181446-openthai-dev-8322506a | pass 2: det.limit=1920 | 2.90% | 2.90% | 2.22% | 1.29% | 2.50% | reject (+0.05 pt) |
| 20261115-181718-openthai-dev-7c1dadad | pass 2: det.limit=2560 | 2.91% | 2.91% | 2.11% | 1.54% | 2.50% | reject (+0.06 pt) |
| 20261115-182036-openthai-dev-eb247863 | pass 2: det.limit=0 | 2.99% | 2.99% | 2.31% | 1.43% | 2.97% | reject (+0.14 pt) |
| 20261115-182234-openthai-dev-d052daa3 | pass 2: pre.scale=1.5 | 2.82% | 2.82% | 2.01% | 1.41% | 2.30% | reject (-0.02 pt) |
| 20261115-182348-openthai-dev-3a46db9a | pass 2: pre.scale=2.0 | 2.85% | 2.85% | 1.96% | 1.52% | 2.13% | reject (-0.00 pt) |
| 20261115-182504-openthai-dev-f88e53b3 | pass 2: rec.color=stretch | 2.81% | 2.81% | 1.99% | 1.41% | 2.39% | reject (-0.03 pt) |
| 20261115-182616-openthai-dev-00042d53 | pass 2: rec.color=gray_inv | 3.28% | 3.28% | 2.40% | 1.41% | 2.79% | reject (+0.44 pt) |
| 20261115-182729-openthai-dev-4b9227cc | pass 2: rec.color=gray | 53.35% | 53.35% | 58.91% | 24.98% | 69.56% | reject (+50.51 pt) |
| 20261115-182850-openthai-dev-1512ab03 | pass 2: det.v_pad=0.0 | 3.63% | 3.64% | 2.48% | 1.95% | 3.28% | reject (+0.79 pt) |
| 20261115-183007-openthai-dev-2c1510d3 | pass 2: det.v_pad=0.3 | 3.53% | 3.53% | 3.16% | 1.43% | 2.65% | reject (+0.69 pt) |
| 20261115-183113-openthai-dev-cd6c84a9 | pass 2: det.box_thresh=0.5 | 2.86% | 2.86% | 2.02% | 1.43% | 2.43% | reject (+0.01 pt) |
| 20261115-183225-openthai-dev-af72af45 | pass 2: det.box_thresh=0.6 | 3.23% | 3.23% | 2.48% | 1.45% | 4.62% | reject (+0.39 pt) |
| 20261115-183337-openthai-dev-a4af5c11 | pass 2: det.unclip=1.5 | 2.98% | 2.98% | 2.36% | 1.41% | 2.64% | reject (+0.14 pt) |
| 20261115-183447-openthai-dev-f050742c | pass 2: det.unclip=1.7 | 3.46% | 3.47% | 3.24% | 1.32% | 2.45% | reject (+0.62 pt) |
| 20261115-183616-openthai-dev-7f0b012f | pass 2: det.unclip=2.0 | 5.44% | 5.44% | 6.13% | 1.95% | 3.51% | reject (+2.60 pt) |
| 20261115-183742-openthai-dev-22b563ab | pass 2: det.thresh=0.3 | 2.86% | 2.86% | 2.03% | 1.52% | 2.43% | reject (+0.01 pt) |
| 20261115-183905-openthai-dev-8f812fe8 | pass 2: rec.drop_below=0.0 | 2.67% | 2.69% | 2.03% | 1.43% | 2.42% | reject (-0.15 pt) |
| 20261115-184033-openthai-dev-01b12297 | pass 2: rec.drop_below=0.5 | 2.67% | 2.69% | 2.03% | 1.43% | 2.42% | reject (-0.16 pt) |
| 20261115-184213-openthai-dev-0cc8fe96 | pass 2: rec.min_chars=2 | 3.07% | 3.07% | 2.02% | 1.43% | 2.42% | reject (+0.23 pt) |
| — | pass 2 adopted nothing | | | | | | stop |

## Hypothesis round (written before running)

Error classes of the sweep's best config (`20261115-181024-openthai-dev-ec4a1dd8`, dev CER 2.85%):
whole-line misses = 18% of edits; case-only substitutions (s/S, 0/O) = 5%; the rest are
symbol/typography confusions (— → –, … → ., → → –).

**H-a:** whole lines are lost when the recogniser reads Thai as Latin look-alikes and the
`invalid_thai` junk filter (`rec.junk_below 0.9`, `rec.junk_invalid 0.05`) then drops the line;
keeping those lines (garbled text still matches most characters) lowers CER.
Test: `rec.junk_invalid` ∈ {0.2, 1.0} on top of the best config, same acceptance rule
(≥ 0.2 pt better on dev CER_e2e, no category×dpr slice worse by > 1 pt).
H-b (case fix-ups) not run: ≤ 5% of edits and a rule that lowercases S/C/Z between lowercase
letters would break real CamelCase (PowerShell, JavaScript).

| run | change | CER | CER_e2e | mixed | mac·mixed | win·mixed | decision |
|---|---|---|---|---|---|---|---|
| 20261115-185218-openthai-dev-a43818f5 | H-a: rec.junk_invalid=0.2 | 2.82% | 2.82% | 2.02% | — | — | reject (−0.03 pt) |
| 20261115-185328-openthai-dev-b4accbb7 | H-a: rec.junk_invalid=1.0 | 2.81% | 2.81% | 2.02% | — | — | reject (−0.04 pt) |

H-a rejected: the junk filter is not what loses whole lines. **Final config (frozen before the test split):**
`{"runtime": {"backend": "onnxruntime"}, "det": {"v_pad": 0.15}, "rec": {"min_chars": 1}}`
