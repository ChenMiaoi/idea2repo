"""User-level authentication state for Idea2Repo interactive sessions."""

from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import queue
import secrets
import threading
import time
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from .permissions import Operation, PermissionPolicy


STATE_HOME_ENV = "IDEA2REPO_HOME"
DEFAULT_STATE_HOME = Path.home() / ".idea2repo"
CODEX_AGENT_DIR = Path("agent") / "codex"
AUTH_FILENAME = "auth.json"
CONFIG_FILENAME = "config.json"
CREDENTIALS_FILENAME = "credentials.json"
KEYRING_SERVICE = "idea2repo.agent.codex"
ACCESS_TOKEN_KEY = "openai_access_token"
REFRESH_TOKEN_KEY = "openai_refresh_token"
API_KEY_KEY = "openai_api_key"
DEVICE_CODE_KEY = "openai_device_code"
EXPIRES_AT_KEY = "expires_at"
ACCOUNT_LABEL_KEY = "account_label"
OFFICIAL_OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
OFFICIAL_OPENAI_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
OFFICIAL_OPENAI_TOKEN_URL = "https://auth.openai.com/oauth/token"
OFFICIAL_OPENAI_REDIRECT_URI = "http://localhost:1455/auth/callback"
OFFICIAL_OPENAI_SCOPE = "openid profile email offline_access"
OFFICIAL_OPENAI_JWT_CLAIM = "https://api.openai.com/auth"
DEFAULT_BROWSER_LOGIN_TIMEOUT_SECONDS = 600
SUCCESS_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authentication successful</title>
</head>
<body>
  <p>Authentication successful. Return to your terminal to continue.</p>
