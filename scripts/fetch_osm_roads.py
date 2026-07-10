"""
One-time fetch: real Seoul road geometry from OpenStreetMap (via Overpass API),
for the night-view "road glow" layer. Static city fabric, not data-driven.

Scope note: citywide residential/minor roads time out Overpass (too many ways
for one query — confirmed via a live `out count;` probe). This pass fetches
only the arterial and mid tiers; a minor-road tier could be added later via
per-gu queries if wanted.

Run manually:  python scripts/fetch_osm_roads.py
Writes to:     ./data/roads.json
"""
import json
import os
import time
import requests
from shapely.geometry import LineString

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
HEADERS = {"User-Agent": "SeoulDataAtlas/1.0 (research prototype)"}

with open(os.path.join(OUT, "meta.json"), encoding="utf-8") as f:
    minx, miny, maxx, maxy = json.load(f)["bbox"]
BBOX = (miny, minx, maxy, maxx)  # Overpass wants (south, west, north, east)

TIERS = {
    "arterial": "motorway|motorway_link|trunk|trunk_link|primary|primary_link",
    "mid": "secondary|secondary_link|tertiary|tertiary_link",
}
SIMPLIFY_TOL = 0.00006


def fetch_tier(highway_filter):
    q = (
        f'[out:json][timeout:120];'
        f'way["highway"~"^({highway_filter})$"]'
        f'({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});'
        f'out geom;'
    )
    r = requests.post(OVERPASS_URL, data={"data": q}, headers=HEADERS, timeout=150)
    r.raise_for_status()
    return r.json()["elements"]


def simplify_way(geometry):
    coords = [(pt["lon"], pt["lat"]) for pt in geometry]
    if len(coords) < 2:
        return None
    line = LineString(coords).simplify(SIMPLIFY_TOL, preserve_topology=False)
    if line.is_empty:
        return None
    return [[round(x, 5), round(y, 5)] for x, y in line.coords]


roads = {}
for i, (tier, filt) in enumerate(TIERS.items()):
    if i:
        time.sleep(5)  # be polite to the public Overpass instance
    print(f"Fetching {tier}...")
    elements = fetch_tier(filt)
    paths = []
    for el in elements:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        simplified = simplify_way(el["geometry"])
        if simplified:
            paths.append(simplified)
    roads[tier] = paths
    print(f"  {tier}: {len(elements)} ways -> {len(paths)} simplified paths")

path = os.path.join(OUT, "roads.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(roads, f, separators=(",", ":"))
print(f"wrote roads.json ({os.path.getsize(path) / 1024:,.0f} KB)")
