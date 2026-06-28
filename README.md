<h1 align="center">GeoPackage Preview</h1>

<p align="center">
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS_Code-1.85+-blue?style=flat&logo=visualstudiocode" alt="VS Code"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-blue?style=flat" alt="Apache 2.0"></a>
  <a href="https://github.com/touken928/GeoPackage-Preview/releases"><img src="https://img.shields.io/github/v/release/touken928/GeoPackage-Preview?style=flat&logo=github" alt="release"></a>
  <a href="https://github.com/touken928/GeoPackage-Preview/stargazers"><img src="https://img.shields.io/github/stars/touken928/GeoPackage-Preview?style=flat&color=yellow&logo=github" alt="stars"></a>
</p>

A VSCode extension for previewing `GeoPackage` (`.gpkg`) files.

It opens `.gpkg` files directly inside VSCode and provides a base map, layer list, attribute table, and feature interaction workflow.

## Features

- Read-only preview for `.gpkg` files
- OpenStreetMap base map
- Lists vector tables and tile tables inside a GeoPackage
- Supports displaying multiple vector layers at the same time
- Supports reordering vector layers
- Supports layer visibility toggling
- Clicking a map feature syncs to the attribute table
- Clicking the attribute table syncs selection on the map
- Supports zooming to layers and features
- Supports collapsing the left sidebar and lower details pane
- Supports dragging to resize the left sidebar width and lower details pane height

## Current Behavior

- Vector layers are previewable on the map
- Tile layers are listed as metadata only and are not rendered
- The attribute table shows all records for the currently active layer
- Map and attribute table selection stay synchronized

## Known Limitations

- The current version is read-only and does not write back to GeoPackage files
- Large file protection is enabled; `.gpkg` files larger than `50 MB` are rejected
- Some non-standard CRS values are best-effort only; unsupported layers are reported and skipped
- The attribute table does not use virtualization yet, so very large tables may affect performance

## License

This project is licensed under the `Apache License 2.0`. See `LICENSE`.
