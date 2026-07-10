"""
One-time: aggregate UHUS/sales.csv (daily per-dong per-industry) into compact
per-gu, per-theme-group daily sales for the time-flow sales rings.

Maps the ~85 industry columns into 6 theme groups (UHUS spec), sums by
[gu_code, date]. Output data/gu_group_daily.json:
  { "groups": [{id,label},...], "year_max": [...6],
    "gu": { gu_code: [ {date, g:[6 sums]} , ... 366 ] } }

Run manually:  python scripts/prepare_sales_groups.py
"""
import json
import os
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UHUS = os.path.normpath(os.path.join(ROOT, "..", "UHUS"))
OUT = os.path.join(ROOT, "data")

# 6 theme groups (order fixed → drives the g:[...] array + colors client-side).
GROUPS = [
    ("fnb",     "Food & Beverage"),
    ("retail",  "Retail & Daily Goods"),
    ("fashion", "Fashion / Beauty"),
    ("health",  "Health / Edu / Culture"),
    ("leisure", "Leisure / Mobility / Lodging"),
    ("housing", "Housing / Professional / Local"),
]
GROUP_INDEX = {gid: i for i, (gid, _) in enumerate(GROUPS)}

# industry (without _amount) -> group id
MAP = {
    # Food & Beverage
    "korean_cuisine": "fnb", "japanese_cuisine": "fnb", "western_cuisine": "fnb",
    "chinese_cuisine": "fnb", "bakery": "fnb", "cafe": "fnb", "fast_food": "fnb",
    "other_food": "fnb", "other_food_service": "fnb", "liquor_store": "fnb",
    # Retail & Daily Goods
    "department_store": "retail", "supermarket_large_format": "retail", "discount_store": "retail",
    "shopping_mall": "retail", "chain_grocery": "retail", "independent_grocery": "retail",
    "convenience_store": "retail", "general_merchandise_imported": "retail",
    "fresh_produce_seafood": "retail", "butcher_shop": "retail", "home_appliances": "retail",
    "furniture": "retail", "other_distribution": "retail", "chain_store": "retail",
    "brand_exclusive_store": "retail", "office_equipment_stationery": "retail",
    "handmade_goods_store": "retail", "gift_certificate_lottery": "retail",
    # Fashion / Beauty / Personal
    "apparel": "fashion", "fashion_accessories": "fashion", "watches_jewelry": "fashion",
    "cosmetics": "fashion", "hair_salon": "fashion", "beauty_service": "fashion",
    "massage_spa": "fashion", "sauna_bathhouse": "fashion", "laundry_dry_cleaner": "fashion",
    "door_to_door_mlm_sales": "fashion",
    # Health / Education / Culture
    "pharmacy": "health", "general_hospital": "health", "general_clinic": "health",
    "dental_clinic": "health", "korean_medicine_clinic": "health", "public_health_center": "health",
    "other_medical": "health", "veterinary_clinic": "health",
    "academy_learning_materials": "health", "school_tuition": "health", "study_room": "health",
    "kindergarten": "health", "books": "health", "bookstore": "health", "cultural_goods": "health",
    "movie_performance": "health", "instruments_records": "health", "computer_software": "health",
    # Leisure / Mobility / Lodging
    "gym": "leisure", "sports_facility": "leisure", "sports_leisure_goods": "leisure",
    "indoor_outdoor_golf": "leisure", "leisure_town_amusement_park": "leisure",
    "game_room_arcade": "leisure", "karaoke": "leisure", "entertainment_venue": "leisure",
    "motel_inn_other_lodging": "leisure", "hotel_condo": "leisure", "gas_station": "leisure",
    "parking_lot": "leisure", "auto_service": "leisure", "auto_accessories": "leisure",
    "used_car_dealer": "leisure", "motorcycle": "leisure", "toys_kids_bicycles": "leisure",
    "lpg_gas": "leisure",
    # Housing / Professional / Local
    "real_estate_agency": "housing", "interior_building_materials_kitchenware": "housing",
    "legal_office_service": "housing", "accounting_patent_service": "housing",
    "research_translation_service": "housing", "wedding_hall_service": "housing",
    "funeral_home_cemetery": "housing", "pet_shop": "housing", "flower_shop": "housing",
    "used_goods_store": "housing",
}

print("Reading sales.csv...")
head = pd.read_csv(os.path.join(UHUS, "sales.csv"), nrows=0).columns.tolist()
industry_cols = [c for c in head if c.endswith("_amount") and c != "retail_total_amount"]

usecols = ["date", "gu_code", "dong_code"] + industry_cols
sales = pd.read_csv(os.path.join(UHUS, "sales.csv"), usecols=usecols,
                    dtype={"gu_code": str, "dong_code": str}, parse_dates=["date"])

# build 6 group-sum columns
for gid, _ in GROUPS:
    members = [c for c in industry_cols if MAP.get(c[:-len("_amount")]) == gid]
    sales["grp_" + gid] = sales[members].sum(axis=1)

unmapped = [c[:-len("_amount")] for c in industry_cols
            if c[:-len("_amount")] not in MAP]
if unmapped:
    print("  NOTE unmapped industries (ignored):", unmapped)

grp_cols = ["grp_" + gid for gid, _ in GROUPS]

# ---- gu-level (whole-Seoul rings) : {date,g} rows keyed by gu_code ----
agg = sales.groupby(["gu_code", "date"], as_index=False)[grp_cols].sum().sort_values(["gu_code", "date"])
out = {"groups": [{"id": gid, "label": lbl} for gid, lbl in GROUPS], "gu": {}}
year_max = [0.0] * len(GROUPS)
for gu_code, g in agg.groupby("gu_code"):
    rows = []
    for _, r in g.iterrows():
        vals = [round(float(r[c]), 0) for c in grp_cols]
        for i, v in enumerate(vals):
            year_max[i] = max(year_max[i], v)
        rows.append({"date": r["date"].strftime("%Y-%m-%d"), "g": vals})
    out["gu"][gu_code] = rows
out["year_max"] = year_max
p1 = os.path.join(OUT, "gu_group_daily.json")
with open(p1, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"))
print(f"wrote gu_group_daily.json ({os.path.getsize(p1)/1024:,.0f} KB) · gu={len(out['gu'])}")

# ---- dong-level (rings when drilled into a gu) : compact [[6]/day] per dong ----
# Drop dates (shared 366-day axis via Atlas.timeDates); store value arrays only.
aggd = sales.groupby(["dong_code", "date"], as_index=False)[grp_cols].sum().sort_values(["dong_code", "date"])
dout = {"year_max": [0.0] * len(GROUPS), "dong": {}}
for dong_code, g in aggd.groupby("dong_code"):
    series = []
    for _, r in g.iterrows():
        vals = [round(float(r[c]), 0) for c in grp_cols]
        for i, v in enumerate(vals):
            dout["year_max"][i] = max(dout["year_max"][i], v)
        series.append(vals)
    dout["dong"][dong_code] = series
p2 = os.path.join(OUT, "dong_group_daily.json")
with open(p2, "w", encoding="utf-8") as f:
    json.dump(dout, f, separators=(",", ":"))
print(f"wrote dong_group_daily.json ({os.path.getsize(p2)/1024:,.0f} KB) · dong={len(dout['dong'])} · gu_year_max={[round(v/1e8,1) for v in year_max]}억")
