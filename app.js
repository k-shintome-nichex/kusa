"use strict";

const TZ = "Asia/Tokyo";
const YEAR = 2026;
const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const EMPTY_DATA = {
  timezone: TZ,
  started: "2026-08-22",
  days: []
};
const EMPTY_MORNING_DATA = {
  timezone: TZ,
  mornings: []
};

let DATA = EMPTY_DATA;
let MORNING_DATA = EMPTY_MORNING_DATA;
let byDate = new Map();
let selected = null;

function tokyoYmd(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function todayYmd() {
  return tokyoYmd(new Date());
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return yy + "-" + mm + "-" + dd;
}

function mon0(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const sun0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return sun0 === 0 ? 6 : sun0 - 1;
}

function mondayOf(ymd) {
  return addDays(ymd, -mon0(ymd));
}

function parts(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y, m: m, d: d };
}

function nonempty(s) {
  return !!(s && String(s).trim());
}

function minutesOf(rec) {
  if (!rec) return 0;
  const m = Number(rec.minutes);
  return Number.isFinite(m) && m > 0 ? m : 0;
}

function intensity(rec) {
  const m = minutesOf(rec);
  if (m >= 180) return 6;
  if (m >= 120) return 5;
  if (m >= 60) return 4;
  if (m >= 30) return 3;
  if (m >= 15) return 2;
  if (m >= 1) return 1;
  return 0;
}

function formatMinutes(m) {
  if (!m) return "—";
  if (m < 60) return m + "分";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + "時間" + r + "分" : h + "時間";
}

function formatJaDate(ymd) {
  const p = parts(ymd);
  return p.y + "年" + p.m + "月" + p.d + "日（" + WEEKDAYS[mon0(ymd)] + "）";
}

