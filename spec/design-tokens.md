# KeepDir Design Tokens

Light palette: `#f4f4f1` background, `#fbfbf6` surface, `#ecece4` elevated, `#121211` text, `#6a6a64` secondary, `rgba(0,0,0,.1)` border, `#7c941f` accent.

Dark palette: `#0c0c0d` background, `#141416` surface, `#1e1e22` elevated, `#f4f4f2` text, `#9c9c97` secondary, `rgba(255,255,255,.09)` border, `#d4ff4f` accent.

Shared status colors: danger `#ff5c5c`, warning `#f5a623`, info `#60a5fa`.

Radii: 5, 9, 12, 16, and 999 px. Type: Plus Jakarta Sans for display/body, JetBrains Mono for paths, badges, metrics, and uppercase eyebrows. Type scale: 2xs `0.625rem`, xs `0.6875rem`, sm `0.875rem`, base `1rem`, lg `1.125rem`, display `1.75rem`.

Motion: `kd-rise` is 560 ms with stagger offsets 0/40/70/90/120 ms. `kd-pulse` is a 2.4 s repeating ready-dot ring. Respect reduced-motion settings.

WPF accepted deviations: grain uses opacity rather than blend mode, dialogs use a scrim without blur, and eyebrow letter spacing is approximate.

Reference screenshots:

- `spec/reference-screenshots/light-empty.png`
- `spec/reference-screenshots/light-populated.png`
- `spec/reference-screenshots/light-conflict.png`
- `spec/reference-screenshots/light-history.png`
- `spec/reference-screenshots/dark-empty.png`
- `spec/reference-screenshots/dark-populated.png`
- `spec/reference-screenshots/dark-conflict.png`
- `spec/reference-screenshots/dark-history.png`
