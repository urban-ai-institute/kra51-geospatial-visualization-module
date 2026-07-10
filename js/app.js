// Seoul Data Atlas — map-first build. The 3D map is the star; the right column
// is reserved for explanation cards (designed later). Spatial drill: gu → dong.

const state = {
  datasetId: DATASETS[0].id,
  scope: { level: "city", guCode: null, dongCode: null },
};
let map = null;

// ---------- Landing ----------
function initLanding() {
  document.getElementById("cta-enter").addEventListener("click", enterDashboard);
}
function enterDashboard() {
  const landing = document.getElementById("landing");
  landing.classList.add("leaving");
  setTimeout(async () => {
    landing.classList.add("hidden");
    document.getElementById("dashboard").classList.remove("hidden");
    await initDashboard();
  }, 850);
}

// ---------- Dashboard boot ----------
async function initDashboard() {
  await Atlas.load();
  renderDatasetSwitch();

  map = new AtlasMap3D("map").init();
  map.onRegionClick = handleRegionClick;
  map.onRegionHover = handleRegionHover;

  initControlPanel();
  initTimeline();
  Panels.init(map);
  renderBreadcrumb();
  initSelectBox();
  updateLegend();
  initNavOverlay();
  initFooter();
  refreshVariableDropdowns(); // scope the variable dropdowns to the current dataset
  Insights.init();
}

// ---------- left-nav hover/pin overlay (per left_panel_explanation.md) ----------
// A SINGLE floating panel (the existing #map-control) that the side-nav hovers/
// pins. Its content swaps by nav item: "Map" shows the kepler controls
// (#mc-map-content); the others (Overview/Library/Saved/Settings) render into
// #mc-nav-content. Initial state: nothing visible.
const NAV_NAMES = { overview: "OVERVIEW", library: "LIBRARY", map: "MAP PANEL", saved: "SAVED", settings: "SETTINGS" };

function navPanelContent(key) {
  if (key === "overview") {
    return `<div class="mc-title">UHUS</div>
      <div class="nav-info-line">Urban Heat / Urban Sales</div>
      <div class="nav-info-stat"><span>Admin dongs</span><b>${Atlas.dongMetrics.length}</b></div>
      <div class="nav-info-stat"><span>Districts (gu)</span><b>${Atlas.guMetrics.length}</b></div>
      <div class="mc-title">CURRENT VIEW</div>
      <div class="nav-info-line">Weather × Sales Compare</div>
      <div class="mc-title">QUICK ACTIONS</div>
      <div class="compact-row" data-action="library"><span>Open Library</span></div>
      <div class="compact-row" data-action="map"><span>View Map</span></div>`;
  }
  if (key === "library") {
    // Project-first tree. data-detail ids map to Panels DATASETS_META keys.
    return `<div class="mc-title">PROJECTS</div>
      <div class="project-row active" data-detail="project_uhus">UHUS</div>
      <div class="lib-tree">
        <div class="folder-head">Input Datasets</div>
        <div class="dataset-row" data-detail="weather"><span>Daily_Weather.csv</span><span class="ftype">csv</span></div>
        <div class="dataset-row" data-detail="sales"><span>Sales.csv</span><span class="ftype">csv</span></div>
        <div class="dataset-row" data-detail="geometry"><span>Dong_Geometry.geojson</span><span class="ftype">geojson</span></div>
        <div class="folder-head">Feature Datasets</div>
        <div class="dataset-row" data-detail="context"><span>Urban_Features.csv</span><span class="ftype">csv</span></div>
        <div class="dataset-row" data-detail="salesfeature"><span>Sales Theme Groups</span><span class="ftype">group</span></div>
        <div class="folder-head">Index Datasets</div>
        <div class="dataset-row" data-detail="rhsi"><span>RHSI.csv</span><span class="ftype">csv</span></div>
        <div class="folder-head">View Layers</div>
        <div class="dataset-row" data-detail="atlas"><span>Combined Atlas View</span><span class="ftype">view</span></div>
        <div class="dataset-row" data-detail="sectorprofile"><span>Sector Profile View</span><span class="ftype">view</span></div>
      </div>`;
  }
  if (key === "saved") {
    return `<div class="mc-title">SAVED VIEWS</div>
      <div class="compact-row"><span class="lyr-dot" style="background:#9EDCF2"></span><span>Gangnam Hot Day Sales</span><span class="badge">place</span></div>
      <div class="compact-row"><span class="lyr-dot" style="background:#BED2EB"></span><span>RHSI Context Map</span><span class="badge">view</span></div>
      <div class="compact-row"><span class="lyr-dot" style="background:#FFB86B"></span><span>Sector Profile Compare</span><span class="badge">compare</span></div>`;
  }
  // settings
  return `<div class="mc-title">DISPLAY</div>
    <div class="nav-info-stat"><span>Theme</span><b>Night GIS</b></div>
    <div class="nav-info-stat"><span>Map style</span><b>Dark matter</b></div>
    <div class="nav-info-stat"><span>Unit display</span><b>Indexed</b></div>
    <div class="nav-info-stat"><span>Default year</span><b>2024</b></div>
    <div class="nav-info-stat"><span>Default aggregation</span><b>Gu</b></div>`;
}

