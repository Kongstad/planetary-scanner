"""Render the fixed NASA AIA CR2311 numeric map as a display-only globe texture.

Usage: uv run python scripts/render_solar_globe.py /path/to/CR2311.fits
The input comes from the FITS URL documented in frontend/public/sol/README.md.
Only this product's uncompressed primary-image layout is supported.
"""

import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "public" / "sol"


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack("!I", len(data))
        + kind
        + data
        + struct.pack("!I", zlib.crc32(kind + data))
    )


def render(source_path: Path) -> None:
    raw = source_path.read_bytes()
    cards = [raw[index : index + 80].decode("ascii") for index in range(0, 2880, 80)]
    header = {
        card[:8].strip(): card[10:].split("/")[0].strip()
        for card in cards
        if card[8:10] == "= "
    }
    assert header["BITPIX"] == "-64" and header["NAXIS"] == "2"
    assert header["NAXIS1"] == "3600" and header["NAXIS2"] == "1080"
    assert header["CAR_ROT"] == "2311" and float(header["CDELT2"]) > 0
    assert header["BSCALE"] == "1.000000000000E+00" and float(header["BZERO"]) == 0
    assert any(card.startswith("END ") for card in cards)

    values = np.frombuffer(raw, dtype=">f8", count=3600 * 1080, offset=2880).reshape(
        1080, 3600
    )
    # FITS rows increase toward north. PNG rows increase downward. Put longitude
    # 180° at the left edge so the output covers Cesium's −180–180° domain.
    values = np.roll(values[::-1], shift=1800, axis=1)
    valid = np.isfinite(values) & (values > 0)
    low, high = np.percentile(values[valid], [1, 99.5])
    normalized = np.clip(
        (np.log(np.where(valid, values, low)) - np.log(low))
        / (np.log(high) - np.log(low)),
        0,
        1,
    )
    # Gold encodes relative intensity, not temperature.
    stops = np.array([0, 0.2, 0.45, 0.7, 0.9, 1])
    colors = np.array(
        [
            [0, 0, 0],
            [65, 31, 0],
            [150, 93, 0],
            [227, 177, 25],
            [255, 234, 145],
            [255, 255, 245],
        ]
    )
    rgba = np.empty((*values.shape, 4), dtype=np.uint8)
    for channel in range(3):
        rgba[:, :, channel] = np.rint(
            np.interp(normalized, stops, colors[:, channel])
        ).astype(np.uint8)
    rgba[:, :, 3] = np.where(valid, 255, 0)
    scanlines = b"".join(b"\x00" + row.tobytes() for row in rgba)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(
        b"IHDR", struct.pack("!2I5B", 3600, 1080, 8, 6, 0, 0, 0)
    )
    png += png_chunk(b"IDAT", zlib.compress(scanlines, 9)) + png_chunk(b"IEND", b"")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "aia-171-cr2311-globe.png").write_bytes(png)
    metadata = {
        "source_url": "https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0171/CR2311.fits",
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "source_header": header,
        "projection": "linear Carrington longitude and latitude; north up; west -180, east 180",
        "display": "log intensity; clipped at positive finite 1st and 99.5th percentiles; custom gold false-color palette",
        "display_min_counts": float(low),
        "display_max_counts": float(high),
        "missing_pixels": int(np.count_nonzero(~valid)),
        "missing_pixels_display": "transparent, showing the dark globe base",
        "width": 3600,
        "height": 1080,
    }
    (OUTPUT / "aia-171-cr2311-globe.json").write_text(
        json.dumps(metadata, indent=2) + "\n"
    )
    print(
        f"Rendered {len(png):,} bytes; {metadata['missing_pixels']} missing pixels preserved."
    )


if __name__ == "__main__":
    render(Path(sys.argv[1]))
