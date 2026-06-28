# Sample Data

- `sample_data.gpkg`: demo GeoPackage for manual testing.
- Includes vector layers:
  - `sample_points`
  - `sample_lines`
  - `sample_polygons`
- Includes non-spatial attribute table:
  - `asset_inventory`
- Includes raster tile tables with overviews/pyramids:
  - `RASTER_PNG`
  - `RASTER_JPEG`

## Regenerate

- Run from repo root:
  - `uv run samples/generate_sample_gpkg.py`
- The script uses an inline `uv --script` dependency header.

## Ignore rules

- Generated GeoPackages under `samples/*.gpkg` are ignored by Git.
- Temporary files under `samples/.tmp/` are ignored by Git.
- Commit the generator and this README, not the generated binaries.
