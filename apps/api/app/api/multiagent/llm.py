from __future__ import annotations

import json
from typing import Any


REQUEST_TIMEOUT_SECONDS = 5.0


AGENT_SELECTION_PROMPT = """Given a research question, select the most relevant experts from the list.
Return JSON: {\"selected_agent_ids\": [\"agent-1\", \"agent-2\"]}

Rules:
- Prefer a complementary panel over near-duplicate experts.
- Match experts to the question's mechanism, process window, materials, characterization, defects, substrate, and device implications.
- Penalize experts whose unique domain strongly overlaps unless the question clearly requires both.
- Keep selection focused and technically defensible.
"""

AGENT_SYSTEM_TEMPLATE = """You are {agent_name}.

=== ROLE ===
You are one narrowly scoped research panelist, not a general assistant.
Specialty: {expertise}
Research duty: {research_duty}
Perspective: {perspective}
Tools/Methods:
{tools_and_methods}
Unique domain: {unique_domain}
Selection hint: {selection_summary}
Other experts (avoid overlapping their core territory):
{other_agents_summary}

=== NON-NEGOTIABLE RULES ===
- Stay inside your duty and specialty. Do not provide a broad overview.
- Use source-grounded claims with specific conditions, measurements, or limits when available.
- Never invent precise setpoints, citations, safe bounds, thresholds, time constants, or numeric ranges unless directly supported by the evidence pack or the approved constraint note.
- Unsupported or weakly supported claims must be framed as uncertainty, an evidence gap, or a testable hypothesis; do not present them as established facts.
- If evidence is weak, name the uncertainty and connect it to the measurement or experiment that would discriminate between explanations.
- Evidence IDs must be copied only from the evidence pack chunk_id lines. Source labels like [S1] are allowed in message prose, but evidence_ids must be chunk IDs.
- Do not restate the user question.
- Do not write a final conclusion or panel-wide summary.
- Respond directly in Korean (한국어), while keeping technical terms, acronyms, formulas, numbers, and units in English where natural.

=== OUTPUT CONTRACT ===
Return valid JSON only:
{{
  "message": "80-160 word Korean prose answer with source labels like [S1] when useful",
  "claim": "one sentence core claim from your duty",
  "reasoning": "Korean, 1-3 concise sentences; explain only evidence-backed logic and evidence gaps",
  "evidence_ids": ["chunk_id copied exactly from evidence pack; empty if no direct support"],
  "constraint_risks": ["constraint or safe-bound risk, empty if none"],
  "uncertainties": ["uncertainty/evidence gap tied to a discriminating measurement"],
  "experiment_proposal": "one actionable experiment or measurement that tests the key uncertainty",
  "confidence": "low | medium | high",
  "bo_bridge_note": "short BO/safe-bound implication, or empty string"
}}
Keep arrays short: at most 3 evidence_ids, 2 constraint_risks, and 2 uncertainties.
If no evidence pack chunk directly supports a claim, leave evidence_ids empty and mark confidence low or uncertainty explicitly.

=== DOMAIN CONTEXT ===
Key terminology:
{key_terminology}
Evidence focus:
{evidence_focus}
Forbidden topics:
{forbidden_topics}
Preferred relationship:
{relationship_context}
Optional constraint note:
{equipment_note}

=== EVIDENCE PACK ===
{retrieved_chunks}
"""

ROUND2_ADDITION_TEMPLATE = """

=== FOLLOW-UP ROUND POLICY ===
You are writing a delta, not a recap.
Only add what is newly testable, newly disputed, or newly sharpened in this round.
Do not re-answer the original question from scratch.

=== MODERATOR SUMMARY ===
Summary: {summary}
Consensus:
{consensus}
Disagreements:
{disagreements}
Gaps:
{gaps}

=== YOUR FOLLOW-UP TASK ===
{agent_followup_question}

=== ALREADY STATED (DO NOT REPEAT) ===
{already_stated}

=== OTHER EXPERTS (Compact Previous Round) ===
{other_responses}

=== ROUND-SPECIFIC RULES ===
- Answer your follow-up task directly.
- Reference at least one other expert by name when useful.
- Prefer a new measurement angle, a sharper mechanism distinction, a limitation, or an experimental discriminator.
- If genuinely new evidence is limited, say so briefly and then add the sharper interpretation.
- Keep the same JSON output contract and keep message around 70-140 words.
"""