</body>
</html>"""


class AuthError(RuntimeError):
    """Raised when authentication cannot be completed safely."""


@dataclass(frozen=True)
class AuthSession:
    """Public auth state safe to print or write to metadata files."""

    mode: str
    account_label: str = ""
    expires_at: float | None = None

    @property
    def is_authenticated(self) -> bool:
        return self.mode in {"openai_account", "openai_api_key"}

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and self.expires_at <= time.time()

    def public_dict(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "account_label": self.account_label,
            "expires_at": self.expires_at,
            "authenticated": self.is_authenticated and not self.is_expired,
        }


@dataclass(frozen=True)
class OAuthConfig:
    """Official OAuth endpoints used for OpenAI browser login."""

    client_id: str
    authorization_url: str
    token_url: str
    redirect_uri: str
    scope: str
    device_authorization_url: str | None = None
    source: str = "official_openai_codex"

    @classmethod
    def official(cls) -> "OAuthConfig":
        return cls(
            client_id=OFFICIAL_OPENAI_CLIENT_ID,
            authorization_url=OFFICIAL_OPENAI_AUTHORIZE_URL,
            token_url=OFFICIAL_OPENAI_TOKEN_URL,
            redirect_uri=OFFICIAL_OPENAI_REDIRECT_URI,
            scope=OFFICIAL_OPENAI_SCOPE,
            device_authorization_url=None,
            source="official_openai_codex",
        )

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "OAuthConfig | None":
        env = os.environ if env is None else env
        client_id = env.get("IDEA2REPO_OPENAI_OAUTH_CLIENT_ID", "").strip()
        authorization_url = env.get("IDEA2REPO_OPENAI_OAUTH_AUTHORIZE_URL", "").strip()
        token_url = env.get("IDEA2REPO_OPENAI_OAUTH_TOKEN_URL", "").strip()
        redirect_uri = env.get("IDEA2REPO_OPENAI_OAUTH_REDIRECT_URI", "").strip()
        if not any((client_id, authorization_url, token_url, redirect_uri)):
            return cls.official()
        if not (client_id and authorization_url and token_url and redirect_uri):
            return None
        return cls(
            client_id=client_id,
            authorization_url=authorization_url,
            token_url=token_url,
            redirect_uri=redirect_uri,
            scope=env.get("IDEA2REPO_OPENAI_OAUTH_SCOPE", "openid profile email offline_access"),
            device_authorization_url=(
                env.get("IDEA2REPO_OPENAI_OAUTH_DEVICE_URL", "").strip() or None
            ),
            source="environment",
        )


@dataclass(frozen=True)
class PendingOAuthLogin:
    """PKCE state for a browser login that must be completed with a callback code."""

    authorization_url: str
    state: str
    code_verifier: str


@dataclass(frozen=True)
class AuthorizationResponse:
    code: str | None = None
    state: str | None = None


@dataclass(frozen=True)
class OAuthCallback:
    code: str
    state: str


class CredentialStore:
    """Store secrets in the OS keyring with an env fallback for CI tests."""

    def __init__(self, service: str = KEYRING_SERVICE) -> None:
        self.service = service

    def get(self, key: str) -> str | None:
        env_key = _env_secret_name(key)
        if os.environ.get(env_key):
            return os.environ[env_key]
        keyring = _keyring()
        if keyring is None:
            return None
        try:
            return keyring.get_password(self.service, key)
        except Exception:
            return None

    def set(self, key: str, value: str) -> None:
        keyring = _keyring()
        if keyring is None:
            raise AuthError("system keyring is unavailable; set the matching environment variable instead")
        try:
            keyring.set_password(self.service, key, value)
        except Exception as exc:
            raise AuthError(f"failed to write credential to system keyring: {exc}") from exc

    def delete(self, key: str) -> None:
        keyring = _keyring()
        if keyring is None:
            return
        try:
            keyring.delete_password(self.service, key)
        except Exception:
            return


class FileCredentialStore:
    """Store Idea2Repo OAuth credentials under ~/.idea2repo with strict permissions."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path).expanduser()

    def get(self, key: str) -> str | None:
        env_key = _env_secret_name(key)
        if os.environ.get(env_key):
            return os.environ[env_key]
        credentials = self._read_credentials()
        value = credentials.get(key)
        if value is None:
            return None
        return str(value)

    def set(self, key: str, value: str) -> None:
        credentials = self._read_credentials()
        credentials[key] = value
        self._write_credentials(credentials)

    def delete(self, key: str) -> None:
        credentials = self._read_credentials()
        credentials.pop(key, None)
        if credentials:
            self._write_credentials(credentials)
            return
        self.delete_file()

    def delete_file(self) -> None:
        if self.path.is_symlink():
            raise AuthError(f"refusing to delete symlink credential path: {self.path}")
        try:
            self.path.unlink()
        except FileNotFoundError:
            return

    def _read_credentials(self) -> dict[str, object]:
        self._assert_safe_path()
        if not self.path.exists():
            return {}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _write_credentials(self, data: Mapping[str, object]) -> None:
        self._assert_safe_path()
        parent = self.path.parent
        parent.mkdir(parents=True, exist_ok=True)
        try:
            parent.chmod(0o700)
        except OSError:
            pass
        tmp = self.path.with_name(f".{self.path.name}.{secrets.token_hex(8)}.tmp")
        try:
            tmp.write_text(
                json.dumps(dict(data), indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            tmp.chmod(0o600)
            os.replace(tmp, self.path)
            self.path.chmod(0o600)
        finally:
            try:
                tmp.unlink()
            except FileNotFoundError:
                pass

    def _assert_safe_path(self) -> None:
        parent = self.path.parent
        if parent.exists() and parent.is_symlink():
            raise AuthError(f"refusing to use symlink credential directory: {parent}")
        if self.path.exists() and self.path.is_symlink():
            raise AuthError(f"refusing to use symlink credential path: {self.path}")


class _OAuthHTTPServer(ThreadingHTTPServer):
    expected_state: str
    expected_path: str
    result_queue: "queue.Queue[OAuthCallback | AuthError]"


class _OAuthCallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        server = self.server
        if not isinstance(server, _OAuthHTTPServer):
            self.send_error(500)
            return

        parsed = urlparse(self.path)
        if parsed.path != server.expected_path:
            self._write_text(404, "Not found")
            return

        params = parse_qs(parsed.query)
        error = _first(params.get("error"))
        if error:
            description = _first(params.get("error_description"))
            message = f"OAuth authorization failed: {error}"
            if description:
                message = f"{message}: {description}"
            self._write_text(400, message)
            server.result_queue.put(AuthError(message))
            return

        state = _first(params.get("state"))
        if not state or not secrets.compare_digest(state, server.expected_state):
            self._write_text(400, "State mismatch")
            server.result_queue.put(AuthError("OAuth state mismatch; restart login"))
            return

        code = _first(params.get("code"))
        if not code:
            self._write_text(400, "Missing authorization code")
            server.result_queue.put(AuthError("Missing authorization code"))
            return

        body = SUCCESS_HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        server.result_queue.put(OAuthCallback(code=code, state=state))

    def log_message(self, format: str, *args: object) -> None:
        return

    def _write_text(self, status_code: int, body_text: str) -> None:
        body = html.escape(body_text).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class _OAuthCallbackServer:
    def __init__(self, redirect_uri: str, expected_state: str) -> None:
        parsed = urlparse(redirect_uri)
        if parsed.scheme != "http":
            raise AuthError("OAuth redirect URI must use http loopback")
        if parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise AuthError("OAuth redirect URI must point to localhost")
        if parsed.port is None:
            raise AuthError("OAuth redirect URI must include a localhost port")
        self.host = "127.0.0.1"
        self.port = parsed.port
        self.path = parsed.path or "/"
        self.expected_state = expected_state
        self._server: _OAuthHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def is_running(self) -> bool:
        return self._server is not None

    def start(self) -> None:
        try:
            server = _OAuthHTTPServer((self.host, self.port), _OAuthCallbackHandler)
        except OSError as exc:
            raise AuthError(
                f"failed to start OAuth callback server on {self.host}:{self.port}: {exc}"
            ) from exc
        server.expected_state = self.expected_state
        server.expected_path = self.path
        server.result_queue = queue.Queue(maxsize=1)
        self._server = server
        self._thread = threading.Thread(target=server.serve_forever, daemon=True)
        self._thread.start()

    def wait_for_code(self, timeout_seconds: float) -> OAuthCallback | None:
        if self._server is None:
            return None
        try:
            result = self._server.result_queue.get(timeout=max(timeout_seconds, 0))
        except queue.Empty:
            return None
        if isinstance(result, AuthError):
            raise result
        return result

    def close(self) -> None:
        server = self._server
        if server is None:
            return
        self._server = None
        server.shutdown()
        server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=1)
            self._thread = None


class AuthProvider:
    """Manage OpenAI account/API-key login state for the Codex-style agent."""

    def __init__(
        self,
        *,
        state_home: str | Path | None = None,
        credential_store: CredentialStore | None = None,
        env: Mapping[str, str] | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.env = os.environ if env is None else env
        self.state_home = Path(
            state_home or self.env.get(STATE_HOME_ENV, "") or DEFAULT_STATE_HOME
        ).expanduser()
        self.agent_dir = self.state_home / CODEX_AGENT_DIR
        self.auth_path = self.agent_dir / AUTH_FILENAME
        self.config_path = self.agent_dir / CONFIG_FILENAME
        self.credentials_path = self.agent_dir / CREDENTIALS_FILENAME
        self.credential_store = credential_store or FileCredentialStore(self.credentials_path)
        self.http_client = http_client

    def current_session(self) -> AuthSession:
        metadata = self._read_auth_metadata()
        mode = str(metadata.get("mode") or "offline")
        if mode == "openai_account" and self.credential_store.get(ACCESS_TOKEN_KEY):
            return AuthSession(
                mode=mode,
                account_label=str(
                    metadata.get("account_label")
                    or self.credential_store.get(ACCOUNT_LABEL_KEY)
                    or "OpenAI account"
                ),
                expires_at=_float_or_none(
                    metadata.get("expires_at") or self.credential_store.get(EXPIRES_AT_KEY)
                ),
            )
        if mode == "openai_api_key" and (
            self.credential_store.get(API_KEY_KEY) or self.env.get("OPENAI_API_KEY")
        ):
            return AuthSession(mode=mode, account_label="OpenAI API key")
        return AuthSession(mode="offline")

    def status_text(self) -> str:
        session = self.current_session()
        if not session.is_authenticated:
            return "not logged in"
        if session.is_expired:
            return f"{session.mode} session expired"
        suffix = f" ({session.account_label})" if session.account_label else ""
        return f"logged in via {session.mode}{suffix}"

    def auth_metadata(self) -> dict[str, object]:
        return self._read_auth_metadata()

    def access_token(self, *, refresh_if_needed: bool = True, refresh_margin_seconds: float = 60) -> str:
        session = self.current_session()
        if session.mode != "openai_account" or not session.is_authenticated:
            raise AuthError("OpenAI account login is required")
        if (
            refresh_if_needed
            and session.expires_at is not None
            and session.expires_at <= time.time() + refresh_margin_seconds
        ):
            session = self.refresh_session()
        token = self.credential_store.get(ACCESS_TOKEN_KEY)
        if not token:
            raise AuthError("OpenAI account access token is unavailable; run idea2repo auth login")
        return token

    def write_config(self, data: Mapping[str, object]) -> None:
        current = self.read_config()
        current.update({str(key): value for key, value in data.items()})
        self._write_json(self.config_path, current)

    def read_config(self) -> dict[str, object]:
        return self._read_json(self.config_path)

    def login_with_browser(
        self,
        *,
        oauth_config: OAuthConfig | None = None,
        open_browser: bool = True,
        timeout_seconds: float = DEFAULT_BROWSER_LOGIN_TIMEOUT_SECONDS,
        manual_input_func: Callable[[str], str] | None = None,
        on_auth: Callable[[PendingOAuthLogin], None] | None = None,
        permission_policy: PermissionPolicy | None = None,
    ) -> AuthSession:
        """Run the official browser OAuth flow and wait for the loopback callback."""

        if permission_policy is not None:
            permission_policy.require(Operation.LOGIN, "openai account login")
            permission_policy.require(Operation.NETWORK, "openai oauth browser login")
        config = oauth_config or OAuthConfig.from_env(self.env)
        if config is None:
            raise AuthError(_missing_oauth_config_message())
        pending = self._create_pending_login(config)
        callback_server = _OAuthCallbackServer(config.redirect_uri, pending.state)
        callback_start_error: AuthError | None = None
        try:
            try:
                callback_server.start()
            except AuthError as exc:
                callback_start_error = exc
            if open_browser:
                webbrowser.open(pending.authorization_url)
            if on_auth is not None:
                on_auth(pending)

            callback = None
            if callback_server.is_running:
                callback = callback_server.wait_for_code(timeout_seconds)
            if callback is not None:
                code = callback.code
                state = callback.state
            else:
                if manual_input_func is None:
                    if callback_start_error is not None:
                        raise callback_start_error
                    raise AuthError(
                        "Timed out waiting for OpenAI browser login callback; "
                        "rerun login and paste the redirect URL if the browser cannot "
                        "return to the CLI"
                    )
                authorization_input = manual_input_func(
                    "Paste authorization code or full redirect URL: "
                ).strip()
                parsed = parse_authorization_response(authorization_input)
                if parsed.state and not secrets.compare_digest(parsed.state, pending.state):
                    raise AuthError("OAuth state mismatch; restart login")
                if not parsed.code:
                    raise AuthError("Missing authorization code")
                code = parsed.code
                state = parsed.state or pending.state

            return self.complete_browser_login(
                code=code,
                state=state,
                code_verifier=pending.code_verifier,
                oauth_config=config,
            )
        finally:
            callback_server.close()

    def begin_browser_login(
        self,
        *,
        oauth_config: OAuthConfig | None = None,
        open_browser: bool = True,
        permission_policy: PermissionPolicy | None = None,
    ) -> PendingOAuthLogin:
        if permission_policy is not None:
            permission_policy.require(Operation.LOGIN, "openai account login")
            permission_policy.require(Operation.NETWORK, "openai oauth authorization")
        config = oauth_config or OAuthConfig.from_env(self.env)
        if config is None:
            raise AuthError(_missing_oauth_config_message())
        pending = self._create_pending_login(config)
        if open_browser:
            webbrowser.open(pending.authorization_url)
        return pending

    def complete_browser_login(
        self,
        *,
        code: str,
        state: str,
        code_verifier: str,
        oauth_config: OAuthConfig | None = None,
        permission_policy: PermissionPolicy | None = None,
    ) -> AuthSession:
        if permission_policy is not None:
            permission_policy.require(Operation.LOGIN, "openai account login")
            permission_policy.require(Operation.NETWORK, "openai oauth token exchange")
        metadata = self._read_auth_metadata()
        expected_state = str(metadata.get("state") or "")
        if not expected_state or not secrets.compare_digest(expected_state, state):
            raise AuthError("OAuth state mismatch; restart login")
        config = oauth_config or OAuthConfig.from_env(self.env)
        if config is None:
            raise AuthError(_missing_oauth_config_message())
        token_payload = self._post_token(
            config.token_url,
            {
                "grant_type": "authorization_code",
                "client_id": config.client_id,
                "code": code,
                "redirect_uri": config.redirect_uri,
                "code_verifier": code_verifier,
            },
        )
        return self._store_openai_account_session(token_payload)

    def refresh_session(
        self,
        *,
        oauth_config: OAuthConfig | None = None,
        permission_policy: PermissionPolicy | None = None,
    ) -> AuthSession:
        if permission_policy is not None:
            permission_policy.require(Operation.LOGIN, "openai account refresh")
            permission_policy.require(Operation.NETWORK, "openai oauth refresh")
        refresh_token = self.credential_store.get(REFRESH_TOKEN_KEY)
        if not refresh_token:
            raise AuthError("OpenAI account session is expired and no refresh token is available")
        config = oauth_config or OAuthConfig.from_env(self.env)
        if config is None:
            raise AuthError(_missing_oauth_config_message())
        token_payload = self._post_token(
            config.token_url,
            {
                "grant_type": "refresh_token",
                "client_id": config.client_id,
                "refresh_token": refresh_token,
            },
        )
        return self._store_openai_account_session(token_payload)

    def login_with_device_code(
        self,
        *,
        oauth_config: OAuthConfig | None = None,
        permission_policy: PermissionPolicy | None = None,
    ) -> dict[str, object]:
        if permission_policy is not None:
            permission_policy.require(Operation.LOGIN, "openai device login")
            permission_policy.require(Operation.NETWORK, "openai device authorization")
        config = oauth_config or OAuthConfig.from_env(self.env)
        if config is None or not config.device_authorization_url:
            raise AuthError("OpenAI device login requires IDEA2REPO_OPENAI_OAUTH_DEVICE_URL")
        payload = self._post_token(
            config.device_authorization_url,
            {
                "client_id": config.client_id,
                "scope": config.scope,
            },
        )
        device_code = str(payload.get("device_code") or "")
        if not device_code:
            raise AuthError("OpenAI device authorization response did not include a device code")
        self.credential_store.set(DEVICE_CODE_KEY, device_code)
        self._write_auth_metadata(
            {
                "mode": "pending_openai_device",
                "created_at": _now(),
                "verification_uri": payload.get("verification_uri", ""),
                "user_code": payload.get("user_code", ""),
            }
        )
        return payload

    def login_with_api_key(
        self,
        api_key: str,
        *,
        permission_policy: PermissionPolicy | None = None,
    ) -> AuthSession:
        if permission_policy is not None:
            permission_policy.require(Operation.LOGIN, "openai api key login")
        if not api_key.strip():
            raise AuthError("API key must not be empty")
        self.credential_store.set(API_KEY_KEY, api_key.strip())
        self._write_auth_metadata(
            {
                "mode": "openai_api_key",
                "account_label": "OpenAI API key",
                "updated_at": _now(),
                "secret_storage": "file_credentials",
            }
        )
        return AuthSession(mode="openai_api_key", account_label="OpenAI API key")

    def logout(self) -> None:
        self.credential_store.delete(ACCESS_TOKEN_KEY)
        self.credential_store.delete(REFRESH_TOKEN_KEY)
        self.credential_store.delete(API_KEY_KEY)
        self.credential_store.delete(DEVICE_CODE_KEY)
        self.credential_store.delete(EXPIRES_AT_KEY)
        self.credential_store.delete(ACCOUNT_LABEL_KEY)
        delete_file = getattr(self.credential_store, "delete_file", None)
        if callable(delete_file):
            delete_file()
        self._write_auth_metadata({"mode": "offline", "updated_at": _now()})

    def _store_openai_account_session(self, token_payload: Mapping[str, Any]) -> AuthSession:
        access_token = str(token_payload.get("access_token") or "")
        if not access_token:
            raise AuthError("OAuth token response did not include an access token")
        self.credential_store.set(ACCESS_TOKEN_KEY, access_token)
        refresh_token = str(token_payload.get("refresh_token") or "")
        if refresh_token:
            self.credential_store.set(REFRESH_TOKEN_KEY, refresh_token)
        expires_at = None
        if token_payload.get("expires_in") is not None:
            expires_at = time.time() + int(token_payload["expires_in"])
        account_label = _account_label(token_payload)
        self.credential_store.set(EXPIRES_AT_KEY, str(expires_at or ""))
        self.credential_store.set(ACCOUNT_LABEL_KEY, account_label)
        self._write_auth_metadata(
            {
                "mode": "openai_account",
                "account_label": account_label,
                "expires_at": expires_at,
                "updated_at": _now(),
                "secret_storage": "file_credentials",
            }
        )
        return AuthSession(
            mode="openai_account",
            account_label=account_label,
            expires_at=expires_at,
        )

    def _create_pending_login(self, config: OAuthConfig) -> PendingOAuthLogin:
        state = secrets.token_urlsafe(32)
        code_verifier = _pkce_verifier()
        params = {
            "client_id": config.client_id,
            "response_type": "code",
            "redirect_uri": config.redirect_uri,
            "scope": config.scope,
            "state": state,
            "code_challenge": _pkce_challenge(code_verifier),
            "code_challenge_method": "S256",
        }
        if _is_official_openai_authorize_url(config.authorization_url):
            params.update(
                {
                    "id_token_add_organizations": "true",
                    "codex_cli_simplified_flow": "true",
                    "originator": str(
                        self.env.get("IDEA2REPO_OPENAI_OAUTH_ORIGINATOR", "idea2repo")
                    ),
                }
            )
        authorization_url = f"{config.authorization_url}?{urlencode(params)}"
        self._write_auth_metadata(
            {
                "mode": "pending_openai_account",
                "state": state,
                "created_at": _now(),
                "config_source": config.source,
                "redirect_uri": config.redirect_uri,
            }
        )
        return PendingOAuthLogin(
            authorization_url=authorization_url,
            state=state,
            code_verifier=code_verifier,
        )

    def _post_token(self, url: str, data: Mapping[str, object]) -> dict[str, object]:
        client = self.http_client or httpx.Client(timeout=30)
        close_client = self.http_client is None
        try:
            response = client.post(url, data=data)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise AuthError("OAuth response was not a JSON object")
            return payload
        except httpx.HTTPError as exc:
            raise AuthError(f"OAuth request failed: {exc}") from exc
        finally:
            if close_client:
                client.close()

    def _read_auth_metadata(self) -> dict[str, object]:
        return self._read_json(self.auth_path)

    def _write_auth_metadata(self, data: Mapping[str, object]) -> None:
        self._ensure_default_config()
        self._write_json(self.auth_path, dict(data))

    def _ensure_default_config(self) -> None:
        current = self._read_json(self.config_path)
        defaults = {
            "version": 1,
            "agent": "codex",
            "auth_metadata_path": str(self.auth_path),
            "credentials_path": str(self.credentials_path),
            "secret_storage": "file_credentials",
            "oauth_config_source": "official_openai_codex_or_environment",
            "disallowed_token_sources": [
                "~/.codex",
                "browser_cookies",
            ],
        }
        changed = False
        for key, value in defaults.items():
            if key not in current:
                current[key] = value
                changed = True
        if changed:
            self._write_json(self.config_path, current)

    def _read_json(self, path: Path) -> dict[str, object]:
        if not path.exists():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _write_json(self, path: Path, data: Mapping[str, object]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(dict(data), indent=2, sort_keys=True) + "\n", encoding="utf-8")
        try:
            path.chmod(0o600)
        except OSError:
            return


def auth_paths(state_home: str | Path | None = None) -> dict[str, Path]:
    root = Path(state_home or os.environ.get(STATE_HOME_ENV, "") or DEFAULT_STATE_HOME).expanduser()
    agent_dir = root / CODEX_AGENT_DIR
    return {
        "state_home": root,
        "agent_dir": agent_dir,
        "auth": agent_dir / AUTH_FILENAME,
        "config": agent_dir / CONFIG_FILENAME,
        "credentials": agent_dir / CREDENTIALS_FILENAME,
    }


def parse_authorization_response(input_value: str) -> AuthorizationResponse:
    """Parse a pasted callback URL, query string, code#state pair, or raw code."""

    value = input_value.strip()
    if not value:
        return AuthorizationResponse()

    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        query = parse_qs(parsed.query)
        fragment = parse_qs(parsed.fragment)
        return AuthorizationResponse(
            code=_first(query.get("code")) or _first(fragment.get("code")),
            state=_first(query.get("state")) or _first(fragment.get("state")),
        )

    if "#" in value:
        code, state = value.split("#", 1)
        return AuthorizationResponse(code=code.strip() or None, state=state.strip() or None)

    if "code=" in value or "state=" in value:
        params = parse_qs(value.lstrip("?"))
        return AuthorizationResponse(
            code=_first(params.get("code")),
            state=_first(params.get("state")),
        )

    return AuthorizationResponse(code=value)


def _keyring():
    try:
        import keyring
    except Exception:
        return None
    return keyring


def _env_secret_name(key: str) -> str:
    return f"IDEA2REPO_{key.upper()}"


def _pkce_verifier() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii").rstrip("=")


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _float_or_none(value: object) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _now() -> float:
    return time.time()


def _account_label(token_payload: Mapping[str, Any]) -> str:
    profile = token_payload.get("profile")
    if isinstance(profile, Mapping):
        email = str(profile.get("email") or "").strip()
        if email:
            return email
    access_token = str(token_payload.get("access_token") or "")
    jwt_payload = _decode_jwt_payload(access_token)
    if jwt_payload is not None:
        email = str(jwt_payload.get("email") or "").strip()
        if email:
            return email
        openai_auth = jwt_payload.get(OFFICIAL_OPENAI_JWT_CLAIM)
        if isinstance(openai_auth, Mapping):
            account_id = str(openai_auth.get("chatgpt_account_id") or "").strip()
            if account_id:
                return account_id
    return "OpenAI account"


def _missing_oauth_config_message() -> str:
    return (
        "OpenAI account login requires either the built-in official OpenAI Codex OAuth "
        "configuration or a complete environment override: IDEA2REPO_OPENAI_OAUTH_CLIENT_ID, "
        "IDEA2REPO_OPENAI_OAUTH_AUTHORIZE_URL, IDEA2REPO_OPENAI_OAUTH_TOKEN_URL, and "
        "IDEA2REPO_OPENAI_OAUTH_REDIRECT_URI"
    )


def _first(values: list[str] | None) -> str | None:
    if not values:
        return None
    value = values[0].strip()
    return value or None


def _is_official_openai_authorize_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.netloc == "auth.openai.com"


def _decode_jwt_payload(token: str) -> Mapping[str, Any] | None:
    parts = token.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode((payload + padding).encode("ascii"))
        data = json.loads(decoded.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, Mapping) else None
