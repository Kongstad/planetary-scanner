"""Import primary-source research snapshots into the reference corpus."""

import argparse
from datetime import UTC, date, datetime
from pathlib import Path

from planetary_scanner.reference_import import ROOT, import_corpus

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache", type=Path, default=ROOT / "data/downloads/reference-corpus"
    )
    parser.add_argument(
        "--snapshot-date", type=date.fromisoformat, default=datetime.now(UTC).date()
    )
    parser.add_argument("--refresh", action="store_true")
    arguments = parser.parse_args()
    import_corpus(arguments.cache, arguments.snapshot_date, arguments.refresh)
