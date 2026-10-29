# Generation Rules and JSON Contract v3

This skill is self-contained. Seed colors come from the user. No suggested palette is bundled. When changing the rules, update the generator and contract version together, then verify the affected calculations and aliases.

## Role Inputs

Required input fields are `brand`, `neutral`, `error`, and `success`. `link` is optional. Each supplied field must be a six-digit HEX string in `#RRGGBB` format. Omit `link` when unused. Reject unknown fields, missing required roles, alpha HEX, shorthand HEX, null, and empty strings.

| Input role | Primitive family | Semantic use |
| --- | --- | --- |
| Brand | brand | Brand fills, accent text and states, default focus |
| Neutral | neutral | Surfaces, neutral notices, neutral lines |
| Error | red | Error text, notices, borders, focus |
| Success | green | Success text, notices, borders, focus |
| Link, if supplied | blue | Independent link text, notices, borders |
| Link, if omitted | brand | Link semantics reuse the Brand family |

`red`, `green`, and `blue` are primitive path names. They do not impose a hue or provide a default value. Input colors are requested by role. When Link is omitted, do not create a blue family; retain all Link semantic names as direct aliases to Brand primitives. If the user explicitly supplies Link equal to Brand, retain the separate family so it can be adjusted independently.

## Primitive

For each sRGB 8-bit channel, compute `C = floor((a×B + (10−a)×S + 5) / 10)`, where `a` is the seed weight in tenths and `S` is white 255 or black 0. Do not linearize first or round intermediate values. Integer arithmetic implements half-up rounding for nonnegative values; a fractional channel ending in .5 rounds upward.

| Step | a | Background |
| --- | ---: | --- |
| 50 / 100 / 200 / 300 / 400 | 1 / 2 / 4 / 6 / 8 | White 255 |
| 500 | 10 | Original seed |
| 600 / 700 / 800 / 900 / 950 | 8 / 6 / 4 / 2 / 1 | Black 0 |
| 850, Neutral only | 3 | Black 0 |

Neutral has 12 opaque steps; each chromatic family has 11. With independent Link, there are 56 opaque colors; without it, there are 45. All have alpha=1.

Black and White each have 10 alpha steps, adding 20 colors. `black/10` through `black/90` mean 10% through 90% opacity; `black/solid` means 100% opaque black. White follows the same naming. `solid` names the opaque seed without a 100% suffix. These numbers indicate opacity, rather than Neutral's light/dark palette steps. Black/White are the only fixed seed colors.

## Semantic

F denotes the primitive family assigned to a role. Unqualified black/white mean solid. All semantic references target Primitive directly.

| Semantic | Light | Dark |
| --- | --- | --- |
| brand/brand | brand500 | brand500 |
| brand/on-brand | On-color rule | On-color rule |
| brand/brand-background | brand50 | brand950 |
| brand/on-brand-background | brand600 | brand400 |
| surface/background | neutral50 | neutral950 |
| surface/primary | white | neutral900 |
| surface/secondary | white | neutral850 |
| surface/scrim | white70 | black70 |
| surface/float | white80 | black80 |
| font/primary, secondary, tertiary | black90, 60, 40 | white90, 60, 40 |
| font/accent, error, success, link | Corresponding F600 | Corresponding F400 |
| notice/{role} | F500 | F500 |
| notice/on-{role} | On-color rule; default stays white | Same rule, evaluated per mode |
| notice/{role}-background | F50 | F900 |
| notice/on-{role}-background | F600 | F400 |
| lines/{role}-border | F100 | F800 |
| lines/divider | neutral100 | neutral800 |
| lines/focus, focus-error, focus-success | brand500, red500, green500 | Same as Light |

Notice and border roles are default→neutral, error→red, success→green, accent→brand, and link→blue if supplied, otherwise brand. Font uses the last four chromatic roles. There are always 45 semantic variables and 90 mode aliases.

Evaluate the on-color rule separately per mode: calculate contrast between chromatic F500 and each of `surface/background`, `surface/primary`, and `surface/secondary`. If the minimum is strictly less than 2, use black90; otherwise use white/solid. This affects only brand/on-brand and the four chromatic notice/on-{role} variables, leaving foregrounds on subtle backgrounds unchanged. Shared Brand/Link use the same on-color decision but keep distinct semantic names.

Primitive scopes are empty arrays so component property pickers favor semantic colors. Surface and fills use FRAME_FILL/SHAPE_FILL; Font uses TEXT_FILL; on-color foregrounds use TEXT_FILL/SHAPE_FILL/STROKE_COLOR; Lines use STROKE_COLOR. WEB code syntax has a layer prefix, such as `var(--color-semantic-font-accent)`. This naming convention does not imply those CSS variables already exist in application code.

## Data Structure

This is a **custom interchange format**, not a claim of DTCG compliance or native Figma import compatibility. The bundled bridge replaces logical aliases with actual Figma Variable IDs during import.

| Field | Contract |
| --- | --- |
| schemaVersion | `3.0.0` |
| method | `srgb-channel-mix-half-up-v2` |
| collectionPrefix | Optional collection name prefix; empty string if unused |
| seeds | User-supplied role colors, normalized to uppercase; omitted Link stays absent |
| roleFamilies | default, error, success, accent, and link mapped to their actual primitive families |
| collections | Primitive with Value mode, followed by Semantic with Light/Dark modes |
| collections[].variables[] | name, COLOR type, scopes, WEB codeSyntax, and values by mode |
| Primitive values | hex and alpha |
| Semantic values | alias in `primitive:family/step` form, or a Black/White path |
| onColorSelection | Per-mode contrast evidence and chosen on-color alias for each chromatic family |
| contrastAudit | Text and line records, plus per-mode summaries |
| auditScope | The explicit limits of the included contrast checks |

`validate` regenerates the data from seeds and prefix and checks every field, rejecting dangling aliases, missing fields, incorrect alpha, manual drift, or duplicate JSON keys. v3 uses role-based inputs, the `neutral` family, and optional Link; older contracts must be regenerated from explicitly supplied role colors. Custom rules require a method version update rather than manual edits to the current JSON.

## Contrast Records

Composite transparent foregrounds onto opaque backgrounds, retain floating-point precision, and then apply the WCAG sRGB relative luminance formula. Do not quantize composited values to 8-bit. Evaluate thresholds with unrounded ratios; display values may use two decimals.

- Text: 19 items per mode (Font 7, Brand foregrounds 2, Notice foregrounds 10), checked against the three Surfaces or their corresponding fill. Record normal text ≥4.5 and large text ≥3.
- Lines: 9 items per mode, checked against the three Surfaces. The ≥3 threshold applies to necessary non-text visual information; decorative lines are not automatically failures.
- Large text means at least 18pt regular (approximately 24 CSS px) or 14pt bold (approximately 18.67 CSS px).
- Scrim/float, images, gradients, and actual UI adjacency need separate checks. JSON does not infer their underlying backgrounds or claim overall WCAG conformance.
- Compute pass/fail counts from the actual user colors. Do not embed fixed contrast results or silently alter mappings to make them pass.
