"""Solar observation discovery through the Helioviewer REST API."""

import json
from datetime import datetime
from functools import lru_cache
from typing import Literal
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from pydantic import BaseModel

SolarLayer = Literal["visible", "euv", "chromosphere", "magnetic"]
SOURCE_IDS: dict[SolarLayer, int] = {
    "visible": 18,
    "euv": 10,
    "chromosphere": 13,
    "magnetic": 19,
}
API_URL = "https://api.helioviewer.org/v2/"


class SolarObservation(BaseModel):
    """A timestamped observed disk, retaining its native image scale."""

    id: int
    date: datetime
    name: str
    width: int
    height: int
    scale: float


class SolarImageryUnavailableError(RuntimeError):
    """The remote archive could not supply an observation."""


@lru_cache(maxsize=64)
def find_solar_observation(layer: SolarLayer, date: str) -> SolarObservation:
    """Resolve an observation nearest a requested UTC minute on a fixed archive."""

    parameters = urlencode({"date": date, "sourceId": SOURCE_IDS[layer]})
    try:
        with urlopen(f"{API_URL}getClosestImage/?{parameters}", timeout=20) as response:
            return SolarObservation.model_validate(json.loads(response.read(1_000_000)))
    except (URLError, TimeoutError, ValueError) as error:
        raise SolarImageryUnavailableError(
            "Solar archive unavailable; try another date or retry."
        ) from error
