// UHUS right panel — Detail (Project → Lineage → Dataset → Tag) + Recommend Set.
// Structure/design from uhus_tabs_rebuilt_original_detail_visible.html; content is
// filled from the REAL datasets (Data_schema.csv + column lists). Selections drive
// the already-built map via the global `map` / app helpers (see applySelection).

const ICONS = {
  sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/></svg>`,
  sales: `<svg viewBox="0 0 24 24"><path d="M4 18V9"/><path d="M10 18V5"/><path d="M16 18v-7"/><path d="M22 18v-4"/><path d="M2 18h20"/></svg>`,
  map: `<svg viewBox="0 0 24 24"><path d="M4 6l6-2 4 2 6-2v14l-6 2-4-2-6 2z"/><path d="M10 4v14"/><path d="M14 6v14"/></svg>`,
  pin: `<svg viewBox="0 0 24 24"><path d="M12 21s-6-5.7-6-10a6 6 0 0 1 12 0c0 4.3-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>`,
  thermometer: `<svg viewBox="0 0 24 24"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/><path d="M12 9v7"/></svg>`,
  flag: `<svg viewBox="0 0 24 24"><path d="M6 3v18"/><path d="M6 6c2-1.5 4-.5 6 .5s4 2 6 .5v8c-2 1.5-4 .5-6-.5s-4-2-6-.5"/></svg>`,
  building: `<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V9l7-4 7 4v12"/><path d="M9 21v-6h6v6"/></svg>`,
  mobility: `<svg viewBox="0 0 24 24"><path d="M5 18h10"/><path d="M13 6l6 6-6 6"/><path d="M5 6h6"/></svg>`,
  chart: `<svg viewBox="0 0 24 24"><path d="M4 17l5-5 4 4 7-9"/><path d="M4 4v16h16"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><path d="M8 3v3M16 3v3"/><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M9 14h2M13 14h2"/></svg>`,
  dashboard: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/></svg>`,
  profile: `<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M3 12h18"/><path d="M5 19l14-14"/></svg>`,
};

