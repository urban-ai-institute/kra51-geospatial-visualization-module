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
  // REP_ICON / THEMES / CHANNELS / DESIGN_REPS / ELEV_* moved to
  // js/config/representation.js — they are globals now, loaded before this file.
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

  const LayerSetPanel = {
    _page: {},     // active page key per dataset (built-in key or "saved:<id>")
    _time: {},     // { dsId: bool } — temporal toggle fallback when the engine can't report
    _touched: {},  // { dsId: { field: true } } — appearance fields the user actually changed
    _appear: {},   // { dsId: { scheme } }
    _grp: {},      // { dsId: { layers: [ {id, channel, measure} ] } } — the Single group
    _saved: null,  // { dsId: [ {id,name,page,rep,measure,scheme,layers} ] }
    _uid: 0,

    // Any dataset without an explicit config gets a generated one (its DATASET_REPS +
    // its meta map key), so no dataset can ever fall through to a legacy control path.
    _autoCfg: {},
    _cfg(dsId) {
      if (!dsId) return null;
      if (LS_DATASETS[dsId]) return LS_DATASETS[dsId];
      if (this._autoCfg[dsId]) return this._autoCfg[dsId];
      if (typeof DATASETS_META === "undefined" || !DATASETS_META[dsId]) return null;
      const reps = (typeof DATASET_REPS !== "undefined" && DATASET_REPS[dsId]) || ["choropleth"];
      const mk = (DATASETS_META[dsId].map || {}).key || null;
      return (this._autoCfg[dsId] = { pages: [{ key: "single", label: "Single", icon: "▪", supported: true,
        reps: reps, measures: mk ? "autoKey:" + mk : null, hint: "Default view for this dataset." }] });
    },
    isSemantic(dsId) { return !!this._cfg(dsId); },

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
        elevation: (typeof map !== "undefined" && map && map.elevationScale != null) ? map.elevationScale : 1,
        radius: (typeof map !== "undefined" && map && map.radiusScale != null) ? map.radiusScale : 1,
        colorScale: "quantile", outline: 0 };
      if (!this._grp[dsId]) {   // one group per group-page (glyph pages start with no extra layers)
        const g = {};
        (this._cfg(dsId).pages || []).forEach((p) => {
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
      const cfg = this._cfg(dsId);
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
        const handler = () => {
          let v = inp.type === "checkbox" ? inp.checked : inp.value;
          if (inp.dataset.curve === "elev") v = ELEV_VAL(inp.value);   // slider rides a curve
          // slider drags skip the re-render, so refresh this row's read-out directly
          const out = inp.parentElement && inp.parentElement.querySelector(".ls-aval");
          if (out && inp.type === "range") out.textContent = (+v).toFixed(inp.dataset.lsAp === "glow" || inp.dataset.lsAp === "outline" ? 1 : 2);
          this._setAppear(dsId, inp.dataset.lsAp, v, inp.type === "range");
        };
        if (inp.type === "range") inp.oninput = handler; else inp.onchange = handler;
      });
      host.querySelectorAll("[data-ls-scale]").forEach((b) => b.onclick = () => this._setAppear(dsId, "colorScale", b.dataset.lsScale, false));
      const save = host.querySelector("[data-ls-save]"); if (save) save.onclick = () => this._save(dsId);
      const reset = host.querySelector("[data-ls-reset]"); if (reset) reset.onclick = () => this._reset(dsId);
    },

    // ---- COMPACT (right rail): pick a PRESET (Single / Total / … + saved) + variable ----
    renderCompact(dsId, host) {
      const cfg = this._cfg(dsId);
      const activeKey = this._page[dsId];
      const active = this._pageByKey(dsId, activeKey);
      // One ROW per preset: [structure] [its representative design ▾]. The design list is
      // the page's own `reps`, so each structure only offers what it can actually draw.
      // Design picker: the row carries only the current design's ICON; tapping it
      // expands a list of icon + name INSIDE the row stack. (An absolutely-positioned
      // popover would be clipped — .right-rail is 172px wide with overflow-y:auto.)
      const curRep = (p) => (activeKey === p.key) ? this._repFor(dsId, p) : (p.reps || [])[0];
      const repPicker = (p) => {
        const reps = p.reps || [];
        if (reps.length <= 1) return "";
        const cur = curRep(p);
        return `<button class="ls-prow-rep" data-ls-repmenu="${p.key}" title="${this._repLabel(cur)} — change design">${REP_ICON[cur] || "▦"}</button>`;
      };
      const repMenu = (p) => {
        const reps = p.reps || [];
        if (reps.length <= 1) return "";
        const cur = curRep(p);
        return `<div class="ls-repmenu" data-ls-repmenu-for="${p.key}" hidden>${reps.map((r) =>
          `<button class="ls-repopt${r === cur ? " on" : ""}" data-ls-prep="${p.key}" data-ls-repval="${r}"><i>${REP_ICON[r] || "▦"}</i><span>${this._repLabel(r)}</span></button>`).join("")}</div>`;
      };
      // While a channel plays the map draws that channel's design, not the structure's —
      // so only the channel row is highlighted then.
      const playing = this._isTime(dsId);
      const pageRow = (p) => {
        const dis = p.supported === false;
        return `<div class="ls-prowwrap">
          <div class="ls-prow${!playing && activeKey === p.key ? " on" : ""}${dis ? " ls-dis" : ""}"${dis && p.msg ? ` title="${p.msg}"` : ""}>
            <button class="ls-prow-pick"${dis ? " disabled" : ` data-ls-page="${p.key}"`}><i>${p.icon}</i><span>${p.label}</span></button>
            ${dis ? "" : repPicker(p)}</div>
          ${dis ? "" : repMenu(p)}</div>`;
      };
      const savedRow = (s) => `<div class="ls-prow${!playing && activeKey === "saved:" + s.id ? " on" : ""}">
        <button class="ls-prow-pick" data-ls-page="saved:${s.id}" title="Saved preset"><i>★</i><span>${s.name}</span></button></div>`;
      // Temporal channels are rows too — clicking one starts playing it, clicking any
      // static row above stops. (Replaces the old Static/Animate toggle.)
      const curChan = playing ? this._activeChannel(dsId) : null;
      const chanRow = (c) => `<div class="ls-prow${c.rep === curChan ? " on" : ""}">
        <button class="ls-prow-pick" data-ls-chan="${c.rep}"><i>▶</i><span>${c.label}</span></button></div>`;

      const presetHTML = `<div class="ls-row-l">Preset</div><div class="ls-prows">${
        cfg.pages.map(pageRow).join("")
        + this._savedFor(dsId).map(savedRow).join("")
        + (cfg.temporal ? this._timeChannels(dsId).map(chanRow).join("") : "")}</div>`;

      // Variable / group picker. For a group page, list the active group's layers so you can
      // swap what each one shows without opening the full editor; otherwise a single dropdown.
      let measHTML = "";
      if (active && active.group) {
        const grp = this._grpOf(dsId, active.key);
        const gm = this._measures(this._groupMeasures(dsId));
        if (grp && grp.layers && grp.layers.length && gm.length) {
          measHTML = `<div class="ls-row-l">Variable</div><div class="ls-layers">${grp.layers.map((L) => {
            const ch = CHANNELS.find((c) => c.key === L.channel) || CHANNELS[0];
            return `<div class="ls-layer"><span class="ls-cicon" title="${ch.label}">${ch.icon}</span>
              <select class="ls-select ls-lvar" data-ls-cvar="${L.id}">${gm.map((m) => `<option value="${m.key}"${m.key === L.measure ? " selected" : ""}>${m.label}</option>`).join("")}</select></div>`;
          }).join("")}</div>`;
        }
      } else {
        const measures = this._measures(active && active.measures);
        if (measures.length > 1) measHTML = `<div class="ls-row-l">Variable</div>${this._measureSelect(measures, (typeof map !== "undefined" && map) ? map.colorBy : null)}`;
      }

      // (Static/Animate toggle removed — the channel rows above own play/stop.)
      host.innerHTML = `<div class="ls-inner">${presetHTML}${measHTML}</div>`;
      // every control routes through applyView so the map, this rail and the left
      // editor can never drift apart again
      host.querySelectorAll("[data-ls-page]").forEach((b) => b.onclick = () => this.applyView(dsId, { pageKey: b.dataset.lsPage }));
      host.querySelectorAll("[data-ls-chan]").forEach((b) => b.onclick = () => this.applyView(dsId, { channel: b.dataset.lsChan }));
      // design icon → expand/collapse that row's picker (pure DOM, no re-render)
      host.querySelectorAll("[data-ls-repmenu]").forEach((b) => b.onclick = () => {
        const menu = host.querySelector('[data-ls-repmenu-for="' + b.dataset.lsRepmenu + '"]');
        const willOpen = menu && menu.hidden;
        host.querySelectorAll(".ls-repmenu").forEach((m) => { m.hidden = true; });
        host.querySelectorAll(".ls-prow-rep").forEach((x) => x.classList.remove("open"));
        if (willOpen) { menu.hidden = false; b.classList.add("open"); }
      });
      host.querySelectorAll("[data-ls-repval]").forEach((b) => b.onclick = () =>
        this.applyView(dsId, { pageKey: b.dataset.lsPrep, rep: b.dataset.lsRepval }));
      host.querySelectorAll("[data-ls-cvar]").forEach((s) => s.onchange = () => this._setLayerField(dsId, s.dataset.lsCvar, "measure", s.value));
      const sel = host.querySelector("[data-ls-measure]");
      if (sel) sel.onchange = () => this.applyView(dsId, { measure: sel.value });
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
    // What this dataset can play while animating. First entry is the default.
    _timeChannels(dsId) {
      const cfg = this._cfg(dsId) || {};
      if (cfg.timeChannels && cfg.timeChannels.length) return cfg.timeChannels;
      return cfg.timeRep ? [{ label: "Animate", rep: cfg.timeRep }] : [];
    },
    // Which channel is playing — read back from the engine, falling back to the default.
    _activeChannel(dsId) {
      const chans = this._timeChannels(dsId);
      const rep = (typeof Panels !== "undefined") ? Panels.selectedRep : null;
      const hit = chans.find((c) => c.rep === rep);
      return hit ? hit.rep : (chans[0] && chans[0].rep) || null;
    },
    _setTime(dsId, on, chanRep) {
      this._time[dsId] = on;
      if (on) this._applyTime(dsId, chanRep); else this._applyStatic(dsId);
    },
    // ON → play a time channel. applyRepresentation enters time mode itself and sets
    // timeVar/timeCompare (rt.time for heatfield/compare, or the sales daily sequence),
    // which is what makes the timeline draw one series or both.
    _applyTime(dsId, chanRep) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const chans = this._timeChannels(dsId);
      const rep = (chans.find((c) => c.rep === chanRep) || chans[0] || {}).rep || "heatfield";
      Panels.applyRepresentation(dsId, rep);
      this._applyAppearance(dsId);
      map.render(); this._afterApply();
    },
    // OFF → re-apply whatever preset page is active, then make sure we really are static.
    _applyStatic(dsId) {
      const page = this._pageByKey(dsId, this._page[dsId]);
      if (page && page.group) this._applyActive(dsId);
      else this._applyPage(dsId, (page && page.reps && page.reps[0]) || null);
      // Some pages' default rep is itself temporal — Sales' choropleth plays the daily
      // sales sequence — so pressing Static has to leave time mode explicitly.
      if (typeof exitTimeMode === "function") exitTimeMode();
      if (typeof map !== "undefined" && map && map.render) map.render();
      this.sync();
    },
    // Single = variable-layers composited on data channels (no sector glyph).
    _applySingle(dsId) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const baseRep = (this._cfg(dsId) && this._cfg(dsId).baseRep) || "choropleth";
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
      const t = this._touched[dsId] || {};
      // These have no per-representation default, so they always apply.
      if (typeof map.setColorScheme === "function") map.setColorScheme(a.scheme);
      if (a.outline != null && map.setOutlineWidth) map.setOutlineWidth(+a.outline);
      if (a.colorScale && map.setColorScaleMode) map.setColorScaleMode(a.colorScale);
      // These DO have per-representation defaults (REP_TYPES sliders: a flat map wants
      // elevation 0.12, columns 1.4). applyRepresentation has just set them, so only
      // override where the user actually moved the control — otherwise the tuned value
      // would be replaced by a generic default and e.g. a flat map would render 8x too tall.
      if (t.opacity && a.opacity != null) map.opacity = +a.opacity;
      if (t.glow && a.glow != null) map.glow = +a.glow;
      if (t.elevation && a.elevation != null && map.setElevationScale) map.setElevationScale(+a.elevation);
      if (t.radius && a.radius != null && map.setRadiusScale) map.setRadiusScale(+a.radius);
      this._syncAppearFromMap(dsId);
    },
    // Pull whatever the map ended up with back into the untouched fields, so the sliders
    // show the representation's real values instead of stale defaults.
    _syncAppearFromMap(dsId) {
      const a = this._appear[dsId], t = this._touched[dsId] || {};
      if (!a || typeof map === "undefined" || !map) return;
      if (!t.opacity && map.opacity != null) a.opacity = map.opacity;
      if (!t.glow && map.glow != null) a.glow = map.glow;
      if (!t.elevation && map.elevationScale != null) a.elevation = map.elevationScale;
      if (!t.radius && map.radiusScale != null) a.radius = map.radiusScale;
    },
    _setAppear(dsId, field, val, isSliderLive) {
      const a = this._appear[dsId]; if (!a) return;
      a[field] = field === "label" ? !!val : (field === "colorScale" ? val : +val);
      // mark it as user-set so it now survives a representation change
      (this._touched[dsId] = this._touched[dsId] || {})[field] = true;
      if (typeof map !== "undefined" && map) {
        // use the engine's own setters so the map re-renders the same way the old sliders did
        if (field === "opacity") { if (map.setOpacity) map.setOpacity(+val); else { map.opacity = +val; if (map.render) map.render(); } }
        else if (field === "glow") { if (map.setGlow) map.setGlow(+val); else { map.glow = +val; if (map.render) map.render(); } }
        else if (field === "elevation") { if (map.setElevationScale) map.setElevationScale(+val); }
        else if (field === "radius") { if (map.setRadiusScale) map.setRadiusScale(+val); }
        else if (field === "outline") { if (map.setOutlineWidth) map.setOutlineWidth(+val); }
        else if (field === "colorScale") { if (map.setColorScaleMode) map.setColorScaleMode(val); }
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
      // Elevation's useful values sit near 0.1–0.3 (Seoul is shallow at this scale), so a
      // linear track puts all the usable travel in a sliver at the far left. It rides a
      // curve instead: the slider position is 0..1 and value = max * pos^GAMMA, giving
      // fine control low down and coarse control up top.
      const el = `<input type="range" class="ls-mini" data-ls-ap="elevation" data-curve="elev"
        min="0" max="1" step="0.004" value="${ELEV_POS(a.elevation)}">`;
      const row = (label, input, val) => `<label class="ls-arow"><span>${label}</span>${input}<b class="ls-aval">${val}</b></label>`;
      return `<div class="ls-row-l">Appearance</div><div class="ls-app">
        <div class="ls-arow"><span>Color theme</span><div class="ls-swrow">${themes}</div></div>
        ${row("Elevation", el, (+a.elevation).toFixed(2))}
        ${row("Radius", `<input type="range" class="ls-mini" data-ls-ap="radius" min="0.3" max="3" step="0.05" value="${a.radius}">`, (+a.radius).toFixed(2))}
        ${row("Opacity", `<input type="range" class="ls-mini" data-ls-ap="opacity" min="0.2" max="1" step="0.05" value="${a.opacity}">`, (+a.opacity).toFixed(2))}
        ${row("Glow", `<input type="range" class="ls-mini" data-ls-ap="glow" min="0" max="2" step="0.1" value="${a.glow}">`, (+a.glow).toFixed(1))}
        <div class="ls-arow"><span>Color scale</span><div class="ls-seg ls-scaleseg">${scales}</div></div>
        ${row("Outline", `<input type="range" class="ls-mini" data-ls-ap="outline" min="0" max="3" step="0.5" value="${a.outline}">`, (+a.outline).toFixed(1))}
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
      // Sales: the six theme groups first, then the individual industries (registered by
      // Atlas.availableMapMetrics as kind "industry"), so Single can pick either level.
      if (kind === "salesGroups") {
        const S = (typeof SALES_GROUPS !== "undefined") ? SALES_GROUPS : {};
        const groups = Object.keys(S).map((k) => ({ key: "grp_" + k, label: S[k].title + " (group)" }));
        const inds = (typeof Atlas !== "undefined" && Atlas.availableMapMetrics)
          ? Atlas.availableMapMetrics().filter((m) => m.kind === "industry").map((m) => ({ key: m.key, label: m.label }))
          : [];
        return groups.concat(inds);
      }
      if (kind === "rhsiOnly") { return [{ key: "RHSI_retail", label: "RHSI (heat sensitivity)" }]; }
      if (kind === "salesTotal") { return [{ key: "sales_total", label: "Total sales (₩)" }]; }
      // generated config: a single metric taken from the dataset's meta map key
      if (typeof kind === "string" && kind.indexOf("autoKey:") === 0) {
        const k = kind.slice(8);
        const spec = (typeof Atlas !== "undefined" && Atlas.metricSpec) ? Atlas.metricSpec(k) : null;
        return [{ key: k, label: (spec && spec.label) || k }];
      }
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
    _groupMeasures(dsId) { return (this._cfg(dsId) && this._cfg(dsId).groupMeasures) || "salesGroups"; },
    _validMeasure(key, kind) { return this._measures(kind).some((m) => m.key === key) ? key : null; },
    _builtin(dsId, key) { return this._cfg(dsId).pages.find((p) => p.key === key); },
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
      const pages = (this._cfg(dsId) && this._cfg(dsId).pages) || [];
      return pages.find((p) => p.supported !== false) || pages[0] || null;
    },
    _inferPage(dsId) {
      const sv = (typeof map !== "undefined" && map) ? map.sectorView : null;
      const glyphPage = (this._cfg(dsId).pages || []).find((p) => p.glyph);
      if (glyphPage && sv && (glyphPage.reps || []).includes(sv)) return glyphPage.key;
      // sectorView is only set for glyph reps, and sync() can run BEFORE the dataset's
      // representation is applied — so also match the active rep against each page.
      const owner = this._pageOwningRep(dsId, (typeof Panels !== "undefined") ? Panels.selectedRep : null);
      if (owner) return owner.key;
      const first = this._firstPage(dsId);
      return first ? first.key : "single";
    },
    // First page whose design list contains `repId` (null when none / no rep).
    _pageOwningRep(dsId, repId) {
      if (!repId) return null;
      const pages = (this._cfg(dsId) && this._cfg(dsId).pages) || [];
      return pages.find((p) => (p.reps || []).includes(repId)) || null;
    },
    // Keep the highlighted preset in step with what the map actually draws.
    // Called from Panels.applyRepresentation — state + re-render only, never applies a
    // representation, so there is no loop back into applyRepresentation.
    syncPageToRep(dsId, repId) {
      if (!dsId || !repId || !this._cfg(dsId)) return;
      // Ignore representations WE are applying. _applySingle/_applyAcross call
      // applyRepresentation with the group's `baseRep` (choropleth) mid-flight; without
      // this guard that bounced back here, moved _page to the first page owning
      // choropleth ("single"), and _applySingle then read _grp[ds].single — undefined —
      // and threw. Compare/Across were dead as a result.
      if (this._applying) return;
      const current = this._pageByKey(dsId, this._page[dsId]);
      // Group pages (Compare / Across) have no `reps` of their own — they composite
      // layers over a baseRep — so a matching rep says nothing about which page is active.
      if (current && current.group) return;
      // the user's page still owns this design → leave their choice alone (Single and
      // Total both offer DESIGN_REPS, so an applied `choropleth` must not flip pages)
      if (current && (current.reps || []).includes(repId)) return;
      const owner = this._pageOwningRep(dsId, repId);
      if (!owner || owner.key === this._page[dsId]) return;
      this._page[dsId] = owner.key;
      this.sync();
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
      Panels.applyRepresentation(dsId, rep || (page.reps && page.reps[0]) || "choropleth");
      // must run AFTER applyRepresentation: it pushes the representation's tuned sliders,
      // and _applyAppearance both re-applies user overrides and reads the rest back.
      this._applyAppearance(dsId);
      const list = this._measures(page.measures);
      if (list.length) {
        const key = measure || this._validMeasure(map.colorBy, page.measures) || list[0].key;
        // Height must follow the chosen variable too. applyRepresentation() above already
        // unified BOTH channels onto the dataset's default metric (RHSI), so colouring
        // alone left every bar — and the label ranking, which sorts by height — stuck on
        // RHSI no matter which variable was picked.
        map.unifyLayerColors(key);
        map.unifyLayerHeights(key);
      }
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    // ---- single entry point for "what the map is showing" ----------------------------
    // structure(page) + representation + variable are ONE decision. They used to be set
    // from several places that didn't know about each other, which is where the
    // preset-vs-map mismatch (F7) and the height-stuck-on-RHSI bug (F8) came from.
    // Every row control below routes through here.
    applyView(dsId, opts) {
      const o = opts || {};
      if (typeof map === "undefined" || !map || typeof Panels === "undefined") return;

      if (o.channel) {                        // temporal channel row → play it
        if (o.pageKey) this._page[dsId] = o.pageKey;
        this._setTime(dsId, true, o.channel);
        return;
      }
      // Variable-only change keeps the light path (no representation re-apply, which
      // would reset the tuned sliders via _applyAppearance).
      if (!o.pageKey && !o.rep && o.measure) { this._applyMeasure(dsId, o.measure); return; }
      // Changing structure: reuse _selectPage — it already handles saved presets,
      // group/glyph pages and leaving time mode. Do not reimplement that here.
      if (o.pageKey && o.pageKey !== this._page[dsId]) {
        this._selectPage(dsId, o.pageKey);
        if (!o.rep && !o.measure) return;     // plain row click — done
      }
      const page = this._pageByKey(dsId, this._page[dsId]);
      if (!page || page.supported === false) { this.sync(); return; }
      this._time[dsId] = false;
      if (page.group && !o.rep) { this._applyActive(dsId); return; }
      this._applyPage(dsId, o.rep || this._repFor(dsId, page), o.measure);
    },
    // The representation a page is currently showing: the applied one when it belongs to
    // this page, otherwise the page's first (its "representative") design.
    _repFor(dsId, page) {
      const cur = (typeof Panels !== "undefined") ? Panels.selectedRep : null;
      if (cur && (page.reps || []).includes(cur)) return cur;
      return (page.reps && page.reps[0]) || null;
    },
    _repLabel(rep) {
      return (typeof REP_TYPES !== "undefined" && REP_TYPES[rep] && REP_TYPES[rep].label) || rep;
    },
    _applyMeasure(dsId, key) {
      if (typeof map === "undefined" || !map || !key) return;
      if (typeof exitTimeMode === "function") exitTimeMode();
      map.unifyLayerColors(key);
      map.unifyLayerHeights(key);   // keep height on the same variable as the colour
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
      this._appear[dsId] = { scheme: "default", opacity: 0.85, glow: 1, elevation: 1, radius: 1, colorScale: "quantile", outline: 0 };
      this._touched[dsId] = {};   // back to the representation's tuned values
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
