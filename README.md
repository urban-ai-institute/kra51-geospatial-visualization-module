# Seoul Data Atlas

An interactive, map-first atlas for exploring how extreme heat relates to retail activity across Seoul.

Seoul Data Atlas combines the **Urban Heat / Urban Sales (UHUS)** datasets into a dark, three-dimensional geospatial dashboard. It lets users move between Seoul, district (`gu`), and neighborhood (`dong`) views; compare hot-day and mild-day retail behavior; inspect the Retail Heat-Sensitivity Index (RHSI); explore urban-context variables; and animate daily temperature and sales through 2024.

> Status: research prototype. The current release contains one active dataset, **Retail Heat Sensitivity**, covering all 25 Seoul districts and 422 administrative dongs.

**Live site:** https://seoul-data-atlas.pages.dev/ — hosted on Cloudflare Pages, with the large building layer served from Cloudflare R2. See [Deployment](#deployment).

## Contents

- [What the dashboard answers](#what-the-dashboard-answers)
- [Core concepts](#core-concepts)
- [Features](#features)
- [Quick start](#quick-start)
- [Using the dashboard](#using-the-dashboard)
- [Technology](#technology)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Data sources and lineage](#data-sources-and-lineage)
- [Rebuilding the data](#rebuilding-the-data)
- [Map and analytical methods](#map-and-analytical-methods)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Performance notes](#performance-notes)
- [Troubleshooting](#troubleshooting)
- [Limitations and interpretation](#limitations-and-interpretation)
- [Development guide](#development-guide)

## What the dashboard answers

The atlas is designed around four related questions:

1. **Where is retail activity most sensitive to heat?**
   - Map RHSI at Seoul, gu, or dong grain.
   - Compare sensitive and resilient areas using a sign-aware color scale.
   - Rank and inspect individual neighborhoods.

2. **Which kinds of retail activity change most on hot days?**
   - Compare mean sales on hot and mild days.
   - Explore approximately 85 industry columns and six broader sales themes.
   - Identify the strongest positive and negative industry responses.

3. **Which urban characteristics are associated with the pattern?**
   - Explore land use, demographic, accessibility, mobility, housing, and economic variables.
   - Inspect SHAP-derived feature contributions.
   - View feature-versus-RHSI scatter plots, correlations, compositions, and 3D analytical charts.

4. **How do temperature and sales move through time?**
   - Play or scrub through all 366 days of 2024.
   - View temperature and normalized sales on the timeline.
   - Render daily temperature and six sales-theme rings on the map.

## Core concepts

### Spatial units

- **Seoul** — one citywide aggregate.
- **Gu** — 25 districts; the default grain at city scope.
- **Dong** — 422 administrative neighborhoods; the detailed analytical unit.
- `dong_code` is the primary spatial join key.
- `gu_code` is the district aggregation key.
- Geometry is stored as EPSG:4326 longitude/latitude coordinates.

### Temporal units

- The analytical period is **2024-01-01 through 2024-12-31**.
- Daily weather and sales contain **366 days** because 2024 is a leap year.
- Static RHSI and context metrics summarize or explain the daily observations.

### RHSI

The Retail Heat-Sensitivity Index is the project's principal analytical output:

```text
RHSI_retail = log(mean retail sales on hot days / mean retail sales on mild days)
```

Interpretation:

- `RHSI < 0` — average retail sales were lower on hot days than on mild reference days.
- `RHSI = 0` — average hot-day and mild-day sales were equal.
- `RHSI > 0` — average retail sales were higher on hot days.
- The dashboard may display an approximate percentage transformation:

```text
percentage change ≈ (exp(RHSI) - 1) × 100
```

RHSI is an association measure, not a causal estimate. See [Limitations and interpretation](#limitations-and-interpretation).

### Hot and mild days

The dataset metadata defines:

- **Hot day** — maximum apparent temperature at or above 33°C.
- **Mild day** — apparent temperature from 18°C to 26°C, with no precipitation and excluding public holidays.

These classifications originate in the UHUS input data. The browser consumes their precomputed summaries rather than recalculating day classes.

## Features

### Multi-layer 3D map

The primary visualization combines MapLibre GL and deck.gl:

- Administrative boundaries
- OSM arterial and mid-tier road glow
- Optional OSM building extrusions
- Point cores and additive halos
- Value/influence rings
- Heatmap
- Choropleth
- 3D columns
- Hexbin aggregation
- Dot-density field
- Region labels
- Invisible picking geometry for reliable hover and click interaction

Three presets provide useful starting combinations:

- **Night City** — roads, boundaries, buildings, point cores, and halos
- **Heat Field** — roads, boundaries, heatmap, and influence rings
- **Data Points** — roads, boundaries, points, rings, and labels

The map also exposes elevation, radius, opacity, and glow controls. Optional auto-rotation is available for presentation use.

### Spatial drill-down

- Click a gu at city scope to drill into its dongs.
- Double-click a location to select the dong under the cursor.
- Use the Gu and Dong selectors for direct navigation.
- Use the breadcrumb to return to a broader scope.
- Select a target area and data granularity independently.

The map's camera scope and data grain are intentionally decoupled. A user can, for example, remain at a broad camera view while changing whether the data is aggregated as Seoul, gu, or dong.

### Variable-driven rendering

Color and height can be assigned independently from:

- RHSI
- Urban-context metrics
- Top-volume industry sensitivity metrics

Each map layer can follow the global variable or use a layer-specific override. Signed metrics use a diverging palette; unsigned metrics use a sequential palette.

### Animated time-flow

The bottom timeline contains:

- Play/pause
- 1×, 2×, and 4× speed
- Click-to-scrub
- Reset to the static metric view
- Daily temperature line
- Normalized daily retail-sales area
- A moving day cursor and date/value readout

At 1× speed, playback advances at roughly six days per second and completes the year in about one minute.

During time mode:

- Daily temperature drives the heat field.
- Sales are shown as six themed rings.
- City scope uses gu-level daily group totals.
- Drilled gu scope uses dong-level daily group totals.

### Insights and analytical charts

The fixed Insights column and detail views include:

- RHSI KPI summary
- RHSI distribution histogram
- Hot/mild day counts
- Most heat-sensitive retail industry
- Urban-feature importance using mean absolute SHAP contribution
- Signed drivers for a selected dong
- Industry winners/losers
- Hot-day versus mild-day bars
- Per-dong industry rankings
- Feature-versus-RHSI scatter plots
- Gu temperature and sales time series
- Land-use and retail-composition donuts
- 3D feature scatter plots
- Binned RHSI response surface
- Urban-feature correlation network

Several charts double as navigation: clicking a feature or industry bar opens its detail view.

### Dataset lineage panel

The right-side Detail panel organizes the project as:

```text
Input datasets
  → derived feature datasets
  → computed index datasets
  → dashboard and map views
```

It documents variables, definitions, formulas, units, sources, join keys, and relationships. Selecting a dataset or variable can update the active map metric or enter time mode.

### Recommended analysis sets

The Recommend Set tab presents three prepared workflows:

- Weather × Sales Compare
- RHSI × Urban Context Map
- Sector Group × RHSI Profile

These are interface presets and analytical guidance, not separate persisted datasets.

## Quick start

### Requirements

To view the checked-in dashboard:

- A modern desktop browser with WebGL support
- Internet access for CDN libraries, Google Fonts, and the CARTO basemap
- Any local static HTTP server

No Node.js installation or frontend build step is required.

### Run locally with Python

From the repository root:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

On Windows, `py` can be used if `python` is not on `PATH`:

```powershell
py -m http.server 8000
```

### Why an HTTP server is required

Do not open `index.html` directly with a `file://` URL. The application loads JSON through `fetch()`, and browsers normally block or restrict those requests for local files. Serving the repository over HTTP gives the data files valid same-origin URLs.

## Using the dashboard

1. Open the local URL.
2. Select **Explore The Atlas** on the landing page.
3. Hover over a left navigation item to preview its floating panel.
4. Click a navigation item to pin or unpin that panel.
5. Open **Map** for layers, presets, and visual controls.
6. Click a district to drill from Seoul into gu scope.
7. Click a dong, double-click the map, or use the selectors to inspect a neighborhood.
8. Choose **Color by Variable** and **Height by Variable** to change the map encoding.
9. Use the timeline to enter daily time-flow mode.
10. Select **Reset** in the toolbar or timeline to return to the static analytical view.
11. Use **Library** and the right-side Detail panel to inspect lineage and map a specific dataset.
12. Use the Insights column to read the selected scope's statistical context.

### Layer controls

Default active layers:

- Boundary
- Road Glow
- Point Core
- Point Halo

Default inactive layers:

- Buildings
- Value Rings
- Heatmap
- Choropleth
- 3D Columns
- Hexbin
- Dot Field
- Labels

Buildings are hidden at low zoom because rendering the full citywide collection is expensive.

### Reading the colors

For signed metrics such as RHSI:

- Red represents the negative, more heat-sensitive side.
- Amber is the visual midpoint around zero.
- Warm white represents the positive, more resilient side.

Negative and non-negative values are ranked separately. This sign-aware quantile approach preserves the meaning of zero while preventing a skewed distribution from collapsing most features into nearly identical midpoint colors.

For unsigned metrics, the map uses a sequential low-to-high ramp. Time-flow temperature uses a separate cool-to-hot range shared by the map and legend.

## Technology

### Browser application

- HTML5
- CSS3
- Vanilla JavaScript
- MapLibre GL JS 4
- deck.gl 9
- Apache ECharts 5
- ECharts GL 2

### Data preparation

- Python 3
- pandas
- Shapely
- Requests

### External runtime services

The browser loads the following external resources:

- MapLibre GL from `unpkg.com`
- deck.gl from `unpkg.com`
- ECharts from `jsdelivr.net`
- ECharts GL from `unpkg.com`
- Google Fonts
- CARTO Dark Matter map style and its referenced tiles

The analytical JSON is local and static. No application backend or database is used.

## Architecture

The application uses global browser modules loaded in dependency order:

```text
index.html
  ├─ js/data.js      Atlas data store, lookup helpers, metrics, statistics
  ├─ js/map.js       MapLibre/deck.gl map and layer controller
  ├─ js/charts.js    ECharts renderers and Insights content
  ├─ js/timeline.js  Timeline chart and playback UI adapter
  ├─ js/panels.js    Dataset lineage, metadata, tags, recommendations
  └─ js/app.js       Application state, initialization, events, coordination
```

### Initialization flow

The dashboard is initialized only after the user leaves the landing page:

```text
Explore The Atlas
  → initDashboard()
  → Atlas.load()
  → construct AtlasMap3D
  → bind map, controls, timeline, panels, selectors, footer, and insights
```

`Atlas.load()` fetches all runtime JSON files concurrently with `Promise.all`. Consequently, every listed runtime file must exist and return valid JSON; one missing file prevents initialization.

### State and coordination

`js/app.js` owns the primary application state:

```js
{
  datasetId: "retail-heat-sensitivity",
  scope: {
    level: "city",
    guCode: null,
    dongCode: null
  }
}
```

Scope changes are propagated to:

- The map
- Timeline
- Insights
- Breadcrumb
- Gu/dong selectors
- Legend
- Footer metadata
- Right-side panels where relevant

Time playback has a separate animation state with the active day index, speed, request-animation-frame handle, and elapsed-time accumulator.

### Data layer

`js/data.js` exposes the global `Atlas` object. It:

- Loads static JSON.
- Builds `Map` lookups by gu and dong code.
- Flattens deterministic dot-density points.
- Aggregates metrics by scope and grain.
- Produces time-series values.
- Computes histograms, rankings, correlations, SHAP summaries, composition, and chart inputs.
- Defines available map metrics and labels.
- Generates sign-aware quantile scales and matching legend classes.

### Map layer

`js/map.js` exposes `AtlasMap3D`. It:

- Creates a MapLibre map constrained to Seoul.
- overlays a deck.gl `MapboxOverlay`.
- Builds static and dynamic deck.gl layers.
- Manages camera scope, grain, selected variables, layer visibility, styling, and time mode.
- Caches geometry and point transformations where possible.
- Emits region hover and click callbacks to the application.

deck.gl is deliberately overlaid rather than interleaved with MapLibre. This avoids depth-buffer and tile-pipeline artifacts in large heatmap and additive halo layers while preserving self-occlusion for deck.gl extrusions.

### Presentation layers

- `js/charts.js` contains reusable ECharts renderers and the Insights presentation.
- `js/timeline.js` isolates timeline rendering and emits user actions through callbacks.
- `js/panels.js` stores dataset/variable metadata and controls the lineage/detail/recommendation interface.
- `css/styles.css` defines the full-screen dark GIS layout, panels, controls, charts, and limited width-based adaptations.

## Data model

The repository contains 15 files under `data/`. The browser eagerly loads 14 of them at startup; `buildings_fetch_progress.json` is pipeline state and is not a runtime dependency.

### Administrative geometry

- `meta.json`
  - Seoul bounding box as `[minLongitude, minLatitude, maxLongitude, maxLatitude]`.

- `gu_geometry.json`
  - 25 simplified gu records.
  - Core fields: `gu_code`, `gu_name`, `centroid`, `geometry`.

- `dong_geometry.json`
  - 422 simplified dong records.
  - Core fields: `gu_code`, `gu_name`, `dong_code`, `dong_name`, `centroid`, `geometry`.

- `dong_points.json`
  - Deterministically generated in-polygon sample points keyed by `dong_code`.
  - Used for the illustrative dot-density layer.
  - Positions are synthetic and must not be interpreted as observed events or addresses.

### Metrics and summaries

- `dong_metrics.json`
  - One record per dong.
  - Contains RHSI, rank, urban features, heat-day counts, and prefixed SHAP values.
  - The preprocessing script asserts exactly 422 unique dongs.

- `gu_metrics.json`
  - Gu-level mean RHSI, dong count, and RHSI rank.
  - Other gu-level metrics are aggregated client-side when needed.

- `dong_sales_summary.json`
  - Per-dong mean hot/mild sales for total retail, the top 20 industries by total volume, and an `other` group.

- `industry_catalog.json`
  - Identifies the top-20 industries included in per-dong hot/mild detail.

- `industry_stats.json`
  - Hot mean, mild mean, sensitivity, and total volume for all approximately 84 industries.
  - Includes one city block and one block for each gu.

### Time series

- `gu_daily_timeseries.json`
  - Per-gu daily maximum temperature mean and total retail sales.
  - 25 gu series × 366 days.

- `gu_group_daily.json`
  - Per-gu daily sales totals for six theme groups.
  - Includes group metadata and per-group annual maxima for normalization.

- `dong_group_daily.json`
  - Compact per-dong daily arrays for the same six theme groups.
  - Dates are omitted because all records share the date axis from the gu time series.

The six sales themes are:

1. Food & Beverage
2. Retail & Daily Goods
3. Fashion / Beauty
4. Health / Education / Culture
5. Leisure / Mobility / Lodging
6. Housing / Professional / Local

### Static city fabric

- `roads.json`
  - Simplified OpenStreetMap paths grouped into `arterial` and `mid` tiers.
  - Minor and residential roads are intentionally excluded.

- `buildings.json`
  - GeoJSON FeatureCollection of OSM building footprints.
  - Building properties include display height and, after tagging, gu/dong codes.
  - The checked-in file is approximately 61 MB and contains a very large polygon collection.

- `buildings_fetch_progress.json`
  - Checkpoint of completed gu names for resumable building retrieval.
  - This is pipeline state rather than analytical data and is not loaded by the browser.

## Data sources and lineage

The frontend metadata attributes the analytical inputs to:

- Seoul AI Foundation
- Korea Meteorological Administration (KMA)
- Seoul Open Data Portal / Seoul Open Data Plaza
- Seoul Metro
- EGIS
- Ministry of Land, Infrastructure and Transport (MOLIT)
- OpenStreetMap contributors, accessed through the Overpass API, for roads and buildings

The raw UHUS source files are not included in this repository. Preprocessing expects a sibling directory:

```text
parent-directory/
├─ seoul-data-atlas/
└─ UHUS/
   ├─ Administrative_Dong_Geometry.geojson
   ├─ RHSI.csv
   ├─ Urban_Features.csv
   ├─ shap_result.csv
   ├─ Daily_Weather.csv
   └─ sales.csv
```

High-level lineage:

```text
Administrative geometry
  → simplified dong and dissolved gu geometry
  → centroids, bounding box, synthetic density points

RHSI + urban features + SHAP
  → joined dong metrics
  → gu RHSI aggregates

Daily weather + daily industry sales
  → hot/mild sales summaries
  → industry statistics
  → gu daily temperature/sales series

Daily industry sales
  → six theme-group totals
  → gu and dong daily group series

OpenStreetMap
  → simplified roads and building footprints
  → building gu/dong spatial tags
```

## Rebuilding the data

> **Not committed to git.** The large / regenerable OpenStreetMap outputs are `.gitignore`d and are **not**
> in the repository: `data/buildings.json`, `data/nature.json`, `data/transit.json`, `data/amenity.json`
> (plus `*_fetch_progress.json`). After a fresh clone, regenerate them with the `fetch_osm_*.py` scripts
> below (needs network / Overpass). Until then the page still runs — the base map, roads, and all
> data-driven layers work — but the 3D building extrusion and the Nature / Transit / Amenities overlay
> layers render empty. The committed core JSON (`data/roads.json` and the `prepare_data` outputs) require
> the private `UHUS/*.csv` source files, which are also not in the repo.

### Install Python dependencies

No lock file is currently provided. Install the libraries imported by the scripts:

```bash
python -m pip install pandas shapely requests
```

For reproducible production builds, add and maintain a pinned requirements file before automating this pipeline.

### Recommended pipeline order

Run commands from the repository root.

#### 1. Build analytical and administrative JSON

```bash
python scripts/prepare_data.py
```

This script:

- Simplifies 422 dong polygons.
- Dissolves dongs into 25 gu polygons.
- Calculates centroids and the Seoul bounding box.
- Samples 70 reproducible points inside each dong.
- Joins RHSI, urban features, and SHAP records by `dong_code`.
- Deduplicates SHAP rows and left-joins them so all RHSI dongs survive.
- Produces gu-level RHSI means.
- Joins sales and weather by `date` and `dong_code`.
- Selects the 20 industries with highest total volume for per-dong detail.
- Calculates city/gu industry hot-versus-mild statistics.
- Produces gu daily temperature and sales time series.

The script uses a fixed random seed (`42`) for reproducible synthetic point locations.

#### 2. Build six-theme daily sales series

```bash
python scripts/prepare_sales_groups.py
```

This reads `UHUS/sales.csv`, maps industry amount columns into six themes, and writes:

- `data/gu_group_daily.json`
- `data/dong_group_daily.json`

Any sales industry missing from the hard-coded theme map is reported and ignored.

#### 3. Fetch road geometry

```bash
python scripts/fetch_osm_roads.py
```

This queries the public Overpass API using the generated Seoul bounding box. It fetches arterial and mid-tier roads, simplifies them, and writes `data/roads.json`.

Be considerate of public Overpass infrastructure. Avoid repeated automated fetches, and expect network failures or throttling.

#### 4. Fetch building footprints

```bash
python scripts/fetch_osm_buildings.py
```

The building fetch runs per gu because a citywide building query is too large for public Overpass instances. It:

- Rotates between two public endpoints.
- Retries throttled or timed-out requests.
- Sleeps between gu requests.
- Saves after each completed gu.
- Records progress in `data/buildings_fetch_progress.json`.
- Uses explicit OSM height, building levels × 3 m, or a deterministic type-based estimate.

Resume an interrupted run with:

```bash
python scripts/fetch_osm_buildings.py --resume
```

#### 5. Tag buildings spatially

```bash
python scripts/tag_buildings.py
```

This uses Shapely spatial indexes to assign gu and dong codes to each building's representative point. It rewrites `data/buildings.json` in place. Tagging enables the browser to restrict buildings to a drilled region instead of rendering the entire city collection.

#### 6. Fetch the Urban Environment (OSM) overlay layers

```bash
python scripts/fetch_osm_transit.py    # subway lines + stations, bus stops  -> data/transit.json
python scripts/fetch_osm_amenity.py    # curated facilities (education/health/civic/…) -> data/amenity.json
python scripts/fetch_osm_nature.py     # parks/forest (green) + water polygons -> data/nature.json
```

Like the building fetch, these run per gu against public Overpass with endpoint rotation, retries, and
polite sleeps. `fetch_osm_nature.py` supports `--resume`. They power the optional **URBAN ENV (OSM)**
map toggles (Nature · Transit · Amenities), which lazy-load on first enable and are off by default.

### Pipeline validation checklist

After rebuilding:

- Confirm `prepare_data.py` reports 422 unique dongs.
- Confirm geometry and metric codes are strings, not numbers.
- Confirm every file loaded in `Atlas.load()` exists.
- Confirm each gu time series contains 366 ordered dates.
- Confirm gu and dong group arrays align to the same shared date order.
- Confirm the building fetch completed all 25 gu before tagging.
- Start a local server and check the browser console for failed fetches or WebGL errors.
- Verify Seoul, gu, and dong drill-down.
- Verify static metrics and timeline playback separately.

## Map and analytical methods

### Spatial simplification

Preprocessing simplifies:

- Dong boundaries at `0.00006` degrees, approximately 6–7 m at Seoul's latitude.
- Gu boundaries at `0.00012` degrees.
- Roads at `0.00006` degrees.
- Buildings at `0.00004` degrees, approximately 4–5 m.

Coordinates are generally rounded to five decimal places to reduce static payload size.

### Aggregation

- City map scope normally renders 25 gu aggregates.
- Drilled scope renders dongs within the selected gu.
- A selected dong can be isolated for detailed rendering.
- RHSI has precomputed gu means.
- Most other gu metrics are computed in the browser as means of matching dong values.
- City aggregate values are means of gu aggregates.

These are visualization aggregates and are not necessarily population-, area-, or transaction-weighted.

### Industry sensitivity

For an industry:

```text
sensitivity = (mean hot-day sales - mean mild-day sales) / mean mild-day sales
```

Industry ranking first restricts candidates to meaningful-volume industries and then selects the strongest positive and negative responses.

### SHAP summaries

- Scope-level importance is mean absolute SHAP contribution.
- Scope-level direction is mean signed contribution.
- Dong detail ranks signed contributions by absolute magnitude.
- A missing SHAP value is treated as zero client-side.

The source SHAP file is documented in preprocessing as missing one dong and duplicating another. The pipeline deduplicates the duplicate and preserves the missing dong with null contributions.

### Correlation

The dashboard calculates Pearson correlations in the browser:

- Urban feature versus RHSI for the top-characteristics summary
- Pairwise urban-feature correlations for the network

Sales-share output features are excluded from the “urban characteristics” RHSI correlation so that section focuses on built-environment and context variables.

Correlation does not establish causation and can reflect spatial structure, confounding, scale, or shared construction.

### Dot-density layer

The dot field uses uniformly sampled synthetic points inside each dong. A deterministic per-point rank controls visibility against the normalized parent metric. More visible points indicate a higher aggregate magnitude.

The points are an encoding of area-level data; they do not represent individual people, stores, transactions, or observed locations.

### Building heights

Building height is selected in this order:

1. OSM `height`
2. OSM `building:levels` or `levels`, multiplied by 3 m
3. Deterministic estimate based on building type and OSM ID

Estimated extrusions are visual context and should not be treated as an authoritative 3D building model.

## Project structure

```text
seoul-data-atlas/
├─ index.html
├─ README.md
├─ css/
│  └─ styles.css
├─ js/
│  ├─ app.js
│  ├─ charts.js
│  ├─ data.js
│  ├─ map.js
│  ├─ panels.js
│  └─ timeline.js
├─ data/
│  ├─ buildings.json
│  ├─ buildings_fetch_progress.json
│  ├─ dong_geometry.json
│  ├─ dong_group_daily.json
│  ├─ dong_metrics.json
│  ├─ dong_points.json
│  ├─ dong_sales_summary.json
│  ├─ gu_daily_timeseries.json
│  ├─ gu_geometry.json
│  ├─ gu_group_daily.json
│  ├─ gu_metrics.json
│  ├─ industry_catalog.json
│  ├─ industry_stats.json
│  ├─ meta.json
│  └─ roads.json
└─ scripts/
   ├─ fetch_osm_buildings.py
   ├─ fetch_osm_roads.py
   ├─ prepare_data.py
   ├─ prepare_sales_groups.py
   └─ tag_buildings.py
```

## Deployment

The application can be hosted on any static web server that preserves the repository's relative paths, including GitHub Pages, Netlify, Cloudflare Pages, S3-compatible object storage, or a conventional web server.

### This deployment — Cloudflare Pages + R2

The live site (https://seoul-data-atlas.pages.dev/) is deployed as follows. The static
app ships from the Git repo via Cloudflare Pages; the ~61 MB `buildings.json` — which
exceeds Pages' 25 MiB per-file limit and is `.gitignore`d — is served separately from a
Cloudflare R2 bucket.

**1. Cloudflare Pages (the app)**

- Cloudflare dashboard → Workers & Pages → **Pages → Connect to Git** → select this repo.
  (If the dashboard hides the Pages tab, create it from the CLI: `npx wrangler pages deploy . --project-name=seoul-data-atlas`.)
- Build settings for this no-build static site:
  - Framework preset: **None**
  - Build command: *(empty, or `exit 0`)*
  - Build output directory: **`/`** (repo root — `index.html` lives here)
- Every push to `main` redeploys automatically. Use **only one** Git-connected
  project (Pages) to avoid double deploys; don't also connect a Worker.

**2. Cloudflare R2 (`buildings.json`)**

- Create a bucket and upload `data/buildings.json` to it (this repo uses the key
  `osm/buildings.json`).
- Bucket → Settings → enable the **Public Development URL** (or attach a custom domain).
- Point the app at it in [`index.html`](index.html) — already set here:
  ```html
  <script>
    window.ATLAS_BUILDINGS_URL = "https://pub-<hash>.r2.dev/osm/buildings.json";
  </script>
  ```
  `Atlas.ensureBuildings()` reads `window.ATLAS_BUILDINGS_URL` and falls back to
  `data/buildings.json` when it is unset.
- The app fetches R2 cross-origin, so set a **CORS policy** on the bucket
  (Settings → CORS Policy). Origins must match the browser `Origin` header exactly —
  **no trailing slash, no path**:
  ```json
  [
    {
      "AllowedOrigins": [
        "https://seoul-data-atlas.pages.dev",
        "http://localhost:5173"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["Content-Length"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
  `ExposeHeaders: Content-Length` lets the download-progress readout show the total size.

**Verify:** open the site, drill into a gu/dong, and enable the **Buildings** layer.
3D extrusions appearing = R2 + CORS are wired correctly. If they don't, check the browser
console: a CORS error means the origin string doesn't match (trailing slash / wrong port);
a 404 means the `ATLAS_BUILDINGS_URL` path is wrong.

### Static-host requirements

- Serve `index.html`, `css/`, `js/`, and `data/` together.
- Preserve filename case.
- Serve JSON with a valid JSON or generic binary MIME type.
- Allow access to the external CDNs and CARTO tile endpoints.
- Prefer compression for JSON, JavaScript, and CSS.
- Do not rewrite JSON requests to `index.html`.

### Large-file warning

`data/buildings.json` is approximately **64 MB** and is therefore **`.gitignore`d** (regenerate it with
`scripts/fetch_osm_buildings.py`; see [Rebuilding the data](#rebuilding-the-data)):

- GitHub warns for files larger than 50 MB.
- GitHub rejects regular Git blobs larger than 100 MB.
- Git history stores every committed version of the file.
- A static host may impose bandwidth, build, or asset-size limits.

Practical options:

1. Keep the file in Git for the simplest deployment, but avoid frequent rewrites.
2. Store it with Git LFS, provided the chosen host supports LFS-backed deployment correctly.
3. Publish it as a versioned external asset and update `Atlas.load()`.
4. Split buildings by gu and load them on demand.
5. Convert the data to vector tiles or a more compact binary geospatial format.

`Atlas.load()` now treats `buildings.json` as **optional**: a missing file falls back to `null`, so a fresh
clone boots normally and simply renders no building extrusion (the building-mix representation falls back to
stacked columns) until you regenerate the file.

### Cache guidance

For production:

- Use long-lived immutable caching for versioned data assets.
- Use shorter caching for `index.html`.
- Enable Brotli or gzip compression.
- Consider content-hashed filenames if assets change regularly.

## Performance notes

The first dashboard initialization eagerly fetches roughly 76 MB of JSON before transfer compression. The largest client cost is downloading, parsing, retaining, filtering, and drawing `buildings.json`; `dong_group_daily.json` adds another roughly 9.3 MB.

Existing safeguards include:

- Buildings disabled by default.
- Buildings hidden below zoom 11.25.
- Spatial building tags for drilled-region filtering.
- Simplified and rounded geometry.
- Mid-tier roads disclosed only after drilling.
- Static/dynamic map-layer separation.
- Cached transformed features and points.
- Cheap timeline cursor updates separate from full chart rendering.
- Non-pickable glow layers plus one dedicated picking layer.

For further optimization:

- Split building data by gu.
- Fetch buildings only when the layer is enabled.
- Use vector tiles with server/client viewport culling.
- Move static geometry to FlatGeobuf, PMTiles, or another streamable format.
- Dispose of unused ECharts instances when replacing large view trees.
- Add loading progress and recoverable optional-asset errors.
- Pin CDN versions rather than using broad major-version URLs.

## Troubleshooting

### The landing page works, but the dashboard never appears

Open browser developer tools and inspect the Console and Network panels. Because all JSON files load through one `Promise.all`, a single 404 or malformed JSON response stops initialization.

Verify:

- You used `http://localhost...`, not `file://...`.
- The server was started from the repository root.
- All 14 browser-loaded files listed under [Data model](#data-model) exist.
- Filename case matches exactly.

### `Failed to fetch` or CORS errors

- Run a local HTTP server.
- Check whether a privacy extension or corporate network is blocking CDNs, Google Fonts, CARTO, or map tiles.
- Check the browser's mixed-content policy if embedding under HTTPS.

### The base map is blank

- Confirm internet access to CARTO's basemap style and tiles.
- Check for WebGL support and hardware acceleration.
- Inspect the Console for MapLibre errors.

Local analytical overlays may still require the MapLibre load event before deck.gl is initialized.

### The map is slow or the browser runs out of memory

- Leave Buildings disabled at city scale.
- Drill into a gu before enabling buildings.
- Close other graphics-heavy tabs.
- Confirm hardware acceleration is enabled.
- Consider splitting or externally tiling `buildings.json`.

### Python preprocessing cannot find files

The scripts expect `../UHUS` relative to this repository. Check the sibling-folder layout and the exact source filenames.

### Overpass returns 429 or 504

These indicate throttling or timeout from a public service.

- Wait before retrying.
- Use `--resume` for buildings.
- Avoid parallel fetches against public endpoints.
- Consider operating a private Overpass instance for repeatable automated builds.

### Building fetch completes, but buildings disappear after drilling

Run:

```bash
python scripts/tag_buildings.py
```

The map relies on gu/dong tags to filter the large collection by scope.

### Timeline values look misaligned

Rebuild `gu_daily_timeseries.json`, `gu_group_daily.json`, and `dong_group_daily.json` from the same source revision. Their arrays depend on a common chronological 366-day axis.

## Limitations and interpretation

- This is a research and communication prototype, not an operational decision system.
- RHSI describes observed hot-versus-mild sales differences; it does not by itself identify heat as the cause.
- Gu and city displays may use simple means rather than transaction-, population-, or area-weighted estimates.
- Card transactions do not necessarily represent all economic activity.
- Industry coverage and source methodology should be checked before policy or commercial use.
- Per-dong hot/mild detail is limited to the 20 highest-volume industries.
- Missing SHAP contribution data is displayed as zero after the preprocessing left join.
- The dot-density positions are synthetic.
- OSM completeness and tagging vary spatially.
- Many building heights are estimated.
- Roads exclude minor and residential tiers.
- Correlations and response surfaces are exploratory.
- The binned 3D surface fills empty cells with the global mean to maintain a continuous surface; those cells are not direct observations.
- The current CSS primarily targets a wide desktop workspace. Smaller widths progressively hide footer metadata, but the full three-column analytical layout is not a complete mobile design.
- The visible Compare map-mode control is currently a placeholder; it does not implement a split-map comparison.
- Keyboard and screen-reader coverage is partial. Most controls are native buttons/selects, but richer map and chart interactions require additional accessibility work.
- The application depends on third-party runtime CDNs and map services.
- No automated test suite, package manifest, dependency lock, or CI workflow is currently included.
- No software or data license is included in this repository. Add explicit licenses and required source attributions before public reuse or distribution.

## Development guide

### Frontend changes

There is no compile step. Edit HTML, CSS, or JavaScript, refresh the browser, and inspect the developer console.

Useful ownership boundaries:

- Add or transform data helpers in `js/data.js`.
- Add deck.gl layers or map behavior in `js/map.js`.
- Add ECharts figures in `js/charts.js`.
- Add timeline behavior in `js/timeline.js`.
- Add lineage and dataset metadata in `js/panels.js`.
- Connect cross-component behavior in `js/app.js`.
- Add layout and visual styling in `css/styles.css`.

### Adding a map metric

For a new dong-level metric:

1. Include the field in `data/dong_metrics.json` or expose a calculated value.
2. Add its key and user-facing label to the appropriate metadata in `js/data.js`.
3. Ensure `Atlas.availableMapMetrics()` returns a metric specification.
4. Mark whether it is signed so the correct color semantics are used.
5. Add definition, formula, unit, and source metadata in `js/panels.js`.
6. Test color, height, legend, tooltip, Seoul/gu/dong aggregation, and missing values.

### Adding a dataset

The header currently includes one disabled placeholder. A functional dataset requires more than adding a dataset pill:

1. Define dataset metadata in `js/data.js`.
2. Add runtime data loading and validation.
3. Define supported spatial and temporal scopes.
4. Add variable metadata and lineage in `js/panels.js`.
5. Decide which map layers and charts can consume it.
6. Update variable dropdown filtering in `js/app.js`.
7. Gate or adapt the timeline.
8. Update the footer, legend, tooltip, and Insights content.
9. Document data provenance and limitations.

### Suggested repository hardening

Before treating the prototype as a maintained public project:

- Add `.gitignore`.
- Add an explicit software license.
- Document data licensing and OSM attribution requirements.
- Add `requirements.txt` or `pyproject.toml` with pinned Python dependencies.
- Pin exact frontend CDN versions or vendor dependencies.
- Add a formatter/linter configuration.
- Add unit tests for data helpers and metric math.
- Add smoke tests for initialization and navigation.
- Validate generated JSON schemas in CI.
- Make heavy static layers optional and lazy-loaded.
- Add visible loading and error states.
- Improve keyboard, screen-reader, reduced-motion, and mobile support.

## Attribution

Analytical-source names shown in the dashboard include Seoul AI Foundation, KMA, Seoul Open Data Portal, Seoul Metro, EGIS, and MOLIT. Road and building geometry is derived from OpenStreetMap through the Overpass API.

Before publishing the dashboard, verify the exact attribution text and license obligations for every upstream dataset and ensure attribution is visible in the deployed interface, not only in this README.
