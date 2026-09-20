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
    assert facts_by_field["current_life_status"]["value"] == "NO CONFIRMED CURRENT LIFE DETECTION"


def test_get_solar_system_reference_dataset() -> None:
    response = client.get("/reference/bodies/solar-system")

    assert response.status_code == 200
    payload = response.json()
    assert payload["body_id"] == "solar-system"
    facts_by_field = {fact["field"]: fact for fact in payload["facts"]}
    assert facts_by_field["spacex_roadster_orbit_class"]["value"] == "SUN-CENTERED ORBIT · NOT MARS ORBIT"


def test_unknown_reference_body_returns_not_found() -> None:
    response = client.get("/reference/bodies/luna")

    assert response.status_code == 404
    assert response.json() == {"detail": "Reference body not found: luna"}


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

    monkeypatch.setattr("planetary_scanner.api.main.get_reference_retriever", get_mars_retriever)

    response = client.get(
        "/retrieval/reference",
        params={"question": "What is Mars's mean radius?", "body_id": "mars", "limit": 1},
    )

    assert response.status_code == 200
    result = response.json()[0]
    assert result["document"]["document_id"] == "reference-fact-mars-mean-radius"
    assert result["document"]["metadata"]["body_id"] == "mars"


def test_retrieve_reference_records_uses_both_bodies_for_comparison(monkeypatch) -> None:
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
        params={"question": "How does Mars's size compare to Earth?", "body_id": "mars"},
    )

    assert response.status_code == 200
    assert [result["document"]["metadata"]["body_id"] for result in response.json()] == [
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
        params={"question": "How does Mars's size compare to Earth?", "body_id": "mars"},
    )

    assert response.status_code == 200
    assert response.json()["answer"] == "Mars is smaller than Earth."


def test_answer_reference_question_rejects_unsupported_body() -> None:
    response = client.get(
        "/answers/reference",
        params={"question": "What is its mean radius?", "body_id": "solar-system"},
    )

    assert response.status_code == 422


def test_science_computer_status_reports_model_availability(monkeypatch) -> None:
    monkeypatch.setattr(
        "planetary_scanner.api.main.is_ollama_model_available",
        lambda: True,
    )

    response = client.get("/health/science-computer")

    assert response.status_code == 200
    assert response.json() == {"online": True, "model": "qwen2.5:3b"}