function formatShort(ymd) {
  const p = parts(ymd);
  return p.m + "/" + p.d;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function timeToMinutes(time) {
  if (!/^\d{2}:\d{2}$/.test(time || "")) return null;
  const bits = time.split(":").map(Number);
  if (bits[0] > 23 || bits[1] > 59) return null;
  return bits[0] * 60 + bits[1];
}

function sleepMinutesOf(rec) {
  const stored = Number(rec && rec.sleepMinutes);
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored);

  const lightsOut = timeToMinutes(rec && rec.lightsOut);
  const wake = timeToMinutes(rec && rec.wake);
  if (lightsOut === null || wake === null) return null;
  let minutes = wake - lightsOut;
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

function fatigueOf(rec, key) {
  const value = Number(rec && rec[key]);
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function formatSleep(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours + "時間";
  return hours + "時間" + rest + "分";
}

function formatSleepWindow(rec) {
  const times = [];
  if (rec && rec.lightsOut) times.push("消灯 " + rec.lightsOut);
  if (rec && rec.wake) times.push("起床 " + rec.wake);
  return times.length ? times.join(" · ") : "時刻の記録なし";
}

function formatMorningDate(ymd) {
  const p = parts(ymd);
  return p.m + "月" + p.d + "日 " + WEEKDAYS[mon0(ymd)] + "曜";
}

async function loadJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (err) {
    return fallback;
  }
}

function morningRecords() {
  const source = Array.isArray(MORNING_DATA)
    ? MORNING_DATA
    : MORNING_DATA.mornings;
  return (Array.isArray(source) ? source : [])
    .filter(function (rec) {
      return rec && /^\d{4}-\d{2}-\d{2}$/.test(rec.date || "");
    })
    .slice()
    .sort(function (a, b) {
      return a.date.localeCompare(b.date);
    });
}

function chartLabel(value, kind) {
  if (kind === "sleep") {
    const hours = value / 60;
    return (Number.isInteger(hours) ? hours : hours.toFixed(1)) + "h";
  }
  return String(value);
}

function renderLineChart(rootId, records, config) {
  const root = document.getElementById(rootId);
  const points = records
    .map(function (rec) {
      return { date: rec.date, value: config.value(rec) };
    })
    .filter(function (point) {
      return Number.isFinite(point.value);
    })
    .slice(-30);

  if (!points.length) {
    root.innerHTML = '<p class="chart-empty">まだ記録がありません</p>';
    return;
  }

  const width = 640;
  const height = 210;
  const pad = { top: 18, right: 18, bottom: 34, left: 42 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = points.map(function (point) {
    return point.value;
  });
  let min = config.min;
  let max = config.max;

  if (config.kind === "sleep") {
    min = Math.max(0, Math.floor((Math.min.apply(null, values) - 60) / 60) * 60);
    max = Math.ceil((Math.max.apply(null, values) + 60) / 60) * 60;
    if (max - min < 180) {
      const extra = 180 - (max - min);
      min = Math.max(0, min - Math.ceil(extra / 120) * 60);
      max = min + 180;
    }
  }

  const x = function (index) {
    if (points.length === 1) return pad.left + plotWidth / 2;
    return pad.left + (index / (points.length - 1)) * plotWidth;
  };
  const y = function (value) {
    return pad.top + ((max - value) / (max - min)) * plotHeight;
  };
  const ticks = [max, (max + min) / 2, min];
  const grid = ticks
    .map(function (tick) {
      const yy = y(tick);
      return (
        '<line x1="' +
        pad.left +
        '" y1="' +
        yy +
        '" x2="' +
        (width - pad.right) +
        '" y2="' +
        yy +
        '" class="chart-grid-line"/>' +
        '<text x="' +
        (pad.left - 8) +
        '" y="' +
        (yy + 4) +
        '" text-anchor="end" class="chart-axis">' +
        chartLabel(tick, config.kind) +
        "</text>"
      );
    })
    .join("");
  const polyline = points
    .map(function (point, index) {
      return x(index) + "," + y(point.value);
    })
    .join(" ");
  const dots = points
    .map(function (point, index) {
      const title =
        formatMorningDate(point.date) +
        " · " +
        (config.kind === "sleep"
          ? formatSleep(point.value)
          : point.value + " / 5");
      return (
        '<circle cx="' +
        x(index) +
        '" cy="' +
        y(point.value) +
        '" r="4" class="chart-dot"><title>' +
        escapeHtml(title) +
        "</title></circle>"
      );
    })
    .join("");
  const labelIndexes = Array.from(
    new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])
  );
  const labels = labelIndexes
    .map(function (index) {
      return (
        '<text x="' +
        x(index) +
        '" y="' +
        (height - 9) +
        '" text-anchor="' +
        (index === 0
          ? "start"
          : index === points.length - 1
            ? "end"
            : "middle") +
        '" class="chart-axis">' +
        escapeHtml(formatShort(points[index].date)) +
        "</text>"
      );
    })
    .join("");

  root.innerHTML =
    '<svg viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="img" aria-label="' +
    escapeHtml(config.label + "の推移") +
    '">' +
    grid +
    '<polyline points="' +
    polyline +
    '" class="chart-line" style="stroke:' +
    config.color +
    '"/>' +
    '<g style="fill:' +
    config.color +
    '">' +
    dots +
    "</g>" +
    labels +
    "</svg>";
}

function renderMorningSummary(records) {
  const root = document.getElementById("morning-summary");
  const latest = records[records.length - 1];
  document.getElementById("morning-count").textContent = records.length
    ? records.length + "日分"
    : "";

  if (!latest) {
    root.innerHTML =
      '<div class="morning-empty"><strong>最初の記録を追加しましょう</strong>' +
      "<span>data/mornings.json に朝の状態を追加すると、ここに推移が表示されます。</span></div>";
    document.getElementById("sleep-latest").textContent = "—";
    document.getElementById("body-latest").textContent = "—";
    document.getElementById("mental-latest").textContent = "—";
    return;
  }

  const sleep = sleepMinutesOf(latest);
  const body = fatigueOf(latest, "body");
  const mental = fatigueOf(latest, "mental");
  root.innerHTML =
    '<article class="summary-date"><span>最新</span><strong>' +
    escapeHtml(formatMorningDate(latest.date)) +
    "</strong></article>" +
    '<article><span>睡眠</span><strong>' +
    escapeHtml(formatSleep(sleep)) +
    "</strong><small>" +
    escapeHtml(formatSleepWindow(latest)) +
    "</small></article>" +
    '<article><span>身体</span><strong>' +
    (body === null ? "—" : body + " / 5") +
    "</strong></article>" +
    '<article><span>心</span><strong>' +
    (mental === null ? "—" : mental + " / 5") +
    "</strong></article>";

  document.getElementById("sleep-latest").textContent = formatSleep(sleep);
  document.getElementById("body-latest").textContent =
    body === null ? "—" : body + " / 5";
  document.getElementById("mental-latest").textContent =
    mental === null ? "—" : mental + " / 5";
}

