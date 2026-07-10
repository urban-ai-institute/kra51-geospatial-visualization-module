// Seoul Data Atlas — real-data layer.
// Loads precomputed JSON (see scripts/prepare_data.py) and exposes lookup helpers.
// All facet keys (urban features / industries) come straight from the UHUS schema.

const URBAN_FEATURE_KEYS = [
  "land_price", "subway_access_coverage", "bus_stop_density", "retail_share",
  "dinebev_share_all", "everyday_retail_share_all", "general_share_all", "large_format_share_all",
  "elderly_share", "low_income_share", "residential_area_share", "commercial_area_share",
  "leisure_area_share", "transportation_area_share", "public_facility_area_share",
  "green_space_share", "activity_facility_density", "aged_housing_share", "parking_capacity",
  "dnpr", "delta_daypop",
];

const URBAN_FEATURE_LABELS = {
  land_price: "Land Price (log)", subway_access_coverage: "Subway Access", bus_stop_density: "Bus Stop Density",
  retail_share: "Retail Share", dinebev_share_all: "Dining/Bev Share", everyday_retail_share_all: "Everyday Retail Share",
  general_share_all: "General Retail Share", large_format_share_all: "Large-Format Share",
  elderly_share: "Elderly Share", low_income_share: "Low-Income Share", residential_area_share: "Residential Land",
  commercial_area_share: "Commercial Land", leisure_area_share: "Leisure Land", transportation_area_share: "Transport Land",
  public_facility_area_share: "Public Facility Land", green_space_share: "Green Space",
  activity_facility_density: "Activity Facility Density", aged_housing_share: "Aged Housing Share",
  parking_capacity: "Parking Capacity", dnpr: "Day/Night Pop Ratio", delta_daypop: "Δ Daypop (Hot vs Mild)",
};

// The 19 retail industries behind RHSI (sales_README §3-1) and their 4 groups.
const RETAIL_INDUSTRIES = [
  "korean_cuisine", "japanese_cuisine", "western_cuisine", "chinese_cuisine", "bakery", "cafe", "fast_food",
  "department_store", "supermarket_large_format", "discount_store", "shopping_mall",
  "chain_grocery", "independent_grocery", "convenience_store", "general_merchandise_imported", "liquor_store",
  "apparel", "fashion_accessories", "watches_jewelry",
];
// Sales-share features are outputs, not urban context — excluded from the
// "urban characteristics" correlation so it shows true built-environment drivers.
const SALES_SHARE_KEYS = new Set([
  "retail_share", "dinebev_share_all", "everyday_retail_share_all", "general_share_all", "large_format_share_all",
  "dinebev_share_retail", "everyday_retail_share_retail", "general_share_retail", "large_format_share_retail",
]);
const RETAIL_GROUPS = {
  "Dining & Beverage": ["korean_cuisine", "japanese_cuisine", "western_cuisine", "chinese_cuisine", "bakery", "cafe", "fast_food", "liquor_store"],
  "Everyday Retail": ["convenience_store", "chain_grocery", "independent_grocery", "general_merchandise_imported"],
  "General Retail": ["apparel", "fashion_accessories", "watches_jewelry"],
  "Large-format Retail": ["department_store", "supermarket_large_format", "discount_store", "shopping_mall"],
};

const DATASETS = [
  {
    id: "retail-heat-sensitivity",
    name: "Retail Heat Sensitivity",
    description: "How Seoul's retail sales respond to extreme heat, by administrative dong — card-transaction sensitivity explained by urban built-environment features.",
    badge: "Map Ready",
    spatialUnit: "Dong (422) / Gu (25)",
    temporalUnit: "Day",
    timeRange: "2024-01-01 – 2024-12-31",
    source: "Seoul AI Foundation · KMA · Seoul Open Data Plaza",
    lastUpdated: "2024-12-31",
    coverage: "422 / 422 dongs",
    disabled: false,
  },
  {
    id: "coming-soon",
    name: "Dataset 2",
    description: "Placeholder for the next dataset to be added to the atlas.",
    badge: "Low Confidence",
    spatialUnit: "—", temporalUnit: "—", timeRange: "—", source: "—", lastUpdated: "—", coverage: "—",
    disabled: true,
  },
];

const BADGE_META = {
  "Map Ready":      { dot: "#7DA7FF" },
  "Graph First":    { dot: "#FFB86B" },
  "Network":        { dot: "#E45C91" },
  "Joinable":       { dot: "#39E6E6" },
  "Time Series":    { dot: "#3FE6A5" },
  "Low Confidence": { dot: "#8C93A3" },
};

