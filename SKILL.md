---
name: color-system
description: Generate either a complete Light/Dark color system from role seeds or a single-color tonal palette with white, black, and fixed-seed text/fill contrast checks. Deliver JSON and visual color tables, with Figma Variables and a System Guide for full systems or an editable standalone Figma palette.
metadata:
  group: med
  manager: miuky
  version: "2.0.2"
  release_notes: "Repackage the skill from its standalone source repository; generation behavior is unchanged."
  command_only: false
---

# Color System

Generate a complete color system or a single-color tonal palette from user-supplied colors. Use the user's language for intake and delivery; keep these skill instructions in English.

## Choose the Generation Mode

At a bare startup, ask the user to choose:

1. **Full color system** — Brand, Neutral, Error, Success, and optional Link; Light/Dark semantic aliases, Variables, and a System Guide.
2. **Single-color palette** — one original color; show opaque tonal steps with five contrast views: white/black text on each step, each step as text on white/black, and the fixed original seed as text on each step. Figma canvas only; no Variables.

If the request already specifies a mode, honor it without asking again. If exactly one color is supplied without an explicit full-system request, select single-color mode and generate its palette directly; do not demand the other role colors. A single role supplied as part of an explicit full-system request remains full-system input.

For **single-color mode**, read [references/single-color.md](references/single-color.md) and follow only that workflow. Deliver only an editable palette board on the user-selected Figma canvas. JSON and JavaScript are internal calculation and rendering artifacts, not default user deliverables. Do not create or modify Variables, Variable Collections, or semantic modes in single-color mode. Do not load the full-system import or nine-board Guide workflow.

The remaining sections describe **full-system mode**. A standard Figma delivery includes local Variables and a fixed visual System Guide. JSON-only and Variables-only requests retain their narrower scope.

## Requirements

Use Python 3.9 or later; the generator needs only the Python standard library. Figma delivery also requires an authenticated Figma MCP connection exposing writable `create_session` and `use_figma` tools and access to the target Design file. Full-system Variables additionally require support for two Semantic modes. JSON generation works independently of Figma.

## Collect Role Colors

Ask for these inputs without suggesting or pre-filling color values:

| Input | Required | Purpose |
| --- | --- | --- |
| Brand | Yes | Primary brand color and emphasis |
| Neutral | Yes | Neutral base color for backgrounds and surfaces |
| Error | Yes | Errors, failures, and invalid states |
| Success | Yes | Success and valid states |
| Link | Optional | A separate color for links and navigation |

- Ask only for missing inputs, using the role names Brand, Neutral, Error, Success, and Link. Do not ask the user for Red, Green, or Blue.
- State that Link is optional. If the user supplies the four required roles without Link, omit the independent Link seed and reuse the Brand palette for Link semantics. Do not invent a Link color. The user can provide a separate Link color when independent styling is needed.
- Accept each supplied color as `#RRGGBB`. Write input JSON using `brand`, `neutral`, `error`, `success`, and optionally `link`. Omit `link` entirely when unused; do not write null, an empty string, or a placeholder.
- Never silently source missing colors from bundled data, documents, prior palettes, or unconfirmed files. An explicitly selected input file is valid input. Shared HEX values are allowed while keeping each semantic role.
- A user-selected Figma file can be both the color source and destination. Read current swatch fills; use explicit labels or a role assignment already established for this task. If unlabeled swatches make the roles ambiguous, ask only about those roles. Record node IDs, actual HEX values, and the assignment in `input-source.json`.
- Black and White are fixed pure black and pure white; do not ask the user to choose them.

## Task Scope

Import requires a user-selected Figma Design file or URL. Reuse a target already established in the current task; do not choose a destination from a reference or past task.

When the user asks for a fresh run without earlier records, read inputs and inventory again; use a new output directory and distinct collection prefix for this run rather than old import IDs. Do not delete prior assets unless asked.

A request to modify this skill changes the skill. A request to generate JSON produces files. A request to create variables in a specified Figma file includes import. This skill operates on **actual local Variables**; respect any restriction to canvas illustrations or instructions to leave Variables untouched.

## Generate and Validate

Resolve the following paths relative to the **skill directory**. Write the supplied colors to `seeds.json` in the task directory, then run:

```bash
python3 scripts/color_system.py generate --seeds /path/to/seeds.json --output /path/to/color-system.json
python3 scripts/color_system.py validate /path/to/color-system.json
```

