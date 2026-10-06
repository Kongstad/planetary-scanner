"""Import source snapshots into validated research records."""

import csv
import hashlib
import json
import math
import re
import zipfile
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from planetary_scanner.models.corpus import KnowledgeRecord

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "data/reference"
EXOPLANET_QUERY = (
    "select pl_name,hostname,discoverymethod,disc_year,pl_orbper,pl_orbsmax,"
    "pl_rade,pl_bmasse,pl_bmassprov,st_spectype,st_teff,sy_dist,pl_orbperlim,"
    "pl_orbsmaxlim,pl_radelim,pl_bmasselim,st_tefflim,pl_refname "
    "from ps where default_flag=1 and sy_dist<=20"
)
DOWNLOADS = {
    "moon.kmz": "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz",
    "mars.kmz": "https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MARS_nomenclature_center_pts.kmz",
    "sunspots.txt": "https://www.sidc.be/SILSO/DATA/SN_y_tot_V2.0.txt",
    "sunspots-monthly.txt": "https://www.sidc.be/SILSO/DATA/SN_m_tot_V2.0.txt",
    "earthquakes.json": "https://earthquake.usgs.gov/fdsnws/event/1/query?"
    + urlencode(
        {
            "format": "geojson",
            "starttime": "1900-01-01",
            "endtime": "2026-01-01",
            "minmagnitude": 7.5,
            "orderby": "time-asc",
        }
    ),
    "exoplanets.csv": "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?"
    + urlencode({"query": EXOPLANET_QUERY, "format": "csv"}),
}


def number(value: str | float) -> float:
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"Non-finite source value: {value}")
    return result


def feature_records(path: Path, body: str, snapshot: date) -> list[KnowledgeRecord]:
    with zipfile.ZipFile(path) as archive:
        kml = next(name for name in archive.namelist() if name.endswith(".kml"))
        root = ElementTree.fromstring(archive.read(kml))
    records = []
    seen: dict[str, KnowledgeRecord] = {}
    for placemark in root.findall(".//{*}Placemark"):
        fields = {
            item.attrib["name"]: item.text or ""
            for item in placemark.findall(".//{*}SimpleData")
        }
        if fields["approval"] != "Adopted by IAU" or fields["code"] == "SF":
            continue
        name = fields["clean_name"]
        latitude, longitude = number(fields["center_lat"]), number(fields["center_lon"])
        if not -90 <= latitude <= 90 or not 0 <= longitude <= 360:
            raise ValueError(f"Invalid feature coordinates: {name}")
        diameter = number(fields["diameter"])
        if diameter < 0:
            raise ValueError(f"Negative feature diameter: {name}")
        size = (
            f" Its catalog diameter is {diameter:g} km."
            if diameter > 0
            else " The catalog does not supply a positive diameter."
        )
        feature_id = fields["link"].rstrip("/").split("/")[-1]
        feature_type = fields["type"].split(",")[0].lower()
        text = (
            f"{name} is an IAU-adopted feature of type {feature_type} on "
            f"{'the Moon' if body == 'luna' else 'Mars'}.{size} "
            f"Its center is at {latitude:g} degrees planetocentric latitude and "
            f"{longitude:g} degrees east longitude in the Gazetteer GIS export. "
            "These coordinates and the catalog diameter describe the named feature, "
            "not the whole body."
        )
        record = KnowledgeRecord(
            record_id=f"catalog-{body}-feature-{feature_id}",
            collection=body,
            topic="surface_feature",
            text=text,
            kind="measurement",
            scope="IAU named feature in the USGS GIS catalog snapshot",
            as_of=snapshot,
            source_id="usgs-iau-gazetteer-gis",
            source_locator=f"https://planetarynames.wr.usgs.gov/Feature/{feature_id}",
            entity_name=name,
        )
        if record.record_id in seen:
            if record != seen[record.record_id]:
                raise ValueError(f"Conflicting Gazetteer rows: {record.record_id}")
            continue
        seen[record.record_id] = record
        records.append(record)
    return records


