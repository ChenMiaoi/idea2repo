"""Venue database loading and domain routing."""

from __future__ import annotations

import json
from dataclasses import dataclass
from importlib import resources
from pathlib import Path
from typing import Any


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
            encoding="utf-8"
        )
    else:
        data = Path(path).read_text(encoding="utf-8")

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
