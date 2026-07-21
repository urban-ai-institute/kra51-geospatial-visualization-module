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
  initSectorView();
  initNavOverlay();
  initCredits();
  initTour();
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
    // Same source-file tree as the panel Library — both driven by DATASET_CATALOG.
    const cat = (typeof DATASET_CATALOG !== "undefined") ? DATASET_CATALOG : [];
    return `<div class="mc-title">PROJECTS</div>
      <div class="project-row active" data-detail="project_uhus">UHUS</div>
      <div class="lib-tree">
        ${cat.map((g) => `
        <div class="folder-head">${g.role}</div>
        ${g.items.map((d) => `<div class="dataset-row" data-detail="${d.open}"><span>${d.file}</span><span class="ftype">${(d.file.split(".").pop() || "").toLowerCase()}</span></div>`).join("")}`).join("")}
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
// renderProject / renderDatasetDetail switch to the Detail tab themselves.
function openDatasetFromLibrary(id) {
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
    syncPinned();
  }
  function syncPinned() { document.getElementById("map-stage")?.classList.toggle("panel-pinned", !!pinned); }
  function hidePanel() { panel.classList.remove("show"); navItems.forEach((b) => b.classList.remove("active")); syncPinned(); }
  function restore() { if (hoveringNav || hoveringPanel) return; if (pinned) showPanel(pinned, "pinned"); else hidePanel(); }

  navItems.forEach((btn) => {
    const key = btn.dataset.nav;
    // Credits is a full-screen overlay, not the floating flyout — skip the hover/pin
    // wiring below and just open the overlay on click.
    if (key === "credits") { btn.addEventListener("click", openCredits); return; }
    btn.addEventListener("mouseenter", () => { if (key === "overview") return; hoveringNav = true; showPanel(key, pinned === key ? "pinned" : "hover"); });
    btn.addEventListener("mouseleave", () => { hoveringNav = false; setTimeout(restore, 110); });
    btn.addEventListener("click", () => {
      // Overview toggles the functional auto-demo (which pins the Map controls itself).
      if (key === "overview") {
        if (typeof Tour !== "undefined" && Tour.playing) { Tour.stop(); return; }
        pinned = null; hidePanel(); syncPinned();
        if (typeof Tour !== "undefined") Tour.start();
        return;
      }
      // Any other nav interaction takes over from the demo.
      if (typeof Tour !== "undefined" && Tour.playing) Tour.stop();
      if (pinned === key) { pinned = null; hidePanel(); return; }
      pinned = key; showPanel(key, "pinned");
    });
  });

  // Small API so the auto-demo can pin/unpin the Map control flyout WITHOUT firing
  // the nav click handler above (which would immediately stop the demo).
  window.AtlasNav = {
    pinMap() { pinned = "map"; showPanel("map", "pinned"); },
    unpin() { pinned = null; hidePanel(); },
  };
  panel.addEventListener("mouseenter", () => { hoveringPanel = true; });
  panel.addEventListener("mouseleave", () => { hoveringPanel = false; setTimeout(restore, 110); });

  hidePanel(); // initial state: no floating panel visible (per spec)
}

// ---------- Credits overlay (full-screen about page) ----------
function openCredits() {
  const el = document.getElementById("credits-overlay");
  if (!el) return;
  if (typeof Tour !== "undefined" && Tour.playing) Tour.stop();
  el.classList.remove("hidden");
  document.querySelectorAll(".side-nav .nav-item").forEach((b) => b.classList.remove("active"));
}
function closeCredits() {
  document.getElementById("credits-overlay")?.classList.add("hidden");
}
function initCredits() {
  const el = document.getElementById("credits-overlay");
  if (!el) return;
  document.getElementById("credits-close")?.addEventListener("click", closeCredits);
  el.querySelectorAll("[data-credits-close]").forEach((n) => n.addEventListener("click", closeCredits));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.classList.contains("hidden")) closeCredits();
  });
}

// ---------- Overview: functional auto-demo (no narration) ----------
// Clicking Overview loops through every UHUS dataset and, for each, drives the REAL
// controls: applies the dataset's best representation, cycles a few key variables,
// then walks the map selection (Seoul → Gu → Dong). No subtitles — it just exercises
// the features. Blur-focus is used only for the brief per-dataset Detail card beat
// (when the map isn't the point); every map beat keeps the whole dashboard sharp so
// the controls, dropdowns, legend and map all read together.
const Tour = {
  playing: false, _timer: null, _beats: null, _bi: 0,

  // ---- spotlight helpers (blur only the Detail-card beats) ----
  _targets() {
    return {
      detail: document.querySelector(".panel-wrap"),
      insights: document.querySelector(".insights-view"),
      map: document.getElementById("map-stage"),
    };
  },
  _chrome() {
    return [".topbar", ".side-nav", "#timeline", "#uhus-footer"]
      .map((s) => document.querySelector(s)).filter(Boolean);
  },
  setFocus(key) {
    const t = this._targets();
    Object.keys(t).forEach((k) => {
      const el = t[k]; if (!el) return;
      if (k === key) { el.classList.remove("tour-blur"); el.classList.add("tour-focus"); }
      else { el.classList.remove("tour-focus"); el.classList.add("tour-blur"); }
    });
    this._chrome().forEach((el) => el.classList.add("tour-blur"));
  },
  clearFocus() {
    const t = this._targets();
    Object.keys(t).forEach((k) => { if (t[k]) t[k].classList.remove("tour-blur", "tour-focus"); });
    this._chrome().forEach((el) => el.classList.remove("tour-blur"));
  },

  // Ensure the right panel host shows the Detail card (so the intro beat has something).
  _ensureDetailMode() {
    const host = document.getElementById("panel-host");
    if (!host || host.classList.contains("mode-detail")) return;
    const tab = document.querySelector('.rail-tab[data-panel-tab="detail"]');
    if (tab) { tab.click(); return; }
    host.classList.remove("mode-insights", "mode-library");
    host.classList.add("mode-detail");
  },

  // ---- low-level actions, each mirroring a real user interaction ----
  _rep(id, r) { if (typeof Panels !== "undefined") Panels.applyRepresentation(id, r); },
  _colorBy(key) {
    // Drive the always-visible "Color by Variable" dropdown so it visibly changes.
    const sel = document.getElementById("dd-color");
    if (sel && [...sel.options].some((o) => o.value === key)) {
      sel.value = key; sel.dispatchEvent(new Event("change"));
    } else if (map && Atlas.metricSpec && Atlas.metricSpec(key)) {
      if (map.isTimeMode()) exitTimeMode();
      map.unifyLayerColors(key);
      if (typeof updateLegend === "function") updateLegend();
      if (typeof updateSelectBox === "function") updateSelectBox();
    }
  },
  _target(level) {
    // Click the real Target-area segmented control (Seoul / Gu / Dong).
    const b = document.querySelector(`#target-seg button[data-target="${level}"]`);
    if (b) b.click(); else if (typeof setTargetArea === "function") setTargetArea(level);
  },
  _shapGroup(i) {
    if (!map || !Atlas._contextGroups) return;
    const g = Atlas._contextGroups()[i];
    if (g && g.columns) map.setShapFeatures(g.columns);
  },
  _shapAll() { if (map) { map.shapFeatures = null; map.render(); } }, // reset to every feature (setShapFeatures(null) would clear to none)

  // Representative regions (most heat-sensitive) so the selection demos always land somewhere.
  _topGu() { return Atlas.guMetrics.slice().sort((a, b) => a.rhsi_rank - b.rhsi_rank)[0]; },
  _topDong() { return Atlas.dongMetrics.slice().sort((a, b) => a.rhsi_rank - b.rhsi_rank)[0]; },
  _dongInGu(guCode) { return Atlas.dongMetrics.filter((d) => d.gu_code === guCode).sort((a, b) => a.rhsi_rank - b.rhsi_rank)[0]; },
  _mapCenter() {
    const el = document.getElementById("map-stage");
    if (!el) return { x: 600, y: 320 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45 };
  },
  _hoverDong(dm) {
    // Simulate a map hover — the tooltip shows the region's name, mapped value, RHSI and rank.
    if (!dm || typeof showTooltip !== "function") return;
    const c = this._mapCenter();
    showTooltip({ level: "dong", dong_code: dm.dong_code, dong_name: dm.dong_name, gu_code: dm.gu_code, x: c.x, y: c.y });
  },
  _hideTip() { if (typeof hideTooltip === "function") hideTooltip(); },
  _clickRegion(level, m) {
    // Simulate clicking a region on the map to drill the camera scope in.
    if (!m || typeof handleRegionClick !== "function") return;
    if (level === "gu") handleRegionClick({ level: "gu", gu_code: m.gu_code });
    else handleRegionClick({ level: "dong", gu_code: m.gu_code, dong_code: m.dong_code });
  },
  _box(id, value) {
    // Drive a spatial SELECT box (Gu / Dong) exactly as a manual pick would.
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.value = value;
    sel.dispatchEvent(new Event("change"));
  },
  _mode(m) { if (typeof setCameraMode === "function") setCameraMode(m); },
  _autoRotate(on) {
    const cb = document.getElementById("mc-autorotate");
    if (cb) cb.checked = !!on;
    if (map && map.setAutoRotate) map.setAutoRotate(!!on);
  },

  // Build the flat beat list once, following the video narration order:
  // Project Detail → Weather → Sales → Urban Features → SHAP → RHSI. Each section
  // opens on its Detail card (brief blur), then drives the exact functions the
  // narration describes. Fully auto-loops; no subtitles.
  _build() {
    const B = [];
    const push = (ms, run) => B.push({ ms, run });
    const T = this;

    // 1 — PROJECT DETAIL: the hub every dataset is reached from.
    push(3400, () => { T._autoRotate(false); T._mode("3d"); Panels.renderProject(); T._target("seoul"); T.setFocus("detail"); });
    push(2800, () => { T.clearFocus(); });

    // 2 — WEATHER: temporal heat field, played across 2024 with the time controls + graph.
    push(3000, () => { Panels.renderDatasetDetail("weather"); T._target("seoul"); T._rep("weather", "heatfield"); T.setFocus("detail"); });
    push(6000, () => { T.clearFocus(); T._rep("weather", "heatfield"); startPlayback(); });

    // 3 — SALES: six theme rings, then alternate forms (columns / choropleth / dominant).
    push(3000, () => { Panels.renderDatasetDetail("sales"); T._target("gu"); T._rep("sales", "rings"); T.setFocus("detail"); });
    push(4200, () => { T.clearFocus(); T._rep("sales", "rings"); startPlayback(); });
    push(3600, () => { T._rep("sales", "columns"); });
    push(3600, () => { T._rep("sales", "choropleth"); });
    push(3600, () => { T._rep("sales", "dominant"); });

    // 4 — URBAN FEATURES: choropleth, cycle the coloured feature, then hover a neighborhood.
    push(3000, () => { Panels.renderDatasetDetail("context"); T._target("seoul"); T._rep("context", "choropleth"); T.setFocus("detail"); });
    push(3600, () => { T.clearFocus(); T._colorBy("land_price"); });
    push(3600, () => { T._colorBy("elderly_share"); });
    push(3600, () => { T._colorBy("green_space_share"); });
    push(4800, () => { T._hoverDong(T._topDong()); });   // tooltip: name + value + RHSI + rank
    push(500,  () => { T._hideTip(); });

    // 5 — SHAP: signed contribution bars, decomposed by feature group.
    push(3000, () => { Panels.renderDatasetDetail("shap"); T._target("seoul"); T._shapAll(); T._rep("shap", "signedcols"); T.setFocus("detail"); });
    push(4000, () => { T.clearFocus(); T._shapAll(); T._rep("shap", "signedcols"); });
    push(3800, () => { T._shapGroup(0); });
    push(3800, () => { T._shapGroup(2); });
    push(2600, () => { T._shapAll(); });

    // 6 — RHSI: the index choropleth, spatial selection (map clicks + boxes), map options.
    push(3000, () => { Panels.renderDatasetDetail("rhsi"); T._target("seoul"); T._rep("rhsi", "choropleth"); T.setFocus("detail"); });
    push(3800, () => { T.clearFocus(); T._rep("rhsi", "choropleth"); });
    push(3200, () => { T._clickRegion("gu", T._topGu()); });       // click the map → a district
    push(3200, () => { T._clickRegion("dong", T._topDong()); });   // click the map → a neighborhood
    push(3400, () => { T._target("seoul"); const g = T._topGu(); T._box("dd-gu", g.gu_code); });          // spatial box → district
    push(3600, () => { const g = T._topGu(); const d = T._dongInGu(g.gu_code); if (d) T._box("dd-dong", d.dong_code); }); // spatial box → dong
    push(3600, () => { T._mode("2d"); });                          // flat 2D view
    push(4200, () => { T._mode("3d"); T._autoRotate(true); });     // auto-rotate
    push(2200, () => { T._autoRotate(false); });                   // stop before the loop restarts

    return B;
  },

  start() {
    if (this.playing) return;
    this.playing = true;
    this._ensureDetailMode();
    if (window.AtlasNav) window.AtlasNav.pinMap(); // reveal the Representation / layer controls
    this._beats = this._build();
    this._bi = 0;
    this._run();
  },
  stop() {
    this.playing = false;
    clearTimeout(this._timer); this._timer = null;
    this.clearFocus();
    if (map && map.isTimeMode()) exitTimeMode();
    if (window.AtlasNav) window.AtlasNav.unpin();
  },
  _run() {
    if (!this.playing || !this._beats || !this._beats.length) return;
    const beat = this._beats[this._bi];
    try { beat.run(); } catch (e) { /* keep the loop alive */ }
    this._bi = (this._bi + 1) % this._beats.length;
    this._timer = setTimeout(() => this._run(), beat.ms || 3000);
  },
};
function initTour() { /* fully auto-loop — Overview nav toggles Tour.start/stop, no in-page controls */ }

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

