"""Venue database loading and domain routing."""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class VenueRecord:
    """Auditable metadata for one venue seed entry."""

    name: str
    full_name: str
    ccf_category: str
    domain: str
    venue_type: str
    eligible_tracks: tuple[str, ...]
    ineligible_tracks: tuple[str, ...]
    source_url: str
    dblp_url: str
    last_checked: str
    provenance_note: str


@dataclass(frozen=True)
class DomainProfile:
    """A review-style profile for one target research domain."""

    key: str
    label: str
    primary_venues: tuple[str, ...]
    secondary_venues: tuple[str, ...]
    review_focus: tuple[str, ...]
    keywords: tuple[str, ...]
    aliases: tuple[str, ...]
    venue_records: dict[str, VenueRecord]


@dataclass(frozen=True)
class VenueDatabase:
    """Updatable venue and reviewer rubric database."""

    version: str
    source_note: str
    domains: dict[str, DomainProfile]


@dataclass(frozen=True)
class DomainRoute:
    """Domain routing result for a raw idea."""

    domain: DomainProfile
    score: int
    matched_keywords: tuple[str, ...]
    requested: bool = False


def load_venue_database(path: str | Path | None = None) -> VenueDatabase:
    """Load the venue database from package data or a user-supplied JSON file."""

    if path is None:
        data = resources.files("idea2repo").joinpath("data/venues.json").read_text(
            encoding="utf-8-sig"
        )
    else:
        data = Path(path).read_text(encoding="utf-8-sig")

    raw: dict[str, Any] = json.loads(data)
    domains = {
        key: DomainProfile(
            key=key,
            label=value["label"],
            primary_venues=tuple(value["primary_venues"]),
            secondary_venues=tuple(value["secondary_venues"]),
            review_focus=tuple(value["review_focus"]),
            keywords=tuple(value["keywords"]),
            aliases=tuple(value.get("aliases", ())),
            venue_records=_load_venue_records(key, value.get("venue_records", [])),
        )
        for key, value in raw["domains"].items()
    }
    return VenueDatabase(
        version=raw["version"],
        source_note=raw["source_note"],
        domains=domains,
    )


def route_idea(
    idea: str,
    database: VenueDatabase | None = None,
    *,
    requested_domains: list[str] | None = None,
) -> list[DomainRoute]:
    """Rank target domains from keyword evidence and optional user choices."""

    database = database or load_venue_database()
    normalized = idea.casefold()
    requested = {_normalize_request(value) for value in requested_domains or []}
    routes: list[DomainRoute] = []

    for key, profile in database.domains.items():
        matches = tuple(
            keyword for keyword in profile.keywords if keyword.casefold() in normalized
        )
        score = len(matches) * 10
        candidates = {
            _normalize_request(key),
            _normalize_request(profile.label),
        }
        candidates.update(_normalize_request(value) for value in profile.aliases)
        candidates.update(
            _normalize_request(value)
            for value in profile.primary_venues + profile.secondary_venues
        )
        requested_match = bool(requested & candidates)
        if requested_match:
            score += 100
        routes.append(DomainRoute(profile, score, matches, requested_match))

    routes.sort(key=lambda route: (route.requested, route.score, route.domain.label), reverse=True)
    if routes and routes[0].score > 0:
        return routes

    return [
        DomainRoute(
            database.domains["ai_llm_agent"],
            1,
            (),
        )
    ] + [
        route
        for route in routes
        if route.domain.key != "ai_llm_agent"
    ]


def _normalize_request(value: str) -> str:
    separators = str.maketrans({char: " " for char in "_-/\\|,:;"})
    return " ".join(value.casefold().translate(separators).split())


def validate_venue_database(database: VenueDatabase | None = None) -> tuple[str, ...]:
    """Validate venue provenance and CCF track metadata."""

    database = database or load_venue_database()
    errors: list[str] = []
    if not database.version:
        errors.append("database version is required")
    for key, profile in database.domains.items():
        listed = set(profile.primary_venues + profile.secondary_venues)
        missing = sorted(listed - set(profile.venue_records))
        for venue in missing:
            errors.append(f"{key}: missing venue record for {venue}")
        for name, record in profile.venue_records.items():
            if record.domain != key:
                errors.append(f"{key}: {name} has mismatched domain {record.domain}")
            if record.ccf_category not in {"A", "B", "C"}:
                errors.append(f"{key}: {name} has invalid CCF category {record.ccf_category}")
            if record.venue_type not in {"conference", "journal"}:
                errors.append(f"{key}: {name} has invalid venue type {record.venue_type}")
            if not record.source_url.startswith(("https://", "http://")):
                errors.append(f"{key}: {name} source_url must be absolute")
            if not record.dblp_url.startswith(("https://", "http://")):
                errors.append(f"{key}: {name} dblp_url must be absolute")
            if "Full paper" not in record.eligible_tracks and "Regular paper" not in record.eligible_tracks:
                errors.append(f"{key}: {name} must include Full paper or Regular paper eligibility")
            required_ineligible = {"Workshop", "Demo", "Short paper"}
            if not required_ineligible.issubset(set(record.ineligible_tracks)):
                errors.append(f"{key}: {name} must mark workshop/demo/short paper as ineligible")
            if set(record.eligible_tracks) & set(record.ineligible_tracks):
                errors.append(f"{key}: {name} has contradictory eligible and ineligible tracks")
            if required_ineligible & set(record.eligible_tracks):
                errors.append(f"{key}: {name} cannot mark workshop/demo/short paper as eligible")
            if not record.last_checked:
                errors.append(f"{key}: {name} last_checked is required")
    return tuple(errors)


def _load_venue_records(domain: str, records: list[dict[str, Any]]) -> dict[str, VenueRecord]:
    loaded: dict[str, VenueRecord] = {}
    for value in records:
        required = (
            "name",
            "full_name",
            "ccf_category",
            "domain",
            "venue_type",
            "eligible_tracks",
            "ineligible_tracks",
            "source_url",
            "dblp_url",
            "last_checked",
            "provenance_note",
        )
        missing = [field for field in required if field not in value]
        if missing:
            name = value.get("name", "<unknown>")
            raise ValueError(f"venue record {name} missing required fields: {', '.join(missing)}")
        record = VenueRecord(
            name=value["name"],
            full_name=value["full_name"],
            ccf_category=value["ccf_category"],
            domain=value["domain"],
            venue_type=value["venue_type"],
            eligible_tracks=tuple(value["eligible_tracks"]),
            ineligible_tracks=tuple(value["ineligible_tracks"]),
            source_url=value["source_url"],
            dblp_url=value["dblp_url"],
            last_checked=value["last_checked"],
            provenance_note=value["provenance_note"],
        )
        loaded[record.name] = record
    return loaded
