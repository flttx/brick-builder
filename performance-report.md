# Browser Performance Report

- Browser: chromium
- OS: win32
- Renderer benchmark: real browser, fixed 1440×900 viewport, Balanced, 3s warmup + 10s samples
- Real-device status: not established by this headless/host run
- Performance target status: not-environment-verified
- Desktop 1000 Brick P50 target: ≥45 FPS (only enforced when the benchmark environment is explicitly verified)

| Size | Layout | FPS P50 | FPS P05 | Frame P95 | Draw Calls | Instances | Visible | DPR |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | sparse | 4.62 | 4.29 | 233.30 | 14 | 100 | 88 | 1.25 |
| 100 | dense | 4.61 | 4.28 | 233.30 | 14 | 100 | 100 | 1.25 |
| 500 | sparse | 1.43 | 1.36 | 716.70 | 14 | 500 | 251 | 1.25 |
| 500 | dense | 1.94 | 1.82 | 550.00 | 14 | 500 | 486 | 1.25 |
| 1000 | sparse | 1.94 | 1.76 | 566.70 | 9 | 1000 | 251 | 1.25 |
| 1000 | dense | 2.86 | 2.61 | 366.70 | 9 | 1000 | 863 | 1.25 |
| 3000 | sparse | 1.76 | 1.67 | 600.00 | 9 | 3000 | 251 | 1.25 |
| 3000 | dense | 0.78 | 0.77 | 1299.90 | 14 | 3000 | 1248 | 1.25 |
| 5000 | sparse | 1.50 | 1.25 | 666.70 | 9 | 5000 | 251 | 1.25 |
| 5000 | dense | 1.71 | 1.46 | 649.90 | 14 | 5000 | 1248 | 1.25 |
