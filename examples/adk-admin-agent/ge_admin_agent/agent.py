"""Gemini Enterprise admin agent: ADK + ge-app-mcp tools + the packaged admin skills."""
import os

from google.adk import Agent
from google.adk.tools import skill_toolset

from .wiring import build_toolsets, load_skills

read_only_tools, mutating_tools = build_toolsets()

root_agent = Agent(
    model=os.environ.get("GE_AGENT_MODEL", "gemini-flash-latest"),
    name="ge_admin_agent",
    description="Inspects and administers Gemini Enterprise apps, data stores, connectors, agents and licenses.",
    instruction=(
        "You are a Gemini Enterprise administrator. Load the matching skill before acting and follow it exactly. "
        "Use the read-only inspection tools first. Every change needs the user's confirmation."
    ),
    tools=[skill_toolset.SkillToolset(skills=load_skills()), read_only_tools, mutating_tools],
)