// Which temporal flow is active, from the open dataset + representation:
//   Heat × sales rep → "both"; Sales dataset → "sales"; otherwise → "temp".
// The graph, the map layers and the readout all read this single value.
function timeChannel() {
  const ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
  const rep = (typeof Panels !== "undefined") ? Panels.selectedRep : null;
  if (rep === "compare") return "both";
  if (ds === "sales") return "sales";
  return "temp";
}
// Entering time mode plays only the active dataset's flow (temperature for Weather,
// sales for Sales); Heat × sales plays both. Overrides the static metric until Reset.
function enterTimeMode() {
  const ch = timeChannel();
  if (map) { map.timeCompare = (ch === "both"); map.timeVar = (ch === "sales") ? "sales" : "temp"; }
  if (!map.isTimeMode()) { map.setTimeMode(true); updateLegend(); if (typeof syncTimeline === "function") syncTimeline(); }
  else if (map) map.render();
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
// Scrub the map/graph cursor to a day. Never leaves time mode — the rail's Static
// is the only way out — so the strip's Reset just jumps back to day 0 and pauses.
function scrubTo(i) {
  enterTimeMode();
  pausePlayback();
  timeState.dayIndex = i;
  applyDay(i);
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
  if (ro) ro.innerHTML = "Time-series graph — switch to Animate to sweep the year.";
  updateLegend();
  if (typeof syncTimeline === "function") syncTimeline();   // hide the transport now we're static
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
    if (map.timeVar === "sales") active.push({ c: "#ffb86b", name: "Daily Sales Choropleth", role: "sales" });
    else active.push({ c: "#78a8ff", name: "Weather Heat Layer", role: "weather" });
    if (map.timeCompare || map.sectorView) active.push({ c: "#ffb86b", name: "Sales Response Layer", role: "sales" });
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

  const view = map.isTimeMode()
    ? (map.timeVar === "sales" ? "Daily Sales Choropleth" : "Weather × Sales Compare")
    : (Atlas.metricSpec(map.colorBy)?.label || map.colorBy);
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

  // NOTE: the PRESETS buttons, the per-layer "Data layers" checkboxes and their
  // per-layer colour/height/radius controls all lived here. They were removed with
  // that markup — the Layer-Set editor now owns layer composition (each layer picks a
  // representation + variable) and its presets replace the old view presets. The OSM
  // lazy-fetch those checkboxes used moved into the toolbar handler below.

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

  // (Toolbar Reset removed: the rail's Static is the single "leave time" control.)

  // Top toolbar: quick base-layer + OSM context toggles.
  const OSM_LAYERS = new Set(["nature", "transit", "amenity"]);
  document.querySelectorAll("#map-toolbar button[data-toolbar-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const layer = btn.dataset.toolbarLayer;
      const on = !map.layers[layer];
      // OSM context layers aren't drawn in time mode and are fetched on first enable
      // (not at startup), so they need the same handling the old layer list gave them.
      if (OSM_LAYERS.has(layer)) exitTimeMode();
      map.setLayer(layer, on);
      btn.classList.toggle("on", on);
      if (on && OSM_LAYERS.has(layer)) {
        Atlas.ensureOSM(layer).then(() => { map._staticCache = null; map.render(); updateLegend(); });
      }
      // buildings.json is large (~7MB gzipped) and lazy — tell the user it's downloading
      // rather than leaving the toggle looking broken while it streams in.
      if (on && layer === "buildings" && typeof Atlas.ensureBuildings === "function" && !Atlas.buildings) {
        btn.classList.add("tb-loading");
        showDownloadNotice("Downloading 3D buildings", "about 7 MB, one time");
        Atlas.ensureBuildings((loaded, total) => updateDownloadNotice(loaded, total))
          .then((b) => {
            btn.classList.remove("tb-loading");
            if (!b) {                       // failed / unavailable → don't leave a dead toggle on
              map.setLayer("buildings", false);
              btn.classList.toggle("on", false);
              showDownloadNotice("3D buildings unavailable", "could not load the data", true);
            } else {
              hideDownloadNotice();
            }
            map._bldgCache = null; map._staticCache = null; map.render(); updateLegend();
          });
      }
      updateLegend();
    });
  });
  syncToolbar();

  // Elevation / Radius / Opacity / Glow are owned by the Layer-Set Appearance section
  // (and saved with presets), so they are no longer duplicated here. Panels._applyView
  // still drives the map setters per representation; it is null-safe about the DOM.

  document.getElementById("mc-autorotate").addEventListener("change", (e) => map.setAutoRotate(e.target.checked));

  // Selected-dong highlight style: glowing boundary area (default) or vertical pillar.
  document.querySelectorAll("#mc-selstyle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mc-selstyle button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      map.setSelectionStyle(btn.dataset.selstyle);
    });
  });

  // Map Mode: 2D (flat) / 3D (pitched) / Compare (side-by-side, placeholder).
  document.querySelectorAll("#mc-mode button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.mode;
      if (m === "2d" || m === "3d") setCameraMode(m);
      else { document.querySelectorAll("#mc-mode button").forEach((b) => b.classList.remove("active")); btn.classList.add("active"); }
      // Compare lifts the dataset filter on the map-panel dropdowns (compare across datasets).
      refreshVariableDropdowns();
    });
  });
}

