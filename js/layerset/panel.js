// ── Layer-Set panel (real dashboard) ────────────────────────────────────────
// Single-active, two surfaces:
//   • FULL editor  → left map-control panel (#mc-layerset). Presets are PAGES:
//     a pager flips between Single / Total / Across / Within / Comparison (+ saved
//     presets); the active page holds Structure · Representation · Variable/Group ·
//     Appearance (colour theme) · Save/Reset. Only the active page shows on the map.
//   • COMPACT      → right rail (#layerset-panel): quick view pick + variable.
// Drives the real engine: Panels.applyRepresentation + map.unifyLayerColors /
// setSectorView / setColorScheme. Other datasets keep the classic controls.
(function () {
  const REP_ICON = { choropleth: "▦", bars: "▮", columns: "▮", rings: "◎", radial: "✳", dominant: "◧", buildingmix: "◱", points: "⊙", signedcols: "⇅", divided: "◨" };
  // colour themes — keys match map.js COLOR_SCHEMES; css gradient for the swatch
  const THEMES = [
    { key: "default", label: "Amber", grad: "linear-gradient(90deg,#3a2a10,#ffc857,#ff5a28)" },
    { key: "blue", label: "Blue", grad: "linear-gradient(90deg,#0e121c,#466eb4,#7db4ff)" },
    { key: "teal", label: "Teal", grad: "linear-gradient(90deg,#0c1618,#289c8c,#50e6c8)" },
    { key: "viridis", label: "Viridis", grad: "linear-gradient(90deg,#281e46,#2da096,#f0e25c)" },
    { key: "magenta", label: "Magenta", grad: "linear-gradient(90deg,#120e18,#b43c96,#ff6ec8)" },
  ];
  // A GROUP holds variable-layers; each layer picks a DESIGN (its representation),
  // which maps to real map layers. Different designs composite together.
  // This replaces the old "Data layers" checkboxes — the designs live here now.
  const CHANNELS = [
    { key: "color", label: "Color", icon: "▦", layers: ["choropleth"] },
    { key: "height", label: "Height", icon: "▮", layers: ["columns"], height: true },
    { key: "points", label: "Points", icon: "⊙", layers: ["pointCore", "pointHalo"] },
    { key: "heatmap", label: "Heatmap", icon: "◍", layers: ["heatmap"] },
    { key: "hexbin", label: "Hexbin", icon: "⬡", layers: ["hexbin"] },
    { key: "dots", label: "Dot field", icon: "⋰", layers: ["dotField"] },
    { key: "rings", label: "Value rings", icon: "◎", layers: ["influence"] },
  ];

  // Built-in preset pages per dataset. supported=false → shown but greyed (real map can't render yet).
  //   group:true  → the page is a composite group of variable-layers (colour/height/points channels)
  //   glyph:true  → the group also carries the six-theme sector glyph (Sales "Across")
  // groupMeasures/baseRep parameterize the group engine so it isn't Sales-specific.
  const LS_DATASETS = {
    sales: {
      groupMeasures: "salesGroups", baseRep: "choropleth",
      temporal: true, timeRep: "choropleth",   // sales choropleth plays as the daily-sales sequence
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "salesGroups", hint: "One theme's heat-sensitivity per layer, composited." },
        { key: "total", label: "Total", icon: "▣", supported: false, msg: "No total-magnitude metric on the real map yet." },
        { key: "across", label: "Across", icon: "▤", supported: true, group: true, glyph: true, reps: ["rings", "columns", "radial", "dominant"], measures: "salesGroups", hint: "All six sales themes at once, as per-dong glyphs." },
        { key: "within", label: "Within", icon: "⊞", supported: false, msg: "Per-group view is coming to the real map." },
        { key: "comparison", label: "Compare", icon: "⇄", supported: false, msg: "A-vs-B diverging view is coming to the real map." },
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
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "contextVars", hint: "One urban feature per layer, composited on colour / height / points." },
      ],
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
      temporal: true, timeRep: "heatfield",
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "weatherVars", hint: "Hot / mild day counts per dong — flip Time on for the day-by-day heat field." },
      ],
    },
    heatfeature: {
      groupMeasures: "weatherVars", baseRep: "choropleth",
      temporal: true, timeRep: "heatfield",
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "weatherVars", hint: "Heat-exposure day counts; Time plays the daily field." },
      ],
    },
    // ---- remaining static feature datasets ----
    salesfeature: {
      groupMeasures: "salesShareVars", baseRep: "choropleth",
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "salesShareVars", hint: "Retail composition shares per dong." },
      ],
    },
    mobility: {
      groupMeasures: "mobilityVars", baseRep: "choropleth",
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "mobilityVars", hint: "Day/night population response — the strongest RHSI driver." },
      ],
    },
    heatdays: {
      groupMeasures: "weatherVars", baseRep: "choropleth",
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, group: true, measures: "weatherVars", hint: "Qualifying hot / mild day counts behind RHSI." },
      ],
    },
    // Sector Profile reads the same six sales themes as glyphs.
    sectorprofile: {
      groupMeasures: "salesGroups",
      pages: [
        { key: "across", label: "Across", icon: "▤", supported: true, group: true, glyph: true, reps: ["columns", "rings", "radial", "dominant"], measures: "salesGroups", hint: "Sector profile as per-dong glyphs." },
      ],
    },
    atlas: {
      temporal: true, timeRep: "compare",
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

  const LayerSetPanel = {
    _page: {},     // active page key per dataset (built-in key or "saved:<id>")
    _time: {},     // { dsId: bool } — temporal toggle fallback when the engine can't report
    _appear: {},   // { dsId: { scheme } }
    _grp: {},      // { dsId: { layers: [ {id, channel, measure} ] } } — the Single group
    _saved: null,  // { dsId: [ {id,name,page,rep,measure,scheme,layers} ] }
    _uid: 0,

    isSemantic(dsId) { return !!LS_DATASETS[dsId]; },

    sync() {
      const dsId = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
      const semantic = this.isSemantic(dsId);
      if (this._saved === null) this._saved = this._load();

      const rail = document.getElementById("layerset-panel");
      const colorG = document.getElementById("dd-color-group");
      const heightG = document.getElementById("dd-height-group");
      const railTitle = document.getElementById("dd-title");
      if (rail) { rail.hidden = !semantic; if (!semantic) rail.innerHTML = ""; }
      if (colorG) colorG.hidden = semantic;
      if (heightG) heightG.hidden = semantic;
      if (railTitle) railTitle.textContent = semantic ? "LAYER SET" : "SELECT";

      const mcHost = document.getElementById("mc-layerset");
      const mcTitle = document.getElementById("mc-ls-title");
      const repTitle = document.getElementById("mc-rep-title");
      const repSeg = document.getElementById("mc-representation");
      // NOTE: the panel width is constant (see .map-control in styles.css) — we deliberately
      // do NOT resize it per dataset, so the layout stays stable as you switch datasets.
      if (mcHost) { mcHost.hidden = !semantic; if (!semantic) mcHost.innerHTML = ""; }
      if (mcTitle) mcTitle.hidden = !semantic;
      if (repTitle) repTitle.hidden = semantic;
      if (repSeg) repSeg.hidden = semantic;

      if (!semantic) return;
      if (!this._page[dsId]) this._page[dsId] = this._inferPage(dsId);
      if (!this._appear[dsId]) this._appear[dsId] = {
        scheme: (typeof map !== "undefined" && map && map.colorScheme) || "default",
        opacity: (typeof map !== "undefined" && map && map.opacity != null) ? map.opacity : 0.85,
        glow: (typeof map !== "undefined" && map && map.glow != null) ? map.glow : 1,
        colorScale: "quantile", outline: 1, size: 1, label: false };
      if (!this._grp[dsId]) {   // one group per group-page (glyph pages start with no extra layers)
        const g = {};
        (LS_DATASETS[dsId].pages || []).forEach((p) => {
          if (!p.group) return;
          g[p.key] = p.glyph ? { rep: (p.reps && p.reps[0]) || "rings", layers: [] } : { layers: [this._newLayer(dsId, "color", 0)] };
        });
        this._grp[dsId] = g;
      }
      if (mcHost) this.renderFull(dsId, mcHost);
      if (rail) this.renderCompact(dsId, rail);
    },

    // ---- FULL paged editor (map panel) ----
    renderFull(dsId, host) {
      const cfg = LS_DATASETS[dsId];
      const saved = this._savedFor(dsId);
      const activeKey = this._page[dsId];
      const active = this._pageByKey(dsId, activeKey);

      // pager: built-in pages + saved presets
      const tabs = cfg.pages.map((p) =>
        `<button class="ls-tab${activeKey === p.key ? " on" : ""}${p.supported ? "" : " ls-dis"}" data-ls-page="${p.key}"${p.supported ? "" : ` title="${p.msg}"`}>${p.label}</button>`).join("")
        + saved.map((s) =>
          `<button class="ls-tab ls-tab-saved${activeKey === "saved:" + s.id ? " on" : ""}" data-ls-page="saved:${s.id}" title="Saved preset">${s.name}<span class="ls-tabx" data-ls-delsaved="${s.id}">×</span></button>`).join("");
      const pager = `<div class="ls-pager">${tabs}</div>`;

      let body;
      if (active && active.supported === false) {
        body = `<div class="ls-hint ls-hint-warn">${active.msg}</div>`;
      } else {
        const rep = (typeof Panels !== "undefined") ? Panels.selectedRep : null;
        const measures = this._measures(active.measures);
        const scheme = this._appear[dsId].scheme;
        const isAcross = !!(active.group && active.glyph);
        const isSingle = !!(active.group && !active.glyph);
        const isGroup = isSingle || isAcross;
        let mainRows;
        if (isSingle) {
          mainRows = this._groupEditorHTML(dsId, active.key, "Layers · one variable each");
        } else if (isAcross) {
          mainRows = this._acrossEditorHTML(dsId);
        } else {
          const repRow = (active.reps && active.reps.length)
            ? `<div class="ls-row-l">Representation</div><div class="ls-seg ls-seg-wrap">${active.reps.map((r) =>
                `<button class="ls-b${r === rep ? " on" : ""}" data-ls-rep="${r}"><i>${REP_ICON[r] || "▦"}</i><span>${this._repLabel(r)}</span></button>`).join("")}</div>` : "";
          const varRow = (active.key === "single" && measures.length > 1)
            ? `<div class="ls-row-l">Variable</div>${this._measureSelect(measures, (typeof map !== "undefined" && map) ? map.colorBy : null)}` : "";
          mainRows = repRow + varRow;
        }
        const saveLabel = activeKey.indexOf("saved:") === 0 ? "Update" : "Save as…";
        const isSaved = activeKey.indexOf("saved:") === 0;
        const actions = `<div class="ls-actions"><button class="ls-act" data-ls-save>${saveLabel}</button><button class="ls-act" data-ls-reset>Reset</button></div>`;
        const nAcross = isAcross ? this._grpOf(dsId, active.key).layers.length : 0;
        const gnote = isSingle ? "group of " + this._grpOf(dsId, active.key).layers.length
          : isAcross ? "glyph + " + nAcross + " layer" + (nAcross === 1 ? "" : "s") : "";
        // #1 section chrome + badges
        const head = `<span class="ls-badge s-${active.key}"><i>${active.icon || "▪"}</i>${active.label}</span>` +
          (gnote ? `<span class="ls-gnote">${gnote}</span>` : "") +
          `<span class="ls-headsp"></span><span class="ls-tag ${isSaved ? "custom" : "preset"}">${isSaved ? "saved" : "preset"}</span>`;
        const readas = this._readAsHTML(dsId, active);
        const appearance = this._appearanceHTML(dsId);   // #3
        body = `<div class="ls-card-head">${head}</div>
          <div class="ls-card-body">${mainRows}${readas}${appearance}${actions}${(!isGroup && active.hint) ? `<div class="ls-hint">${active.hint}</div>` : ""}</div>`;
      }

      host.innerHTML = `<div class="ls-inner">${pager}<div class="ls-card">${body}</div></div>`;
      this._wireFull(host, dsId);
    },

    _wireFull(host, dsId) {
      host.querySelectorAll("[data-ls-page]").forEach((b) => b.onclick = (e) => {
        if (e.target.dataset.lsDelsaved) return; // handled below
        this._selectPage(dsId, b.dataset.lsPage);
      });
      host.querySelectorAll("[data-ls-delsaved]").forEach((x) => x.onclick = (e) => { e.stopPropagation(); this._deleteSaved(dsId, x.dataset.lsDelsaved); });
      host.querySelectorAll("[data-ls-rep]").forEach((b) => b.onclick = () => this._applyPage(dsId, b.dataset.lsRep));
      const sel = host.querySelector("[data-ls-measure]");
      if (sel) sel.onchange = () => this._applyMeasure(dsId, sel.value);
      // group layer controls (Single + Across)
      host.querySelectorAll("[data-ls-glyph]").forEach((b) => b.onclick = () => this._setGlyph(dsId, b.dataset.lsGlyph));
      host.querySelectorAll("select[data-ls-lchan]").forEach((s) => s.onchange = () => this._setLayerField(dsId, s.dataset.lsLchan, "channel", s.value));
      host.querySelectorAll("[data-ls-lvar]").forEach((s) => s.onchange = () => this._setLayerField(dsId, s.dataset.lsLvar, "measure", s.value));
      host.querySelectorAll("[data-ls-ldel]").forEach((b) => b.onclick = () => this._removeLayer(dsId, b.dataset.lsLdel));
      const addL = host.querySelector("[data-ls-addlayer]"); if (addL) addL.onclick = () => this._addLayer(dsId);
      host.querySelectorAll("[data-ls-theme]").forEach((b) => b.onclick = () => this._applyTheme(dsId, b.dataset.lsTheme));
      // #3 appearance controls
      host.querySelectorAll("[data-ls-ap]").forEach((inp) => {
        const handler = () => this._setAppear(dsId, inp.dataset.lsAp, inp.type === "checkbox" ? inp.checked : inp.value, inp.type === "range");
        if (inp.type === "range") inp.oninput = handler; else inp.onchange = handler;
      });
      host.querySelectorAll("[data-ls-scale]").forEach((b) => b.onclick = () => this._setAppear(dsId, "colorScale", b.dataset.lsScale, false));
      const save = host.querySelector("[data-ls-save]"); if (save) save.onclick = () => this._save(dsId);
      const reset = host.querySelector("[data-ls-reset]"); if (reset) reset.onclick = () => this._reset(dsId);
    },

    // ---- COMPACT (right rail): pick a PRESET (Single / Total / … + saved) + variable ----
    renderCompact(dsId, host) {
      const cfg = LS_DATASETS[dsId];
      const activeKey = this._page[dsId];
      const active = this._pageByKey(dsId, activeKey);
      const builtins = cfg.pages.map((p) =>
        `<button class="ls-b${activeKey === p.key ? " on" : ""}${p.supported ? "" : " ls-dis"}" data-ls-page="${p.key}"${p.supported ? "" : ` title="${p.msg}"`}><i>${p.icon}</i><span>${p.label}</span></button>`).join("");
      const saved = this._savedFor(dsId).map((s) =>
        `<button class="ls-b${activeKey === "saved:" + s.id ? " on" : ""}" data-ls-page="saved:${s.id}" title="Saved preset"><i>★</i><span>${s.name}</span></button>`).join("");
      const presetHTML = `<div class="ls-row-l">Preset</div><div class="ls-seg ls-seg-wrap">${builtins}${saved}</div>`;

      let measHTML = "";
      const measures = this._measures(active && active.measures);
      // group pages pick their variables per-layer in the map panel, so only non-group pages get a dropdown
      if (active && !active.group && measures.length > 1) measHTML = `<div class="ls-row-l">Variable</div>${this._measureSelect(measures, (typeof map !== "undefined" && map) ? map.colorBy : null)}`;

      // temporal toggle — only for datasets that have a time representation
      let timeHTML = "";
      if (cfg.temporal) {
        const on = this._isTime(dsId);
        timeHTML = `<div class="ls-row-l">Time</div><div class="ls-seg">
          <button class="ls-b${on ? "" : " on"}" data-ls-time="off"><i>▪</i><span>Static</span></button>
          <button class="ls-b${on ? " on" : ""}" data-ls-time="on"><i>▶</i><span>Animate</span></button></div>`;
      }

      host.innerHTML = `<div class="ls-inner">${presetHTML}${measHTML}${timeHTML}</div>`;
      host.querySelectorAll("[data-ls-page]").forEach((b) => b.onclick = () => this._selectPage(dsId, b.dataset.lsPage));
      host.querySelectorAll("[data-ls-time]").forEach((b) => b.onclick = () => this._setTime(dsId, b.dataset.lsTime === "on"));
      const sel = host.querySelector("[data-ls-measure]");
      if (sel) sel.onchange = () => this._applyMeasure(dsId, sel.value);
    },

    // ---- Single = group of variable-layers (composite) ----
    _newLayer(dsId, channel, measureIdx) {
      const m = this._measures(this._groupMeasures(dsId));
      return { id: "L" + (++this._uid), channel: channel || "color", measure: (m[measureIdx] || m[0]).key };
    },
    _curPage(dsId) { const p = this._pageByKey(dsId, this._page[dsId]); return p ? p.key : "single"; },
    _grpOf(dsId, pageKey) { return this._grp[dsId][pageKey || this._curPage(dsId)]; },
    // list of variable-layer rows (shared by Single + Across "extra layers")
    _layerRowsHTML(dsId, grp, minLayers) {
      const measures = this._measures(this._groupMeasures(dsId));
      return grp.layers.map((L) => `<div class="ls-layer">
        <select class="ls-select ls-lchan" data-ls-lchan="${L.id}" title="Representation">${CHANNELS.map((c) => `<option value="${c.key}"${L.channel === c.key ? " selected" : ""}>${c.icon}  ${c.label}</option>`).join("")}</select>
        <select class="ls-select ls-lvar" data-ls-lvar="${L.id}" title="Variable">${measures.map((m) => `<option value="${m.key}"${m.key === L.measure ? " selected" : ""}>${m.label}</option>`).join("")}</select>
        <button class="ls-lx" data-ls-ldel="${L.id}"${grp.layers.length <= minLayers ? " disabled" : ""} title="Remove layer">×</button></div>`).join("");
    },
    _groupEditorHTML(dsId, pageKey, label) {
      const grp = this._grpOf(dsId, pageKey);
      return `<div class="ls-row-l">${label}</div><div class="ls-layers">${this._layerRowsHTML(dsId, grp, 1)}<button class="ls-addlayer" data-ls-addlayer>＋ Add variable layer</button></div>`;
    },
    _acrossEditorHTML(dsId) {
      const g = this._grp[dsId].across, rep = g.rep;
      const glyphs = ["rings", "columns", "radial", "dominant"];
      const glyphRow = `<div class="ls-row-l">Six-theme glyph</div><div class="ls-seg ls-seg-wrap">${glyphs.map((r) =>
        `<button class="ls-b${r === rep ? " on" : ""}" data-ls-glyph="${r}"><i>${REP_ICON[r] || "◎"}</i><span>${this._repLabel(r)}</span></button>`).join("")}</div>`;
      const extra = `<div class="ls-row-l">Extra variable layers</div><div class="ls-layers">${this._layerRowsHTML(dsId, g, 0)}<button class="ls-addlayer" data-ls-addlayer>＋ Add variable layer</button></div>`;
      return glyphRow + extra;
    },
    _setGlyph(dsId, rep) { this._grp[dsId].across.rep = rep; this._applyActive(dsId); },
    _setLayerField(dsId, layerId, field, val) {
      const grp = this._grpOf(dsId); const L = (grp.layers || []).find((x) => x.id === layerId); if (!L) return;
      L[field] = val; this._applyActive(dsId);
    },
    _addLayer(dsId) {
      const grp = this._grpOf(dsId), used = grp.layers.map((L) => L.measure);
      const measures = this._measures(this._groupMeasures(dsId));
      const nextIdx = Math.max(0, measures.findIndex((m) => used.indexOf(m.key) === -1));
      const nextChan = CHANNELS[Math.min(grp.layers.length, CHANNELS.length - 1)].key;
      grp.layers.push(this._newLayer(dsId, nextChan, nextIdx < 0 ? 0 : nextIdx));
      this._applyActive(dsId);
    },
    _removeLayer(dsId, layerId) {
      // a glyph page (Across) may drop to zero extra layers; a plain group keeps at least one
      const page = this._builtin(dsId, this._curPage(dsId));
      const grp = this._grpOf(dsId), min = (page && page.glyph) ? 0 : 1;
      if (grp.layers.length <= min) return;
      grp.layers = grp.layers.filter((L) => L.id !== layerId);
      this._applyActive(dsId);
    },
    // Set each variable-layer's per-layer var on its channel; returns the enabled channels.
    _compositeLayers(layers) {
      const on = {}; let firstColor = null;
      (layers || []).forEach((L) => {
        if (!L.measure || (typeof Atlas !== "undefined" && !Atlas.metricSpec(L.measure))) return;
        const ch = CHANNELS.find((c) => c.key === L.channel) || CHANNELS[0];
        ch.layers.forEach((ml) => {
          on[ml] = true;
          map.layerVar[ml] = L.measure;
          if (ch.height) map.layerHeightVar[ml] = L.measure;
        });
        if (ch.key === "color" && !firstColor) firstColor = L.measure;
      });
      return { on: on, firstColor: firstColor };
    },
    _applyActive(dsId) {
      const page = this._builtin(dsId, this._curPage(dsId));
      if (page && page.glyph) this._applyAcross(dsId); else this._applySingle(dsId);
    },
    // ---- temporal toggle (Weather / Sales / Heat features / Atlas) ----
    // Truth comes from the engine when it can tell us; _time is the fallback.
    _isTime(dsId) {
      if (typeof map !== "undefined" && map && typeof map.isTimeMode === "function") return !!map.isTimeMode();
      return !!this._time[dsId];
    },
    _setTime(dsId, on) {
      this._time[dsId] = on;
      if (on) this._applyTime(dsId); else this._applyStatic(dsId);
    },
    // ON → the dataset's time representation; applyRepresentation enters time mode itself
    // (rt.time for heatfield/compare, or the sales daily-choropleth sequence).
    _applyTime(dsId) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      Panels.applyRepresentation(dsId, (LS_DATASETS[dsId] || {}).timeRep || "heatfield");
      this._applyAppearance(dsId);
      map.render(); this._afterApply();
    },
    // OFF → re-apply whatever preset page is active (those paths call exitTimeMode)
    _applyStatic(dsId) {
      const page = this._pageByKey(dsId, this._page[dsId]);
      if (page && page.group) this._applyActive(dsId);
      else this._applyPage(dsId, (page && page.reps && page.reps[0]) || null);
    },
    // Single = variable-layers composited on data channels (no sector glyph).
    _applySingle(dsId) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const baseRep = (LS_DATASETS[dsId] && LS_DATASETS[dsId].baseRep) || "choropleth";
      Panels.applyRepresentation(dsId, baseRep);
      if (typeof exitTimeMode === "function") exitTimeMode();
      map.layerVar = {}; map.layerHeightVar = {};
      const c = this._compositeLayers(this._grpOf(dsId, this._curPage(dsId)).layers);
      c.on.boundary = true; c.on.roads = true;
      Object.keys(map.layers).forEach((k) => { map.layers[k] = !!c.on[k]; });
      if (c.firstColor) map.colorBy = c.firstColor;
      this._applyAppearance(dsId);
      if (typeof Panels !== "undefined") Panels.selectedRep = "single";
      map.render(); this._afterApply();
    },
    // Across = the six-theme sector glyph + optional variable-layers composited on top.
    _applyAcross(dsId) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const g = this._grp[dsId].across;
      Panels.applyRepresentation(dsId, g.rep);   // sets sectorView + base allow-list
      map.layerVar = {}; map.layerHeightVar = {};
      const c = this._compositeLayers(g.layers);
      map.layers.boundary = true;
      Object.keys(c.on).forEach((k) => { map.layers[k] = true; });   // add data layers over the glyph
      if (c.firstColor) map.colorBy = c.firstColor;
      this._applyAppearance(dsId);
      map.render(); this._afterApply();
    },
    _afterApply() {
      if (typeof syncLayerChecks === "function") syncLayerChecks();
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    // scheme + opacity + glow are the appearance controls the real map honors today
    _applyAppearance(dsId) {
      const a = this._appear[dsId]; if (!a || typeof map === "undefined" || !map) return;
      if (typeof map.setColorScheme === "function") map.setColorScheme(a.scheme);
      if (a.opacity != null) map.opacity = +a.opacity;
      if (a.glow != null) map.glow = +a.glow;
    },
    _setAppear(dsId, field, val, isSliderLive) {
      const a = this._appear[dsId]; if (!a) return;
      a[field] = field === "label" ? !!val : (field === "colorScale" ? val : +val);
      if (typeof map !== "undefined" && map) {
        if (field === "opacity") { map.opacity = +val; if (map.render) map.render(); }
        else if (field === "glow") { map.glow = +val; if (map.render) map.render(); }
        // outline / size / label / colorScale are stored only (real map can't drive them yet)
      }
      if (!isSliderLive) this.sync();   // reflect discrete changes (theme/scale/label); skip during slider drag
    },
    // #1 read-as label — inferred from the variable (magnitude vs change), not a toggle
    _readAsHTML(dsId, active) {
      let label = "value", readAs = "magnitude";
      if (active.key === "across") { label = "six themes"; readAs = "magnitude"; }
      else {
        const key = (typeof map !== "undefined" && map) ? map.colorBy : null;
        const spec = (typeof Atlas !== "undefined" && Atlas.metricSpec) ? Atlas.metricSpec(key) : null;
        const m = this._measures(active.measures).find((x) => x.key === key);
        label = m ? m.label : (active.label + " value");
        readAs = spec && spec.signed ? "change" : "magnitude";
      }
      return `<div class="ls-readas">${label} · <b>${readAs}</b> <span class="ls-i" title="Read-as is inferred from the variable — a label, not a toggle.">&#9432;</span></div>`;
    },
    // #3 appearance section — working (color theme/opacity/glow) + inert "coming" (color scale/outline/size/label)
    _appearanceHTML(dsId) {
      const a = this._appear[dsId];
      const themes = THEMES.map((t) => `<button class="ls-sw${a.scheme === t.key ? " on" : ""}" data-ls-theme="${t.key}" title="${t.label}" style="background:${t.grad}"></button>`).join("");
      const scales = ["linear", "quantize", "quantile"].map((s) => `<button class="ls-b3${a.colorScale === s ? " on" : ""}" data-ls-scale="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`).join("");
      return `<div class="ls-row-l">Appearance</div><div class="ls-app">
        <div class="ls-arow"><span>Color theme</span><div class="ls-swrow">${themes}</div></div>
        <label class="ls-arow"><span>Opacity</span><input type="range" class="ls-mini" data-ls-ap="opacity" min="0.2" max="1" step="0.05" value="${a.opacity}"></label>
        <label class="ls-arow"><span>Glow</span><input type="range" class="ls-mini" data-ls-ap="glow" min="0" max="2" step="0.1" value="${a.glow}"></label>
        <div class="ls-arow ls-dim"><span>Color scale</span><div class="ls-seg ls-scaleseg">${scales}</div><span class="ls-coming">coming</span></div>
        <label class="ls-arow ls-dim"><span>Outline</span><input type="range" class="ls-mini" data-ls-ap="outline" min="0" max="4" step="0.5" value="${a.outline}"><span class="ls-coming">coming</span></label>
        <label class="ls-arow ls-dim"><span>Size</span><input type="range" class="ls-mini" data-ls-ap="size" min="0.5" max="3" step="0.1" value="${a.size}"><span class="ls-coming">coming</span></label>
        <label class="ls-arow ls-dim"><span>Label</span><span class="ls-apsp"></span><input type="checkbox" data-ls-ap="label"${a.label ? " checked" : ""}><span class="ls-coming">coming</span></label>
      </div>`;
    },

    // ---- helpers ----
    _repLabel(r) { return (typeof REP_TYPES !== "undefined" && REP_TYPES[r] && REP_TYPES[r].label) || r; },
    _measureSelect(measures, cur) {
      const has = measures.some((m) => m.key === cur);
      return `<select class="ls-select" data-ls-measure>${has ? "" : `<option value="" selected hidden>— pick a variable —</option>`}${measures.map((m) =>
        `<option value="${m.key}"${m.key === cur ? " selected" : ""}>${m.label}</option>`).join("")}</select>`;
    },
    _measures(kind) {
      if (kind === "salesGroups") { const S = (typeof SALES_GROUPS !== "undefined") ? SALES_GROUPS : {}; return Object.keys(S).map((k) => ({ key: "grp_" + k, label: S[k].title })); }
      if (kind === "rhsiOnly") { return [{ key: "RHSI_retail", label: "RHSI (heat sensitivity)" }]; }
      // day counts behind RHSI — the static (non-animated) view for Weather / Heat-Day Summary
      if (kind === "weatherVars") { return [{ key: "n_hot_days", label: "Extreme-heat days" }, { key: "n_mild_days", label: "Mild days" }]; }
      if (kind === "mobilityVars") { return [{ key: "delta_daypop", label: "Δ Daypop (hot vs mild)" }, { key: "dnpr", label: "Day/Night Pop Ratio" }]; }
      if (kind === "salesShareVars") {
        const L = (typeof URBAN_FEATURE_LABELS !== "undefined") ? URBAN_FEATURE_LABELS : {};
        return ["retail_share", "dinebev_share_all", "everyday_retail_share_all", "general_share_all", "large_format_share_all"]
          .map((k) => ({ key: k, label: L[k] || k }));
      }
      // Urban context: the four theme groups first, then every individual urban feature.
      if (kind === "contextVars") {
        const C = (typeof CONTEXT_GROUPS !== "undefined") ? CONTEXT_GROUPS : {};
        const groups = Object.keys(C).map((k) => ({ key: "grp_" + k, label: C[k].title + " (group)" }));
        const keys = (typeof URBAN_FEATURE_KEYS !== "undefined") ? URBAN_FEATURE_KEYS : [];
        const L = (typeof URBAN_FEATURE_LABELS !== "undefined") ? URBAN_FEATURE_LABELS : {};
        return groups.concat(keys.map((k) => ({ key: k, label: L[k] || k })));
      }
      return [];
    },
    // measures kind used by this dataset's group variable-layers
    _groupMeasures(dsId) { return (LS_DATASETS[dsId] && LS_DATASETS[dsId].groupMeasures) || "salesGroups"; },
    _validMeasure(key, kind) { return this._measures(kind).some((m) => m.key === key) ? key : null; },
    _builtin(dsId, key) { return LS_DATASETS[dsId].pages.find((p) => p.key === key); },
    _savedFor(dsId) { return (this._saved && this._saved[dsId]) || []; },
    _savedById(dsId, id) { return this._savedFor(dsId).find((s) => s.id === id); },
    // resolve a page key (built-in or "saved:<id>") → a page-like object
    _pageByKey(dsId, key) {
      if (key && key.indexOf("saved:") === 0) {
        const s = this._savedById(dsId, key.slice(6)); if (!s) return this._firstPage(dsId);
        const base = this._builtin(dsId, s.page) || this._firstPage(dsId) || {};
        // carry the base page's group/glyph flags so saved presets take the same code paths
        return { key: s.page, label: s.name, icon: "★", supported: base.supported !== false, reps: base.reps,
          measures: base.measures, hint: base.hint, group: base.group, glyph: base.glyph, _saved: s };
      }
      return this._builtin(dsId, key) || this._firstPage(dsId);
    },
    // first page a dataset can actually show (not every dataset has a "single" page)
    _firstPage(dsId) {
      const pages = (LS_DATASETS[dsId] && LS_DATASETS[dsId].pages) || [];
      return pages.find((p) => p.supported !== false) || pages[0] || null;
    },
    _inferPage(dsId) {
      const sv = (typeof map !== "undefined" && map) ? map.sectorView : null;
      const glyphPage = (LS_DATASETS[dsId].pages || []).find((p) => p.glyph);
      if (glyphPage && sv && (glyphPage.reps || []).includes(sv)) return glyphPage.key;
      const first = this._firstPage(dsId);
      return first ? first.key : "single";
    },

    // ---- engine actions ----
    _selectPage(dsId, key) {
      const page = this._pageByKey(dsId, key);
      if (!page) return;
      this._page[dsId] = key;
      this._time[dsId] = false;   // choosing a static preset leaves time mode
      if (page.supported === false) { this.sync(); return; }
      if (page._saved) {   // apply a full saved preset
        const s = page._saved;
        if (s.appear) this._appear[dsId] = Object.assign(this._appear[dsId] || {}, s.appear);
        else if (s.scheme) this._appear[dsId].scheme = s.scheme;
        if (page.group && !page.glyph) {
          this._grp[dsId][page.key] = { layers: (s.layers && s.layers.length) ? s.layers.map((L) => this._cloneLayer(L)) : [this._newLayer(dsId, "color", 0)] };
          this._applyActive(dsId); return;
        }
        if (page.group && page.glyph) {
          this._grp[dsId][page.key] = { rep: s.rep || "rings", layers: (s.layers || []).map((L) => this._cloneLayer(L)) };
          this._applyActive(dsId); return;
        }
        this._applyPage(dsId, s.rep, s.measure);
        return;
      }
      if (page.group) { this._applyActive(dsId); return; }
      this._applyPage(dsId, (page.reps && page.reps[0]) || null);
    },
    _cloneLayer(L) { return { id: "L" + (++this._uid), channel: L.channel || "color", measure: L.measure }; },
    // Non-group pages (RHSI, SHAP): one representation + the dataset's colour metric.
    // For SHAP this also brings up the app's own #shap-feature-filter via _syncShapFeatureControl.
    _applyPage(dsId, rep, measure) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const page = this._pageByKey(dsId, this._page[dsId]);
      this._applyAppearance(dsId);
      Panels.applyRepresentation(dsId, rep || (page.reps && page.reps[0]) || "choropleth");
      const list = this._measures(page.measures);
      if (list.length) map.unifyLayerColors(measure || this._validMeasure(map.colorBy, page.measures) || list[0].key);
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    _applyMeasure(dsId, key) {
      if (typeof map === "undefined" || !map || !key) return;
      if (typeof exitTimeMode === "function") exitTimeMode();
      map.unifyLayerColors(key);
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    _applyTheme(dsId, scheme) {
      this._appear[dsId].scheme = scheme;
      if (typeof map !== "undefined" && map && typeof map.setColorScheme === "function") map.setColorScheme(scheme);
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },

    // ---- Save / Reset preset library ----
    _snapshot(dsId) {
      const page = this._pageByKey(dsId, this._page[dsId]);
      const snap = { page: page.key, rep: (typeof Panels !== "undefined") ? Panels.selectedRep : null,
        measure: (typeof map !== "undefined" && map) ? map.colorBy : null, scheme: this._appear[dsId].scheme,
        appear: Object.assign({}, this._appear[dsId]) };
      const gp = this._builtin(dsId, page.key);
      if (gp && gp.group) {
        const g = this._grpOf(dsId, page.key);
        snap.layers = (g.layers || []).map((L) => ({ channel: L.channel, measure: L.measure }));
        if (gp.glyph) snap.rep = g.rep;
      }
      return snap;
    },
    _save(dsId) {
      const activeKey = this._page[dsId];
      if (activeKey.indexOf("saved:") === 0) {   // Update the active saved preset in place
        const s = this._savedById(dsId, activeKey.slice(6)); if (!s) return;
        Object.assign(s, this._snapshot(dsId)); this._persist(); this._flash("Updated “" + s.name + "”"); this.sync(); return;
      }
      this._promptName("", (name) => {          // Save as… a new preset
        const snap = this._snapshot(dsId);
        const entry = Object.assign({ id: "p" + Date.now().toString(36), name: name }, snap);
        (this._saved[dsId] = this._saved[dsId] || []).push(entry);
        this._page[dsId] = "saved:" + entry.id;
        this._persist(); this._flash("Saved “" + name + "”"); this.sync();
      });
    },
    _reset(dsId) {
      const activeKey = this._page[dsId];
      this._appear[dsId] = { scheme: "default", opacity: 0.85, glow: 1, colorScale: "quantile", outline: 1, size: 1, label: false };
      if (activeKey.indexOf("saved:") === 0) {   // revert edits to the saved preset's stored config
        const s = this._savedById(dsId, activeKey.slice(6));
        if (s) { if (s.appear) this._appear[dsId] = Object.assign(this._appear[dsId], s.appear); else if (s.scheme) this._appear[dsId].scheme = s.scheme; this._selectPage(dsId, activeKey); return; }
      }
      const page = this._builtin(dsId, activeKey) || this._firstPage(dsId);
      if (page.group) {
        this._grp[dsId][page.key] = page.glyph
          ? { rep: (page.reps && page.reps[0]) || "rings", layers: [] }
          : { layers: [this._newLayer(dsId, "color", 0)] };
        this._applyActive(dsId); return;
      }
      this._applyPage(dsId, (page.reps && page.reps[0]) || null);
    },
    _deleteSaved(dsId, id) {
      this._saved[dsId] = this._savedFor(dsId).filter((s) => s.id !== id);
      if (this._page[dsId] === "saved:" + id) this._page[dsId] = "single";
      this._persist(); this.sync();
    },
    _load() { try { return JSON.parse(localStorage.getItem("atlas_ls_presets") || "") || {}; } catch (e) { return {}; } },
    _persist() { try { localStorage.setItem("atlas_ls_presets", JSON.stringify(this._saved)); } catch (e) {} },

    _promptName(def, cb) {
      const ov = document.createElement("div"); ov.className = "ls-modal-ov";
      ov.innerHTML = `<div class="ls-modal"><div class="ls-modal-t">Save preset as…</div>
        <input class="ls-modal-in" type="text" value="${(def || "").replace(/"/g, "&quot;")}" placeholder="Preset name"/>
        <div class="ls-modal-btns"><button class="ls-modal-cancel">Cancel</button><button class="ls-modal-ok">Save</button></div></div>`;
      document.body.appendChild(ov);
      const inp = ov.querySelector(".ls-modal-in"), close = () => ov.remove();
      const ok = () => { const v = inp.value.trim(); if (v) { close(); cb(v); } };
      setTimeout(() => { inp.focus(); }, 0);
      ov.querySelector(".ls-modal-cancel").onclick = close;
      ov.querySelector(".ls-modal-ok").onclick = ok;
      inp.onkeydown = (e) => { if (e.key === "Enter") ok(); else if (e.key === "Escape") close(); };
      ov.onclick = (e) => { if (e.target === ov) close(); };
    },
    _flash(msg) {
      const t = document.createElement("div"); t.className = "ls-toast"; t.textContent = msg; document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1500);
    },
  };

  window.LayerSetPanel = LayerSetPanel;
})();
