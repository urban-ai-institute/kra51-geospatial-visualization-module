// Seoul Data Atlas — night-GIS multi-layer 3D map (deck.gl + MapLibre CARTO dark).
// Structured per seoul_night_layer_design.md's two-group model:
//   Static Geo Layers (physical night city): boundary (G9/G10), buildings (G4), roads (G6/G7).
//   Temporal Data Layers (selected metric):  heatmap (T0), pointCore (T1),
//                                            pointHalo (T2), influence (T3).
//   More/advanced (off):                     choropleth, columns, hexbin,
//                                            dotField (T6), labels.
// An invisible pick layer owns interaction so the glow layers stay non-pickable.
// Real night palette (no cyan): warm-white→amber→orange→red "heat glow" ramp;
// Heatmap keeps its own colorRange by request. Faux-bloom via additive multi-pass.

// Zoomed further out than a typical city view so the whole layer stack —
// including tall Skyline columns — is visible from a distance by default.
const SEOUL_CENTER = { longitude: 126.991, latitude: 37.545, zoom: 10.5, pitch: 45, bearing: -14 };
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Additive-blend parameters (luma.gl v9 / deck.gl v9) for bloom-like glow.
const ADDITIVE = {
  blend: true,
  blendColorSrcFactor: "src-alpha", blendColorDstFactor: "one", blendColorOperation: "add",
  blendAlphaSrcFactor: "src-alpha", blendAlphaDstFactor: "one", blendAlphaOperation: "add",
  depthTest: false,
};
// Same additive glow, but depth-tested against deck's own buffer. The extruded
// choropleth/columns write depth, so a label stem drawn with this is HIDDEN where it
// passes through a bar and only the part above the bar's top shows — the stem reads as
// rising out of its own region instead of a line pasted over the whole scene.
const ADDITIVE_DEPTH = Object.assign({}, ADDITIVE, { depthTest: true });

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mixStops(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t < 0.5 ? 0 : 1, lt = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = stops[seg], b = stops[seg + 1];
  return [lerp(a[0], b[0], lt), lerp(a[1], b[1], lt), lerp(a[2], b[2], lt)];
}
// Diverging RHSI ramp — one colour language shared with the Insights charts (ED):
// blue (low / most heat-sensitive) -> amber (neutral) -> red (high / most resilient),
// read like a temperature scale (low value = cool/blue, high value = warm/red).
const RAMP_DIVERGING = [[125, 167, 255], [255, 184, 107], [228, 82, 78]];
// dim/near-invisible (low magnitude) -> amber -> hot orange-red (high magnitude)
const RAMP_SEQUENTIAL = [[18, 20, 24], [255, 200, 87], [255, 90, 40]];
// Optional colour THEMES (Layer-Set "color theme"): each supplies a sequential
// ramp (dim → hue) and a diverging ramp (neg ↔ pos). `setColorScheme` selects one.
const COLOR_SCHEMES = {
  default: { seq: RAMP_SEQUENTIAL, div: RAMP_DIVERGING },
  blue: { seq: [[14, 18, 28], [70, 110, 180], [125, 180, 255]], div: [[125, 167, 255], [70, 74, 92], [255, 150, 90]] },
  teal: { seq: [[12, 22, 24], [40, 150, 140], [80, 230, 200]], div: [[80, 200, 190], [70, 74, 84], [255, 150, 90]] },
  viridis: { seq: [[40, 30, 70], [45, 160, 150], [240, 226, 92]], div: [[92, 74, 160], [80, 84, 96], [240, 226, 92]] },
  magenta: { seq: [[18, 14, 24], [180, 60, 150], [255, 110, 200]], div: [[125, 167, 255], [80, 74, 92], [228, 82, 150]] },
};
// Time-flow temperature heatmap: a perceptual weather scale and a display domain
// focused on the temperatures people need to distinguish. Using the raw annual
// extremes (about -10–37°C) compressed most days into the blue half of the ramp.
// The tails still clamp cleanly to cold/hot.
const TEMP_HEAT_RANGE = [[35,58,145],[65,126,235],[57,220,232],[242,246,255],[255,166,82],[255,68,62]];
const TEMP_DISPLAY_DOMAIN = [5, 31];
// Layers that encode a color metric / a height metric — used to build one legend
// per distinct variable actually in play (mirrors VAR_LAYERS in js/app.js).
const DATA_COLOR_LAYERS = ["pointCore", "pointHalo", "influence", "heatmap", "choropleth", "columns", "hexbin", "dotField"];
const HEIGHT_LAYERS = ["choropleth", "columns", "hexbin"];

// Layer registry mirrors the night-GIS design doc's two-group model:
//   Static Geo Layers (the physical night city)  — boundary (G9/G10), buildings (G4), roads (G6/G7)
//   Temporal Data Layers (the selected metric)    — heatmap (T0), pointCore (T1),
//                                                    pointHalo (T2), influence (T3)
//   More / advanced (off by default)              — choropleth, columns, hexbin,
//                                                    dotField (T6), labels
// Default scene per doc §18.1: roads + weak boundary + point core (+ halo).
const DEFAULT_LAYERS = {
  boundary: true, roads: true, buildings: false,
  heatmap: false, pointCore: true, pointHalo: true, influence: false,
  choropleth: false, columns: false, hexbin: false, dotField: false, labels: false,
  nature: false, transit: false, amenity: false, // lazy OSM context layers (off by default)
};
const ALL_OFF = Object.fromEntries(Object.keys(DEFAULT_LAYERS).map((k) => [k, false]));
const PRESETS = {
  "Night City": { ...ALL_OFF, roads: true, boundary: true, buildings: true, pointCore: true, pointHalo: true },
  "Heat Field": { ...ALL_OFF, roads: true, boundary: true, heatmap: true, influence: true },
  "Data Points": { ...ALL_OFF, roads: true, boundary: true, pointCore: true, pointHalo: true, influence: true, labels: true },
};
// Static city fabric — fixed warm colors, not metric-driven. Arterial always
// shown; mid tier reveals once drilled past the citywide overview (zoom-gated
// disclosure, matching the design doc). No minor/residential tier: a live
// Overpass count probe showed that query times out at Seoul scale.
const ROAD_STYLE = {
  arterial: { core: [255, 244, 224, 165], halo: [255, 183, 77, 60], coreW: 1.2, haloW: 3.2 },
  mid:      { core: [255, 214, 140, 110], halo: [255, 150, 60, 40], coreW: 0.8, haloW: 2 },
};
// OSM "Amenities" category colors (index = category code from fetch_osm_amenity.py):
// 0 education · 1 health · 2 civic · 3 cooling/shelter · 4 activity · 5 parking
const AMENITY_COLORS = [
  [123, 167, 255], [228, 92, 145], [255, 184, 107], [63, 230, 165], [57, 230, 230], [150, 160, 175],
];
// G4 building base extrusion — dark navy city fabric (not metric-driven).
const BUILDING_STYLE = {
  fill: [10, 17, 24, 185],       // #0A1118
  line: [20, 37, 54, 70],        // faint edge tint #142536
  minZoom: 11.25,                // hide at city overview — 260k polys is too heavy
};

class AtlasMap3D {
  constructor(containerId) {
    this.containerId = containerId;
    this.scope = { level: "city", guCode: null, dongCode: null };
    this.layers = { ...DEFAULT_LAYERS };
    this.colorBy = "RHSI_retail";
    this.colorScheme = null;   // Layer-Set colour theme override (null = built-in ramps)
    this.colorScaleMode = "quantile"; // quantile | linear | quantize
    this.outlineWidth = 0;     // choropleth outline in px (0 = no stroke)
    this.heightBy = "RHSI_retail";
    // Multivariate "Sector view" over the 6 sales themes: null | rings | radial | columns | dominant.
    this.sectorView = null;
    // null means all SHAP features; otherwise only the selected additive
    // contributions participate in the signed stacks.
    this.shapFeatures = null;
    // Spatial grain of the DATA layers, decoupled from the camera scope: null =
    // auto (gu at city, dong when drilled), or an explicit 'seoul'|'gu'|'dong'.
    this.grain = null;
    // Per-layer metric overrides. Empty = follow the corresponding global value.
    this.layerVar = {};
    this.layerHeightVar = {};
    // Per-layer radius multiplier (on top of the common Radius slider). 1 = default.
    this.layerRadius = {};
    this.elevationScale = 1;
    this.radiusScale = 1;
    this.opacity = 0.85;
    this.glow = 1;
    this.autoRotate = false;
    this.selectedDongCode = null;
    // How a selected dong is highlighted: 'boundary' (glowing area/outline, default)
    // or 'pillar' (the vertical shiny beam).
    this.selectionStyle = "boundary";
    // Time mode: draw the sales rings alongside the temperature field (Heat × sales)
    // or the heat field alone. Representations set this. Default OFF so a single
    // dataset never leaks "both" — only the Heat × sales rep turns it on.
    this.timeCompare = false;
    // Time-flow: when timeMode is on the map colors by daily temperature (per gu,
    // year-normalized) instead of the static metric; `playing` gates the pulse.
    this.timeMode = false;
    this.playing = false;
    this.timeDayIndex = 0;
    this.timeVar = "temp"; // 'temp' | 'sales' — the active playable variable
    this.onRegionClick = null;
    this.onRegionHover = null;
    this._deckReady = false;
    this._pulse = 0;
    this._pulseTime = 0;
    this._featCache = {};
    this._pointsCache = null;
    this._staticCache = null;
  }

  init() {
    // Clamp the camera to Seoul (dataset is Seoul-only). NOTE: do not add an
    // explicit minZoom alongside maxBounds — on a narrow container the two
    // conflict and MapLibre never fires 'load'. Padding gives fitting room.
    const [minx, miny, maxx, maxy] = Atlas.meta.bbox;
    const padLng = (maxx - minx) * 3.0, padLat = (maxy - miny) * 5.2;

    this.map = new maplibregl.Map({
      container: this.containerId, style: CARTO_DARK,
      center: [SEOUL_CENTER.longitude, SEOUL_CENTER.latitude],
      zoom: SEOUL_CENTER.zoom, pitch: SEOUL_CENTER.pitch, bearing: SEOUL_CENTER.bearing,
      antialias: true, attributionControl: false,
      maxBounds: [[minx - padLng, miny - padLat], [maxx + padLng, maxy + padLat]],
    });
    // Three independently-toggleable lights. ambient = flat fill, sun = directional
    // shading, point = the blue specular highlight (the top-view glare — turn it off
    // to kill the blowout while keeping ambient+sun for a lit, readable scene).
    const ambient = new deck.AmbientLight({ color: [200, 214, 255], intensity: 1.1 });
    const sun = new deck.DirectionalLight({ color: [255, 255, 255], intensity: 1.4, direction: [-1, -3, -1] });
    const point = new deck.PointLight({ color: [125, 167, 255], intensity: 1.5, position: [126.99, 37.4, 90000] });
    this._lights = { ambient, sun, point };
    this.lightOn = { ambient: true, sun: true, point: true };
    this.lighting = new deck.LightingEffect(this._lights);

    // Overlaid (NOT interleaved): deck renders in its own canvas over the
    // basemap with its own depth buffer. Interleaved mode shares MapLibre's
    // depth buffer + tile pipeline, which tears the HeatmapLayer and the large
    // additive halos ("ripped everywhere"). Overlaid composites them cleanly;
    // extruded buildings/columns still self-occlude via deck's own depth buffer.
    this.overlay = new deck.MapboxOverlay({ interleaved: false, effects: [this.lighting], layers: [] });
    this.map.addControl(this.overlay);
    // Double-click drills straight to the specific dong under the cursor and
    // closes up on it (replaces MapLibre's default double-click zoom).
    this.map.doubleClickZoom.disable();
    this.map.on("dblclick", (e) => {
      const d = this._dongAt(e.lngLat.lng, e.lngLat.lat);
      if (d && this.onRegionClick) this.onRegionClick({ level: "dong", dong_code: d.dong_code, dong_name: d.dong_name, gu_code: d.gu_code });
    });
    this.map.on("load", () => {
      // Hide the basemap's baked-in place/road text labels — they clutter the
      // data map ("labels stuck in the map"). Our own layers own all labelling.
      try {
        (this.map.getStyle().layers || []).forEach((l) => {
          if (l.type === "symbol") this.map.setLayoutProperty(l.id, "visibility", "none");
        });
      } catch (e) { /* style not fully ready — non-fatal */ }
      this._deckReady = true; this.render(); this._animate();
    });
    return this;
  }

