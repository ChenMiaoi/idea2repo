"""Command line entry point for Idea2Repo."""

from __future__ import annotations

import argparse
import getpass
import sys

from .auth import AuthError, AuthProvider
from .codex_agent import CodexAgentError, CodexCliClient
from .generator import generate_research_repo, resume_research_repo
from .github_export import build_github_export_plan, publish_with_gh
from .interactive import run_interactive_session
from .permissions import PermissionDeniedError, PermissionPolicy
from .providers import load_provider_config, safe_provider_report, validate_provider_config
from .state import status as project_status
from .state import validate as validate_project
from .venues import load_venue_database, validate_venue_database
from .workspace import inspect_workspace


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="idea2repo",
        description="Generate a CCF-A readiness repository from a research idea.",
    )
    parser.add_argument("idea", help="Raw research idea text.")
    parser.add_argument(
        "--output",
        default="generated_repos/idea2repo-project",
        help="Directory where the research repository will be generated.",
    )
    parser.add_argument(
        "--domain",
        action="append",
        dest="domains",
        help=(
            "Target domain or venue hint. Can be repeated. Examples: ai, security, "
            "systems, AI/LLM Agent, CCS, OSDI, 安全, 系统."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite files in a non-empty output directory.",
    )
    parser.add_argument(
        "--weeks",
        type=int,
        choices=(8, 12, 16, 24),
        default=12,
        help="Execution timeline in weeks. Use 24 for a six-month plan.",
    )
    parser.add_argument(
        "--resource",
        action="append",
        dest="resources",
        help=(
            "Resource constraint or capability. Can be repeated. Examples: "
            "single-researcher, no-gpu, gpu, real-data, no-real-data."
        ),
    )
    parser.add_argument(
        "--stack",
        choices=("python", "ts"),
        default="python",
        help="Generated research scaffold stack.",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Use deterministic local fallback instead of calling Codex.",
    )
    parser.add_argument(
        "--provider",
        choices=("openai-codex-oauth", "openai-codex-cli", "offline"),
        default=None,
        help="Analysis provider. Defaults to openai-codex-oauth unless --offline is set.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Codex model slug for OAuth/CLI providers.",
    )
    parser.add_argument(
        "--reasoning",
        default=None,
        help="Codex reasoning effort for the selected model.",
    )
    _add_permission_flags(parser)
    return parser


def build_command_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="idea2repo",
        description="Local-first CCF-A research repository agent.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser("generate", help="Generate a CCF-A readiness repository.")
    legacy = build_parser()
    for action in legacy._actions:
        if action.dest == "help":
            continue
        generate._add_action(action)

    status_parser = subparsers.add_parser("status", help="Show generated project status.")
    status_parser.add_argument("--output", default="generated_repos/idea2repo-project")

    resume = subparsers.add_parser("resume", help="Restore missing generated artifacts without overwriting edits.")
    resume.add_argument("--output", default="generated_repos/idea2repo-project")
    resume.add_argument("--force", action="store_true", help="Allow overwriting generated artifacts.")
    _add_permission_flags(resume)

    validate = subparsers.add_parser("validate", help="Validate generated artifacts against the manifest.")
    validate.add_argument("--output", default="generated_repos/idea2repo-project")

    doctor = subparsers.add_parser("doctor", help="Inspect the current local workspace.")
    doctor.add_argument("--cwd", default=".")

    provider = subparsers.add_parser("provider", help="Inspect provider configuration without exposing secrets.")
    provider.add_argument("action", choices=("validate", "show", "list"))

    login = subparsers.add_parser("login", help="Sign in with OpenAI for interactive sessions.")
    login.add_argument(
        "--api-key",
        action="store_true",
        help="Use an OpenAI API key instead of browser OAuth.",
    )
    login.add_argument(
        "--no-browser",
        action="store_true",
        help="Print the OAuth URL without opening a browser.",
    )
    login.add_argument(
        "--timeout",
        type=float,
        default=600,
        help="Seconds to wait for the browser callback before prompting for a pasted redirect URL.",
    )
    _add_permission_flags(login)

    subparsers.add_parser("logout", help="Clear Idea2Repo login state.")

    auth = subparsers.add_parser("auth", help="Manage authentication state.")
    auth.add_argument("action", choices=("status", "login", "logout"))
    auth.add_argument("--no-browser", action="store_true", help="Print the OAuth URL instead of opening a browser.")
    auth.add_argument(
        "--timeout",
        type=float,
        default=600,
        help="Seconds to wait for the browser callback before prompting for a pasted redirect URL.",
    )

    venues = subparsers.add_parser("venues", help="Validate or inspect the CCF-A venue database.")
    venues.add_argument("action", choices=("validate",))
    venues.add_argument("--path", help="Optional venue database JSON path.")

    github = subparsers.add_parser("github", help="Preview or publish GitHub export payloads.")
    github.add_argument("action", choices=("dry-run", "publish"))
    github.add_argument("--output", default="generated_repos/idea2repo-project")
    github.add_argument("--repo-name", default="")
    github.add_argument(
        "--no-issues",
        action="store_true",
        help="Skip issue payload generation.",
    )
    _add_permission_flags(github)
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    command_names = {
        "auth",
        "generate",
        "status",
        "resume",
        "validate",
        "doctor",
        "provider",
        "login",
        "logout",
        "venues",
        "github",
    }
    if not argv:
        return run_interactive_session()
    parser = (
        build_command_parser()
        if argv[:1] and (argv[0] in command_names or argv[0] in {"-h", "--help"})
        else build_parser()
    )
    args = parser.parse_args(argv)
    try:
        command = getattr(args, "command", "generate")
        if command == "generate":
            result = generate_research_repo(
                args.idea,
                args.output,
                requested_domains=args.domains,
                timeline_weeks=args.weeks,
                resources=args.resources,
                force=args.force,
                permission_policy=_policy_from_args(args),
                stack=args.stack,
                offline=args.offline,
                provider="offline" if args.offline else args.provider,
                codex_model=args.model,
                reasoning_effort=args.reasoning,
            )
            _print_generation_result(result, args.weeks)
            return 0
        if command == "status":
            current = project_status(args.output)
            print(f"Project: {current.project_name}")
            print(f"Stage: {current.stage}")
            print(f"Artifacts: {current.present_artifacts}/{current.total_artifacts} present")
            print(f"Missing: {len(current.missing_artifacts)}")
            print(f"Modified: {len(current.modified_artifacts)}")
            return 0
        if command == "resume":
            result = resume_research_repo(
                args.output,
                force=args.force,
                permission_policy=_policy_from_args(args),
            )
            print(f"Resumed Idea2Repo project: {result.root}")
            print(f"Restored files: {len(result.files)}")
            return 0
        if command == "validate":
            errors = validate_project(args.output)
            if errors:
                for error in errors:
                    print(error, file=sys.stderr)
                return 1
            print("Validation passed")
            return 0
        if command == "doctor":
            snapshot = inspect_workspace(args.cwd)
            codex_status = CodexCliClient(cwd=args.cwd).check_login()
            oauth_status = AuthProvider().current_session()
            print(f"cwd: {snapshot.cwd}")
            print(f"git_root: {snapshot.git_root or 'not detected'}")
            print(f"git_branch: {snapshot.git_branch or 'not detected'}")
            print(f"git_status_entries: {len(snapshot.git_status_short)}")
            print(
                "oauth_login: "
                f"{'logged in' if oauth_status.is_authenticated and not oauth_status.is_expired else 'not logged in'}"
            )
            print(f"codex_cli: {'available' if codex_status.available else 'missing'}")
            print(f"codex_login: {'logged in' if codex_status.logged_in else 'not logged in'}")
            print(f"codex_version: {codex_status.version or 'unknown'}")
            return 0
        if command == "provider":
            if args.action == "list":
                print("openai-codex-oauth (default, experimental OAuth)")
                print("openai-codex-cli (official CLI wrapper)")
                print("offline (deterministic fallback)")
                return 0
            config = load_provider_config()
            if args.action == "show":
                print(safe_provider_report())
                return 0
            errors = validate_provider_config(config)
            if errors:
                for error in errors:
                    print(error, file=sys.stderr)
                return 1
            print("Provider configuration valid")
            return 0
        if command == "login":
            auth_provider = AuthProvider()
            if args.api_key:
                api_key = getpass.getpass("OpenAI API key: ")
                auth_provider.login_with_api_key(api_key)
                print("Logged in via Idea2Repo API key")
                return 0
            auth_provider.login_with_browser(
                open_browser=not args.no_browser,
                timeout_seconds=args.timeout,
                manual_input_func=input,
                on_auth=_print_login_url,
            )
            print("Logged in via Idea2Repo OAuth")
            return 0
        if command == "logout":
            AuthProvider().logout()
            print("Logged out")
            return 0
        if command == "auth":
            if args.action == "status":
                print(f"Auth: {AuthProvider().status_text()}")
                return 0
            if args.action == "login":
                AuthProvider().login_with_browser(
                    open_browser=not args.no_browser,
                    timeout_seconds=args.timeout,
                    manual_input_func=input,
                    on_auth=_print_login_url,
                )
                print("Logged in via Idea2Repo OAuth")
                return 0
            if args.action == "logout":
                AuthProvider().logout()
                print("Logged out")
                return 0
        if command == "venues":
            database = load_venue_database(args.path)
            errors = validate_venue_database(database)
            if errors:
                for error in errors:
                    print(error, file=sys.stderr)
                return 1
            total = sum(len(domain.venue_records) for domain in database.domains.values())
            print(f"Venue database valid: {database.version} ({total} records)")
            return 0
        if command == "github":
            plan = build_github_export_plan(
                args.output,
                repo_name=args.repo_name,
                create_issues=not args.no_issues,
            )
            if args.action == "dry-run":
                print(plan.json(), end="")
                return 0
            result = publish_with_gh(plan, permission_policy=_policy_from_args(args))
            print(result.json(), end="")
            return 0
    except (
        FileExistsError,
        ValueError,
        FileNotFoundError,
        PermissionDeniedError,
        AuthError,
        CodexAgentError,
    ) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"error: unknown command: {getattr(args, 'command', None)}", file=sys.stderr)
    return 2


