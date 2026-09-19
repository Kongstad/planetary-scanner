"""Bounded Sentinel-2 scene discovery for exploratory viewer imagery."""

import json
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pydantic import BaseModel

PLANETARY_COMPUTER_STAC_SEARCH_URL = (
    "https://planetarycomputer.microsoft.com/api/stac/v1/search"
)
PLANETARY_COMPUTER_ITEM_TILE_URL = (
    "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/"
    "WebMercatorQuad/{z}/{x}/{y}@1x"
)
PLANETARY_COMPUTER_ITEM_STATISTICS_URL = (
    "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics"
)
SENTINEL_2_COLLECTION = "sentinel-2-l2a"
COPERNICUS_DEM_COLLECTION = "cop-dem-glo-30"
MODIS_LST_COLLECTION = "modis-11A2-061"
MAX_SCENES = 9
LOOKBACK_DAYS = 90
MAX_NODATA_PERCENT = 2.0


class SentinelImageryUnavailableError(RuntimeError):
    """The remote catalog could not provide exploratory Sentinel-2 imagery."""


class Sentinel2Scene(BaseModel):
    """One display-only Sentinel-2 scene selected for the current viewer extent."""

    item_id: str
    observed_at: datetime
    cloud_cover: float
    mgrs_tile: str
    valid_data_fraction: float
    tile_url: str


class CopernicusDemScene(BaseModel):
    """One display-only Copernicus DEM tile selected for the current viewer extent."""

    item_id: str
    display_min_m: float
    display_max_m: float
    tile_url: str


class ModisThermalScene(BaseModel):
    """One display-only MODIS 8-day daytime land-surface-temperature tile."""

    item_id: str
    tile_id: str
    observed_at: datetime
    display_min_c: float
    display_max_c: float
    tile_url: str


def _sentinel_2_tile_url(item_id: str, mode: Literal["imagery", "biosphere"]) -> str:
    parameters: list[tuple[str, str]] = [
        ("collection", SENTINEL_2_COLLECTION),
        ("item", item_id),
    ]
    if mode == "imagery":
        parameters.append(("assets", "visual"))
    else:
        parameters.extend(
            [
                ("assets", "B04"),
                ("assets", "B08"),
                ("expression", "(B08-B04)/(B08+B04)"),
                ("asset_as_band", "true"),
                ("rescale", "-1,1"),
                ("colormap_name", "rdylgn"),
            ]
        )
    return f"{PLANETARY_COMPUTER_ITEM_TILE_URL}?{urlencode(parameters)}"


def _copernicus_dem_tile_url(item_id: str, display_min_m: float, display_max_m: float) -> str:
    parameters = [
        ("collection", COPERNICUS_DEM_COLLECTION),
        ("item", item_id),
        ("assets", "data"),
        ("rescale", f"{display_min_m},{display_max_m}"),
        ("colormap_name", "gist_earth"),
    ]
    return f"{PLANETARY_COMPUTER_ITEM_TILE_URL}?{urlencode(parameters)}"


def _modis_lst_tile_url(item_id: str, display_min_c: float, display_max_c: float) -> str:
    parameters = [
        ("collection", MODIS_LST_COLLECTION),
        ("item", item_id),
        ("assets", "LST_Day_1km"),
        ("unscale", "true"),
        ("rescale", f"{display_min_c + 273.15},{display_max_c + 273.15}"),
        ("colormap_name", "inferno"),
    ]
    return f"{PLANETARY_COMPUTER_ITEM_TILE_URL}?{urlencode(parameters)}"


