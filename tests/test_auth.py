import json
import socket
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import parse_qs, urlparse

from idea2repo.auth import (
    ACCESS_TOKEN_KEY,
    API_KEY_KEY,
    AuthError,
    AuthProvider,
    FileCredentialStore,
    OAuthConfig,
    REFRESH_TOKEN_KEY,
    auth_paths,
    parse_authorization_response,
)


class FakeCredentialStore:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self.values.get(key)

    def set(self, key: str, value: str) -> None:
        self.values[key] = value

    def delete(self, key: str) -> None:
        self.values.pop(key, None)


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, object]:
        return self.payload


class FakeHttpClient:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload
        self.requests: list[tuple[str, dict[str, object]]] = []

    def post(self, url: str, data: dict[str, object]) -> FakeResponse:
        self.requests.append((url, dict(data)))
        return FakeResponse(self.payload)


class AuthTests(unittest.TestCase):
    def test_default_oauth_config_uses_official_openai_codex_flow(self) -> None:
        config = OAuthConfig.from_env({})
        self.assertIsNotNone(config)
        assert config is not None
        self.assertEqual(config.client_id, "app_EMoamEEZ73f0CkXaXp7hrann")
        self.assertEqual(config.authorization_url, "https://auth.openai.com/oauth/authorize")
        self.assertEqual(config.token_url, "https://auth.openai.com/oauth/token")
        self.assertEqual(config.redirect_uri, "http://localhost:1455/auth/callback")
        self.assertEqual(config.source, "official_openai_codex")

    def test_auth_paths_use_user_level_codex_agent_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = auth_paths(tmp)
            self.assertEqual(paths["agent_dir"], Path(tmp) / "agent" / "codex")
            self.assertEqual(paths["auth"], Path(tmp) / "agent" / "codex" / "auth.json")
            self.assertEqual(paths["config"], Path(tmp) / "agent" / "codex" / "config.json")
            self.assertEqual(
                paths["credentials"],
                Path(tmp) / "agent" / "codex" / "credentials.json",
            )

    def test_begin_browser_login_writes_metadata_without_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            provider = AuthProvider(
                state_home=tmp,
                credential_store=FakeCredentialStore(),
            )
            pending = provider.begin_browser_login(
                oauth_config=_oauth_config(),
                open_browser=False,
            )

            params = parse_qs(urlparse(pending.authorization_url).query)
            self.assertEqual(params["client_id"], ["client-test"])
            self.assertEqual(params["state"], [pending.state])
            self.assertEqual(params["code_challenge_method"], ["S256"])
            metadata = json.loads((Path(tmp) / "agent/codex/auth.json").read_text())
            self.assertEqual(metadata["mode"], "pending_openai_account")
            self.assertNotIn("access_token", metadata)
            self.assertNotIn("refresh_token", metadata)
            config = json.loads((Path(tmp) / "agent/codex/config.json").read_text())
            self.assertEqual(config["agent"], "codex")
            self.assertEqual(config["secret_storage"], "file_credentials")

    def test_begin_browser_login_with_default_config_adds_codex_params(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            provider = AuthProvider(
                state_home=tmp,
                credential_store=FakeCredentialStore(),
                env={},
            )
            pending = provider.begin_browser_login(open_browser=False)

            parsed = urlparse(pending.authorization_url)
            params = parse_qs(parsed.query)
            self.assertEqual(parsed.netloc, "auth.openai.com")
            self.assertEqual(params["client_id"], ["app_EMoamEEZ73f0CkXaXp7hrann"])
            self.assertEqual(params["redirect_uri"], ["http://localhost:1455/auth/callback"])
            self.assertEqual(params["codex_cli_simplified_flow"], ["true"])
            self.assertEqual(params["originator"], ["idea2repo"])

    def test_complete_browser_login_validates_state_and_stores_token_in_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = FakeCredentialStore()
            client = FakeHttpClient(
                {
                    "access_token": "access-secret",
                    "refresh_token": "refresh-secret",
                    "expires_in": 3600,
                    "profile": {"email": "researcher@example.test"},
                }
            )
            provider = AuthProvider(
                state_home=tmp,
                credential_store=store,
                http_client=client,
            )
            pending = provider.begin_browser_login(
                oauth_config=_oauth_config(),
                open_browser=False,
            )
            session = provider.complete_browser_login(
                code="oauth-code",
                state=pending.state,
                code_verifier=pending.code_verifier,
                oauth_config=_oauth_config(),
            )

            self.assertEqual(session.mode, "openai_account")
            self.assertEqual(session.account_label, "researcher@example.test")
            self.assertEqual(store.get(ACCESS_TOKEN_KEY), "access-secret")
            metadata = json.loads((Path(tmp) / "agent/codex/auth.json").read_text())
            self.assertEqual(metadata["mode"], "openai_account")
            self.assertNotIn("access-secret", json.dumps(metadata))

    def test_default_file_credentials_store_tokens_under_state_home(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeHttpClient(
                {
                    "access_token": "access-secret",
                    "refresh_token": "refresh-secret",
                    "expires_in": 3600,
                    "profile": {"email": "researcher@example.test"},
                }
            )
            provider = AuthProvider(state_home=tmp, http_client=client)
            pending = provider.begin_browser_login(
                oauth_config=_oauth_config(),
                open_browser=False,
            )
            provider.complete_browser_login(
                code="oauth-code",
                state=pending.state,
                code_verifier=pending.code_verifier,
                oauth_config=_oauth_config(),
            )

            credentials_path = Path(tmp) / "agent/codex/credentials.json"
            credentials = json.loads(credentials_path.read_text())
            self.assertEqual(credentials[ACCESS_TOKEN_KEY], "access-secret")
            self.assertEqual(credentials[REFRESH_TOKEN_KEY], "refresh-secret")
            self.assertNotIn("access-secret", (Path(tmp) / "agent/codex/auth.json").read_text())
            self.assertEqual(credentials_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(credentials_path.parent.stat().st_mode & 0o777, 0o700)

            provider.logout()
            self.assertFalse(credentials_path.exists())

    def test_file_credential_store_rejects_symlink_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "target.json"
            symlink = Path(tmp) / "credentials.json"
            target.write_text("{}", encoding="utf-8")
            symlink.symlink_to(target)
            store = FileCredentialStore(symlink)
            with self.assertRaisesRegex(AuthError, "symlink credential path"):
                store.set(ACCESS_TOKEN_KEY, "access-secret")

    def test_complete_browser_login_rejects_state_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            provider = AuthProvider(
                state_home=tmp,
                credential_store=FakeCredentialStore(),
            )
            pending = provider.begin_browser_login(
                oauth_config=_oauth_config(),
                open_browser=False,
            )
            with self.assertRaisesRegex(AuthError, "state mismatch"):
                provider.complete_browser_login(
                    code="oauth-code",
                    state="wrong",
                    code_verifier=pending.code_verifier,
                    oauth_config=_oauth_config(),
                )

    def test_refresh_session_uses_refresh_token_without_writing_secret_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = FakeCredentialStore()
            initial_client = FakeHttpClient(
                {
                    "access_token": "old-access",
                    "refresh_token": "refresh-secret",
                    "expires_in": -1,
                }
            )
            provider = AuthProvider(
                state_home=tmp,
                credential_store=store,
                http_client=initial_client,
            )
            pending = provider.begin_browser_login(
                oauth_config=_oauth_config(),
                open_browser=False,
            )
            provider.complete_browser_login(
                code="oauth-code",
                state=pending.state,
                code_verifier=pending.code_verifier,
                oauth_config=_oauth_config(),
            )
            refresh_client = FakeHttpClient(
                {
                    "access_token": "new-access",
                    "refresh_token": "new-refresh",
                    "expires_in": 3600,
                }
            )
            provider.http_client = refresh_client

            session = provider.refresh_session(oauth_config=_oauth_config())

            self.assertEqual(session.mode, "openai_account")
            self.assertEqual(store.get(ACCESS_TOKEN_KEY), "new-access")
            self.assertEqual(refresh_client.requests[0][1]["grant_type"], "refresh_token")
            metadata = json.loads((Path(tmp) / "agent/codex/auth.json").read_text())
            self.assertNotIn("new-access", json.dumps(metadata))
            self.assertNotIn("new-refresh", json.dumps(metadata))

    def test_api_key_login_keeps_secret_out_of_auth_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = FakeCredentialStore()
            provider = AuthProvider(state_home=tmp, credential_store=store)
            session = provider.login_with_api_key("sk-test-secret")
            metadata = json.loads((Path(tmp) / "agent/codex/auth.json").read_text())
            self.assertEqual(session.mode, "openai_api_key")
            self.assertEqual(store.get(API_KEY_KEY), "sk-test-secret")
            self.assertNotIn("sk-test-secret", json.dumps(metadata))

    def test_login_with_browser_uses_loopback_callback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            port = _free_port()
            store = FakeCredentialStore()
            client = FakeHttpClient(
                {
                    "access_token": "access-secret",
                    "refresh_token": "refresh-secret",
                    "expires_in": 3600,
                }
            )
            provider = AuthProvider(
                state_home=tmp,
                credential_store=store,
                http_client=client,
            )
            config = _oauth_config(redirect_uri=f"http://127.0.0.1:{port}/callback")
            ready = threading.Event()
            pending_state: dict[str, str] = {}
            result: dict[str, object] = {}

            def run_login() -> None:
                try:
                    session = provider.login_with_browser(
                        oauth_config=config,
                        open_browser=False,
                        timeout_seconds=5,
                        on_auth=lambda pending: (
                            pending_state.update({"state": pending.state}),
                            ready.set(),
                        ),
                    )
                    result["session"] = session
                except Exception as exc:  # pragma: no cover - surfaced below
                    result["error"] = exc

            thread = threading.Thread(target=run_login, daemon=True)
            thread.start()
            self.assertTrue(ready.wait(5))
            callback_url = (
                f"http://127.0.0.1:{port}/callback?code=oauth-code"
                f"&state={pending_state['state']}"
            )
            with urlopen(callback_url, timeout=2) as response:
                body = response.read().decode("utf-8")
            thread.join(3)

            if "error" in result:
                raise result["error"]  # type: ignore[misc]
            session = result["session"]
            self.assertEqual(getattr(session, "mode"), "openai_account")
            self.assertIn("Authentication successful", body)
            self.assertEqual(store.get(ACCESS_TOKEN_KEY), "access-secret")
            self.assertEqual(client.requests[0][1]["code"], "oauth-code")

    def test_parse_authorization_response_accepts_redirect_url_and_code_state_pair(self) -> None:
        parsed = parse_authorization_response(
            "http://127.0.0.1:1455/auth/callback?code=abc&state=xyz"
        )
        self.assertEqual(parsed.code, "abc")
        self.assertEqual(parsed.state, "xyz")

        parsed = parse_authorization_response("abc#xyz")
        self.assertEqual(parsed.code, "abc")
        self.assertEqual(parsed.state, "xyz")


def _oauth_config(redirect_uri: str = "http://127.0.0.1:8765/callback") -> OAuthConfig:
    return OAuthConfig(
        client_id="client-test",
        authorization_url="https://auth.example.test/authorize",
        token_url="https://auth.example.test/token",
        redirect_uri=redirect_uri,
        scope="openid profile email",
    )


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


if __name__ == "__main__":
    unittest.main()
