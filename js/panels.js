// UHUS right panel — Detail (Project → Lineage → Dataset → Tag) + Recommend Set.
// Structure/design from uhus_tabs_rebuilt_original_detail_visible.html; content is
// filled from the REAL datasets (Data_schema.csv + column lists). Selections drive
// the already-built map via the global `map` / app helpers (see applySelection).

// ICONS / DATASETS_META / DATASET_REPS moved to js/config/ (loaded before this file).

// ---- Variable metadata straight from UHUS/Data_schema.csv (definition/formula/unit/source) ----
// [definition, formula, unit, source, sourceType, datasetId]
// VARIABLE_META / SALES_GROUPS / CONTEXT_GROUPS / COMMON_VARS / LINEAGE /
// DATASET_CATALOG moved to js/config/uhus.js (loaded before this file).

// Weather / temporal variables → drive the time-flow instead of a static recolor.
const TIME_VARS = new Set(["temp_max", "apptemp_max", "precip_sum", "humid_max", "is_hot", "is_mild", "is_holiday", "date"]);

// ---- Lineage (Input → Feature → Index → View), each item → a dataset id ----

// Real source-file catalog for the Project Detail table — grouped by TRUE stage.
// Geometry is a spatial INPUT; shap_result is not a feature but the model's
// EXPLANATION (each feature's contribution to the RHSI prediction) — both were
// misfiled by the old view-centric lineage. The project table keeps each value to
// a few words; the full story lives on each dataset's own detail page. Flags mark
// spatial / temporal dimensions; coloured tags mark variable kind (same = same).
// Grouped by ROLE in the study (inputs → outcome ← explanation), which is the same
// story the relationship diagram draws. `stage` is kept as a small pipeline tag.

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

// Best-recommended 3D-map representation per dataset — the full map state that
// `applyRecommended(id)` applies (and mirrors onto every left-panel control).
// `time` / `color` default from each dataset's own `map` hint above; the fields
// here only ADD the layers, sector encoding, grain, camera mode and slider tuning
// that make each dataset read best. Everything omitted falls back to a default
// (grain "dong", mode "3d", color = the dataset's metric key, time = its map mode).
// REP_TYPES moved to js/config/representation.js (loaded before this file).
// Each dataset's Representation menu — first entry is the default (recommended) view.

// ---- Theme variable groups (sales + urban context) — for the tag detail panels ----


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
    this.applyPanelLayout();   // Detail + Insights open by default
    // Open on the UHUS project detail (Detail + Insights side by side).
    this.renderProject();
  },

  // The rail tabs are independent toggles: each opens/closes its own panel and any
  // that are open stack side by side. Closing them all collapses the whole column so
  // the map takes the space. Detail + Insights start open.
  openPanels: null,
  _panels() { return (this.openPanels = this.openPanels || new Set(["detail", "insights"])); },

  // Rail click → toggle. Clicking an already-open tab closes that panel.
  setTab(name) {
    if (!name) return;
    const open = this._panels();
    if (open.has(name)) open.delete(name); else open.add(name);
    this.applyPanelLayout();
  },
  // Programmatic "make sure this is showing" (never closes) — used when navigating to
  // a dataset/project, where toggling would be wrong.
  openTab(name) {
    if (!name) return;
    this._panels().add(name);
    this.applyPanelLayout();
  },
  applyPanelLayout() {
    const open = this._panels();
    document.querySelectorAll(".rail-tab").forEach((t) => t.classList.toggle("active", open.has(t.dataset.panelTab)));
    ["detail", "insights", "library"].forEach((n) => this.host.classList.toggle("open-" + n, open.has(n)));
    this.host.classList.toggle("panels-empty", open.size === 0);
    // the surrounding grid widens/collapses with the number of open panels
    const grid = document.querySelector(".analysis-grid");
    if (grid) {
      [0, 1, 2, 3].forEach((n) => grid.classList.remove("pcount-" + n));
      grid.classList.add("pcount-" + Math.min(3, open.size));
    }
    // Insights only draws while visible, so (re)render when it is showing.
    if (open.has("insights") && typeof Insights !== "undefined") Insights.render();
    if (open.has("library")) this.renderLibraryView();
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

    // Grain is owned by the Granularity control, not the representation. Sector glyphs
    // (rings/columns/dominant/…) render at gu AND dong via _sectorRegions, so we must NOT
    // force dong here — doing so made a manual Gu/Dong choice revert on every apply.
    // Reps that lean on dong data (e.g. hexbin) degrade gracefully rather than break.
    m.setSectorView(sector);

    // The Buildings representation needs buildings.json, which is lazy. Without this it
    // silently fell back to stacked columns (_buildingMixLayers) and looked like a
    // half-built feature — picking the rep now downloads it, same as the toolbar toggle.
    if (sector === "buildingmix" && typeof Atlas.ensureBuildings === "function" && !Atlas.buildings) {
      if (typeof showDownloadNotice === "function") showDownloadNotice("Downloading 3D buildings", "about 7 MB, one time");
      Atlas.ensureBuildings((loaded, total) => {
        if (typeof updateDownloadNotice === "function") updateDownloadNotice(loaded, total);
      }).then((b) => {
        if (typeof hideDownloadNotice === "function" && b) hideDownloadNotice();
        else if (typeof showDownloadNotice === "function" && !b) showDownloadNotice("3D buildings unavailable", "could not load the data", true);
        m._bldgCache = null; m._staticCache = null; m.render();
        if (typeof updateLegend === "function") updateLegend();
      });
    }

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
    // Layer-Set datasets infer their preset page before selectNode applies the default
    // representation, so the highlight has to be corrected once the rep is known.
    if (typeof LayerSetPanel !== "undefined") LayerSetPanel.syncPageToRep(id, repId);
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
    this.openTab("detail");
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
    this.openTab("detail");
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

