#!/usr/bin/env python3
"""Generate a color system from Brand, Neutral, Error, Success, and optional Link seeds. Standard library only."""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REQUIRED_SEEDS = ("brand", "neutral", "error", "success")
STEPS = {50: (1, 255), 100: (2, 255), 200: (4, 255), 300: (6, 255),
         400: (8, 255), 500: (10, 0), 600: (8, 0), 700: (6, 0),
         800: (4, 0), 900: (2, 0), 950: (1, 0)}
FILL = ["FRAME_FILL", "SHAPE_FILL"]
FOREGROUND = ["TEXT_FILL", "SHAPE_FILL", "STROKE_COLOR"]
SURFACES = ("surface/background", "surface/primary", "surface/secondary")


def normalize_seeds(seeds):
    if not isinstance(seeds, dict):
        raise ValueError("Seeds must be a JSON object")
    missing = set(REQUIRED_SEEDS) - set(seeds)
    unknown = set(seeds) - set(REQUIRED_SEEDS) - {"link"}
    if missing or unknown:
        raise ValueError(f"Required seed roles: brand, neutral, error, success; link is optional. "
                         f"Missing: {', '.join(sorted(missing)) or 'none'}; "
                         f"unknown: {', '.join(sorted(unknown)) or 'none'}")
    for key, value in seeds.items():
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError(f"{key} must use #RRGGBB; alpha and shorthand are not supported")
    return {role: seeds[role].upper() for role in (*REQUIRED_SEEDS, "link") if role in seeds}


def rgb(hex_value):
    return tuple(int(hex_value[i:i + 2], 16) for i in (1, 3, 5))


def mix(hex_value, tenths, background):
    # Use an integer numerator for exact .5 handling: nonnegative half-up, not Python round.
    values = [(c * tenths + background * (10 - tenths) + 5) // 10
              for c in rgb(hex_value)]
    return "#" + "".join(f"{c:02X}" for c in values)


def composite(foreground, background):
    """Retain floating-point precision for contrast compositing; do not quantize to 8-bit."""
    if background["alpha"] != 1:
        raise ValueError("A final opaque background is required")
    alpha = foreground["alpha"]
    return tuple(f * alpha + b * (1 - alpha)
                 for f, b in zip(rgb(foreground["hex"]), rgb(background["hex"])))


def luminance(channels):
    values = [c / 255 for c in channels]
    linear = [s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
              for s in values]
    return sum(w * c for w, c in zip((0.2126, 0.7152, 0.0722), linear))


def contrast(foreground, background):
    a, b = luminance(composite(foreground, background)), luminance(rgb(background["hex"]))
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def token(name, values, scopes, collection):
    # When no existing code names are available, prefix CSS names by layer to avoid collisions.
    css = f"--color-{collection}-" + name.replace("/", "-")
    return {"name": name, "type": "COLOR", "scopes": scopes,
            "codeSyntax": {"WEB": f"var({css})"}, "values": values}


