# LCARS Home Card - Theme Contract (as-built)

The theme contract for **v0.1.22** (`d11ca24`). Themes are pure CSS-variable swaps plus a shared "character styling" flag; nothing in the render logic branches per theme beyond the mascot injection. Palettes were untouched by v0.1.19-v0.1.22 (camera transport, render-architecture, watchdog, and time-format changes only), so the tables below are unchanged from v0.1.18.

## Theme keys

| Key | Character family | Mode |
|---|---|---|
| `lcars` (default) | none | dark, screen-accurate LCARS |
| `cinnamoroll` | Cinnamoroll | light pastel |
| `cinnamoroll-dark` | Cinnamoroll | dark blue pastel |

Selection: `SUPPORTED_THEMES = new Set(["lcars", "cinnamoroll", "cinnamoroll-dark"])`. Any other value (including `undefined`) falls back to `lcars`. The selected theme is written to `data-theme` on the shell element; `theme.startsWith("cinnamoroll")` additionally triggers mascot injection and character styling.

```yaml
type: custom:lcars-home-panel
theme: cinnamoroll-dark
```

Source-contract tests pin the theme set, the fallback expression, the mascot injection expression, and representative palette values per theme.

## Custom-property contract

Every theme defines the same set of custom properties on `.shell`. Sub-themes override them via `.shell[data-theme="…"]` selectors; `lcars` values live on the base `.shell` rule.

| Property | Role |
|---|---|
| `--bg` | shell/page background |
| `--apricot` `--salmon` `--lilac` `--sky` `--gold` `--mint` | band colors: rail, masthead/footer, and tab headers (per-section accent) |
| `--ink` | dark surfaces / accent ink |
| `--muted` | muted secondary on dark backgrounds |
| `--panel-bg` | panel card background |
| `--row` / `--row-2` | row-chip background; `--row-2` for emphasized cells (setpoint pill) |
| `--text` / `--text-2` | primary / secondary body text |
| `--on-header` / `--on-header-soft` / `--on-header-dim` | text on apricot bands: full / soft / dim emphasis |
| `--on-tab` | text on tab bands |
| `--sky-ink` `--salmon-ink` `--apricot-ink` `--lilac-ink` `--mint-ink` | per-section accent text (security status, climate mode, event times, forecast glyphs, light-chip bars) |
| `--fc-ink` | forecast condition/precipitation emphasis |
| `--cam-glyph` | offline camera glyph tint |
| `--event-past-line` | left border of dimmed past calendar events |
| `--panel-line` | panel border color (transparent in `lcars`) |

## Palettes (as shipped)

### lcars (dark, base)

| Property | Value |
|---|---|
| `--bg` | `#06070b` |
| `--apricot` | `#eab18c` |
| `--salmon` | `#e48878` |
| `--lilac` | `#baadd8` |
| `--sky` | `#83bdd2` |
| `--gold` | `#d7bd67` |
| `--mint` | `#8ed0a6` |
| `--ink` | `#101117` |
| `--muted` | `#b8b0bc` |
| `--panel-bg` | `#101117` |
| `--row` / `--row-2` | `#181a22` / `#241a1d` |
| `--text` / `--text-2` | `#e8e3db` / `#9a91a3` |
| `--on-header` / soft / dim | `#101117` / `rgba(10,10,14,.55)` / `rgba(10,10,14,.72)` |
| `--on-tab` | `#09090e` |
| ink accents | `--sky-ink:#83bdd2` `--salmon-ink:#e6a295` `--apricot-ink:#eab18c` `--lilac-ink:#c8b6e6` `--mint-ink:#8ed0a6` |
| `--fc-ink` | `#b9cde7` |
| `--cam-glyph` | `rgba(234,177,140,.5)` |
| `--event-past-line` | `#75615a` |
| `--panel-line` | `transparent` |

### cinnamoroll (light pastel)