function renderMorningList(records) {
  const root = document.getElementById("morning-list");
  if (!records.length) {
    root.innerHTML = '<p class="list-empty">記録はまだありません。</p>';
    return;
  }

  root.innerHTML = records
    .slice()
    .reverse()
    .slice(0, 14)
    .map(function (rec) {
      const sleep = sleepMinutesOf(rec);
      const body = fatigueOf(rec, "body");
      const mental = fatigueOf(rec, "mental");
      return (
        '<article class="morning-row">' +
        '<time datetime="' +
        rec.date +
        '">' +
        escapeHtml(formatMorningDate(rec.date)) +
        "</time>" +
        '<div class="morning-metric"><span>睡眠</span><strong>' +
        escapeHtml(formatSleep(sleep)) +
        "</strong><small>" +
        escapeHtml(formatSleepWindow(rec)) +
        "</small></div>" +
        '<div class="morning-metric"><span>身体</span><strong>' +
        (body === null ? "—" : body) +
        "</strong><small>/ 5</small></div>" +
        '<div class="morning-metric"><span>心</span><strong>' +
        (mental === null ? "—" : mental) +
        "</strong><small>/ 5</small></div>" +
        "</article>"
      );
    })
    .join("");
}

function renderMorning() {
  const records = morningRecords();
  renderMorningSummary(records);
  renderLineChart("sleep-chart", records, {
    label: "睡眠時間",
    kind: "sleep",
    value: sleepMinutesOf,
    color: "#58a6ff"
  });
  renderLineChart("body-chart", records, {
    label: "身体の疲れ",
    kind: "fatigue",
    min: 1,
    max: 5,
    value: function (rec) {
      return fatigueOf(rec, "body");
    },
    color: "#f2cc60"
  });
  renderLineChart("mental-chart", records, {
    label: "心の疲れ",
    kind: "fatigue",
    min: 1,
    max: 5,
    value: function (rec) {
      return fatigueOf(rec, "mental");
    },
    color: "#bc8cff"
  });
  renderMorningList(records);
}