def generate(seeds, prefix=""):
    seeds = normalize_seeds(seeds)
    # Input roles are independent of primitive family names. Link shares Brand when omitted.
    family_seeds = {"neutral": seeds["neutral"], "brand": seeds["brand"],
                    "red": seeds["error"], "green": seeds["success"]}
    if "link" in seeds:
        family_seeds["blue"] = seeds["link"]
    roles = {"default": "neutral", "error": "red", "success": "green",
             "accent": "brand", "link": "blue" if "link" in seeds else "brand"}
    if not isinstance(prefix, str) or len(prefix) > 80 or prefix != prefix.strip() or any(
            ord(c) < 32 for c in prefix):
        raise ValueError("Collection prefix must be at most 80 characters, without surrounding whitespace or control characters")
    primitive = []
    for family, seed in family_seeds.items():
        steps = dict(STEPS)
        if family == "neutral":
            steps[850] = (3, 0)
        for step, (tenths, background) in sorted(steps.items()):
            value = {"hex": mix(seed, tenths, background), "alpha": 1}
            primitive.append(token(f"{family}/{step}", {"Value": value}, [], "primitive"))
    for family, base in (("black", "#000000"), ("white", "#FFFFFF")):
        for percent in range(10, 101, 10):
            suffix = "solid" if percent == 100 else str(percent)
            primitive.append(token(f"{family}/{suffix}",
                                   {"Value": {"hex": base, "alpha": percent / 100}},
                                   [], "primitive"))
    palette = {t["name"]: t["values"]["Value"] for t in primitive}
    semantic = []

    def add(name, light, dark, scopes):
        semantic.append(token(name, {"Light": {"alias": f"primitive:{light}"},
                                     "Dark": {"alias": f"primitive:{dark}"}},
                              scopes, "semantic"))

    # Define Surfaces first; on-color selection depends on the three opaque Surfaces.
    add("surface/background", "neutral/50", "neutral/950", FILL)
    add("surface/primary", "white/solid", "neutral/900", FILL)
    add("surface/secondary", "white/solid", "neutral/850", FILL)
    add("surface/scrim", "white/70", "black/70", FILL)
    add("surface/float", "white/80", "black/80", FILL)

    def resolve(name, mode):
        t = next(t for t in semantic if t["name"] == name)
        return palette[t["values"][mode]["alias"].split(":", 1)[1]]

    selections = {mode: {} for mode in ("Light", "Dark")}
    for mode in selections:
        for family in family_seeds:
            if family == "neutral":
                continue
            ratios = {s: contrast(palette[f"{family}/500"], resolve(s, mode)) for s in SURFACES}
            alias = "black/90" if min(ratios.values()) < 2 else "white/solid"
            selections[mode][family] = {"surfaceContrasts": ratios, "alias": f"primitive:{alias}"}

    def on(family, mode):
        if family == "neutral":
            return "white/solid"
        return selections[mode][family]["alias"].split(":", 1)[1]

    add("brand/brand", "brand/500", "brand/500", FILL)
    add("brand/on-brand", on("brand", "Light"), on("brand", "Dark"), FOREGROUND)
    add("brand/brand-background", "brand/50", "brand/950", FILL)
    add("brand/on-brand-background", "brand/600", "brand/400", FOREGROUND)
    for name, percent in (("primary", 90), ("secondary", 60), ("tertiary", 40)):
        add(f"font/{name}", f"black/{percent}", f"white/{percent}", ["TEXT_FILL"])
    for role in ("accent", "error", "success", "link"):
        family = roles[role]
        add(f"font/{role}", f"{family}/600", f"{family}/400", ["TEXT_FILL"])
    for role, family in roles.items():
        add(f"notice/{role}", f"{family}/500", f"{family}/500", FILL)
        add(f"notice/on-{role}", on(family, "Light"), on(family, "Dark"), FOREGROUND)
        add(f"notice/{role}-background", f"{family}/50", f"{family}/900", FILL)
        add(f"notice/on-{role}-background", f"{family}/600", f"{family}/400", FOREGROUND)
    for name, family in (("default-border", "neutral"), ("divider", "neutral"),
                         ("error-border", "red"), ("success-border", "green"),
                         ("accent-border", "brand"), ("link-border", roles["link"])):
        add(f"lines/{name}", f"{family}/100", f"{family}/800", ["STROKE_COLOR"])
    for name, family in (("focus", "brand"), ("focus-error", "red"), ("focus-success", "green")):
        add(f"lines/{name}", f"{family}/500", f"{family}/500", ["STROKE_COLOR"])

    audit = {}
    for mode in selections:
        text_rows, line_rows = [], []
        for t in semantic:
            name = t["name"]
            if name.startswith("font/"):
                backgrounds = SURFACES
            elif "/on-" in name:
                category, leaf = name.split("/", 1)
                backgrounds = (category + "/" + leaf.removeprefix("on-"),)
            elif name.startswith("lines/"):
                backgrounds = SURFACES
            else:
                continue
            ratios = {bg: contrast(resolve(name, mode), resolve(bg, mode)) for bg in backgrounds}
            minimum = min(ratios.values())
            row = {"token": name, "contrasts": ratios, "minimum": minimum}
            if name.startswith("lines/"):
                row["necessaryNonTextPass"] = minimum >= 3
                line_rows.append(row)
            else:
                row.update({"normalTextPass": minimum >= 4.5, "largeTextPass": minimum >= 3})
                text_rows.append(row)
        audit[mode] = {
            "text": text_rows, "lines": line_rows,
            "summary": {"textItems": len(text_rows),
                        "normalTextFailures": sum(not r["normalTextPass"] for r in text_rows),
                        "largeTextFailures": sum(not r["largeTextPass"] for r in text_rows)}}

    def collection(key, title, modes, variables):
        return {"key": key, "name": f"{prefix} / {title}" if prefix else title,
                "modes": modes, "variables": variables}

    return {
        "schemaVersion": "3.0.0",
        "method": "srgb-channel-mix-half-up-v2",
        "collectionPrefix": prefix,
        "seeds": seeds,
        "roleFamilies": roles,
        "collections": [collection("primitive", "Primitive", ["Value"], primitive),
                        collection("semantic", "Semantic", ["Light", "Dark"], semantic)],
        "onColorSelection": selections,
        "contrastAudit": audit,
        "auditScope": "Default opaque surfaces and named fill pairs only; overlays and actual UI adjacency require separate checks. Ratios are unrounded; failures do not change mappings or imply full WCAG conformance."
    }