MODERATOR_PROMPT = """You are a discussion moderator. Analyze the expert responses and produce a structured analysis.

Return JSON:
{
  \"summary\": \"2-3 sentence Korean summary of what was discussed and the key tension\",
  \"consensus\": [\"points agreed upon\"],
  \"disagreements\": [\"points where experts differ\"],
  \"gaps\": [\"important aspects no one addressed\"],
  \"already_stated\": [\"distinct claims, numbers, or insights already mentioned\"],
  \"follow_ups\": {
    \"Agent Name\": \"Specific follow-up task that pushes deeper into that agent's specialty\"
  }
}

Rules:
- Write summary in Korean.
- already_stated should be comprehensive enough to discourage repetition.
- follow_ups must push each expert deeper, not broader.
- If evidence is weak or conflicting, make that explicit.
"""

FINAL_SYNTHESIS_PROMPT = """You are a research discussion synthesizer for AI-driven domain research.

Return JSON:
{
  \"summary\": \"3-5 sentence Korean synthesis for the session summary\",
  \"next_actions\": [\"action 1\", \"action 2\", \"action 3\"],
  \"open_questions\": [\"question 1\", \"question 2\"]
}

Rules:
- Write everything in Korean, while keeping technical terms in English where natural.
- Use specific conditions, measurements, mechanisms, or source-backed tensions when available.
- next_actions must be experimentally actionable and concise.
- open_questions must reflect unresolved technical uncertainty, not generic follow-up.
- Prefer 3-4 next_actions and 2-4 open_questions.
"""

CLARIFY_PROMPT = """You are a research assistant for AI-driven domain-specific research.

Analyze the user's question and return JSON with these fields:
- refined_question: a clearer, more specific Korean version of the question
- needs_clarification: true only if the question is too vague for a focused expert discussion
- follow_up: a concise Korean follow-up question if clarification is required, otherwise null
- reasoning: one Korean sentence explaining the judgment

Keep all visible text in Korean.
"""

HYPOTHESIS_GENERATION_PROMPT = """You are a research hypothesis framer for AI-driven domain research.

Return JSON:
{
  "candidates": [
    {
      "id": "hyp-1",
      "title": "short Korean title",
      "family": "analogy | novel | mechanistic",
      "triz_principle": "TRIZ principle name or null",
      "statement": "one falsifiable Korean hypothesis",
      "rationale": "why this hypothesis fits the evidence and mechanism",
      "proposed_experiment": "one decisive experimental test in Korean",
      "analogy_source": "analogous case that inspired it or null"
    }
  ]
}

Rules:
- Write all visible text in Korean, keeping technical terms in English where natural.
- Produce exactly the requested number of candidates.
- Each candidate must be mechanistic and experimentally testable.
- Include at least one bold-but-testable novel candidate when 3 or more candidates are requested.
- Include at least one analogy-driven candidate when a useful cross-domain analogy exists.
- If family is "novel", prefer naming a concrete TRIZ-style inventive principle.
- Avoid vague strategy statements or generic optimization advice.
- Prefer hypotheses that can be challenged by at least one discriminating measurement.
- Do not invent exact numeric thresholds unless clearly supported by evidence.
"""

HYPOTHESIS_VALIDATION_TEMPLATE = """You are {agent_name}.

Specialty: {expertise}
Perspective: {perspective}
Evidence focus:
{evidence_focus}

You are reviewing one proposed research hypothesis.
Return JSON:
{{
  "verdict": "support | mixed | challenge",
  "reasoning": "compact Korean assessment grounded in your specialty",
  "confidence": "low | medium | high",
  "key_test": "one decisive Korean measurement or experiment"
}}

Rules:
- Write in Korean while keeping technical terms in English where natural.
- Stay inside your specialty.
- Explicitly mention the strongest support or weakness.
- Prefer one discriminating test over generic next steps.
- Do not invent exact setpoints unless supported by evidence.
"""

HYPOTHESIS_RANKING_PROMPT = """You are a research hypothesis arbiter.

Return JSON:
{
  "selected_hypothesis_id": "hyp-1",
  "ranked_candidates": [
    {
      "id": "hyp-1",
      "rank": 1,
      "plausibility_score": 0.0,
      "feasibility_score": 0.0,
      "evidence_score": 0.0,
      "novelty_score": 0.0,
      "recommendation": "short Korean recommendation",
      "summary": "short Korean why-this-ranked-here summary",
      "risk_note": "short Korean caveat"
    }
  ]
}

Rules:
- Write all visible text in Korean, keeping technical terms in English where natural.
- Scores must be 0-1 numeric values.
- Rank by evidence-backed plausibility first, then experimental discriminability, then feasibility.
- Make disagreements and caveats explicit.
- selected_hypothesis_id must match the top-ranked candidate.
"""