// ---- Variable metadata straight from UHUS/Data_schema.csv (definition/formula/unit/source) ----
// [definition, formula, unit, source, sourceType, datasetId]
const VARIABLE_META = {
  date: ["Observation date", "—", "date (YYYY-MM-DD)", "—", "—", "weather"],
  temp_max: ["Daily maximum air temperature for each dong", "Max of hourly air temperature at dong-date level", "°C", "Korea Meteorological Administration (KMA)", "Raw", "weather"],
  precip_sum: ["Daily total precipitation for each dong", "Sum of hourly precipitation at dong-date level", "mm", "KMA", "Raw", "weather"],
  humid_max: ["Daily maximum relative humidity for each dong", "Max of hourly relative humidity at dong-date level", "%", "KMA", "Raw", "weather"],
  apptemp_max: ["Daily maximum apparent temperature for each dong", "Max of hourly apparent temperature (KMA summer formula)", "°C", "KMA", "Processed", "heatfeature"],
  is_mild: ["Indicator for mild days", "apptemp 18–26°C, non-holiday, zero precipitation", "bool", "KMA", "Processed", "heatfeature"],
  is_hot: ["Indicator for heat days (apptemp ≥ 33°C)", "apptemp_max ≥ 33°C", "bool", "KMA", "Processed", "heatfeature"],
  is_holiday: ["Indicator for public holidays", "date is a public holiday", "bool", "—", "—", "heatfeature"],
  RHSI_retail: ["Retail heat-sensitivity index at the 33°C threshold", "log(mean retail sales on hot days ÷ mean on mild days)", "log-ratio", "Seoul AI Foundation; KMA", "Processed", "rhsi"],
  n_hot_days: ["Number of heat days for each dong", "Count of dong-days with is_hot = True", "days", "KMA", "Processed", "heatdays"],
  n_mild_days: ["Number of mild days for each dong", "Count of dong-days with is_mild = True", "days", "KMA", "Processed", "heatdays"],
  retail_share: ["Retail-sector card share among all sectors", "retail amount ÷ total amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  dinebev_share_all: ["Dining & beverage share among all sectors", "dinebev amount ÷ total amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  everyday_retail_share_all: ["Everyday retail share among all sectors", "everyday retail ÷ total amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  general_share_all: ["General retail share among all sectors", "general retail ÷ total amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  large_format_share_all: ["Large-format retail share among all sectors", "large-format ÷ total amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  dinebev_share_retail: ["Dining & beverage share within retail", "dinebev ÷ retail amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  everyday_retail_share_retail: ["Everyday retail share within retail", "everyday retail ÷ retail amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  general_share_retail: ["General retail share within retail", "general ÷ retail amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  large_format_share_retail: ["Large-format share within retail", "large-format ÷ retail amount", "ratio (0–1)", "Seoul AI Foundation", "Processed", "salesfeature"],
  elderly_share: ["Share of elderly population", "elderly ÷ total dong population", "ratio (0–1)", "Seoul Open Data Portal", "Processed", "context"],
  low_income_share: ["Share of low-income population", "low-income ÷ total dong population", "ratio (0–1)", "Seoul Open Data Portal", "Processed", "context"],
  subway_access_coverage: ["Spatial accessibility to subway stations", "area within subway buffer ÷ dong area", "ratio (0–1)", "Seoul Metro", "Processed", "context"],
  bus_stop_density: ["Density of bus stops", "bus stops ÷ dong area", "count/km²", "Seoul Open Data Portal", "Processed", "context"],
  residential_area_share: ["Residential land-use proportion", "residential area ÷ dong area", "ratio (0–1)", "EGIS", "Raw", "context"],
  commercial_area_share: ["Commercial land-use proportion", "commercial area ÷ dong area", "ratio (0–1)", "EGIS", "Raw", "context"],
  leisure_area_share: ["Leisure/recreation land-use proportion", "leisure area ÷ dong area", "ratio (0–1)", "EGIS", "Raw", "context"],
  transportation_area_share: ["Transportation land-use proportion", "transport area ÷ dong area", "ratio (0–1)", "EGIS", "Raw", "context"],
  public_facility_area_share: ["Public/institutional land-use proportion", "public facility area ÷ dong area", "ratio (0–1)", "EGIS", "Raw", "context"],
  green_space_share: ["Vegetation/open-space proportion", "green area ÷ dong area", "ratio (0–1)", "EGIS", "Raw", "context"],
  activity_facility_density: ["Density of activity-generating facilities", "facilities ÷ dong area", "count/km²", "Seoul Open Data Portal", "Processed", "context"],
  aged_housing_share: ["Share of old housing stock", "aged housing units ÷ total housing units", "ratio (0–1)", "MOLIT", "Processed", "context"],
  parking_capacity: ["Parking infrastructure intensity", "parking spaces ÷ dong area", "count/km²", "Seoul Open Data Portal", "Processed", "context"],
  land_price: ["Land value intensity", "log(mean official land price of dong)", "log(KRW/m²)", "MOLIT", "Processed", "context"],
  dnpr: ["Daytime-to-nighttime population ratio", "daytime population ÷ nighttime population", "ratio", "Seoul Open Data Portal", "Processed", "mobility"],
  delta_daypop: ["Relative daytime-population response (hot vs mild)", "log(daypop on hot days ÷ daypop on mild days)", "log-ratio", "Seoul Open Data Portal", "Processed", "mobility"],
  gu_name: ["District (gu) name — spatial identifier", "—", "string", "—", "—", "dongbase"],
  gu_code: ["District (gu) code — spatial identifier", "—", "categorical ID", "—", "—", "dongbase"],
  dong_name: ["Neighborhood (dong) name — spatial identifier", "—", "string", "—", "—", "dongbase"],
  dong_code: ["Neighborhood (dong) code — primary spatial join key", "—", "categorical ID", "—", "—", "dongbase"],
  geometry: ["Polygon boundary of the administrative dong", "—", "EPSG:4326 lon/lat", "Seoul Open Data Portal", "Raw", "geometry"],
};

// Weather / temporal variables → drive the time-flow instead of a static recolor.
const TIME_VARS = new Set(["temp_max", "apptemp_max", "precip_sum", "humid_max", "is_hot", "is_mild", "is_holiday", "date"]);

// ---- Lineage (Input → Feature → Index → View), each item → a dataset id ----
const LINEAGE = {
  input: { name: "Input Datasets", note: "Raw or near-raw signals entering the UHUS workflow.", count: "3 items", items: [
    { id: "weather", name: "Daily Weather", desc: "temp_max, precip_sum, humid_max, apptemp_max, date", tag: "weather input", icon: ICONS.sun },
    { id: "sales", name: "Sales Signal", desc: "85 daily industry card-sales columns per dong", tag: "sales input", icon: ICONS.sales },
    { id: "dongbase", name: "Dong Base", desc: "dong_code, gu_code, dong_name, gu_name", tag: "spatial base", icon: ICONS.map },
  ] },
  feature: { name: "Derived Feature Datasets", note: "Variables constructed from inputs and urban context.", count: "4 items", items: [
    { id: "heatfeature", name: "Heat Exposure Features", desc: "apptemp_max, is_hot, is_mild, is_holiday", tag: "weather feature", icon: ICONS.thermometer },
    { id: "salesfeature", name: "Sales Composition Features", desc: "retail_share, dinebev, everyday retail, large-format", tag: "sales feature", icon: ICONS.flag },
    { id: "context", name: "Urban Context Features", desc: "demography, accessibility, land-use, built environment", tag: "control layer", icon: ICONS.building },
    { id: "mobility", name: "Mobility Response", desc: "dnpr, delta_daypop", tag: "response context", icon: ICONS.mobility },
  ] },
  index: { name: "Computed Index Datasets", note: "Final analytical outputs from weather–sales relationships.", count: "2 items", items: [
    { id: "rhsi", name: "RHSI Retail", desc: "retail heat-sensitivity index", tag: "computed index", icon: ICONS.chart },
    { id: "heatdays", name: "Heat-Day Summary", desc: "n_hot_days, n_mild_days", tag: "computed count", icon: ICONS.calendar },
  ] },
  view: { name: "Dashboard / Map Layers", note: "Layers used to visualize the computed results.", count: "3 items", items: [
    { id: "geometry", name: "Dong Geometry", desc: "Administrative_Dong_Geometry.geojson", tag: "geometry", icon: ICONS.map },
    { id: "atlas", name: "Combined Atlas", desc: "weather, sales, context, RHSI on one map", tag: "dashboard", icon: ICONS.dashboard },
    { id: "sectorprofile", name: "Sector Profile", desc: "sector-level sales & resilience profile", tag: "view", icon: ICONS.profile },
  ] },
};

// Real source-file catalog for the Project Detail table — grouped by TRUE stage.
// Geometry is a spatial INPUT; shap_result is not a feature but the model's
// EXPLANATION (each feature's contribution to the RHSI prediction) — both were
// misfiled by the old view-centric lineage. The project table keeps each value to
// a few words; the full story lives on each dataset's own detail page. Flags mark
// spatial / temporal dimensions; coloured tags mark variable kind (same = same).
// Grouped by ROLE in the study (inputs → outcome ← explanation), which is the same
// story the relationship diagram draws. `stage` is kept as a small pipeline tag.
const DATASET_CATALOG = [
  { role: "Inputs", stage: "input", sub: "the raw signals", items: [
    { file: "Daily_Weather.csv", open: "weather", sunit: "Dong", tunit: "Daily",
      tags: [["wx", "Weather ×4 + flags"]], value: "Hot / mild day flags", src: "KMA" },
    { file: "sales.csv", open: "sales", sunit: "Dong", tunit: "Daily",
      tags: [["sl", "85 industries"], ["rt", "19 retail"]], value: "Daily retail sales signal", src: "Seoul AI Foundation" },
  ] },
  { role: "Outcome", stage: "index", sub: "what we measure", items: [
    { file: "RHSI.csv", open: "rhsi", sunit: "Dong", tunit: "Hot vs Mild",
      tags: [["ix", "RHSI + day counts"]], value: "The heat-sensitivity index", src: "Seoul AI Foundation · KMA" },
  ] },
  { role: "Explanation", stage: "feature", sub: "why RHSI varies", items: [
    { file: "Urban_Features.csv", open: "context", sunit: "Dong", tunit: null,
      tags: [["ft", "21 features"]], value: "Neighborhood context variables", src: "EGIS · MOLIT · Seoul · Metro" },
    { file: "shap_result.csv", open: "shap", sunit: "Dong", tunit: null,
      tags: [["ft", "25 inputs"]], value: "Each model input's push on RHSI", src: "Model output" },
  ] },
];

// Relationship-diagram flow (tiers + join-key edges). Each node pulls its detail
// (temporal chip / variable tags / value) from DATASET_CATALOG by its `open` id.
const catByOpen = {};
DATASET_CATALOG.forEach((g) => g.items.forEach((d) => { catByOpen[d.open] = d; }));
const FLOW = [
  { tier: [{ open: "weather", role: "The heat", name: "Weather" }, { open: "sales", role: "The behavior", name: "Sales" }] },
  { edge: { label: "hot vs mild", key: "dong_code + date" } },
  { tier: [{ open: "rhsi", role: "The outcome", name: "RHSI", outcome: true }] },
  { edge: { label: "explained by" }},
  { tier: [{ open: "context", role: "The context", name: "Urban Features" }, { open: "shap", role: "The explanation", name: "SHAP" }] },
];
function linNodeHtml(n) {
  const d = catByOpen[n.open] || {};
  const tags = (d.tags || []).map(([c, t]) => `<span class="ds-tag t-${c}">${t}</span>`).join("");
  const temp = d.tunit ? `<span class="ds-unit tm" title="Temporal unit">${ICONS.calendar} ${d.tunit}</span>` : "";
  const meta = (temp || tags) ? `<div class="lin-meta">${temp}${tags}</div>` : "";
  return `<button class="lin-node${n.outcome ? " outcome" : ""}" data-open="${n.open}">
    <div class="lin-role">${n.role}</div>
    <div class="lin-name">${n.name}</div>
    <div class="lin-file">${d.file || ""}</div>
    ${meta}
    ${d.value ? `<div class="lin-val">${d.value}</div>` : ""}
  </button>`;
}

// ---- Dataset detail metadata (real structure) ----
// mapKey/mapMode drive the CTA "Show Dataset on Map".
const DATASETS_META = {
  weather: { title: "Daily Weather", badge: "Input Signal", icon: ICONS.sun, map: { mode: "time" },
    description: "Daily weather conditions used to identify heat exposure and compare hot days with mild reference days. A day is flagged hot when apparent temperature ≥ 33°C, and mild when 18–26°C with no rain and not a public holiday.",
    mapTells: "Press play — the temperature heat field pulses across 2024; mid-summer glows hot.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Day · 366", "2024 daily"], ["Coverage", "Seoul dongs", "citywide"], ["Type", "Input", "raw weather"]],
    metadata: [["File", "Daily_Weather.csv"], ["Source", "KMA"], ["Source Type", "Raw + Processed"], ["Role", "heat-exposure input"]],
    importantVars: [["date", "time key", "key"], ["temp_max", "raw weather", ""], ["apptemp_max", "derived heat", ""]],
    chips: ["precip_sum", "humid_max", "is_hot", "is_mild", "is_holiday"],
    views: ["Heat Calendar", "Time Series", "Weather Map", "Compare"] },
  sales: { title: "Sales Signal", badge: "Input Signal", icon: ICONS.sales, map: { mode: "time" },
    description: "Daily card-sales amounts across ~85 industry categories per dong — the behavioural signal behind retail heat sensitivity. retail_total_amount sums the 19 retail sectors used to compute RHSI.",
    mapTells: "Six sales-theme rings per dong animate day by day — watch them shrink on scorching days.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Day · 366", "2024 daily"], ["Business Unit", "85 industries", "6 theme groups"], ["Coverage", "Seoul retail", "card transactions"]],
    metadata: [["File", "sales.csv"], ["Source", "Seoul AI Foundation"], ["Source Type", "Raw"], ["Role", "sales input signal"]],
    importantVars: [["retail_total_amount", "total sales", ""], ["korean_cuisine_amount", "F&B example", ""], ["convenience_store_amount", "retail example", ""]],
    chips: ["cafe_amount", "apparel_amount", "pharmacy_amount", "gas_station_amount"],
    categoryGroupKind: "sales",
    views: ["Sector Profile", "Time Series", "Hot vs Mild", "Ranking"] },
  dongbase: { title: "Dong Base", badge: "Spatial Base", icon: ICONS.map, map: { mode: "geometry" },
    description: "Administrative identifiers shared across every UHUS dataset — the join backbone for dong/gu-level analysis.",
    metrics: [["Spatial Unit", "Dong / Gu", "422 / 25"], ["Temporal Unit", "Static", "administrative"], ["Join Level", "dong_code", "primary key"], ["Coverage", "Seoul", "all dongs"]],
    metadata: [["File", "shared across files"], ["Source", "Administrative code system"], ["Source Type", "Identifier"], ["Role", "project join layer"]],
    importantVars: [["dong_code", "spatial key", "key"], ["gu_code", "district key", "key"], ["dong_name", "label", ""]],
    chips: ["gu_name"], views: ["Join Map", "District Filter", "Coverage", "Boundary Check"] },
  heatfeature: { title: "Heat Exposure Features", badge: "Feature Layer", icon: ICONS.thermometer, map: { mode: "time" },
    description: "Derived heat-exposure variables from daily weather, used to classify hot and mild comparison days.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Day", "daily flags"], ["Feature Type", "Weather derived", "heat / mild"], ["Coverage", "Seoul dongs", "weather-matched"]],
    metadata: [["File", "Daily_Weather.csv"], ["Source", "KMA"], ["Source Type", "Processed"], ["Role", "heat-exposure feature"]],
    importantVars: [["apptemp_max", "heat metric", ""], ["is_hot", "hot flag", ""], ["is_mild", "reference flag", ""]],
    chips: ["is_holiday", "n_hot_days", "n_mild_days"], views: ["Heat Matrix", "Calendar", "Map", "Compare"] },
  salesfeature: { title: "Sales Composition Features", badge: "Feature Layer", icon: ICONS.flag, map: { mode: "metric", key: "retail_share" },
    description: "Derived sales-share variables describing the retail composition and sectoral structure of each dong.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Aggregated", "feature summary"], ["Feature Type", "Sales share", "composition ratios"], ["Coverage", "Retail sectors", "share of total"]],
    metadata: [["File", "Urban_Features.csv"], ["Source", "Seoul AI Foundation"], ["Source Type", "Processed"], ["Role", "sales feature layer"]],
    importantVars: [["retail_share", "main sales share", ""], ["dinebev_share_all", "sector share", ""], ["everyday_retail_share_all", "sector share", ""]],
    chips: ["general_share_all", "large_format_share_all", "dinebev_share_retail", "large_format_share_retail"],
    views: ["Composition", "Ranking", "Map", "Correlation"] },
  context: { title: "Urban Context Features", badge: "Feature Layer", icon: ICONS.building, map: { mode: "metric", key: "public_facility_area_share" },
    description: "Urban control variables — demography, accessibility, land-use, built environment — that explain heat-sales sensitivity.",
    mapTells: "A sequential choropleth of one urban feature (public facility land by default) — compare its pattern to RHSI.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Mostly static", "context features"], ["Feature Type", "Urban context", "21 variables"], ["Coverage", "Seoul dongs", "citywide"]],
    metadata: [["File", "Urban_Features.csv"], ["Source", "Mixed (EGIS, MOLIT, Seoul, Metro)"], ["Source Type", "Raw + Processed"], ["Role", "context / control layer"]],
    importantVars: [["land_price", "economic context", ""], ["elderly_share", "vulnerability", ""], ["subway_access_coverage", "accessibility", ""]],
    chips: ["low_income_share", "bus_stop_density", "green_space_share", "commercial_area_share", "residential_area_share", "aged_housing_share", "parking_capacity", "activity_facility_density"],
    categoryGroupKind: "context",
    views: ["Context Map", "Feature Profile", "Ranking", "Correlation"] },
  mobility: { title: "Mobility Response", badge: "Feature Layer", icon: ICONS.mobility, map: { mode: "metric", key: "delta_daypop" },
    description: "Population-movement variables used to interpret exposure and response — the strongest single driver of RHSI.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Aggregated", "population response"], ["Feature Type", "Mobility", "day/night population"], ["Coverage", "Seoul dongs", "citywide"]],
    metadata: [["File", "Urban_Features.csv"], ["Source", "Seoul Open Data Portal"], ["Source Type", "Processed"], ["Role", "mobility response context"]],
    importantVars: [["delta_daypop", "heat response", ""], ["dnpr", "day/night ratio", ""]],
    chips: ["subway_access_coverage", "bus_stop_density", "activity_facility_density"], views: ["Mobility Map", "Hot/Mild Compare", "Correlation", "Ranking"] },
  rhsi: { title: "RHSI Retail", badge: "Computed Index", icon: ICONS.chart, map: { mode: "metric", key: "RHSI_retail" },
    description: "Retail heat-sensitivity index — log-ratio of mean retail sales on hot days to mild days, per dong. The study's primary output.",
    mapTells: "Each dong colored blue→rose by heat-sensitivity — blue neighborhoods lose the most retail on hot days.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Hot vs Mild", "computed comparison"], ["Index Type", "Resilience", "retail heat sensitivity"], ["Coverage", "Seoul retail", "RHSI by dong"]],
    metadata: [["File", "RHSI.csv"], ["Source", "Seoul AI Foundation; KMA"], ["Source Type", "Processed"], ["Role", "final analytical output"]],
    importantVars: [["RHSI_retail", "main index", ""], ["n_hot_days", "hot-day count", ""], ["n_mild_days", "reference count", ""]],
    chips: ["dong_code", "gu_code", "dong_name"], views: ["RHSI Map", "Ranking", "Distribution", "Compare"] },
  heatdays: { title: "Heat-Day Summary", badge: "Computed Count", icon: ICONS.calendar, map: { mode: "metric", key: "RHSI_retail" },
    description: "Counts of hot and mild days per dong, supporting the RHSI calculation and reliability checks.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Summary", "qualifying days"], ["Metric Type", "Count", "hot / mild days"], ["Coverage", "Seoul dongs", "weather matched"]],
    metadata: [["File", "RHSI.csv"], ["Source", "KMA"], ["Source Type", "Processed"], ["Role", "index support metric"]],
    importantVars: [["n_hot_days", "hot-day count", ""], ["n_mild_days", "mild-day count", ""], ["dong_code", "spatial key", "key"]],
    chips: ["gu_code", "dong_name"], views: ["Count Map", "Reliability Check", "Distribution", "Compare"] },
  shap: { title: "SHAP Contributions", badge: "Model Explanation", icon: ICONS.chart, map: { mode: "metric", key: "RHSI_retail" },
    description: "Per-dong SHAP values — how much each model input pushed the predicted RHSI up or down. This explains model behavior, not causality.",
    mapTells: "The map colors by RHSI — the value SHAP explains — while the variables below rank each feature's push.",
    metrics: [["Spatial Unit", "Dong (422)", "joined by dong_code"], ["Temporal Unit", "Static", "per-dong summary"], ["Type", "Explanation", "model interpretation"], ["Coverage", "25 inputs", "one contribution each"]],
    metadata: [["File", "shap_result.csv"], ["Source", "Model output"], ["Source Type", "Computed"], ["Role", "model explanation of RHSI"]],
    importantVars: [["shap_delta_daypop", "top contributor", ""], ["shap_dnpr", "contributor", ""], ["shap_land_price", "contributor", ""]],
    chips: ["shap_elderly_share", "shap_retail_share", "shap_green_space_share", "shap_commercial_area_share"],
    categoryGroupKind: "context", // SHAP explains the same urban features → same theme groups
    views: ["SHAP Map", "Feature Importance", "Per-dong Drivers", "Compare"] },
  geometry: { title: "Dong Geometry", badge: "Map Layer", icon: ICONS.map, map: { mode: "geometry" },
    description: "Administrative dong boundary geometry used to map and spatially join every UHUS variable.",
    metrics: [["Spatial Unit", "Dong (422)", "polygon boundary"], ["Temporal Unit", "Static", "administrative"], ["Format", "GeoJSON", "EPSG:4326"], ["Coverage", "Seoul", "all dongs"]],
    metadata: [["File", "Administrative_Dong_Geometry.geojson"], ["Source", "Seoul Open Data Portal"], ["Source Type", "Raw"], ["Role", "geometry / map layer"]],
    importantVars: [["geometry", "map layer", "key"], ["dong_code", "spatial key", "key"], ["gu_code", "district key", "key"]],
    chips: ["dong_name", "gu_name"], views: ["Boundary Map", "Join Check", "Coverage", "Overlay"] },
  atlas: { title: "Combined Atlas", badge: "Dashboard View", icon: ICONS.dashboard, map: { mode: "metric", key: "RHSI_retail" },
    description: "Integrated UHUS view combining weather, sales, urban context and the resilience index on one night map.",
    metrics: [["Spatial Unit", "Dong / Gu", "all layers joined"], ["Temporal Unit", "Mixed", "daily + summary"], ["View Type", "Dashboard", "multi-layer atlas"], ["Coverage", "UHUS project", "combined outputs"]],
    metadata: [["Layer", "map + time-flow"], ["Source", "all UHUS datasets"], ["Source Type", "View"], ["Role", "project-level exploration"]],
    importantVars: [["RHSI_retail", "main index", ""], ["apptemp_max", "heat metric", ""], ["dong_code", "spatial key", "key"]],
    chips: ["retail_share", "elderly_share", "land_price", "delta_daypop"], views: ["Combined Atlas", "Time-flow", "Ranking", "Compare"] },
  sectorprofile: { title: "Sector Profile", badge: "Dashboard View", icon: ICONS.profile, map: { mode: "time" },
    description: "Sector-level profile view for inspecting how sales composition and heat sensitivity differ across theme groups.",
    metrics: [["Spatial Unit", "Dong / Gu", "selected region"], ["Temporal Unit", "Daily", "sector profile"], ["View Type", "Profile", "6 theme groups"], ["Coverage", "Retail sectors", "grouped"]],
    metadata: [["Layer", "sales group rings"], ["Source", "sales.csv"], ["Source Type", "View"], ["Role", "sector-level inspection"]],
    importantVars: [["retail_total_amount", "total sales", ""], ["RHSI_retail", "index", ""]],
    chips: ["korean_cuisine_amount", "cafe_amount", "apparel_amount"],
    categoryGroupKind: "sales", views: ["Sector Profile", "Time-flow", "Ranking", "Compare"] },
};

