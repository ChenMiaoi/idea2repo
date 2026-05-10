import unittest
from unittest.mock import patch

from idea2repo.providers import (
    ProviderMode,
    contains_secret_material,
    load_provider_config,
    provider_schema,
    safe_provider_report,
    validate_provider_config,
)


class ProviderTests(unittest.TestCase):
    def test_default_provider_is_offline(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            config = load_provider_config()
        self.assertEqual(config.mode, ProviderMode.OFFLINE)

    def test_invalid_provider_mode_has_clear_error(self) -> None:
        with patch.dict("os.environ", {"IDEA2REPO_PROVIDER": "bad"}, clear=True):
            with self.assertRaisesRegex(ValueError, "unsupported provider mode"):
                load_provider_config()

    def test_api_key_mode_requires_key_without_exposing_secret(self) -> None:
        with patch.dict("os.environ", {"IDEA2REPO_PROVIDER": "openai_api_key"}, clear=True):
            config = load_provider_config()
            self.assertEqual(
                validate_provider_config(config),
                ("OPENAI_API_KEY is required for openai_api_key provider mode",),
            )

        env = {
            "IDEA2REPO_PROVIDER": "openai_api_key",
            "OPENAI_API_KEY": "sk-test-secret-value",
            "OPENAI_BASE_URL": "https://api.example.test/v1",
        }
        report = safe_provider_report(env)
        self.assertIn("OPENAI_API_KEY: set", report)
        self.assertNotIn("sk-test-secret-value", report)
        self.assertIn("http...t/v1 (redacted)", report)

    def test_official_account_mode_documents_boundary(self) -> None:
        report = safe_provider_report({"IDEA2REPO_PROVIDER": "openai_account"})
        self.assertIn("never capture cookies", report)
        self.assertIn("official OpenAI account login", report)

    def test_provider_schema_lists_secret_policy(self) -> None:
        schema = provider_schema()
        self.assertIn("secret_policy", schema)
        self.assertIn("openai_api_key", schema["modes"])
        self.assertIn("OPENAI_API_KEY", schema["secret_policy"]["redacted_environment"])

    def test_secret_detector_catches_common_material(self) -> None:
        self.assertTrue(contains_secret_material("Authorization: Bearer abc"))
        self.assertTrue(contains_secret_material("sk-live-secret"))
        self.assertFalse(contains_secret_material("OPENAI_API_KEY: set"))


if __name__ == "__main__":
    unittest.main()
