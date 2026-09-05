from fastapi.testclient import TestClient

from planetary_scanner.api.main import app

client = TestClient(app)


def test_get_earth_reference_dataset() -> None:
    response = client.get("/reference/bodies/earth")

    assert response.status_code == 200
    payload = response.json()
    assert payload["body_id"] == "earth"
    facts_by_field = {fact["field"]: fact for fact in payload["facts"]}
    assert facts_by_field["rotation_period"]["source_id"] == "nasa-earth-facts-2025"
    assert facts_by_field["solar_wind_deflection"]["kind"] == "statement"


def test_unknown_reference_body_returns_not_found() -> None:
    response = client.get("/reference/bodies/mars")

    assert response.status_code == 404
    assert response.json() == {"detail": "Reference body not found: mars"}


def test_retrieve_reference_records() -> None:
    response = client.get(
        "/retrieval/reference",
        params={"question": "What is Earth's mean radius?", "limit": 1},
    )

    assert response.status_code == 200
    result = response.json()[0]
    assert result["document"]["document_id"] == "reference-fact-earth-mean-radius"
    assert result["document"]["metadata"]["source_id"] == "jpl-planetary-physical-parameters-2019"