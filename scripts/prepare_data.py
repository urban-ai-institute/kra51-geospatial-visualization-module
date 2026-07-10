"""
One-time preprocessing: convert the raw UHUS Retail Heat-Sensitivity dataset
into compact static JSON files consumable by the browser prototype.

Run manually:  python scripts/prepare_data.py
Reads from:    ../UHUS/  (sibling of seoulDashboard/seoul-data-atlas)
Writes to:     ./data/
"""
import json
import os
import random
import pandas as pd
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union

random.seed(42)  # reproducible dot-density sampling

DOTS_PER_DONG = 70  # synthesized in-polygon points per dong for the dot-density layer


def sample_points_in_polygon(geom, n, max_tries_factor=40):
    """Rejection-sample n points uniformly inside a (multi)polygon."""
    minx, miny, maxx, maxy = geom.bounds
    pts = []
    tries = 0
    limit = n * max_tries_factor
    while len(pts) < n and tries < limit:
        tries += 1
        p = Point(random.uniform(minx, maxx), random.uniform(miny, maxy))
        if geom.contains(p):
            pts.append([round(p.x, 5), round(p.y, 5)])
    return pts

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UHUS = os.path.normpath(os.path.join(ROOT, "..", "UHUS"))
OUT = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

DONG_SIMPLIFY_TOL = 0.00006   # ~6-7m at Seoul's latitude
GU_SIMPLIFY_TOL = 0.00012


def round_coords(obj, ndigits=5):
    if isinstance(obj, (list, tuple)):
        if len(obj) and isinstance(obj[0], (int, float)):
            return [round(v, ndigits) for v in obj]
        return [round_coords(o, ndigits) for o in obj]
    return obj


def geom_to_json(geom, ndigits=5):
    m = mapping(geom)
    return {"type": m["type"], "coordinates": round_coords(m["coordinates"], ndigits)}


def dump(name, obj):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    size_kb = os.path.getsize(path) / 1024
    print(f"  wrote {name}  ({size_kb:,.0f} KB)")


print("== 1. Geometry ==")
with open(os.path.join(UHUS, "Administrative_Dong_Geometry.geojson"), encoding="utf-8") as f:
    geo = json.load(f)

dong_records = []
dong_points = {}
by_gu = {}
minx = miny = 1e9
maxx = maxy = -1e9

for feat in geo["features"]:
    props = feat["properties"]
    geom = shape(feat["geometry"]).simplify(DONG_SIMPLIFY_TOL, preserve_topology=True)
    if geom.is_empty:
        geom = shape(feat["geometry"])
    c = geom.centroid
    b = geom.bounds
    minx, miny = min(minx, b[0]), min(miny, b[1])
    maxx, maxy = max(maxx, b[2]), max(maxy, b[3])

    dong_records.append({
        "gu_code": props["gu_code"],
        "gu_name": props["gu_name"],
        "dong_code": props["dong_code"],
        "dong_name": props["dong_name"],
        "centroid": [round(c.x, 5), round(c.y, 5)],
        "geometry": geom_to_json(geom),
    })
    by_gu.setdefault(props["gu_code"], {"gu_name": props["gu_name"], "geoms": []})
    by_gu[props["gu_code"]]["geoms"].append(shape(feat["geometry"]))

    # Synthesized in-polygon points for the dot-density layer. Positions are
    # illustrative (uniform inside the dong); the browser shows a count/color
    # proportional to the dong's metric — density conveys the aggregate value.
    dong_points[props["dong_code"]] = sample_points_in_polygon(
        shape(feat["geometry"]), DOTS_PER_DONG)

dump("dong_geometry.json", dong_records)
dump("dong_points.json", dong_points)

gu_records = []
for gu_code, entry in by_gu.items():
    union = unary_union(entry["geoms"]).simplify(GU_SIMPLIFY_TOL, preserve_topology=True)
    c = union.centroid
    gu_records.append({
        "gu_code": gu_code,
        "gu_name": entry["gu_name"],
        "centroid": [round(c.x, 5), round(c.y, 5)],
        "geometry": geom_to_json(union),
    })
dump("gu_geometry.json", gu_records)
dump("meta.json", {"bbox": [round(minx, 5), round(miny, 5), round(maxx, 5), round(maxy, 5)]})

print("== 2. Dong / Gu metrics (RHSI + Urban Features + SHAP) ==")
# gu_code/dong_code come out of the geometry file as strings (from GeoJSON
# properties); force the same string typing here so Map lookups by code
# match across geometry <-> metrics <-> sales files.
CODE_DTYPE = {"gu_code": str, "dong_code": str}
rhsi = pd.read_csv(os.path.join(UHUS, "RHSI.csv"), dtype=CODE_DTYPE)
urban = pd.read_csv(os.path.join(UHUS, "Urban_Features.csv"), dtype=CODE_DTYPE)
shap = pd.read_csv(os.path.join(UHUS, "shap_result.csv"), dtype=CODE_DTYPE)

id_cols = ["gu_name", "gu_code", "dong_name", "dong_code"]
urban_feature_cols = [c for c in urban.columns if c not in id_cols]
shap_cols = [c for c in shap.columns if c not in id_cols]

