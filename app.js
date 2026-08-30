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

let DATA = EMPTY_DATA;
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

async function loadJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (err) {
    return fallback;
  }
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
  const today = todayYmd();
  const mon = mondayOf(today);
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
  const today = todayYmd();
  const p = parts(today);
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
  const rec = recOf(ymd);
  document.getElementById("panel-date").textContent = formatJaDate(ymd);
  const body = document.getElementById("panel-body");
  if (!rec) {
    body.innerHTML = '<p class="empty">記録なし</p>';
  } else {
    const work = nonempty(rec.work) ? escapeHtml(rec.work) : "—";
    body.innerHTML =
      "<dl>" +
      "<div><dt>時間</dt><dd>" +
      escapeHtml(formatMinutes(minutesOf(rec))) +
      "</dd></div>" +
      "<div><dt>内容</dt><dd>" +
      work +
      "</dd></div>" +
      "</dl>";
  }
  document.getElementById("panel").hidden = false;
  document.querySelectorAll("[data-date]").forEach(function (el) {
    el.classList.toggle("is-selected", el.getAttribute("data-date") === ymd);
  });
}

function closePanel() {
  selected = null;
  document.getElementById("panel").hidden = true;
  document.querySelectorAll(".is-selected").forEach(function (el) {
    el.classList.remove("is-selected");
  });
}

async function applySource() {
  DATA = await loadJson("data/days.json", EMPTY_DATA);
  indexData();
  renderAll();
  if (selected) openPanel(selected);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  await applySource();

  const day = params.get("day");
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) openPanel(day);

  document.addEventListener("click", function (e) {
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

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePanel();
  });
}

boot();
