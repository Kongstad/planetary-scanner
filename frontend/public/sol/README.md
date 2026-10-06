# Solar globe display map

`aia-171-cr2311-globe.png` is a display rendering of the NASA/SDO AIA 171 Å numeric synoptic map for Carrington rotation 2311, retrieved October 6, 2026. It is an application rendering, rather than the original NASA browse plot.

- Image: https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0171/CR2311.png
- Companion metadata: https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0171/CR2311.fits
- Archive: https://sdo.gsfc.nasa.gov/data/synoptic/
- Attribution: Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams.
- Data-use guidance: https://sdo.gsfc.nasa.gov/data/rules.php

The FITS header gives rotation start May 12, 2026, stop June 9, 2026, and center May 26, 2026 (TAI). The map has linear Carrington longitude 0–360° and latitude −90–90°. This is a false-color time composite for exploration, not quantitative analysis or a live far-side measurement.

The rendering reads the uncompressed 3,600 × 1,080 primary FITS array, reverses rows to put north at the top, and shifts longitude by 180° for Cesium's −180–180° domain. It applies log intensity scaling between the positive finite 1st and 99.5th percentiles and a custom gold display palette. Missing or nonpositive values remain transparent. The globe uses the reference solar radius of 695,700 km.

The initial view faces Carrington longitude 180°. Differences across the rotation's time boundary are retained. No seam blending or synthetic filling is applied.

`aia-171-cr2311-globe.json` records the original header, source checksum, normalization limits, and missing-pixel count. Reproduce the PNG with `uv run python scripts/render_solar_globe.py /path/to/CR2311.fits`. The generated display image contains no axes, labels, inferred far-side pixels, or additional detail beyond the input map.
