"""Package reference facts and dated SDO disk images for a server-free demo."""

import argparse
import json
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SOLAR_API = "https://api.helioviewer.org/v2/"
SOLAR_SOURCES = {"visible": 18, "euv": 10, "chromosphere": 13, "magnetic": 19}


def download(url: str, limit: int) -> bytes:
    with urlopen(url, timeout=90) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Archive response exceeded the expected size")
    return data


def prepare(output: Path, solar_date: str) -> None:
    reference = output / "reference"
    reference.mkdir(parents=True, exist_ok=True)
    for body in ("earth", "mars", "luna", "sol"):
        source = ROOT / "data" / "reference" / f"{body}.json"
        dataset = json.loads(source.read_text())
        if dataset["body_id"] != body or not dataset["facts"]:
            raise ValueError(f"Invalid reference dataset: {body}")
        shutil.copyfile(source, reference / source.name)
    shutil.copyfile(ROOT / "data/reference/sources.json", reference / "sources.json")
    record_count = sum(
        sum(1 for line in path.read_text().splitlines() if line.strip())
        for path in (ROOT / "data/reference").glob("*-reference-records.jsonl")
    )
    (output / "status.json").write_text(
        json.dumps({"online": False, "reference_records": record_count}) + "\n"
    )

    cache = ROOT / "data/cache/static-demo/solar"
    cache.mkdir(parents=True, exist_ok=True)
    manifest_path = cache / "observations.json"
    cached = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    if cached.get("requested_at") != solar_date or not all(
        (cache / f"{layer}.jpg").exists() for layer in SOLAR_SOURCES
    ):
        observations = {}
        for layer, source_id in SOLAR_SOURCES.items():
            parameters = urlencode({"date": solar_date, "sourceId": source_id})
            metadata = json.loads(
                download(f"{SOLAR_API}getClosestImage/?{parameters}", 1_000_000)
            )
            observation = {
                "id": int(metadata["id"]),
                "date": metadata["date"].replace(" ", "T"),
                "name": str(metadata["name"]),
                "width": int(metadata["width"]),
                "height": int(metadata["height"]),
                "scale": float(metadata["scale"]),
                "imageUrl": f"demo/solar/{layer}.jpg",
            }
            image_parameters = urlencode(
                {"id": observation["id"], "width": 4096, "type": "jpg"}
            )
            image = download(
                f"{SOLAR_API}downloadImage/?{image_parameters}", 50_000_000
            )
            if not image.startswith(b"\xff\xd8\xff"):
                raise ValueError(f"The archive did not return a JPEG for {layer}")
            (cache / f"{layer}.jpg").write_bytes(image)
            observations[layer] = observation
            print(
                f"Packaged {layer}: {observation['name']} at {observation['date']} UTC",
                flush=True,
            )
        manifest_path.write_text(
            json.dumps(
                {
                    "requested_at": solar_date,
                    "source_url": SOLAR_API,
                    "credit": "NASA/SDO and the AIA, EVE, and HMI science teams; Helioviewer",
                    "observations": observations,
                },
                indent=2,
            )
            + "\n"
        )
    shutil.copytree(cache, output / "solar", dirs_exist_ok=True)
    (output.parent / ".nojekyll").touch()
    (output.parent / "README.md").write_text(
        "# PlanetaryScanner viewer demo\n\n"
        "Explore Earth, Luna, Mars, and Sol. Drag to rotate and scroll to zoom. "
        "Earth has Reset View, and Sol also offers globe controls and disk pan/zoom.\n\n"
        "This static demo requires no API, language model, GPU, or EC2 instance. "
        "Reference facts and dated SDO snapshots are bundled. Global map layers "
        "load directly from public scientific imagery services. Backend scene "
        "scanning and live solar date selection are available in the local app.\n\n"
        "Source attribution: demo/reference/sources.json, "
        "demo/solar/observations.json, sol/README.md, and viewer credits. "
        "CesiumJS license: third-party-licenses/cesium-LICENSE.md.\n"
    )
    print(f"Static demo data ready in {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--solar-date",
        default=(datetime.now(UTC) - timedelta(days=1))
        .replace(hour=12, minute=0, second=0, microsecond=0)
        .strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    args = parser.parse_args()
    datetime.strptime(args.solar_date, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    prepare(args.output, args.solar_date)
