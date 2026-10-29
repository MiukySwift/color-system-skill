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

## Installation

Keep `SKILL.md`, `agents/`, `references/`, and `scripts/` together in your AI tool's skill directory. For Codex on macOS/Linux, you can link this checkout by running from the repository root:

```bash
mkdir -p "$HOME/.agents/skills"
ln -s "$PWD" "$HOME/.agents/skills/color-system"
```

If an entry already exists, inspect its target before replacing it. Claude Code can use the same checkout through `~/.claude/skills/color-system`. Keep one active installation per tool and keep the checkout at a stable location. Restart the tool after changing installation or configuration; start a new session after editing skill instructions.

## Test

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/test_figma_guide_text.cjs
node tests/test_figma_palette.cjs
```

The Python tests also exercise the Figma bridge mock through Node.js. No live Figma write is performed by these tests.

## License

No license is granted by this repository unless a LICENSE file is added.