// The layer checkboxes are gone (the Layer-Set editor owns composition), but callers
// still invoke this behind a typeof guard, so keep it as a harmless no-op.
function syncLayerChecks() {}
// ---------- download notice (large lazy layers) ----------
// A small card near the map that says a big optional layer is being fetched, with real
// progress. Without it a click on Buildings looks like nothing happened for several
// seconds on a slow connection.
function downloadNoticeEl() {
  let el = document.getElementById("download-notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "download-notice";
    el.className = "download-notice";
    el.innerHTML = `<div class="dn-row"><span class="dn-spin"></span><div class="dn-text">
        <b class="dn-title"></b><span class="dn-sub"></span></div></div>
      <div class="dn-bar"><i></i></div>`;
    (document.getElementById("map-stage") || document.body).appendChild(el);
  }
  return el;
}
function showDownloadNotice(title, sub, isError) {
  const el = downloadNoticeEl();
  el.querySelector(".dn-title").textContent = title;
  el.querySelector(".dn-sub").textContent = sub || "";
  el.classList.toggle("dn-error", !!isError);
  el.querySelector(".dn-bar").style.display = isError ? "none" : "";
  el.querySelector(".dn-bar i").style.width = "0%";
  el.classList.add("show");
  if (isError) setTimeout(hideDownloadNotice, 4000);
}
function updateDownloadNotice(loaded, total) {
  const el = document.getElementById("download-notice");
  if (!el) return;
  const mb = (n) => (n / 1048576).toFixed(1);
  // total is the COMPRESSED length when the server gzips, so it can be smaller than
  // the decompressed bytes we've read — only show a % while it still makes sense.
  const usable = total > 0 && loaded <= total;
  el.querySelector(".dn-sub").textContent = usable
    ? `${mb(loaded)} / ${mb(total)} MB`
    : `${mb(loaded)} MB downloaded`;
  el.querySelector(".dn-bar i").style.width = usable ? Math.round((loaded / total) * 100) + "%" : "100%";
  el.querySelector(".dn-bar").classList.toggle("dn-indet", !usable);
}
function hideDownloadNotice() {
  const el = document.getElementById("download-notice");
  if (el) el.classList.remove("show");
}