// ---------- quantile math (used by the map's sign-aware color scale) ----------
// 0..1 rank of `value` within `sortedAsc` (0 = the minimum, 1 = the maximum).
// Ties get their mid-rank (average index of the tied group) so equal values
// don't get pushed to different colors. Values not present in the array
// (e.g. an interpolated quantile-class midpoint) fall back to a lt/(n-1)
// approximation — fine since that path is only used for legend swatch color,
// not for coloring an actual data point.
function rankPosition(sortedAsc, value) {
  const n = sortedAsc.length;
  if (n <= 1) return 0.5;
  let lt = 0, eq = 0;
  for (const v of sortedAsc) { if (v < value) lt++; else if (v === value) eq++; }
  if (eq === 0) return Math.max(0, Math.min(1, lt / (n - 1)));
  return (lt + (eq - 1) / 2) / (n - 1);
}
// Linear-interpolated quantile at fraction q (0..1) of a sorted-ascending array.
function quantileSorted(sortedAsc, q) {
  const n = sortedAsc.length;
  if (!n) return 0;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * q, base = Math.floor(pos), rest = pos - base;
  return base + 1 < n ? sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]) : sortedAsc[base];
}
// k+1 boundary values splitting a sorted-ascending array into k quantile classes.
function quantileEdges(sortedAsc, k) {
  const edges = [];
  for (let i = 0; i <= k; i++) edges.push(quantileSorted(sortedAsc, i / k));
  return edges;
}

