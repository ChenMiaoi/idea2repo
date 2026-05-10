import unittest

from idea2repo.scoring import CapTrigger, diagnose_idea
from idea2repo.venues import load_venue_database, route_idea


class VenueRoutingTests(unittest.TestCase):
    def test_loads_updatable_venue_database(self) -> None:
        database = load_venue_database()
        self.assertIn("ai_llm_agent", database.domains)
        self.assertIn("USENIX Security", database.domains["security"].primary_venues)
        self.assertIn("OSDI", database.domains["systems"].primary_venues)

    def test_routes_agent_memory_idea_to_ai(self) -> None:
        routes = route_idea("LLM agent long-term memory benchmark with ablation")
        self.assertEqual(routes[0].domain.key, "ai_llm_agent")
        self.assertIn("agent", routes[0].matched_keywords)

    def test_requested_domain_biases_route(self) -> None:
        routes = route_idea("runtime support for agent serving", requested_domains=["systems"])
        self.assertEqual(routes[0].domain.key, "systems")

    def test_requested_domain_accepts_aliases_and_venue_names(self) -> None:
        self.assertEqual(route_idea("agent evaluation", requested_domains=["安全"])[0].domain.key, "security")
        self.assertEqual(route_idea("agent evaluation", requested_domains=["OSDI"])[0].domain.key, "systems")
        self.assertEqual(
            route_idea("database query optimization", requested_domains=["ai_llm_agent"])[0].domain.key,
            "ai_llm_agent",
        )
        self.assertEqual(
            route_idea("database query optimization", requested_domains=["ai llm agent"])[0].domain.key,
            "ai_llm_agent",
        )
        self.assertEqual(
            route_idea("database query optimization", requested_domains=["AI/LLM Agent"])[0].domain.key,
            "ai_llm_agent",
        )

    def test_requested_domain_overrides_conflicting_keyword_volume(self) -> None:
        overloaded_ai_idea = (
            "agent llm language model memory rag retrieval planning tool use "
            "multi-agent benchmark reasoning alignment multimodal"
        )
        self.assertEqual(
            route_idea(overloaded_ai_idea, requested_domains=["systems"])[0].domain.key,
            "systems",
        )


class ScoringTests(unittest.TestCase):
    def test_diagnosis_has_raw_and_revised_scores(self) -> None:
        diagnosis = diagnose_idea(
            "A new LLM agent memory compression method with benchmark, baseline, "
            "dataset, metric, ablation, and recent 2025 related work gap."
        )
        self.assertGreaterEqual(diagnosis.revised_score.total, diagnosis.raw_score.total)
        self.assertEqual(diagnosis.routes[0].domain.key, "ai_llm_agent")
        self.assertIn("Ablation", diagnosis.required_evidence[-1])
        self.assertEqual(set(diagnosis.raw_score.dimensions), set(diagnosis.revised_score.dimensions))
        self.assertEqual(set(diagnosis.raw_score.dimensions), {
            "problem_importance",
            "novelty",
            "technical_depth",
            "venue_fit",
            "experimental_verifiability",
            "baseline_dataset_metric",
            "feasibility",
            "engineering_open_source_value",
            "paper_story",
        })

    def test_score_caps_penalize_vague_ideas(self) -> None:
        diagnosis = diagnose_idea("Build a dashboard for research projects")
        self.assertLessEqual(diagnosis.raw_score.total, 55)
        self.assertIn(CapTrigger.ENGINEERING_ONLY, diagnosis.raw_score.cap_triggers)

    def test_security_requires_threat_model(self) -> None:
        diagnosis = diagnose_idea("LLM jailbreak defense benchmark", requested_domains=["security"])
        self.assertEqual(diagnosis.routes[0].domain.key, "security")
        self.assertIn(CapTrigger.MISSING_THREAT_MODEL, diagnosis.raw_score.cap_triggers)

    def test_revised_score_is_scored_from_explicit_revised_plan_evidence(self) -> None:
        diagnosis = diagnose_idea("agent memory compression", requested_domains=["ai"])
        self.assertIn(CapTrigger.MISSING_VERIFIABLE_EXPERIMENT_PLAN, diagnosis.raw_score.cap_triggers)
        self.assertIn(CapTrigger.MISSING_STRONG_BASELINE, diagnosis.raw_score.cap_triggers)
        self.assertNotIn(CapTrigger.MISSING_VERIFIABLE_EXPERIMENT_PLAN, diagnosis.revised_score.cap_triggers)
        self.assertNotIn(CapTrigger.MISSING_STRONG_BASELINE, diagnosis.revised_score.cap_triggers)
        self.assertIn("benchmark", diagnosis.revised_plan_text)
        self.assertIn("baseline", diagnosis.revised_plan_text)

    def test_revised_system_plan_contains_metric_evidence_before_cap_is_removed(self) -> None:
        diagnosis = diagnose_idea("agent runtime scheduler", requested_domains=["OSDI"])
        self.assertIn(CapTrigger.MISSING_SYSTEM_METRICS, diagnosis.raw_score.cap_triggers)
        self.assertNotIn(CapTrigger.MISSING_SYSTEM_METRICS, diagnosis.revised_score.cap_triggers)
        self.assertIn("latency", diagnosis.revised_plan_text)
        self.assertIn("throughput", diagnosis.revised_plan_text)


if __name__ == "__main__":
    unittest.main()