// Reflect map layer state onto the top toolbar pills.
function syncToolbar() {
  document.querySelectorAll("#map-toolbar button[data-toolbar-layer]").forEach((btn) => {
    btn.classList.toggle("on", !!map.layers[btn.dataset.toolbarLayer]);
  });
}

// Set the glow (3D bloom) and reflect it on the slider + read-out.
function setGlowUI(v) {
  map.setGlow(v);
  const g = document.getElementById("mc-glow"); if (g) g.value = String(v);
  const gv = document.getElementById("mc-glow-val"); if (gv) gv.textContent = (+v).toFixed(1);
}
// Camera mode. 2D is flat (pitch 0) and kills the bloom/glow — the additive glow only
// reads at a 3D pitch and otherwise smears the map blue; 3D restores the pitch and the
// remembered glow. Also mirrors the Map Mode segmented control.
function setCameraMode(mode) {
  if (mode === "2d") {
    if (map.glow > 0) map._glow3d = map.glow; // remember the 3D glow to restore later
    setGlowUI(0);
    if (map.map && map.map.easeTo) map.map.easeTo({ pitch: 0, duration: 600 });
  } else {
    setGlowUI(map._glow3d != null ? map._glow3d : map.glow);
    if (map.map && map.map.easeTo) map.map.easeTo({ pitch: 45, duration: 600 });
  }
  document.querySelectorAll("#mc-mode button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
}

function bindSlider(id, apply, fmt) {
  const el = document.getElementById(id);
  if (!el) return;   // slider may not exist (e.g. opacity/glow now live in the Layer-Set Appearance)
  const out = document.getElementById(id + "-val");
  el.addEventListener("input", () => { const v = +el.value; apply(v); if (out) out.textContent = fmt(v); });
}

function fmtLegendNum(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString();
  return v.toFixed(2);
}

// Multi-layer legend: one typed block per DISTINCT variable in play (grouped by
// map.legend()), so the key stays truthful when layers encode different metrics.
// Block format adapts to data type — diverging/sequential gradients, a height
// glyph, categorical swatches, or a temperature scale.
let legendCollapsed = false;
function toggleLegend() {
  legendCollapsed = !legendCollapsed;
  const el = document.getElementById("map-legend");
  if (el) el.classList.toggle("collapsed", legendCollapsed);
}
// CSS gradient string from a ramp's rgb stops, evenly spaced.
function rampGradient(stops) {
  const n = stops.length;
  return "linear-gradient(90deg," + stops.map((c, i) => `rgb(${c.join(",")}) ${(n === 1 ? 0 : i / (n - 1) * 100).toFixed(1)}%`).join(",") + ")";
}
// Layer chips naming which layers an encoding drives (reuse the footer metadata).
function legendChips(layerKeys) {
  if (!layerKeys || !layerKeys.length) return "";
  return `<div class="lg-chips">` + layerKeys.map((k) => {
    const m = FOOTER_LAYER_META[k] || { c: "#8892a6", name: k };
    return `<span class="lg-chip"><span class="lg-cdot" style="--c:${m.c}"></span>${m.name}</span>`;
  }).join("") + `</div>`;
}
function legendBlockHtml(b) {
  if (b.channel === "color" || b.channel === "temp") {
    const d = b.domain, grad = rampGradient(b.rampStops);
    const unit = b.unit || "";
    const ends = d.zero != null
      ? `<span>${fmtLegendNum(d.min)}</span><span>0</span><span>${fmtLegendNum(d.max)}</span>`
      : `<span>${fmtLegendNum(d.min)}${unit}</span><span>${fmtLegendNum(d.max)}${unit}</span>`;
    return `<div class="lg-block">
      <div class="lg-var">${b.label}</div>
      ${legendChips(b.layerKeys)}
      <div class="lg-gradient" style="background:${grad}"></div>
      <div class="lg-ends">${ends}</div>
    </div>`;
  }
  if (b.channel === "height") {
    return `<div class="lg-block">
      <div class="lg-var">Height <span class="lg-up">↑</span> ${b.label}</div>
      ${legendChips(b.layerKeys)}
      <div class="lg-hglyph"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="lg-ends"><span>${fmtLegendNum(b.domain.min)}</span><span>${fmtLegendNum(b.domain.max)}</span></div>
    </div>`;
  }
  if (b.channel === "category") {
    return `<div class="lg-block">
      <div class="lg-var">${b.title}</div>
      <div class="lg-groups">` +
      b.items.map((g) => `<div class="lg-grow"><span class="lg-swatch" style="background:${g.color}"></span><span>${g.label}</span></div>`).join("") +
      `</div></div>`;
  }
  return "";
}
function updateLegend() {
  const lg = map.legend();
  const title = Atlas.scopeLabel(state.scope);
  const body = (lg.blocks && lg.blocks.length)
    ? lg.blocks.map(legendBlockHtml).join("")
    : `<div class="lg-empty">No data layer active</div>`;
  const el = document.getElementById("map-legend");
  el.classList.toggle("collapsed", legendCollapsed);
  el.innerHTML = `
    <div class="lg-head" id="lg-head">
      <span class="lg-title">${title}</span>
      <button class="lg-collapse" type="button" aria-label="Collapse legend">▾</button>
    </div>
    <div class="lg-body">${body}</div>`;
  const head = document.getElementById("lg-head");
  if (head) head.addEventListener("click", toggleLegend);
  updateFooter(); // footer mirrors the same state the legend reflects
  updateSelectBox();
  updateMapCaption();
  if (typeof Insights !== "undefined") Insights.scheduleRender();
  syncTimeline();
  syncSectorView();
  updateShapWaterfall();
}

// Canonical SHAP waterfall for the selected dong — top per-feature signed drivers.
// Positive (blue) raises predicted RHSI; negative (rose) lowers it.
function updateShapWaterfall() {
  const el = document.getElementById("shap-waterfall");
  if (!el) return;
  const on = (typeof Panels !== "undefined" && Panels.selectedDatasetId === "shap") && map && map.selectedDongCode;
  const rows = on ? Atlas.signedDrivers(map.selectedDongCode, 8) : [];
  if (!rows.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const mx = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  const dong = Atlas.dongByCode.get(map.selectedDongCode);
  el.innerHTML = `<div class="wf-head">SHAP drivers · <b>${dong ? dong.dong_name : ""}</b></div>
    <div class="wf-rows">${rows.map((r) => {
      const w = Math.round((Math.abs(r.value) / mx) * 48), pos = r.value >= 0;
      return `<div class="wf-row"><span class="wf-label">${r.label}</span>
        <div class="wf-track"><div class="wf-bar ${pos ? "pos" : "neg"}" style="width:${w}%; ${pos ? "left:50%" : "right:50%"};"></div></div></div>`;
    }).join("")}</div>
    <div class="wf-foot">← lower predicted RHSI · higher predicted RHSI →</div>`;
  el.classList.remove("hidden");
}

// One-line "reading the map" caption under the legend — what's encoded + what to look for.
const MAP_HINTS = {
  RHSI_retail: "blue dongs lose the most retail on hot days (heat-sensitive) — look for downtown clusters",
  land_price: "brighter = pricier land — compare its pattern to RHSI",
  delta_daypop: "how much daytime population drains on hot days — the strongest RHSI driver",
  dnpr: "day-vs-night population ratio — busier daytime areas are more heat-sensitive",
};
function updateMapCaption() {
  const el = document.getElementById("map-caption");
  if (!el || !map) return;
  if (map.isTimeMode()) {
    el.innerHTML = `Daily temperature heat field · <b>press play</b> to sweep 2024`;
    return;
  }
  const key = map.colorBy;
  const spec = (typeof Atlas !== "undefined") ? Atlas.metricSpec(key) : null;
  const label = spec ? spec.label : key;
  const hint = MAP_HINTS[key] || (spec && spec.signed ? "diverging by dong — blue is low, red is high" : "sequential by dong — low to high");
  el.innerHTML = `Colored by <b>${label}</b> · ${hint}`;
}

// Sector-view switcher: pick a multivariate encoding of the 6 sales themes.
function initSectorView() {
  document.querySelectorAll("#sector-view button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#sector-view button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      map.setSectorView(btn.dataset.sv || null);
      updateLegend();
    });
  });
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
  syncGrainAvailability();
}