// Best-recommended 3D-map representation per dataset — the full map state that
// `applyRecommended(id)` applies (and mirrors onto every left-panel control).
// `time` / `color` default from each dataset's own `map` hint above; the fields
// here only ADD the layers, sector encoding, grain, camera mode and slider tuning
// that make each dataset read best. Everything omitted falls back to a default
// (grain "dong", mode "3d", color = the dataset's metric key, time = its map mode).
// A representation = a recipe for the map state: which layers, whether it's a sector
// glyph, time-flow, or 2D, plus slider tuning. Colour/height come from the dataset's
// own metric (DATASETS_META[id].map.key). `applyRepresentation` applies one and mirrors
// it onto every left-panel control.
const REP_TYPES = {
  choropleth: { label: "Flat map",     layers: ["roads", "choropleth"], sliders: { elevation: 0.12, radius: 1.0, opacity: 1.0, glow: 1.0 } },
  bars:       { label: "3D bars",      layers: ["boundary", "roads", "columns"], height: true, sliders: { elevation: 0.12, radius: 1.0, opacity: 0.95, glow: 1.0 } },
  points:     { label: "Glow points",  layers: ["boundary", "roads", "pointCore", "pointHalo"], sliders: { elevation: 0.12, radius: 1.0, opacity: 0.9, glow: 1.4 } },
  rings:      { label: "Rings",        layers: ["boundary"], sector: "rings", sliders: { elevation: 1.0, radius: 1.2, opacity: 0.85, glow: 1.3 } },
  radial:     { label: "Radial",       layers: ["boundary"], sector: "radial", sliders: { elevation: 1.0, radius: 1.2, opacity: 0.85, glow: 1.3 } },
  columns:    { label: "Columns",      layers: ["boundary"], sector: "columns", sliders: { elevation: 1.4, radius: 1.1, opacity: 0.85, glow: 1.2 } },
  dominant:   { label: "Dominant",     layers: ["boundary"], sector: "dominant", sliders: { elevation: 0.12, radius: 1.0, opacity: 0.95, glow: 1.0 } },
  signedcols: { label: "Signed 3D",    layers: ["boundary"], sector: "signedcols", sliders: { elevation: 1.4, radius: 1.1, opacity: 0.9, glow: 1.2 } },
  divided:    { label: "Divided",      layers: ["boundary", "roads"], sector: "divided", sliders: { elevation: 0.12, radius: 1.0, opacity: 0.95, glow: 1.0 } },
  buildingmix:{ label: "Buildings",    layers: ["boundary"], sector: "buildingmix", sliders: { elevation: 1.0, radius: 1.0, opacity: 0.9, glow: 1.0 } },
  heatfield:  { label: "Heat field",   layers: ["boundary"], time: true, compare: false, sliders: { elevation: 1.0, radius: 1.8, opacity: 0.9, glow: 1.4 } },
  compare:    { label: "Heat × sales", layers: ["boundary"], time: true, compare: true, sliders: { elevation: 1.0, radius: 1.3, opacity: 0.85, glow: 1.4 } },
  // Former "Data layers" toggles, promoted to first-class representations so every
  // visual design is picked as a representation instead of a raw layer checkbox.
  heatmap:    { label: "Heatmap",      layers: ["boundary", "roads", "heatmap"], sliders: { elevation: 0.12, radius: 1.4, opacity: 0.9, glow: 1.3 } },
  hexbin:     { label: "Hexbin",       layers: ["boundary", "roads", "hexbin"], sliders: { elevation: 0.6, radius: 1.0, opacity: 0.9, glow: 1.0 } },
  dotfield:   { label: "Dot field",    layers: ["boundary", "roads", "dotField"], sliders: { elevation: 0.12, radius: 1.0, opacity: 0.9, glow: 1.1 } },
  valuerings: { label: "Value rings",  layers: ["boundary", "roads", "influence"], sliders: { elevation: 0.12, radius: 1.2, opacity: 0.9, glow: 1.2 } },
  dashboard:  { label: "Dashboard",    layers: ["boundary", "roads", "choropleth", "columns"], height: true, sliders: { elevation: 0.2, radius: 1.0, opacity: 1.0, glow: 1.0 } },
  boundary:   { label: "Base map",     layers: ["boundary", "roads", "labels"], mode: "2d", sliders: { elevation: 1.0, radius: 1.0, opacity: 0.85, glow: 0.8 } },
};
// Each dataset's Representation menu — first entry is the default (recommended) view.
const DATASET_REPS = {
  // Static designs are listed alongside the time views so a dataset can be shown
  // without animating (applyRepresentation rejects any rep missing from this list).
  weather:      ["heatfield", "compare", "choropleth", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  heatfeature:  ["heatfield", "compare", "choropleth", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  sales:        ["rings", 'choropleth', "radial", "columns", "dominant", "compare", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  sectorprofile:["columns", "rings", "radial", "dominant"],
  rhsi:         ["buildingmix", "choropleth", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  shap:         ["buildingmix", "signedcols", "columns", "divided",  "dominant", "rings", "radial", "choropleth", "bars", "points"],
  context:      ["choropleth", "columns", "divided", "buildingmix", "dominant", "rings", "radial", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  mobility:     ["choropleth", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  salesfeature: ["choropleth", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  heatdays:     ["choropleth", "bars", "heatmap", "hexbin", "dotfield", "valuerings"],
  atlas:        ["dashboard", "compare", "rings"],
  dongbase:     ["boundary"],
  geometry:     ["boundary"],
};

// ---- Theme variable groups (sales + urban context) — for the tag detail panels ----
const SALES_GROUPS = {
  food_beverage: { title: "Food & Beverage", count: 10, examples: ["korean_cuisine", "cafe", "bakery", "fast_food"], columns: ["korean_cuisine", "japanese_cuisine", "western_cuisine", "chinese_cuisine", "bakery", "cafe", "fast_food", "other_food", "other_food_service", "liquor_store"], use: "hot-day dining response", groupIndex: 0 },
  retail_daily: { title: "Retail & Daily Goods", count: 19, examples: ["convenience_store", "chain_grocery", "department_store"], columns: ["department_store", "supermarket_large_format", "discount_store", "shopping_mall", "chain_grocery", "independent_grocery", "convenience_store", "general_merchandise_imported", "fresh_produce_seafood", "butcher_shop", "home_appliances", "furniture", "other_distribution", "chain_store", "brand_exclusive_store", "office_equipment_stationery", "handmade_goods_store", "gift_certificate_lottery"], use: "everyday consumption / retail resilience", groupIndex: 1 },
  fashion_beauty: { title: "Fashion / Beauty / Personal", count: 10, examples: ["apparel", "cosmetics", "hair_salon", "beauty_service"], columns: ["apparel", "fashion_accessories", "watches_jewelry", "cosmetics", "hair_salon", "beauty_service", "massage_spa", "sauna_bathhouse", "laundry_dry_cleaner", "door_to_door_mlm_sales"], use: "optional / personal-service response", groupIndex: 2 },
  health_education_culture: { title: "Health / Education / Culture", count: 18, examples: ["pharmacy", "general_clinic", "school_tuition", "movie_performance"], columns: ["pharmacy", "general_hospital", "general_clinic", "dental_clinic", "korean_medicine_clinic", "public_health_center", "other_medical", "veterinary_clinic", "academy_learning_materials", "school_tuition", "study_room", "kindergarten", "books", "bookstore", "cultural_goods", "movie_performance", "instruments_records", "computer_software"], use: "essential services & cultural activity", groupIndex: 3 },
  leisure_mobility_lodging: { title: "Leisure / Mobility / Lodging", count: 18, examples: ["sports_facility", "karaoke", "gas_station", "hotel_condo"], columns: ["gym", "sports_facility", "sports_leisure_goods", "indoor_outdoor_golf", "leisure_town_amusement_park", "game_room_arcade", "karaoke", "entertainment_venue", "motel_inn_other_lodging", "hotel_condo", "gas_station", "parking_lot", "auto_service", "auto_accessories", "used_car_dealer", "motorcycle", "toys_kids_bicycles", "lpg_gas"], use: "mobility-linked & leisure spending", groupIndex: 4 },
  housing_professional_local: { title: "Housing / Professional / Local", count: 10, examples: ["real_estate_agency", "furniture", "legal_office", "flower_shop"], columns: ["real_estate_agency", "interior_building_materials_kitchenware", "legal_office_service", "accounting_patent_service", "research_translation_service", "wedding_hall_service", "funeral_home_cemetery", "pet_shop", "flower_shop", "used_goods_store"], use: "neighbourhood service & durable goods", groupIndex: 5 },
};
const CONTEXT_GROUPS = {
  population_dynamics: { title: "Population Dynamics", count: 2, examples: ["dnpr", "delta_daypop"], columns: ["dnpr", "delta_daypop"], use: "daytime inflow & heat-day population loss", mapKey: "delta_daypop" },
  demographics: { title: "Demographics", count: 2, examples: ["elderly_share", "low_income_share"], columns: ["elderly_share", "low_income_share"], use: "who is most exposed to heat", mapKey: "elderly_share" },
  retail_structure: { title: "Retail Structure", count: 5, examples: ["retail_share", "dinebev_share_all", "large_format_share_all"], columns: ["retail_share", "dinebev_share_all", "everyday_retail_share_all", "general_share_all", "large_format_share_all"], use: "retail composition & mix", mapKey: "retail_share" },
  urban_env_access: { title: "Urban Environment & Accessibility", count: 12, examples: ["commercial_area_share", "green_space_share", "subway_access_coverage"], columns: ["residential_area_share", "commercial_area_share", "leisure_area_share", "transportation_area_share", "public_facility_area_share", "green_space_share", "activity_facility_density", "aged_housing_share", "land_price", "subway_access_coverage", "bus_stop_density", "parking_capacity"], use: "physical form, land value & access to cooling", mapKey: "green_space_share" },
};

const COMMON_VARS = {
  date: { title: "date", role: "time key", join: "day-level join", desc: "Links Daily Weather and Sales at the day level and separates hot days from mild reference days.", connected: ["weather", "sales", "heatfeature"], related: ["is_hot", "is_mild", "apptemp_max"], relation: ["Weather", "date", "Sales"], map: { mode: "time" } },
  dong_code: { title: "dong_code", role: "spatial key", join: "primary spatial join", desc: "The primary key linking weather, sales, urban context, RHSI and geometry at the neighbourhood level.", connected: ["weather", "sales", "context", "rhsi", "geometry"], related: ["gu_code", "dong_name"], relation: ["All datasets", "dong_code", "Geometry"], map: { mode: "boundary", level: "dong" } },
  gu_code: { title: "gu_code", role: "district key", join: "aggregation key", desc: "Rolls dong-level results up to the 25 districts; the level used for the citywide overview.", connected: ["weather", "sales", "context", "rhsi", "geometry"], related: ["gu_name", "dong_code"], relation: ["Dong-level", "gu_code", "District view"], map: { mode: "boundary", level: "gu" } },
  dong_name: { title: "dong_name", role: "label", join: "display label", desc: "Human-readable neighbourhood label shown in tooltips and rankings.", connected: ["dongbase", "geometry"], related: ["dong_code", "gu_name"], relation: ["dong_code", "dong_name", "Tooltip"], map: { mode: "boundary", level: "dong" } },
};

// ---------- controller ----------
const Panels = {
  map: null,
  currentDatasetForBack: null,
  currentStage: "input",
  selection: null,  // null (nothing) | "project" | "dataset" — drives panel visibility

  init(map) {
    this.map = map;
    this.host = document.getElementById("panel-host");
    this.body = document.getElementById("panelBody");
    this.label = document.getElementById("panelLabel");
    this.modeLabel = document.getElementById("modeLabel");
    this.modeStrong = document.getElementById("modeStrong");
    // left-rail tab switching (Detail / Insights / Sets)
    document.querySelectorAll(".rail-tab").forEach((t) => {
      t.addEventListener("click", () => this.setTab(t.dataset.panelTab));
    });
    this.renderSpine();
    // Open on the UHUS project detail (Detail + Insights side by side).
    this.renderProject();
  },

  // Switch the right-panel view via the left rail. Insights renders its charts
  // only while visible, so (re)render when it becomes the active tab.
  setTab(name) {
    if (!name) return;
    document.querySelectorAll(".rail-tab").forEach((x) => x.classList.toggle("active", x.dataset.panelTab === name));
    this.host.classList.remove("mode-detail", "mode-insights", "mode-library");
    this.host.classList.add("mode-" + name);
    // Detail now shows the Insights panel alongside it, so render insights there too.
    if ((name === "insights" || name === "detail") && typeof Insights !== "undefined") Insights.render();
    if (name === "library") this.renderLibraryView();
  },

  // Left-rail spine: collapsed stage ticks + a hover dataset list (quick nav).
  renderSpine() {
    const spine = document.getElementById("railSpine");
    if (!spine || typeof DATASET_CATALOG === "undefined") return;
    spine.innerHTML = `
      <button class="spine-home" data-project title="UHUS project overview + insights">✧<span>UHUS</span></button>
      <div class="spine-collapsed">
        ${DATASET_CATALOG.map((g) => `<div class="spine-cg"><span class="spine-cg-title">${g.role}</span><span class="spine-cg-count">${g.items.length}</span></div>`).join("")}
      </div>
      <div class="spine-full">
        ${DATASET_CATALOG.map((g) => `
          <div class="spine-grp">${g.role}</div>
          ${g.items.map((d) => `<button class="spine-ds${d.open ? "" : " disabled"}"${d.open ? ` data-open="${d.open}"` : ""} title="${d.file}">${d.file}</button>`).join("")}`).join("")}
      </div>`;
    // Click UHUS → back to a clean project overview with no dataset node selected.
    const home = spine.querySelector("[data-project]");
    if (home) home.onclick = () => this.resetProjectView();
    spine.querySelectorAll(".spine-ds[data-open]").forEach((b) => b.onclick = () => this.renderDatasetDetail(b.dataset.open));
  },

  resetProjectView() {
    this.selectedNode = null;
    this.currentDatasetForBack = null;
    this.selectedDatasetId = null;
    this.selection = "project";
    this.renderProject();
  },

  // Library tab: browse every dataset grouped by pipeline stage.
  renderLibraryView() {
    const body = document.getElementById("libraryBody");
    if (!body || typeof DATASET_CATALOG === "undefined") return;
    const total = DATASET_CATALOG.reduce((n, g) => n + g.items.length, 0);
    body.innerHTML = `
      <div class="title-block">
        <div class="icon">${ICONS.map}</div>
        <div>
          <div class="name-row"><div class="name">Dataset Library</div><div class="badge">${total} files</div></div>
          <p class="desc">Every UHUS source file, grouped by its role in the study. Click a dataset to open its detail.</p>
        </div>
      </div>
      <div class="lib-tree">
        ${DATASET_CATALOG.map((g) => `
          <div class="lib-group">${g.role} · ${g.sub}</div>
          ${g.items.map((d) => `<button class="lib-row${d.open ? "" : " disabled"}"${d.open ? ` data-open="${d.open}"` : ""}><span class="lib-name">${d.file}</span><span class="lib-badge">${g.stage}</span></button>`).join("")}`).join("")}
      </div>`;
    body.querySelectorAll(".lib-row[data-open]").forEach((b) => b.onclick = () => this.renderDatasetDetail(b.dataset.open));
  },

  // ---------- map wiring ----------
  _mapMetricKeys() {
    if (!this._metricSet) this._metricSet = new Set(Atlas.availableMapMetrics().map((m) => m.key));
    return this._metricSet;
  },
  applyVariable(key) {
    if (TIME_VARS.has(key)) { if (typeof enterTimeMode === "function") enterTimeMode(); return; }
    if (this._mapMetricKeys().has(key)) {
      if (this.map.isTimeMode()) this.map.setTimeMode(false);
      this.map.unifyLayerColors(key);
      const sel = document.getElementById("dd-color");
      if (sel) sel.value = key;
      if (typeof syncLayerVarSelects === "function") syncLayerVarSelects();
      if (typeof updateLegend === "function") updateLegend();
      return;
    }
    // Not a color-able metric (spatial key, industry column, geometry): still
    // give the map a visible reaction — emphasise boundary + set a fitting grain.
    if (this.map.isTimeMode()) this.map.setTimeMode(false);
    this.map.setLayer("boundary", true);
    if (typeof syncLayerChecks === "function") syncLayerChecks();
    if (/dong/.test(key)) this._setGrainUI("dong");
    else if (/gu/.test(key)) this._setGrainUI("gu");
    if (typeof updateLegend === "function") updateLegend();
  },
  // Set grain both on the map and on the segmented control in the panel.
  _setGrainUI(g) {
    this.map.setGrain(g);
    document.querySelectorAll("#grain-seg button").forEach((b) => b.classList.toggle("active", b.dataset.grain === g));
  },
  // Mirror the camera mode onto the Map Mode segmented control.
  _setModeUI(mode) {
    document.querySelectorAll("#mc-mode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  },
  // The datasets' representation menu + default (first entry).
  datasetReps(id) { return (typeof DATASET_REPS !== "undefined" && DATASET_REPS[id]) || ["choropleth"]; },
  defaultRep(id) { return this.datasetReps(id)[0]; },

  // Apply one representation to the map AND mirror the full state onto every left-panel
  // control (Map Mode, layer checks, sliders, grain, colour dropdown) plus the
  // Representation picker. Colour/height come from the dataset's own metric.
  applyRepresentation(id, repId) {
    const meta = DATASETS_META[id];
    if (!meta || !this.map) return;
    const reps = this.datasetReps(id);
    if (!reps.includes(repId)) repId = reps[0];
    // Set early so enterTimeMode()/timeChannel() (called from the time block below)
    // reads the representation we're switching TO, not the previous one.
    this.selectedRep = repId;
    const rt = (typeof REP_TYPES !== "undefined" && REP_TYPES[repId]) || {};
    const m = this.map;
    const color = meta.map.mode === "metric" ? meta.map.key : null;
    const mode = rt.mode || "3d";
    const sector = rt.sector || null;

    // Time flow is normally explicit, except Sales choropleth should play as its
    // own daily sales sequence without making every choropleth time-driven.
    const salesTimeChoropleth = id === "sales" && repId === "choropleth";
    if (rt.time || salesTimeChoropleth) {
      m.timeCompare = salesTimeChoropleth ? false : !!rt.compare;
      if (typeof m.setTimeVar === "function") m.setTimeVar(salesTimeChoropleth ? "sales" : "temp");
      if (typeof enterTimeMode === "function") enterTimeMode();
    }
    else { if (typeof exitTimeMode === "function") exitTimeMode(); }

    // layer allow-list
    if (rt.layers) { const on = new Set(rt.layers); Object.keys(m.layers).forEach((k) => { m.layers[k] = on.has(k); }); }

    // unified colour / height metric
    if (color) {
      m.unifyLayerColors(color);
      m.unifyLayerHeights(color);
    }

    // grain + sector encoding
    this._setGrainUI("dong");
    m.setSectorView(sector);

    // slider tuning (syncs the slider inputs + read-outs)
    if (rt.sliders) this._applyView(rt.sliders);

    // camera mode: 2D reads flat, so kill the bloom/glow (remember it for a 3D restore)
    this._setModeUI(mode);
    if (m.map && m.map.easeTo) m.map.easeTo({ pitch: mode === "2d" ? 0 : 45, duration: 600 });
    m._glow3d = m.glow;
    if (mode === "2d" && typeof setGlowUI === "function") setGlowUI(0);

    m.render();

    // reflect onto the remaining controls
    const cs = document.getElementById("dd-color"); if (cs) cs.value = color || "";
    const hs = document.getElementById("dd-height"); if (hs && color) hs.value = color;
    if (typeof syncLayerChecks === "function") syncLayerChecks();
    if (typeof syncToolbar === "function") syncToolbar();
    if (typeof syncLayerVarSelects === "function") syncLayerVarSelects();
    this._syncRepControl(id, repId);
    if (typeof updateLegend === "function") updateLegend();
    // Switching to/from Heat × sales flips the time channel — refresh the strip
    // (visibility + which series it draws).
    if (typeof syncTimeline === "function") syncTimeline();
  },

  // Build/refresh the map-panel Representation segmented control for the dataset.
  _syncRepControl(id, activeRep) {
    const el = document.getElementById("mc-representation");
    if (!el) return;
    const reps = this.datasetReps(id);
    el.innerHTML = reps.map((r) => `<button data-rep="${r}" class="${r === activeRep ? "active" : ""}">${(REP_TYPES[r] || {}).label || r}</button>`).join("");
    el.querySelectorAll("button[data-rep]").forEach((b) => b.onclick = () => this.applyRepresentation(id, b.dataset.rep));
    this._syncShapFeatureControl(id, activeRep);
  },

  // Signed SHAP is an additive decomposition, so the map can truthfully show a
  // subset: checking a feature includes that feature's contribution in its theme
  // stack; removing it subtracts that contribution from the displayed explanation.
  _syncShapFeatureControl(id, activeRep) {
    const el = document.getElementById("shap-feature-filter");
    if (!el || !this.map) return;
    const visible = id === "shap" && activeRep === "signedcols";
    el.hidden = !visible;
    if (!visible) { el.innerHTML = ""; return; }

    const groups = Object.entries(CONTEXT_GROUPS);
    const allKeys = [...new Set(groups.flatMap(([, g]) => g.columns || []))];
    const selected = new Set(this.map._shapFeatureKeys());
    const featureLabel = (key) => {
      const spec = Atlas.metricSpec(key);
      return spec ? spec.label : key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    };
    el.innerHTML = `
      <div class="shap-filter-head">
        <span>SHAP FEATURES</span>
        <span class="shap-filter-actions"><button data-shap-action="all">All</button><button data-shap-action="none">None</button></span>
      </div>
      <p class="shap-filter-note">Include or remove additive contributions. The model is not rerun.</p>
      ${groups.map(([groupKey, g]) => {
        const cols = g.columns || [];
        return `<details class="shap-filter-group">
          <summary>
            <label><input type="checkbox" data-shap-group="${groupKey}"> <span>${g.title}</span></label>
            <small>${cols.filter((c) => selected.has(c)).length}/${cols.length}</small>
          </summary>
          <div class="shap-filter-vars">${cols.map((c) => `<label title="${c}"><input type="checkbox" data-shap-feature="${c}"${selected.has(c) ? " checked" : ""}> <span>${featureLabel(c)}</span></label>`).join("")}</div>
        </details>`;
      }).join("")}`;

    groups.forEach(([groupKey, g]) => {
      const box = el.querySelector(`[data-shap-group="${groupKey}"]`);
      const count = (g.columns || []).filter((c) => selected.has(c)).length;
      box.checked = count === (g.columns || []).length;
      box.indeterminate = count > 0 && count < (g.columns || []).length;
    });
    const apply = (next) => {
      this.map.setShapFeatures([...next]);
      this._syncShapFeatureControl(id, activeRep);
      if (typeof updateLegend === "function") updateLegend();
    };
    el.querySelectorAll("[data-shap-feature]").forEach((box) => {
      box.onchange = () => {
        const next = new Set(this.map._shapFeatureKeys());
        if (box.checked) next.add(box.dataset.shapFeature); else next.delete(box.dataset.shapFeature);
        apply(next);
      };
    });
    el.querySelectorAll("[data-shap-group]").forEach((box) => {
      box.onchange = () => {
        const next = new Set(this.map._shapFeatureKeys());
        const cols = (CONTEXT_GROUPS[box.dataset.shapGroup] || {}).columns || [];
        cols.forEach((c) => box.checked ? next.add(c) : next.delete(c));
        apply(next);
      };
    });
    el.querySelector('[data-shap-action="all"]').onclick = () => apply(new Set(allKeys));
    el.querySelector('[data-shap-action="none"]').onclick = () => apply(new Set());
  },

  // Opening a dataset applies its default (first) representation.
  applyRecommended(id) { this.applyRepresentation(id, this.defaultRep(id)); },
  applyDatasetMap(m) {
    if (!m) return;
    if (m.mode === "time") { if (typeof enterTimeMode === "function") enterTimeMode(); }
    else if (m.mode === "metric") { this.applyVariable(m.key); }
    else if (m.mode === "geometry") {
      if (this.map.isTimeMode()) this.map.setTimeMode(false);
      if (typeof handleRegionClick === "function") { /* keep scope */ }
      if (typeof updateLegend === "function") updateLegend();
    }
  },

  // ---------- Project Detail ----------
  renderProject() {
    this.setTab("detail");
    this.label.textContent = "Project Detail";
    this.modeLabel.textContent = "Project Group Panel";
    this.modeStrong.textContent = "Dataset Catalog";
    // Project scope = no single dataset → variable dropdowns show everything.
    this.selectedDatasetId = null;
    this.selection = "project";
    if (typeof refreshVariableDropdowns === "function") refreshVariableDropdowns();
    if (typeof Insights !== "undefined") Insights.scheduleRender();
    this.body.innerHTML = `
      <section class="title-block">
        <div class="icon">${ICONS.chart}</div>
        <div>
          <div class="name-row"><div class="name">UHUS</div><div class="badge">Project Bundle</div></div>
          <p class="desc">Urban Heat / Urban Sales. Weather and sales enter as input signals, then become features and a computed retail heat-sensitivity index (RHSI).</p>
        </div>
      </section>
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>How the datasets connect</span><span>click a node</span></div>
        <div class="lin-flow">
          ${FLOW.map((row) => row.edge
            ? `<div class="lin-edge"><svg class="lin-arrow" viewBox="0 0 24 24"><path d="M12 5v13M6 13l6 6 6-6"/></svg><span>${row.edge.label}</span></div>`
            : `<div class="lin-tier">${row.tier.map((n) => linNodeHtml(n)).join("")}</div>`).join("")}
        </div>
        <div class="ds-note">${ICONS.pin} All datasets are dong-level · 422 neighborhoods</div>
        <div class="ds-legend">
          <span class="ds-unit tm">${ICONS.calendar} Temporal</span>
          <span><i class="ds-sq t-wx"></i>Weather</span>
          <span><i class="ds-sq t-sl"></i>Sales</span>
          <span><i class="ds-sq t-ft"></i>Features</span>
          <span><i class="ds-sq t-ix"></i>Index</span>
        </div>
        <div class="click-hint">Click a node to preview it below and on the map · click again to collapse · no calendar chip = static (per-dong summary).</div>
        <div id="lin-detail" class="lin-detail"></div>
      </section>`;

    this.body.querySelectorAll(".lin-node[data-open]").forEach((el) => el.onclick = () => this.selectNode(el.dataset.open));
    // Re-open the previously expanded node (e.g. returning from a Full detail page).
    if (this.selectedNode) { const keep = this.selectedNode; this.selectedNode = null; this.selectNode(keep); }
    this.scrollTop();
  },

  // Expand a diagram node's compact detail inline (keeping the diagram visible) and drive the map.
  selectNode(id) {
    const detail = this.body.querySelector("#lin-detail");
    const nodes = this.body.querySelectorAll(".lin-node[data-open]");
    // Toggle off: clicking the open node collapses it and returns to project scope.
    if (id === this.selectedNode) {
      this.selectedNode = null;
      if (detail) detail.innerHTML = "";
      nodes.forEach((n) => n.classList.remove("active"));
      this.selectedDatasetId = null;
      this.selection = "project";
      if (typeof refreshVariableDropdowns === "function") refreshVariableDropdowns();
      if (typeof Insights !== "undefined") Insights.scheduleRender();
      return;
    }
    const d = DATASETS_META[id];
    if (!d || !detail) return;
    this.selectedNode = id;
    // Scope the panel + dropdowns to this dataset (mirrors renderDatasetDetail's side-effects).
    this.selectedDatasetId = id;
    this.selection = "dataset";
    if (typeof refreshVariableDropdowns === "function") refreshVariableDropdowns();
    if (typeof Insights !== "undefined") Insights.scheduleRender();
    nodes.forEach((n) => n.classList.toggle("active", n.dataset.open === id));
    detail.innerHTML = this.datasetInlineCard(id);
    detail.querySelector("[data-full]").onclick = () => this.renderDatasetDetail(id);
    detail.querySelectorAll("[data-inline-group]").forEach((c) => c.onclick = () => this.renderTagDetail("group", c.dataset.inlineGroup, "project"));
    this.applyRecommended(id);
  },

  // Compact inline card: header + description + the "On the 3D map" reading + a few
  // metrics + (for grouped datasets) the theme-group boxes.
  datasetInlineCard(id) {
    const d = DATASETS_META[id];
    if (!d) return "";
    const catGroups = d.categoryGroupKind === "sales" ? SALES_GROUPS : d.categoryGroupKind === "context" ? CONTEXT_GROUPS : null;
    return `
      <section class="title-block">
        <div class="icon">${d.icon}</div>
        <div><div class="name-row"><div class="name">${d.title}</div><div class="badge">${d.badge}</div></div><p class="desc">${d.description}</p></div>
      </section>
      ${this.mapPreviewHtml(d)}
      <div class="key-metrics">${d.metrics.slice(0, 4).map((m, i) => `<div class="metric-block ${i < 2 ? "primary" : ""}"><span class="metric-key">${m[0]}</span><span class="metric-value">${m[1]}</span><span class="metric-sub">${m[2]}</span></div>`).join("")}</div>
      ${catGroups ? `<div class="section-title lin-groups-title"><span>Theme Groups</span><span>${Object.keys(catGroups).length} groups</span></div>
        <div class="category-grid">${Object.entries(catGroups).map(([k, g]) => `<div class="category-card" data-inline-group="${k}"><strong>${g.title}</strong><span>${g.examples.slice(0, 3).join(", ")}</span><div class="tag">${g.count} cols</div></div>`).join("")}</div>` : ""}
      <button class="lin-fulldetail" data-full>Full detail →</button>`;
  },

  renderStage(stage) {
    this.currentStage = stage;
    const data = LINEAGE[stage];
    const nm = document.getElementById("stageName");
    if (!nm) return;
    nm.textContent = data.name;
    document.getElementById("stageNote").textContent = data.note;
    document.getElementById("stageCount").textContent = data.count;
    document.getElementById("datasetGrid").innerHTML = data.items.map((it) => `
      <div class="dataset-mini" data-id="${it.id}">
        <div class="dataset-mini-top"><div class="dataset-mini-icon">${it.icon}</div><strong>${it.name}</strong></div>
        <span>${it.desc}</span><div class="tag">${it.tag}</div>
      </div>`).join("");
    this.body.querySelectorAll(".lineage-step").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.stage === stage);
      btn.onclick = () => this.renderStage(btn.dataset.stage);
    });
    this.body.querySelectorAll(".dataset-mini").forEach((c) => c.onclick = () => this.renderDatasetDetail(c.dataset.id));
  },

  // "On the 3D map" preview — what the map shows when this dataset is applied.
  // Reuses the map's ramps + rampGradient() (js/app.js) and Atlas.metricSpec.
  mapPreviewHtml(d) {
    const m = d.map || {};
    const modeLabel = { time: "Time-flow", metric: "Choropleth", geometry: "Boundary", boundary: "Boundary" }[m.mode] || "Map";
    const rg = (typeof rampGradient === "function") ? rampGradient : null;
    let grad = "", ends = "", enc = [];
    if (m.mode === "time" && typeof TEMP_HEAT_RANGE !== "undefined") {
      grad = rg ? rg(TEMP_HEAT_RANGE) : ""; ends = `<span>cool</span><span>hot</span>`;
      enc = ["heat-field: temperature", "rings: 6 sales themes", "time: animated"];
    } else if (m.mode === "metric" && m.key) {
      const spec = (typeof Atlas !== "undefined") ? Atlas.metricSpec(m.key) : null;
      const colorLabel = spec ? spec.label : m.key;
      const stops = (spec && spec.signed) ? (typeof RAMP_DIVERGING !== "undefined" ? RAMP_DIVERGING : null)
                                          : (typeof RAMP_SEQUENTIAL !== "undefined" ? RAMP_SEQUENTIAL : null);
      grad = (stops && rg) ? rg(stops) : "";
      ends = (spec && spec.signed) ? `<span>sensitive</span><span>0</span><span>resilient</span>` : `<span>low</span><span>high</span>`;
      enc = [`color: ${colorLabel}`, "height: none", "time: off"];
    } else { enc = ["shape: dong boundaries", "time: off"]; }
    return `
      <section>
        <div class="section-title"><span>On the 3D map</span><span>${modeLabel}</span></div>
        ${d.mapTells ? `<p class="map-tells">${d.mapTells}</p>` : ""}
        ${grad ? `<div class="map-ramp" style="background:${grad}"></div><div class="map-ends">${ends}</div>` : ""}
        <div class="map-enc">${enc.map((e) => `<span>${e}</span>`).join("")}</div>
      </section>`;
  },

  // ---------- Dataset Detail ----------
  renderDatasetDetail(id) {
    const d = DATASETS_META[id];
    if (!d) return;
    this.setTab("detail");
    this.currentDatasetForBack = id;
    // The variable dropdowns scope to the dataset currently open in the detail.
    this.selectedDatasetId = id;
    this.selection = "dataset";
    if (typeof refreshVariableDropdowns === "function") refreshVariableDropdowns();
    if (typeof Insights !== "undefined") Insights.scheduleRender();
    this.label.textContent = "Dataset Detail";
    this.modeLabel.textContent = "Dataset Detail";
    this.modeStrong.textContent = d.title;
    const catGroups = d.categoryGroupKind === "sales" ? SALES_GROUPS : d.categoryGroupKind === "context" ? CONTEXT_GROUPS : null;
    // The whole variable list: every column (grouped datasets flatten all their
    // theme-group columns; others just use their chip list).
    const allCols = catGroups ? [...new Set(Object.values(catGroups).flatMap((g) => g.columns))] : d.chips;
    this.body.innerHTML = `
      <button class="back-btn" data-back>← Back to UHUS lineage</button>
      <section class="title-block">
        <div class="icon">${d.icon}</div>
        <div><div class="name-row"><div class="name">${d.title}</div><div class="badge">${d.badge}</div></div><p class="desc">${d.description}</p></div>
      </section>
      <div class="divider"></div>
      ${this.mapPreviewHtml(d)}
      ${id === "rhsi" && typeof howToReadRhsiHtml === "function" ? `<div class="divider"></div><section class="detail-insights">${howToReadRhsiHtml()}</section>` : ""}
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>Primary Structure</span><span>key blocks</span></div>
        <div class="key-metrics">${d.metrics.map((m, i) => `<div class="metric-block ${i < 2 ? "primary" : ""}"><span class="metric-key">${m[0]}</span><span class="metric-value">${m[1]}</span><span class="metric-sub">${m[2]}</span></div>`).join("")}</div>
      </section>
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>Administrative Metadata</span><span>source rows</span></div>
        <div class="technical-rows">${d.metadata.map((r) => `<div class="tech-row"><span class="tech-key">${r[0]}</span><span class="tech-value">${r[1]}</span></div>`).join("")}</div>
      </section>
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>Variables</span><span>${d.importantVars.length + allCols.length} total</span></div>
        <div class="variable-focus">${d.importantVars.map((v) => `<div class="var-row clickable" data-var="${v[0]}"><span class="var-name">${v[0]}</span><span class="var-role ${v[2] === "key" ? "key" : ""}">${v[1]}</span></div>`).join("")}</div>
        <div class="chips">${allCols.map((c) => `<span class="chip clickable" data-var="${c}">${c}</span>`).join("")}</div>
        <div class="click-hint">${catGroups ? "The whole column list for this dataset — click one for its schema." : "Click a variable to open its variable tag panel."}</div>
      </section>
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>Recommended Views</span><span>outputs</span></div>
        <div class="views">${d.views.map((v, i) => `<div class="view ${i === 0 ? "active" : ""}">${ICONS.chart}${v}</div>`).join("")}</div>
      </section>
      <button class="cta" data-cta>Show Dataset on Map ＋</button>`;

    this.body.querySelector("[data-back]").onclick = () => this.renderProject();
    this.body.querySelector("[data-cta]").onclick = () => this.applyRecommended(id);
    this.body.querySelectorAll(".var-row[data-var], .chip[data-var]").forEach((el) => el.onclick = () => this.renderTagDetail("variable", el.dataset.var, "dataset"));
    this.applyRecommended(id); // opening a dataset applies its recommended map + syncs the panel
    this.scrollTop();
  },

  // ---------- Tag Detail (group / key / variable) ----------
  buildTag(kind, id) {
    if (kind === "group") {
      const g = SALES_GROUPS[id] || CONTEXT_GROUPS[id];
      const isSales = !!SALES_GROUPS[id];
      return { kind, title: g.title, badge: "theme group", icon: ICONS.sales,
        desc: `${g.title} — ${g.use}.`,
        form: [["Tag type", "theme variable group"], ["Column count", `${g.count}`], ["Source", isSales ? "sales.csv" : "Urban_Features.csv"], ["Used for", g.use]],
        connected: isSales ? ["sales", "sectorprofile"] : ["context"],
        columns: g.columns, relation: [isSales ? "sales.csv" : "Urban_Features.csv", g.title, "Map / profile"],
        cta: "Show Group Profile", map: isSales ? { mode: "time" } : { mode: "metric", key: g.mapKey } };
    }
    if (kind === "key") {
      const v = COMMON_VARS[id];
      return { kind, key: id, title: v.title, badge: v.role, icon: ICONS.map, desc: v.desc,
        form: [["Role", v.role], ["Join type", v.join], ["Datasets", `${v.connected.length}`], ["Used for", "linking datasets"]],
        connected: v.connected, columns: v.related, relation: v.relation, cta: "Show Join Path", map: v.map };
    }
    // variable
    const meta = VARIABLE_META[id] || ["Variable", "—", "—", "—", "—", null];
    return { kind: "variable", key: id, title: id, badge: VARIABLE_META[id] ? "variable" : "unmapped", icon: ICONS.chart, desc: meta[0],
      form: [["Definition", meta[0]], ["Formula", meta[1]], ["Unit", meta[2]], ["Source", meta[3]], ["Source type", meta[4]]],
      connected: meta[5] ? [meta[5]] : [], columns: [], relation: [meta[5] ? DATASETS_META[meta[5]].title : "Dataset", id, "Map"],
      cta: "Map This Variable", map: { mode: "variable", key: id } };
  },

  renderTagDetail(kind, id, backTarget) {
    const t = this.buildTag(kind, id);
    this.label.textContent = kind === "group" ? "Theme Variable Group Detail" : kind === "key" ? "Common Variable Detail" : "Variable Detail";
    this.modeLabel.textContent = "Tag Detail Panel";
    this.modeStrong.textContent = t.title;
    const backText = backTarget === "dataset" ? "← Back to dataset detail" : "← Back to UHUS lineage";
    this.body.innerHTML = `
      <button class="back-btn" data-back>${backText}</button>
      <section class="title-block">
        <div class="icon">${t.icon}</div>
        <div><div class="name-row"><div class="name">${t.title}</div><div class="badge">${t.badge}</div></div><p class="desc">${t.desc}</p></div>
      </section>
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>${kind === "variable" ? "Schema" : "Tag Structure"}</span><span>form</span></div>
        <div class="tag-form">${t.form.filter((r) => r[1] && r[1] !== "—").map((r) => `<div class="tag-form-row"><span class="tag-form-key">${r[0]}</span><span class="tag-form-value ${r[0] === "Formula" ? "mono" : ""}">${r[1]}</span></div>`).join("")}</div>
      </section>
      ${t.connected.length ? `<div class="divider"></div><section>
        <div class="section-title"><span>Connected Datasets</span><span>click to open</span></div>
        <div class="dataset-grid">${t.connected.map((cid) => `<div class="dataset-mini connected" data-connected="${cid}"><div class="dataset-mini-top"><div class="dataset-mini-icon">${DATASETS_META[cid].icon}</div><strong>${DATASETS_META[cid].title}</strong></div><div class="tag">${DATASETS_META[cid].badge}</div></div>`).join("")}</div>
      </section>` : ""}
      ${t.columns.length ? `<div class="divider"></div><section>
        <div class="section-title"><span>${kind === "group" ? "Included Columns" : "Related Variables"}</span><span>${t.columns.length}</span></div>
        <div class="columns-grid">${t.columns.map((c) => `<div class="column-pill">${c}</div>`).join("")}</div>
      </section>` : ""}
      <div class="divider"></div>
      <section>
        <div class="section-title"><span>Relationship</span><span>how to read it</span></div>
        <div class="relation-card">
          <div class="relation-flow"><div class="relation-node">${t.relation[0]}</div><div class="relation-arrow">→</div><div class="relation-node active">${t.relation[1]}</div><div class="relation-arrow">→</div><div class="relation-node">${t.relation[2]}</div></div>
        </div>
      </section>
      <button class="cta" data-cta>${t.cta} ＋</button>`;

    this.body.querySelector("[data-back]").onclick = () => (backTarget === "dataset" && this.currentDatasetForBack) ? this.renderDatasetDetail(this.currentDatasetForBack) : this.renderProject();
    this.body.querySelector("[data-cta]").onclick = () => this.applyTagMap(t);
    this.body.querySelectorAll("[data-connected]").forEach((c) => c.onclick = () => this.renderDatasetDetail(c.dataset.connected));
    this.applyTagMap(t); // reflect immediately
    this.scrollTop();
  },

  applyTagMap(t) {
    if (!t || !t.map) return;
    if (t.map.mode === "variable" || t.map.mode === "metric") this.applyVariable(t.map.key);
    else if (t.map.mode === "time") { if (typeof enterTimeMode === "function") enterTimeMode(); }
    else {
      // boundary / geometry / join-path: react by emphasising the boundary and
      // switching to the grain implied by the key (dong_code→dong, gu_code→gu).
      if (this.map.isTimeMode()) this.map.setTimeMode(false);
      this.map.setLayer("boundary", true);
      if (typeof syncLayerChecks === "function") syncLayerChecks();
      if (t.map.grain) this._setGrainUI(t.map.grain);
      else if (t.key && /dong/.test(t.key)) this._setGrainUI("dong");
      else if (t.key && /gu/.test(t.key)) this._setGrainUI("gu");
      if (typeof updateLegend === "function") updateLegend();
    }
  },

  // ---------- Recommend Set tab ----------
  // Recommended slider state per set (elevation / radius / opacity / glow), so a
  // set applies a full, tuned map view — not just the variable/mode.
  _applyView(v) {
    if (!this.map || !v) return;
    const set = (id, method, val, fmt) => {
      this.map[method](val);
      const el = document.getElementById(id); if (el) el.value = String(val);
      const out = document.getElementById(id + "-val"); if (out) out.textContent = fmt(val);
    };
    set("mc-elevation", "setElevationScale", v.elevation, (x) => x.toFixed(1));
    set("mc-radius", "setRadiusScale", v.radius, (x) => x.toFixed(1));
    set("mc-opacity", "setOpacity", v.opacity, (x) => x.toFixed(2));
    set("mc-glow", "setGlow", v.glow, (x) => x.toFixed(1));
  },

  bindRecommend() {
    // Representative slider presets recommended alongside each analysis set.
    const VIEWS = {
      "weather-sales-compare": { elevation: 1.0, radius: 1.4, opacity: 0.85, glow: 1.3 },
      "rhsi-context-map":      { elevation: 1.8, radius: 1.0, opacity: 0.92, glow: 1.0 },
      "sector-rhsi-profile":   { elevation: 1.0, radius: 1.2, opacity: 0.85, glow: 1.4 },
    };
    document.querySelectorAll(".uhus-r-card").forEach((card) => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".uhus-r-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        const set = card.dataset.setId;
        if (set === "weather-sales-compare") { if (typeof enterTimeMode === "function") enterTimeMode(); }
        else if (set === "rhsi-context-map") this.applyVariable("RHSI_retail");
        else if (set === "sector-rhsi-profile") { if (typeof enterTimeMode === "function") enterTimeMode(); }
        this._applyView(VIEWS[set]);
      });
    });
  },

  scrollTop() {
    const p = this.body.closest(".panel-body") || this.body;
    if (p && p.scrollTo) p.scrollTo({ top: 0, behavior: "smooth" });
  },
};

