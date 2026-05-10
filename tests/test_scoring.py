import unittest
import json
import tempfile
from pathlib import Path

from idea2repo.scoring import CapTrigger, diagnose_idea
from idea2repo.venues import load_venue_database, route_idea, validate_venue_database


class VenueRoutingTests(unittest.TestCase):
    def test_loads_updatable_venue_database(self) -> None:
        database = load_venue_database()
        self.assertIn("ai_llm_agent", database.domains)
        self.assertIn("USENIX Security", database.domains["security"].primary_venues)
        self.assertIn("OSDI", database.domains["systems"].primary_venues)
        self.assertEqual(validate_venue_database(database), ())
        osdi = database.domains["systems"].venue_records["OSDI"]
        self.assertEqual(osdi.ccf_category, "A")
        self.assertIn("Full paper", osdi.eligible_tracks)
        self.assertIn("Workshop", osdi.ineligible_tracks)
        self.assertTrue(osdi.source_url.startswith("https://"))
        self.assertTrue(osdi.dblp_url.startswith("https://dblp.org/"))

    def test_venue_database_validation_reports_missing_provenance(self) -> None:
        data = {
            "version": "test",
            "source_note": "test",
            "domains": {
                "ai_llm_agent": {
                    "label": "AI / LLM Agent",
                    "aliases": ["ai"],
                    "primary_venues": ["MissingConf"],
                    "secondary_venues": [],
                    "review_focus": ["focus"],
                    "keywords": ["agent"],
                    "venue_records": [],
                }
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "venues.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            database = load_venue_database(path)

        self.assertIn(
            "ai_llm_agent: missing venue record for MissingConf",
            validate_venue_database(database),
        )

    def test_venue_loader_rejects_missing_required_record_fields(self) -> None:
        data = {
            "version": "test",
            "source_note": "test",
            "domains": {
                "ai_llm_agent": {
                    "label": "AI / LLM Agent",
                    "aliases": ["ai"],
                    "primary_venues": ["TestConf"],
                    "secondary_venues": [],
                    "review_focus": ["focus"],
                    "keywords": ["agent"],
                    "venue_records": [{"name": "TestConf"}],
                }
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "venues.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "missing required fields"):
                load_venue_database(path)

    def test_venue_validation_rejects_invalid_category_and_track_conflicts(self) -> None:
        data = {
            "version": "test",
            "source_note": "test",
            "domains": {
                "ai_llm_agent": {
                    "label": "AI / LLM Agent",
                    "aliases": ["ai"],
                    "primary_venues": ["TestConf"],
                    "secondary_venues": [],
                    "review_focus": ["focus"],
                    "keywords": ["agent"],
                    "venue_records": [
                        {
                            "name": "TestConf",
                            "full_name": "Test Conference",
                            "ccf_category": "seed_secondary",
                            "domain": "ai_llm_agent",
                            "venue_type": "conference",
                            "eligible_tracks": ["Full paper", "Workshop"],
                            "ineligible_tracks": ["Workshop", "Demo", "Short paper"],
                            "source_url": "https://example.test/source",
                            "dblp_url": "https://dblp.org/db/conf/test/",
                            "last_checked": "2026-05-10",
                            "provenance_note": "test",
                        }
                    ],
                }
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "venues.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            errors = validate_venue_database(load_venue_database(path))

        self.assertIn("ai_llm_agent: TestConf has invalid CCF category seed_secondary", errors)
        self.assertIn("ai_llm_agent: TestConf has contradictory eligible and ineligible tracks", errors)
        self.assertIn("ai_llm_agent: TestConf cannot mark workshop/demo/short paper as eligible", errors)

    def test_routes_agent_memory_idea_to_ai(self) -> None:
        routes = route_idea("LLM agent long-term memory benchmark with ablation")
        self.assertEqual(routes[0].domain.key, "ai_llm_agent")
        self.assertIn("agent", routes[0].matched_keywords)

    def test_requested_domain_biases_route(self) -> None:
        routes = route_idea("runtime support for agent serving", requested_domains=["systems"])
        self.assertEqual(routes[0].domain.key, "systems")

    def test_routes_riscv_testing_framework_to_systems(self) -> None:
        routes = route_idea("做一个riscv自动化测试框架怎么样")
        self.assertEqual(routes[0].domain.key, "systems")
        self.assertIn("riscv", routes[0].matched_keywords)

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

    def test_workshop_demo_and_short_paper_targets_are_capped(self) -> None:
        diagnosis = diagnose_idea(
            "A workshop short paper about an LLM agent benchmark with baseline and metric",
            requested_domains=["ai"],
        )
        self.assertIn(CapTrigger.NON_FULL_REGULAR_TARGET, diagnosis.raw_score.cap_triggers)
        self.assertLessEqual(diagnosis.raw_score.total, 50)

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