// Granularity can't be coarser than the target area — aggregating a single Gu at
// "Seoul" grain is meaningless. Only the target level and finer grains are SHOWN
// (Seoul target → Seoul/Gu/Dong; Gu → Gu/Dong; Dong → Dong). Whenever the target
// hidden below the target level. The Granularity control is the single source of truth
// for grain, so this only *gates availability* — it never overrides a still-valid choice.
function syncGrainAvailability() {
  const order = { seoul: 0, gu: 1, dong: 2 };
  const finer = { seoul: "gu", gu: "dong", dong: "dong" }; // fallback when the current grain is invalid
  const targetLvl = state.scope.level === "city" ? "seoul" : state.scope.level;
  const min = order[targetLvl];
  const grains = activeSupports().grains; // capability-gated grains for the active dataset
  const btns = [...document.querySelectorAll("#grain-seg button")];
  btns.forEach((b) => {
    // hidden if coarser than the target area OR not supported by the active dataset
    b.hidden = order[b.dataset.grain] < min || !grains.includes(b.dataset.grain);
  });
  const isVisible = (g) => btns.some((b) => b.dataset.grain === g && !b.hidden);
  const cur = map && map.grain ? map.grain : document.querySelector("#grain-seg button.active")?.dataset.grain;
  // Keep the user's grain if it's still valid; only fall back when it's become invalid
  // (e.g. Dong target hides Seoul/Gu). Do NOT auto-jump on every scope change.
  let want = (cur && isVisible(cur)) ? cur : finer[targetLvl];
  if (!isVisible(want)) want = targetLvl; // e.g. Dong target → only Dong is valid
  btns.forEach((b) => b.classList.toggle("active", b.dataset.grain === want));
  if (map && map.grain !== want) map.setGrain(want);
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
  const metricOptions = metricOptionsGroupedHTML(Atlas.availableMapMetrics());
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
    if (typeof Insights !== "undefined") Insights.scheduleRender();
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

// ---------- dataset capabilities ----------
// What each dataset supports, so a control (timeline, sector view, granularity)
// only appears where the data actually has that dimension. No dataset selected =
// the whole project → everything is available.
const ALL_GRAINS = ["seoul", "gu", "dong"];
const DATASET_SUPPORTS = {
  weather:      { time: true,  sectors: false },
  sales:        { time: true,  sectors: true  },
  salesfeature: { time: true,  sectors: true  },
  sectorprofile:{ time: true,  sectors: true  },
  heatfeature:  { time: true,  sectors: false },
  heatdays:     { time: true,  sectors: false },
  atlas:        { time: true,  sectors: true  },
  context:      { time: false, sectors: true  }, // 4 urban-feature groups
  mobility:     { time: false, sectors: false },
  rhsi:         { time: false, sectors: false },
  shap:         { time: false, sectors: true  }, // 4 SHAP-contribution groups
  geometry:     { time: false, sectors: false },
  dongbase:     { time: false, sectors: false },
};
function activeSupports() {
  const ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
  if (!ds) return { time: true, sectors: true, grains: ALL_GRAINS };
  const s = DATASET_SUPPORTS[ds] || { time: false, sectors: false };
  return { time: !!s.time, sectors: !!s.sectors, grains: s.grains || ALL_GRAINS };
}
function syncTimeline() {
  if (typeof Timeline === "undefined" || !Timeline.chart) return;
  // The strip only makes sense for the two temporal datasets (Weather, Sales);
  // hide it entirely everywhere else (project overview, RHSI, Context, SHAP).
  const ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
  const show = ds === "weather" || ds === "sales";
  const strip = document.getElementById("timeline");
  if (strip) {
    strip.classList.toggle("hidden", !show);
    // Transport (play/speed/reset) only exists in time mode; in Static the strip still
    // draws the graph as context. The rail's Static/Animate is the one mode switch.
    strip.classList.toggle("time-live", show && map.isTimeMode());
  }
  Timeline.setEnabled(show);
  if (!show) return;
  Timeline.setChannel(timeChannel());
  const scope = map.grain === "seoul" ? { level: "city", guCode: null, dongCode: null } : state.scope;
  Timeline.setScope(scope);
  if (map.isTimeMode()) Timeline.setDay(timeState.dayIndex);
}

// The sector-view switcher only appears when the active data has sectors; otherwise
// it is hidden and any active encoding is cleared (capability gating).
function syncSectorView() {
  const el = document.getElementById("sector-view");
  if (!el || !map) return;
  const ok = activeSupports().sectors;
  el.classList.toggle("hidden", !ok);
  const stage = document.getElementById("map-stage");
  if (stage) stage.classList.toggle("sector-on", ok); // lift the legend clear of it
  if (!ok && map.sectorView) {
    map.setSectorView(null);
    el.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.sv === ""));
  }
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
// A dataset that explains/reuses another's variables borrows its metric scope.
// SHAP's contributions are per urban feature, so it shares Urban Context's features.
const METRIC_SCOPE_ALIAS = { shap: "context" };
function contextMetrics(honorCompare) {
  const all = Atlas.availableMapMetrics();
  const dsId = (typeof Panels !== "undefined" && Panels.selectedDatasetId) ? Panels.selectedDatasetId : null;
  const compare = honorCompare && document.querySelector("#mc-mode button.active")?.dataset.mode === "compare";
  if (compare || !dsId) return all;
  // Strictly the selected dataset's mappable variables — no fallback to "all" (a
  // dataset with no map-colorable variable, e.g. Weather, shows an empty list).
  const scopeId = METRIC_SCOPE_ALIAS[dsId] || dsId;
  return all.filter((m) => metricDataset(m.key) === scopeId);
}
function metricOptionsHTML(metrics) { return metrics.map((m) => `<option value="${m.key}">${m.label}</option>`).join(""); }
// Map a metric to its theme group (key + title): Sales industries → SALES_GROUPS,
// urban/share features → CONTEXT_GROUPS. Used to build the grouped dropdowns.
let _metricGroupLookup = null;
function metricGroupInfo(m) {
  if (!_metricGroupLookup) {
    _metricGroupLookup = {};
    const add = (groups) => { if (groups) Object.entries(groups).forEach(([gk, g]) => (g.columns || []).forEach((c) => { _metricGroupLookup[c] = { key: gk, title: g.title }; })); };
    if (typeof SALES_GROUPS !== "undefined") add(SALES_GROUPS);
    if (typeof CONTEXT_GROUPS !== "undefined") add(CONTEXT_GROUPS);
  }
  if (m.kind === "rhsi") return { key: null, title: "Heat-sensitivity index" };
  return _metricGroupLookup[m.key] || { key: null, title: m.kind === "industry" ? "Other industries" : "Other features" };
}
// Options grouped into <optgroup> by theme. Each group with a real key gets a
// selectable "▸ All <group>" row that colors the map by the group aggregate
// (value "grp_<key>"). Falls back to a flat list when it's all one group.
function metricOptionsGroupedHTML(metrics) {
  const groups = new Map(); // title -> { key, ms[] }
  metrics.forEach((m) => { const info = metricGroupInfo(m); if (!groups.has(info.title)) groups.set(info.title, { key: info.key, ms: [] }); groups.get(info.title).ms.push(m); });
  if (groups.size <= 1) return metricOptionsHTML(metrics);
  return [...groups].map(([title, { key, ms }]) => {
    const allOpt = key ? `<option value="grp_${key}">▸ All ${title}</option>` : "";
    return `<optgroup label="${title.replace(/&/g, "&amp;")}">${allOpt}${metricOptionsHTML(ms)}</optgroup>`;
  }).join("");
}
function setSelectOptions(sel, html, preferred) {
  if (!sel) return;
  sel.innerHTML = html;
  if (preferred && [...sel.options].some((o) => o.value === preferred)) sel.value = preferred;
}
// Rebuild every variable dropdown for the current dataset context. Rebuilding a
// select's <option>s via innerHTML keeps its change listener attached.
function refreshVariableDropdowns() {
  if (typeof Atlas === "undefined" || !map) return;
  const scoped = contextMetrics(false);                     // right-rail SELECT: always dataset-scoped
  const selHTML = metricOptionsGroupedHTML(scoped);         // grouped into <optgroup> by theme
  const empty = scoped.length === 0;
  // dd-color / dd-height are the fallback for any dataset without a Layer-Set config
  setSelectOptions(document.getElementById("dd-color"), `<option value="">${empty ? "— no mappable variables —" : "— color by —"}</option>` + selHTML, map.colorBy);
  setSelectOptions(document.getElementById("dd-height"), `<option value="">${empty ? "— no mappable variables —" : "— height by —"}</option>` + selHTML, map.heightBy);
  if (typeof LayerSetPanel !== "undefined") LayerSetPanel.sync(); // semantic panel for Sales/RHSI (hides the dropdowns above for those)
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
    const col = document.getElementById("insights-view");
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
    try {
      kpiHtml = typeof datasetSummaryHtml === "function"
        ? datasetSummaryHtml(state.scope, datasetId)
        : (typeof regionSummaryHtml === "function" ? regionSummaryHtml(state.scope) : "");
    } catch (e) {}
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
        <stop offset="0" stop-color="#7DA7FF"/><stop offset="0.5" stop-color="#FFB86B"/><stop offset="1" stop-color="#E4524E"/>
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
    const dateLabel = Atlas.timeDateLabel ? Atlas.timeDateLabel(timeState.dayIndex) : `day ${timeState.dayIndex + 1}`;
    if (map.timeVar === "sales") {
      const sales = info.level === "gu"
        ? Atlas.dayValueByGu(timeState.dayIndex, "sales")[guCode]
        : ((Atlas.groupSalesByDong(timeState.dayIndex)[info.dong_code] || []).reduce((sum, v) => sum + (v || 0), 0));
      rows += `<div class="rt-row"><span>${dateLabel} · sales</span><b>${sales == null ? "—" : fmtMetric(sales)}</b></div>`;
    } else {
      const temp = Atlas.dayValueByGu(timeState.dayIndex, "temp")[guCode];
      rows += `<div class="rt-row"><span>${dateLabel} · temp</span><b>${temp == null ? "—" : temp.toFixed(1) + "°C"}</b></div>`;
    }
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
      regionDatasetStats(info) +
      `<a class="rt-link" href="#">click to drill in →</a>`;
  } else {
    const m = Atlas.dongByCode.get(info.dong_code);
    tip.innerHTML = `<div class="rt-title">${info.dong_name}</div>` + rows + (m ? `
      <div class="rt-row"><span>RHSI</span><b>${m.RHSI_retail.toFixed(3)}</b></div>
      <div class="rt-row"><span>Rank</span><b>${m.rhsi_rank} / ${Atlas.dongMetrics.length}</b></div>
      <div class="rt-row"><span>Hot / Mild days</span><b>${m.n_hot_days} / ${m.n_mild_days}</b></div>` : "") +
      regionDatasetStats(info);
  }
  tip.style.left = (info.x + 16) + "px"; tip.style.top = (info.y + 16) + "px";
  tip.style.transform = "none";
  tip.classList.remove("hidden");
}
// Extra region stats tailored to the OPEN dataset (no header/prose — just numbers).
// Appended below the base tooltip rows; skipped on the project overview. Every lookup
// is null-guarded so a missing field simply drops its row.
function regionDatasetStats(info) {
  const dsId = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
  if (!dsId) return "";
  const level = info.level === "gu" ? "gu" : "dong";
  const guCode = info.gu_code || (level === "dong" ? (Atlas.dongByCode.get(info.dong_code) || {}).gu_code : null);
  const scope = level === "gu"
    ? { level: "gu", guCode: info.gu_code, dongCode: null }
    : { level: "dong", guCode, dongCode: info.dong_code };
  const rec = level === "gu" ? Atlas.guByCode.get(info.gu_code) : Atlas.dongByCode.get(info.dong_code);
  const row = (label, value) => (value == null || value === "" || value === "—")
    ? "" : `<div class="rt-row"><span>${label}</span><b>${value}</b></div>`;
  const pct1 = (v) => (v == null || Number.isNaN(v)) ? null : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const featVal = (key) => {
    const spec = Atlas.metricSpec(key); if (!spec) return null;
    return level === "gu" ? Atlas.guAggregateValue(info.gu_code, spec) : Atlas.metricValue(rec, spec);
  };
  let out = "";

  if (dsId === "rhsi") {
    out += row("Approx. change", pct1(Atlas.rhsiToPct(Atlas.retailHSI(scope))));
    const rank = rec && rec.rhsi_rank, total = level === "gu" ? Atlas.guMetrics.length : Atlas.dongMetrics.length;
    if (rank) out += row("Percentile", `top ${Math.max(1, Math.round(rank / total * 100))}%`);
  } else if (dsId === "weather") {
    const s = Atlas.dailySeries(scope).filter((d) => Number.isFinite(d.temp));
    if (s.length) {
      const temps = s.map((d) => d.temp);
      out += row("Peak temp", Math.max(...temps).toFixed(1) + "°C");
      out += row("Mean daily max", (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) + "°C");
    }
    const dd = level === "dong" ? (rec && rec.delta_daypop) : Atlas.deltaDaypop(scope);
    if (dd != null && !Number.isNaN(dd)) out += row("Δ Daypop (hot vs mild)", hsiPct(dd));
  } else if (dsId === "sales") {
    out += row("Retail change (hot vs mild)", pct1(Atlas.rhsiToPct(Atlas.retailHSI(scope))));
    const ind = Atlas.mostSensitiveIndustry(scope);
    if (ind) out += row("Most sensitive", `${ind.label} ${(ind.sensitivity * 100).toFixed(1)}%`);
    const rs = featVal("retail_share");
    if (rs != null) out += row("Retail share", (rs * 100).toFixed(1) + "%");
  } else if (dsId === "context") {
    // The urban features most correlated with RHSI, showing THIS region's value.
    (Atlas.rhsiCorrelations(4) || []).filter((c) => c.key !== map.colorBy).slice(0, 3).forEach((c) => {
      const val = featVal(c.key);
      if (val != null && !Number.isNaN(val)) out += row(URBAN_FEATURE_LABELS[c.key] || c.label || c.key, fmtMetric(val));
    });
  } else if (dsId === "shap") {
    const drivers = level === "dong"
      ? Atlas.signedDrivers(info.dong_code, 3)
      : (Atlas.featureImportance(scope, 3) || []).map((f) => ({ label: f.label, value: f.signed }));
    (drivers || []).forEach((d) => {
      if (d.value == null || Number.isNaN(d.value)) return;
      out += row(d.label, `${d.value >= 0 ? "+" : ""}${d.value.toFixed(3)}`);
    });
  }
  return out ? `<div class="rt-sep"></div>` + out : "";
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
