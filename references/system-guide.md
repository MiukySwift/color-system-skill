# System Guide Layout and Validation

## Deliverable

A standard Figma delivery includes an editable `System Guide` page. Create a uniquely named snapshot root with nine numbered boards in a three-column grid. Keep the source swatches intact. Use actual local Variables from the verified import ledger; never substitute Library colors or paint resolved token values without bindings.

| Board | Contents |
| --- | --- |
| 01 Color foundations | Five role cards; optional Link sharing; counts; generation and semantic rules |
| 02 Opaque primitives | Neutral and chromatic ladders in aligned 50–950 columns; Neutral alone has 850; mixing weights and HEX values |
| 03 Black & White alpha | All twenty variables; alpha percentage; single checkerboard samples; unchanged RGB/alpha values |
| 04 Brand & Surface | Every Brand/Surface token, paired Light and Dark panels |
| 05 Font | All text tokens; bound text samples; contrast ranges across the three opaque Surfaces |
| 06 Notice / Solid | Five solid fill/on-color pairs per mode, with actual paired contrast |
| 07 Notice / Subtle | Five subtle background/on-color pairs per mode, with actual paired contrast |
| 08 Lines | Actual border/focus stroke samples; ranges across three opaque Surfaces |
| 09 Contrast review | Complete lists of normal-text and necessary-boundary failures; thresholds, usage context, and limitations |

## Visual Format

- Boards: 1440 × 1080; padding 56; board gap 80. Semantic panels: 652 wide, 24 apart, 20 internal padding.
- Use Inter Regular/Medium/Bold and JetBrains Mono Regular/Medium. Discover and load exact font styles before mutations. Use 34 px board titles, 14 px descriptions, and 9–14 px token metadata according to density. Retain whitespace and full captions.
- All text nodes must have `textAutoResize = HEIGHT`, `layoutSizingVertical = HUG`, and a fixed positive width. A visible text node must never have a one-pixel box. Use the shared `setGuideTextLayout` helper in the renderer, and do not call `resize` on text afterward.
- Use auto-layout for all related content. For wrapping text, append to its parent, set width with `resize`, then set `textAutoResize = HEIGHT`, characters, and vertical `HUG`. Setting a one-pixel height after auto-resize can leave visible glyphs overlapping while geometry appears valid.
- Every token needs a bound sample, token name, and actual HEX/alpha caption. Every Semantic token also needs its Primitive alias and CSS `var(...)` name. The compact Primitive grid can omit CSS names.
- Fill swatch outlines are always `#808080` at 30%. Lines samples bind the actual token to the stroke. Show transparent fills as one complete color over a tiled checkerboard image. The outer frame owns the 6 px radius, clipping, and the single 1 px `#808080 / 30%` outline. The foreground color rectangle has no stroke and zero corner radius; set both layout sizing axes to `FILL` so it continuously covers the complete image background. Set `strokesIncludedInLayout = false` on the outer frame so its outline does not inset the color layer and expose the checkerboard around its edges; never use split white/black halves or a square black underlay behind rounded color. Checkerboard colors are documentation chrome, not palette seeds; use explicit Semantic Light/Dark modes on their panels.
- Role names describe input intent; family paths remain `brand`, `neutral`, `red`, `green`, and optional `blue`. Preserve that distinction in labels.

## Contrast Interpretation

Evaluate normal text at 4.5:1, large text at 3:1, and necessary non-text boundaries at 3:1. Large means regular at least 24 CSS px or bold at least 18.67 CSS px. Decorative lines require a purpose-specific judgment. Ranges on Font/Lines panels cover background, primary, and secondary opaque Surfaces; Notice rows use their named paired fill. Transparent samples are composited before evaluation.

Use unrounded ratios to decide status; two-decimal display is for reading. Explain where a token requires large text or another restricted use. Do not alter aliases to hide failures, describe failed normal-text combinations as compliant, or imply contrast alone establishes overall WCAG conformance.

## Identity, Updates, and Recovery

`guide-code` accepts only canonical validated JSON and a verified import ledger covering every token with unique IDs and complete modes. It emits a self-contained script within the MCP input limit. Its snapshot identity includes both JSON and renderer content, so a layout revision is a new snapshot.

Before drawing, the renderer verifies current values/aliases, IDs, collections, modes, scopes, and WEB syntax. Empty reverse-inventory metadata produces an explicit warning only when all expected exact IDs pass; missing or different exact-ID data stops generation. The renderer creates no Variables.

An identical existing snapshot is checked and reused. A duplicate or altered same-snapshot root returns a conflict; it is never silently overwritten. On a handled failure, remove only objects created by that call. Preserve returned IDs externally, including failed-call cleanup evidence. After a transport error, inspect the actual canvas before retrying.

Swatches remain linked to Variables. HEX, alpha, alias, CSS, and contrast captions represent the generation snapshot and do not recalculate themselves in Figma. Regenerate the Guide after changing Variables; keep or replace an older snapshot only within the user's requested scope.

## Completion Checks

Structural verification checks all nine board sizes, every Primitive and Semantic mode sample, all required captions and bindings, explicit Semantic modes, swatch outlines, text heights, mandatory Hug/auto-height settings, child bounds, and sibling overlap. It returns every created node ID and all board IDs. Save the unwrapped result with fileKey and source JSON path.

After a repair or renderer change, read the text sizing settings back in a separate MCP call to verify persisted state. Identify the exact reviewed root by ID; do not mistake a newer root for an older one that still contains broken text. When fixing an existing Guide, repair that Guide in place or explicitly replace its exact root so the user reaches the corrected canvas.

Take screenshots of every board at readable resolution. Check full token names/values, line wrapping, alpha rendering over the checkerboard and clean rounded corners, Light/Dark appearance, paired Notice foregrounds, and spacing. Repair focused defects and recheck affected boards. Record the visual outcome separately from structural `verified` status; stop once both pass.