| Property | Value |
|---|---|
| `--bg` | `#fbf6ef` |
| `--apricot` | `#a9d8ef` |
| `--salmon` | `#ffc2cf` |
| `--lilac` | `#c9d6f0` |
| `--sky` | `#b7e0f5` |
| `--gold` | `#ffdf9e` |
| `--mint` | `#b2e6cf` |
| `--ink` | `#3d4c5f` |
| `--muted` | `#6f8298` |
| `--panel-bg` | `#ffffff` |
| `--row` / `--row-2` | `#f2f8fc` / `#eaf3f9` |
| `--text` / `--text-2` | `#3d4c5f` / `#6f8298` |
| `--on-header` / soft / dim | `#26506d` / `rgba(38,80,109,.62)` / `rgba(38,80,109,.8)` |
| `--on-tab` | `#1f4560` |
| ink accents | `--sky-ink:#2e7fb2` `--salmon-ink:#b15870` `--apricot-ink:#3f7fa8` `--lilac-ink:#8296d8` `--mint-ink:#3fae7d` |
| `--fc-ink` | `#5f9cc4` |
| `--cam-glyph` | `rgba(255,175,195,.7)` |
| `--event-past-line` | `#c6d5e2` |
| `--panel-line` | `#e6eef6` |

### cinnamoroll-dark (dark pastel)

| Property | Value |
|---|---|
| `--bg` | `#0b1421` |
| `--apricot` | `#78b7d8` |
| `--salmon` | `#d891ab` |
| `--lilac` | `#8e99c5` |
| `--sky` | `#76b8d9` |
| `--gold` | `#c9a96e` |
| `--mint` | `#74b99d` |
| `--ink` | `#0b1824` |
| `--muted` | `#a4bad0` |
| `--panel-bg` | `#111d2d` |
| `--row` / `--row-2` | `#18283b` / `#21354b` |
| `--text` / `--text-2` | `#edf7ff` / `#a4bad0` |
| `--on-header` / soft / dim | `#0b2131` / `rgba(11,33,49,.62)` / `rgba(11,33,49,.82)` |
| `--on-tab` | `#0b1c2a` |
| ink accents | `--sky-ink:#8ed8f5` `--salmon-ink:#ffb5c7` `--apricot-ink:#8ed8f5` `--lilac-ink:#c3caff` `--mint-ink:#96e2c0` |
| `--fc-ink` | `#a9d8f1` |
| `--cam-glyph` | `rgba(183,224,245,.75)` |
| `--event-past-line` | `#47627d` |
| `--panel-line` | `#2b4057` |

## Character styling (shared by both cinnamoroll themes)

Both cinnamoroll themes set `--character-theme: 1` and share one selector block (`.shell[data-theme="cinnamoroll"], .shell[data-theme="cinnamoroll-dark"]`):

- `.panel` - `border: 1px solid var(--panel-line); border-radius: 14px`
- `.tab` - `border-radius: 14px 0 0 0`
- `.camera, .camera-frame` - `border-radius: 0 0 12px 12px`

`lcars` deliberately keeps its hard-edged LCARS geometry (no panel borders, plain clipped tabs). `cinnamoroll-dark` adds two extras: `.panel { box-shadow: 0 8px 24px rgba(0,0,0,.18) }` and `.mascot { filter: drop-shadow(0 0 12px rgba(126,200,230,.35)) }`.

## Mascot contract (immutable, tag-pinned)

- The mascot is `assets/cinnamoroll.png` - 460×318 px, 70,001 bytes, shipped at v0.1.14 as the optimized art. Do not re-export, recolor, or replace it in a new release; the file is a fixed asset referenced by an immutable URL.
- Injection: only when `theme.startsWith("cinnamoroll")`, the shell's last child is `<img class="mascot" src="https://cdn.jsdelivr.net/gh/StackShard/lcars-home-card@v${VERSION}/assets/cinnamoroll.png" alt="Cinnamoroll keeps watch over the house" />`. Because the URL is built from the panel's own `VERSION` constant, the mascot is always served from exactly the tag the card was released under - a release can never drift between panel code and art.
- Styling: `position:absolute; right:16px; bottom:58px; width:128px; height:auto; pointer-events:none; z-index:1` - it floats over the content, never intercepts taps, and sits above the footer band.

## Adding a new theme (constrained surface)

Theming is deliberately narrow - it is a palette swap, not a layout switch:

1. Add the key to `SUPPORTED_THEMES` in `src/lcars-home-panel.js` (a source-contract test pins this set).
2. Add a `.shell[data-theme="<key>"]` rule overriding the custom properties from the table above - cover **every** property; missing ones leak the base (`lcars`) value.
3. If the theme is a character skin, include it in the shared character-styling selector and, if desired, in the mascot injection condition.
4. Keep the same token roles; tests and layout assume the property names above.
5. Preview via the harness: `python3 -m http.server 8124 --bind 127.0.0.1` plus `harness.html?theme=<key>` (see ARCHITECTURE.md § Local harness).