function setView(view) {
  const next = view === "morning" ? "morning" : "grass";
  document.body.dataset.view = next;
  document.getElementById("grass-view").hidden = next !== "grass";
  document.getElementById("morning-view").hidden = next !== "morning";
  document.querySelectorAll("[data-view]").forEach(function (tab) {
    const active = tab.getAttribute("data-view") === next;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.title = next === "morning" ? "毎朝の記録 | 草" : "草";
  if (next === "morning" && selected) closePanel();
}

function indexData() {
  byDate = new Map();
  (DATA.days || []).forEach(function (rec) {
    if (rec && rec.date) byDate.set(rec.date, rec);
  });
}

function recOf(ymd) {
  return byDate.get(ymd) || null;
}

function cellClass(ymd, extra) {
  const rec = recOf(ymd);
  const lv = rec ? intensity(rec) : 0;
  const p = parts(ymd);
  const started = DATA.started || "2026-08-22";
  const isOut = p.y !== YEAR;
  const isDisabled = isOut || (ymd < started && !rec);
  const cls = ["cell", "lv-" + lv];
  if (extra) cls.push(extra);
  if (isOut) cls.push("is-out");
  if (isDisabled) cls.push("is-disabled");
  if (ymd === todayYmd()) cls.push("is-today");
  if (ymd === selected) cls.push("is-selected");
  return cls.join(" ");
}

function renderYear() {
  const root = document.getElementById("year-grass");
  const jan1 = YEAR + "-01-01";
  const dec31 = YEAR + "-12-31";
  let d = mondayOf(jan1);
  const last = addDays(mondayOf(dec31), 6);
  const weeks = [];
  while (d <= last) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(d);
      d = addDays(d, 1);
    }
    weeks.push(week);
  }

  const styles = getComputedStyle(document.documentElement);
  const cell = parseFloat(styles.getPropertyValue("--cell")) || 11;
  const gap = parseFloat(styles.getPropertyValue("--gap")) || 3;
  const step = cell + gap;
  const monthHtml = [];
  weeks.forEach(function (week, i) {
    week.forEach(function (day) {
      const p = parts(day);
      if (p.y === YEAR && p.d === 1) {
        monthHtml.push(
          '<span style="left:' + i * step + 'px">' + MONTHS[p.m - 1] + "</span>"
        );
      }
    });
  });

  const wdayHtml = WEEKDAYS.map(function (w) {
    return "<span>" + w + "</span>";
  }).join("");

  const weeksHtml = weeks
    .map(function (week) {
      const cells = week
        .map(function (day) {
          const rec = recOf(day);
          const lv = rec ? intensity(rec) : 0;
          const title = day + " · " + formatMinutes(minutesOf(rec));
          return (
            '<button type="button" class="' +
            cellClass(day) +
            '" data-date="' +
            day +
            '" title="' +
            title +
            '" aria-label="' +
            formatJaDate(day) +
            '"' +
            (parts(day).y !== YEAR ? ' tabindex="-1"' : "") +
            "></button>"
          );
        })
        .join("");
      return '<div class="week">' + cells + "</div>";
    })
    .join("");

  root.innerHTML =
    '<div class="months">' +
    monthHtml.join("") +
    "</div>" +
    '<div class="year-body">' +
    '<div class="wdays">' +
    wdayHtml +
    "</div>" +
    '<div class="weeks">' +
    weeksHtml +
    "</div>" +
    "</div>";

  document.getElementById("year-meta").textContent = String(YEAR);
}

function renderWeek() {
  const focus = selected || todayYmd();
  const mon = mondayOf(focus);
  document.getElementById("week-meta").textContent =
    formatShort(mon) + " – " + formatShort(addDays(mon, 6));
  const root = document.getElementById("week-strip");
  const html = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i);
    const rec = recOf(d);
    html.push(
      '<button type="button" class="' +
        cellClass(d, "week-day") +
        '" data-date="' +
        d +
        '" aria-label="' +
        formatJaDate(d) +
        '">' +
        '<span class="wd">' +
        WEEKDAYS[i] +
        "</span>" +
        '<span class="num">' +
        parts(d).d +
        "</span>" +
        '<span class="checks">' +
        "<span>" +
        formatMinutes(minutesOf(rec)) +
        "</span>" +
        "</span>" +
        "</button>"
    );
  }
  root.innerHTML = html.join("");
}

function renderMonth() {
  const focus = selected || todayYmd();
  const p = parts(focus);
  document.getElementById("month-meta").textContent = p.y + "年" + p.m + "月";
  const first =
    p.y + "-" + String(p.m).padStart(2, "0") + "-01";
  const next =
    p.m === 12
      ? p.y + 1 + "-01-01"
      : p.y + "-" + String(p.m + 1).padStart(2, "0") + "-01";
  const last = addDays(next, -1);
  const start = mondayOf(first);
  const end = addDays(mondayOf(last), 6);

  const head = WEEKDAYS.map(function (w) {
    return "<span>" + w + "</span>";
  }).join("");

  const cells = [];
  let d = start;
  while (d <= end) {
    const other = parts(d).m !== p.m;
    cells.push(
      '<button type="button" class="' +
        cellClass(d, other ? "month-day is-other" : "month-day") +
        '" data-date="' +
        d +
        '" aria-label="' +
        formatJaDate(d) +
        '">' +
        '<span class="num">' +
        parts(d).d +
        "</span>" +
        "</button>"
    );
    d = addDays(d, 1);
  }

  document.getElementById("month-cal").innerHTML =
    '<div class="month-head">' +
    head +
    '</div><div class="month-grid">' +
    cells.join("") +
    "</div>";
}

