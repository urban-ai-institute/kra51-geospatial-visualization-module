// ── Representation config ───────────────────────────────────────────────────
// HOW the map can draw — independent of any dataset. One place for every design
// the engine knows about, so adding a representation is a single-file change.
//
// Previously REP_TYPES lived in panels.js as a global while REP_ICON / CHANNELS /
// DESIGN_REPS were module-private inside layerset/panel.js's IIFE. That split is
// why adding one representation meant editing two files and forgetting one.
//
// Loaded before variables.js / dataset.js — see index.html.

// A representation = a recipe for the map state: which layers, whether it's a sector
// glyph, time-flow, or 2D, plus slider tuning. Colour/height come from the dataset's
// own metric (DATASETS_META[id].map.key). `Panels.applyRepresentation` applies one.
const REP_TYPES = {
  choropleth: { label: "Choropleth",   layers: ["roads", "choropleth", "labels"], sliders: { elevation: 0.12, radius: 1.0, opacity: 1.0, glow: 1.0 } },
  // Purpose-built flat 2D map: top-down (pitch 0), no glow, elevation locked flat.
  // Separate from `choropleth` so the 3D view can rise while this stays a clean 2D
  // comparison surface. Sales `flat` is static (does NOT enter time playback).
  flat:       { label: "Flat 2D",      layers: ["roads", "choropleth", "labels"], mode: "2d", sliders: { elevation: 0, radius: 1.0, opacity: 1.0, glow: 0.9 } },
  bars:       { label: "3D bars",      layers: ["boundary", "roads", "columns", "labels"], height: true, sliders: { elevation: 0.12, radius: 1.0, opacity: 0.95, glow: 1.0 } },
  points:     { label: "Glow points",  layers: ["boundary", "roads", "pointCore", "pointHalo", "labels"], sliders: { elevation: 0.12, radius: 1.0, opacity: 0.9, glow: 1.4 } },
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

// One glyph per representation — the Layer-Set rail is only 172px wide, so a row
// shows the icon alone and the full name appears in the picker it opens.
const REP_ICON = {
  choropleth: "▦", flat: "▭", bars: "▮", points: "⊙",
  rings: "◎", radial: "✳", columns: "▥", dominant: "◧",
  signedcols: "⇅", divided: "◨", buildingmix: "◱",
  heatfield: "☀", compare: "⊗", heatmap: "◍", hexbin: "⬡",
  dotfield: "⋰", valuerings: "◉", dashboard: "▩", boundary: "▫",
};

// Every design a single variable can take (each maps to a REP_TYPES entry).
// Shared by the Single and Total structures of every dataset.
const DESIGN_REPS = ["choropleth", "flat", "bars", "points", "heatmap", "hexbin", "dotfield", "valuerings"];

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

// Colour themes — keys match map.js COLOR_SCHEMES; css gradient for the swatch.
const THEMES = [
  { key: "default", label: "Amber", grad: "linear-gradient(90deg,#3a2a10,#ffc857,#ff5a28)" },
  { key: "blue", label: "Blue", grad: "linear-gradient(90deg,#0e121c,#466eb4,#7db4ff)" },
  { key: "teal", label: "Teal", grad: "linear-gradient(90deg,#0c1618,#289c8c,#50e6c8)" },
  { key: "viridis", label: "Viridis", grad: "linear-gradient(90deg,#281e46,#2da096,#f0e25c)" },
  { key: "magenta", label: "Magenta", grad: "linear-gradient(90deg,#120e18,#b43c96,#ff6ec8)" },
];

// Elevation slider curve. Representations tune elevation between ~0.12 and 1.4, and
// the low end is where Seoul actually reads, so a linear track is unusable there.
// position 0..1 -> value = MAX * position^GAMMA (and back), so ~half the travel
// covers 0..0.2 instead of a few pixels.
const ELEV_MAX = 1.6, ELEV_GAMMA = 3;
const ELEV_VAL = (pos) => +(ELEV_MAX * Math.pow(Math.max(0, Math.min(1, +pos || 0)), ELEV_GAMMA)).toFixed(3);
const ELEV_POS = (val) => Math.pow(Math.max(0, Math.min(1, (+val || 0) / ELEV_MAX)), 1 / ELEV_GAMMA).toFixed(4);
