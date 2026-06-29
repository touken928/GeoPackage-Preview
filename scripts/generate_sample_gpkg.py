#!/usr/bin/env -S uv run --script
# /// script
# dependencies = [
#   "geopandas",
#   "numpy",
#   "pandas",
#   "pillow",
#   "rasterio",
#   "shapely",
# ]
# ///

from __future__ import annotations

import sqlite3
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling
from rasterio.shutil import copy as rio_copy
from rasterio.transform import from_bounds
from shapely.geometry import LineString, Point, Polygon


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SAMPLES_DIR = REPO_ROOT / "samples"
GPKG_PATH = SAMPLES_DIR / "sample_data.gpkg"
WORK_DIR = SAMPLES_DIR / ".tmp"


def reset_workspace() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    if GPKG_PATH.exists():
        GPKG_PATH.unlink()


def build_vector_layers() -> None:
    points_wgs84 = gpd.GeoDataFrame(
        {
            "name": ["Station Alpha", "Station Beta", "Station Gamma"],
            "category": ["sensor", "station", "hub"],
            "elevation_m": [15, 42, 8],
        },
        geometry=[
            Point(121.4705, 31.2304),
            Point(121.4922, 31.2411),
            Point(121.4558, 31.2147),
        ],
        crs="EPSG:4326",
    )

    lines_wgs84 = gpd.GeoDataFrame(
        {
            "route_name": ["River Walk", "North Connector"],
            "surface": ["paved", "gravel"],
            "speed_limit": [20, 35],
        },
        geometry=[
            LineString([(121.445, 31.222), (121.462, 31.229), (121.485, 31.238)]),
            LineString([(121.458, 31.205), (121.473, 31.219), (121.498, 31.233)]),
        ],
        crs="EPSG:4326",
    )

    polygons_wgs84 = gpd.GeoDataFrame(
        {
            "zone_name": ["Central Park", "Warehouse Block"],
            "land_use": ["green", "industrial"],
            "priority": [1, 2],
        },
        geometry=[
            Polygon([(121.452, 31.226), (121.468, 31.226), (121.468, 31.238), (121.452, 31.238)]),
            Polygon([(121.479, 31.214), (121.497, 31.214), (121.497, 31.227), (121.479, 31.227)]),
        ],
        crs="EPSG:4326",
    )

    points_web_mercator = points_wgs84.to_crs("EPSG:3857")
    points_web_mercator["source_crs"] = "EPSG:3857"

    lines_utm_51n = lines_wgs84.to_crs("EPSG:32651")
    lines_utm_51n["source_crs"] = "EPSG:32651"

    polygons_cgcs2000 = polygons_wgs84.to_crs("EPSG:4490")
    polygons_cgcs2000["source_crs"] = "EPSG:4490"

    first_mode = "a" if GPKG_PATH.exists() else "w"

    points_wgs84.to_file(GPKG_PATH, layer="sample_points", driver="GPKG", mode=first_mode)
    lines_wgs84.to_file(GPKG_PATH, layer="sample_lines", driver="GPKG", mode="a")
    polygons_wgs84.to_file(GPKG_PATH, layer="sample_polygons", driver="GPKG", mode="a")
    points_web_mercator.to_file(GPKG_PATH, layer="sample_points_3857", driver="GPKG", mode="a")
    lines_utm_51n.to_file(GPKG_PATH, layer="sample_lines_32651", driver="GPKG", mode="a")
    polygons_cgcs2000.to_file(GPKG_PATH, layer="sample_polygons_4490", driver="GPKG", mode="a")


def build_attribute_table() -> None:
    attributes = pd.DataFrame(
        {
            "asset_id": [1001, 1002, 1003, 1004],
            "asset_name": ["Pump-A", "Pump-B", "Valve-C", "Sensor-D"],
            "status": ["online", "offline", "maintenance", "online"],
            "updated_at": ["2026-06-01", "2026-06-05", "2026-06-11", "2026-06-12"],
        }
    )

    with sqlite3.connect(GPKG_PATH) as conn:
        attributes.to_sql("asset_inventory", conn, if_exists="replace", index=False)
        conn.execute(
            """
            INSERT OR REPLACE INTO gpkg_contents
            (table_name, data_type, identifier, description, last_change)
            VALUES (?, 'attributes', ?, ?, datetime('now'))
            """,
            ("asset_inventory", "asset_inventory", "Non-spatial attribute table"),
        )
        conn.commit()


