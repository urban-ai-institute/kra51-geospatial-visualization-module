"""
One-time: per-dong values for EVERY industry, so the Sales Layer Set can offer
any single industry as a selectable variable (not just the 6 theme groups and
not just the top-20 carried by dong_sales_summary.json).

Reuses the hot/mild day flags from Daily_Weather.csv and the same theme mapping
as prepare_sales_groups.py, so a single industry reads consistently with the
group rings it belongs to.

Output data/dong_industry_sales.json — columnar, all arrays share one index:
  { "industries":  [{key,label,group,retail19},...84],
    "groups":      [{id,label},...6],
    "retailTotal": {key,label,index:84,members:[...19]},
    "max":         {"y":[85],"h":[85],"m":[85]},   # citywide max, for scaling
    "dong": { dong_code: {"y":[85],"h":[85],"m":[85]} } }
  y = year total (sum over 2024)   h = mean on hot days   m = mean on mild days
  Index 0..83 = the 84 industries; index 84 = retail_total (the 19-sector roll-up
  RHSI is built on). `retail19` marks which industries feed that total.

Run manually:  python scripts/prepare_sales_industries.py
"""
import json
import os
import pandas as pd

from prepare_sales_groups import GROUPS, MAP

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UHUS = os.path.normpath(os.path.join(ROOT, "..", "UHUS"))
OUT = os.path.join(ROOT, "data")

CODE_DTYPE = {"gu_code": str, "dong_code": str}

# Hand-friendly labels for the few keys that title-casing gets wrong.
LABEL_OVERRIDES = {
    "lpg_gas": "LPG / gas",
    "door_to_door_mlm_sales": "Door-to-door / MLM sales",
    "indoor_outdoor_golf": "Golf (indoor & outdoor)",
    "general_merchandise_imported": "General merchandise (imported)",
    "interior_building_materials_kitchenware": "Interior / building materials / kitchenware",
    "motel_inn_other_lodging": "Motel / inn / other lodging",
    "office_equipment_stationery": "Office equipment & stationery",
    "toys_kids_bicycles": "Toys / kids' bicycles",
    "fresh_produce_seafood": "Fresh produce & seafood",
    "academy_learning_materials": "Academy & learning materials",
    "funeral_home_cemetery": "Funeral home / cemetery",
    "gift_certificate_lottery": "Gift certificates & lottery",
    "leisure_town_amusement_park": "Leisure town / amusement park",
    "research_translation_service": "Research & translation service",
    "accounting_patent_service": "Accounting & patent service",
    "legal_office_service": "Legal office service",
    "korean_medicine_clinic": "Korean medicine clinic",
    "supermarket_large_format": "Large-format supermarket",
}


# The 19 sectors that sum to retail_total_amount — the "retail" definition RHSI is
# built on (sales_README.md §3-1: the 21 food/retail/fashion categories minus
# butcher_shop and fresh_produce_seafood). Verified to reconcile exactly.
RETAIL_19 = [
    "korean_cuisine", "japanese_cuisine", "western_cuisine", "chinese_cuisine",
    "bakery", "cafe", "fast_food",
    "department_store", "supermarket_large_format", "discount_store", "shopping_mall",
    "chain_grocery", "independent_grocery", "convenience_store",
    "general_merchandise_imported", "liquor_store",
    "apparel", "fashion_accessories", "watches_jewelry",
]


def label_for(key):
    if key in LABEL_OVERRIDES:
        return LABEL_OVERRIDES[key]
    return key.replace("_", " ").capitalize()


print("Reading sales.csv...")
head = pd.read_csv(os.path.join(UHUS, "sales.csv"), nrows=0).columns.tolist()
# retail_total_amount is a roll-up, not an industry — the group rings exclude it too.
industry_cols = [c for c in head if c.endswith("_amount") and c != "retail_total_amount"]
keys = [c[: -len("_amount")] for c in industry_cols]

unmapped = [k for k in keys if k not in MAP]
if unmapped:
    print("  NOTE unmapped industries (group=null):", unmapped)

missing_19 = [k for k in RETAIL_19 if k not in keys]
assert not missing_19, f"RETAIL_19 names not present in sales.csv: {missing_19}"

sales = pd.read_csv(os.path.join(UHUS, "sales.csv"),
                    usecols=["date", "dong_code", "retail_total_amount"] + industry_cols,
                    parse_dates=["date"], dtype=CODE_DTYPE)

# retail_total_amount is the published roll-up; confirm it really is the 19-sector
# sum before we ship it as a selectable variable.
recon = (sales[[k + "_amount" for k in RETAIL_19]].sum(axis=1)
         - sales["retail_total_amount"]).abs().max()
assert recon <= 1.0, f"retail_total_amount != sum of the 19 sectors (max diff {recon})"
print(f"  retail_total reconciles with the 19 sectors (max diff {recon})")

weather = pd.read_csv(os.path.join(UHUS, "Daily_Weather.csv"),
                      usecols=["date", "dong_code", "is_hot", "is_mild"],
                      parse_dates=["date"], dtype=CODE_DTYPE)

merged = sales.merge(weather, on=["date", "dong_code"], how="inner")
print(f"  joined {len(merged):,} dong-days · dongs={merged['dong_code'].nunique()}")

value_cols = industry_cols + ["retail_total_amount"]

year = merged.groupby("dong_code")[value_cols].sum()
hot = merged[merged["is_hot"]].groupby("dong_code")[value_cols].mean()
mild = merged[merged["is_mild"]].groupby("dong_code")[value_cols].mean()

# Every dong that has sales rows appears; a dong with no hot (or mild) day gets 0s
# rather than a ragged array — the client indexes these positionally.
hot = hot.reindex(year.index).fillna(0.0)
mild = mild.reindex(year.index).fillna(0.0)

retail_set = set(RETAIL_19)

out = {
    "industries": [{"key": k, "label": label_for(k), "group": MAP.get(k),
                    "retail19": k in retail_set} for k in keys],
    "groups": [{"id": gid, "label": lbl} for gid, lbl in GROUPS],
    # The published 19-sector roll-up, selectable as its own variable. Its `index`
    # points into the same per-dong arrays, appended after the 84 industries.
    "retailTotal": {"key": "retail_total", "label": "Retail total (19 sectors)",
                    "index": len(keys), "members": RETAIL_19},
    "max": {},
    "dong": {},
}

for dong_code in year.index:
    out["dong"][dong_code] = {
        "y": [round(float(v), 0) for v in year.loc[dong_code, value_cols]],
        "h": [round(float(v), 0) for v in hot.loc[dong_code, value_cols]],
        "m": [round(float(v), 0) for v in mild.loc[dong_code, value_cols]],
    }

for band, frame in (("y", year), ("h", hot), ("m", mild)):
    out["max"][band] = [round(float(v), 0) for v in frame[value_cols].max()]

path = os.path.join(OUT, "dong_industry_sales.json")
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
print(f"wrote dong_industry_sales.json ({os.path.getsize(path)/1024:,.0f} KB) · "
      f"dong={len(out['dong'])} · industries={len(keys)} (+retail_total) · "
      f"retail19={sum(i['retail19'] for i in out['industries'])}")
