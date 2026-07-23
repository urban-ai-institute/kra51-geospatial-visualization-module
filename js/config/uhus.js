// ── UHUS dataset config (this project) ───────────────────────────────
// Per-project, per-dataset declarations. Everything answering "what does THIS
// dataset offer" lives here; "how can the map draw" lives in representation.js.
//
//   DATASETS_META  — description, badge, metrics table, "how to read the map"
//   DATASET_REPS   — whitelist of representations a dataset may show
//   LS_DATASETS    — Layer-Set structures (pages) + temporal channels
//
// NOTE: DATASET_REPS is a SUPERSET of what the pages offer — it is the whitelist
// applyRepresentation validates against, while page.reps is what each structure
// puts in its picker. Deliberately NOT derived from each other (deriving would
// drop shap/context sector reps and `flat`).
// Loads after icons.js + representation.js, before panels.js / layerset/panel.js. (project-specific — a different project ships its own.)

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

const DATASET_REPS = {
  // Static designs are listed alongside the time views so a dataset can be shown
  // without animating (applyRepresentation rejects any rep missing from this list).
  weather:      ["heatfield", "compare", "choropleth", "flat", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  heatfeature:  ["heatfield", "compare", "choropleth", "flat", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  sales:        ["rings", 'choropleth', "flat", "radial", "columns", "dominant", "compare", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  sectorprofile:["columns", "rings", "radial", "dominant"],
  rhsi:         ["buildingmix", "choropleth", "flat", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  shap:         ["buildingmix", "signedcols", "columns", "divided",  "dominant", "rings", "radial", "choropleth", "flat", "bars", "points"],
  context:      ["choropleth", "flat", "columns", "divided", "buildingmix", "dominant", "rings", "radial", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  mobility:     ["choropleth", "flat", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  salesfeature: ["choropleth", "flat", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"],
  heatdays:     ["choropleth", "flat", "bars", "heatmap", "hexbin", "dotfield", "valuerings"],
  atlas:        ["dashboard", "compare", "rings"],
  dongbase:     ["boundary"],
  geometry:     ["boundary"],
};

// "Compare" = show several variables at once, each on its own design. This is the
// composite group; Single deliberately stays ONE variable.
const comparePage = (measures) => ({ key: "comparison", label: "Compare", icon: "⇄", supported: true,
  group: true, measures: measures, hint: "Several variables at once — each on its own design." });
const singlePage = (measures, hint) => ({ key: "single", label: "Single", icon: "▪", supported: true,
  reps: DESIGN_REPS, measures: measures, hint: hint });


// Built-in preset pages per dataset. supported=false → shown but greyed (real map can't render yet).
//   group:true  → the page is a composite group of variable-layers (one design each)
//   glyph:true  → the group also carries the six-theme sector glyph (Sales "Across")
// groupMeasures/baseRep parameterize the group engine so it isn't Sales-specific.
const LS_DATASETS = {
  sales: {
    groupMeasures: "salesGroups", baseRep: "choropleth",
    // What plays while animating. First entry is the default; more temporal datasets
    // just add a channel here rather than needing new UI.
    temporal: true, timeChannels: [{ label: "Sales", rep: "choropleth" }, { label: "Heat × Sales", rep: "compare" }],
    pages: [
      singlePage("salesGroups", "One theme's heat-sensitivity."),
      { key: "total", label: "Total", icon: "▣", supported: true, reps: DESIGN_REPS, measures: "salesTotal", hint: "All six themes summed — total card sales per dong." },
      { key: "across", label: "Across", icon: "▤", supported: true, group: true, glyph: true, reps: ["rings", "columns", "radial", "dominant"], measures: "salesGroups", hint: "All six sales themes at once, as per-dong glyphs." },
      { key: "within", label: "Within", icon: "⊞", supported: false, msg: "Per-group view is coming to the real map." },
      comparePage("salesGroups"),
    ],
  },
  rhsi: {
    pages: [
      { key: "single", label: "Single", icon: "▪", supported: true, reps: ["choropleth", "bars", "buildingmix", "points", "heatmap", "hexbin", "dotfield", "valuerings"], measures: "rhsiOnly", hint: "The retail heat-sensitivity index per dong." },
    ],
  },
  // Urban Features — composite group of urban-context variable-layers (same model as Sales Single).
  context: {
    groupMeasures: "contextVars", baseRep: "choropleth",
    // divided + buildingmix are declared by this dataset and their renderers exist,
    // so they belong in the design list alongside the generic ones.
    pages: [Object.assign(singlePage("contextVars", "One urban feature."),
              { reps: DESIGN_REPS.concat(["divided", "buildingmix"]) }),
            comparePage("contextVars")],
  },
  // SHAP — colours by RHSI (the value it explains); its "variables" are the signed feature
  // decomposition, driven by the app's own #shap-feature-filter, so no channel-layer group.
  shap: {
    pages: [
      { key: "single", label: "Single", icon: "▪", supported: true, reps: ["buildingmix", "signedcols", "divided", "choropleth", "bars", "points"], measures: "rhsiOnly", hint: "RHSI coloured by what the model explains — include/exclude features below." },
    ],
  },
  // ---- temporal datasets: static day-counts + an animated time view (right-rail toggle) ----
  weather: {
    groupMeasures: "weatherVars", baseRep: "choropleth",
    temporal: true, timeChannels: [{ label: "Heat", rep: "heatfield" }, { label: "Heat × Sales", rep: "compare" }],
    pages: [singlePage("weatherVars", "Hot / mild day counts — flip Time on for the day-by-day heat field."), comparePage("weatherVars")],
  },
  heatfeature: {
    groupMeasures: "weatherVars", baseRep: "choropleth",
    temporal: true, timeChannels: [{ label: "Heat", rep: "heatfield" }, { label: "Heat × Sales", rep: "compare" }],
    pages: [singlePage("weatherVars", "Heat-exposure day counts; Time plays the daily field."), comparePage("weatherVars")],
  },
  // ---- remaining static feature datasets ----
  salesfeature: {
    groupMeasures: "salesShareVars", baseRep: "choropleth",
    pages: [singlePage("salesShareVars", "Retail composition share per dong."), comparePage("salesShareVars")],
  },
  mobility: {
    groupMeasures: "mobilityVars", baseRep: "choropleth",
    pages: [singlePage("mobilityVars", "Day/night population response — the strongest RHSI driver."), comparePage("mobilityVars")],
  },
  heatdays: {
    groupMeasures: "weatherVars", baseRep: "choropleth",
    // heatdays does not declare "points", so offering it would be rejected by
    // applyRepresentation and silently fall back to choropleth.
    pages: [Object.assign(singlePage("weatherVars", "Qualifying hot / mild day counts behind RHSI."),
              { reps: DESIGN_REPS.filter((r) => r !== "points") }),
            comparePage("weatherVars")],
  },
  // Sector Profile reads the same six sales themes as glyphs.
  sectorprofile: {
    groupMeasures: "salesGroups",
    pages: [
      { key: "across", label: "Across", icon: "▤", supported: true, group: true, glyph: true, reps: ["columns", "rings", "radial", "dominant"], measures: "salesGroups", hint: "Sector profile as per-dong glyphs." },
    ],
  },
  atlas: {
    temporal: true, timeChannels: [{ label: "Heat × Sales", rep: "compare" }],
    pages: [
      { key: "single", label: "Single", icon: "▪", supported: true, reps: ["dashboard", "compare", "rings"], measures: "rhsiOnly", hint: "The combined atlas overview." },
    ],
  },
  // ---- base / reference layers: boundary only, no metric ----
  dongbase: {
    pages: [{ key: "single", label: "Base map", icon: "▫", supported: true, reps: ["boundary"], measures: null, hint: "Administrative dong / gu boundaries." }],
  },
  geometry: {
    pages: [{ key: "single", label: "Base map", icon: "▫", supported: true, reps: ["boundary"], measures: null, hint: "Dong geometry base layer." }],
  },
};

// ── UHUS variable dictionaries & lineage (pure data) ─────────────
// Moved from panels.js. VARIABLE_META = per-variable spec; SALES_GROUPS /
// CONTEXT_GROUPS = theme groupings; COMMON_VARS / LINEAGE / DATASET_CATALOG =
// the data-flow story cards. data.js reads SALES_GROUPS / CONTEXT_GROUPS lazily
// (typeof-guarded, at call time) so config loading after data.js is fine.

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