// Library selection → right panel Detail tab + drive the map (via the CTA).
function openDatasetFromLibrary(id) {
  const detailTab = [...document.querySelectorAll(".uhus-panel-tab")].find((t) => /detail/i.test(t.textContent));
  if (detailTab) detailTab.click();
  if (typeof Panels === "undefined") return;
  if (id === "project_uhus") { Panels.renderProject(); return; }
  Panels.renderDatasetDetail(id);
  const cta = document.querySelector("#panelBody [data-cta]"); // "Show Dataset on Map"
  if (cta) cta.click();
}

function initNavOverlay() {
  const navItems = document.querySelectorAll(".side-nav .nav-item");
  const panel = document.getElementById("map-control");
  const panelName = document.getElementById("panel-name");
  const panelState = document.getElementById("panel-state");
  const navContent = document.getElementById("mc-nav-content");
  const mapContent = document.getElementById("mc-map-content");
  let pinned = null;
  let hoveringNav = false, hoveringPanel = false;

  function bindNavContent() {
    navContent.querySelectorAll("[data-detail]").forEach((row) => row.addEventListener("click", () => openDatasetFromLibrary(row.dataset.detail)));
    navContent.querySelectorAll("[data-action]").forEach((row) => row.addEventListener("click", () => {
      pinned = row.dataset.action; showPanel(pinned, "pinned");
    }));
  }
  function showPanel(key, state) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.nav === key));
    panelName.textContent = NAV_NAMES[key] || key.toUpperCase();
    panelState.textContent = state.toUpperCase();
    if (key === "map") {
      navContent.style.display = "none"; navContent.innerHTML = "";
      mapContent.style.display = "";
    } else {
      mapContent.style.display = "none";
      navContent.style.display = "";
      navContent.innerHTML = navPanelContent(key);
      bindNavContent();
    }
    panel.classList.add("show");
  }
  function hidePanel() { panel.classList.remove("show"); navItems.forEach((b) => b.classList.remove("active")); }
  function restore() { if (hoveringNav || hoveringPanel) return; if (pinned) showPanel(pinned, "pinned"); else hidePanel(); }

  navItems.forEach((btn) => {
    const key = btn.dataset.nav;
    btn.addEventListener("mouseenter", () => { hoveringNav = true; showPanel(key, pinned === key ? "pinned" : "hover"); });
    btn.addEventListener("mouseleave", () => { hoveringNav = false; setTimeout(restore, 110); });
    btn.addEventListener("click", () => { if (pinned === key) { pinned = null; hidePanel(); return; } pinned = key; showPanel(key, "pinned"); });
  });
  panel.addEventListener("mouseenter", () => { hoveringPanel = true; });
  panel.addEventListener("mouseleave", () => { hoveringPanel = false; setTimeout(restore, 110); });

  hidePanel(); // initial state: no floating panel visible (per spec)
}

// ---------- Time-flow controller ----------
const timeState = { playing: false, dayIndex: 0, speed: 1, _last: 0, _acc: 0, _raf: null };

function initTimeline() {
  Timeline.init({
    onToggle: () => (timeState.playing ? pausePlayback() : startPlayback()),
    onScrub: (i, reset) => scrubTo(i, reset),
    onSpeed: (s) => { timeState.speed = s; },
  });
  Timeline.setScope(state.scope);
}

// Entering time mode composes the dual view (temperature + sales groups),
// overriding the static metric until Reset.
function enterTimeMode() {
  if (!map.isTimeMode()) { map.setTimeMode(true); updateLegend(); }
}
function startPlayback() {
  enterTimeMode();
  timeState.playing = true;
  map.setPlaying(true);
  Timeline.setPlaying(true);
  timeState._last = performance.now();
  const step = (now) => {
    if (!timeState.playing) return;
    const dt = (now - timeState._last) / 1000; timeState._last = now;
    // ~6 days/sec at 1x → whole year sweeps in ~1min
    timeState._acc += dt * 6 * timeState.speed;
    if (timeState._acc >= 1) {
      timeState.dayIndex = (timeState.dayIndex + Math.floor(timeState._acc)) % Atlas.timeDayCount();
      timeState._acc -= Math.floor(timeState._acc);
      applyDay(timeState.dayIndex);
    }
    timeState._raf = requestAnimationFrame(step);
  };
  timeState._raf = requestAnimationFrame(step);
}
function pausePlayback() {
  timeState.playing = false;
  map.setPlaying(false);
  Timeline.setPlaying(false);
  if (timeState._raf) cancelAnimationFrame(timeState._raf);
}
function scrubTo(i, reset) {
  enterTimeMode();
  pausePlayback();
  timeState.dayIndex = i;
  applyDay(i);
  if (reset) exitTimeMode();
}
// Leave time-flow and return to the static metric view. Static controls call
// this so a change applies immediately instead of being swallowed by time mode
// (which suppresses the static data layers) — no manual Reset needed.
function exitTimeMode() {
  pausePlayback();
  if (map.isTimeMode()) map.setTimeMode(false);
  Timeline.setPlaying(false);
  if (Timeline._render) Timeline._render(0);
  const ro = document.getElementById("tl-readout");
  if (ro) ro.innerHTML = "Press play to sweep 2024 · temperature drives the heat glow";
  updateLegend();
}
function applyDay(i) {
  map.setTimeDay(i);
  Timeline.setDay(i);
}

