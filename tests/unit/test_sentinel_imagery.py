import io
import json

import planetary_scanner.api.sentinel_imagery as imagery
from planetary_scanner.api.sentinel_imagery import _select_latest_scenes


def test_select_latest_scenes_keeps_newest_item_for_each_mgrs_tile() -> None:
    scenes = _select_latest_scenes(
        [
            {
                "id": "older",
                "properties": {
                    "datetime": "2025-08-01T10:00:00Z",
                    "eo:cloud_cover": 2.0,
                    "s2:mgrs_tile": "33UUB",
                    "s2:nodata_pixel_percentage": 0.0,
                },
            },
            {
                "id": "newer",
                "properties": {
                    "datetime": "2025-08-18T10:00:00Z",
                    "eo:cloud_cover": 4.0,
                    "s2:mgrs_tile": "33UUB",
                    "s2:nodata_pixel_percentage": 0.0,
                },
            },
            {
                "id": "other-tile",
                "properties": {
                    "datetime": "2025-08-15T10:00:00Z",
                    "eo:cloud_cover": 1.0,
                    "s2:mgrs_tile": "32VNH",
                    "s2:nodata_pixel_percentage": 0.0,
                },
            },
        ],
        limit=4,
        mode="imagery",
    )

    assert [scene.item_id for scene in scenes] == ["newer", "other-tile"]
    assert scenes[0].tile_url.endswith(
        "?collection=sentinel-2-l2a&item=newer&assets=visual"
    )


def test_select_latest_scenes_rejects_incomplete_tiles() -> None:
    scenes = _select_latest_scenes(
        [
            {
                "id": "partial",
                "properties": {
                    "datetime": "2025-08-18T10:00:00Z",
                    "eo:cloud_cover": 1.0,
                    "s2:mgrs_tile": "33UUB",
                    "s2:nodata_pixel_percentage": 12.0,
                },
            }
        ],
        limit=1,
        mode="imagery",
    )

    assert scenes == []


def test_find_modis_thermal_scenes_uses_viewport_percentiles_in_celsius(
    monkeypatch,
) -> None:
    def fake_urlopen(request, timeout: int):
        url = request.full_url if hasattr(request, "full_url") else request
        if url == imagery.PLANETARY_COMPUTER_STAC_SEARCH_URL:
            payload = {
                "features": [
                    {
                        "id": "older",
                        "properties": {
                            "modis:tile-id": "h18v03",
                            "start_datetime": "2025-08-01T00:00:00Z",
                        },
                    },
                    {
                        "id": "newer",
                        "properties": {
                            "modis:tile-id": "h18v03",
                            "start_datetime": "2025-08-09T00:00:00Z",
                        },
                    },
                ]
            }
        else:
            payload = {
                "LST_Day_1km_b1": {"percentile_2": 280.0, "percentile_98": 300.0}
            }
        return io.BytesIO(json.dumps(payload).encode("utf-8"))

    imagery.find_modis_thermal_scenes.cache_clear()
    monkeypatch.setattr(imagery, "urlopen", fake_urlopen)

    scenes = imagery.find_modis_thermal_scenes(10.0, 50.0, 11.0, 51.0, 4)

    assert len(scenes) == 1
    assert scenes[0].item_id == "newer"
    assert scenes[0].display_min_c == 6.85
    assert scenes[0].display_max_c == 26.85
    assert "unscale=true" in scenes[0].tile_url
    assert "rescale=280.0%2C300.0" in scenes[0].tile_url