  // ---------- shared helpers ----------
  // Dongs the DATA layers draw. Drilled to a specific dong → just that one dong
  // (the map closes up on it and shows only its data); gu → the gu's dongs.
  _scopedDongs() {
    if (this.scope.level === "city") return Atlas.dongGeometry;
    if (this.scope.level === "dong") return Atlas.dongGeometry.filter((d) => d.dong_code === this.scope.dongCode);
    return Atlas.dongGeometry.filter((d) => d.gu_code === this.scope.guCode);
  }
  _spec(which) { return Atlas.metricSpec(which === "height" ? this.heightBy : this.colorBy); }
  _rampFor(spec) {
    const sch = this.colorScheme && COLOR_SCHEMES[this.colorScheme];
    if (sch) return spec && spec.signed ? sch.div : sch.seq;
    return spec && spec.signed ? RAMP_DIVERGING : RAMP_SEQUENTIAL;
  }
  // Layer-Set "color theme" — null/"default" = the built-in ramps.
  setColorScheme(name) { this.colorScheme = (name && name !== "default" && COLOR_SCHEMES[name]) ? name : null; this.render(); }
  setColorScaleMode(m) { this.colorScaleMode = ["quantile", "linear", "quantize"].includes(m) ? m : "quantile"; this.render(); }
  setOutlineWidth(v) { this.outlineWidth = Math.max(0, +v || 0); this.render(); }
  // In time mode the data ramp is always the warm sequential (dim→amber→red) so
  // temperature reads as literal heat regardless of the selected static metric.
  _activeRamp(key) { return this.timeMode ? RAMP_SEQUENTIAL : this._rampFor(Atlas.metricSpec(key || this.colorBy)); }
  _sig() { return [this.scope.level, this.scope.guCode, this.scope.dongCode || "", this.grain || "", this.colorBy, this.heightBy, this.colorScheme || "", this.colorScaleMode, this.outlineWidth, JSON.stringify(this.layerVar), JSON.stringify(this.layerHeightVar), JSON.stringify(this.layerRadius), this.sectorView || "", this.shapFeatures ? this.shapFeatures.join(",") : "shap:all", this.timeMode ? "T" + this.timeVar + this.timeDayIndex : "S"].join("|"); }

  // ---------- spatial grain (data-layer granularity, independent of camera) ----------
  _keyFor(layer, channel = "color") {
    return channel === "height"
      ? (this.layerHeightVar[layer] || this.heightBy)
      : (this.layerVar[layer] || this.colorBy);
  }
  // Effective radius scale for a layer = common Radius slider × the layer's own.
  _rmul(layer) { return this.radiusScale * (this.layerRadius[layer] != null ? this.layerRadius[layer] : 1); }
  _grain() { return this.grain || (this.scope.level === "city" ? "gu" : "dong"); }
  // Regions the DATA layers render at the current grain, respecting a drilled gu.
  _grainRegions() {
    const g = this._grain();
    if (g === "seoul") {
      const [minx, miny, maxx, maxy] = Atlas.meta.bbox;
      return [{ kind: "seoul", code: "SEOUL", name: "Seoul", position: [(minx + maxx) / 2, (miny + maxy) / 2] }];
    }
    if (g === "gu") {
      const gus = this.scope.level === "city" ? Atlas.guGeometry : Atlas.guGeometry.filter((x) => x.gu_code === this.scope.guCode);
      return gus.map((x) => ({ kind: "gu", code: x.gu_code, name: x.gu_name, position: x.centroid, geometry: x.geometry }));
    }
    // At a drilled gu OR dong, render the whole containing gu's dongs (dong-level
    // context). Collapsing to the single target dong leaves density layers (heatmap)
    // as one blob and drops the neighbourhood around it — the selected dong is still
    // highlighted separately by the selection layer.
    const dongs = this.scope.level === "city" ? Atlas.dongGeometry
      : Atlas.dongGeometry.filter((d) => d.gu_code === this.scope.guCode);
    return dongs.map((d) => ({ kind: "dong", code: d.dong_code, name: d.dong_name, gu_code: d.gu_code, position: d.centroid, geometry: d.geometry }));
  }
  _regionValue(region, spec) {
    if (region.kind === "seoul") return Atlas.cityAggregateValue(spec);
    if (region.kind === "gu") return Atlas.guAggregateValue(region.code, spec);
    const m = Atlas.dongByCode.get(region.code);
    return m ? Atlas.metricValue(m, spec) : null;
  }

  _heightDomainMax(spec) {
    const vals = Atlas.mapFeatureValues(this.scope, spec);
    if (!vals.length) return 1;
    return Math.max(...vals.map((v) => Math.abs(v))) || 1;
  }

  // Sign-aware quantile color → RGBA (glow lifts toward white). Keyed to a
  // metric (per-layer variable) and to the current grain's value set.
  _colorAccessor(alphaMul = 1) { return this._colorAccessorForKey(this.colorBy, alphaMul); }
  _colorAccessorForKey(key, alphaMul = 1) {
    const spec = Atlas.metricSpec(key);
    const scale = Atlas.colorScaleFromValues(Atlas.valuesForGrain(this._grain(), this.scope, spec), spec, this.colorScaleMode);
    const ramp = this._rampFor(spec);
    const a = Math.round(this.opacity * 255 * alphaMul);
    const gl = Math.max(0, Math.min(1, (this.glow - 1) * 0.35));
    return (metricVal) => {
      const t = scale(metricVal);
      if (t == null) return [50, 55, 68, a];
      const [r, g, b] = mixStops(ramp, t);
      return [lerp(r, 255, gl), lerp(g, 255, gl), lerp(b, 255, gl), a];
    };
  }

  // Grain-aware point rows (seoul=1 / gu=25 / dong=422) for heatmap/columns.
  _grainPoints(colorKey, heightKey) {
    const spec = Atlas.metricSpec(colorKey || this.colorBy);
    const hspec = Atlas.metricSpec(heightKey || this.heightBy);
    return this._grainRegions().map((r) => ({
      position: r.position, kind: r.kind, code: r.code, name: r.name,
      gu_code: r.kind === "gu" ? r.code : r.gu_code,
      gu_name: r.kind === "gu" ? r.name : undefined,
      dong_code: r.kind === "dong" ? r.code : undefined,
      dong_name: r.kind === "dong" ? r.name : undefined,
      colorVal: this._regionValue(r, spec), heightVal: this._regionValue(r, hspec),
    }));
  }

  // Grain-aware polygon features for choropleth. Seoul grain has no single
  // polygon, so every gu is filled with the citywide aggregate (a flat view).
  _grainFeatures(colorKey, heightKey) {
    const spec = Atlas.metricSpec(colorKey || this.colorBy);
    const hspec = Atlas.metricSpec(heightKey || this.heightBy);
    if (this._grain() === "seoul") {
      const cv = Atlas.cityAggregateValue(spec), hv = Atlas.cityAggregateValue(hspec);
      return Atlas.guGeometry.map((x) => ({ type: "Feature", geometry: x.geometry,
        properties: { gu_code: x.gu_code, gu_name: x.gu_name, colorVal: cv, heightVal: hv } }));
    }
    return this._grainRegions().map((r) => ({ type: "Feature", geometry: r.geometry,
      properties: r.kind === "gu"
        ? { gu_code: r.code, gu_name: r.name, colorVal: this._regionValue(r, spec), heightVal: this._regionValue(r, hspec) }
        : { dong_code: r.code, dong_name: r.name, gu_code: r.gu_code, colorVal: this._regionValue(r, spec), heightVal: this._regionValue(r, hspec) } }));
  }

  // Day-value lookup for the active time variable, per region kind. Shared so the
  // drawn polygons and the labels can never disagree about a region's value.
  _timeValueFn() {
    const kind = this.timeVar === "sales" ? "sales" : "temp";
    const guVals = Atlas.dayValueByGu(this.timeDayIndex, kind);
    const dongVals = kind === "sales" && typeof Atlas.groupSalesByDong === "function"
      ? Atlas.groupSalesByDong(this.timeDayIndex)
      : {};
    return (r) => {
      if (r.kind === "gu") return guVals[r.code];
      if (r.kind === "dong") {
        if (kind === "sales") return (dongVals[r.code] || []).reduce((sum, v) => sum + (v || 0), 0);
        return guVals[r.gu_code];
      }
      const vals = Object.values(guVals).filter((v) => Number.isFinite(v));
      if (!vals.length) return null;
      return kind === "sales"
        ? vals.reduce((sum, v) => sum + v, 0)
        : vals.reduce((sum, v) => sum + v, 0) / vals.length;
    };
  }
  // Time-mode rows AT THE DRAWN GRAIN (dong when the map draws dongs). _regionData's
  // time branch stays gu-only on purpose — the sales rings rely on that — so labels
  // use this instead, otherwise they showed 25 gu names over 422 dong bars.
  _timeRegionRows() {
    const [lo, hi] = Atlas.timeVarDomain(this.timeVar);
    const span = (hi - lo) || 1;
    const valueFor = this._timeValueFn();
    return this._grainRegions().map((r) => {
      const v = valueFor(r);
      const t = (v == null || !Number.isFinite(v)) ? null : Math.max(0, Math.min(1, (v - lo) / span));
      return Object.assign({}, r, { value: v, colorT: t, magT: t == null ? 0 : t });
    });
  }

  _timeChoroplethFeatures() {
    const valueFor = this._timeValueFn();
    if (this._grain() === "seoul") {
      const cv = valueFor({ kind: "seoul" });
      return Atlas.guGeometry.map((x) => ({ type: "Feature", geometry: x.geometry,
        properties: { gu_code: x.gu_code, gu_name: x.gu_name, colorVal: cv, heightVal: 0 } }));
    }
    return this._grainRegions().map((r) => ({ type: "Feature", geometry: r.geometry,
      properties: r.kind === "gu"
        ? { gu_code: r.code, gu_name: r.name, colorVal: valueFor(r), heightVal: 0 }
        : { dong_code: r.code, dong_name: r.name, gu_code: r.gu_code, colorVal: valueFor(r), heightVal: 0 } }));
  }

  _dongPoints(colorKey, heightKey) {
    const key = colorKey || this.colorBy;
    const hkey = heightKey || this.heightBy;
    const cacheKey = this._sig() + "|" + key + "|" + hkey;
    if (this._pointsCache && this._pointsCache.sig === cacheKey) return this._pointsCache.data;
    const spec = Atlas.metricSpec(key), hspec = Atlas.metricSpec(hkey);
    const data = this._scopedDongs().map((d) => {
      const m = Atlas.dongByCode.get(d.dong_code);
      return {
        dong_code: d.dong_code, dong_name: d.dong_name, gu_code: d.gu_code, position: d.centroid,
        colorVal: m ? Atlas.metricValue(m, spec) : null,
        heightVal: m ? Atlas.metricValue(m, hspec) : null,
      };
    });
    this._pointsCache = { sig: cacheKey, data };
    return data;
  }

  _geoFeatures() {
    if (this._featCache.sig === this._sig()) return this._featCache.data;
    const spec = this._spec("color"), hspec = this._spec("height");
    let data;
    if (this.scope.level === "city") {
      data = Atlas.guGeometry.map((g) => ({
        type: "Feature", geometry: g.geometry,
        properties: { gu_code: g.gu_code, gu_name: g.gu_name,
          colorVal: Atlas.guAggregateValue(g.gu_code, spec), heightVal: Atlas.guAggregateValue(g.gu_code, hspec) },
      }));
    } else {
      // Pick/hover stays gu-wide (even when drilled into a single dong) so the
      // user can still click a neighbouring dong to move there.
      data = Atlas.dongGeometry.filter((d) => d.gu_code === this.scope.guCode).map((d) => {
        const m = Atlas.dongByCode.get(d.dong_code);
        return { type: "Feature", geometry: d.geometry,
          properties: { dong_code: d.dong_code, dong_name: d.dong_name, gu_code: d.gu_code,
            colorVal: m ? Atlas.metricValue(m, spec) : null, heightVal: m ? Atlas.metricValue(m, hspec) : null } };
      });
    }
    this._featCache = { sig: this._sig(), data };
    return data;
  }

  // Per-region metric + color-t + magnitude-t (for point core/halo, rings, labels).
  // In time mode this becomes gu-level daily temperature (temperature is only
  // available per gu), year-normalized so summer glows hot and winter cools.
  _regionData(colorKey, heightKey) {
    if (this.timeMode) {
      const [lo, hi] = Atlas.timeVarDomain(this.timeVar);
      const span = (hi - lo) || 1;
      const vals = Atlas.dayValueByGu(this.timeDayIndex, this.timeVar);
      return Atlas.guGeometry.map((g) => {
        const v = vals[g.gu_code];
        const t = v == null ? null : Math.max(0, Math.min(1, (v - lo) / span));
        return { position: g.centroid, code: g.gu_code, name: g.gu_name, kind: "gu", value: v, colorT: t, magT: t == null ? 0 : t };
      });
    }
    const spec = Atlas.metricSpec(colorKey || this.colorBy);
    const hspec = Atlas.metricSpec(heightKey || this.heightBy);
    const colorVals = Atlas.valuesForGrain(this._grain(), this.scope, spec);
    const heightVals = Atlas.valuesForGrain(this._grain(), this.scope, hspec);
    const colorScale = Atlas.colorScaleFromValues(colorVals, spec, this.colorScaleMode);
    const magScale = Atlas.magnitudeScaleFromValues(heightVals, hspec);
    return this._grainRegions().map((r) => {
      const value = this._regionValue(r, spec);
      const heightValue = this._regionValue(r, hspec);
      return { ...r, value, heightValue, colorT: colorScale(value), magT: magScale(heightValue) };
    });
  }