function currentDataset() { return DATASETS.find((d) => d.id === state.datasetId); }

// ---------- Dataset switch ----------
function renderDatasetSwitch() {
  const el = document.getElementById("dataset-switch");
  el.innerHTML = DATASETS.map((ds) => {
    const meta = BADGE_META[ds.badge];
    return `<div class="ds-pill ${ds.id === state.datasetId ? "selected" : ""} ${ds.disabled ? "disabled" : ""}" data-id="${ds.id}">
      <span class="dot" style="background:${meta.dot}"></span>${ds.name}</div>`;
  }).join("");
  el.querySelectorAll(".ds-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const ds = DATASETS.find((d) => d.id === pill.dataset.id);
      if (ds.disabled) return;
      state.datasetId = ds.id;
      renderDatasetSwitch();
    });
  });
}

// ---------- footer metadata bar (per footer_metadata_bar_explanation.md) ----------
// Colours describe MAP layer roles, not data quality.
const FOOTER_LAYER_META = {
  boundary:  { c: "#7fe5ff", name: "Administrative Dong Boundary", role: "base" },
  roads:     { c: "#4f5b6d", name: "Basemap Roads / Rivers", role: "base" },
  buildings: { c: "#75d7b1", name: "Urban Context Extrusion", role: "context" },
  heatmap:   { c: "#78a8ff", name: "Heatmap", role: "weather" },
  pointCore: { c: "#9f8cff", name: "Point Core", role: "index" },
  pointHalo: { c: "#9f8cff", name: "Point Halo", role: "index" },
  influence: { c: "#ffb86b", name: "Value Rings", role: "metric" },
  choropleth:{ c: "#9f8cff", name: "RHSI Choropleth", role: "index" },
  columns:   { c: "#ffb86b", name: "3D Columns", role: "metric" },
  hexbin:    { c: "#ffd873", name: "Hexbin", role: "metric" },
  dotField:  { c: "#ffe08a", name: "Dot Field", role: "metric" },
  labels:    { c: "#eef6ff", name: "Dong Label Layer", role: "label" },
};

function activeFooterLayers() {
  const active = [];
  if (map.isTimeMode()) {
    active.push({ c: "#78a8ff", name: "Weather Heat Layer", role: "weather" });
    active.push({ c: "#ffb86b", name: "Sales Response Layer", role: "sales" });
  }
  Object.keys(FOOTER_LAYER_META).forEach((k) => { if (map.layers[k]) active.push(FOOTER_LAYER_META[k]); });
  if (state.scope.dongCode) active.push({ c: "#cf7897", name: "Selected District Highlight", role: "select" });
  return active;
}

function updateFooter() {
  if (!map || !document.getElementById("uhus-footer")) return;
  const active = activeFooterLayers();
  const shown = active.slice(0, 7);
  const more = active.length - shown.length;
  document.getElementById("footer-layer-dots").innerHTML = shown.map((l) => `<span class="layer-dot" style="--c:${l.c}"></span>`).join("");
  document.getElementById("footer-layer-more").textContent = more > 0 ? `+${more}` : "";
  document.getElementById("footer-layer-count").textContent = active.length;
  document.getElementById("footer-layer-list").innerHTML = active.map((l) =>
    `<div class="footer-layer-row"><span class="layer-dot" style="--c:${l.c}"></span><span class="layer-name">${l.name}</span><span class="layer-role">${l.role}</span></div>`).join("");

  const view = map.isTimeMode() ? "Weather × Sales Compare" : (Atlas.metricSpec(map.colorBy)?.label || map.colorBy);
  let scope = Atlas.scopeLabel(state.scope);
  if (map.isTimeMode()) scope += " · Hot vs Mild Days";
  document.getElementById("footer-view").textContent = view;
  document.getElementById("footer-scope").textContent = scope;
  document.getElementById("footer-summary-body").innerHTML = `
    <div class="summary-row"><span class="summary-key">Status</span><span class="summary-val">UHUS Active</span></div>
    <div class="summary-row"><span class="summary-key">Layers</span><span class="summary-val">${active.map((l) => l.name).join(", ") || "—"}</span></div>
    <div class="summary-row"><span class="summary-key">View</span><span class="summary-val">${view}</span></div>
    <div class="summary-row"><span class="summary-key">Scope</span><span class="summary-val">${scope}</span></div>
    <div class="summary-row"><span class="summary-key">Period</span><span class="summary-val">2024</span></div>
    <div class="summary-row"><span class="summary-key">Join</span><span class="summary-val">dong_code + date</span></div>`;
}

function initFooter() {
  const footer = document.getElementById("uhus-footer");
  if (!footer) return;
  footer.addEventListener("click", (e) => { if (e.target.closest(".layer-tooltip")) return; footer.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!footer.contains(e.target)) footer.classList.remove("open"); });
  updateFooter();
}