def validate(data):
    """Regenerate the contract from its seeds; reject missing data, dangling aliases, or value/mapping drift."""
    if not isinstance(data, dict):
        raise ValueError("color-system.json must be a JSON object")
    expected = generate(data.get("seeds"), data.get("collectionPrefix", ""))
    # Compare canonical serialization, not Python equality, to catch True == 1, extra fields, and NaN.
    def canonical(value):
        return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)
    if canonical(data) != canonical(expected):
        raise ValueError("File does not match v3 rules: regenerate it rather than manually changing aliases, colors, or audit records")
    return data


def read_json(path):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding="utf-8"), object_pairs_hook=unique_pairs)


def write_text(path, text):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def figma_code(data, operation):
    validate(data)
    # Keep audit records local; send only variable data needed for creation and verification.
    payload = {"schemaVersion": data["schemaVersion"], "collections": data["collections"]}
    bridge = Path(__file__).with_name("figma_bridge.js").read_text(encoding="utf-8")
    return ("const COLOR_SYSTEM = " + json.dumps(payload, ensure_ascii=True, allow_nan=False) + ";\n"
            + bridge + "\nreturn await syncColorSystem(figma, COLOR_SYSTEM, "
            + json.dumps(operation) + ");\n")


def guide_code(data, ledger):
    """Build an editable, variable-bound guide using a verified import ledger."""
    validate(data)
    if not isinstance(ledger, dict) or ledger.get("status") != "verified" or not ledger.get("fileKey"):
        raise ValueError("Guide generation requires a verified Figma import ledger with fileKey")
    expected = {f"{c['key']}:{v['name']}" for c in data["collections"] for v in c["variables"]}
    ids = ledger.get("variableIds", {})
    if set(ids) != expected or any(not isinstance(value, str) or not value for value in ids.values()):
        raise ValueError("Import ledger variable IDs do not match this color system")
    if len(set(ids.values())) != len(ids):
        raise ValueError("Import ledger contains duplicate variable IDs")
    if set(ledger.get("collectionIds", {})) != {"primitive", "semantic"}:
        raise ValueError("Import ledger must identify both collections")
    mode_ids = ledger.get("modeIds", {})
    if set(mode_ids.get("primitive", {})) != {"Value"} or set(mode_ids.get("semantic", {})) != {"Light", "Dark"}:
        raise ValueError("Import ledger mode IDs are incomplete")
    renderer = Path(__file__).with_name("figma_guide.js").read_text(encoding="utf-8")
    fingerprint = hashlib.sha256((renderer + json.dumps(data, sort_keys=True, ensure_ascii=True,
                                                       allow_nan=False)).encode()).hexdigest()[:16]
    ordered_keys = [f"{c['key']}:{v['name']}" for c in data["collections"] for v in c["variables"]]
    options = {"fileKey": ledger["fileKey"], "variableIds": [ids[key] for key in ordered_keys],
               "collectionIds": ledger["collectionIds"], "modeIds": mode_ids,
               "guideVersion": "1.0.3", "snapshot": fingerprint,
               "rootName": f"System Guide / Color / v1 / {fingerprint}"}
    # Keep the MCP script below its 50,000-character input limit without losing values or aliases.
    model = {"seeds": data["seeds"], "roleFamilies": data["roleFamilies"],
             "collections": [{"key": c["key"], "name": c["name"], "variables": [
                 {key: v[key] for key in ("name", "values")}
                 for v in c["variables"]]} for c in data["collections"]],
             "contrastAudit": {}}
    for mode, audit in data["contrastAudit"].items():
        model["contrastAudit"][mode] = {
            category: [{**{k: v for k, v in row.items() if k not in {"minimum", "contrasts"}},
                        "contrasts": list(row["contrasts"].values())} for row in audit[category]]
            for category in ("text", "lines")}
    # The renderer has no multiline string literals; trim indentation and standalone comments for transport.
    packed_renderer = "\n".join(line.strip() for line in renderer.splitlines()
                                if line.strip() and not line.lstrip().startswith("//"))
    result = ("const COLOR_SYSTEM = " + json.dumps(model, ensure_ascii=True, separators=(",", ":"), allow_nan=False) + ";\n"
              + "const GUIDE_OPTIONS = " + json.dumps(options, ensure_ascii=True, separators=(",", ":")) + ";\n"
              + packed_renderer + "\nconst keys = COLOR_SYSTEM.collections.flatMap(c => c.variables.map(v => c.key+':'+v.name));\n"
              + "const imported = {collectionIds:GUIDE_OPTIONS.collectionIds,modeIds:GUIDE_OPTIONS.modeIds,"
              + "variableIds:Object.fromEntries(keys.map((key,i) => [key,GUIDE_OPTIONS.variableIds[i]]))};\n"
              + "return await createColorGuide(figma, COLOR_SYSTEM, imported, GUIDE_OPTIONS);\n")
    if len(result) > 50000:
        raise ValueError("Guide script exceeds the MCP 50,000-character input limit; shorten the ID payload or split the guide build")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    gen = commands.add_parser("generate")
    gen.add_argument("--seeds", required=True, help="JSON with brand, neutral, error, success #RRGGBB seeds and optional link")
    gen.add_argument("--prefix", default="", help="Collection name prefix; does not affect variable paths")
    gen.add_argument("--output", default="color-system.json")
    check = commands.add_parser("validate")
    check.add_argument("file")
    code = commands.add_parser("figma-code")
    code.add_argument("file")
    code.add_argument("--operation", choices=("inspect", "apply", "verify"), required=True)
    code.add_argument("--output", required=True)
    guide = commands.add_parser("guide-code")
    guide.add_argument("file")
    guide.add_argument("--ledger", required=True, help="Verified figma-import-result.json")
    guide.add_argument("--output", required=True, help="JavaScript to execute with Figma MCP")
    args = parser.parse_args()
    try:
        if args.command == "generate":
            data = generate(read_json(args.seeds), args.prefix)
            validate(data)
            write_text(args.output, json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
        else:
            data = validate(read_json(args.file))
            if args.command == "figma-code":
                write_text(args.output, figma_code(data, args.operation))
            elif args.command == "guide-code":
                write_text(args.output, guide_code(data, read_json(args.ledger)))
        counts = {collection["key"]: len(collection["variables"]) for collection in data["collections"]}
        print(json.dumps({"status": "ok", **counts,
                          "contrastSummary": {m: a["summary"] for m, a in data["contrastAudit"].items()}},
                         ensure_ascii=False))
    except (ValueError, TypeError, KeyError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
