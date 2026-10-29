# Single-Color Palette

## Input and Scope

Single-color mode delivers only an editable palette on the Figma canvas. Never create or modify Variables, Variable Collections, or semantic modes in this workflow.

Ask only for one missing original color in `#RRGGBB` form. A palette name is optional; use `Color` when none is supplied. Do not suggest a HEX value, copy another palette, require system role colors, or infer missing colors from past runs. An explicitly selected Figma swatch can supply the color; resolve solid paint opacity to 100% or ask for the intended opaque seed rather than discarding alpha silently.

Generate 11 opaque steps: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950. Use the same sRGB channel mixing and final half-up rounding as the full system; 500 is the original seed. Only when the user explicitly requests a neutral palette, include 850 using 30% seed over black. Black/White input colors are allowed; repeated end values are valid and must not be artificially altered.

## Five Contrast Views

For every opaque step, show these five directed text/fill examples with Aa samples, ratios, and text status:

| Record | Text foreground | Background fill |
| --- | --- | --- |
| `white` | Pure white | Current step |
| `black` | Pure black | Current step |
| `stepOnWhite` | Current step | Pure white |
| `stepOnBlack` | Current step | Pure black |
| `seedOnStep` | Original seed, fixed at 500 | Current step |

White is **#FFFFFF at 100%** and black is **#000000 at 100%**, not black90. Keep the seed-text foreground identical in every row; only its background changes. Seed text on step 500 has contrast 1:1 and must be shown as below text thresholds.

WCAG contrast is symmetric for two opaque colors: white text on a step and step text on white have the same ratio, as do the reversed black pairs. Still display separate samples and columns to make each visual use clear. Count these as five directed views per step (55 for 11 steps; 60 with 850), not five distinct ratio calculations.

Store unrounded WCAG sRGB ratios and text status: normal text ≥4.5:1; large text ≥3:1. Display two decimals without rounding before pass/fail comparison. Pure-black results must not be used to assert that black90 passes or to change semantic on-color mappings. No on-color selection is performed here.

## Local Generation

Resolve scripts relative to the skill directory. Substitute the user's actual color and chosen paths; no seed value is bundled. Use separate output paths for different runs, and do not overwrite existing files unless requested.

```bash
python3 scripts/single_palette.py generate --color "$PALETTE_SEED" --name "$PALETTE_NAME" --output /path/to/single-palette.json
python3 scripts/single_palette.py validate /path/to/single-palette.json
```

Add `--include-850` for an explicitly requested neutral palette. The generator uses only the standard library and shares calculation functions with `color_system.py`.

The JSON contract `single-palette-1.1.0` contains `method`, `name`, `seed`, `include850`, and ordered `swatches`. Each swatch contains `step`, `hex`, `alpha: 1`, and all five `contrast` records above, each with explicit `foreground`, `background`, `ratio`, `normalTextPass`, and `largeTextPass`. Regenerate older standalone palette JSON from its explicitly supplied seed before using this renderer. Validation recomputes the complete palette and rejects changed colors, ratios, flags, missing or extra fields. This is a standalone palette contract, not a full `color-system.json` or a direct Figma Variables import file.

Use JSON as an internal calculation artifact for the canvas renderer; do not offer JSON or HTML downloads by default. The canvas table shows each step, an actual color sample and HEX, the five directed Aa text/fill samples, contrast ratios, and text status. The optional `--html` export remains available only for an explicit file-export request.

## Figma Canvas Board

Reuse a Figma destination established in the current task; if none is available, ask for the target Figma Design file before rendering. A supplied destination authorizes the requested standalone palette board. Load the current Figma `figma-use` and `figma-generate-design` guidance, establish `create_session`, and inspect the destination before writing. Follow required design-system discovery without importing Library colors: these swatches must use the user's computed palette values.

Generate the complete executable script:

```bash
python3 scripts/single_palette.py figma-code /path/to/single-palette.json --output /path/to/figma-palette.js
```

If the target specifies a node on another page, resolve its page and prepend one awaited `figma.setCurrentPageAsync(page)` before the script; do not rely on page context persisting across MCP calls. Execute its full contents through `use_figma` in the selected Design file. It appends a white editable board to the current page, away from existing nodes, without creating or modifying Variables, components, or prior guides. Use one 1728 px-wide board with seven aligned columns: Step, Opaque Fill, White Text / Step Fill, Black Text / Step Fill, Step Text / White Fill, Step Text / Black Fill, and Seed Text / Step Fill. Each contrast column has its actual Aa sample, ratio, and text status. Include the fixed seed HEX and an explanation of symmetric contrast ratios in the footer. Swatch borders are #808080 at 30%; text has fixed width and auto/Hug height. Content is editable text and shapes, not a flattened screenshot.

The script returns actual IDs and structural validation. An identical verified board on the current page is reused; a changed board fails verification rather than being silently overwritten. Save the unwrapped result with target `fileKey` to `figma-palette-result.json`. After an interrupted call, inspect the actual canvas and returned IDs before retrying; cleanup applies only to nodes created by that call. Do not treat a failed or interrupted call as a completed board.

Inspect the board with a screenshot before claiming visual completion. Check all color samples, row alignment, legibility, and absence of clipping or overlap; repair only the affected new board. If Figma writes are unavailable, retain internal calculation artifacts, explain the connection limitation, and state that canvas delivery remains incomplete. Do not silently substitute HTML or file exports for the requested Figma board.

## Delivery

Report the supplied seed, number of steps, meanings of all five text/fill views, actual Figma board link, and visual review result. Keep internal JSON and JavaScript paths out of the default delivery. Pairwise contrast checks do not establish overall WCAG conformance. Do not publish the skill or generate a full system as a side effect.