// ---------- Map control panel (kepler-style layer stack) ----------
function initControlPanel() {
  const metrics = Atlas.availableMapMetrics();
  const opts = metrics.map((m) => `<option value="${m.key}">${m.label}</option>`).join("");

  // presets
  document.querySelectorAll("#mc-presets button").forEach((btn) => {
    btn.addEventListener("click", () => { exitTimeMode(); map.preset(btn.dataset.preset); syncLayerChecks(); syncToolbar(); updateLegend(); });
  });

  // per-layer toggles (data layers) — these aren't drawn in time mode, so a toggle
  // auto-leaves time mode and applies right away (no manual Reset needed).
  document.querySelectorAll('#mc-layers input[data-layer]').forEach((cb) => {
    cb.addEventListener("change", () => { exitTimeMode(); map.setLayer(cb.dataset.layer, cb.checked); syncToolbar(); updateLegend(); });
  });

  // Every data layer has independent color and height/size metrics. The right-rail
  // Color/Height selectors clear these overrides and unify one channel at a time.
  const VAR_LAYERS = ["pointCore", "pointHalo", "influence", "heatmap", "choropleth", "columns", "hexbin", "dotField"];
  const RADIUS_LAYERS = new Set(["pointCore", "pointHalo", "influence", "heatmap", "columns", "dotField"]);
  const stop = (e) => e.stopPropagation(); // keep clicks off the checkbox label
  VAR_LAYERS.forEach((layer) => {
    const row = document.querySelector(`#mc-layers .layer-row input[data-layer="${layer}"]`)?.closest(".layer-row");
    if (!row) return;
    const ctrls = document.createElement("div");
    ctrls.className = "lyr-ctrls"; ctrls.addEventListener("click", stop);
    const addVariableSelect = (channel, placeholder, values, setter) => {
      const sel = document.createElement("select");
      sel.className = `lyr-var lyr-${channel}`;
      sel.dataset.varLayer = layer;
      sel.dataset.varChannel = channel;
      sel.innerHTML = `<option value="">— ${placeholder} —</option>` + opts;
      sel.value = values[layer] || "";
      sel.addEventListener("change", () => {
        exitTimeMode();
        map[setter](layer, sel.value);
        updateLegend();
      });
      ctrls.appendChild(sel);
    };
    addVariableSelect("color", "color by", map.layerVar, "setLayerVar");
    addVariableSelect("height", "height by", map.layerHeightVar, "setLayerHeightVar");
    // per-layer radius slider (the common Radius slider still scales everything)
    if (RADIUS_LAYERS.has(layer)) {
      const rng = document.createElement("input");
      rng.type = "range"; rng.className = "lyr-radius"; rng.title = "Layer radius";
      rng.min = "0.3"; rng.max = "3"; rng.step = "0.1"; rng.value = String(map.layerRadius[layer] != null ? map.layerRadius[layer] : 1);
      rng.addEventListener("input", () => map.setLayerRadius(layer, +rng.value));
      ctrls.appendChild(rng);
    }
    row.appendChild(ctrls);
  });
  const syncLayerVarSelects = () => {
    document.querySelectorAll("#mc-layers select.lyr-var").forEach((s) => {
      const values = s.dataset.varChannel === "height" ? map.layerHeightVar : map.layerVar;
      s.value = values[s.dataset.varLayer] || "";
    });
  };
  window.syncLayerVarSelects = syncLayerVarSelects;

  // Granularity segmented control (Seoul / Gu / Dong) — data aggregation grain.
  document.querySelectorAll("#grain-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#grain-seg button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      exitTimeMode();
      map.setGrain(btn.dataset.grain);
      updateLegend();
    });
  });

  // Target-area segmented control — sets the camera scope (Seoul / a Gu / a Dong).
  document.querySelectorAll("#target-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#target-seg button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setTargetArea(btn.dataset.target);
    });
  });

  // Toolbar Reset: leave time-flow and return to the static view.
  document.getElementById("mc-reset").addEventListener("click", () => exitTimeMode());

  // Top toolbar: quick base-layer toggles, mirrored to the layer checkboxes.
  document.querySelectorAll("#map-toolbar button[data-toolbar-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layer = btn.dataset.toolbarLayer;
      const on = !map.layers[layer];
      map.setLayer(layer, on);
      const cb = document.querySelector(`#mc-layers input[data-layer="${layer}"]`);
      if (cb) cb.checked = on;
      btn.classList.toggle("on", on);
      updateLegend();
    });
  });
  syncToolbar();

  bindSlider("mc-elevation", (v) => map.setElevationScale(v), (v) => v.toFixed(1));
  bindSlider("mc-radius", (v) => map.setRadiusScale(v), (v) => v.toFixed(1));
  bindSlider("mc-opacity", (v) => { map.setOpacity(v); }, (v) => v.toFixed(2));
  bindSlider("mc-glow", (v) => map.setGlow(v), (v) => v.toFixed(1));

  document.getElementById("mc-autorotate").addEventListener("change", (e) => map.setAutoRotate(e.target.checked));

  // Map Mode: 2D (flat) / 3D (pitched) / Compare (side-by-side, placeholder).
  document.querySelectorAll("#mc-mode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mc-mode button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const m = btn.dataset.mode;
      if (m === "2d") map.map.easeTo({ pitch: 0, duration: 600 });
      else if (m === "3d") map.map.easeTo({ pitch: 45, duration: 600 });
      // Compare lifts the dataset filter on the map-panel dropdowns (compare across datasets).
      refreshVariableDropdowns();
    });
  });
}

