# Round 15: expansion performance follow-up

This focused follow-up was triggered by final gate attempt 10 at `e9d0992`. It is not a complete
visual round. The unchanged graph check measured a 123 ms main-thread task against its 100 ms
budget. Five unchanged reproductions measured 0, 157, 108, 140 and 76 ms; three failed. This
was repeatable and was not dismissed as machine load.

| Row | Severity | State | Disposition |
| --- | --- | --- | --- |
| R15-1 | S2 | A large Neighborhood expansion briefly fits the entire canvas before panning to readable zoom, mounting otherwise offscreen nodes and sometimes blocking input beyond the 100 ms budget. | Fixed: calculate and publish the final readable viewport once. Three pure decision tests, three targeted mutants and a light/dark four-size viewport-transition assertion cover the change. The original performance limit remains unchanged. |

A fresh complete round 16 and the full release gate are required after focused verification.