def create_png(path: Path, size: int = 512) -> None:
    image = Image.new("RGBA", (size, size), (234, 242, 255, 255))
    draw = ImageDraw.Draw(image)

    for idx in range(0, size, 32):
        color = (210 - (idx % 96), 220, 235 + (idx % 16), 255)
        draw.line([(idx, 0), (idx, size)], fill=color, width=1)
        draw.line([(0, idx), (size, idx)], fill=color, width=1)

    draw.ellipse((70, 90, 220, 240), fill=(248, 183, 198, 220), outline=(80, 80, 80, 255), width=3)
    draw.rectangle((250, 120, 430, 280), fill=(137, 194, 247, 220), outline=(40, 40, 40, 255), width=3)
    draw.polygon([(140, 350), (240, 260), (360, 340), (290, 440), (170, 430)], fill=(168, 216, 185, 220), outline=(30, 30, 30, 255))

    image.save(path, format="PNG")


def create_jpeg(path: Path, size: int = 512) -> None:
    image = Image.new("RGB", (size, size), (245, 231, 214))
    draw = ImageDraw.Draw(image)

    for idx in range(size):
        shade = int(180 + 50 * idx / size)
        draw.line([(0, idx), (size, idx)], fill=(shade, 205, 160))

    draw.rectangle((60, 70, 210, 210), fill=(244, 167, 185), outline=(60, 60, 60), width=3)
    draw.ellipse((260, 80, 430, 250), fill=(198, 176, 245), outline=(50, 50, 50), width=3)
    draw.polygon([(120, 320), (240, 260), (420, 410), (220, 450)], fill=(247, 215, 148), outline=(20, 20, 20))

    image.save(path, format="JPEG", quality=92)


def write_raster(input_image: Path, output_tif: Path) -> None:
    with Image.open(input_image) as image:
        array = np.array(image)

    if array.ndim == 2:
        array = np.expand_dims(array, axis=-1)

    height, width = array.shape[0], array.shape[1]
    bounds = (121.42, 31.19, 121.53, 31.29)
    transform = from_bounds(*bounds, width=width, height=height)
    band_count = array.shape[2]

    with rasterio.open(
        output_tif,
        "w",
        driver="GTiff",
        width=width,
        height=height,
        count=band_count,
        dtype=array.dtype,
        crs="EPSG:4326",
        transform=transform,
    ) as dst:
        for band_index in range(band_count):
            dst.write(array[:, :, band_index], band_index + 1)
        dst.build_overviews([2, 4], Resampling.nearest)
        dst.update_tags(ns="rio_overview", resampling="nearest")


def build_raster_layers() -> None:
    png_path = WORK_DIR / "sample_png.png"
    jpg_path = WORK_DIR / "sample_jpeg.jpg"
    png_tif = WORK_DIR / "sample_png.tif"
    jpg_tif = WORK_DIR / "sample_jpeg.tif"

    create_png(png_path)
    create_jpeg(jpg_path)
    write_raster(png_path, png_tif)
    write_raster(jpg_path, jpg_tif)

    rio_copy(
        png_tif,
        GPKG_PATH,
        driver="GPKG",
        raster_table="raster_png",
        TILE_FORMAT="PNG",
        APPEND_SUBDATASET="NO",
    )
    rio_copy(
        jpg_tif,
        GPKG_PATH,
        driver="GPKG",
        raster_table="raster_jpeg",
        TILE_FORMAT="JPEG",
        QUALITY=92,
        APPEND_SUBDATASET="YES",
    )


def main() -> None:
    reset_workspace()
    build_raster_layers()
    build_vector_layers()
    build_attribute_table()
    print(f"Created sample GeoPackage: {GPKG_PATH}")


if __name__ == "__main__":
    main()