To coexist with an existing system, use `generate --prefix 'Product Name'`. Collection names become `Product Name / Primitive` and `Product Name / Semantic`; variable paths remain the same. Do not automatically overwrite existing JSON; use the requested output path or separate directories for different versions.

| Collection | Modes | Variables |
| --- | --- | ---: |
| Primitive, with separate Link | Value | 76: 56 opaque colors and 20 Black/White alpha colors |
| Primitive, Link reuses Brand | Value | 65: 45 opaque colors and 20 Black/White alpha colors |
| Semantic, either case | Light / Dark | 45, with 90 aliases |

The output includes the actual seeds, role-to-family mapping, semantic references, per-mode on-color selection evidence, and text/boundary contrast records. See [references/rules-and-format.md](references/rules-and-format.md) for the complete rules and format.

Key constraints:

- Mix neutral and chromatic seeds in sRGB channel space; apply half-up rounding only to final 8-bit palette values. Only Neutral has step 850. Black/White retain alpha.
- Chromatic text uses 600 in Light and 400 in Dark. Dark secondary uses neutral850; Notice subtle backgrounds use 900; Brand subtle background uses 950. Lines use Light100 / Dark800; focus remains 500.
- If a chromatic seed has contrast `<2` against any opaque Surface in the current mode, select black90 as the foreground on its solid fill; otherwise select white. Neutral's on-default remains white. This rule does not guarantee WCAG AA compliance.
- Store semantic values as aliases. Do not substitute resolved HEX values or change palette steps merely to eliminate contrast failures. Report the intended use and leave adjustments to design decisions.

## Import into Figma

For import, read [references/figma-workflow.md](references/figma-workflow.md). Use the Figma MCP tools and `use_figma` actually exposed in the current session. Do not assume JSON attachments import directly or that a read-only MCP connection supports writes.

1. Validate JSON, generate the `inspect` script, and inspect the target file through MCP for name collisions, mode compatibility, and existing values.
2. If there are no conflicts, generate and execute the `apply` script. It creates collections, modes, and Primitives, establishes Semantic aliases, and reads back actual values, references, scopes, and WEB code syntax.
3. Reuse identical existing data; repeated execution creates no duplicates. A same-name value or alias mismatch returns `conflict` before any writes. Show the differences and use a user-selected separate prefix, or handle an explicitly authorized update separately. The importer does not overwrite existing definitions.
4. Save returned collection/mode/variable IDs and status to `figma-import-result.json` in the task directory, including the actual `fileKey`. Report import completion only when the result is `verified`.
5. Unless the user requested Variables only, generate and execute the System Guide script below. Save its returned IDs and inspect all nine boards visually.

If MCP write tools are unavailable, still deliver JSON and executable scripts and explain the connection limitation; do not claim variables were created. If the account cannot support two modes, report the actual error rather than silently creating two semantic collections.

## Create the System Guide

Read [references/system-guide.md](references/system-guide.md) for the fixed layout, visual conventions, and validation requirements. After a verified import, run:

```bash
python3 scripts/color_system.py guide-code /path/to/color-system.json --ledger /path/to/figma-import-result.json --output /path/to/figma-guide.js
```

Execute the complete script through Figma MCP in the ledger's target file. It checks live values, modes, aliases, scopes, and WEB syntax by exact IDs before drawing. It creates nine editable boards on `System Guide`, with Primitive swatches and paired Light/Dark semantic tables. Every token has a visible sample and value; Semantic rows also show the Primitive alias and CSS name. Transparent samples use one complete Variable-bound color swatch over a tiled checkerboard image, with matching rounded clipping. Do not split a swatch into white/black halves.

Save the unwrapped result to `figma-guide-result.json`. Text must use fixed width with auto-height and vertical Hug; one-pixel or fixed-height text fails validation. After a layout repair, confirm these settings in a separate readback call. A structural `verified` result does not establish visual quality: inspect every board and fix any overlapping, clipped, or unreadable content. Repeated execution reuses an identical verified snapshot. Caption values are generation snapshots; regenerate after changing Variables.

## Delivery

Provide the JSON path, supplied role colors, whether Link is separate or shares Brand, actual collection/variable counts, and a summary of contrast issues in both modes. If imported, include the target Figma link, real ID ledger, and `verified` result. For a standard Figma delivery, include the System Guide root link and visual verification outcome. If only files were generated, state that outcome. Do not modify product components, publish a Library, or commit Git changes unless requested.