// Reflect the map's layer state back onto the checkboxes (after a preset click).
function syncLayerChecks() {
  document.querySelectorAll('#mc-layers input[data-layer]').forEach((cb) => {
    cb.checked = !!map.layers[cb.dataset.layer];
  });
}
// Reflect map layer state onto the top toolbar pills.
function syncToolbar() {
  document.querySelectorAll("#map-toolbar button[data-toolbar-layer]").forEach((btn) => {
    btn.classList.toggle("on", !!map.layers[btn.dataset.toolbarLayer]);
  });
}

function bindSlider(id, apply, fmt) {
  const el = document.getElementById(id);
  const out = document.getElementById(id + "-val");
  el.addEventListener("input", () => { const v = +el.value; apply(v); if (out) out.textContent = fmt(v); });
}

function fmtLegendNum(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString();
  return v.toFixed(2);
}

// kepler-style grouped legend: scope title, "Color by X" subtitle, a swatch +
// numeric-range row per class (matches the reference Layer Legend pattern),
// plus a secondary "Height by Y" line since our map is bivariate.
function updateLegend() {
  const lg = map.legend();
  const title = Atlas.scopeLabel(state.scope);
  const rows = lg.classes.map((c) => `
    <div class="lg-row">
      <span class="lg-swatch" style="background:${c.color}"></span>
      <span class="lg-range">${fmtLegendNum(c.lo)} to ${fmtLegendNum(c.hi)}</span>
    </div>`).join("");
  const groupKey = (lg.groups && lg.groups.length)
    ? `<div class="lg-sub lg-height">Sales rings</div><div class="lg-groups">` +
      lg.groups.map((g) => `<div class="lg-grow"><span class="lg-swatch" style="background:${g.color}"></span><span>${g.label}</span></div>`).join("") +
      `</div>`
    : "";
  document.getElementById("map-legend").innerHTML = `
    <div class="lg-title">${title}</div>
    <div class="lg-sub">${lg.groups ? "" : "Color by "}<b>${lg.label}</b></div>
    <div class="lg-rows">${rows}</div>
    ${lg.heightLabel ? `<div class="lg-sub lg-height">Height by <b>${lg.heightLabel}</b></div>` : ""}
    ${groupKey}`;
  updateFooter(); // footer mirrors the same state the legend reflects
  updateSelectBox();
  if (typeof Insights !== "undefined") Insights.scheduleRender();
  syncTimeline();
}

// ---------- Spatial drill ----------
function handleRegionClick(info) {
  if (info.level === "gu") {
    state.scope = { level: "gu", guCode: info.gu_code, dongCode: null };
  } else {
    state.scope = { level: "dong", guCode: info.gu_code || state.scope.guCode, dongCode: info.dong_code };
  }
  hideTooltip();
  map.setScope(state.scope);
  if (typeof Timeline !== "undefined" && Timeline.chart) {
    Timeline.setScope(state.scope);          // timeline follows the drilled gu
    if (map.isTimeMode()) Timeline.setDay(timeState.dayIndex);
  }
  renderBreadcrumb();
  updateLegend();
}
function handleRegionHover(info) { info ? showTooltip(info) : hideTooltip(); }

// Target-area selector → camera scope. With no current selection, "gu"/"dong"
// default to the highest-RHSI region so the control always does something.
function setTargetArea(level) {
  const s = state.scope;
  if (level === "seoul") {
    state.scope = { level: "city", guCode: null, dongCode: null };
  } else if (level === "gu") {
    let guCode = s.guCode;
    if (!guCode) { const g = Atlas.guMetrics.slice().sort((a, b) => a.rhsi_rank - b.rhsi_rank)[0]; guCode = g && g.gu_code; }
    if (!guCode) return;
    state.scope = { level: "gu", guCode, dongCode: null };
  } else {
    let guCode = s.guCode, dongCode = s.dongCode;
    if (!dongCode) {
      const pool = guCode ? Atlas.dongMetrics.filter((d) => d.gu_code === guCode) : Atlas.dongMetrics;
      const d = pool.slice().sort((a, b) => a.rhsi_rank - b.rhsi_rank)[0];
      if (d) { dongCode = d.dong_code; guCode = d.gu_code; }
    }
    if (!dongCode) return;
    state.scope = { level: "dong", guCode, dongCode };
  }
  map.setScope(state.scope);
  if (typeof Timeline !== "undefined" && Timeline.chart) { Timeline.setScope(state.scope); if (map.isTimeMode()) Timeline.setDay(timeState.dayIndex); }
  renderBreadcrumb();
  updateLegend();
}
// Reflect the current scope level onto the target-area segmented control.
function syncTargetSeg() {
  const lvl = state.scope.level === "city" ? "seoul" : state.scope.level;
  document.querySelectorAll("#target-seg button").forEach((b) => b.classList.toggle("active", b.dataset.target === lvl));
}

// Apply a camera scope + keep timeline / breadcrumb / controls in sync.
function applyScope(scope) {
  state.scope = scope;
  map.setScope(scope);
  if (typeof Timeline !== "undefined" && Timeline.chart) { Timeline.setScope(scope); if (map.isTimeMode()) Timeline.setDay(timeState.dayIndex); }
  renderBreadcrumb();
  updateLegend();
}

