// Time-flow bottom strip: an inline ECharts area/line chart of 2024 daily
// temperature (line) + retail sales (area) with a moving day cursor, plus the
// play/pause/speed/reset controls. Emits day changes to a callback (app.js
// wires them to the map's temporal mode). Static-only data comes from Atlas.

const Timeline = {
  chart: null,
  scope: { level: "city", guCode: null, dongCode: null },
  onScrub: null,   // (dayIndex) => {}  — user clicked a day (pauses)
  onToggle: null,  // (playing) => {}
  _series: null,
  _enabled: true,  // filled only for time-based datasets (UHUS / weather / sales)

  init({ onScrub, onToggle, onSpeed }) {
    this.onScrub = onScrub; this.onToggle = onToggle; this.onSpeed = onSpeed;
    this.chart = echarts.init(document.getElementById("tl-chart"));
    this.setScope(this.scope);

    // click anywhere on the chart → jump to that day (app pauses)
    this.chart.getZr().on("click", (e) => {
      const x = [e.offsetX, e.offsetY];
      const pt = this.chart.convertFromPixel({ xAxisIndex: 0 }, x);
      if (pt != null && this._series) {
        const i = Math.max(0, Math.min(this._series.length - 1, Math.round(pt[0])));
        if (this.onScrub) this.onScrub(i);
      }
    });

    document.getElementById("tl-play").addEventListener("click", () => {
      if (this.onToggle) this.onToggle();
    });
    document.getElementById("tl-reset").addEventListener("click", () => {
      if (this.onScrub) this.onScrub(0, true);
    });
    document.querySelectorAll("#tl-speeds button").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#tl-speeds button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        if (this.onSpeed) this.onSpeed(+b.dataset.speed);
      });
    });
    window.addEventListener("resize", () => this.chart && this.chart.resize());
  },

  // Enable/disable the time-series (dataset-gated). When off, the chart is cleared
  // and a hint is shown; scope updates are ignored until re-enabled.
  setEnabled(on) {
    if (this._enabled === on) return;
    this._enabled = on;
    if (!on && this.chart) {
      this.chart.clear();
      const ro = document.getElementById("tl-readout");
      if (ro) ro.innerHTML = "Time-series Graph for showing data trends and controlling the Map Display.";
    }
  },

  setScope(scope) {
    this.scope = scope;
    if (this._enabled === false) return; // dataset not time-based → leave cleared
    this._series = Atlas.dailySeries(scope);
    this._render(0);
  },

  _render(dayIndex) {
    const s = this._series;
    const dates = s.map((d) => d.date);
    const temp = s.map((d) => +d.temp.toFixed(1));
    const salesMax = Math.max(...s.map((d) => d.sales)) || 1;
    const sales = s.map((d) => d.sales / salesMax); // 0..1 for the dim area
    this.chart.setOption({
      animation: false,
      grid: { left: 34, right: 40, top: 10, bottom: 18 },
      xAxis: {
        type: "category", data: dates, boundaryGap: false,
        axisLabel: { color: "#8C93A3", fontSize: 8, interval: 30, formatter: (v) => v.slice(5) },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } }, axisTick: { show: false },
      },
      yAxis: [
        { type: "value", scale: true, position: "left", name: "°C", nameTextStyle: { color: "#8C93A3", fontSize: 9 },
          axisLabel: { color: "#8C93A3", fontSize: 8 }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
        { type: "value", min: 0, max: 1, position: "right", show: false },
      ],
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const i = p[0].dataIndex; const row = s[i];
          return `${row.date}<br/>Temp <b>${row.temp.toFixed(1)}°C</b><br/>Sales ₩${(row.sales / 1e8).toFixed(1)}억`;
        },
      },
      series: [
        { name: "Sales", type: "line", yAxisIndex: 1, data: sales, smooth: true, symbol: "none",
          lineStyle: { width: 0 }, areaStyle: { color: "rgba(125,167,255,0.16)" } },
        { name: "Temp", type: "line", yAxisIndex: 0, data: temp, smooth: true, symbol: "none",
          lineStyle: { color: "#FFB74D", width: 1.6 },
          markLine: {
            silent: true, symbol: "none",
            data: [{ xAxis: dayIndex }],
            lineStyle: { color: "#FFF3DD", width: 1.4, type: "solid" },
            label: { show: false },
          } },
      ],
    });
  },

  // Move just the cursor (cheap) during playback without a full re-render.
  setDay(dayIndex) {
    if (!this.chart) return;
    this.chart.setOption({
      series: [{}, { markLine: { silent: true, symbol: "none", data: [{ xAxis: dayIndex }],
        lineStyle: { color: "#FFF3DD", width: 1.4 }, label: { show: false } } }],
    });
    const row = this._series[dayIndex];
    if (row) {
      document.getElementById("tl-readout").innerHTML =
        `<b>${row.date}</b> · ${row.temp.toFixed(1)}°C · ₩${(row.sales / 1e8).toFixed(1)}억`;
    }
  },

  setPlaying(on) {
    const btn = document.getElementById("tl-play");
    btn.textContent = on ? "❚❚" : "▶";
    btn.classList.toggle("playing", on);
  },
};
