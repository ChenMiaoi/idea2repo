import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess

from idea2repo.codex_models import DEFAULT_FALLBACK_MODEL, load_codex_model_catalog


class CodexModelCatalogTests(unittest.TestCase):
    def test_loads_models_from_codex_debug_models(self) -> None:
        payload = {
            "models": [
                {
                    "slug": "gpt-5.3-codex-spark",
                    "display_name": "GPT-5.3 Codex Spark",
                    "default_reasoning_level": "medium",
                    "supported_reasoning_levels": [
                        {"effort": "low", "description": "fast"},
                        {"effort": "medium", "description": "balanced"},
                    ],
                    "priority": 1,
                },
                {
                    "slug": "gpt-5.5",
                    "display_name": "GPT-5.5",
                    "default_reasoning_level": "high",
                    "supported_reasoning_levels": [{"effort": "high", "description": "deep"}],
                    "priority": 0,
                },
            ]
        }
        with patch("idea2repo.codex_models.subprocess.run") as run:
            run.return_value = subprocess.CompletedProcess(
                ["codex", "debug", "models"], 0, json.dumps(payload), ""
            )
            catalog = load_codex_model_catalog()

        self.assertTrue(catalog.available)
        self.assertEqual(catalog.default_model().slug, "gpt-5.5")
        self.assertEqual([level.effort for level in catalog.supported_reasoning("gpt-5.3-codex-spark")], ["low", "medium"])

    def test_falls_back_to_models_cache_when_cli_fails(self) -> None:
        payload = {
            "models": [
                {
                    "slug": "gpt-5.3-codex",
                    "display_name": "GPT-5.3 Codex",
                    "default_reasoning_level": "medium",
                    "supported_reasoning_levels": [{"effort": "medium"}],
                    "priority": 0,
                }
            ]
        }
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp) / "models_cache.json"
            cache.write_text(json.dumps(payload), encoding="utf-8")
            with patch("idea2repo.codex_models.subprocess.run", side_effect=OSError("missing")):
                catalog = load_codex_model_catalog(cache_path=cache)

        self.assertTrue(catalog.available)
        self.assertEqual(catalog.default_model().slug, "gpt-5.3-codex")

    def test_uses_clear_fallback_when_catalog_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with patch("idea2repo.codex_models.subprocess.run", side_effect=OSError("missing")):
                catalog = load_codex_model_catalog(cache_path=Path(tmp) / "missing.json")

        self.assertFalse(catalog.available)
        self.assertEqual(catalog.default_model().slug, DEFAULT_FALLBACK_MODEL)


if __name__ == "__main__":
    unittest.main()