// ---------- selection dropdowns (Gu / Dong / Variable) in the right rail ----------
function dongOptionsFor(guCode) {
  const dongs = (guCode ? Atlas.dongGeometry.filter((d) => d.gu_code === guCode) : Atlas.dongGeometry)
    .slice().sort((a, b) => a.dong_name.localeCompare(b.dong_name));
  return `<option value="">${guCode ? "All dongs in gu" : "All dongs"}</option>` +
    dongs.map((d) => `<option value="${d.dong_code}">${d.dong_name}</option>`).join("");
}
function initSelectBox() {
  const guSel = document.getElementById("dd-gu");
  const dongSel = document.getElementById("dd-dong");
  const colorSel = document.getElementById("dd-color");
  const heightSel = document.getElementById("dd-height");
  if (!guSel || !dongSel || !colorSel || !heightSel) return;
  const gus = Atlas.guGeometry.slice().sort((a, b) => a.gu_name.localeCompare(b.gu_name));
  guSel.innerHTML = `<option value="">Seoul (all gu)</option>` + gus.map((g) => `<option value="${g.gu_code}">${g.gu_name}</option>`).join("");
  const metricOptions = Atlas.availableMapMetrics().map((m) => `<option value="${m.key}">${m.label}</option>`).join("");
  colorSel.innerHTML = `<option value="">— color by —</option>` + metricOptions;
  heightSel.innerHTML = `<option value="">— height by —</option>` + metricOptions;
  colorSel.value = map.colorBy;
  heightSel.value = map.heightBy;
  dongSel.innerHTML = dongOptionsFor(state.scope.guCode);
  guSel.value = state.scope.guCode || "";
  dongSel.value = state.scope.dongCode || "";

  guSel.addEventListener("change", () => {
    const gc = guSel.value;
    dongSel.innerHTML = dongOptionsFor(gc);
    applyScope(gc ? { level: "gu", guCode: gc, dongCode: null } : { level: "city", guCode: null, dongCode: null });
  });
  dongSel.addEventListener("change", () => {
    const dc = dongSel.value;
    if (!dc) { const gc = guSel.value; applyScope(gc ? { level: "gu", guCode: gc, dongCode: null } : { level: "city", guCode: null, dongCode: null }); return; }
    const d = Atlas.dongByCode.get(dc);
    applyScope({ level: "dong", guCode: d ? d.gu_code : guSel.value, dongCode: dc });
  });
  colorSel.addEventListener("change", () => {
    const v = colorSel.value;
    if (!v) return;
    exitTimeMode();
    map.unifyLayerColors(v);
    if (typeof syncLayerVarSelects === "function") syncLayerVarSelects();
    updateLegend();
  });
  heightSel.addEventListener("change", () => {
    const v = heightSel.value;
    if (!v) return;
    exitTimeMode();
    map.unifyLayerHeights(v);
    if (typeof syncLayerVarSelects === "function") syncLayerVarSelects();
    updateLegend();
  });
}
// Reflect scope + unified color/height metrics back onto the dropdowns.
function updateSelectBox() {
  const guSel = document.getElementById("dd-gu");
  if (!guSel) return;
  const dongSel = document.getElementById("dd-dong");
  const colorSel = document.getElementById("dd-color");
  const heightSel = document.getElementById("dd-height");
  const wantGu = state.scope.guCode || "";
  if (guSel.value !== wantGu) { guSel.value = wantGu; dongSel.innerHTML = dongOptionsFor(wantGu); }
  dongSel.value = state.scope.dongCode || "";
  if (!map.isTimeMode()) {
    if (colorSel) colorSel.value = map.colorBy;
    if (heightSel) heightSel.value = map.heightBy;
  }
}

// The time-series is filled only for time-based datasets (UHUS project / Weather /
// Sales) or when a time-based view is active; it follows the spatial target area /
// granularity (Seoul granularity → citywide series).
const TIME_DATASETS = ["weather", "sales", "salesfeature", "heatfeature", "heatdays"];
function syncTimeline() {
  if (typeof Timeline === "undefined" || !Timeline.chart) return;
  const ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
  const enabled = !ds || TIME_DATASETS.includes(ds) || map.isTimeMode();
  Timeline.setEnabled(enabled);
  if (!enabled) return;
  const scope = map.grain === "seoul" ? { level: "city", guCode: null, dongCode: null } : state.scope;
  Timeline.setScope(scope);
  if (map.isTimeMode()) Timeline.setDay(timeState.dayIndex);
}