def earthquake_records(path: Path, snapshot: date) -> list[KnowledgeRecord]:
    records = []
    for feature in json.loads(path.read_text())["features"]:
        properties = feature["properties"]
        coordinates = feature["geometry"]["coordinates"]
        longitude, latitude = map(number, coordinates[:2])
        depth_text = (
            f"hypocenter depth {number(coordinates[2]):g} km"
            if coordinates[2] is not None
            else "hypocenter depth unavailable"
        )
        magnitude = number(properties["mag"])
        if magnitude < 7.5 or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ValueError(f"Invalid earthquake: {feature['id']}")
        occurred = datetime.fromtimestamp(properties["time"] / 1000, UTC)
        if not 1900 <= occurred.year <= 2025:
            raise ValueError("Earthquake outside requested time range")
        text = (
            f"USGS earthquake {feature['id']} occurred on {occurred.isoformat()} "
            f"at {properties['place']}. Its catalog magnitude is {magnitude:g} "
            f"({properties['magType']} magnitude type), with {depth_text}, "
            f"latitude {latitude:g} degrees and longitude {longitude:g} "
            "degrees east. This is one catalog event, not an estimate of casualties "
            "or a complete inventory of historical earthquakes."
        )
        records.append(
            KnowledgeRecord(
                record_id=f"catalog-earth-earthquake-{feature['id']}",
                collection="earth",
                topic="historical_earthquake",
                text=text,
                kind="measurement",
                scope="USGS preferred catalog solution for earthquakes of magnitude at least 7.5, 1900 through 2025",
                as_of=snapshot,
                source_id="usgs-earthquake-catalog",
                source_locator=properties["url"],
            )
        )
    return records


def sunspot_records(path: Path, snapshot: date, monthly: bool) -> list[KnowledgeRecord]:
    records = []
    for line in path.read_text().splitlines():
        values = line.split()
        year = int(values[0]) if monthly else int(float(values[0]))
        if year > 2025 or (monthly and year < 2000):
            continue
        period = f"{year}-{int(values[1]):02d}" if monthly else str(year)
        index = number(values[3] if monthly else values[1])
        if index < 0:
            continue
        resolution = "monthly" if monthly else "yearly"
        qualification = (
            " The source marks this value provisional." if "*" in values else ""
        )
        if not monthly and year < 1749:
            qualification += (
                " Early annual means may cover only a fraction of the days in the year."
            )
        records.append(
            KnowledgeRecord(
                record_id=f"observation-sol-sunspots-{period}",
                collection="sol",
                topic="sunspot_observation",
                text=(
                    f"For {period}, SILSO reports a {resolution} mean total "
                    f"International Sunspot Number of {index:g} in version 2.0. "
                    "This dimensionless index combines sunspot groups and individual "
                    "spots with observer calibration. It is not the literal number "
                    f"of spots visible at one moment or a forecast.{qualification}"
                ),
                kind="measurement",
                scope=f"SILSO version 2.0 {resolution} mean total sunspot number",
                as_of=snapshot,
                source_id="silso-sunspot-number-v2",
                source_locator=f"{DOWNLOADS[path.name]} row for {period}",
                entity_name=f"sunspot number {period}",
            )
        )
    return records