CONSTRAINT_EXTRACTION_PROMPT = """You are a research constraint extractor for AI-driven domain research.

Return JSON:
{
  "candidates": [
    {
      "id": "constraint-1",
      "text": "short Korean constraint statement",
      "constraint_type": "hard | soft | assumption | anti-pattern",
      "scope": "global | project | module | session",
      "why": "short Korean rationale",
      "source": "question | seed | evidence",
      "numeric_bounds": [
        {
          "parameter": "process parameter name",
          "unit": "unit or null",
          "min_value": 0.0,
          "max_value": 1.0,
          "recommended_min": 0.2,
          "recommended_max": 0.8,
          "nominal_value": null,
          "basis": "why this numeric candidate is plausible",
          "source": "seed | evidence | literature-prior",
          "confidence": 0.5,
          "needs_user_confirmation": true
        }
      ]
    }
  ],
  "missing_inputs": ["optional Korean missing input"],
  "follow_up_questions": ["optional Korean follow-up question"]
}

Rules:
- Write all visible text in Korean, keeping technical terms in English where natural.
- Extract only constraints that are materially relevant to experiment feasibility, interpretation, safety, or decision quality.
- Prefer concrete, reviewable constraints over broad advice.
- When the constraint has process parameters, include numeric_bounds with units, candidate min/max, recommended range, basis, confidence, and needs_user_confirmation=true.
- If exact equipment limits are unavailable, mark the basis as literature/domain prior and keep confidence below 0.7.
- Do not auto-approve anything.
- Keep candidates concise and non-duplicative.
- If evidence is weak, use constraint_type='assumption' or 'soft' rather than overstating certainty.
"""