// ---------- variable dropdowns scoped to the selected dataset ----------
// Which dataset a mappable metric belongs to (VARIABLE_META's 6th field, from
// panels.js). Industry-sensitivity metrics have no schema row → the sales dataset.
function metricDataset(key) {
  const vm = (typeof VARIABLE_META !== "undefined") ? VARIABLE_META[key] : null;
  return vm ? vm[5] : "sales";
}
// Metrics to offer given the dataset open in the right-panel detail. honorCompare:
// the MAP-panel dropdowns show ALL metrics when Map Mode = Compare; the right-rail
// SELECT dropdown stays dataset-scoped regardless. No dataset selected → all.
function contextMetrics(honorCompare) {
  const all = Atlas.availableMapMetrics();
  const dsId = (typeof Panels !== "undefined" && Panels.selectedDatasetId) ? Panels.selectedDatasetId : null;
  const compare = honorCompare && document.querySelector("#mc-mode button.active")?.dataset.mode === "compare";
  if (compare || !dsId) return all;
  const filtered = all.filter((m) => metricDataset(m.key) === dsId);
  return filtered.length ? filtered : all; // dataset has no mappable metric → fall back to all
}
function metricOptionsHTML(metrics) { return metrics.map((m) => `<option value="${m.key}">${m.label}</option>`).join(""); }
function setSelectOptions(sel, html, preferred) {
  if (!sel) return;
  sel.innerHTML = html;
  if (preferred && [...sel.options].some((o) => o.value === preferred)) sel.value = preferred;
}
// Rebuild every variable dropdown for the current dataset context. Rebuilding a
// select's <option>s via innerHTML keeps its change listener attached.
function refreshVariableDropdowns() {
  if (typeof Atlas === "undefined" || !map) return;
  const selHTML = metricOptionsHTML(contextMetrics(false)); // right-rail SELECT: always dataset-scoped
  const mapMetrics = contextMetrics(true);                  // map panel: unfiltered in Compare
  const mapHTML = metricOptionsHTML(mapMetrics);
  setSelectOptions(document.getElementById("dd-color"), `<option value="">— color by —</option>` + selHTML, map.colorBy);
  setSelectOptions(document.getElementById("dd-height"), `<option value="">— height by —</option>` + selHTML, map.heightBy);
  document.querySelectorAll("#mc-layers select.lyr-var").forEach((s) => {
    const cur = s.value;
    const placeholder = s.dataset.varChannel === "height" ? "height by" : "color by";
    s.innerHTML = `<option value="">— ${placeholder} —</option>` + mapHTML;
    s.value = mapMetrics.some((m) => m.key === cur) ? cur : "";
  });
  if (typeof Insights !== "undefined") Insights.scheduleRender();
  if (typeof syncTimeline === "function") syncTimeline(); // dataset gating for the time-series
}

