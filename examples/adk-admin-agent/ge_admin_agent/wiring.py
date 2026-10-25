"""Wiring between an ADK agent and the ge-app-mcp server: skills, MCP connection and per-user auth.

Pure helpers live here so they can be unit tested without a model or Google Cloud credentials.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Mapping

from google.adk.skills import load_skill_from_dir
from google.adk.tools.mcp_tool import McpToolset, StdioConnectionParams, StreamableHTTPConnectionParams
from mcp import StdioServerParameters

# Skills are read from the repository so the example never drifts from the published SKILL.md files.
REPO_SKILLS_DIR = Path(__file__).resolve().parents[3] / "skills"
DEFAULT_SKILLS = ("admin-assistant", "agent-workflow-architect")
DEFAULT_SERVER_ARGS = "-y ge-app-mcp@0.4.0"
DEFAULT_TOKEN_STATE_KEY = "ge_mcp_user_token"
_PASSTHROUGH_ENV = ("GOOGLE_APPLICATION_CREDENTIALS", "CLOUDSDK_CONFIG", "GCP_LOCATION")


def load_skills(skills_dir: str | Path = REPO_SKILLS_DIR, names: tuple[str, ...] = DEFAULT_SKILLS) -> list:
    return [load_skill_from_dir(Path(skills_dir) / name) for name in names]


def is_read_only(tool: Any, readonly_context: Any = None) -> bool:
    """Trusts the server's readOnlyHint; a tool without annotations is treated as mutating (fail safe)."""
    annotations = getattr(getattr(tool, "raw_mcp_tool", None), "annotations", None)
    # mcp>=2 uses read_only_hint, mcp 1.x used readOnlyHint.
    hint = getattr(annotations, "read_only_hint", None)
    if hint is None:
        hint = getattr(annotations, "readOnlyHint", None)
    return hint is True


def is_mutating(tool: Any, readonly_context: Any = None) -> bool:
    return not is_read_only(tool, readonly_context)


def user_token_header_provider(
    state_key: str,
    invoker_token: Callable[[], str] | None = None,
    adc_token: Callable[[], str] | None = None,
) -> Callable[[Any], dict[str, str]]:
    """Builds per-request headers so the remote server acts on behalf of the end user.

    The user's OAuth token goes in Authorization; the Cloud Run invoker ID token (the agent's own
    identity) goes in X-Serverless-Authorization, so the two identities never mix.
    """

    def provide(readonly_context: Any) -> dict[str, str]:
        token = readonly_context.state.get(state_key) if readonly_context is not None else None
        if not token and adc_token is not None:
            token = adc_token()
        if not token:
            # Fail closed: never call the admin server without the caller's own identity.
            raise PermissionError(f"No end-user OAuth access token in session state '{state_key}'.")
        headers = {"authorization": f"Bearer {token}"}
        if invoker_token is not None:
            headers["x-serverless-authorization"] = f"Bearer {invoker_token()}"
        return headers

    return provide


def cloud_run_invoker_token(audience: str) -> Callable[[], str]:
    """ID token for Cloud Run IAM, refreshed only when expired (needs a service identity, not user ADC)."""
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token

    credentials = None

    def token() -> str:
        nonlocal credentials
        if credentials is None:
            credentials = id_token.fetch_id_token_credentials(audience, request=Request())
        if not credentials.valid:
            credentials.refresh(Request())
        return credentials.token

    return token


def local_adc_token() -> Callable[[], str]:
    """Local development only: the developer's own ADC token (still a user identity, never a shared one)."""
    import google.auth
    from google.auth.transport.requests import Request

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])

    def token() -> str:
        if not credentials.valid:
            credentials.refresh(Request())
        return credentials.token

    return token


def connection_from_env(env: Mapping[str, str]) -> tuple[Any, Callable[[Any], dict[str, str]] | None]:
    transport = env.get("GE_MCP_TRANSPORT", "stdio")
    if transport == "stdio":
        project = env.get("GCP_PROJECT") or env.get("GOOGLE_CLOUD_PROJECT")
        if not project:
            raise ValueError("Set GCP_PROJECT (or GOOGLE_CLOUD_PROJECT) for the stdio transport.")
        server_env = {"GCP_PROJECT": project, "MCP_SCOPES": env.get("MCP_SCOPES", "search,admin,billing")}
        server_env.update({k: env[k] for k in _PASSTHROUGH_ENV if env.get(k)})
        params = StdioServerParameters(
            command=env.get("GE_MCP_COMMAND", "npx"),
            args=env.get("GE_MCP_ARGS", DEFAULT_SERVER_ARGS).split(),
            env=server_env,
        )
        return StdioConnectionParams(server_params=params, timeout=60), None

    if transport == "http":
        url = env.get("GE_MCP_URL")
        if not url:
            raise ValueError("Set GE_MCP_URL (e.g. https://<service>.run.app/mcp) for the http transport.")
        invoker = None
        if env.get("GE_MCP_CLOUD_RUN_AUDIENCE"):
            invoker = cloud_run_invoker_token(env["GE_MCP_CLOUD_RUN_AUDIENCE"])
        adc = local_adc_token() if env.get("GE_MCP_LOCAL_ADC") == "true" else None
        headers = user_token_header_provider(env.get("GE_MCP_TOKEN_STATE_KEY", DEFAULT_TOKEN_STATE_KEY), invoker, adc)
        return StreamableHTTPConnectionParams(url=url, timeout=60), headers

    raise ValueError(f"Unsupported GE_MCP_TRANSPORT '{transport}' (use stdio or http).")


def build_toolsets(env: Mapping[str, str] | None = None) -> tuple[McpToolset, McpToolset]:
    """Two views of the same server: read-only tools run freely, mutating tools need human confirmation."""
    connection, headers = connection_from_env(os.environ if env is None else env)
    read_only = McpToolset(connection_params=connection, tool_filter=is_read_only, header_provider=headers)
    mutating = McpToolset(
        connection_params=connection, tool_filter=is_mutating, header_provider=headers, require_confirmation=True
    )
    return read_only, mutating
