# Color System Skill

An AI skill for generating a Light/Dark color system from role colors, or validating a single color with an editable Figma palette and contrast comparisons.

## Requirements

- Python 3.9+; generation uses only the standard library.
- Node.js to run the JavaScript tests.
- For Figma delivery, access to a writable Figma MCP connection and a target Design file. JSON generation does not require Figma.

## Use

Load `SKILL.md` as a skill in your AI tool. Follow its prompts to choose between a full color system and a single-color palette. The full-system generator can also run directly:

```bash
python3 scripts/color_system.py generate --seeds /path/to/seeds.json --output /path/to/color-system.json
python3 scripts/color_system.py validate /path/to/color-system.json
```

The seeds JSON must contain `brand`, `neutral`, `error`, and `success` colors as `#RRGGBB`; `link` is optional. For single-color operation, see `references/single-color.md`.

## Test

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/test_figma_guide_text.cjs
node tests/test_figma_palette.cjs
```

The Python tests also exercise the Figma bridge mock through Node.js. No live Figma write is performed by these tests.

## Release workflow

This repository is the development source of the skill. After verifying a change, update the version and release notes in `SKILL.md`, commit the change, and tag the release. Configure distinct `github` and `gitee` Git remotes; push the same tag to either or both as needed. Do not use a blind `git push --all` for a selective release.

The company's Skill Market package (`med/color-system`) is a separate distribution channel. Releasing a Git tag does **not** update that package or its versioned TGZ download link. Publish a new package through the authorized Skill Market process before updating documentation to claim a new marketplace version.

No license is granted by this repository unless a LICENSE file is added. Confirm redistribution rights and review the contents before making a remote repository public.