class DiscussionLLM:
    def __init__(self, *, provider: str, api_key: str, model: str) -> None:
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self._client: Any | None = None

    @classmethod
    def from_settings(cls, settings: Any) -> "DiscussionLLM | None":
        provider = (getattr(settings, "llm_provider", None) or "anthropic").lower().strip()
        anthropic_key = (getattr(settings, "anthropic_api_key", None) or "").strip()
        openai_key = (getattr(settings, "openai_api_key", None) or "").strip()

        if provider == "anthropic" and anthropic_key:
            model = getattr(settings, "anthropic_model", "claude-opus-4-7")
            return cls(provider="anthropic", api_key=anthropic_key, model=model)
        if provider == "openai" and openai_key:
            model = getattr(settings, "openai_model", "gpt-5")
            return cls(provider="openai", api_key=openai_key, model=model)
        if anthropic_key:
            model = getattr(settings, "anthropic_model", "claude-opus-4-7")
            return cls(provider="anthropic", api_key=anthropic_key, model=model)
        if openai_key:
            model = getattr(settings, "openai_model", "gpt-5")
            return cls(provider="openai", api_key=openai_key, model=model)
        return None

    def clarify_question(self, question: str) -> dict[str, Any] | None:
        response = self._call(system_prompt=CLARIFY_PROMPT, user_content=f"User question: {question}", json_mode=True)
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        refined_question = str(payload.get("refined_question") or question).strip() or question
        follow_up = payload.get("follow_up")
        if isinstance(follow_up, str):
            follow_up = follow_up.strip() or None
        else:
            follow_up = None
        return {
            "refined_question": refined_question,
            "needs_clarification": bool(payload.get("needs_clarification", False)),
            "follow_up": follow_up,
            "reasoning": str(payload.get("reasoning") or "").strip(),
        }

    def select_agents(
        self,
        *,
        question: str,
        agents: list[dict[str, Any]],
        num_agents: int,
    ) -> list[str] | None:
        if not agents:
            return []
        agent_descriptions = "\n\n".join(self._format_agent_selection_card(agent) for agent in agents)
        response = self._call(
            system_prompt=AGENT_SELECTION_PROMPT,
            user_content=(
                f"Research question: {question}\n\n"
                f"Available experts:\n{agent_descriptions}\n\n"
                f"Select the {num_agents} most relevant experts."
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        raw_ids = payload.get("selected_agent_ids", [])
        valid_ids = {agent["agent_id"] for agent in agents}
        selected = [agent_id for agent_id in raw_ids if isinstance(agent_id, str) and agent_id in valid_ids]
        return selected[:num_agents] or None

    def extract_constraint_candidates(
        self,
        *,
        question: str,
        project: dict[str, Any],
        seed_constraints: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        seed_summary = "\n".join(
            f"- {item.get('text', '')} | type={item.get('constraint_type', 'assumption')} | why={item.get('why', '')}"
            for item in seed_constraints[:8]
            if item.get("text")
        ) or "- No seed constraints provided"
        response = self._call(
            system_prompt=CONSTRAINT_EXTRACTION_PROMPT,
            user_content=(
                f"Project: {project.get('name', 'Unknown project')}\n"
                f"Objective: {project.get('objective', '')}\n"
                f"Question: {question}\n\n"
                f"Seed constraints:\n{seed_summary}\n\n"
                f"Evidence pack:\n{self._format_chunks_for_prompt(evidence[:6])}"
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        raw_candidates = payload.get("candidates")
        if not isinstance(raw_candidates, list):
            return None
        candidates: list[dict[str, Any]] = []
        for index, item in enumerate(raw_candidates, start=1):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            why = str(item.get("why") or "").strip()
            if not text:
                continue
            constraint_type = str(item.get("constraint_type") or "assumption").strip().lower()
            if constraint_type not in {"hard", "soft", "assumption", "anti-pattern"}:
                constraint_type = "assumption"
            scope = str(item.get("scope") or "session").strip().lower()
            if scope not in {"global", "project", "module", "session"}:
                scope = "session"
            raw_bounds = item.get("numeric_bounds", [])
            candidates.append(
                {
                    "constraint_id": str(item.get("id") or f"constraint-{index}").strip() or f"constraint-{index}",
                    "text": text,
                    "constraint_type": constraint_type,
                    "scope": scope,
                    "why": why,
                    "source": str(item.get("source") or "llm-extraction").strip() or "llm-extraction",
                    "numeric_bounds": raw_bounds if isinstance(raw_bounds, list) else [],
                }
            )
        return {
            "candidates": candidates,
            "missing_inputs": self._normalize_text_list(payload.get("missing_inputs")),
            "follow_up_questions": self._normalize_text_list(payload.get("follow_up_questions")),
        }

    def generate_hypothesis_candidates(
        self,
        *,
        question: str,
        project: dict[str, Any],
        evidence: list[dict[str, Any]],
        panel_agents: list[dict[str, Any]],
        num_candidates: int,
    ) -> list[dict[str, Any]] | None:
        panel_summary = "\n".join(
            f"- {agent['name']}: {agent.get('expertise') or agent.get('focus') or agent.get('perspective') or ''}"
            for agent in panel_agents
        ) or "- No panel experts provided"
        response = self._call(
            system_prompt=HYPOTHESIS_GENERATION_PROMPT,
            user_content=(
                f"Project: {project.get('name', 'Unknown project')}\n"
                f"Objective: {project.get('objective', '')}\n"
                f"Question: {question}\n"
                f"Requested candidates: {num_candidates}\n\n"
                f"Expert panel:\n{panel_summary}\n\n"
                f"Evidence pack:\n{self._format_chunks_for_prompt(evidence[:6])}"
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        candidates_raw = payload.get("candidates")
        if not isinstance(candidates_raw, list):
            return None
        seed_evidence_ids = [item.get("chunk_id") for item in evidence[:3] if item.get("chunk_id")]
        candidates: list[dict[str, Any]] = []
        for index, item in enumerate(candidates_raw[:num_candidates], start=1):
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            statement = str(item.get("statement") or "").strip()
            rationale = str(item.get("rationale") or "").strip()
            proposed_experiment = str(item.get("proposed_experiment") or "").strip()
            family = str(item.get("family") or "mechanistic").strip().lower()
            if family not in {"analogy", "novel", "mechanistic"}:
                family = "mechanistic"
            triz_principle_raw = item.get("triz_principle")
            analogy_source_raw = item.get("analogy_source")
            if not title or not statement:
                continue
            candidates.append(
                {
                    "hypothesis_id": str(item.get("id") or f"hyp-{index}").strip() or f"hyp-{index}",
                    "title": title,
                    "family": family,
                    "triz_principle": str(triz_principle_raw).strip() if triz_principle_raw else None,
                    "statement": statement,
                    "rationale": rationale,
                    "proposed_experiment": proposed_experiment,
                    "analogy_source": str(analogy_source_raw).strip() if analogy_source_raw else None,
                    "source_evidence_ids": seed_evidence_ids,
                }
            )
        return candidates or None

    def validate_hypothesis_candidate(
        self,
        *,
        question: str,
        hypothesis: dict[str, Any],
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        evidence_focus = "\n".join(f"- {term}" for term in agent.get("evidence_focus", [])) or "- Use source-backed mechanistic evidence"
        response = self._call(
            system_prompt=HYPOTHESIS_VALIDATION_TEMPLATE.format(
                agent_name=agent["name"],
                expertise=agent.get("expertise") or agent.get("focus") or agent["name"],
                perspective=agent.get("perspective") or agent.get("focus") or agent.get("stance") or agent["name"],
                evidence_focus=evidence_focus,
            ),
            user_content=(
                f"Original question: {question}\n\n"
                f"Hypothesis title: {hypothesis.get('title', '')}\n"
                f"Hypothesis statement: {hypothesis.get('statement', '')}\n"
                f"Rationale: {hypothesis.get('rationale', '')}\n"
                f"Proposed experiment: {hypothesis.get('proposed_experiment', '')}\n\n"
                f"Evidence pack:\n{self._format_chunks_for_prompt(chunks[:4])}"
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        verdict = str(payload.get("verdict") or "mixed").strip().lower()
        if verdict not in {"support", "mixed", "challenge"}:
            verdict = "mixed"
        confidence = str(payload.get("confidence") or "medium").strip().lower()
        if confidence not in {"low", "medium", "high"}:
            confidence = "medium"
        reasoning = str(payload.get("reasoning") or "").strip()
        key_test = str(payload.get("key_test") or "").strip()
        if not reasoning:
            return None
        return {
            "hypothesis_id": hypothesis.get("hypothesis_id"),
            "agent_id": agent["agent_id"],
            "agent_name": agent["name"],
            "verdict": verdict,
            "reasoning": reasoning,
            "confidence": confidence,
            "evidence_ids": [chunk.get("chunk_id") for chunk in chunks if chunk.get("chunk_id")],
            "key_test": key_test,
        }

    def rank_hypothesis_candidates(
        self,
        *,
        question: str,
        project: dict[str, Any],
        candidates: list[dict[str, Any]],
        validations: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        candidate_map = {item["hypothesis_id"]: item for item in candidates if item.get("hypothesis_id")}
        validation_text_parts: list[str] = []
        for candidate in candidates:
            candidate_id = candidate.get("hypothesis_id")
            related = [item for item in validations if item.get("hypothesis_id") == candidate_id]
            reviews = "\n".join(
                f"- {item.get('agent_name')}: verdict={item.get('verdict')} confidence={item.get('confidence')} | {item.get('reasoning')} | key_test={item.get('key_test')}"
                for item in related
            ) or "- No reviews"
            validation_text_parts.append(
                f"[{candidate_id}] {candidate.get('title')}\n"
                f"Statement: {candidate.get('statement')}\n"
                f"Rationale: {candidate.get('rationale')}\n"
                f"Reviews:\n{reviews}"
            )
        response = self._call(
            system_prompt=HYPOTHESIS_RANKING_PROMPT,
            user_content=(
                f"Project: {project.get('name', 'Unknown project')}\n"
                f"Objective: {project.get('objective', '')}\n"
                f"Question: {question}\n\n"
                f"Candidates and reviews:\n\n{'\n\n'.join(validation_text_parts)}"
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        ranked_raw = payload.get("ranked_candidates")
        if not isinstance(ranked_raw, list):
            return None
        ranked_candidates: list[dict[str, Any]] = []
        for index, item in enumerate(ranked_raw, start=1):
            if not isinstance(item, dict):
                continue
            candidate_id = str(item.get("id") or "").strip()
            if candidate_id not in candidate_map:
                continue
            ranked_candidates.append(
                {
                    "hypothesis_id": candidate_id,
                    "rank": int(item.get("rank") or index),
                    "plausibility_score": float(item.get("plausibility_score") or 0.0),
                    "feasibility_score": float(item.get("feasibility_score") or 0.0),
                    "evidence_score": float(item.get("evidence_score") or 0.0),
                    "novelty_score": float(item.get("novelty_score") or 0.0),
                    "recommendation": str(item.get("recommendation") or "").strip(),
                    "summary": str(item.get("summary") or "").strip(),
                    "risk_note": str(item.get("risk_note") or "").strip(),
                }
            )
        if not ranked_candidates:
            return None
        selected_hypothesis_id = str(payload.get("selected_hypothesis_id") or ranked_candidates[0]["hypothesis_id"]).strip()
        if selected_hypothesis_id not in candidate_map:
            selected_hypothesis_id = ranked_candidates[0]["hypothesis_id"]
        return {
            "selected_hypothesis_id": selected_hypothesis_id,
            "ranked_candidates": ranked_candidates,
        }

    def build_moderator_packet(
        self,
        *,
        question: str,
        round_context: list[dict[str, Any]],
        panel_agents: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        panel_names = ", ".join(agent["name"] for agent in panel_agents)
        combined = "\n\n".join(
            f"{turn['speaker']} ({turn.get('stance') or turn.get('agent_id') or 'panelist'}):\n{turn['message']}"
            for turn in round_context
        )
        response = self._call(
            system_prompt=MODERATOR_PROMPT,
            user_content=(
                f"Original question: {question}\n\n"
                f"Panel: {panel_names}\n\n"
                f"Expert responses:\n{combined}"
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None

        follow_ups_raw = payload.get("follow_ups") or {}
        follow_up_by_agent: dict[str, str] = {}
        for agent in panel_agents:
            for key, value in follow_ups_raw.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    continue
                if key.strip() == agent["name"]:
                    follow_up_by_agent[agent["agent_id"]] = value.strip()
                    break

        return {
            "content": str(payload.get("summary") or "").strip(),
            "summary": str(payload.get("summary") or "").strip(),
            "consensus": self._normalize_text_list(payload.get("consensus")),
            "disagreements": self._normalize_text_list(payload.get("disagreements")),
            "gaps": self._normalize_text_list(payload.get("gaps")),
            "already_stated": self._normalize_text_list(payload.get("already_stated")),
            "follow_up_by_agent": follow_up_by_agent,
        }

    def compose_round_message(
        self,
        *,
        question: str,
        agent: dict[str, Any],
        chunks: list[dict[str, Any]],
        relationship: dict[str, Any] | None,
        round_context: list[dict[str, Any]],
        round_num: int,
        follow_up_focus: str,
        equipment_note: str,
        panel_agents: list[dict[str, Any]],
        moderator_packet: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        other_agents_summary = "\n".join(
            f"- {item['name']}: {item.get('unique_domain') or item.get('expertise') or item.get('focus')}"
            for item in panel_agents
            if item["agent_id"] != agent["agent_id"]
        ) or "- No other experts provided."
        tools_text = "\n".join(f"- {tool}" for tool in agent.get("tools_and_methods", [])) or "- General analysis methods"
        key_terms = "\n".join(f"- {term}" for term in agent.get("key_terminology", [])) or "- Use precise domain terminology"
        evidence_focus = "\n".join(f"- {term}" for term in agent.get("evidence_focus", [])) or "- Prioritize source-backed mechanisms and conditions"
        forbidden_topics = "\n".join(f"- {topic}" for topic in agent.get("forbidden_topics", [])) or "- None explicitly assigned"
        relationship_context = relationship.get("statement", "") if relationship else agent.get("next_action_hint", "")

        system_prompt = AGENT_SYSTEM_TEMPLATE.format(
            agent_name=agent["name"],
            expertise=agent.get("expertise") or agent.get("focus") or agent["name"],
            research_duty=agent.get("research_duty") or agent.get("duty") or agent.get("stance") or "source-grounded specialist analysis",
            perspective=agent.get("perspective") or agent.get("focus") or agent["stance"],
            tools_and_methods=tools_text,
            unique_domain=agent.get("unique_domain") or agent.get("expertise") or agent.get("focus") or agent["name"],
            selection_summary=agent.get("perspective") or agent.get("focus") or agent["stance"],
            other_agents_summary=other_agents_summary,
            key_terminology=key_terms,
            evidence_focus=evidence_focus,
            forbidden_topics=forbidden_topics,
            relationship_context=relationship_context or "No dominant relationship provided.",
            equipment_note=equipment_note or "No explicit equipment constraint provided.",
            retrieved_chunks=self._format_chunks_for_prompt(chunks),
        )

        user_content = question
        if round_num > 1 and moderator_packet:
            other_responses = "\n\n".join(
                self._format_compact_turn_for_prompt(turn)
                for turn in round_context
                if turn.get("agent_id") != agent["agent_id"]
            ) or "(No peer responses available)"
            system_prompt += ROUND2_ADDITION_TEMPLATE.format(
                summary=moderator_packet.get("summary") or "No moderator summary.",
                consensus=self._render_bullet_block(moderator_packet.get("consensus", [])),
                disagreements=self._render_bullet_block(moderator_packet.get("disagreements", [])),
                gaps=self._render_bullet_block(moderator_packet.get("gaps", [])),
                agent_followup_question=follow_up_focus or "Provide the most important unresolved discriminator from your specialty.",
                already_stated=self._render_bullet_block(moderator_packet.get("already_stated", [])),
                other_responses=other_responses,
            )
            user_content = follow_up_focus or question

        response = self._call(system_prompt=system_prompt, user_content=user_content, json_mode=True)
        if not response:
            return None
        payload = self._parse_json_object(response)
        if payload is None:
            message = response.strip()
            return {"message": message, "structured_output": {}}
        return self._normalize_structured_turn(payload, chunks)

    def synthesize_discussion(
        self,
        *,
        question: str,
        project: dict[str, Any],
        turns: list[dict[str, Any]],
        evidence: list[dict[str, Any]],
        relationships: list[dict[str, Any]],
        recommended_actions: list[str],
        constraint_note: str = "",
        selected_hypothesis: dict[str, Any] | None = None,
        hypothesis_rankings: list[dict[str, Any]] | None = None,
        validations: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        discussion_text = "\n\n".join(self._format_compact_turn_for_prompt(turn) for turn in turns)
        evidence_text = "\n".join(
            f"- {item.get('title', 'Untitled')} | {item.get('source', 'unknown')} | {item.get('summary', '')}"
            for item in evidence[:8]
        ) or "- No evidence provided"
        relationship_text = "\n".join(
            f"- {item.get('statement', '')}"
            for item in relationships[:6]
            if item.get("statement")
        ) or "- No relationship provided"
        action_text = "\n".join(f"- {item}" for item in recommended_actions[:4]) or "- No predefined recommended actions"
        selected_hypothesis_text = "- No selected hypothesis"
        if selected_hypothesis:
            selected_hypothesis_text = (
                f"- {selected_hypothesis.get('title', '')}\n"
                f"  Statement: {selected_hypothesis.get('statement', '')}\n"
                f"  Rationale: {selected_hypothesis.get('rationale', '')}\n"
                f"  Proposed experiment: {selected_hypothesis.get('proposed_experiment', '')}"
            )
        ranking_text = "\n".join(
            f"- {item.get('hypothesis_id')}: rank={item.get('rank')} plausibility={item.get('plausibility_score')} feasibility={item.get('feasibility_score')} evidence={item.get('evidence_score')} novelty={item.get('novelty_score')} | {item.get('summary', '')} | risk={item.get('risk_note', '')}"
            for item in (hypothesis_rankings or [])[:4]
        ) or "- No ranking provided"
        validation_text = "\n".join(
            f"- {item.get('agent_name')}: {item.get('verdict')} ({item.get('confidence')}) | {item.get('reasoning')} | key_test={item.get('key_test', '')}"
            for item in (validations or [])[:8]
        ) or "- No validations provided"

        response = self._call(
            system_prompt=FINAL_SYNTHESIS_PROMPT,
            user_content=(
                f"Project: {project.get('name', 'Unknown project')}\n"
                f"Objective: {project.get('objective', '')}\n"
                f"Original question: {question}\n\n"
                f"Selected hypothesis:\n{selected_hypothesis_text}\n\n"
                f"Hypothesis ranking:\n{ranking_text}\n\n"
                f"Validator assessments:\n{validation_text}\n\n"
                f"Recommended actions seed:\n{action_text}\n\n"
                f"Constraint note:\n{constraint_note or '- No explicit constraint provided'}\n\n"
                f"Key relationships:\n{relationship_text}\n\n"
                f"Evidence:\n{evidence_text}\n\n"
                f"Discussion:\n{discussion_text}"
            ),
            json_mode=True,
        )
        if not response:
            return None
        try:
            payload = json.loads(response)
        except json.JSONDecodeError:
            return None
        summary = str(payload.get("summary") or "").strip()
        next_actions = self._normalize_text_list(payload.get("next_actions"))
        open_questions = self._normalize_text_list(payload.get("open_questions"))
        if not summary or not next_actions or not open_questions:
            return None
        return {
            "summary": summary,
            "next_actions": next_actions[:4],
            "open_questions": open_questions[:4],
        }

    def _call(self, *, system_prompt: str, user_content: str, json_mode: bool = False) -> str | None:
        try:
            client = self._get_client()
            if self.provider == "anthropic":
                prompt = system_prompt
                if json_mode:
                    prompt += "\n\nReturn valid JSON only."
                response = client.messages.create(
                    model=self.model,
                    max_tokens=1800,
                    system=prompt,
                    messages=[{"role": "user", "content": user_content}],
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
                return "".join(block.text for block in response.content if getattr(block, "type", "") == "text").strip()

            kwargs: dict[str, Any] = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            response = client.chat.completions.create(timeout=REQUEST_TIMEOUT_SECONDS, **kwargs)
            return (response.choices[0].message.content or "").strip()
        except Exception:
            return None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if self.provider == "anthropic":
            from anthropic import Anthropic

            self._client = Anthropic(api_key=self.api_key)
            return self._client
        from openai import OpenAI

        self._client = OpenAI(api_key=self.api_key)
        return self._client

    @staticmethod
    def _parse_json_object(value: str) -> dict[str, Any] | None:
        try:
            payload = json.loads(value)
        except json.JSONDecodeError:
            start = value.find("{")
            end = value.rfind("}")
            if start < 0 or end <= start:
                return None
            try:
                payload = json.loads(value[start : end + 1])
            except json.JSONDecodeError:
                return None
        return payload if isinstance(payload, dict) else None

    def _normalize_structured_turn(self, payload: dict[str, Any], chunks: list[dict[str, Any]]) -> dict[str, Any]:
        message = str(payload.get("message") or payload.get("content") or payload.get("claim") or "").strip()
        structured = {
            "claim": str(payload.get("claim") or "").strip(),
            "reasoning": str(payload.get("reasoning") or "").strip(),
            "evidence_ids": self._normalize_evidence_ids(payload.get("evidence_ids") or payload.get("evidenceIds"), chunks),
            "constraint_risks": self._normalize_text_list(payload.get("constraint_risks") or payload.get("constraintRisks")),
            "uncertainties": self._normalize_text_list(payload.get("uncertainties")),
            "experiment_proposal": str(payload.get("experiment_proposal") or payload.get("experimentProposal") or "").strip(),
            "confidence": str(payload.get("confidence") or "").strip(),
            "bo_bridge_note": str(payload.get("bo_bridge_note") or payload.get("boBridgeNote") or "").strip(),
        }
        structured = {key: value for key, value in structured.items() if value}
        if not message:
            message_parts = [structured.get("claim", ""), structured.get("experiment_proposal", "")]
            message = " ".join(part for part in message_parts if isinstance(part, str) and part).strip()
        return {"message": message, "structured_output": structured}

    @staticmethod
    def _normalize_evidence_ids(value: Any, chunks: list[dict[str, Any]]) -> list[str]:
        if not isinstance(value, list):
            return []
        allowed_ids = {str(chunk.get("chunk_id") or "") for chunk in chunks}
        label_to_id = {f"S{index}": str(chunk.get("chunk_id") or "") for index, chunk in enumerate(chunks, start=1)}
        normalized: list[str] = []
        for item in value:
            candidate = str(item or "").strip().strip("[]")
            evidence_id = candidate if candidate in allowed_ids else label_to_id.get(candidate.upper(), "")
            if evidence_id and evidence_id not in normalized:
                normalized.append(evidence_id)
        return normalized[:3]

    @staticmethod
    def _format_compact_turn_for_prompt(turn: dict[str, Any]) -> str:
        structured = turn.get("structured_output") if isinstance(turn.get("structured_output"), dict) else {}
        claim = turn.get("claim") or structured.get("claim") or turn.get("message", "")[:220]
        reasoning = turn.get("reasoning") or structured.get("reasoning") or ""
        evidence_ids = turn.get("evidence_ids") or structured.get("evidence_ids") or []
        constraint_risks = turn.get("constraint_risks") or structured.get("constraint_risks") or []
        uncertainties = turn.get("uncertainties") or structured.get("uncertainties") or []
        experiment = turn.get("experiment_proposal") or structured.get("experiment_proposal") or ""
        return (
            f"{turn.get('speaker', 'Panelist')} (Round {turn.get('round_num', 1)}, {turn.get('stance') or turn.get('role') or 'specialist'}):\n"
            f"Claim: {claim}\n"
            f"Reasoning: {reasoning or '-'}\n"
            f"Evidence IDs: {', '.join(evidence_ids[:3]) if evidence_ids else '-'}\n"
            f"Constraint risks: {'; '.join(constraint_risks[:2]) if constraint_risks else '-'}\n"
            f"Uncertainties: {'; '.join(uncertainties[:2]) if uncertainties else '-'}\n"
            f"Experiment: {experiment or '-'}"
        )

    @staticmethod
    def _normalize_text_list(value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        normalized: list[str] = []
        for item in value:
            if not isinstance(item, str):
                continue
            text = item.strip()
            if text and text not in normalized:
                normalized.append(text)
        return normalized

    @staticmethod
    def _render_bullet_block(items: list[str]) -> str:
        if not items:
            return "- None"
        return "\n".join(f"- {item}" for item in items)

    @staticmethod
    def _format_chunks_for_prompt(chunks: list[dict[str, Any]]) -> str:
        if not chunks:
            return "(No source material available)"
        parts: list[str] = []
        for index, chunk in enumerate(chunks, start=1):
            parts.append(
                f"[S{index}] {chunk.get('title', 'Untitled')} | chunk_id={chunk.get('chunk_id', '')} | {chunk.get('source', 'unknown')} | {chunk.get('year', '')}\n"
                f"Summary: {chunk.get('summary', '')}\n"
                f"Excerpt: {chunk.get('excerpt', '')}\n"
                f"Keywords: {', '.join(chunk.get('keywords', []))}"
            )
        return "\n\n".join(parts)

    @staticmethod
    def _format_agent_selection_card(agent: dict[str, Any]) -> str:
        return (
            f"agent_id: {agent['agent_id']}\n"
            f"name: {agent['name']}\n"
            f"expertise: {agent.get('expertise') or agent.get('focus') or '-'}\n"
            f"perspective: {agent.get('perspective') or agent.get('stance') or '-'}\n"
            f"unique_domain: {agent.get('unique_domain') or '-'}\n"
            f"tools: {', '.join(agent.get('tools_and_methods', [])[:4]) or '-'}\n"
            f"key_terminology: {', '.join(agent.get('key_terminology', [])[:6]) or '-'}\n"
            f"evidence_focus: {', '.join(agent.get('evidence_focus', [])[:6]) or '-'}\n"
            f"retrieval_terms: {', '.join(agent.get('retrieval_terms', [])[:8]) or '-'}\n"
            f"knowledge_scope_count: {len(agent.get('knowledge_scope', []))}"
        )
