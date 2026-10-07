import pytest
from fastapi.testclient import TestClient

from planetary_scanner.api.main import app
from planetary_scanner.models.reference import RagDocument
from planetary_scanner.rag.reference_answers import GroundedAnswer
from planetary_scanner.rag.reference_retrieval import RetrievedReferenceRecord

client = TestClient(app)


def test_get_earth_reference_dataset() -> None:
    response = client.get("/reference/bodies/earth")

    assert response.status_code == 200
    payload = response.json()
    assert payload["body_id"] == "earth"
    facts_by_field = {fact["field"]: fact for fact in payload["facts"]}
    assert facts_by_field["rotation_period"]["source_id"] == "nasa-earth-facts-2025"
    assert facts_by_field["solar_wind_deflection"]["kind"] == "statement"


def test_get_mars_reference_dataset() -> None:
    response = client.get("/reference/bodies/mars")

    assert response.status_code == 200
    payload = response.json()
    assert payload["body_id"] == "mars"
    facts_by_field = {fact["field"]: fact for fact in payload["facts"]}
    assert facts_by_field["mean_radius"]["value"] == 3389.5
    assert (
        facts_by_field["current_life_status"]["value"]
        == "NO CONFIRMED CURRENT LIFE DETECTION"
    )


def test_get_lunar_reference_dataset_preserves_scopes_and_sources() -> None:
    response = client.get("/reference/bodies/luna")

    assert response.status_code == 200
    payload = response.json()
    assert payload["body_id"] == "luna"
    facts = {fact["field"]: fact for fact in payload["facts"]}
    assert facts["orbital_period"]["value"] == 27.3217
    assert facts["synodic_period"]["value"] == 29.53
    assert facts["night_surface_pressure"]["unit"] == "bar"
    assert (
        facts["sunlit_water_abundance"]["scope"]
        == "local_reported_clavius_soil_water_concentration"
    )
    assert facts["grail_mean_crust_thickness"]["source_id"] == "nasa-grail-crust-2012"
    oxide_facts = [
        fact for field, fact in facts.items() if field.startswith("bulk_silicate_")
    ]
    assert len(oxide_facts) == 6
    assert facts["bulk_silicate_silica_fraction"]["value"] == 46.8
    assert facts["bulk_silicate_iron_oxide_fraction"]["value"] == 9.24
    for fact in oxide_facts:
        assert fact["unit"] == "wt%"
        assert fact["source_id"] == "charlier-lunar-bulk-silicate-compositions-2018"
        assert (
            fact["scope"]
            == "bulk_silicate_moon_warren_2005_model_oxide_mass_percent_core_excluded"
        )


def test_get_solar_system_reference_dataset() -> None:
    response = client.get("/reference/bodies/solar-system")

    assert response.status_code == 200
    payload = response.json()
    assert payload["body_id"] == "solar-system"
    facts_by_field = {fact["field"]: fact for fact in payload["facts"]}
    assert (
        facts_by_field["spacex_roadster_orbit_class"]["value"]
        == "SUN-CENTERED ORBIT · NOT MARS ORBIT"
    )


def test_sol_reference_preserves_photospheric_composition_units() -> None:
    response = client.get("/reference/bodies/sol")
    assert response.status_code == 200
    facts = {fact["field"]: fact for fact in response.json()["facts"]}
    assert facts["mean_radius"]["value"] == 695700
    assert facts["hydrogen_number_fraction"]["unit"] == "%"
    assert facts["oxygen_abundance"]["unit"] == "ppm"
    assert (
        facts["hydrogen_number_fraction"]["scope"]
        == "solar_photosphere_elemental_number_abundance"
    )


def test_solar_observation_normalizes_utc_and_preserves_actual_date(
    monkeypatch,
) -> None:
    from planetary_scanner.api.solar_imagery import SolarObservation

    def fake_observation(layer, date):
        assert layer == "visible"
        assert date == "2024-01-01T10:00:00Z"
        return SolarObservation(
            id=123,
            date="2024-01-01T09:59:00",
            name="HMI continuum",
            width=4096,
            height=4096,
            scale=0.5,
        )

    monkeypatch.setattr(
        "planetary_scanner.api.main.find_solar_observation", fake_observation
    )
    response = client.get(
        "/imagery/sol/observation",
        params={"layer": "visible", "date": "2024-01-01T12:00:45+02:00"},
    )
    assert response.status_code == 200
    assert response.json()["date"] == "2024-01-01T09:59:00"


