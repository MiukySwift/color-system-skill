#!/usr/bin/env python3
"""Generate one opaque palette with five foreground/background contrast views."""

import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

from color_system import STEPS, contrast, mix, read_json, write_text

CONTRAST_VIEWS = (
    ("white", "White text / Step fill"),
    ("black", "Black text / Step fill"),
    ("stepOnWhite", "Step text / White fill"),
    ("stepOnBlack", "Step text / Black fill"),
    ("seedOnStep", "Seed text / Step fill"),
)


def generate_palette(color, name="Color", include_850=False):
    if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        raise ValueError("Color must use #RRGGBB; alpha and shorthand are not supported")
    if not isinstance(name, str) or not name.strip() or len(name) > 80 or any(ord(c) < 32 for c in name):
        raise ValueError("Name must contain 1–80 characters without control characters")
    if not isinstance(include_850, bool):
        raise ValueError("include850 must be boolean")
    steps = dict(STEPS)
    if include_850:
        steps[850] = (3, 0)
    rows = []
    for step, (weight, background) in sorted(steps.items()):
        value = {"hex": mix(color, weight, background), "alpha": 1}
        records = {}
        for label, foreground, fill in (
                ("white", "#FFFFFF", value["hex"]),
                ("black", "#000000", value["hex"]),
                ("stepOnWhite", value["hex"], "#FFFFFF"),
                ("stepOnBlack", value["hex"], "#000000"),
                ("seedOnStep", color.upper(), value["hex"])):
            ratio = contrast({"hex": foreground, "alpha": 1}, {"hex": fill, "alpha": 1})
            records[label] = {"foreground": foreground, "background": fill, "ratio": ratio,
                              "normalTextPass": ratio >= 4.5, "largeTextPass": ratio >= 3}
        rows.append({"step": step, **value, "contrast": records})
    return {"schemaVersion": "single-palette-1.1.0", "method": "srgb-channel-mix-half-up-v2",
            "name": name.strip(), "seed": color.upper(), "include850": include_850,
            "swatches": rows,
            "auditScope": "Five opaque text/fill views per step: white and black text on the step; step text on white and black; fixed original seed text on the step. Reversed pairs have identical WCAG ratios but different visual examples. Black and white are 100%. Unrounded sRGB ratios determine normal text >=4.5 and large text >=3; no semantic on-color selection or overall conformance is implied."}


def validate_palette(data):
    if not isinstance(data, dict):
        raise ValueError("Palette must be a JSON object")
    expected = generate_palette(data.get("seed"), data.get("name"), data.get("include850"))
    canonical = lambda v: json.dumps(v, sort_keys=True, ensure_ascii=False, allow_nan=False)
    if canonical(data) != canonical(expected):
        raise ValueError("Palette does not match its seed, steps, or contrast records; regenerate it")
    return data


def palette_html(data):
    validate_palette(data)
    esc = html.escape
    rows = []
    for row in data["swatches"]:
        cells = []
        for key, _ in CONTRAST_VIEWS:
            c = row["contrast"][key]
            status = "Normal text" if c["normalTextPass"] else "Large text only" if c["largeTextPass"] else "Below text thresholds"
            cells.append(f'<td><span class="sample" style="background:{c["background"]};color:{c["foreground"]}">Aa</span><strong>{c["ratio"]:.2f}:1</strong><small>{status}</small></td>')
        rows.append(f'<tr><th scope="row">{row["step"]}{" · Seed" if row["step"] == 500 else ""}</th><td><span class="chip" style="background:{row["hex"]}"></span><code>{row["hex"]}</code></td>{"".join(cells)}</tr>')
    headings = "".join(f"<th>{title}</th>" for _, title in CONTRAST_VIEWS)
    return f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(data["name"])} — Single-color palette</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f5f5f5;color:#181818;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1800px;margin:48px auto;padding:32px;background:white;border-radius:16px}}h1{{margin:0 0 8px}}p{{color:#555}}.scroll{{overflow-x:auto}}table{{width:100%;min-width:1560px;border-collapse:collapse;text-align:left}}th,td{{padding:14px 18px;border-bottom:1px solid #ddd;vertical-align:middle}}thead{{font-size:14px;color:#555}}.chip,.sample{{display:inline-flex;width:64px;height:44px;border:1px solid #8080804d;border-radius:6px;vertical-align:middle;margin-right:12px;align-items:center;justify-content:center}}.sample{{font-size:20px;font-weight:600}}code,strong{{font-variant-numeric:tabular-nums}}small{{display:block;margin-top:4px;color:#555}}footer{{margin-top:24px;color:#555;font-size:14px}}@media print{{body{{background:white}}main{{margin:0;padding:0}}}}
</style><main><h1>{esc(data["name"])} / Single-color palette</h1>
<p>Seed {data["seed"]} · {len(data["swatches"])} opaque steps · 500 preserves the seed.</p>
<div class="scroll"><table><thead><tr><th>Step</th><th>Opaque fill</th>{headings}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>
<footer>Seed text stays {data["seed"]} for every row. Reversing text/fill gives the same ratio; samples show each actual use. Black and white are 100%. WCAG 2.2 text thresholds: normal ≥4.5:1; large ≥3:1 (24 CSS px regular / 18.67 CSS px bold). Ratios display two decimals; unrounded values determine status. Color mixing uses sRGB channels with final half-up rounding. These are pairwise text checks, not overall WCAG conformance.</footer></main></html>'''


def palette_code(data):
    validate_palette(data)
    renderer = Path(__file__).with_name("figma_palette.js").read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=True, allow_nan=False)
    snapshot = hashlib.sha256((payload + renderer).encode()).hexdigest()[:16]
    return ("const PALETTE = " + payload + ";\n" + renderer
            + "\nreturn await createSinglePalette(figma, PALETTE, " + json.dumps(snapshot) + ");\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    gen = commands.add_parser("generate")
    gen.add_argument("--color", required=True)
    gen.add_argument("--name", default="Color")
    gen.add_argument("--include-850", action="store_true", help="Add the neutral-specific 850 step")
    gen.add_argument("--output", required=True)
    gen.add_argument("--html", help="Optional standalone visual table")
    check = commands.add_parser("validate")
    check.add_argument("file")
    code = commands.add_parser("figma-code")
    code.add_argument("file")
    code.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        if args.command == "generate":
            data = generate_palette(args.color, args.name, args.include_850)
            if args.html and Path(args.html).resolve() == Path(args.output).resolve():
                raise ValueError("JSON and HTML output paths must differ")
            write_text(args.output, json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
            if args.html:
                write_text(args.html, palette_html(data))
        else:
            data = validate_palette(read_json(args.file))
            if args.command == "figma-code":
                write_text(args.output, palette_code(data))
        print(json.dumps({"status": "ok", "seed": data["seed"], "steps": len(data["swatches"])}))
    except (ValueError, TypeError, KeyError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