  // ---------- extruded / area layers ----------
  _choroplethLayer() {
    const key = this._keyFor("choropleth");
    const heightKey = this._keyFor("choropleth", "height");
    const color = this._colorAccessorForKey(key);
    const hMax = this._heightDomainMax(Atlas.metricSpec(heightKey));
    const isCity = this._grain() !== "dong";
    return new deck.GeoJsonLayer({
      id: "choropleth", data: { type: "FeatureCollection", features: this._grainFeatures(key, heightKey) },
      pickable: true, stroked: this.outlineWidth > 0, filled: true, extruded: true,
      lineWidthUnits: "pixels", getLineWidth: this.outlineWidth,
      lineWidthMinPixels: this.outlineWidth > 0 ? Math.max(0.3, this.outlineWidth) : 0,
      getLineColor: [10, 14, 24, 170],
      material: { ambient: 0.55, diffuse: 0.7, shininess: 60, specularColor: [140, 170, 255] },
      getFillColor: (f) => (f.properties.dong_code && f.properties.dong_code === this.selectedDongCode ? [238, 244, 255, 255] : color(f.properties.colorVal)),
      getElevation: (f) => (Math.abs(f.properties.heightVal || 0) / hMax) * (isCity ? 90000 : 55000) * this.elevationScale,
      onClick: (info) => this._click(info), onHover: (info) => this._hover(info),
      updateTriggers: {
        getFillColor: [this.colorBy, this.opacity, this.glow, this.selectedDongCode, this._sig()],
        getElevation: [this.heightBy, this.elevationScale, this._sig()],
      },
    });
  }