def _select_latest_scenes(
    features: list[dict[str, Any]], limit: int, mode: Literal["imagery", "biosphere"]
) -> list[Sentinel2Scene]:
    scenes_by_mgrs_tile: dict[str, Sentinel2Scene] = {}
    for feature in features:
        properties = feature["properties"]
        mgrs_tile = properties.get("s2:mgrs_tile")
        observed_at = properties.get("datetime")
        cloud_cover = properties.get("eo:cloud_cover")
        nodata_percent = properties.get("s2:nodata_pixel_percentage")
        item_id = feature.get("id")
        if not all(
            isinstance(value, str) for value in (mgrs_tile, observed_at, item_id)
        ) or not isinstance(cloud_cover, int | float) or not isinstance(nodata_percent, int | float):
            continue
        if nodata_percent > MAX_NODATA_PERCENT:
            continue
        scene = Sentinel2Scene(
            item_id=item_id,
            observed_at=observed_at,
            cloud_cover=cloud_cover,
            mgrs_tile=mgrs_tile,
            valid_data_fraction=(100 - nodata_percent) / 100,
            tile_url=_sentinel_2_tile_url(item_id, mode),
        )
        current_scene = scenes_by_mgrs_tile.get(mgrs_tile)
        if current_scene is None or scene.observed_at > current_scene.observed_at:
            scenes_by_mgrs_tile[mgrs_tile] = scene
    return sorted(
        scenes_by_mgrs_tile.values(), key=lambda scene: scene.observed_at, reverse=True
    )[:limit]


