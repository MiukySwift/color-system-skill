#!/usr/bin/env python3
"""Test calculations, role inputs, optional Link, and Figma import without live writes."""

import json
import random
import subprocess
import sys
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

SKILL_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from color_system import contrast, figma_code, generate, guide_code, mix, read_json, validate

# Synthetic data for tests only; no defaults or suggested colors are shipped.
SEEDS = {role: f"#{(index * 0x241137 + 0x102030):06X}"
         for index, role in enumerate(("brand", "neutral", "error", "success", "link"))}


class ColorSystemTests(unittest.TestCase):
    def test_palette_contract_and_counts(self):
        data = generate(SEEDS)
        p, s = data["collections"]
        palette = {v["name"]: v["values"]["Value"] for v in p["variables"]}
        self.assertEqual((len(p["variables"]), len(s["variables"])), (76, 45))
        self.assertEqual(data["schemaVersion"], "3.0.0")
        self.assertEqual(data["seeds"], SEEDS)
        for family, role in (("neutral", "neutral"), ("brand", "brand"),
                             ("red", "error"), ("green", "success"), ("blue", "link")):
            self.assertEqual(palette[f"{family}/500"]["hex"], SEEDS[role])
            steps = [v for v in p["variables"] if v["name"].startswith(family + "/")]
            self.assertEqual(len(steps), 12 if family == "neutral" else 11)
            self.assertTrue(all(v["values"]["Value"]["alpha"] == 1 for v in steps))
        for family in ("black", "white"):
            for percent in range(10, 100, 10):
                self.assertEqual(palette[f"{family}/{percent}"]["alpha"], percent / 100)
            self.assertEqual(palette[f"{family}/solid"]["alpha"], 1)
        for mode in ("Light", "Dark"):
            audit = data["contrastAudit"][mode]
            self.assertEqual(audit["summary"]["textItems"], 19)
            self.assertEqual(len(audit["lines"]), 9)
            self.assertEqual(audit["summary"]["normalTextFailures"],
                             sum(r["minimum"] < 4.5 for r in audit["text"]))
        self.assertEqual(validate(data), data)

    def test_all_byte_rounding_against_rational_arithmetic(self):
        for channel in range(256):
            seed = "#" + f"{channel:02X}" * 3
            for a in range(1, 11):
                for background in (0, 255):
                    exact = Fraction(a * channel + (10 - a) * background, 10)
                    expected = int(exact + Fraction(1, 2))
                    self.assertEqual(mix(seed, a, background), "#" + f"{expected:02X}" * 3)

    def test_semantic_invariants_and_on_branches(self):
        data = generate(SEEDS)
        p, s = data["collections"]
        names = {v["name"] for v in p["variables"]}
        aliases = {v["name"]: v["values"] for v in s["variables"]}
        for modes in aliases.values():
            for value in modes.values():
                self.assertEqual(set(value), {"alias"})
                self.assertIn(value["alias"].split(":", 1)[1], names)
        for mode in ("Light", "Dark"):
            self.assertEqual(aliases["lines/focus"][mode]["alias"], "primitive:brand/500")
        self.assertEqual(aliases["surface/secondary"]["Dark"]["alias"], "primitive:neutral/850")
        self.assertEqual(aliases["brand/brand-background"]["Dark"]["alias"], "primitive:brand/950")
        self.assertEqual(aliases["notice/accent-background"]["Dark"]["alias"], "primitive:brand/900")
        for role, family in (("brand", "brand"), ("error", "red"),
                             ("success", "green"), ("link", "blue")):
            light_seed = generate({**SEEDS, role: "#FFFFFF"})
            dark_seed = generate({**SEEDS, role: "#000000"})
            self.assertEqual(light_seed["onColorSelection"]["Light"][family]["alias"], "primitive:black/90")
            self.assertEqual(light_seed["onColorSelection"]["Dark"][family]["alias"], "primitive:white/solid")
            self.assertEqual(dark_seed["onColorSelection"]["Dark"][family]["alias"], "primitive:black/90")
        self.assertAlmostEqual(contrast({"hex": "#FFFFFF", "alpha": 1},
                                        {"hex": "#000000", "alpha": 1}), 21)
        rng = random.Random(20261027)
        for _ in range(20):
            seeds = {k: f"#{rng.randrange(0x1000000):06X}" for k in SEEDS}
            self.assertEqual(validate(generate(seeds)), generate(seeds))
        self.assertEqual(len(generate(dict.fromkeys(SEEDS, "#888888"))["collections"][1]["variables"]), 45)

    def test_optional_link_reuses_brand_without_an_extra_family(self):
        seeds = {role: value for role, value in SEEDS.items() if role != "link"}
        data = validate(generate(seeds))
        self.assertNotIn("link", data["seeds"])
        self.assertEqual(data["roleFamilies"]["link"], "brand")
        primitive, semantic = data["collections"]
        self.assertEqual(len(primitive["variables"]), 65)
        self.assertEqual(len(semantic["variables"]), 45)
        self.assertFalse(any(v["name"].startswith("blue/") for v in primitive["variables"]))
        aliases = {v["name"]: v["values"] for v in semantic["variables"]}
        for mode, step in (("Light", 600), ("Dark", 400)):
            self.assertEqual(aliases["font/link"][mode]["alias"], f"primitive:brand/{step}")
            self.assertEqual(aliases["notice/link"][mode]["alias"], "primitive:brand/500")
            self.assertEqual(aliases["notice/on-link"][mode], aliases["brand/on-brand"][mode])
            self.assertEqual(data["contrastAudit"][mode]["summary"]["textItems"], 19)
        self.assertEqual(aliases["lines/link-border"]["Dark"]["alias"], "primitive:brand/800")
        self.assertEqual(aliases["notice/link-background"]["Dark"]["alias"], "primitive:brand/900")
        # Supplying a separate Link preserves that explicit role even if its HEX matches Brand.
        explicit = generate({**seeds, "link": seeds["brand"]})
        self.assertEqual(len(explicit["collections"][0]["variables"]), 76)
        self.assertEqual(explicit["roleFamilies"]["link"], "blue")

    def test_invalid_inputs_and_tampering(self):
        for bad in ({}, {**SEEDS, "gray": "#888888"}, {**SEEDS, "brand": "#FFF"},
                    {**SEEDS, "brand": "#FFFFFFFF"}, {**SEEDS, "brand": 123},
                    {**SEEDS, "link": None}, {**SEEDS, "link": ""},
                    {k: v for k, v in SEEDS.items() if k != "error"}):
            with self.assertRaises(ValueError):
                generate(bad)
        mutations = [
            lambda d: d["collections"][0]["variables"][0]["values"]["Value"].update(alpha=True),
            lambda d: d["collections"][1]["variables"][0]["values"]["Dark"].update(alias="primitive:missing"),
            lambda d: d["collections"][0]["variables"].pop(),
            lambda d: d["contrastAudit"]["Light"]["summary"].update(normalTextFailures=-1),
            lambda d: d["roleFamilies"].update(link="neutral"),
        ]
        for mutate in mutations:
            data = generate(SEEDS)
            mutate(data)
            with self.assertRaises(ValueError):
                validate(data)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "duplicate.json"
            path.write_text('{"neutral":"#000000","neutral":"#FFFFFF"}')
            with self.assertRaises(ValueError):
                read_json(path)

    def test_figma_bridge_with_and_without_link(self):
        for include_link in (True, False):
            seeds = {k: v for k, v in SEEDS.items() if include_link or k != "link"}
            data = generate(seeds)
            with self.subTest(include_link=include_link), tempfile.TemporaryDirectory() as folder:
                for operation in ("inspect", "apply", "verify"):
                    Path(folder, operation + ".js").write_text(figma_code(data, operation), encoding="utf-8")
                expected_count = 121 if include_link else 110
                result = subprocess.run(["node", str(Path(__file__).with_name("test_figma_bridge.cjs")),
                                         folder, str(expected_count)], text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


    def test_guide_text_sizing_regression(self):
        result = subprocess.run(["node", str(Path(__file__).with_name("test_figma_guide_text.cjs"))],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    @staticmethod
    def guide_ledger(data):
        keys = [f"{c['key']}:{v['name']}" for c in data["collections"] for v in c["variables"]]
        return {"status": "verified", "fileKey": "synthetic-test-target",
                "collectionIds": {"primitive": "collection:1", "semantic": "collection:2"},
                "modeIds": {"primitive": {"Value": "1:0"}, "semantic": {"Light": "2:0", "Dark": "2:1"}},
                "variableIds": {key: f"VariableID:12345678:{i:08d}" for i, key in enumerate(keys)}}

    def test_guide_variants_fit_mcp_and_compile(self):
        for include_link in (True, False):
            seeds = {k: v for k, v in SEEDS.items() if include_link or k != "link"}
            for seed_set in (seeds, dict.fromkeys(seeds, "#FFFFFF"), dict.fromkeys(seeds, "#000000")):
                data = generate(seed_set, "Synthetic fresh run")
                code = guide_code(data, self.guide_ledger(data))
                self.assertLessEqual(len(code), 50000)
                with tempfile.TemporaryDirectory() as folder:
                    path = Path(folder, "guide.js")
                    path.write_text(code)
                    result = subprocess.run(["node", "-e",
                        "const fs=require('fs'); const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor; "
                        "new AsyncFunction('figma', fs.readFileSync(process.argv[1],'utf8'));", str(path)],
                        capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_guide_rejects_incomplete_or_ambiguous_ledgers(self):
        data = generate(SEEDS)
        mutations = [lambda d: d.update(status="incomplete"),
                     lambda d: d.pop("fileKey"),
                     lambda d: d["variableIds"].pop(next(iter(d["variableIds"]))),
                     lambda d: d["variableIds"].update(extra="unrelated-id"),
                     lambda d: d["variableIds"].update(dict.fromkeys(d["variableIds"], "duplicate")),
                     lambda d: d["modeIds"]["semantic"].pop("Dark"),
                     lambda d: d["collectionIds"].pop("primitive")]
        for mutate in mutations:
            ledger = self.guide_ledger(data)
            mutate(ledger)
            with self.assertRaises(ValueError):
                guide_code(data, ledger)

    def test_guide_stops_on_live_drift_before_drawing(self):
        data = generate(SEEDS)
        ledger = self.guide_ledger(data)
        code = guide_code(data, ledger)
        variables = {}
        for collection in data["collections"]:
            for token in collection["variables"]:
                key = collection["key"] + ":" + token["name"]
                variables[ledger["variableIds"][key]] = {"name": token["name"],
                    "variableCollectionId": ledger["collectionIds"][collection["key"]],
                    "resolvedType": "COLOR", "scopes": token["scopes"], "codeSyntax": token["codeSyntax"],
                    "valuesByMode": {}}
        collections = {ledger["collectionIds"][c["key"]]: {"id": ledger["collectionIds"][c["key"]],
            "name": c["name"], "variableIds": [],
            "defaultModeId": next(iter(ledger["modeIds"][c["key"]].values())),
            "modes": [{"name": name, "modeId": mode_id} for name, mode_id in ledger["modeIds"][c["key"]].items()]}
            for c in data["collections"]}
        harness = """
const fs=require('fs'); const [codePath,fixturePath]=process.argv.slice(2);
const fixture=JSON.parse(fs.readFileSync(fixturePath,'utf8'));
const api={fileKey:'synthetic-test-target', variables:{
 getVariableByIdAsync: async id=>fixture.variables[id],
 getVariableCollectionByIdAsync: async id=>fixture.collections[id]
}, createPage:()=>{throw new Error('Unexpected canvas mutation')}};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
new AsyncFunction('figma',fs.readFileSync(codePath,'utf8'))(api).then(()=>process.exit(1)).catch(error=>{
 if(!String(error).includes('Live value differs from JSON')){console.error(error);process.exit(2)}
});
"""
        with tempfile.TemporaryDirectory() as folder:
            Path(folder, "guide.js").write_text(code)
            Path(folder, "fixture.json").write_text(json.dumps({"variables": variables, "collections": collections}))
            Path(folder, "check.cjs").write_text(harness)
            result = subprocess.run(["node", str(Path(folder, "check.cjs")), str(Path(folder, "guide.js")),
                                     str(Path(folder, "fixture.json"))], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
