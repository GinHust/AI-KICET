"""Manual smoke prompts for multi-agent grounding checks.

This module is intentionally a small developer helper, not an automated
benchmark/evaluation framework. It formats one prompt per configured agent so a
human can run representative discussion/debug flows and inspect grounding.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_AGENTS_PATH = Path(__file__).resolve().parents[2] / "data" / "discussion_knowledge" / "agents.json"


def load_agents(path: Path | str = DEFAULT_AGENTS_PATH) -> list[dict[str, Any]]:
    """Load the current discussion agents from ``agents.json``."""
    agents_path = Path(path)
    agents = json.loads(agents_path.read_text(encoding="utf-8"))
    if not isinstance(agents, list):
        raise ValueError(f"Expected a list of agents in {agents_path}")
    return agents


def build_agent_smoke_prompts(agents: list[dict[str, Any]] | None = None) -> list[dict[str, str]]:
    """Return one manual smoke prompt per agent.

    Each prompt asks for the grounding structure expected by the live discussion
    flow while staying broad enough to exercise agent-specific retrieval.
    """
    current_agents = agents if agents is not None else load_agents()
    prompts: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for agent in current_agents:
        agent_id = str(agent.get("agent_id") or "").strip()
        name = str(agent.get("name") or "").strip()
        if not agent_id or not name:
            raise ValueError("Each smoke-prompt agent must have agent_id and name")
        if agent_id in seen_ids:
            raise ValueError(f"Duplicate agent_id in smoke prompts: {agent_id}")
        seen_ids.add(agent_id)

        focus = str(agent.get("focus") or agent.get("expertise") or "the agent specialty").strip()
        expertise = str(agent.get("expertise") or agent.get("perspective") or focus).strip()
        evidence_focus = ", ".join(str(item) for item in agent.get("evidence_focus", [])[:4])
        retrieval_terms = ", ".join(str(item) for item in agent.get("retrieval_terms", [])[:5])
        next_action_hint = str(agent.get("next_action_hint") or "propose the next discriminating experiment").strip()

        prompt = (
            f"As {name}, evaluate how MPCVD diamond process choices should be grounded for: {focus}. "
            f"Use your expertise in {expertise}. Prioritize evidence about {evidence_focus or retrieval_terms}. "
            "Return a concise structured answer with: claim, evidence IDs from retrieved chunks only, "
            "reasoning, uncertainty/evidence-gap notes when support is weak, and a proposed experiment. "
            f"Next-check emphasis: {next_action_hint}. Do not invent citations, setpoints, or evidence IDs."
        )
        prompts.append({"agent_id": agent_id, "agent_name": name, "prompt": prompt})

    return prompts


if __name__ == "__main__":
    for item in build_agent_smoke_prompts():
        print(f"[{item['agent_id']}] {item['agent_name']}\n{item['prompt']}\n")