def exoplanet_records(path: Path, snapshot: date) -> list[KnowledgeRecord]:
    with path.open(newline="") as stream:
        rows = sorted(
            csv.DictReader(stream),
            key=lambda row: (number(row["sy_dist"]), row["pl_name"]),
        )[:150]
    records = []
    for row in rows:
        if number(row["sy_dist"]) > 20:
            raise ValueError("Exoplanet outside the nearby sample")
        parts = [
            (
                f"{row['pl_name']} is listed as a confirmed exoplanet in the NASA "
                f"Exoplanet Archive, with host {row['hostname']} and discovery method "
                f"{row['discoverymethod']}. Its host-system distance is "
                f"{number(row['sy_dist']):g} parsecs."
            )
        ]
        for column, label, unit in (
            ("pl_orbper", "Orbital period", "days"),
            ("pl_orbsmax", "Orbital semi-major axis", "AU"),
            ("pl_rade", "Planet radius", "Earth radii"),
            ("st_teff", "Host effective temperature", "K"),
        ):
            if not row[column]:
                continue
            bound = {"1": "upper limit ", "-1": "lower limit "}.get(
                row[column + "lim"], ""
            )
            parts.append(f"{label}: {bound}{number(row[column]):g} {unit}.")
        if row["pl_bmasse"]:
            label = (
                "Minimum planet mass M sin i"
                if row["pl_bmassprov"] == "Msini"
                else f"Planet mass ({row['pl_bmassprov']} provenance)"
            )
            bound = {"1": "upper limit ", "-1": "lower limit "}.get(
                row["pl_bmasselim"], ""
            )
            parts.append(f"{label}: {bound}{number(row['pl_bmasse']):g} Earth masses.")
        parts.append(
            "Values come from one default PS solution, omit missing fields, and do not establish habitability or life."
        )
        slug = re.sub(r"[^a-z0-9]+", "-", row["pl_name"].lower()).strip("-")
        reference = re.search(r"href=([^\s>]+)", row["pl_refname"])
        records.append(
            KnowledgeRecord(
                record_id=f"catalog-milky-way-exoplanet-{slug}",
                collection="milky-way",
                topic="exoplanet_profile",
                text=" ".join(parts),
                kind="measurement",
                scope="150 nearest catalog planets with default PS solutions and reported system distance at most 20 parsecs, selected by distance then name",
                as_of=snapshot,
                source_id="nasa-exoplanet-archive-ps",
                source_locator=reference.group(1)
                if reference
                else "PS default solution for " + row["pl_name"],
                entity_name=row["pl_name"],
            )
        )
    return records


def write_records(path: Path, records: list[KnowledgeRecord]) -> None:
    if len({record.record_id for record in records}) != len(records):
        raise ValueError("Duplicate imported record IDs")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(
            record.model_dump_json() + "\n"
            for record in sorted(records, key=lambda record: record.record_id)
        ),
        encoding="utf-8",
    )


def import_corpus(cache: Path, snapshot: date, refresh: bool) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    downloads = []
    for name, url in DOWNLOADS.items():
        path = cache / name
        if refresh or not path.exists():
            with urlopen(
                Request(
                    url, headers={"User-Agent": "PlanetaryScanner reference import"}
                ),
                timeout=90,
            ) as response:
                path.write_bytes(response.read())
        downloads.append(
            {
                "file": name,
                "url": url,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    imports = {
        "surface-features": feature_records(cache / "moon.kmz", "luna", snapshot)
        + feature_records(cache / "mars.kmz", "mars", snapshot),
        "earthquakes": earthquake_records(cache / "earthquakes.json", snapshot),
        "sunspots": sunspot_records(cache / "sunspots.txt", snapshot, False)
        + sunspot_records(cache / "sunspots-monthly.txt", snapshot, True),
        "exoplanets": exoplanet_records(cache / "exoplanets.csv", snapshot),
    }
    for name, records in imports.items():
        write_records(REFERENCE / "corpus" / f"{name}.jsonl", records)
        print(f"Imported {name}: {len(records)} records", flush=True)
    manifest = {
        "schema_version": "1.0",
        "snapshot_date": str(snapshot),
        "downloads": downloads,
        "record_counts": {name: len(records) for name, records in imports.items()},
        "selection": {
            "surface-features": "All IAU-adopted Moon and Mars features excluding lunar satellite letter designations. Each named feature is one record. Zero catalog diameters are unavailable, not measured zero sizes.",
            "earthquakes": "USGS catalog magnitude >=7.5, UTC 1900-01-01 inclusive to 2026-01-01 exclusive. One preferred catalog solution per event. Historical completeness varies.",
            "sunspots": "SILSO v2 yearly means 1700-2025 and monthly means 2000-2025. Different aggregation periods are distinct observations. Missing values and 2026 are excluded.",
            "exoplanets": "150 nearest distinct planets among default PS solutions with reported distance <=20 parsecs, sorted locally by distance then name. Missing measurements are omitted. Bound flags and minimum-mass provenance are retained. This is a sample, not an exoplanet census.",
        },
    }
    (REFERENCE / "corpus" / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
