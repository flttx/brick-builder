# Browser Performance Report

- Browser: chromium
- OS: win32
- Renderer benchmark: real browser, fixed 1440×900 viewport, Balanced, 3s warmup + 10s samples
- Real-device status: not established by this headless/host run

| Size | Layout | FPS P50 | FPS P05 | Frame P95 | Draw Calls | Instances | DPR |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | sparse | 2.40 | 2.31 | 433.30 | 13 | 100 | 1.25 |
| 100 | dense | 5.46 | 5.00 | 200.00 | 13 | 100 | 1.25 |
| 500 | sparse | 1.67 | 1.54 | 616.60 | 13 | 500 | 1.25 |
| 500 | dense | 2.00 | 1.87 | 533.30 | 13 | 500 | 1.25 |
| 1000 | sparse | 2.50 | 2.40 | 416.60 | 8 | 1000 | 1.25 |
| 1000 | dense | 2.00 | 1.87 | 533.30 | 8 | 1000 | 1.25 |
| 3000 | sparse | 1.43 | 1.28 | 749.90 | 18 | 3000 | 1.25 |
| 3000 | dense | 1.00 | 0.94 | 1066.60 | 18 | 3000 | 1.25 |
| 5000 | sparse | 1.62 | 1.02 | 950.00 | 23 | 5000 | 1.25 |
| 5000 | dense | 1.71 | 1.58 | 616.60 | 23 | 5000 | 1.25 |