def test_solar_observation_rejects_unknown_layers_and_reports_archive_failure(
    monkeypatch,
) -> None:
    from planetary_scanner.api.solar_imagery import SolarImageryUnavailableError

    def fail(*args):
        raise SolarImageryUnavailableError("Archive unavailable")

    monkeypatch.setattr("planetary_scanner.api.main.find_solar_observation", fail)
    assert (
        client.get("/imagery/sol/observation", params={"layer": "unknown"}).status_code
        == 422
    )
    response = client.get("/imagery/sol/observation", params={"layer": "euv"})
    assert response.status_code == 502
    assert response.json()["detail"] == "Archive unavailable"


def test_unknown_reference_body_returns_not_found() -> None:
    response = client.get("/reference/bodies/pluto")

    assert response.status_code == 404
    assert response.json() == {"detail": "Reference body not found: pluto"}


def test_retrieve_reference_records_uses_requested_body(monkeypatch) -> None:
    class FakeRetriever:
        def retrieve(self, question: str, limit: int) -> list[RetrievedReferenceRecord]:
            assert question == "What is Mars's mean radius?"
            assert limit == 1
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id="reference-fact-mars-mean-radius",
                        content="Mars reference fact: mean radius is 3389.5 km.",
                        metadata={"body_id": "mars"},
                    ),
                    score=1.0,
                )
            ]

    def get_mars_retriever(body_id: str) -> FakeRetriever:
        assert body_id == "mars"
        return FakeRetriever()

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_reference_retriever", get_mars_retriever
    )

    response = client.get(
        "/retrieval/reference",
        params={
            "question": "What is Mars's mean radius?",
            "body_id": "mars",
            "limit": 1,
        },
    )

    assert response.status_code == 200
    result = response.json()[0]
    assert result["document"]["document_id"] == "reference-fact-mars-mean-radius"
    assert result["document"]["metadata"]["body_id"] == "mars"


def test_retrieve_reference_records_uses_both_bodies_for_comparison(
    monkeypatch,
) -> None:
    class FakeCrossBodyRetriever:
        def retrieve(self, question: str, limit: int) -> list[RetrievedReferenceRecord]:
            assert question == "How does Mars's size compare to Earth?"
            assert limit == 3
            return [
                RetrievedReferenceRecord(
                    document=RagDocument(
                        document_id=f"reference-fact-{body_id}-mean-radius",
                        content=f"{body_id.title()} mean radius reference fact.",
                        metadata={"body_id": body_id},
                    ),
                    score=1.0,
                )
                for body_id in ("earth", "mars")
            ]

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_cross_body_reference_retriever",
        lambda: FakeCrossBodyRetriever(),
    )

    response = client.get(
        "/retrieval/reference",
        params={
            "question": "How does Mars's size compare to Earth?",
            "body_id": "mars",
        },
    )

    assert response.status_code == 200
    assert [
        result["document"]["metadata"]["body_id"] for result in response.json()
    ] == [
        "earth",
        "mars",
    ]


def test_answer_reference_question_uses_both_bodies_for_comparison(monkeypatch) -> None:
    class FakeAnswerService:
        def answer(self, question: str, limit: int) -> GroundedAnswer:
            assert question == "How does Mars's size compare to Earth?"
            assert limit == 3
            return GroundedAnswer(
                answer="Mars is smaller than Earth.",
                insufficient_evidence=False,
                citations=[],
            )

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_cross_body_grounded_answer_service",
        lambda: FakeAnswerService(),
    )

    response = client.get(
        "/answers/reference",
        params={
            "question": "How does Mars's size compare to Earth?",
            "body_id": "mars",
        },
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Mars is smaller than Earth."


def test_answer_reference_question_rejects_unsupported_body() -> None:
    response = client.get(
        "/answers/reference",
        params={"question": "What is its mean radius?", "body_id": "solar-system"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "body_id, question",
    [
        ("luna", "What is its mean radius?"),
        ("earth", "What is the Moon's mean radius?"),
        ("mars", "What is Luna's mean radius?"),
    ],
)
def test_lunar_answers_route_to_lunar_evidence_from_any_tab(
    monkeypatch, body_id: str, question: str
) -> None:
    class FakeLunarService:
        def answer(self, received_question: str, limit: int) -> GroundedAnswer:
            assert received_question == question
            return GroundedAnswer(
                answer="The Moon's mean radius is 1737.4 km.",
                insufficient_evidence=False,
                citations=[],
            )

    def lunar_service(target_body: str) -> FakeLunarService:
        assert target_body == "luna"
        return FakeLunarService()

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_grounded_answer_service", lunar_service
    )
    response = client.get(
        "/answers/reference", params={"question": question, "body_id": body_id}
    )
    assert response.status_code == 200
    assert "1737.4" in response.json()["answer"]


def test_three_body_answer_routes_to_comparison_service(monkeypatch) -> None:
    class FakeComparisonService:
        def answer(self, question: str, limit: int) -> GroundedAnswer:
            assert question == "Compare all three bodies by radius"
            return GroundedAnswer(
                answer="Earth, Mars, and the Moon have different radii.",
                insufficient_evidence=False,
                citations=[],
            )

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_cross_body_grounded_answer_service",
        lambda: FakeComparisonService(),
    )
    response = client.get(
        "/answers/reference",
        params={"question": "Compare all three bodies by radius", "body_id": "luna"},
    )
    assert response.status_code == 200
    assert "Moon" in response.json()["answer"]


