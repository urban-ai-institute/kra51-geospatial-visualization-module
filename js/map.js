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
const SEOUL_CENTER = { longitude: 126.991, latitude: 37.545, zoom: 9.75, pitch: 45, bearing: -14 };
const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Additive-blend parameters (luma.gl v9 / deck.gl v9) for bloom-like glow.
const ADDITIVE = {
  blend: true,
  blendColorSrcFactor: "src-alpha", blendColorDstFactor: "one", blendColorOperation: "add",
  blendAlphaSrcFactor: "src-alpha", blendAlphaDstFactor: "one", blendAlphaOperation: "add",
  depthTest: false,
};

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
function mixStops(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const seg = t < 0.5 ? 0 : 1, lt = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = stops[seg], b = stops[seg + 1];
  return [lerp(a[0], b[0], lt), lerp(a[1], b[1], lt), lerp(a[2], b[2], lt)];
}
// Real night-photography palette: no cyan anywhere. Data reads as literal
// "heat glow" — red (most heat-sensitive) -> amber (neutral) -> calm warm-white
// (most resilient). Red->amber naturally passes through orange mid-lerp.
const RAMP_DIVERGING = [[255, 59, 48], [255, 200, 87], [255, 246, 230]];
// dim/near-invisible (low magnitude) -> amber -> hot orange-red (high magnitude)
const RAMP_SEQUENTIAL = [[18, 20, 24], [255, 200, 87], [255, 90, 40]];
// Time-flow temperature heatmap ramp: cool "night glow" (navy -> blue -> cyan ->
// white -> soft pink -> deep pink) ending in a red-pink hot stop. Shared by the
// HeatmapLayer and the legend so the swatches always match the map.
const TEMP_HEAT_RANGE = [[36,62,130],[74,120,220],[57,230,230],[238,244,255],[228,92,145],[255,214,240]];

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
    this.heightBy = "RHSI_retail";
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
    const padLng = (maxx - minx) * 0.35, padLat = (maxy - miny) * 0.35;

    this.map = new maplibregl.Map({
      container: this.containerId, style: CARTO_DARK,
      center: [SEOUL_CENTER.longitude, SEOUL_CENTER.latitude],
      zoom: SEOUL_CENTER.zoom, pitch: SEOUL_CENTER.pitch, bearing: SEOUL_CENTER.bearing,
      antialias: true, attributionControl: false,
      maxBounds: [[minx - padLng, miny - padLat], [maxx + padLng, maxy + padLat]],
    });
    const ambient = new deck.AmbientLight({ color: [200, 214, 255], intensity: 1.1 });
    const sun = new deck.DirectionalLight({ color: [255, 255, 255], intensity: 1.4, direction: [-1, -3, -1] });
    const point = new deck.PointLight({ color: [125, 167, 255], intensity: 1.5, position: [126.99, 37.4, 90000] });
    this.lighting = new deck.LightingEffect({ ambient, sun, point });

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
  _rampFor(spec) { return spec && spec.signed ? RAMP_DIVERGING : RAMP_SEQUENTIAL; }
  // In time mode the data ramp is always the warm sequential (dim→amber→red) so
  // temperature reads as literal heat regardless of the selected static metric.
  _activeRamp(key) { return this.timeMode ? RAMP_SEQUENTIAL : this._rampFor(Atlas.metricSpec(key || this.colorBy)); }
  _sig() { return [this.scope.level, this.scope.guCode, this.scope.dongCode || "", this.grain || "", this.colorBy, this.heightBy, JSON.stringify(this.layerVar), JSON.stringify(this.layerHeightVar), JSON.stringify(this.layerRadius), this.timeMode ? "T" + this.timeVar + this.timeDayIndex : "S"].join("|"); }

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
    const dongs = this.scope.level === "city" ? Atlas.dongGeometry
      : this.scope.level === "dong" ? Atlas.dongGeometry.filter((d) => d.dong_code === this.scope.dongCode)
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
    const scale = Atlas.colorScaleFromValues(Atlas.valuesForGrain(this._grain(), this.scope, spec), spec);
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
    const colorScale = Atlas.colorScaleFromValues(colorVals, spec);
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
      pickable: true, stroked: false, filled: true, extruded: true,
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
    const [lo, hi] = Atlas.timeVarDomain("temp");
    const span = (hi - lo) || 1;
    const isCity = this.scope.level === "city";
    const dongs = isCity ? Atlas.dongGeometry : Atlas.dongGeometry.filter((d) => d.gu_code === this.scope.guCode);
    const data = dongs.map((d) => ({ position: d.centroid, w: Math.max(0, ((temps[d.gu_code] ?? lo) - lo) / span) }));
    return new deck.HeatmapLayer({
      id: "temp-heat", data, getPosition: (d) => d.position, getWeight: (d) => d.w,
      radiusPixels: (isCity ? 75 : 60) * this._rmul("heatmap"),
      intensity: 0.6, threshold: 0.05, opacity: 0.5,
      colorRange: TEMP_HEAT_RANGE,
      updateTriggers: { getWeight: [this.timeDayIndex, this.scope.guCode, this.scope.level] },
    });
  }

  // ---------- time-flow sales rings: nested rings per theme group ----------
  // Follows the map drill: whole-Seoul → one set per GU; drilled into a gu →
  // one set per DONG in that gu (finer detail), using dong-level daily sales.
  _salesGroupRings() {
    const groups = Atlas.themeGroups();
    const drilled = this.scope.level !== "city" && this.scope.guCode;
    // per-region {centroid, vals[6], yearMax(i)} for the current scope
    let regions, yearMax, minR, step;
    if (drilled) {
      const salesByDong = Atlas.groupSalesByDongInGu(this.scope.guCode, this.timeDayIndex);
      regions = Atlas.dongGeometry
        .filter((d) => d.gu_code === this.scope.guCode && salesByDong[d.dong_code])
        .map((d) => ({ position: d.centroid, vals: salesByDong[d.dong_code] }));
      yearMax = (i) => Atlas.groupYearMaxDong(i);
      minR = 60; step = 300; // dongs are close together → tighter base, wide spread
    } else {
      const salesByGu = Atlas.groupSalesByGu(this.timeDayIndex);
      regions = Atlas.guGeometry
        .filter((g) => salesByGu[g.gu_code])
        .map((g) => ({ position: g.centroid, vals: salesByGu[g.gu_code] }));
      yearMax = (i) => Atlas.groupYearMax(i);
      minR = 120; step = 620;
    }
    const data = [];
    regions.forEach((r) => {
      groups.forEach((grp, i) => {
        const norm = Math.min(1, (r.vals[i] || 0) / yearMax(i));
        if (norm <= 0.02) return;
        data.push({
          position: r.position,
          // squared curve widens the gap between low- and high-value rings
          radius: (minR + Math.pow(norm, 1.3) * step * (1 + i * 0.22)) * this._rmul("salesRings"),
          rgb: Atlas.groupColor(i),
        });
      });
    });
    const ring = (id, width, alpha) => new deck.PathLayer({
      id, data, pickable: false, parameters: ADDITIVE, widthUnits: "pixels",
      widthMinPixels: width, widthMaxPixels: width, capRounded: true, jointRounded: true,
      getPath: (d) => this._ringPath(d.position, d.radius), getWidth: width,
      getColor: (d) => [d.rgb[0], d.rgb[1], d.rgb[2], Math.round(alpha * Math.min(1.35, this.glow))],
      updateTriggers: { getPath: [this.timeDayIndex, this.radiusScale, this._sig()], getColor: [this.glow, this._sig()] },
    });
    return [ring("sales-rings-glow", 2.6, 38), ring("sales-rings-core", 1.2, 205)];
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

  // ---------- labels ----------
  _labelsLayer() {
    return new deck.TextLayer({
      id: "labels", data: this._regionData(), pickable: false,
      getPosition: (d) => d.position, getText: (d) => d.name,
      getSize: this.scope.level === "city" ? 13 : 11, sizeUnits: "pixels",
      getColor: [222, 232, 245, 220], fontFamily: "Inter, sans-serif", fontWeight: 600,
      getTextAnchor: "middle", getAlignmentBaseline: "center",
      outlineWidth: 2, outlineColor: [5, 7, 11, 220], fontSettings: { sdf: true },
      updateTriggers: { getText: [this._sig()], getSize: [this.scope.level] },
    });
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

  _beamLayers() {
    if (!this.selectedDongCode) return [];
    const geom = Atlas.dongGeomByCode.get(this.selectedDongCode);
    if (!geom) return [];
    const pulse = 0.72 + 0.28 * Math.sin(this._pulse);
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

  // ---------- composition ----------
  _staticLayers() {
    if (!this._deckReady) return [];
    const sig = [this._sig(), JSON.stringify(this.layers), this.elevationScale, this.radiusScale, this.opacity, this.glow, this.selectedDongCode].join("#");
    if (this._staticCache && this._staticCache.sig === sig) return this._staticCache.layers;
    const L = this.layers;
    const layers = [...this._pickLayer()];

    // Time mode = a fixed dual-variable composition: temperature (heatmap at
    // city / buildings on drill) + sales group rings (in _dynamicLayers). Point
    // core/halo and the metric layers are suppressed.
    if (this.timeMode) {
      // Temperature heatmap stays on at every scope; when drilled into a gu the
      // extruded buildings render on top of it (heatmap + buildings together).
      layers.push(this._tempHeatmapLayer());
      if (this.scope.level !== "city") { const b = this._buildingsLayer(); if (b) layers.push(b); }
      if (L.roads) layers.push(...this._roadsLayer());
      if (L.boundary) layers.push(...this._boundaryLayer());
      if (L.labels) layers.push(this._labelsLayer());
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
    if (L.dotField) layers.push(...this._dotsLayer());
    if (L.pointHalo) layers.push(this._pointHaloLayer());
    if (L.pointCore) layers.push(this._pointCoreLayer());
    if (L.boundary) layers.push(...this._boundaryLayer());
    if (L.labels) layers.push(this._labelsLayer());
    this._staticCache = { sig, layers };
    return layers;
  }

  _dynamicLayers() {
    const layers = [];
    if (this.timeMode) layers.push(...this._salesGroupRings());
    else if (this.layers.influence) layers.push(...this._influenceLayer());
    layers.push(...this._beamLayers());
    return layers;
  }

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
  setRadiusScale(v) { this.radiusScale = v; this.render(); }
  setOpacity(v) { this.opacity = v; this.render(); }
  setGlow(v) { this.glow = v; this.render(); }
  setAutoRotate(on) { this.autoRotate = on; }
  selectDong(code) { this.selectedDongCode = code; this._pulse = 0; this.render(); }

  // ---------- time-flow controls ----------
  setTimeMode(on) { this.timeMode = on; if (!on) this.playing = false; this.render(); }
  setTimeDay(i) { this.timeDayIndex = Math.max(0, Math.min(Atlas.timeDayCount() - 1, i | 0)); this.render(); }
  setPlaying(on) { this.playing = on; this.render(); }
  setTimeVar(v) { if (Atlas.TIME_VARS[v]) { this.timeVar = v; this.render(); } }
  // For the legend / read-out: is the map currently time-variable-driven?
  isTimeMode() { return this.timeMode; }

  legend() {
    // Time mode: absolute temperature scale (blue<25<red) + a sales group key.
    if (this.timeMode) {
      const tlo = 5, thi = 31, n = TEMP_HEAT_RANGE.length;
      const classes = TEMP_HEAT_RANGE.map((c, i) => ({
        color: `rgb(${c.join(",")})`, lo: tlo + (thi - tlo) * i / n, hi: tlo + (thi - tlo) * (i + 1) / n,
      }));
      const groups = Atlas.themeGroups().map((g, i) => ({
        color: `rgb(${Atlas.groupColor(i).join(",")})`, label: g.label,
      }));
      return {
        label: this.scope.level === "city" ? "Daily temp °C · heatmap" : "Daily temp °C · heatmap + buildings",
        heightLabel: null, groups, grain: this._grain(),
        activeLayers: Object.keys(this.layers).filter((k) => this.layers[k]), classes,
      };
    }
    const spec = this._spec("color");
    const hspec = this._spec("height");
    const ramp = this._rampFor(spec);
    const vals = Atlas.valuesForGrain(this._grain(), this.scope, spec);
    const classes = Atlas.classBreaksFromValues(vals, spec, 6).map((c) => ({
      color: `rgb(${mixStops(ramp, c.t).join(",")})`, lo: c.lo, hi: c.hi,
    }));
    const usesHeight = this.layers.choropleth || this.layers.columns || this.layers.hexbin;
    return {
      label: spec ? spec.label : this.colorBy,
      heightLabel: usesHeight && hspec ? hspec.label : null,
      grain: this._grain(),
      activeLayers: Object.keys(this.layers).filter((k) => this.layers[k]),
      classes,
    };
  }
}