  _timeChoroplethLayer() {
    const data = this._timeChoroplethFeatures();
    const vals = data.map((f) => f.properties.colorVal).filter((v) => Number.isFinite(v));
    const [lo, hi] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
    const span = (hi - lo) || 1;
    const a = Math.round(this.opacity * 255);
    const color = (v) => {
      if (!Number.isFinite(v)) return [50, 55, 68, a];
      const t = Math.max(0, Math.min(1, (v - lo) / span));
      const [r, g, b] = mixStops(RAMP_SEQUENTIAL, t);
      return [r, g, b, a];
    };
    // Extrude by the day's value against a FIXED whole-period domain, so the
    // choropleth rises/falls with the animation (elevation slider works in time
    // mode too). A per-frame domain would make the tallest bar full-height every
    // day and hide the temporal change that is the whole point of playback.
    const [glo, ghi] = Atlas.timeVarDomain(this.timeVar);
    const gspan = (ghi - glo) || 1;
    const BASE = this._grain() === "dong" ? 55000 : 90000;
    const elev = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, (v - glo) / gspan)) * BASE * this.elevationScale : 0);
    return new deck.GeoJsonLayer({
      id: "time-choropleth", data: { type: "FeatureCollection", features: data },
      pickable: true, stroked: false, filled: true, extruded: true,
      material: { ambient: 0.55, diffuse: 0.7, shininess: 60, specularColor: [140, 170, 255] },
      getFillColor: (f) => color(f.properties.colorVal),
      getElevation: (f) => elev(f.properties.colorVal),
      onClick: (info) => this._click(info), onHover: (info) => this._hover(info),
      updateTriggers: {
        getFillColor: [this.timeVar, this.timeDayIndex, this.opacity, this._sig()],
        getElevation: [this.timeVar, this.timeDayIndex, this.elevationScale, this._sig()],
      },
    });
  }

  _columnsLayer() {
    const key = this._keyFor("columns");
    const heightKey = this._keyFor("columns", "height");
    const color = this._colorAccessorForKey(key);
    const hMax = this._heightDomainMax(Atlas.metricSpec(heightKey));
    return new deck.ColumnLayer({
      id: "columns", data: this._grainPoints(key, heightKey), diskResolution: 12, radius: 190 * this._rmul("columns"),
      extruded: true, pickable: true, radiusUnits: "meters",
      material: { ambient: 0.7, diffuse: 0.5, shininess: 120, specularColor: [180, 205, 255] },
      getPosition: (d) => d.position,
      getFillColor: (d) => (d.dong_code === this.selectedDongCode ? [238, 244, 255, 255] : color(d.colorVal)),
      getElevation: (d) => (Math.abs(d.heightVal || 0) / hMax) * 90000 * this.elevationScale,
      onClick: (info) => this._click(info), onHover: (info) => this._hover(info),
      updateTriggers: {
        getFillColor: [this.colorBy, this.opacity, this.glow, this.selectedDongCode, this._sig()],
        getElevation: [this.heightBy, this.elevationScale, this._sig()],
      },
    });
  }

  _hexbinLayer() {
    const key = this._keyFor("hexbin");
    const heightKey = this._keyFor("hexbin", "height");
    const ramp = this._rampFor(Atlas.metricSpec(key));
    const colorRange = [0.05, 0.25, 0.45, 0.65, 0.85, 1.0].map((t) => mixStops(ramp, t));
    return new deck.HexagonLayer({
      id: "hexbin", data: this._dongPoints(key, heightKey), pickable: true, extruded: true,
      radius: 700 * this.radiusScale, elevationScale: 26 * this.elevationScale,
      coverage: 0.92, colorRange, colorAggregation: "MEAN", elevationAggregation: "MEAN", opacity: this.opacity,
      material: { ambient: 0.6, diffuse: 0.6, shininess: 60, specularColor: [150, 180, 255] },
      getPosition: (d) => d.position, getColorWeight: (d) => d.colorVal || 0, getElevationWeight: (d) => Math.abs(d.heightVal || 0),
      onHover: (info) => this._hover(info),
      updateTriggers: { getColorWeight: [this._sig()], getElevationWeight: [this._sig()] },
    });
  }

  // Static-metric heatmap (non-time). Weight = the layer's own variable magnitude.
  _heatmapLayer() {
    const key = this._keyFor("heatmap");
    const heightKey = this._keyFor("heatmap", "height");
    return new deck.HeatmapLayer({
      id: "heatmap", data: this._grainPoints(key, heightKey),
      getPosition: (d) => d.position, getWeight: (d) => Math.abs(d.heightVal || 0),
      radiusPixels: 55 * this._rmul("heatmap"), intensity: 1.1 * this.glow, threshold: 0.05,
      colorRange: [[36,62,130],[74,120,220],[57,230,230],[238,244,255],[228,92,145],[255,214,240]],
      updateTriggers: { getWeight: [this._sig()] },
    });
  }

  // ---------- dot-density field (synthesized in-polygon points) ----------
  _dotsLayer() {
    const key = this._keyFor("dotField");
    const heightKey = this._keyFor("dotField", "height");
    const cacheKey = this._sig() + "|" + key + "|" + heightKey;
    if (this._dotsCache && this._dotsCache.sig === cacheKey) { /* reuse array ref */ }
    else {
      const spec = Atlas.metricSpec(key);
      const hspec = Atlas.metricSpec(heightKey);
      const magScale = Atlas.magnitudeScaleFromValues(Atlas.valuesForGrain(this._grain(), this.scope, hspec), hspec);
      const dots = Atlas.dotFieldForScope(this.scope).map((p) => {
        const m = Atlas.dongByCode.get(p.dongCode);
        const val = m ? Atlas.metricValue(m, spec) : null;
        const heightVal = m ? Atlas.metricValue(m, hspec) : null;
        return { position: p.position, rank: p.rank, colorVal: val, density: magScale(heightVal) };
      });
      this._dotsCache = { sig: cacheKey, data: dots };
    }
    const color = this._colorAccessorForKey(this._keyFor("dotField"), 1);
    const glowA = Math.round(70 * Math.min(1.6, this.glow));
    const core = new deck.ScatterplotLayer({
      id: "dots", data: this._dotsCache.data, pickable: false, stroked: false,
      radiusUnits: "meters", radiusMinPixels: 1.3, radiusMaxPixels: 4, parameters: ADDITIVE,
      getPosition: (d) => d.position, getRadius: 110 * this._rmul("dotField"),
      // density thinning: show a point only if its stable rank is under the dong's
      // magnitude — denser clusters = higher-value dongs.
      getFillColor: (d) => (d.rank < 0.15 + d.density * 0.85 ? color(d.colorVal) : [0, 0, 0, 0]),
      updateTriggers: { getFillColor: [this.colorBy, this.opacity, this.glow, this._sig()], getRadius: [this.radiusScale] },
    });
    const halo = new deck.ScatterplotLayer({
      id: "dots-halo", data: this._dotsCache.data, pickable: false, stroked: false,
      radiusUnits: "meters", radiusMinPixels: 2.5, radiusMaxPixels: 9, parameters: ADDITIVE,
      getPosition: (d) => d.position, getRadius: 260 * this._rmul("dotField"),
      getFillColor: (d) => { if (d.rank >= 0.15 + d.density * 0.85) return [0, 0, 0, 0]; const c = color(d.colorVal); return [c[0], c[1], c[2], glowA]; },
      updateTriggers: { getFillColor: [this.colorBy, this.glow, this._sig()], getRadius: [this.radiusScale] },
    });
    return [halo, core];
  }

  // ---------- boundary: G9 gu (white) + G10 dong (faint white) ----------
  _boundaryLines(idPrefix, features, style, pickable = false) {
    const data = { type: "FeatureCollection", features };
    const line = (id, width, rgba) => new deck.GeoJsonLayer({
      id, data, pickable, stroked: true, filled: false, extruded: false,
      parameters: ADDITIVE, lineWidthUnits: "pixels", getLineWidth: width, lineWidthMinPixels: width,
      getLineColor: rgba,
      onClick: pickable ? (info) => this._click(info) : undefined,
      onHover: pickable ? (info) => this._hover(info) : undefined,
    });
    return [
      line(`${idPrefix}-halo`, style.haloW, [...style.rgb, style.haloA]),
      line(`${idPrefix}-core`, style.coreW, [...style.rgb, style.coreA]),
    ];
  }

  _boundaryLayer() {
    const isCity = this.scope.level === "city";
    const spec = this._spec("color"), hspec = this._spec("height");
    const layers = [];

    const dongFeatures = (isCity ? Atlas.dongGeometry : this._scopedDongs()).map((d) => {
      const m = Atlas.dongByCode.get(d.dong_code);
      return {
        type: "Feature", geometry: d.geometry,
        properties: {
          dong_code: d.dong_code, dong_name: d.dong_name, gu_code: d.gu_code,
          colorVal: m ? Atlas.metricValue(m, spec) : null,
          heightVal: m ? Atlas.metricValue(m, hspec) : null,
        },
      };
    });
    const dongStyle = isCity
      ? { rgb: [255, 255, 255], coreW: 0.55, haloW: 1.6, coreA: 42, haloA: 14 }
      : { rgb: [255, 255, 255], coreW: 0.75, haloW: 2.2, coreA: 72, haloA: 22 };
    layers.push(...this._boundaryLines("boundary-dong", dongFeatures, dongStyle));

    if (isCity) {
      const guFeatures = Atlas.guGeometry.map((g) => ({
        type: "Feature", geometry: g.geometry,
        properties: {
          gu_code: g.gu_code, gu_name: g.gu_name,
          colorVal: Atlas.guAggregateValue(g.gu_code, spec),
          heightVal: Atlas.guAggregateValue(g.gu_code, hspec),
        },
      }));
      const guStyle = { rgb: [255, 248, 221], coreW: 1.6, haloW: 4, coreA: 210, haloA: 55 };
      layers.push(...this._boundaryLines("boundary-gu", guFeatures, guStyle, true));
    }

    return layers;
  }

  // ---------- T3 influence / radius: animated stroke-only ground rings ----------
  // PathLayer is used instead of ScatterplotLayer's circle stroke. The latter
  // develops broken/aliased arcs on a pitched map at ~1px line width.
  _influenceColor(spec) {
    if (spec?.kind === "rhsi") return [0, 230, 255];
    if (spec?.kind === "industry") return [83, 142, 255];
    if (spec?.signed) return [104, 110, 255];
    return [188, 240, 255];
  }

  _ringPath([lon, lat], radius) {
    const segments = 96;
    const latScale = radius / 110540;
    const lonScale = radius / (111320 * Math.cos(lat * Math.PI / 180));
    const path = new Array(segments + 1);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      path[i] = [lon + Math.cos(a) * lonScale, lat + Math.sin(a) * latScale];
    }
    return path;
  }

  // T3 pulse curve (notes §3–4): a slow *wave*, not an explosion. Only animates
  // while playing; otherwise rings sit at their full target radius (Static mode).
  _pulseState(d) {
    if (!this.playing) return { radiusRatio: 1, alphaRatio: 1 };
    const local = ((this._pulseTime / d.duration) + d.seed) % 1;
    if (local < 0.07) {
      return { radiusRatio: 0.035 + (local / 0.07) * 0.12, alphaRatio: local / 0.07 };
    }
    if (local <= 0.72) {
      const t = (local - 0.07) / 0.65;
      return { radiusRatio: 1 - Math.pow(1 - t, 3), alphaRatio: 1 };
    }
    if (local <= 0.82) return { radiusRatio: 1, alphaRatio: 1 };
    const fade = (local - 0.82) / 0.18;
    return { radiusRatio: 1, alphaRatio: Math.max(0, 1 - fade) };
  }

  // T3 Radius / Influence ring. Static mode: fixed rings (radius = normalized
  // value), constant stroke width, no animation — the calm "subtle" state.
  // Playback: same target radii but pulsing as a slow wave (see _pulseState),
  // gated to the hottest regions that day. Never all 422 at once (notes §7).
  _influenceLayer() {
    const varKey = this._keyFor("influence");
    const heightKey = this._keyFor("influence", "height");
    const rows = this._regionData(varKey, heightKey).filter((r) => r.magT != null);
    const selectedOnly = !this.timeMode && !!this.selectedDongCode;
    // gate by normalized magnitude: playback → top-quantile hot; static → show
    // (nearly) all regions so the ring SIZE encodes the selected variable value
    // everywhere — only 25 gu (city) or a gu's dongs are drawn, never all 422.
    const gate = this.timeMode ? 0.6 : 0.03;
    const cityish = this.scope.level === "city" || this.timeMode;
    // Wide dynamic range so small vs large values sit far apart in radius; a
    // squared magnitude curve pushes the top values much further out than the base.
    const minR = cityish ? 90 : 60;
    const maxR = (cityish ? 2400 : 1600) * this._rmul("influence");
    const ramp = this._activeRamp(varKey);
    const data = rows.map((r) => {
      const mag = r.magT == null ? 0 : r.magT;
      let hash = 0; const key = String(r.code);
      for (const ch of key) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
      return {
        position: r.position,
        code: r.code,
        targetRadius: minR + Math.pow(mag, 1.35) * (maxR - minR),
        mag,
        rgb: mixStops(ramp, r.colorT == null ? 0.5 : r.colorT),
        duration: 6.4 + mag * 1.8,
        seed: (hash % 1000) / 1000,
      };
    }).filter((d) => (selectedOnly ? d.code === this.selectedDongCode : d.mag >= gate));

    // Constant stroke width regardless of value (notes): a thin bright core ring
    // plus a faint wider *decorative* bloom pass (not value-encoded).
    const ring = (id, width, alpha) => new deck.PathLayer({
      id, data, pickable: false, parameters: ADDITIVE,
      widthUnits: "pixels", widthMinPixels: width, widthMaxPixels: width,
      capRounded: true, jointRounded: true,
      getPath: (d) => {
        const state = this._pulseState(d);
        return this._ringPath(d.position, Math.max(8, d.targetRadius * state.radiusRatio));
      },
      getWidth: width,
      getColor: (d) => {
        const state = this._pulseState(d);
        return [d.rgb[0], d.rgb[1], d.rgb[2], Math.round(alpha * state.alphaRatio * Math.min(1.35, this.glow))];
      },
      updateTriggers: {
        getPath: [this._pulseTime, this.playing, this.timeMode, this.timeDayIndex, this.colorBy, this.radiusScale, this._sig(), this.selectedDongCode],
        getColor: [this._pulseTime, this.playing, this.timeMode, this.timeDayIndex, this.colorBy, this.glow, this._sig()],
      },
    });
    return [ring("influence-ring-glow", 3.0, 40), ring("influence-ring-core", 1.3, 215)];
  }

  // ---------- G4 building extrusion — ONLY the drilled region (perf) ----------
  // 264k polygons can't all draw citywide, so buildings render only when a
  // gu/dong is selected, filtered by the gu/dong tag added in tag_buildings.py.
  // In time mode the whole region's buildings are tinted by that day's temp (T5).
  _buildingsLayer() {
    if (!Atlas.buildings || this.scope.level === "city") return null;
    const code = this.scope.guCode;
    // Drilled to a single dong → only that dong's buildings (close-up view).
    const dong = this.scope.level === "dong" ? this.scope.dongCode : null;
    const cacheKey = code + "|" + (dong || "");
    if (!this._bldgCache || this._bldgCache.key !== cacheKey) {
      const feats = Atlas.buildings.features.filter((f) => f.properties.gu === code && (!dong || f.properties.dong === dong));
      this._bldgCache = { key: cacheKey, data: { type: "FeatureCollection", features: feats } };
    }
    let fill = BUILDING_STYLE.fill;
    if (this.timeMode) {
      const [lo, hi] = Atlas.timeVarDomain("temp");
      const temp = Atlas.dayValueByGu(this.timeDayIndex, "temp")[code];
      const t = temp == null ? 0.5 : Math.max(0, Math.min(1, (temp - lo) / ((hi - lo) || 1)));
      const cold = [46, 78, 140], hot = [255, 138, 70]; // cool blue → warm amber
      fill = [lerp(cold[0], hot[0], t), lerp(cold[1], hot[1], t), lerp(cold[2], hot[2], t), 215];
    }
    return new deck.GeoJsonLayer({
      id: "buildings", data: this._bldgCache.data, pickable: false, stroked: true,
      filled: true, extruded: true, wireframe: false,
      lineWidthUnits: "pixels", lineWidthMinPixels: 0.5, getLineWidth: 0.5,
      getLineColor: BUILDING_STYLE.line, getFillColor: fill,
      // cap outlier heights so a few very tall polygons don't spike over the scene
      getElevation: (f) => Math.min(f.properties.h || 12, 210) * 1.8,
      material: { ambient: 0.82, diffuse: 0.28, shininess: 18, specularColor: [30, 45, 60] },
      updateTriggers: { getFillColor: [this.timeMode, this.timeDayIndex, this.opacity] },
    });
  }

  // ---------- time-flow temperature heatmap (per-gu daily temp) ----------
  // The original soft, dreamy "night glow" HeatmapLayer: a wide, low-intensity,
  // airy gaussian field over a cool blue→cyan→white→pink ramp that ends in a
  // red-pink hot stop. The weight is warm-biased (low end anchored up + gamma
  // lift) so warmer days push further into the pink/red-pink instead of only
  // peak summer. No colorDomain — the auto-normalised gradient is what gives it
  // the rich glow. Scope-aware: whole Seoul at city, or the drilled gu's dongs.
  _tempHeatmapLayer() {
    const temps = Atlas.dayValueByGu(this.timeDayIndex, "temp");
    const [lo, hi] = TEMP_DISPLAY_DOMAIN;
    const span = (hi - lo) || 1;
    const isCity = this.scope.level === "city";
    const dongs = isCity ? Atlas.dongGeometry : Atlas.dongGeometry.filter((d) => d.gu_code === this.scope.guCode);
    const data = dongs.map((d) => {
      const t = Math.max(0, Math.min(1, ((temps[d.gu_code] ?? lo) - lo) / span));
      // Keep the field visible on cold days; hue, not disappearance, carries most
      // of the temporal temperature signal.
      return { position: d.centroid, t, w: 0.35 + 0.65 * t };
    });
    // Temperature is near-uniform across Seoul on any given day (~1.5°C spread), so a
    // HeatmapLayer auto-normalises the tiny SPATIAL variation and hides the big TEMPORAL
    // swing (−10°C → +37°C). Fix: drive the glow's COLOUR + brightness from the day's
    // ABSOLUTE temperature — a dynamic colour band + intensity that shift blue→pink over 2024.
    const meanT = data.length ? data.reduce((s, d) => s + d.t, 0) / data.length : 0.5;
    const R = TEMP_HEAT_RANGE, last = R.length - 1;
    const rampAt = (x) => { const p = Math.max(0, Math.min(1, x)) * last, i = Math.floor(p), f = p - i, a = R[i], b = R[Math.min(last, i + 1)]; return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))]; };
    // Heatmap aggregation otherwise maps most pixels to the low end of colorRange.
    // Cluster all six stops around today's absolute temperature, while retaining
    // a small spatial gradient between districts.
    const colorRange = [-0.10, -0.05, 0, 0.04, 0.08, 0.12].map((d) => rampAt(meanT + d));
    return new deck.HeatmapLayer({
      id: "temp-heat", data, getPosition: (d) => d.position, getWeight: (d) => d.w,
      radiusPixels: (isCity ? 75 : 60) * this._rmul("heatmap"),
      intensity: 0.75 + meanT * 0.8, threshold: 0.04, opacity: 0.48 + meanT * 0.34,
      colorRange,
      updateTriggers: { getWeight: [this.timeDayIndex, this.scope.guCode, this.scope.level], colorRange: [this.timeDayIndex] },
    });
  }

  // ---------- time-flow sales rings: nested rings per theme group ----------
  // Per-region theme values for the Sector view — follows the current GRAIN
  // (_grainRegions) exactly like the metric layers, so seoul/gu/dong all work.
  // Time mode uses the current day; static uses annual totals. Each theme is
  // normalised by the max across the rendered set (single-region → own max).
  // Which multivariate profile the Sector view renders, by selected dataset:
  // 6 sales themes (default / time-aware) · 4 urban-feature groups (context) ·
  // 4 SHAP-contribution groups (shap). Each spec gives the per-region value maps,
  // the group count, and the per-group colours + labels.
  _profileSpec() {
    const ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
    if (ds === "context") return { kind: "features", n: Atlas._contextGroups().length, colors: Atlas.contextGroupColors(), labels: Atlas.contextGroupLabels(), byGu: Atlas.featureGroupProfileByGu(), byDong: Atlas.featureGroupProfileByDong() };
    if (ds === "shap") return { kind: "shap", n: Atlas._contextGroups().length, colors: Atlas.contextGroupColors(), labels: Atlas.contextGroupLabels(), byGu: Atlas.shapGroupProfileByGu(), byDong: Atlas.shapGroupProfileByDong() };
    const groups = Atlas.themeGroups();
    return { kind: "sales", n: groups.length || 6, colors: groups.map((g, i) => Atlas.groupColor(i)), labels: groups.map((g) => g.label),
      byGu: this.timeMode ? Atlas.groupSalesByGu(this.timeDayIndex) : Atlas.groupTotalsByGu(),
      byDong: this.timeMode ? Atlas.groupSalesByDong(this.timeDayIndex) : Atlas.groupTotalsByDong() };
  }
  _sectorRegions() {
    const grain = this._grain();
    const spec = this._profileSpec();
    const n = spec.n, guVals = spec.byGu, dongVals = spec.byDong;
    const seoulSum = () => {
      const s = new Array(n).fill(0);
      Object.values(guVals).forEach((v) => v && v.forEach((x, i) => s[i] += (x || 0)));
      return s;
    };
    const regions = [];
    this._grainRegions().forEach((r) => {
      let vals;
      if (r.kind === "seoul") vals = seoulSum();
      else if (r.kind === "gu") vals = guVals[r.code];
      else vals = dongVals[r.code];
      if (vals) regions.push({ position: r.position, vals });
    });
    const max = new Array(n).fill(0);
    regions.forEach((r) => r.vals.forEach((v, i) => { if (v > max[i]) max[i] = v; }));
    if (regions.length === 1) { const m = Math.max(...regions[0].vals) || 1; for (let i = 0; i < n; i++) max[i] = m; }
    return { regions, drilled: grain === "dong", norm: (i) => max[i] || 1, n, colors: spec.colors, labels: spec.labels };
  }
  // Geo point `meters` away from [lon,lat] at `angle` (radians).
  _geoOffset([lon, lat], meters, angle) {
    return [lon + Math.cos(angle) * (meters / (111320 * Math.cos(lat * Math.PI / 180))), lat + Math.sin(angle) * (meters / 110540)];
  }

  // Concentric rings per theme (the original "pretty" look; the (1+i*.22) spread is
  // kept intentionally — radial bars provide the honest comparison).
  _salesGroupRings() {
    const { regions, drilled, norm, n, colors } = this._sectorRegions();
    const minR = drilled ? 60 : 120, step = drilled ? 300 : 620;
    const data = [];
    regions.forEach((r) => { for (let i = 0; i < n; i++) {
      const nv = Math.min(1, (r.vals[i] || 0) / norm(i));
      if (nv <= 0.02) continue;
      data.push({ position: r.position, radius: (minR + Math.pow(nv, 1.3) * step * (1 + i * 0.22)) * this._rmul("salesRings"), rgb: colors[i] });
    } });
    const ring = (id, width, alpha) => new deck.PathLayer({
      id, data, pickable: false, parameters: ADDITIVE, widthUnits: "pixels",
      widthMinPixels: width, widthMaxPixels: width, capRounded: true, jointRounded: true,
      getPath: (d) => this._ringPath(d.position, d.radius), getWidth: width,
      getColor: (d) => [d.rgb[0], d.rgb[1], d.rgb[2], Math.round(alpha * Math.min(1.35, this.glow))],
      updateTriggers: { getPath: [this.timeDayIndex, this.radiusScale, this._sig()], getColor: [this.glow, this._sig()] },
    });
    return [ring("sales-rings-glow", 2.6, 38), ring("sales-rings-core", 1.2, 205)];
  }

  // Radial-bar glyph: one spoke per theme (fixed angle), length ∝ value. Honest.
  _radialBarLayers() {
    const { regions, drilled, norm, n, colors } = this._sectorRegions();
    const maxLen = (drilled ? 720 : 1500) * this._rmul("salesRings");
    const data = [];
    regions.forEach((r) => { for (let i = 0; i < n; i++) {
      const nv = Math.min(1, (r.vals[i] || 0) / norm(i));
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      data.push({ source: r.position, target: this._geoOffset(r.position, 55 + nv * maxLen, angle), rgb: colors[i] });
    } });
    const line = (id, width, alpha) => new deck.LineLayer({
      id, data, pickable: false, parameters: ADDITIVE, widthUnits: "pixels", widthMinPixels: width, getWidth: width,
      getSourcePosition: (d) => d.source, getTargetPosition: (d) => d.target,
      getColor: (d) => [d.rgb[0], d.rgb[1], d.rgb[2], Math.round(alpha * Math.min(1.35, this.glow))],
      updateTriggers: { getTargetPosition: [this.timeDayIndex, this.radiusScale, this._sig()], getColor: [this.glow, this._sig()] },
    });
    return [line("radial-glow", 5, 42), line("radial-core", 2.2, 215)];
  }

  // Stacked 3D columns: one segment per theme, stacked by base z-offset.
  _stackedColumnLayers() {
    const { regions, drilled, norm, n, colors } = this._sectorRegions();
    const unit = drilled ? 900 : 2200;
    const data = [];
    regions.forEach((r) => {
      let base = 0;
      for (let i = 0; i < n; i++) {
        const nv = Math.min(1, (r.vals[i] || 0) / norm(i));
        const h = nv * unit;
        if (h > 1) data.push({ position: [r.position[0], r.position[1], base], elevation: h, rgb: colors[i] });
        base += h;
      }
    });
    return [new deck.ColumnLayer({
      id: "sector-columns", data, diskResolution: 12, radius: 120 * this._rmul("columns"),
      extruded: true, pickable: false, elevationScale: this.elevationScale,
      getPosition: (d) => d.position, getElevation: (d) => d.elevation,
      getFillColor: (d) => [d.rgb[0], d.rgb[1], d.rgb[2], 232],
      material: { ambient: 0.62, diffuse: 0.4, shininess: 20, specularColor: [40, 50, 70] },
      updateTriggers: { getPosition: [this.timeDayIndex, this._sig()], getElevation: [this.timeDayIndex, this._sig()], getFillColor: [this._sig()] },
    })];
  }

  // Dominant-theme choropleth: each region filled by its leading theme, alpha ∝ share.
  // Follows the grain (gu / dong polygons); seoul grain has no single polygon → empty.
  _dominantThemeLayer() {
    const spec = this._profileSpec();
    const guVals = spec.byGu, dongVals = spec.byDong;
    const feats = [];
    this._grainRegions().forEach((r) => {
      if (!r.geometry) return;
      const vals = r.kind === "gu" ? guVals[r.code] : dongVals[r.code];
      if (!vals) return;
      const total = vals.reduce((a, b) => a + (b || 0), 0) || 1;
      let ai = 0; vals.forEach((v, i) => { if (v > vals[ai]) ai = i; });
      feats.push({ type: "Feature", geometry: r.geometry, properties: { rgb: spec.colors[ai], dom: vals[ai] / total } });
    });
    return [new deck.GeoJsonLayer({
      id: "sector-dominant", data: { type: "FeatureCollection", features: feats },
      pickable: false, stroked: true, filled: true, extruded: false,
      getFillColor: (f) => { const c = f.properties.rgb; return [c[0], c[1], c[2], Math.max(55, Math.round(70 + 165 * Math.min(1, (f.properties.dom - 0.16) / 0.5)))]; },
      getLineColor: [255, 255, 255, 22], lineWidthMinPixels: 0.4,
      updateTriggers: { getFillColor: [this.timeDayIndex, this._sig()] },
    })];
  }

  // SHAP diverging column: one column per dong, coloured BY GROUP. Selected features
  // that raise heat sensitivity stack UP from zero; selected features that buffer it
  // stack DOWN. A black footprint marks the zero baseline without washing out the map.
  _signedColumnLayers() {
    const n = Atlas._contextGroups().length;
    const colors = Atlas.contextGroupColors();
    const selected = this._shapFeatureKeys();
    const byGu = Atlas.shapGroupProfileSignedByGu(selected), byDong = Atlas.shapGroupProfileSignedByDong(selected);
    const regions = [];
    this._grainRegions().forEach((r) => {
      let vals;
      if (r.kind === "gu") vals = byGu[r.code];
      else if (r.kind === "dong") vals = byDong[r.code];
      else { vals = new Array(n).fill(0); Object.values(byGu).forEach((v) => v && v.forEach((x, i) => vals[i] += x)); }
      if (vals) regions.push({ position: r.position, vals });
    });
    // normalise by the tallest +/− stack so columns fit the scene
    let maxStack = 0;
    regions.forEach((r) => { let up = 0, dn = 0; r.vals.forEach((v) => v >= 0 ? up += v : dn -= v); maxStack = Math.max(maxStack, up, dn); });
    maxStack = maxStack || 1;
    const drilled = this._grain() === "dong";
    const unit = drilled ? 1500 : 3400, radius = (drilled ? 110 : 240) * this._rmul("columns"), scale = unit / maxStack;
    const cols = [];
    regions.forEach((r) => {
      let utop = 0, dbot = 0;
      for (let i = 0; i < n; i++) {
        const v = r.vals[i], h = Math.abs(v) * scale;
        if (h < 1) continue;
        if (v >= 0) { cols.push({ position: [r.position[0], r.position[1], utop], elevation: h, rgb: colors[i] }); utop += h; }
        else { dbot -= h; cols.push({ position: [r.position[0], r.position[1], dbot], elevation: h, rgb: colors[i] }); }
      }
    });
    return [
      // No zero-ring/footprint — the white ground-plane haze marks the zero level.
      new deck.ColumnLayer({
        id: "shap-signed-columns", data: cols, diskResolution: 14, radius, extruded: true, pickable: false,
        elevationScale: this.elevationScale, stroked: true, getLineColor: [10, 14, 24, 140], lineWidthUnits: "pixels", getLineWidth: 0.5,
        getPosition: (d) => d.position, getElevation: (d) => d.elevation,
        getFillColor: (d) => [d.rgb[0], d.rgb[1], d.rgb[2], 242],
        material: { ambient: 0.6, diffuse: 0.42, shininess: 22, specularColor: [50, 55, 75] },
        updateTriggers: { getPosition: [this._sig()], getElevation: [this.elevationScale, this._sig()], getFillColor: [this._sig()] },
      }),
    ];
  }

  // Clip a ring (array of [lon,lat]) to the vertical band x0 ≤ lon ≤ x1
  // (Sutherland–Hodgman against the two vertical half-planes). Returns [] if empty.
  _clipRingToBand(ring, x0, x1) {
    const clip = (poly, keep, edgeX) => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ain = keep(a[0]), bin = keep(b[0]);
        if (ain) out.push(a);
        if (ain !== bin) {
          const t = (edgeX - a[0]) / ((b[0] - a[0]) || 1e-12);
          out.push([edgeX, a[1] + t * (b[1] - a[1])]);
        }
      }
      return out;
    };
    let p = ring;
    p = clip(p, (x) => x >= x0, x0); if (p.length < 3) return [];
    p = clip(p, (x) => x <= x1, x1); if (p.length < 3) return [];
    return p;
  }
  // Divided-area choropleth: split each region's polygon into N vertical strips whose
  // widths ∝ the group values, clipped to the real shape, each strip coloured by group.
  _dividedAreaLayers() {
    const spec = this._profileSpec();
    const colors = spec.colors, n = colors.length;
    const polys = [];
    this._grainRegions().forEach((r) => {
      if (!r.geometry) return;
      const vals = (r.kind === "gu" ? spec.byGu[r.code] : spec.byDong[r.code]);
      if (!vals) return;
      const total = vals.reduce((a, b) => a + (Math.max(0, b) || 0), 0) || 1;
      const rings = r.geometry.type === "Polygon" ? [r.geometry.coordinates] : r.geometry.coordinates;
      // bbox longitude range of the whole region
      let xmin = Infinity, xmax = -Infinity;
      rings.forEach((poly) => poly[0].forEach(([x]) => { if (x < xmin) xmin = x; if (x > xmax) xmax = x; }));
      const span = (xmax - xmin) || 1e-9;
      let frac = 0;
      for (let i = 0; i < n; i++) {
        const share = Math.max(0, vals[i] || 0) / total;
        if (share <= 0.001) { frac += share; continue; }
        const x0 = xmin + frac * span, x1 = xmin + (frac + share) * span;
        rings.forEach((poly) => {
          const clipped = this._clipRingToBand(poly[0], x0, x1);
          if (clipped.length >= 3) polys.push({ polygon: clipped, rgb: colors[i] });
        });
        frac += share;
      }
    });
    return [new deck.PolygonLayer({
      id: "sector-divided", data: polys, pickable: false, stroked: true, filled: true, extruded: false,
      getPolygon: (d) => d.polygon, getFillColor: (d) => [d.rgb[0], d.rgb[1], d.rgb[2], 205],
      getLineColor: [8, 12, 22, 150], lineWidthUnits: "pixels", getLineWidth: 0.5, lineWidthMinPixels: 0.4,
      updateTriggers: { getPolygon: [this._sig()], getFillColor: [this._sig()] },
    })];
  }

  // Building-mix: colour every building in view by a group, assigned proportionally to
  // its dong's group profile (stable per building). Buildings only load when drilled,
  // so citywide this falls back to the stacked columns.
  _buildingMixLayers() {
    if (!Atlas.buildings) return this._stackedColumnLayers();
    const isCity = this.scope.level === "city";
    const code = this.scope.guCode, dong = this.scope.level === "dong" ? this.scope.dongCode : null;
    // Whole Seoul at city scope (heavy — ~264k buildings), else the drilled gu/dong.
    const feats = isCity ? Atlas.buildings.features
      : Atlas.buildings.features.filter((f) => f.properties.gu === code && (!dong || f.properties.dong === dong));
    const ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
    // Single-metric datasets (e.g. RHSI): colour each building by its dong's metric
    // value — a whole-city "coloured skyline"; keep the real building heights.
    if (ds !== "context" && ds !== "shap") {
      const mspec = Atlas.metricSpec(this.colorBy);
      const color = this._colorAccessorForKey(this.colorBy);
      return [new deck.GeoJsonLayer({
        id: "building-mix", data: { type: "FeatureCollection", features: feats }, pickable: false,
        stroked: true, filled: true, extruded: true, wireframe: false, elevationScale: this.elevationScale,
        lineWidthUnits: "pixels", lineWidthMinPixels: 0.3, getLineWidth: 0.3, getLineColor: [10, 14, 24, 130],
        getElevation: (f) => Math.min(f.properties.h || 12, 210) * 1.8,
        getFillColor: (f) => { const rec = Atlas.dongByCode.get(f.properties.dong); const v = (rec && mspec) ? Atlas.metricValue(rec, mspec) : null; return color(v); },
        updateTriggers: { getFillColor: [this.colorBy, this.opacity, this.glow, this._sig()], getElevation: [this.elevationScale] },
      })];
    }
    const spec = this._profileSpec();
    const byDong = spec.byDong, colors = spec.colors, n = colors.length;
    // Max group value across the set → normalise heights.
    let vmax = 0;
    feats.forEach((f) => { const p = byDong[f.properties.dong]; if (p) p.forEach((v) => { if (v > vmax) vmax = v; }); });
    vmax = vmax || 1;
    const pick = (dcode, seed) => {
      const p = byDong[dcode]; if (!p) return 0;
      const total = p.reduce((a, b) => a + (Math.max(0, b) || 0), 0) || 1;
      let t = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1; // stable pseudo-random [0,1)
      t *= total; let acc = 0;
      for (let i = 0; i < n; i++) { acc += Math.max(0, p[i] || 0); if (t <= acc) return i; }
      return n - 1;
    };
    // Height carries the assigned group's strength at the dong (stronger group ⇒ taller).
    return [new deck.GeoJsonLayer({
      id: "building-mix", data: { type: "FeatureCollection", features: feats }, pickable: false,
      stroked: true, filled: true, extruded: true, wireframe: false, elevationScale: this.elevationScale,
      lineWidthUnits: "pixels", lineWidthMinPixels: 0.4, getLineWidth: 0.4, getLineColor: [10, 14, 24, 160],
      getElevation: (f, { index }) => { const p = byDong[f.properties.dong]; const g = pick(f.properties.dong, index + 1); const gv = p ? Math.max(0, p[g] || 0) : 0; return 30 + (gv / vmax) * 620; },
      getFillColor: (f, { index }) => { const c = colors[pick(f.properties.dong, index + 1)]; return [c[0], c[1], c[2], 230]; },
      updateTriggers: { getFillColor: [this._sig()], getElevation: [this._sig(), this.elevationScale] },
    })];
  }

  // ---------- real OSM road glow (static, not data-driven) ----------
  // NORMAL (non-additive) blending: with ~20-30k overlapping street segments,
  // additive halos stack into a blown-out white/amber blob at junctions and
  // stall the GPU (rounded caps/joints triangulate extra geometry per path).
  // Flat butt/miter joins + regular alpha blending stay crisp and cheap.
  _roadsLayer() {
    const tiers = ["arterial"];
    if (this.scope.level !== "city") tiers.push("mid");
    const layers = [];
    tiers.forEach((tier) => {
      const data = Atlas.roads[tier] || [];
      const style = ROAD_STYLE[tier];
      layers.push(new deck.PathLayer({
        id: `roads-${tier}-halo`, data, getPath: (d) => d,
        getWidth: style.haloW, widthUnits: "pixels", widthMinPixels: style.haloW,
        capRounded: false, jointRounded: false, pickable: false,
        getColor: [style.halo[0], style.halo[1], style.halo[2], Math.round(style.halo[3] * Math.min(1.2, this.glow))],
      }));
      layers.push(new deck.PathLayer({
        id: `roads-${tier}-core`, data, getPath: (d) => d,
        getWidth: style.coreW, widthUnits: "pixels", widthMinPixels: style.coreW,
        capRounded: false, jointRounded: false, pickable: false,
        getColor: style.core,
      }));
    });
    return layers;
  }

  // ---------- OSM context layers (lazy; represent Urban Environment & Accessibility) ----------
  // Green parks/forest + blue water polygons (translucent, drawn low so data reads over them).
  _natureLayer() {
    const fc = Atlas._osm && Atlas._osm.nature;
    const feats = (fc && fc.features) || [];
    if (!feats.length) return [];
    return [new deck.PolygonLayer({
      id: "nature", data: feats, pickable: false, stroked: false, filled: true, extruded: false,
      getPolygon: (f) => f.geometry.coordinates,
      getFillColor: (f) => f.properties.k === "water" ? [66, 120, 200, 92] : [72, 150, 92, 80],
      parameters: { depthTest: false },
    })];
  }
  // Subway lines + station dots + smaller bus-stop dots.
  _transitLayer() {
    const t = (Atlas._osm && Atlas._osm.transit) || {};
    const out = [];
    if ((t.subwayLines || []).length) out.push(new deck.PathLayer({
      id: "transit-subway", data: t.subwayLines, getPath: (d) => d, widthUnits: "pixels",
      getWidth: 1.4, widthMinPixels: 1.1, capRounded: true, jointRounded: true, pickable: false,
      getColor: [120, 200, 255, 205],
    }));
    if ((t.stations || []).length) out.push(new deck.ScatterplotLayer({
      id: "transit-stations", data: t.stations, getPosition: (d) => d, radiusUnits: "pixels",
      getRadius: 2.6, radiusMinPixels: 1.8, stroked: false, pickable: false, getFillColor: [150, 215, 255, 235],
    }));
    if ((t.busStops || []).length) out.push(new deck.ScatterplotLayer({
      id: "transit-bus", data: t.busStops, getPosition: (d) => d, radiusUnits: "pixels",
      getRadius: 1.1, radiusMinPixels: 0.8, stroked: false, pickable: false, getFillColor: [255, 200, 120, 150],
    }));
    return out;
  }
  // Curated amenity points, colored by category.
  _amenityLayer() {
    const pts = (Atlas._osm && Atlas._osm.amenity) || [];
    if (!pts.length) return [];
    return [new deck.ScatterplotLayer({
      id: "amenity", data: pts, getPosition: (d) => [d.x, d.y], radiusUnits: "pixels",
      getRadius: 2, radiusMinPixels: 1.4, stroked: false, pickable: false,
      getFillColor: (d) => { const c = AMENITY_COLORS[d.c] || [200, 200, 200]; return [c[0], c[1], c[2], 210]; },
    })];
  }
  // Enabled OSM point/line context (transit + amenity) — drawn above roads.
  _osmOverlayLayers() {
    const L = this.layers, out = [];
    if (L.transit && Atlas._osm && Atlas._osm.transit) out.push(...this._transitLayer());
    if (L.amenity && Atlas._osm && Atlas._osm.amenity) out.push(...this._amenityLayer());
    return out;
  }

  // ---------- labels ----------
  // ArcGIS Scene Viewer-style leader lines: a thin white stem rises from each
  // region's centroid and the name floats on top (billboard), so it clears the
  // choropleth fill / bars instead of being buried in them. At a busy grain
  // (e.g. all 424 dongs) only the selected region + the strongest N are labelled.
  // Only thin the labels when the grain is genuinely crowded (all ~424 dongs).
  // Gu (25) and a single gu's dongs (~15) all get labelled.
  // True when the active representation extrudes regions (choropleth/columns/3D
  // sectors), so the label stem must clear the bar's top rather than the ground.
  _isExtruded() {
    return !!(this.layers.choropleth || this.layers.columns
      || ["columns", "signedcols", "radial", "buildingmix"].includes(this.sectorView));
  }
  // Max top (metres, BEFORE elevationScale) of whatever the active representation
  // draws. Every rep has its own vertical scale, so a single shared constant threw the
  // labels wildly off: choropleth/columns run to ~90k, the stacked sector columns to a
  // few thousand, and buildingmix uses REAL building heights capped at 210*1.8 — which
  // is why Buildings labels sat ~200x above the skyline.
  _labelHeightScale() {
    const drilled = this._grain() === "dong";
    switch (this.sectorView) {
      case "buildingmix": return 210 * 1.8;                   // _buildingMixLayers getElevation cap
      case "signedcols":  return drilled ? 1500 : 3400;        // stacks normalised to `unit`
      case "columns":
      case "radial":      return (drilled ? 900 : 2200) * 3;   // ~3 stacked segments of `unit`
      default:            return drilled ? 55000 : 90000;      // choropleth / columns layer
    }
  }
  // Buildings are drawn at a uniform capped height, so their labels must clear the
  // skyline instead of scaling with the region's value (a low-value gu still has towers).
  _labelUniformHeight() { return this.sectorView === "buildingmix"; }
  // Each label sits on its own bar. The stem height uses the SAME linear
  // |value|/hMax normalisation the bars use (map.js choropleth/columns getElevation),
  // so a label never detaches and floats alone above a short bar. Flat reps get a
  // small constant lift so the name reads clear of the fill.
  // Safety ceiling only — the screen-distance rule below is what actually declutters,
  // so this can stay loose and let a zoomed-in view show plenty of names.
  _MAX_LABELS = 60;
  _labelRegions() {
    // In time mode take the grain-following rows, so dong bars get dong labels.
    const rows = (this.timeMode ? this._timeRegionRows() : this._regionData())
      .filter((d) => d && d.position && d.name);
    const extruded = this._isExtruded();
    const EXT = this._labelHeightScale();
    // The height ratio must match whichever layer is actually drawing the bars:
    //  · time mode  → _timeChoroplethLayer normalises against the FIXED whole-period
    //    domain, and _regionData's time branch carries `value` but no `heightValue`
    //    (without this the stems sat flat at the base while the bars rose).
    //  · otherwise  → the static choropleth/columns use |heightValue| / max|heightValue|.
    let ratioOf;
    if (this.timeMode) {
      const [glo, ghi] = Atlas.timeVarDomain(this.timeVar);
      const gspan = (ghi - glo) || 1;
      ratioOf = (d) => (Number.isFinite(d.value) ? Math.max(0, Math.min(1, (d.value - glo) / gspan)) : 0);
    } else {
      let hMax = 0;
      for (const d of rows) hMax = Math.max(hMax, Math.abs(d.heightValue || 0));
      hMax = hMax || 1;
      ratioOf = (d) => Math.abs(d.heightValue || 0) / hMax;
    }
    // Clearance above the geometry has to scale with the rep too — 1.2 km over a 378 m
    // skyline would still leave the Buildings labels floating in space.
    const uniform = this._labelUniformHeight();
    const lift = Math.max(40, Math.min(1400, EXT * 0.06));
    for (const d of rows) {
      const ratio = ratioOf(d);
      const hRatio = uniform ? 1 : ratio;
      d._stemTop = (extruded ? hRatio * EXT * this.elevationScale : 0) + lift + ratio * lift * 0.5;
    }
    if (rows.length <= 40) return rows;
    // Crowded grain (all ~424 dongs). Ranking by value alone is not enough: the biggest
    // |RHSI| dongs all sit downtown, so the "top N" landed as one overlapping clump.
    // Walk the ranking and keep a label only when it is far enough from the ones already
    // kept — measured in SCREEN pixels, so zooming in naturally reveals more names.
    const sel = this.selectedDongCode;
    const ranked = [...rows].sort((a, b) => (b.magT || 0) - (a.magT || 0));
    const selected = rows.find((d) => d.code === sel);
    if (selected) ranked.unshift(selected);          // the selected region always wins
    const project = (d) => {
      if (!this.map || !this.map.project) return null;
      const p = this.map.project({ lng: d.position[0], lat: d.position[1] });
      return (p && Number.isFinite(p.x)) ? p : null;
    };
    const MIN_PX = 78, kept = [], keep = new Set();
    for (const d of ranked) {
      if (keep.has(d)) continue;
      const p = project(d);
      if (!p) { keep.add(d); continue; }             // no camera yet → fall back to rank
      if (kept.some((q) => Math.abs(q.x - p.x) < MIN_PX && Math.abs(q.y - p.y) < MIN_PX)) continue;
      kept.push(p); keep.add(d);
      if (keep.size >= this._MAX_LABELS) break;
    }
    return rows.filter((d) => keep.has(d));
  }
  _labelStemTop(d) { return d._stemTop != null ? d._stemTop : 1200; }
  _labelsLayer() {
    const data = this._labelRegions();
    const glow = Math.min(1.4, this.glow);
    const stems = new deck.LineLayer({
      id: "label-stems", data, pickable: false,
      getSourcePosition: (d) => [d.position[0], d.position[1], 0],
      getTargetPosition: (d) => [d.position[0], d.position[1], this._labelStemTop(d)],
      getColor: [226, 236, 250, Math.round(150 * glow)],
      widthUnits: "pixels", getWidth: 1.2, parameters: ADDITIVE_DEPTH,
      updateTriggers: { getSourcePosition: [this._sig()], getTargetPosition: [this._sig(), this.elevationScale], getColor: [this.glow] },
    });
    const dots = new deck.ScatterplotLayer({
      id: "label-anchors", data, pickable: false,
      getPosition: (d) => [d.position[0], d.position[1], this._labelStemTop(d)],
      radiusUnits: "pixels", getRadius: 1.8, getFillColor: [236, 244, 255, Math.round(220 * glow)],
      parameters: ADDITIVE_DEPTH, billboard: true,
      updateTriggers: { getPosition: [this._sig(), this.elevationScale], getFillColor: [this.glow] },
    });
    const text = new deck.TextLayer({
      id: "labels", data, pickable: false, billboard: true,
      getPosition: (d) => [d.position[0], d.position[1], this._labelStemTop(d)],
      getText: (d) => d.name,
      getSize: this.scope.level === "city" ? 12 : 11, sizeUnits: "pixels",
      // ArcGIS labelSymbol3D offsets by screenLength — a screen-pixel gap keeps the
      // spacing constant at any zoom instead of drifting with the world-metre lift.
      getPixelOffset: [0, -14],
      getColor: [230, 238, 248, 235], fontFamily: "Inter, sans-serif", fontWeight: 600,
      getTextAnchor: "middle", getAlignmentBaseline: "bottom",
      outlineWidth: 2.5, outlineColor: [5, 7, 11, 235], fontSettings: { sdf: true },
      // NOTE: deck.gl's CollisionFilterExtension is available (9.3.7) and would replace
      // the top-N cut below with real screen-space decluttering, but wiring it here culled
      // EVERY label — even 25 gu names with no overlap. The docs' caveat is that the
      // collision test needs a visible pixel at the layer's anchor, which a transparent
      // SDF glyph + billboard + z-offset does not guarantee. Revisit with `background:
      // true` (opaque box guarantees the anchor pixel) before turning this back on.
      updateTriggers: { getText: [this._sig()], getPosition: [this._sig(), this.elevationScale], getSize: [this.scope.level] },
    });
    return [stems, dots, text];
  }

  // ---------- Temporal Data Layers: T1 point core + T2 point halo ----------
  // The doc's central mechanism: one glowing point per region whose brightness
  // and size encode the metric magnitude and whose hue encodes its value —
  // "each city light is a data value". Halo is the same points redrawn large +
  // faint (additive) for the night-lamp bloom, no real post-processing needed.
  _pointCoreLayer() {
    const key = this._keyFor("pointCore");
    const heightKey = this._keyFor("pointCore", "height");
    const ramp = this._activeRamp(key);
    const data = this._regionData(key, heightKey).filter((r) => r.colorT != null);
    return new deck.ScatterplotLayer({
      id: "point-core", data, pickable: false, stroked: false, parameters: ADDITIVE,
      radiusUnits: "meters", radiusMinPixels: 1.6, radiusMaxPixels: 11,
      getPosition: (d) => d.position,
      getRadius: (d) => (150 + Math.sqrt(d.magT) * 620) * this._rmul("pointCore"),
      getFillColor: (d) => {
        const [r, g, b] = mixStops(ramp, d.colorT);
        const a = Math.min(235, Math.round((36 + Math.pow(d.magT, 0.65) * 190) * Math.min(1.6, this.glow)));
        return [r, g, b, a];
      },
      updateTriggers: {
        getFillColor: [this.colorBy, this.glow, this._sig()],
        getRadius: [this.colorBy, this.radiusScale, this._sig()],
      },
    });
  }
  _pointHaloLayer() {
    const key = this._keyFor("pointHalo");
    const heightKey = this._keyFor("pointHalo", "height");
    const ramp = this._activeRamp(key);
    const data = this._regionData(key, heightKey).filter((r) => r.colorT != null);
    return new deck.ScatterplotLayer({
      id: "point-halo", data, pickable: false, stroked: false, parameters: ADDITIVE,
      radiusUnits: "meters", radiusMinPixels: 4, radiusMaxPixels: 48,
      getPosition: (d) => d.position,
      getRadius: (d) => (150 + Math.sqrt(d.magT) * 620) * this._rmul("pointHalo") * 4.5,
      getFillColor: (d) => {
        const [r, g, b] = mixStops(ramp, d.colorT);
        const a = Math.round((10 + Math.pow(d.magT, 0.7) * 44) * Math.min(1.8, this.glow));
        return [r, g, b, a];
      },
      updateTriggers: {
        getFillColor: [this.colorBy, this.glow, this._sig()],
        getRadius: [this.colorBy, this.radiusScale, this._sig()],
      },
    });
  }

  // Always-on invisible polygon layer that owns click/hover picking, so drilling
  // works regardless of which visual layers are enabled (the glow layers stay
  // non-pickable to keep the night scene clean).
  _pickLayer() {
    const mk = (id, features) => new deck.GeoJsonLayer({
      id, data: { type: "FeatureCollection", features },
      pickable: true, stroked: false, filled: true, extruded: false,
      getFillColor: [0, 0, 0, 0], parameters: { depthTest: false },
      onClick: (info) => this._click(info), onHover: (info) => this._hover(info),
    });
    // Base: EVERY gu is always pickable — you can hover/click any district even
    // while drilled into another one.
    const guFeatures = Atlas.guGeometry.map((g) => ({ type: "Feature", geometry: g.geometry, properties: { gu_code: g.gu_code, gu_name: g.gu_name } }));
    const layers = [mk("pick-gu", guFeatures)];
    // Overlay: when drilled, the current gu's dongs sit on top so you pick dongs
    // inside it (clicking outside the gu falls through to the base → jumps gu).
    if (this.scope.level !== "city") {
      const dongFeatures = Atlas.dongGeometry.filter((d) => d.gu_code === this.scope.guCode)
        .map((d) => ({ type: "Feature", geometry: d.geometry, properties: { dong_code: d.dong_code, dong_name: d.dong_name, gu_code: d.gu_code } }));
      layers.push(mk("pick-dong", dongFeatures));
    }
    return layers;
  }

  // Highlight the selected dong — either a glowing boundary/area (default) or a
  // vertical shiny pillar. Style is chosen from the map panel (setSelectionStyle).
  _beamLayers() {
    if (!this.selectedDongCode) return [];
    const geom = Atlas.dongGeomByCode.get(this.selectedDongCode);
    if (!geom) return [];
    const pulse = 0.72 + 0.28 * Math.sin(this._pulse);
    if (this.selectionStyle === "pillar") {
      const pt = [{ position: geom.centroid }];
      return [
        new deck.ColumnLayer({ id: "beam", data: pt, diskResolution: 12, radius: 150, extruded: true,
          getPosition: (d) => d.position, getElevation: 105000,
          getFillColor: [221, 232, 255, Math.round(120 * pulse * this.glow)], parameters: ADDITIVE, pickable: false }),
        new deck.ScatterplotLayer({ id: "beam-base", data: pt, getPosition: (d) => d.position,
          getRadius: 620 * (0.9 + 0.1 * pulse), radiusUnits: "meters",
          getFillColor: [200, 220, 255, Math.round(90 * pulse * this.glow)], parameters: ADDITIVE, pickable: false }),
      ];
    }
    // 'boundary' (default): a soft additive area wash + a wide glow ring + a crisp
    // outline, all pulsing. Independent of `glow` so it stays visible in flat 2D.
    if (!geom.geometry) return [];
    const data = { type: "FeatureCollection", features: [{ type: "Feature", geometry: geom.geometry, properties: {} }] };
    return [
      new deck.GeoJsonLayer({ id: "sel-fill", data, filled: true, stroked: false, extruded: false,
        getFillColor: [130, 178, 255, Math.round(42 * pulse)], parameters: ADDITIVE, pickable: false }),
      new deck.GeoJsonLayer({ id: "sel-glow", data, filled: false, stroked: true, extruded: false,
        getLineColor: [150, 190, 255, Math.round(150 * pulse)], lineWidthUnits: "pixels", getLineWidth: 7, parameters: ADDITIVE, pickable: false }),
      new deck.GeoJsonLayer({ id: "sel-line", data, filled: false, stroked: true, extruded: false,
        getLineColor: [228, 240, 255, 240], lineWidthUnits: "pixels", getLineWidth: 2, pickable: false }),
    ];
  }
  setSelectionStyle(v) { this.selectionStyle = v === "pillar" ? "pillar" : "boundary"; this.render(); }

  // ---------- composition ----------
  _staticLayers() {
    if (!this._deckReady) return [];
    const osmKey = (typeof Atlas !== "undefined" && Atlas.osmLoadedKey) ? Atlas.osmLoadedKey() : "";
    // Label thinning is measured in screen pixels, so it must be redone as the camera
    // zooms. Only labels care, so the bucket joins the key only while they are on —
    // otherwise the static layers would rebuild on every zoom step for nothing.
    const zoomKey = (this.layers.labels && this.map && this.map.getZoom)
      ? "z" + (Math.round(this.map.getZoom() * 2) / 2) : "";
    const sig = [this._sig(), JSON.stringify(this.layers), this.elevationScale, this.radiusScale, this.opacity, this.glow, this.selectedDongCode, osmKey, zoomKey].join("#");
    if (this._staticCache && this._staticCache.sig === sig) return this._staticCache.layers;
    const L = this.layers;
    const layers = [...this._pickLayer()];
    // Nature fills sit at the bottom (under data/roads) in every mode.
    if (L.nature && Atlas._osm && Atlas._osm.nature) layers.push(...this._natureLayer());

    // Time mode usually uses temperature heat, but Sales choropleth uses a
    // dedicated daily-sales polygon layer so the flat-map rep can animate alone.
    if (this.timeMode) {
      // Channel-gated: temperature heat field for temp/both, the sales layer for
      // sales/both. A single dataset shows only its own flow; only Heat × sales
      // ("both") draws temperature AND sales together.
      const ch = this._channel();
      // Flat daily-sales polygon only for the Sales choropleth rep (its layer is on);
      // the rings/columns encodings animate via _dynamicLayers instead.
      if (ch !== "temp" && L.choropleth) layers.push(this._timeChoroplethLayer());
      if (ch !== "sales") {
        layers.push(this._tempHeatmapLayer());
        if (this.scope.level !== "city") { const b = this._buildingsLayer(); if (b) layers.push(b); }
      }
      if (L.roads) layers.push(...this._roadsLayer());
      layers.push(...this._osmOverlayLayers());
      if (L.boundary) layers.push(...this._boundaryLayer());
      if (L.labels) layers.push(...this._labelsLayer());
      this._staticCache = { sig, layers };
      return layers;
    }

    // z-order (bottom → top), grouped per the doc: static area fills →
    // heatmap → roads (static city) → data layers (halo → core →
    // dot field) → boundary lines → labels.
    if (L.choropleth) layers.push(this._choroplethLayer());
    if (L.columns) layers.push(this._columnsLayer());
    if (L.hexbin) layers.push(this._hexbinLayer());
    if (L.heatmap) layers.push(this._heatmapLayer());
    const buildings = L.buildings ? this._buildingsLayer() : null;
    if (buildings) layers.push(buildings);
    if (L.roads) layers.push(...this._roadsLayer());
    layers.push(...this._osmOverlayLayers());
    if (L.dotField) layers.push(...this._dotsLayer());
    if (L.pointHalo) layers.push(this._pointHaloLayer());
    if (L.pointCore) layers.push(this._pointCoreLayer());
    if (L.boundary) layers.push(...this._boundaryLayer());
    if (L.labels) layers.push(...this._labelsLayer());
    this._staticCache = { sig, layers };
    return layers;
  }

  _dynamicLayers() {
    const layers = [];
    if (this.sectorView) {
      if (this.sectorView === "rings") layers.push(...this._salesGroupRings());
      else if (this.sectorView === "radial") layers.push(...this._radialBarLayers());
      else if (this.sectorView === "columns") layers.push(...this._stackedColumnLayers());
      else if (this.sectorView === "dominant") layers.push(...this._dominantThemeLayer());
      else if (this.sectorView === "signedcols") { layers.push(...this._groundPlaneLayer(), ...this._signedColumnLayers()); }
      else if (this.sectorView === "divided") layers.push(...this._dividedAreaLayers());
      else if (this.sectorView === "buildingmix") layers.push(...this._buildingMixLayers());
    } else if (this.timeMode && this.timeCompare) layers.push(...this._salesGroupRings());
    else if (this.layers.influence) layers.push(...this._influenceLayer());
    layers.push(...this._beamLayers());
    return layers;
  }
  setSectorView(v) { this.sectorView = ["rings", "radial", "columns", "dominant", "signedcols", "divided", "buildingmix"].includes(v) ? v : null; this.render(); }
  _allShapFeatureKeys() {
    return [...new Set(Atlas._contextGroups().flatMap((g) => g.columns || []))];
  }
  _shapFeatureKeys() {
    return this.shapFeatures === null ? this._allShapFeatureKeys() : this.shapFeatures;
  }
  setShapFeatures(keys) {
    const all = this._allShapFeatureKeys();
    const allowed = new Set(all);
    const selected = [...new Set(keys || [])].filter((k) => allowed.has(k));
    this.shapFeatures = selected.length === all.length ? null : selected;
    this.render();
  }
  _activeShapGroupIndexes() {
    const selected = new Set(this._shapFeatureKeys());
    return Atlas._contextGroups().map((g, i) => (g.columns || []).some((c) => selected.has(c)) ? i : -1).filter((i) => i >= 0);
  }
  // A pale translucent surface at z=0 mutes the base map and makes the
  // above-zero and below-zero SHAP stacks read as separate halves.
  _groundPlaneLayer() {
    const [minx, miny, maxx, maxy] = Atlas.meta.bbox;
    return [new deck.PolygonLayer({
      id: "ground-plane", data: [{ polygon: [[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy]] }],
      pickable: false, stroked: false, filled: true, extruded: false, getElevation: 0,
      getPolygon: (d) => d.polygon, getFillColor: [246, 248, 252, 105],
      parameters: { depthTest: false },
    })];
  }
  // Heat field (temperature only) vs Heat × sales (temperature + sales rings) in time mode.
  setTimeCompare(on) { this.timeCompare = !!on; this.render(); }

  _layers() { return [...this._staticLayers(), ...this._dynamicLayers()]; }
  render() { if (this.overlay) this.overlay.setProps({ layers: this._layers() }); }

  _animate() {
    const loop = (timestamp) => {
      if (this.autoRotate && this.map && !this.map.isMoving()) this.map.setBearing(this.map.getBearing() + 0.08);
      // Only rebuild per-frame while something is actually animating: the pulse
      // rings (playback), or the selection beam. Static rings don't re-render.
      if (((this.layers.influence && this.playing) || this.selectedDongCode) && this.overlay) {
        this._pulseTime = timestamp / 1000;
        this._pulse += 0.08;
        this.overlay.setProps({ layers: [...this._staticLayers(), ...this._dynamicLayers()] });
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // ---------- interaction ----------
  _click(info) {
    if (!info.object || !this.onRegionClick) return;
    const p = info.object.properties || info.object;
    // Decide by WHAT was picked (a dong feature vs a gu feature), not the current
    // scope — so clicking a gu outside the drilled one jumps there correctly.
    if (p.dong_code) this.onRegionClick({ level: "dong", dong_code: p.dong_code, dong_name: p.dong_name, gu_code: p.gu_code });
    else this.onRegionClick({ level: "gu", gu_code: p.gu_code, gu_name: p.gu_name });
  }
  _hover(info) {
    if (!this.onRegionHover) return;
    if (!info.object) return this.onRegionHover(null);
    const p = info.object.properties || info.object;
    this.onRegionHover(p.dong_code
      ? { level: "dong", dong_code: p.dong_code, dong_name: p.dong_name, x: info.x, y: info.y }
      : { level: "gu", gu_code: p.gu_code, gu_name: p.gu_name, x: info.x, y: info.y });
  }

  // ---------- external controls ----------
  setScope(scope) {
    this.scope = scope;
    this.selectedDongCode = scope.level === "dong" ? scope.dongCode : null;
    if (scope.level === "city") {
      this.map.flyTo({ center: [SEOUL_CENTER.longitude, SEOUL_CENTER.latitude], zoom: SEOUL_CENTER.zoom, pitch: SEOUL_CENTER.pitch, bearing: SEOUL_CENTER.bearing, duration: 1000 });
    } else if (scope.level === "dong") {
      // Close up on the specific dong.
      const b = this._dongBounds(scope.dongCode) || this._guBounds(scope.guCode);
      if (b) this.map.fitBounds(b, { padding: 130, pitch: 50, bearing: -14, duration: 1000, maxZoom: 15.5 });
    } else {
      const b = this._guBounds(scope.guCode);
      if (b) this.map.fitBounds(b, { padding: 80, pitch: 52, bearing: -14, duration: 1000, maxZoom: 13.5 });
    }
    this.render();
  }
  _dongBounds(dongCode) {
    const d = Atlas.dongGeomByCode ? Atlas.dongGeomByCode.get(dongCode) : Atlas.dongGeometry.find((x) => x.dong_code === dongCode);
    if (!d) return null;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    const polys = d.geometry.type === "Polygon" ? [d.geometry.coordinates] : d.geometry.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => ring.forEach(([lon, lat]) => {
      minx = Math.min(minx, lon); maxx = Math.max(maxx, lon); miny = Math.min(miny, lat); maxy = Math.max(maxy, lat);
    })));
    return minx < maxx ? [[minx, miny], [maxx, maxy]] : null;
  }
  // Which dong contains a lng/lat (for double-click drill). Ray-cast per polygon.
  _dongAt(lng, lat) {
    const inRing = (x, y, ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };
    for (const d of Atlas.dongGeometry) {
      const polys = d.geometry.type === "Polygon" ? [d.geometry.coordinates] : d.geometry.coordinates;
      for (const poly of polys) {
        if (inRing(lng, lat, poly[0])) {
          let inHole = false;
          for (let h = 1; h < poly.length; h++) if (inRing(lng, lat, poly[h])) { inHole = true; break; }
          if (!inHole) return d;
        }
      }
    }
    return null;
  }
  _guBounds(guCode) {
    const dongs = Atlas.dongGeometry.filter((d) => d.gu_code === guCode);
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    dongs.forEach((d) => {
      const polys = d.geometry.type === "Polygon" ? [d.geometry.coordinates] : d.geometry.coordinates;
      polys.forEach((poly) => poly.forEach((ring) => ring.forEach(([lon, lat]) => {
        minx = Math.min(minx, lon); maxx = Math.max(maxx, lon); miny = Math.min(miny, lat); maxy = Math.max(maxy, lat);
      })));
    });
    return minx < maxx ? [[minx, miny], [maxx, maxy]] : null;
  }

  setLayer(name, on) { this.layers[name] = on; this.render(); }
  preset(name) { if (PRESETS[name]) { this.layers = { ...this.layers, ...PRESETS[name] }; this.render(); } return this.layers; }
  setColorBy(key) { if (Atlas.metricSpec(key)) { this.colorBy = key; this.render(); } }
  setHeightBy(key) { if (Atlas.metricSpec(key)) { this.heightBy = key; this.render(); } }
  // Spatial grain of the data layers: 'seoul' | 'gu' | 'dong' | null (auto).
  setGrain(g) { this.grain = (g === "seoul" || g === "gu" || g === "dong") ? g : null; this.render(); }
  // Per-layer color/height metric overrides. Empty means "follow unified value".
  setLayerVar(layer, key) {
    if (!key || key === this.colorBy) delete this.layerVar[layer];
    else if (Atlas.metricSpec(key)) this.layerVar[layer] = key;
    this.render();
  }
  setLayerHeightVar(layer, key) {
    if (!key || key === this.heightBy) delete this.layerHeightVar[layer];
    else if (Atlas.metricSpec(key)) this.layerHeightVar[layer] = key;
    this.render();
  }
  // "Unify" one visual channel without disturbing the other channel.
  unifyLayerColors(key) { if (key && Atlas.metricSpec(key)) this.colorBy = key; this.layerVar = {}; this.render(); }
  unifyLayerHeights(key) { if (key && Atlas.metricSpec(key)) this.heightBy = key; this.layerHeightVar = {}; this.render(); }
  unifyLayerVars(key) { this.unifyLayerColors(key); }
  // Per-layer radius multiplier (on top of the common Radius slider).
  setLayerRadius(layer, v) { this.layerRadius[layer] = v; this.render(); }
  setElevationScale(v) { this.elevationScale = v; this.render(); }
  // Rebuild the LightingEffect from whichever of the 3 lights are on.
  _rebuildLighting() {
    const active = {};
    if (this.lightOn.ambient) active.ambient = this._lights.ambient;
    if (this.lightOn.sun) active.sun = this._lights.sun;
    if (this.lightOn.point) active.point = this._lights.point;
    // Deck falls back to a default rig when given no lights; a zero ambient keeps
    // "all off" genuinely dark instead of snapping back to defaults.
    if (!Object.keys(active).length) active.ambient = new deck.AmbientLight({ color: [0, 0, 0], intensity: 0 });
    this.lighting = new deck.LightingEffect(active);
    if (this.overlay) this.overlay.setProps({ effects: [this.lighting] });
    this.render();
  }
  setLight(which, on) {
    if (!(which in this.lightOn)) return;
    this.lightOn[which] = !!on;
    this._rebuildLighting();
  }
  setRadiusScale(v) { this.radiusScale = v; this.render(); }
  setOpacity(v) { this.opacity = v; this.render(); }
  setGlow(v) { this.glow = v; this.render(); }
  setAutoRotate(on) { this.autoRotate = on; }
  selectDong(code) { this.selectedDongCode = code; this._pulse = 0; this.render(); }

  // ---------- time-flow controls ----------
  // Which temporal flow is on screen: "both" = Heat × sales, else the active
  // playable variable ("sales" or "temp"). App-side timeChannel() keeps timeVar /
  // timeCompare in sync with the open dataset + representation.
  _channel() { return this.timeCompare ? "both" : (this.timeVar === "sales" ? "sales" : "temp"); }
  setTimeMode(on) { this.timeMode = on; if (!on) this.playing = false; this.render(); }
  setTimeDay(i) { this.timeDayIndex = Math.max(0, Math.min(Atlas.timeDayCount() - 1, i | 0)); this.render(); }
  setPlaying(on) { this.playing = on; this.render(); }
  setTimeVar(v) { if (Atlas.TIME_VARS[v]) { this.timeVar = v; this.render(); } }
  // For the legend / read-out: is the map currently time-variable-driven?
  isTimeMode() { return this.timeMode; }

  // Legend as a stack of typed blocks, one per DISTINCT variable in play, so the
  // key stays truthful when layers are pointed at different metrics. Format is
  // chosen per data type: signed→diverging gradient, unsigned→sequential gradient,
  // sales themes→categorical swatches, height→its own glyph, time→temperature.
  legend() {
    const grain = this._grain();

    // Time mode: active daily variable, with sales-theme groups only when rings
    // are part of the composition.
    if (this.timeMode) {
      const isSales = this.timeVar === "sales";
      const items = (!isSales && (this.timeCompare || this.sectorView))
        ? Atlas.themeGroups().map((g, i) => ({ color: `rgb(${Atlas.groupColor(i).join(",")})`, label: g.label }))
        : [];
      return { grain, blocks: [
        isSales
          ? { channel: "sales", label: "Daily sales", rampStops: RAMP_SEQUENTIAL, domain: { min: Atlas.timeVarDomain("sales")[0], max: Atlas.timeVarDomain("sales")[1], zero: null }, unit: "₩" }
          : { channel: "temp", label: "Daily temperature", rampStops: TEMP_HEAT_RANGE, domain: { min: TEMP_DISPLAY_DOMAIN[0], max: TEMP_DISPLAY_DOMAIN[1], zero: null }, unit: "°C" },
        ...(items.length ? [{ channel: "category", title: "Sales themes", items }] : []),
      ] };
    }

    const blocks = [];

    // ---- color blocks, grouped by the variable each active layer encodes ----
    const colorGroups = new Map(); // colorKey -> [layerKey, ...]
    DATA_COLOR_LAYERS.forEach((l) => {
      if (!this.layers[l]) return;
      const key = this.layerVar[l] || this.colorBy;
      (colorGroups.get(key) || colorGroups.set(key, []).get(key)).push(l);
    });
    colorGroups.forEach((layerKeys, key) => {
      const spec = Atlas.metricSpec(key);
      if (!spec) return;
      const [min, max] = Atlas.metricDomain(this.scope, spec);
      blocks.push({
        channel: "color", kind: spec.signed ? "diverging" : "sequential",
        label: spec.label, rampStops: this._rampFor(spec),
        domain: { min, max, zero: spec.signed ? 0 : null }, layerKeys,
      });
    });

    // ---- height blocks, grouped by the height variable of the 3D layers ----
    const heightGroups = new Map();
    HEIGHT_LAYERS.forEach((l) => {
      if (!this.layers[l]) return;
      const key = this.layerHeightVar[l] || this.heightBy;
      (heightGroups.get(key) || heightGroups.set(key, []).get(key)).push(l);
    });
    heightGroups.forEach((layerKeys, key) => {
      const spec = Atlas.metricSpec(key);
      if (!spec) return;
      const [min, max] = Atlas.metricDomain(this.scope, spec);
      blocks.push({ channel: "height", label: spec.label, domain: { min, max }, layerKeys });
    });

    // ---- sector view active → the right key for how it's coloured ----
    const _ds = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
    const _grouped = _ds === "context" || _ds === "shap";
    if (this.sectorView === "buildingmix" && !_grouped) {
      // buildings coloured by the metric (e.g. RHSI) → show its colour bar, not group swatches
      const spec = Atlas.metricSpec(this.colorBy);
      if (spec) {
        const [min, max] = Atlas.metricDomain(this.scope, spec);
        blocks.push({ channel: "color", kind: spec.signed ? "diverging" : "sequential", label: spec.label, rampStops: this._rampFor(spec), domain: { min, max, zero: spec.signed ? 0 : null } });
      }
    } else if (this.sectorView === "signedcols") {
      const active = this._activeShapGroupIndexes();
      const items = active.map((i) => ({ color: `rgb(${Atlas.contextGroupColors()[i].join(",")})`, label: Atlas.contextGroupLabels()[i] }));
      blocks.push({ channel: "category", title: "Selected SHAP · ↑ raises · ↓ buffers", items });
    } else if (this.sectorView) {
      const spec = this._profileSpec();
      const items = spec.labels.map((label, i) => ({ color: `rgb(${spec.colors[i].join(",")})`, label }));
      const title = spec.kind === "features" ? "Feature groups" : spec.kind === "shap" ? "SHAP groups" : "Sales themes";
      if (items.length) blocks.push({ channel: "category", title, items });
    }

    // ---- OSM context layers key (only when on and loaded) ----
    const osmItems = [];
    if (this.layers.nature && Atlas._osm && Atlas._osm.nature)
      osmItems.push({ color: "rgb(72,150,92)", label: "Parks / green" }, { color: "rgb(66,120,200)", label: "Water" });
    if (this.layers.transit && Atlas._osm && Atlas._osm.transit)
      osmItems.push({ color: "rgb(120,200,255)", label: "Subway" }, { color: "rgb(255,200,120)", label: "Bus stop" });
    if (this.layers.amenity && Atlas._osm && Atlas._osm.amenity) {
      const AL = ["Education", "Health", "Civic", "Cooling", "Activity", "Parking"];
      AMENITY_COLORS.forEach((c, i) => osmItems.push({ color: `rgb(${c.join(",")})`, label: AL[i] }));
    }
    if (osmItems.length) blocks.push({ channel: "category", title: "OSM context", items: osmItems });

    return { grain, blocks };
  }
}
