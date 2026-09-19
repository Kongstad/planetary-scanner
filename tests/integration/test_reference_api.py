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


def test_retrieve_reference_records() -> None:
    response = client.get(
        "/retrieval/reference",
        params={"question": "What is Earth's mean radius?", "limit": 1},
    )

    assert response.status_code == 200
    result = response.json()[0]
    assert result["document"]["document_id"] == "reference-fact-earth-mean-radius"
    assert result["document"]["metadata"]["source_id"] == "jpl-planetary-physical-parameters-2019"


def test_science_computer_status_reports_model_availability(monkeypatch) -> None:
    monkeypatch.setattr(
        "planetary_scanner.api.main.is_ollama_model_available",
        lambda: True,
    )

    response = client.get("/health/science-computer")

    assert response.status_code == 200
    assert response.json() == {"online": True, "model": "qwen2.5:3b"}