merged = rhsi.merge(urban, on="dong_code", suffixes=("", "_dup"))
# shap_result.csv is imperfect: it is missing one dong (1162069500) and duplicates
# another (1162066500). Dedupe and LEFT-join so every RHSI dong survives; dongs
# without a SHAP row simply get null contributions (handled as 0 client-side).
shap = shap.drop_duplicates(subset="dong_code", keep="first")
shap_renamed = shap[["dong_code"] + shap_cols].rename(columns={c: f"shap_{c}" for c in shap_cols})
merged = merged.merge(shap_renamed, on="dong_code", how="left")
merged = merged.loc[:, ~merged.columns.str.endswith("_dup")]
assert merged["dong_code"].nunique() == len(merged) == 422, \
    f"expected 422 unique dongs, got {len(merged)} rows / {merged['dong_code'].nunique()} unique"

merged["rhsi_rank"] = merged["RHSI_retail"].rank(ascending=True, method="min").astype(int)
merged = merged.sort_values("dong_code")

dong_metrics = json.loads(merged.round(6).to_json(orient="records"))
dump("dong_metrics.json", dong_metrics)

gu_group = merged.groupby(["gu_code", "gu_name"], as_index=False).agg(
    RHSI_retail=("RHSI_retail", "mean"),
    dong_count=("dong_code", "count"),
)
gu_group["rhsi_rank"] = gu_group["RHSI_retail"].rank(ascending=True, method="min").astype(int)
dump("gu_metrics.json", json.loads(gu_group.round(6).to_json(orient="records")))

print("== 3. Sales x Weather (hot/mild split + gu daily time series) ==")
weather_cols = ["date", "dong_code", "gu_code", "temp_max", "is_hot", "is_mild"]
weather = pd.read_csv(os.path.join(UHUS, "Daily_Weather.csv"), usecols=weather_cols,
                       parse_dates=["date"], dtype=CODE_DTYPE)

sales_all_cols = pd.read_csv(os.path.join(UHUS, "sales.csv"), nrows=0).columns.tolist()
non_industry = {"date", "gu_code", "gu_name", "dong_code", "dong_name", "retail_total_amount"}
industry_cols = [c for c in sales_all_cols if c not in non_industry]

sales = pd.read_csv(os.path.join(UHUS, "sales.csv"),
                     usecols=["date", "dong_code", "gu_code", "retail_total_amount"] + industry_cols,
                     parse_dates=["date"], dtype=CODE_DTYPE)

totals = sales[industry_cols].sum().sort_values(ascending=False)
top20 = totals.head(20).index.tolist()
other_cols = [c for c in industry_cols if c not in top20]
sales["other_amount"] = sales[other_cols].sum(axis=1)

merged_sw = sales.merge(weather[["date", "dong_code", "temp_max", "is_hot", "is_mild"]],
                         on=["date", "dong_code"], how="inner")

# --- 3a. Per-dong hot/mild for top-20 industries (+ total + other) ---
summary_cols = ["retail_total_amount"] + top20 + ["other_amount"]

def hot_mild_summary(df, cols):
    hot = df.loc[df["is_hot"], cols].mean()
    mild = df.loc[df["is_mild"], cols].mean()
    return hot, mild

records = []
for dong_code, g in merged_sw.groupby("dong_code"):
    hot, mild = hot_mild_summary(g, summary_cols)
    rec = {"dong_code": dong_code}
    for col in summary_cols:
        key = col.replace("_amount", "")
        rec[f"{key}_hot"] = None if pd.isna(hot[col]) else round(float(hot[col]), 2)
        rec[f"{key}_mild"] = None if pd.isna(mild[col]) else round(float(mild[col]), 2)
    records.append(rec)

dump("dong_sales_summary.json", records)
dump("industry_catalog.json", {"top20": top20, "other_label": "other"})

# --- 3b. Industry stats for ALL 84 industries at city + each gu scope ---
# Powers the winners/losers diverging chart; small (26 scopes x 84 industries).
def industry_block(df):
    hot, mild = hot_mild_summary(df, industry_cols)
    out = []
    for col in industry_cols:
        h = None if pd.isna(hot[col]) else float(hot[col])
        m = None if pd.isna(mild[col]) else float(mild[col])
        sens = (h - m) / m if (h is not None and m not in (None, 0)) else None
        out.append({
            "key": col.replace("_amount", ""),
            "hot": None if h is None else round(h, 2),
            "mild": None if m is None else round(m, 2),
            "sensitivity": None if sens is None else round(sens, 4),
            "volume": round(float(df[col].sum()), 0),
        })
    return out

industry_stats = {"city": industry_block(merged_sw)}
for gu_code, g in merged_sw.groupby("gu_code"):
    industry_stats[gu_code] = industry_block(g)
dump("industry_stats.json", industry_stats)

gu_daily = merged_sw.groupby(["gu_code", "date"], as_index=False).agg(
    retail_total_amount=("retail_total_amount", "sum"),
    temp_max=("temp_max", "mean"),
)
gu_ts = {}
for gu_code, g in gu_daily.groupby("gu_code"):
    g = g.sort_values("date")
    gu_ts[gu_code] = [
        {"date": d.strftime("%Y-%m-%d"), "temp_max": round(float(t), 1), "retail_total_amount": round(float(r), 0)}
        for d, t, r in zip(g["date"], g["temp_max"], g["retail_total_amount"])
    ]
dump("gu_daily_timeseries.json", gu_ts)

print("Done.")
