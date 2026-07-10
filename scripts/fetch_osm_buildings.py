"""
One-time fetch: Seoul building footprints from OpenStreetMap (Overpass API),
for the G4 building base extrusion layer. Static city fabric, not data-driven.

Scope: Seoul only (25 gu). Citywide queries time out on Overpass, so we fetch
per-gu bounding boxes from gu_geometry.json and dedupe by OSM way id.

Run manually:  python scripts/fetch_osm_buildings.py
                python scripts/fetch_osm_buildings.py --resume
Writes to:     ./data/buildings.json  (GeoJSON FeatureCollection)
"""
import argparse
import json
import os
import re
import sys
import time
import requests
from shapely.geometry import Polygon, mapping, shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HEADERS = {"User-Agent": "SeoulDataAtlas/1.0 (research prototype)"}

SIMPLIFY_TOL = 0.00004  # ~4-5 m at Seoul latitude
SLEEP_SEC = 18
MIN_AREA = 1e-9
MAX_RETRIES = 5
RETRY_WAIT = 30  # seconds, multiplied by attempt index on 429/504

HEIGHT_BY_TYPE = {
    "residential": (12, 45),
    "house": (8, 15),
    "apartments": (20, 60),
    "detached": (8, 15),
    "terrace": (10, 20),
    "commercial": (15, 80),
    "retail": (12, 40),
    "office": (25, 80),
    "industrial": (8, 25),
    "warehouse": (8, 20),
    "public": (10, 50),
    "school": (10, 30),
    "university": (15, 45),
    "hospital": (15, 50),
    "hotel": (30, 80),
    "church": (15, 40),
    "cathedral": (25, 60),
    "garage": (4, 8),
    "shed": (3, 6),
    "roof": (3, 8),
}


def log(msg):
    print(msg, flush=True)


def round_coords(obj, ndigits=5):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(v, ndigits) for v in obj]
        return [round_coords(o, ndigits) for o in obj]
    return obj


def gu_bbox(gu_geom):
    g = shape(gu_geom)
    minx, miny, maxx, maxy = g.bounds
    return (miny, minx, maxy, maxx)  # south, west, north, east for Overpass


def parse_height(tags, osm_id):
    raw = tags.get("height")
    if raw:
        m = re.match(r"([\d.]+)", str(raw))
        if m:
            val = float(m.group(1))
            if "ft" in str(raw).lower() or "'" in str(raw):
                val *= 0.3048
            return round(val, 1)

    levels = tags.get("building:levels") or tags.get("levels")
    if levels:
        try:
            n = float(str(levels).replace("+", "").split(";")[0].split(",")[0])
            return round(n * 3, 1)
        except ValueError:
            pass

    bt = (tags.get("building") or "yes").lower()
    lo, hi = HEIGHT_BY_TYPE.get(bt, (9, 24))
    t = (osm_id * 2654435761) % 1000 / 1000
    return round(lo + t * (hi - lo), 1)


def way_to_polygon(geometry):
    coords = [(pt["lon"], pt["lat"]) for pt in geometry]
    if len(coords) < 3:
        return None
    poly = Polygon(coords)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty or poly.area < MIN_AREA:
        return None
    poly = poly.simplify(SIMPLIFY_TOL, preserve_topology=True)
    if poly.is_empty or poly.area < MIN_AREA:
        return None
    return poly


def fetch_gu(south, west, north, east):
    q = (
        f"[out:json][timeout:180];"
        f'way["building"]({south},{west},{north},{east});'
        f"out geom;"
    )
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        url = OVERPASS_URLS[(attempt - 1) % len(OVERPASS_URLS)]
        try:
            r = requests.post(
                url, data={"data": q}, headers=HEADERS, timeout=200
            )
            if r.status_code in (429, 504):
                wait = RETRY_WAIT * attempt
                log(f"  {r.status_code} from {url.split('/')[2]}, retry in {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()["elements"]
        except requests.RequestException as exc:
            last_err = exc
            wait = RETRY_WAIT * attempt
            log(f"  error ({exc}), retry in {wait}s...")
            time.sleep(wait)
    raise last_err


def load_existing(path):
    if not os.path.exists(path):
        return [], set()
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    features = data.get("features", [])
    seen = set()
    for feat in features:
        # no osm id stored yet; dedupe only within this run via seen_ids during fetch
        pass
    return features, seen


def save_collection(path, features):
    collection = {"type": "FeatureCollection", "features": features}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(collection, f, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--resume",
        action="store_true",
        help="keep existing buildings.json features and only fetch missing gu",
    )
    args = parser.parse_args()

    out_path = os.path.join(OUT, "buildings.json")
    progress_path = os.path.join(OUT, "buildings_fetch_progress.json")

    with open(os.path.join(OUT, "gu_geometry.json"), encoding="utf-8") as f:
        gu_list = json.load(f)

    if args.resume and os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            features = json.load(f).get("features", [])
        done_gu = set()
        if os.path.exists(progress_path):
            with open(progress_path, encoding="utf-8") as f:
                done_gu = set(json.load(f).get("completed_gu", []))
        log(f"resume: {len(features):,} existing features, {len(done_gu)} gu marked done")
    else:
        features = []
        done_gu = set()

    seen_ids = set()
    for feat in features:
        # rebuild seen from geometry hash is unreliable; track gu completion instead
        pass

    skipped_total = 0

    for i, gu in enumerate(gu_list):
        name = gu["gu_name"]
        if name in done_gu:
            log(f"[{i + 1}/{len(gu_list)}] {name} - skip (already done)")
            continue

        if i and not args.resume:
            time.sleep(SLEEP_SEC)
        elif done_gu:
            time.sleep(SLEEP_SEC)

        bbox = gu_bbox(gu["geometry"])
        log(f"[{i + 1}/{len(gu_list)}] {name} ...")
        try:
            elements = fetch_gu(*bbox)
        except requests.RequestException as exc:
            log(f"  FAILED after retries: {exc}")
            continue

        added = 0
        local_seen = set()
        for el in elements:
            if el.get("type") != "way" or "geometry" not in el:
                continue
            oid = el["id"]
            if oid in local_seen:
                continue
            local_seen.add(oid)

            poly = way_to_polygon(el["geometry"])
            if poly is None:
                skipped_total += 1
                continue

            tags = el.get("tags", {})
            props = {"h": parse_height(tags, oid)}
            bt = tags.get("building")
            if bt and bt != "yes":
                props["b"] = bt

            geom = mapping(poly)
            geom["coordinates"] = round_coords(geom["coordinates"])
            features.append(
                {"type": "Feature", "properties": props, "geometry": geom}
            )
            added += 1

        done_gu.add(name)
        save_collection(out_path, features)
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump({"completed_gu": sorted(done_gu)}, f)

        log(f"  {len(elements)} ways -> {added} features (total {len(features):,})")

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    log(
        f"\nwrote buildings.json  {len(features):,} features  "
        f"({size_mb:.1f} MB)  skipped {skipped_total:,} degenerate  "
        f"completed {len(done_gu)}/{len(gu_list)} gu"
    )
    if len(done_gu) < len(gu_list):
        missing = [g["gu_name"] for g in gu_list if g["gu_name"] not in done_gu]
        log(f"still missing: {', '.join(missing)}")
        log("re-run:  python scripts/fetch_osm_buildings.py --resume")
        sys.exit(1)


if __name__ == "__main__":
    main()