function renderAll() {
  renderYear();
  renderWeek();
  renderMonth();
}

function openPanel(ymd) {
  selected = ymd;
  renderWeek();
  renderMonth();

  const rec = recOf(ymd);
  document.getElementById("panel-date").textContent = formatJaDate(ymd);
  const body = document.getElementById("panel-body");
  const work = rec
    ? nonempty(rec.work)
      ? escapeHtml(rec.work)
      : "—"
    : "記録なし";
  body.innerHTML =
    "<dl>" +
    "<div><dt>時間</dt><dd>" +
    escapeHtml(formatMinutes(minutesOf(rec))) +
    "</dd></div>" +
    "<div><dt>内容</dt><dd>" +
    work +
    "</dd></div>" +
    "</dl>";

  document.getElementById("panel-prev").disabled = ymd <= YEAR + "-01-01";
  document.getElementById("panel-next").disabled = ymd >= YEAR + "-12-31";
  document.getElementById("panel").hidden = false;
  document.querySelectorAll("[data-date]").forEach(function (el) {
    el.classList.toggle("is-selected", el.getAttribute("data-date") === ymd);
  });
}

function moveSelection(days) {
  if (!selected) return;
  const next = addDays(selected, days);
  if (next < YEAR + "-01-01" || next > YEAR + "-12-31") return;
  openPanel(next);
}

function closePanel() {
  selected = null;
  document.getElementById("panel").hidden = true;
  renderWeek();
  renderMonth();
  document.querySelectorAll(".is-selected").forEach(function (el) {
    el.classList.remove("is-selected");
  });
}

async function applySource() {
  const loaded = await Promise.all([
    loadJson("data/days.json", EMPTY_DATA),
    loadJson("data/mornings.json", EMPTY_MORNING_DATA)
  ]);
  DATA = loaded[0];
  MORNING_DATA = loaded[1];
  indexData();
  renderAll();
  renderMorning();
  if (selected) openPanel(selected);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  await applySource();
  setView(location.hash === "#morning" ? "morning" : "grass");

  const day = params.get("day");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) openPanel(day);

  document.addEventListener("click", function (e) {
    const tab = e.target.closest("[data-view]");
    if (tab) {
      const view = tab.getAttribute("data-view");
      if (location.hash !== "#" + view) location.hash = view;
      else setView(view);
      return;
    }
    const cell = e.target.closest("[data-date]");
    if (cell) {
      openPanel(cell.getAttribute("data-date"));
      return;
    }
    if (!e.target.closest("#panel")) {
      closePanel();
    }
  });

  document.getElementById("panel-close").addEventListener("click", function (e) {
    e.stopPropagation();
    closePanel();
  });

  document.getElementById("panel-prev").addEventListener("click", function (e) {
    e.stopPropagation();
    moveSelection(-1);
  });

  document.getElementById("panel-next").addEventListener("click", function (e) {
    e.stopPropagation();
    moveSelection(1);
  });

  const panel = document.getElementById("panel");
  let touchStart = null;
  panel.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 1) return;
      touchStart = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    },
    { passive: true }
  );
  panel.addEventListener(
    "touchend",
    function (e) {
      if (!touchStart || e.changedTouches.length !== 1) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      moveSelection(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );

  window.addEventListener("hashchange", function () {
    setView(location.hash === "#morning" ? "morning" : "grass");
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closePanel();
    } else if (e.key === "ArrowLeft" && selected) {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === "ArrowRight" && selected) {
      e.preventDefault();
      moveSelection(1);
    }
  });
}

boot();
