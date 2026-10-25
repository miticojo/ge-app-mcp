"""Tests for the ADK <-> ge-app-mcp wiring. Run: .venv/bin/python -m unittest discover -s tests -v"""
import asyncio
import os
import shutil
import types
import unittest
from pathlib import Path

# The package __init__ builds root_agent from the environment (ADK convention), so give it a project.
os.environ.setdefault("GCP_PROJECT", "acme-ge-prod")

from ge_admin_agent import wiring  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]


def fake_tool(read_only, field="read_only_hint"):
    annotations = None if read_only is None else types.SimpleNamespace(**{field: read_only})
    return types.SimpleNamespace(raw_mcp_tool=types.SimpleNamespace(annotations=annotations))


def fake_ctx(state):
    return types.SimpleNamespace(state=state)


class SkillsTest(unittest.TestCase):
    def test_loads_the_packaged_admin_skills(self):
        names = [s.frontmatter.name for s in wiring.load_skills()]
        self.assertEqual(names, ["admin-assistant", "agent-workflow-architect"])


class ReadOnlySplitTest(unittest.TestCase):
    def test_follows_the_server_read_only_hint(self):
        self.assertTrue(wiring.is_read_only(fake_tool(True)))
        self.assertFalse(wiring.is_read_only(fake_tool(False)))

    def test_accepts_the_mcp_1x_camel_case_hint(self):
        self.assertTrue(wiring.is_read_only(fake_tool(True, field="readOnlyHint")))

    def test_tools_without_annotations_are_treated_as_mutating(self):
        self.assertFalse(wiring.is_read_only(fake_tool(None)))
        self.assertTrue(wiring.is_mutating(fake_tool(None)))


class UserTokenHeadersTest(unittest.TestCase):
    def test_forwards_the_user_token_from_session_state(self):
        provide = wiring.user_token_header_provider("user_token")
        self.assertEqual(provide(fake_ctx({"user_token": "tok-a"})), {"authorization": "Bearer tok-a"})

    def test_fails_closed_without_a_user_token(self):
        provide = wiring.user_token_header_provider("user_token")
        with self.assertRaises(PermissionError):
            provide(fake_ctx({}))

    def test_local_adc_fallback_is_used_only_when_enabled(self):
        provide = wiring.user_token_header_provider("user_token", adc_token=lambda: "tok-local")
        self.assertEqual(provide(fake_ctx({})), {"authorization": "Bearer tok-local"})

    def test_adds_cloud_run_invoker_token_separately(self):
        provide = wiring.user_token_header_provider("user_token", invoker_token=lambda: "id-tok")
        headers = provide(fake_ctx({"user_token": "tok-a"}))
        self.assertEqual(headers["authorization"], "Bearer tok-a")
        self.assertEqual(headers["x-serverless-authorization"], "Bearer id-tok")


class ConnectionFromEnvTest(unittest.TestCase):
    def test_stdio_pins_the_published_server_and_passes_project_and_scopes(self):
        conn, headers = wiring.connection_from_env({"GCP_PROJECT": "acme-ge-prod"})
        params = conn.server_params
        self.assertEqual(params.command, "npx")
        self.assertEqual(params.args, ["-y", "ge-app-mcp@0.4.0"])
        self.assertEqual(params.env["GCP_PROJECT"], "acme-ge-prod")
        self.assertEqual(params.env["MCP_SCOPES"], "search,admin,billing")
        self.assertIsNone(headers)

    def test_stdio_requires_a_project(self):
        with self.assertRaises(ValueError):
            wiring.connection_from_env({})

    def test_http_requires_a_url_and_uses_per_user_headers(self):
        with self.assertRaises(ValueError):
            wiring.connection_from_env({"GE_MCP_TRANSPORT": "http"})
        conn, headers = wiring.connection_from_env({"GE_MCP_TRANSPORT": "http", "GE_MCP_URL": "https://mcp.example/mcp"})
        self.assertEqual(conn.url, "https://mcp.example/mcp")
        self.assertEqual(headers(fake_ctx({"ge_mcp_user_token": "tok-b"})), {"authorization": "Bearer tok-b"})

    def test_rejects_unknown_transports(self):
        with self.assertRaises(ValueError):
            wiring.connection_from_env({"GE_MCP_TRANSPORT": "sse", "GCP_PROJECT": "p"})


@unittest.skipUnless(shutil.which("node") and (REPO_ROOT / "build" / "index.js").exists(), "needs `npm run build` in the repo root")
class LiveServerSplitTest(unittest.TestCase):
    """Starts the real server over stdio (tools/list needs no GCP call) and checks the read/write split."""

    def test_read_only_tools_skip_confirmation_and_mutating_tools_require_it(self):
        env = {"GCP_PROJECT": "acme-ge-prod", "GE_MCP_COMMAND": "node", "GE_MCP_ARGS": str(REPO_ROOT / "build" / "index.js")}
        read_set, write_set = wiring.build_toolsets(env)

        async def names(toolset):
            try:
                return {t.name for t in await toolset.get_tools()}
            finally:
                await toolset.close()

        read_names = asyncio.run(names(read_set))
        write_names = asyncio.run(names(write_set))
        self.assertIn("gemini_enterprise_inspect", read_names)
        self.assertIn("gemini_enterprise_inspect_licenses", read_names)
        self.assertIn("gemini_enterprise_manage_features", write_names)
        self.assertFalse(read_names & write_names)
        self.assertFalse(any(n.startswith("gemini_enterprise_manage_") for n in read_names))


if __name__ == "__main__":
    unittest.main()