// A "scope" narrows every statistic: citywide, one gu, or one dong.
//   { level: 'city' }                       -> all 422 dongs
//   { level: 'gu',   guCode }               -> dongs in that gu
//   { level: 'dong', guCode, dongCode }     -> one dong (still shows context)
const Atlas = {
  loaded: false,
  guGeometry: [], dongGeometry: [], meta: null,
  dongMetrics: [], guMetrics: [],
  dongSales: [], industryCatalog: null, industryStats: {}, guTimeseries: {}, dongPointsRaw: {}, roads: {}, buildings: null, groupDaily: null, dongGroupDaily: null,
  dongByCode: new Map(), guByCode: new Map(), salesByDong: new Map(), dongGeomByCode: new Map(), guGeomByCode: new Map(),

  async load() {
    const base = "data/";
    const [guGeo, dongGeo, meta, dongM, guM, sales, catalog, indStats, ts, dongPts, roads, buildings, groupDaily, dongGroupDaily] = await Promise.all([
      fetch(base + "gu_geometry.json").then((r) => r.json()),
      fetch(base + "dong_geometry.json").then((r) => r.json()),
      fetch(base + "meta.json").then((r) => r.json()),
      fetch(base + "dong_metrics.json").then((r) => r.json()),
      fetch(base + "gu_metrics.json").then((r) => r.json()),
      fetch(base + "dong_sales_summary.json").then((r) => r.json()),
      fetch(base + "industry_catalog.json").then((r) => r.json()),
      fetch(base + "industry_stats.json").then((r) => r.json()),
      fetch(base + "gu_daily_timeseries.json").then((r) => r.json()),
      fetch(base + "dong_points.json").then((r) => r.json()),
      fetch(base + "roads.json").then((r) => r.json()),
      fetch(base + "buildings.json").then((r) => r.json()),
      fetch(base + "gu_group_daily.json").then((r) => r.json()),
      fetch(base + "dong_group_daily.json").then((r) => r.json()),
    ]);
    this.guGeometry = guGeo; this.dongGeometry = dongGeo; this.meta = meta;
    this.dongMetrics = dongM; this.guMetrics = guM;
    this.dongSales = sales; this.industryCatalog = catalog; this.industryStats = indStats; this.guTimeseries = ts;
    this.dongPointsRaw = dongPts; this.roads = roads; this.buildings = buildings; this.groupDaily = groupDaily;
    this.dongGroupDaily = dongGroupDaily;

    dongM.forEach((d) => this.dongByCode.set(d.dong_code, d));
    guM.forEach((g) => this.guByCode.set(g.gu_code, g));
    sales.forEach((s) => this.salesByDong.set(s.dong_code, s));
    dongGeo.forEach((d) => this.dongGeomByCode.set(d.dong_code, d));
    guGeo.forEach((g) => this.guGeomByCode.set(g.gu_code, g));
    this._buildDotField();
    this.loaded = true;
  },

  // Flatten synthesized in-polygon points into one array with a stable per-point
  // pseudo-random rank (0..1). The dot-density layer shows a point only when its
  // rank < the parent dong's normalized metric, so denser = higher value — without
  // re-sampling geometry when the metric changes.
  _buildDotField() {
    const flat = [];
    Object.entries(this.dongPointsRaw).forEach(([dongCode, pts]) => {
      const guCode = this.dongByCode.get(dongCode)?.gu_code || null;
      pts.forEach((p, i) => {
        // deterministic hash of (dongCode,i) → 0..1, so ranks are stable across renders
        let h = 2166136261 >>> 0;
        const s = dongCode + ":" + i;
        for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
        flat.push({ position: p, dongCode, guCode, rank: (h % 100000) / 100000 });
      });
    });
    this.dotField = flat;
  },

  // ---------- scope helpers ----------
  scopeLabel(scope) {
    if (scope.level === "dong") return this.dongByCode.get(scope.dongCode)?.dong_name || "Dong";
    if (scope.level === "gu") return this.guByCode.get(scope.guCode)?.gu_name || "Gu";
    return "Seoul";
  },

  // Dongs contributing to a scope's distribution. For a single dong we still
  // use its parent gu's dongs so histograms/scatters keep spatial context.
  dongsInScope(scope) {
    if (scope.level === "city") return this.dongMetrics;
    const gu = scope.guCode;
    return this.dongMetrics.filter((d) => d.gu_code === gu);
  },

  // Synthesized dots visible in a scope (all at city, one gu's when drilled).
  dotFieldForScope(scope) {
    if (scope.level === "city") return this.dotField;
    return this.dotField.filter((p) => p.guCode === scope.guCode);
  },

  // Centroids for the current scope's regions (gu at city scope, dongs otherwise)
  // — used by the rings and labels layers.
  regionCentroids(scope) {
    if (scope.level === "city") {
      return this.guGeometry.map((g) => ({ position: g.centroid, code: g.gu_code, name: g.gu_name, kind: "gu" }));
    }
    return this.dongGeometry
      .filter((d) => d.gu_code === scope.guCode)
      .map((d) => ({ position: d.centroid, code: d.dong_code, name: d.dong_name, kind: "dong" }));
  },

  // ---------- time-flow helpers (gu_daily_timeseries: 25 gu x 366 days 2024) ----------
  // Ordered gu codes and the shared date axis (all gu share the same 366 dates).
  _timeGuCodes() {
    if (!this._timeGus) this._timeGus = Object.keys(this.guTimeseries);
    return this._timeGus;
  },
  timeDates() {
    if (!this._timeDates) {
      const first = this.guTimeseries[this._timeGuCodes()[0]] || [];
      this._timeDates = first.map((d) => d.date);
    }
    return this._timeDates;
  },
  timeDayCount() { return this.timeDates().length; },

  // One 366-length series of {date, temp, sales} for a scope. Citywide = mean
  // temp / summed sales across gu; gu (or a drilled dong's parent gu) = that row.
  dailySeries(scope) {
    const dates = this.timeDates();
    const guCode = scope.level === "city" ? null
      : (scope.guCode || this.dongByCode.get(scope.dongCode)?.gu_code);
    if (guCode && this.guTimeseries[guCode]) {
      return this.guTimeseries[guCode].map((d) => ({ date: d.date, temp: d.temp_max, sales: d.retail_total_amount }));
    }
    const gus = this._timeGuCodes();
    return dates.map((date, i) => {
      let tempSum = 0, salesSum = 0;
      gus.forEach((g) => { const row = this.guTimeseries[g][i]; tempSum += row.temp_max; salesSum += row.retail_total_amount; });
      return { date, temp: tempSum / gus.length, sales: salesSum };
    });
  },

  // The two "playable" time-flow variables (selectable + auto-engaged on Play).
  TIME_VARS: {
    temp:  { field: "temp_max", label: "Daily temp (°C)", unit: "°C" },
    sales: { field: "retail_total_amount", label: "Daily sales (₩)", unit: "₩" },
  },

  // Per-gu value of a time variable on a given day → { gu_code: value }.
  dayValueByGu(dayIndex, kind = "temp") {
    const field = (this.TIME_VARS[kind] || this.TIME_VARS.temp).field;
    const out = {};
    this._timeGuCodes().forEach((g) => {
      const row = this.guTimeseries[g][dayIndex];
      if (row) out[g] = row[field];
    });
    return out;
  },
  dayTempByGu(dayIndex) { return this.dayValueByGu(dayIndex, "temp"); },

  // [min,max] of a time variable across the whole year (all gu, all days) —
  // stable normalization so the map scales consistently over the sweep.
  timeVarDomain(kind = "temp") {
    this._timeDomains = this._timeDomains || {};
    if (this._timeDomains[kind]) return this._timeDomains[kind];
    const field = (this.TIME_VARS[kind] || this.TIME_VARS.temp).field;
    let lo = Infinity, hi = -Infinity;
    this._timeGuCodes().forEach((g) => this.guTimeseries[g].forEach((d) => {
      if (d[field] < lo) lo = d[field];
      if (d[field] > hi) hi = d[field];
    }));
    this._timeDomains[kind] = [lo, hi];
    return this._timeDomains[kind];
  },
  tempYearDomain() { return this.timeVarDomain("temp"); },

  // ---------- sales theme groups (per-gu per-day, for the time-flow rings) ----------
  // Maximally distinct hues per theme group so overlapping rings stay legible:
  // magenta / blue / white / green / amber / orange-red span the whole wheel.
  GROUP_COLORS: [
    [255, 61, 218],  // fnb     — magenta
    [61, 140, 255],  // retail  — blue
    [240, 240, 255], // fashion — white
    [64, 229, 160],  // health  — green
    [255, 184, 77],  // leisure — amber
    [255, 90, 71],   // housing — orange-red
  ],
  themeGroups() { return (this.groupDaily && this.groupDaily.groups) || []; },
  groupColor(i) { return this.GROUP_COLORS[i % this.GROUP_COLORS.length]; },
  groupYearMax(i) { return (this.groupDaily && this.groupDaily.year_max[i]) || 1; },

  // Per-gu group-sales array on a day → { gu_code: [6 values] }.
  groupSalesByGu(dayIndex) {
    const out = {};
    if (!this.groupDaily) return out;
    Object.entries(this.groupDaily.gu).forEach(([g, rows]) => {
      const r = rows[dayIndex];
      if (r) out[g] = r.g;
    });
    return out;
  },
  // Per-dong group-sales for the dongs of one gu on a day → { dong_code: [6] }.
  // Used for the finer per-dong rings shown when a gu is drilled into.
  groupSalesByDongInGu(guCode, dayIndex) {
    const out = {};
    if (!this.dongGroupDaily) return out;
    this.dongGeometry.forEach((d) => {
      if (d.gu_code !== guCode) return;
      const series = this.dongGroupDaily.dong[d.dong_code];
      if (series && series[dayIndex]) out[d.dong_code] = series[dayIndex];
    });
    return out;
  },
  groupYearMaxDong(i) { return (this.dongGroupDaily && this.dongGroupDaily.year_max[i]) || 1; },

  industryScopeKey(scope) {
    return scope.level === "city" ? "city" : scope.guCode;
  },

  industryLabel(key) {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  },

  // ---------- RHSI statistics ----------
  rhsiStats(scope) {
    const dongs = this.dongsInScope(scope);
    const vals = dongs.map((d) => d.RHSI_retail);
    const mean = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const sensitive = vals.filter((v) => v < 0).length;
    const selected = scope.level === "dong" ? this.dongByCode.get(scope.dongCode) : null;
    return {
      count: vals.length,
      mean,
      sensitive,
      resilient: vals.length - sensitive,
      selectedRhsi: selected ? selected.RHSI_retail : null,
      selectedRank: selected ? selected.rhsi_rank : null,
      totalDongs: this.dongMetrics.length,
    };
  },

  // Histogram bins of RHSI across the scope's dongs.
  rhsiHistogram(scope, bins = 16) {
    const vals = this.dongsInScope(scope).map((d) => d.RHSI_retail);
    const lo = Math.min(...this.dongMetrics.map((d) => d.RHSI_retail));
    const hi = Math.max(...this.dongMetrics.map((d) => d.RHSI_retail));
    const width = (hi - lo) / bins;
    const out = Array.from({ length: bins }, (_, i) => ({
      x0: lo + i * width,
      x1: lo + (i + 1) * width,
      count: 0,
      sensitive: (lo + (i + 0.5) * width) < 0,
    }));
    vals.forEach((v) => {
      let idx = Math.floor((v - lo) / width);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      out[idx].count++;
    });
    return out;
  },

  // ---------- WHY: SHAP feature importance (ranked) ----------
  featureImportance(scope, n = 10) {
    const dongs = this.dongsInScope(scope);
    const rows = URBAN_FEATURE_KEYS.map((k) => {
      const mag = dongs.reduce((s, d) => s + Math.abs(d["shap_" + k] || 0), 0) / (dongs.length || 1);
      const signed = dongs.reduce((s, d) => s + (d["shap_" + k] || 0), 0) / (dongs.length || 1);
      return { key: k, label: URBAN_FEATURE_LABELS[k], importance: mag, signed };
    });
    return rows.sort((a, b) => b.importance - a.importance).slice(0, n);
  },

  // Signed top drivers for a single dong (± contributions).
  signedDrivers(dongCode, n = 8) {
    const rec = this.dongByCode.get(dongCode);
    if (!rec) return [];
    return URBAN_FEATURE_KEYS
      .map((k) => ({ key: k, label: URBAN_FEATURE_LABELS[k], value: rec["shap_" + k] || 0 }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, n);
  },

  // Scatter of one urban feature vs RHSI across the scope's dongs.
  featureScatter(scope, featureKey) {
    return this.dongsInScope(scope).map((d) => ({
      x: d[featureKey], y: d.RHSI_retail, dong_code: d.dong_code, dong_name: d.dong_name,
    }));
  },

  // ---------- WHAT: industry winners / losers ----------
  // Filter out low-volume noise, then return the strongest ± sensitivities.
  industryRanking(scope, n = 8) {
    const block = this.industryStats[this.industryScopeKey(scope)] || this.industryStats.city || [];
    const withVol = block.filter((r) => r.sensitivity != null && r.volume > 0);
    // keep the meaningful-volume industries (top ~30 by volume within scope)
    const volSorted = [...withVol].sort((a, b) => b.volume - a.volume).slice(0, 30);
    const bySens = [...volSorted].sort((a, b) => a.sensitivity - b.sensitivity);
    const losers = bySens.slice(0, n).map((r) => ({ ...r, label: this.industryLabel(r.key) }));
    const winners = bySens.slice(-n).reverse().map((r) => ({ ...r, label: this.industryLabel(r.key) }));
    return { winners, losers };
  },

  // Per-dong sensitivity ranking for one industry (uses the top-20 per-dong summary).
  industryDongRanking(industryKey, ascending = true, n = 10) {
    return this.dongSales
      .map((s) => {
        const hot = s[industryKey + "_hot"], mild = s[industryKey + "_mild"];
        if (hot == null || mild == null || mild === 0) return null;
        const dong = this.dongByCode.get(s.dong_code);
        return { dong_code: s.dong_code, dong_name: dong ? dong.dong_name : s.dong_code, sensitivity: (hot - mild) / mild };
      })
      .filter(Boolean)
      .sort((a, b) => (ascending ? a.sensitivity - b.sensitivity : b.sensitivity - a.sensitivity))
      .slice(0, n);
  },

  // Whether we have per-dong hot/mild detail for an industry (only top-20).
  hasDongIndustry(industryKey) {
    const s = this.dongSales[0];
    return s && (industryKey + "_hot") in s;
  },

  industryHotMild(scope, industryKey) {
    if (scope.level === "dong" && this.hasDongIndustry(industryKey)) {
      const s = this.salesByDong.get(scope.dongCode);
      return { hot: s ? s[industryKey + "_hot"] : null, mild: s ? s[industryKey + "_mild"] : null, label: "This Dong" };
    }
    const block = this.industryStats[this.industryScopeKey(scope)] || this.industryStats.city;
    const rec = block.find((r) => r.key === industryKey);
    return { hot: rec ? rec.hot : null, mild: rec ? rec.mild : null, label: this.scopeLabel(scope) };
  },

  // ============ RHSI dashboard (video spec) ============
  // RHSI/HSI shown as % on the map ≈ (e^RHSI − 1)·100. industry sensitivity = (hot−mild)/mild.
  rhsiToPct(v) { return v == null || Number.isNaN(v) ? null : (Math.exp(v) - 1) * 100; },
  // industry_stats is per city / gu; a dong falls back to its gu's mix.
  industryBlock(scope) {
    const key = scope.level === "city" ? "city" : scope.guCode;
    return this.industryStats[key] || this.industryStats.city || [];
  },
  _sumHotMild(block, keys) {
    let hot = 0, mild = 0, any = false;
    keys.forEach((k) => { const r = block.find((x) => x.key === k); if (r && r.hot != null && r.mild != null) { hot += r.hot; mild += r.mild; any = true; } });
    return any ? { hot, mild } : null;
  },
  // RHSI over the 19 retail industries — per-dong exact, else log(Σhot / Σmild).
  retailHSI(scope) {
    if (scope.level === "dong") { const d = this.dongByCode.get(scope.dongCode); return d ? d.RHSI_retail : null; }
    if (scope.level === "gu") { const g = this.guByCode.get(scope.guCode); if (g && g.RHSI_retail != null) return g.RHSI_retail; }
    const s = this._sumHotMild(this.industryBlock(scope), RETAIL_INDUSTRIES);
    return s && s.mild > 0 ? Math.log(s.hot / s.mild) : null;
  },
  allIndustryHSI(scope) {
    const block = this.industryBlock(scope);
    let hot = 0, mild = 0;
    block.forEach((r) => { if (r.hot != null && r.mild != null) { hot += r.hot; mild += r.mild; } });
    return mild > 0 ? Math.log(hot / mild) : null;
  },
  // Most heat-sensitive industry — per-dong from the top-20 detail, else industry_stats.
  mostSensitiveIndustry(scope) {
    let block;
    const probe = (this.industryCatalog?.top20 || [])[0];
    if (scope.level === "dong" && probe && this.hasDongIndustry(probe.replace("_amount", ""))) {
      const s = this.salesByDong.get(scope.dongCode);
      block = (this.industryCatalog.top20 || []).map((c) => {
        const k = c.replace("_amount", ""); const hot = s ? s[k + "_hot"] : null, mild = s ? s[k + "_mild"] : null;
        return (hot != null && mild != null && mild > 0) ? { key: k, hot, mild, sensitivity: (hot - mild) / mild } : null;
      }).filter(Boolean).filter((r) => RETAIL_INDUSTRIES.includes(r.key));
    }
    // RHSI is a retail index → the most-sensitive industry is drawn from the 19 retail sectors.
    if (!block || !block.length) {
      block = this.industryBlock(scope).filter((r) => RETAIL_INDUSTRIES.includes(r.key) && r.sensitivity != null && r.mild > 0);
    }
    if (!block.length) return null;
    const sorted = [...block].sort((a, b) => a.sensitivity - b.sensitivity);
    const r = sorted[0];
    return { key: r.key, label: this.industryLabel(r.key), hot: r.hot, mild: r.mild, sensitivity: r.sensitivity, rhsi: r.mild > 0 ? Math.log(r.hot / r.mild) : null, rank: 1 };
  },
  heatDayCounts(scope) {
    const dongs = this.dongsInScope(scope);
    if (!dongs.length) return { hot: 0, mild: 0 };
    return {
      hot: Math.round(dongs.reduce((s, d) => s + (d.n_hot_days || 0), 0) / dongs.length),
      mild: Math.round(dongs.reduce((s, d) => s + (d.n_mild_days || 0), 0) / dongs.length),
    };
  },
  deltaDaypop(scope) {
    const vals = this.dongsInScope(scope).map((d) => d.delta_daypop).filter((v) => v != null && !Number.isNaN(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  },
  // Top-|Pearson| urban features vs RHSI across all 422 dongs (city-wide, constant).
  rhsiCorrelations(n = 5) {
    if (this._rhsiCorr) return this._rhsiCorr.slice(0, n);
    const dongs = this.dongMetrics, y = dongs.map((d) => d.RHSI_retail);
    const my = y.reduce((s, v) => s + v, 0) / y.length;
    const rows = URBAN_FEATURE_KEYS.filter((k) => !SALES_SHARE_KEYS.has(k)).map((k) => {
      const x = dongs.map((d) => d[k]); const mx = x.reduce((s, v) => s + v, 0) / x.length;
      let num = 0, dx = 0, dy = 0;
      for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; num += a * b; dx += a * a; dy += b * b; }
      return { key: k, label: URBAN_FEATURE_LABELS[k], r: num / (Math.sqrt(dx * dy) || 1) };
    }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    this._rhsiCorr = rows;
    return rows.slice(0, n);
  },
  retailGroupHeatResponse(scope) {
    const block = this.industryBlock(scope);
    return Object.entries(RETAIL_GROUPS).map(([name, keys]) => {
      const s = this._sumHotMild(block, keys);
      if (!s || s.mild <= 0) return { name, mild: null, hot: null, change: null, hsi: null };
      return { name, mild: s.mild, hot: s.hot, change: (s.hot - s.mild) / s.mild, hsi: Math.log(s.hot / s.mild) };
    });
  },

  // ============ Map-metric layer ============
  // A metric spec = { key, label, kind:'rhsi'|'feature'|'industry', signed }.
  // These populate the map's Color-by / Height-by dropdowns and 3D-scatter axes.
  dongIndustrySensitivity(dongCode, industryKey) {
    const s = this.salesByDong.get(dongCode);
    if (!s) return null;
    const hot = s[industryKey + "_hot"], mild = s[industryKey + "_mild"];
    if (hot == null || mild == null || mild === 0) return null;
    return (hot - mild) / mild;
  },

  availableMapMetrics() {
    const metrics = [{ key: "RHSI_retail", label: "RHSI (heat sensitivity)", kind: "rhsi", signed: true }];
    URBAN_FEATURE_KEYS.forEach((k) =>
      metrics.push({ key: k, label: URBAN_FEATURE_LABELS[k], kind: "feature", signed: k === "delta_daypop" }));
    (this.industryCatalog?.top20 || []).forEach((c) => {
      const key = c.replace("_amount", "");
      metrics.push({ key, label: this.industryLabel(key) + " (sens.)", kind: "industry", signed: true });
    });
    return metrics;
  },

  metricSpec(key) {
    return this.availableMapMetrics().find((m) => m.key === key) || null;
  },

  metricValue(dong, spec) {
    if (!spec) return null;
    if (spec.kind === "industry") return this.dongIndustrySensitivity(dong.dong_code, spec.key);
    return dong[spec.key];
  },

  // [min, max] across the scope's dongs; symmetric around 0 for signed metrics.
  // NOTE: kept for any continuous-scale fallback use, but the map's fill color
  // now uses metricColorScale() below — plain min/max normalization washes out
  // skewed signed metrics (see metricColorScale doc comment).
  metricDomain(scope, spec) {
    const vals = this.dongsInScope(scope).map((d) => this.metricValue(d, spec)).filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length) return [0, 1];
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (spec.signed) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    if (lo === hi) hi = lo + 1e-6;
    return [lo, hi];
  },

  // Mean of a metric across one gu's dongs (client-side; gu_metrics.json only
  // pre-aggregates RHSI_retail, so every other metric needs this at city scope).
  guAggregateValue(guCode, spec) {
    if (spec.key === "RHSI_retail") {
      const g = this.guByCode.get(guCode);
      return g ? g.RHSI_retail : null;
    }
    const vals = this.dongMetrics
      .filter((d) => d.gu_code === guCode)
      .map((d) => this.metricValue(d, spec))
      .filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  },

  // The actual set of values behind whatever the map is currently rendering:
  // 25 gu aggregates at city scope (since that's what's drawn), dong values otherwise.
  mapFeatureValues(scope, spec) {
    if (scope.level === "city") {
      return this.guGeometry
        .map((g) => this.guAggregateValue(g.gu_code, spec))
        .filter((v) => v != null && !Number.isNaN(v));
    }
    return this.dongsInScope(scope)
      .map((d) => this.metricValue(d, spec))
      .filter((v) => v != null && !Number.isNaN(v));
  },

  // Sign-aware quantile color scale. Plain min/max normalization washes out
  // skewed signed metrics (e.g. RHSI: mean -0.05, 338/422 negative) because
  // almost every value lands near t=0.5, the pale ramp midpoint. Instead, rank
  // negatives and non-negatives independently within their own half of the
  // ramp, so each side stretches to full saturation regardless of skew, while
  // zero still anchors at the visual midpoint (preserves the sign semantics).
  // Returns a `(value) => t|null` closure, computed once per render (not once
  // per feature) since building the sorted arrays is the expensive part.
  metricColorScale(scope, spec) { return this.colorScaleFromValues(this.mapFeatureValues(scope, spec), spec); },

  // Same rank logic as metricColorScale but driven by an explicit value array —
  // lets the map build a scale from whatever grain (seoul/gu/dong) it renders,
  // decoupled from the camera scope.
  colorScaleFromValues(vals, spec) {
    if (spec.signed) {
      const neg = vals.filter((v) => v < 0).sort((a, b) => a - b);
      const pos = vals.filter((v) => v >= 0).sort((a, b) => a - b);
      return (value) => {
        if (value == null || Number.isNaN(value)) return null;
        if (value < 0) return neg.length ? 0.5 * rankPosition(neg, value) : 0.5;
        return pos.length ? 0.5 + 0.5 * rankPosition(pos, value) : 0.5;
      };
    }
    const sorted = [...vals].sort((a, b) => a - b);
    return (value) => (value == null || Number.isNaN(value) ? null : rankPosition(sorted, value));
  },

  // 0..1 magnitude scale by rank of |value| across the scope — used for ring
  // radius and dot-density thresholds where "how much" (not sign) drives size.
  metricMagnitudeScale(scope, spec) { return this.magnitudeScaleFromValues(this.mapFeatureValues(scope, spec), spec); },
  magnitudeScaleFromValues(vals, spec) {
    const mags = vals.map((v) => Math.abs(v)).sort((a, b) => a - b);
    return (value) => (value == null || Number.isNaN(value) ? 0 : rankPosition(mags, Math.abs(value)));
  },

  // Whole-Seoul aggregate of a metric = mean of the 25 gu aggregates.
  cityAggregateValue(spec) {
    const vals = this.guGeometry.map((g) => this.guAggregateValue(g.gu_code, spec)).filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  },

  // The value set behind a chosen spatial grain (seoul=1 / gu=25 / dong=422),
  // respecting the drilled gu when one is selected.
  valuesForGrain(grain, scope, spec) {
    if (grain === "seoul") { const v = this.cityAggregateValue(spec); return v == null ? [] : [v]; }
    if (grain === "gu") {
      const gus = scope.level === "city" ? this.guGeometry : this.guGeometry.filter((g) => g.gu_code === scope.guCode);
      return gus.map((g) => this.guAggregateValue(g.gu_code, spec)).filter((v) => v != null && !Number.isNaN(v));
    }
    const dongs = scope.level === "city" ? this.dongMetrics : this.dongMetrics.filter((d) => d.gu_code === scope.guCode);
    return dongs.map((d) => this.metricValue(d, spec)).filter((v) => v != null && !Number.isNaN(v));
  },

  // Discrete legend classes (kepler/ColorBrewer style): { lo, hi, t } per class,
  // t already resolved through the same rank logic as metricColorScale so the
  // legend swatch colors always match what's actually painted on the map.
  metricClassBreaks(scope, spec, nClasses = 6) { return this.classBreaksFromValues(this.mapFeatureValues(scope, spec), spec, nClasses); },
  classBreaksFromValues(vals, spec, nClasses = 6) {
    if (!vals.length) return [];
    const classes = [];
    if (spec.signed) {
      const neg = vals.filter((v) => v < 0).sort((a, b) => a - b);
      const pos = vals.filter((v) => v >= 0).sort((a, b) => a - b);
      let kNeg = neg.length ? Math.max(1, Math.round(nClasses * neg.length / vals.length)) : 0;
      if (neg.length && pos.length) kNeg = Math.min(nClasses - 1, kNeg);
      const kPos = pos.length ? nClasses - kNeg : 0;
      if (neg.length) {
        const edges = quantileEdges(neg, kNeg);
        for (let i = 0; i < kNeg; i++) {
          const lo = edges[i], hi = edges[i + 1], mid = (lo + hi) / 2;
          classes.push({ lo, hi, t: 0.5 * rankPosition(neg, mid) });
        }
      }
      if (pos.length) {
        const edges = quantileEdges(pos, kPos);
        for (let i = 0; i < kPos; i++) {
          const lo = edges[i], hi = edges[i + 1], mid = (lo + hi) / 2;
          classes.push({ lo, hi, t: 0.5 + 0.5 * rankPosition(pos, mid) });
        }
      }
      return classes;
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const edges = quantileEdges(sorted, nClasses);
    for (let i = 0; i < nClasses; i++) {
      const lo = edges[i], hi = edges[i + 1], mid = (lo + hi) / 2;
      classes.push({ lo, hi, t: rankPosition(sorted, mid) });
    }
    return classes;
  },

  // ============ Composition (donut) ============
  COMPOSITION: {
    landuse: [
      ["residential_area_share", "Residential"], ["commercial_area_share", "Commercial"],
      ["leisure_area_share", "Leisure"], ["transportation_area_share", "Transport"],
      ["public_facility_area_share", "Public Facility"], ["green_space_share", "Green Space"],
    ],
    retail: [
      ["dinebev_share_all", "Dining & Beverage"], ["everyday_retail_share_all", "Everyday Retail"],
      ["general_share_all", "General Retail"], ["large_format_share_all", "Large-Format"],
    ],
  },

  composition(scope, kind = "landuse") {
    const cols = this.COMPOSITION[kind];
    const dongs = this.dongsInScope(scope);
    const rows = cols.map(([key, name]) => ({
      name,
      value: dongs.reduce((s, d) => s + (d[key] || 0), 0) / (dongs.length || 1),
    }));
    if (kind === "retail") {
      const sum = rows.reduce((s, r) => s + r.value, 0);
      if (sum < 1) rows.push({ name: "Other / Non-retail", value: Math.max(0, 1 - sum) });
    }
    return rows.map((r) => ({ name: r.name, value: +(r.value * 100).toFixed(1) }));
  },

  // ============ Surface grid (RHSI over two features) ============
  // Returns { xs, ys, data:[[xi, yi, meanRHSI], ...] } for an echarts-gl surface.
  surfaceGrid(featAKey, featBKey, bins = 12) {
    const dongs = this.dongMetrics;
    const ax = dongs.map((d) => d[featAKey]).filter((v) => v != null);
    const bx = dongs.map((d) => d[featBKey]).filter((v) => v != null);
    const [aLo, aHi] = [Math.min(...ax), Math.max(...ax)];
    const [bLo, bHi] = [Math.min(...bx), Math.max(...bx)];
    const aw = (aHi - aLo) / bins || 1, bw = (bHi - bLo) / bins || 1;
    const sum = Array.from({ length: bins }, () => new Array(bins).fill(0));
    const cnt = Array.from({ length: bins }, () => new Array(bins).fill(0));
    dongs.forEach((d) => {
      if (d[featAKey] == null || d[featBKey] == null) return;
      let i = Math.min(bins - 1, Math.floor((d[featAKey] - aLo) / aw));
      let j = Math.min(bins - 1, Math.floor((d[featBKey] - bLo) / bw));
      sum[i][j] += d.RHSI_retail; cnt[i][j]++;
    });
    // Fill empty cells with nearest column mean so the surface stays continuous.
    const data = [];
    const xs = [], ys = [];
    for (let i = 0; i < bins; i++) xs.push(+(aLo + (i + 0.5) * aw).toFixed(3));
    for (let j = 0; j < bins; j++) ys.push(+(bLo + (j + 0.5) * bw).toFixed(3));
    const globalMean = dongs.reduce((s, d) => s + d.RHSI_retail, 0) / dongs.length;
    for (let i = 0; i < bins; i++) {
      for (let j = 0; j < bins; j++) {
        const z = cnt[i][j] ? sum[i][j] / cnt[i][j] : globalMean;
        data.push([xs[i], ys[j], +z.toFixed(4)]);
      }
    }
    return { xs, ys, data };
  },

  // ============ Feature correlation network ============
  featureCorrelation(threshold = 0.45) {
    const keys = URBAN_FEATURE_KEYS;
    const dongs = this.dongMetrics;
    const col = (k) => dongs.map((d) => d[k]);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const cols = {}; keys.forEach((k) => (cols[k] = col(k)));
    const means = {}; keys.forEach((k) => (means[k] = mean(cols[k])));
    const pearson = (ka, kb) => {
      const a = cols[ka], b = cols[kb], ma = means[ka], mb = means[kb];
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
      return num / (Math.sqrt(da * db) || 1);
    };
    const nodes = keys.map((k) => ({ id: k, name: URBAN_FEATURE_LABELS[k] }));
    const links = [];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const r = pearson(keys[i], keys[j]);
        if (Math.abs(r) >= threshold) links.push({ source: keys[i], target: keys[j], value: +r.toFixed(2) });
      }
    }
    return { nodes, links };
  },
};