def _print_generation_result(result, weeks: int) -> None:
    diagnosis = result.diagnosis
    print(f"Generated Idea2Repo project: {result.root}")
    print(f"Primary route: {diagnosis.routes[0].domain.label}")
    print(f"Raw Idea Score: {diagnosis.raw_score.total} / 100")
    print(f"Revised Plan Score: {diagnosis.revised_score.total} / 100")
    print(f"Provider: {result.provider_id}")
    print(f"Analysis source: {result.analysis_source}")
    print("Main report: docs/diagnosis/ccf_a_readiness_report.md")
    print(f"Execution plan: docs/execution_plan/{weeks}_week_plan.md")


def _print_login_url(pending) -> None:
    print("Open this URL to sign in with OpenAI:")
    print(pending.authorization_url)
    print("Waiting for the browser callback...")


def _add_permission_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--allow-network", action="store_true", help="Permit network operations.")
    parser.add_argument("--allow-login", action="store_true", help="Permit login operations.")
    parser.add_argument("--allow-install", action="store_true", help="Permit dependency installation.")
    parser.add_argument("--allow-publish", action="store_true", help="Permit external publishing.")


def _policy_from_args(args: argparse.Namespace) -> PermissionPolicy:
    return PermissionPolicy(
        allow_overwrite=bool(getattr(args, "force", False)),
        allow_network=bool(getattr(args, "allow_network", False)),
        allow_login=bool(getattr(args, "allow_login", False)),
        allow_install=bool(getattr(args, "allow_install", False)),
        allow_publish=bool(getattr(args, "allow_publish", False)),
    )