def test_science_computer_status_reports_model_availability_and_total_records(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "planetary_scanner.api.main.is_ollama_model_available",
        lambda: True,
    )

    response = client.get("/health/science-computer")

    assert response.status_code == 200
    from planetary_scanner.api.main import REFERENCE_RECORD_PATHS
    from planetary_scanner.rag.reference_retrieval import load_reference_records

    reference_count = sum(
        len(load_reference_records(path)) for path in REFERENCE_RECORD_PATHS.values()
    )
    assert reference_count >= 5000
    assert response.json() == {
        "online": True,
        "model": "ministral-3:3b",
        "reference_records": reference_count,
    }


def test_ambiguous_comparison_is_clarified_before_loading_models(monkeypatch):
    def unused_service():
        raise AssertionError("Clarifications must not load the model stack")

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_cross_body_grounded_answer_service",
        unused_service,
    )
    response = client.get(
        "/answers/reference",
        params={
            "question": "What is the ratio between the 4 different planetary bodies?"
        },
    )
    assert response.status_code == 200
    assert response.json()["needs_clarification"]
    assert not response.json()["insufficient_evidence"]


def test_short_clarification_reply_retains_four_body_context(monkeypatch):
    class ComparisonService:
        def answer(self, question, limit):
            assert (
                question
                == "What is the mass ratio between earth and mars and luna and sol?"
            )
            return GroundedAnswer(
                answer="Mass ratios", insufficient_evidence=False, citations=[]
            )

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_cross_body_grounded_answer_service",
        lambda: ComparisonService(),
    )
    response = client.get(
        "/answers/reference",
        params={
            "question": "mass",
            "previous_question": "What is the ratio between the 4 of them?",
        },
    )
    assert response.status_code == 200
    assert response.json()["answer"] == "Mass ratios"


@pytest.mark.parametrize("selected", ["earth", "mars", "luna", "sol"])
@pytest.mark.parametrize(
    "question,expected",
    [
        ("What is an exoplanet?", "milky-way"),
        ("Does Europa have an ocean?", "solar-system"),
        ("What is Tycho's diameter?", "luna"),
        ("What is Proxima Centauri b's mass?", "milky-way"),
    ],
)
def test_shared_and_named_object_answers_work_from_every_tab(
    monkeypatch, selected, question, expected
):
    class Service:
        def answer(self, received_question, limit):
            assert received_question == question
            return GroundedAnswer(
                answer="Cited answer", insufficient_evidence=False, citations=[]
            )

    def service(collection):
        assert collection == expected
        return Service()

    monkeypatch.setattr(
        "planetary_scanner.api.main.get_grounded_answer_service", service
    )
    response = client.get(
        "/answers/reference", params={"question": question, "body_id": selected}
    )
    assert response.status_code == 200
    assert not response.json()["insufficient_evidence"]


@pytest.mark.parametrize("endpoint", ["/answers/reference", "/retrieval/reference"])
def test_reference_query_rejects_invalid_result_limit(endpoint):
    response = client.get(
        endpoint, params={"question": "What is an exoplanet?", "limit": 0}
    )
    assert response.status_code == 422