// ---------- fixed Insights column: editorial-scientific figures ----------
// Builds a stack of ECharts figures (charts.js insightsFigures) for the current
// scope. Re-renders (debounced) on every selection; charts resize with the column.
const Insights = {
  charts: [],
  _timer: null,
  init() {
    const resizeAll = () => this.charts.forEach((c) => { try { c && c.resize && c.resize(); } catch (e) {} });
    const col = document.getElementById("insights-col");
    if (window.ResizeObserver && col) new ResizeObserver(resizeAll).observe(col);
    window.addEventListener("resize", resizeAll);
    this.render();
  },
  scheduleRender() { clearTimeout(this._timer); this._timer = setTimeout(() => this.render(), 140); },
  _dispose() { this.charts.forEach((c) => { try { c && c.dispose && c.dispose(); } catch (e) {} }); this.charts = []; },
  render() {
    const body = document.getElementById("ins-body");
    if (!body || typeof echarts === "undefined") return;
    this._dispose();
    const sub = document.getElementById("ins-sub");
    if (sub) sub.textContent = (typeof scopeSub === "function") ? scopeSub(state.scope) : "";
    const datasetId = (typeof Panels !== "undefined" && Panels.selectedDatasetId) || null;
    let kpiHtml = "";
    try { kpiHtml = (typeof regionSummaryHtml === "function") ? regionSummaryHtml(state.scope) : ""; } catch (e) {}
    let figs;
    try { figs = insightsFigures(state.scope, datasetId); }
    catch (e) { body.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:16px">Insights unavailable.</div>`; return; }
    body.innerHTML = (kpiHtml || "") + figs.map((f, i) =>
      `<figure class="ins-fig">
        <div class="fig-head"><span class="fig-kicker">${f.kicker}</span><h4 class="fig-title">${f.title}</h4></div>
        <p class="fig-finding">${f.finding}</p>
        <div class="fig-chart" id="ins-fig-${i}"></div>
        <p class="fig-caption">${f.caption}</p>
      </figure>`).join("");
    figs.forEach((f, i) => {
      const el = document.getElementById("ins-fig-" + i);
      try { this.charts.push(f.render(el)); }
      catch (e) { el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px">No data.</div>`; }
    });
  },
};

// Tiny gradient bar with a marker showing a region's rank position (t∈[0,1]).
function miniBarSVG(t, label) {
  const w = 168, h = 8, x = Math.max(2, Math.min(w - 2, t * w));
  return `<div class="rt-mini"><div class="rt-mini-label">${label}</div>
    <svg width="${w}" height="${h + 6}" viewBox="0 0 ${w} ${h + 6}">
      <defs><linearGradient id="rtg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#7DA7FF"/><stop offset="0.5" stop-color="#FFB86B"/><stop offset="1" stop-color="#E45C91"/>
      </linearGradient></defs>
      <rect x="0" y="3" width="${w}" height="${h}" rx="4" fill="url(#rtg)" opacity="0.5"/>
      <rect x="${(x - 1.5).toFixed(1)}" y="0" width="3" height="${h + 6}" rx="1.5" fill="#fff"/>
    </svg></div>`;
}

// Format a metric value with a couple of significant digits.
function fmtMetric(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
  return (Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));
}

// Hover card: always leads with the CURRENTLY-VISUALIZED variable's value for
// the pointed place, then a few context stats. In time-flow it shows that day's
// temperature and total sales for the region.
function showTooltip(info) {
  const tip = document.getElementById("region-tooltip");
  const spec = Atlas.metricSpec(map.colorBy);
  let rows = "";

  if (map.isTimeMode()) {
    const guCode = info.level === "gu" ? info.gu_code : (Atlas.dongByCode.get(info.dong_code) || {}).gu_code;
    const temp = Atlas.dayValueByGu(timeState.dayIndex, "temp")[guCode];
    const dateLabel = Atlas.timeDateLabel ? Atlas.timeDateLabel(timeState.dayIndex) : `day ${timeState.dayIndex + 1}`;
    rows += `<div class="rt-row"><span>${dateLabel} · temp</span><b>${temp == null ? "—" : temp.toFixed(1) + "°C"}</b></div>`;
  } else if (spec) {
    const val = info.level === "gu"
      ? Atlas.guAggregateValue(info.gu_code, spec)
      : Atlas.metricValue(Atlas.dongByCode.get(info.dong_code), spec);
    rows += `<div class="rt-row rt-active"><span>${spec.label}</span><b>${fmtMetric(val)}</b></div>`;
    // mini bar: where this region sits vs all gu / all dong for the mapped metric
    const grain = info.level === "gu" ? "gu" : "dong";
    const vals = Atlas.valuesForGrain(grain, { level: "city", guCode: null, dongCode: null }, spec);
    const t = Atlas.colorScaleFromValues(vals, spec)(val);
    if (t != null) rows += miniBarSVG(t, `vs all ${grain === "gu" ? "districts" : "dongs"}`);
  }

  if (info.level === "gu") {
    const m = Atlas.guByCode.get(info.gu_code);
    tip.innerHTML = `<div class="rt-title">${info.gu_name}</div>` + rows + (m ? `
      <div class="rt-row"><span>Avg RHSI</span><b>${m.RHSI_retail.toFixed(3)}</b></div>
      <div class="rt-row"><span>Rank</span><b>${m.rhsi_rank} / ${Atlas.guMetrics.length}</b></div>
      <div class="rt-row"><span>Dongs</span><b>${m.dong_count}</b></div>` : "") +
      `<a class="rt-link" href="#">click to drill in →</a>`;
  } else {
    const m = Atlas.dongByCode.get(info.dong_code);
    tip.innerHTML = `<div class="rt-title">${info.dong_name}</div>` + rows + (m ? `
      <div class="rt-row"><span>RHSI</span><b>${m.RHSI_retail.toFixed(3)}</b></div>
      <div class="rt-row"><span>Rank</span><b>${m.rhsi_rank} / ${Atlas.dongMetrics.length}</b></div>
      <div class="rt-row"><span>Hot / Mild days</span><b>${m.n_hot_days} / ${m.n_mild_days}</b></div>` : "");
  }
  tip.style.left = (info.x + 16) + "px"; tip.style.top = (info.y + 16) + "px";
  tip.style.transform = "none";
  tip.classList.remove("hidden");
}
function hideTooltip() { document.getElementById("region-tooltip").classList.add("hidden"); }

// ---------- Breadcrumb ----------
function renderBreadcrumb() {
  const el = document.getElementById("topbar-breadcrumb");
  const s = state.scope;
  const gu = s.guCode ? Atlas.guByCode.get(s.guCode) : null;
  const dong = s.dongCode ? Atlas.dongByCode.get(s.dongCode) : null;
  let html = `<span class="crumb ${s.level === "city" ? "current" : ""}" data-c="seoul">Seoul</span>`;
  if (gu) html += `<span class="sep">›</span><span class="crumb ${s.level === "gu" ? "current" : ""}" data-c="gu">${gu.gu_name}</span>`;
  if (dong) html += `<span class="sep">›</span><span class="crumb current">${dong.dong_name}</span>`;
  el.innerHTML = html;
  if (typeof syncTargetSeg === "function") syncTargetSeg();
  const syncTimelineScope = () => {
    if (typeof Timeline !== "undefined" && Timeline.chart) {
      Timeline.setScope(state.scope);
      if (map.isTimeMode()) Timeline.setDay(timeState.dayIndex);
    }
  };
  el.querySelector('[data-c="seoul"]').addEventListener("click", () => {
    state.scope = { level: "city", guCode: null, dongCode: null };
    map.setScope(state.scope); syncTimelineScope(); renderBreadcrumb(); updateLegend();
  });
  const guCrumb = el.querySelector('[data-c="gu"]');
  if (guCrumb) guCrumb.addEventListener("click", () => {
    state.scope = { level: "gu", guCode: state.scope.guCode, dongCode: null };
    map.setScope(state.scope); syncTimelineScope(); renderBreadcrumb(); updateLegend();
  });
}

// ---------- Boot ----------
initLanding();
