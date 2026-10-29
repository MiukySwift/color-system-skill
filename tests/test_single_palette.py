"""Single-palette calculations and executable delivery contracts; no live writes."""

import copy
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(os.environ.get("COLOR_SKILL_SCRIPTS", str(
    Path(__file__).resolve().parents[1] / "scripts")))
sys.path.insert(0, str(SCRIPTS))
from single_palette import generate_palette, palette_code, palette_html, validate_palette
from color_system import generate


class SinglePaletteTests(unittest.TestCase):
    def test_same_palette_as_full_system_and_neutral_850(self):
        seed = "#3178a9"
        for neutral in (False, True):
            data = generate_palette(seed, "Standalone", neutral)
            self.assertEqual(len(data["swatches"]), 12 if neutral else 11)
            self.assertEqual(data["seed"], seed.upper())
            system = generate(dict.fromkeys(("brand", "neutral", "error", "success"), seed))
            family = "neutral" if neutral else "brand"
            actual = {int(t["name"].split("/")[1]): t["values"]["Value"]["hex"]
                      for t in system["collections"][0]["variables"]
                      if t["name"].startswith(family + "/")}
            self.assertEqual({r["step"]: r["hex"] for r in data["swatches"]}, actual)
            self.assertEqual(next(r["hex"] for r in data["swatches"] if r["step"] == 500), seed.upper())
            self.assertEqual(validate_palette(data), data)

    def test_contrast_reference_endpoints_and_thresholds(self):
        for seed in ("#000000", "#FFFFFF", "#777777", "#3178A9"):
            data = generate_palette(seed)
            for row in data["swatches"]:
                white, black = (row["contrast"][k] for k in ("white", "black"))
                # For an opaque sRGB fill, white and black pair ratios multiply to 21.
                self.assertAlmostEqual(white["ratio"] * black["ratio"], 21)
                self.assertTrue(white["normalTextPass"] or black["normalTextPass"])
                for c in (white, black):
                    self.assertEqual(c["normalTextPass"], c["ratio"] >= 4.5)
                    self.assertEqual(c["largeTextPass"], c["ratio"] >= 3)
        black_seed = generate_palette("#000000")["swatches"][5]
        self.assertEqual(black_seed["contrast"]["white"]["ratio"], 21)
        self.assertEqual(black_seed["contrast"]["black"]["ratio"], 1)
        gray = generate_palette("#777777")["swatches"][5]["contrast"]["white"]
        self.assertAlmostEqual(gray["ratio"], 4.478089453577214)
        self.assertFalse(gray["normalTextPass"])

    def test_all_five_directions_and_fixed_seed_foreground(self):
        for seed in ("#000000", "#FFFFFF", "#777777", "#3178A9"):
            data = generate_palette(seed)
            self.assertEqual(data["schemaVersion"], "single-palette-1.1.0")
            for row in data["swatches"]:
                checks = row["contrast"]
                self.assertEqual(set(checks), {"white", "black", "stepOnWhite", "stepOnBlack", "seedOnStep"})
                expected_pairs = {
                    "white": ("#FFFFFF", row["hex"]), "black": ("#000000", row["hex"]),
                    "stepOnWhite": (row["hex"], "#FFFFFF"), "stepOnBlack": (row["hex"], "#000000"),
                    "seedOnStep": (seed, row["hex"])}
                for key, (foreground, background) in expected_pairs.items():
                    self.assertEqual((checks[key]["foreground"], checks[key]["background"]), (foreground, background))
                    self.assertEqual(checks[key]["normalTextPass"], checks[key]["ratio"] >= 4.5)
                    self.assertEqual(checks[key]["largeTextPass"], checks[key]["ratio"] >= 3)
                self.assertEqual(checks["white"]["ratio"], checks["stepOnWhite"]["ratio"])
                self.assertEqual(checks["black"]["ratio"], checks["stepOnBlack"]["ratio"])
                if seed in ("#000000", "#FFFFFF"):
                    same = checks["black" if seed == "#000000" else "white"]
                    self.assertEqual(checks["seedOnStep"]["ratio"], same["ratio"])
            original = next(r for r in data["swatches"] if r["step"] == 500)["contrast"]["seedOnStep"]
            self.assertEqual(original["ratio"], 1)
            self.assertFalse(original["largeTextPass"])

    def test_invalid_inputs_and_drift(self):
        for seed in (None, "#FFF", "#12345678", "123456", "#GG0000"):
            with self.assertRaises(ValueError):
                generate_palette(seed)
        for name in (None, "", "\nName", "a" * 81):
            with self.assertRaises(ValueError):
                generate_palette("#3178A9", name)
        data = generate_palette("#3178A9")
        for mutate in (
            lambda d: d["swatches"][0].update(hex="#FFFFFF"),
            lambda d: d["swatches"][0]["contrast"]["white"].update(ratio=4.5),
            lambda d: d["swatches"][0]["contrast"]["seedOnStep"].update(foreground="#FFFFFF"),
            lambda d: d["swatches"][0]["contrast"]["stepOnWhite"].update(background="#000000"),
            lambda d: d.update(include850=1),
            lambda d: d.update(extra="drift"),
        ):
            changed = copy.deepcopy(data)
            mutate(changed)
            with self.assertRaises(ValueError):
                validate_palette(changed)

    def test_html_escapes_input_and_all_samples_are_visible(self):
        data = generate_palette("#3178A9", '<script>alert("x")</script>')
        output = palette_html(data)
        self.assertNotIn('<script>', output)
        self.assertIn('&lt;script&gt;', output)
        self.assertEqual(output.count('class="sample"'), 55)
        self.assertEqual(output.count('class="chip"'), 11)
        self.assertNotIn('src="http', output)
        for row in data["swatches"]:
            self.assertIn(row["hex"], output)
            for c in row["contrast"].values():
                self.assertIn(f'{c["ratio"]:.2f}:1', output)
                self.assertIn(f'background:{c["background"]};color:{c["foreground"]}', output)

    def test_cli_and_figma_script(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "palette.json"
            preview = Path(tmp) / "palette.html"
            script = Path(tmp) / "palette.js"
            base = [sys.executable, str(SCRIPTS / "single_palette.py")]
            subprocess.run(base + ["generate", "--color", "#3178A9", "--include-850",
                                  "--output", str(target), "--html", str(preview)], check=True, capture_output=True)
            self.assertTrue(preview.is_file())
            self.assertEqual(len(json.loads(target.read_text())["swatches"]), 12)
            subprocess.run(base + ["validate", str(target)], check=True, capture_output=True)
            subprocess.run(base + ["figma-code", str(target), "--output", str(script)], check=True, capture_output=True)
            # Compile with an async function wrapper just as the MCP tool does.
            subprocess.run(["node", "-e", "const fs=require('fs');new (Object.getPrototypeOf(async function(){}).constructor)(fs.readFileSync(process.argv[1],'utf8'));", str(script)], check=True, capture_output=True)
            result = subprocess.run(base + ["generate", "--color", "#3178A9", "--output", str(target), "--html", str(target)], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(len(json.loads(target.read_text())["swatches"]), 12)
        # No fixed destination or article/test palette is part of the emitted model.
        code = palette_code(generate_palette("#3178A9"))
        self.assertNotIn('createVariableCollection', code)


if __name__ == "__main__":
    unittest.main()