@lru_cache(maxsize=128)
def find_sentinel_2_scenes(
    west: float,
    south: float,
    east: float,
    north: float,
    maximum_cloud_cover: float,
    limit: int,
    mode: Literal["imagery", "biosphere"],
) -> tuple[Sentinel2Scene, ...]:
    """Find a small latest-usable Sentinel-2 scene set for a rounded viewport."""
    end = datetime.now(UTC).date()
    start = end - timedelta(days=LOOKBACK_DAYS)
    request = Request(
        PLANETARY_COMPUTER_STAC_SEARCH_URL,
        data=json.dumps(
            {
                "collections": [SENTINEL_2_COLLECTION],
                "bbox": [west, south, east, north],
                "datetime": f"{start.isoformat()}/{end.isoformat()}",
                "query": {"eo:cloud_cover": {"lt": maximum_cloud_cover}},
                "limit": 100,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError) as error:
        raise SentinelImageryUnavailableError(
            "Planetary Computer Sentinel-2 search is unavailable"
        ) from error
    return tuple(_select_latest_scenes(payload["features"], limit, mode))


@lru_cache(maxsize=128)
def find_copernicus_dem_scenes(
    west: float, south: float, east: float, north: float, limit: int
) -> tuple[CopernicusDemScene, ...]:
    """Find a bounded Copernicus DEM tile set for the current viewer extent."""
    request = Request(
        PLANETARY_COMPUTER_STAC_SEARCH_URL,
        data=json.dumps(
            {
                "collections": [COPERNICUS_DEM_COLLECTION],
                "bbox": [west, south, east, north],
                "limit": limit,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError) as error:
        raise SentinelImageryUnavailableError(
            "Planetary Computer Copernicus DEM search is unavailable"
        ) from error
    item_ids = [
        feature["id"] for feature in payload["features"][:limit] if isinstance(feature.get("id"), str)
    ]
    if not item_ids:
        return ()
    display_min_m, display_max_m = _copernicus_dem_display_range(
        item_ids, west, south, east, north
    )
    return tuple(
        CopernicusDemScene(
            item_id=item_id,
            display_min_m=display_min_m,
            display_max_m=display_max_m,
            tile_url=_copernicus_dem_tile_url(item_id, display_min_m, display_max_m),
        )
        for item_id in item_ids
    )


def _copernicus_dem_display_range(
    item_ids: list[str], west: float, south: float, east: float, north: float
) -> tuple[float, float]:
    """Use robust per-item percentiles to avoid a few extreme DEM values flattening color."""
    ranges = [_copernicus_dem_item_percentiles(item_id, west, south, east, north) for item_id in item_ids]
    return min(range_[0] for range_ in ranges), max(range_[1] for range_ in ranges)


def _copernicus_dem_item_percentiles(
    item_id: str, west: float, south: float, east: float, north: float
) -> tuple[float, float]:
    parameters = urlencode(
        [
            ("collection", COPERNICUS_DEM_COLLECTION),
            ("item", item_id),
            ("assets", "data"),
            ("bbox", f"{west},{south},{east},{north}"),
        ]
    )
    try:
        with urlopen(f"{PLANETARY_COMPUTER_ITEM_STATISTICS_URL}?{parameters}", timeout=30) as response:
            statistics = json.load(response)["data_b1"]
    except (HTTPError, URLError, TimeoutError, KeyError) as error:
        raise SentinelImageryUnavailableError(
            "Planetary Computer Copernicus DEM statistics are unavailable"
        ) from error
    return float(statistics["percentile_2"]), float(statistics["percentile_98"])


@lru_cache(maxsize=128)
def find_modis_thermal_scenes(
    west: float, south: float, east: float, north: float, limit: int
) -> tuple[ModisThermalScene, ...]:
    """Find latest distinct MODIS LST tiles and their viewport temperature range."""
    end = datetime.now(UTC).date()
    start = end - timedelta(days=LOOKBACK_DAYS)
    request = Request(
        PLANETARY_COMPUTER_STAC_SEARCH_URL,
        data=json.dumps(
            {
                "collections": [MODIS_LST_COLLECTION],
                "bbox": [west, south, east, north],
                "datetime": f"{start.isoformat()}/{end.isoformat()}",
                "limit": 100,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            features = json.load(response)["features"]
    except (HTTPError, URLError, TimeoutError) as error:
        raise SentinelImageryUnavailableError(
            "Planetary Computer MODIS temperature search is unavailable"
        ) from error

    scenes_by_tile: dict[str, tuple[str, datetime]] = {}
    for feature in features:
        properties = feature["properties"]
        tile_id = properties.get("modis:tile-id")
        observed_at = properties.get("start_datetime")
        item_id = feature.get("id")
        if not all(isinstance(value, str) for value in (tile_id, observed_at, item_id)):
            continue
        timestamp = datetime.fromisoformat(observed_at)
        current_scene = scenes_by_tile.get(tile_id)
        if current_scene is None or timestamp > current_scene[1]:
            scenes_by_tile[tile_id] = (item_id, timestamp)
    selected_scenes = sorted(
        scenes_by_tile.items(), key=lambda item: item[1][1], reverse=True
    )[:limit]
    if not selected_scenes:
        return ()
    temperature_ranges_k = [
        _modis_lst_item_percentiles(item_id, west, south, east, north)
        for _, (item_id, _) in selected_scenes
    ]
    display_min_c = round(min(range_[0] for range_ in temperature_ranges_k) - 273.15, 2)
    display_max_c = round(max(range_[1] for range_ in temperature_ranges_k) - 273.15, 2)
    return tuple(
        ModisThermalScene(
            item_id=item_id,
            tile_id=tile_id,
            observed_at=observed_at,
            display_min_c=display_min_c,
            display_max_c=display_max_c,
            tile_url=_modis_lst_tile_url(item_id, display_min_c, display_max_c),
        )
        for tile_id, (item_id, observed_at) in selected_scenes
    )


def _modis_lst_item_percentiles(
    item_id: str, west: float, south: float, east: float, north: float
) -> tuple[float, float]:
    parameters = urlencode(
        [
            ("collection", MODIS_LST_COLLECTION),
            ("item", item_id),
            ("assets", "LST_Day_1km"),
            ("bbox", f"{west},{south},{east},{north}"),
            ("unscale", "true"),
        ]
    )
    try:
        with urlopen(f"{PLANETARY_COMPUTER_ITEM_STATISTICS_URL}?{parameters}", timeout=30) as response:
            statistics = json.load(response)["LST_Day_1km_b1"]
    except (HTTPError, URLError, TimeoutError, KeyError) as error:
        raise SentinelImageryUnavailableError(
            "Planetary Computer MODIS temperature statistics are unavailable"
        ) from error
    return float(statistics["percentile_2"]), float(statistics["percentile_98"])
