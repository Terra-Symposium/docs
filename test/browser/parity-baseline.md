# Terra Docs parity baseline

The `original-*.png` snapshots in `parity.spec.ts-snapshots/` come from the
pre-abstraction Terra website at commit
`cad2bae15a975d32f60a01b60693c5e0b5c90ed2`. They were captured from the pinned
checkout's `parity-baseline.astro` fixture with hue `145` and the viewport and
interaction state named by each snapshot. The fixture uses static Salesphere
content and the original Docs shell, editor, sidebar, tree actions, and
attachments UI. It does not use Sanity data or a signed-in account.

The extracted package is compared against these checked-in images with a pixel
difference ratio of `0.002`. The only excluded pixels are injected Astro
development toolbar and overlay elements, which are not part of the Docs UI.

The Attachments toolbar is the one intentional product change requested after
the baseline capture: its Mode selector is content-sized so the attachment
filters fit on the same toolbar row. `original-attachments-mode.png` remains the
pre-abstraction reference; `compact-attachments-mode.png` is the current
expected screenshot for that updated state.
