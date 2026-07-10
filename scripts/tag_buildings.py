"""
One-time post-process: spatially tag each building in data/buildings.json with
its gu (and dong) code, so the map can render only a drilled region's buildings
(264k polygons can't all draw citywide). Uses a shapely STRtree for speed.

Run manually:  python scripts/tag_buildings.py
Rewrites:      ./data/buildings.json  (adds properties.gu / properties.dong)
"""
import json
import os
from shapely.geometry import shape, Point
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


print("Loading geometry + buildings...")
gu = load("gu_geometry.json")
dong = load("dong_geometry.json")
buildings = load("buildings.json")

gu_polys = [shape(g["geometry"]) for g in gu]
gu_codes = [g["gu_code"] for g in gu]
dong_polys = [shape(d["geometry"]) for d in dong]
dong_codes = [d["dong_code"] for d in dong]

gu_tree = STRtree(gu_polys)
dong_tree = STRtree(dong_polys)

feats = buildings["features"]
print(f"Tagging {len(feats):,} buildings...")

tagged = 0
for i, f in enumerate(feats):
    if i and i % 40000 == 0:
        print(f"  {i:,} / {len(feats):,}")
    geom = shape(f["geometry"])
    c = geom.representative_point()  # guaranteed inside the polygon
    # gu: nearest candidate whose polygon actually contains the centroid
    guc = None
    for idx in gu_tree.query(c):
        if gu_polys[idx].contains(c):
            guc = gu_codes[idx]
            break
    dongc = None
    for idx in dong_tree.query(c):
        if dong_polys[idx].contains(c):
            dongc = dong_codes[idx]
            break
    f["properties"]["gu"] = guc
    f["properties"]["dong"] = dongc
    if guc:
        tagged += 1

path = os.path.join(DATA, "buildings.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(buildings, f, separators=(",", ":"))
size_mb = os.path.getsize(path) / 1024 / 1024
print(f"Done. tagged {tagged:,}/{len(feats):,} with a gu · buildings.json {size_mb:,.1f} MB")
