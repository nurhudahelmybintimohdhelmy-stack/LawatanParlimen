import { configured, apiGet, apiPost } from "./api.js";
import { HOUSES, SLOTS, ALL_SLOTS, MAX_PER_DAY, MONTHS, isBookable, pad } from "./utils.js";

const $ = (id) => document.getElementById(id);
const DOW = ["Isn", "Sel", "Rab", "Kha", "Jum", "Sab", "Ahd"];
const now = new Date();
const state = { house: HOUSES[0], year: now.getFullYear(), month: now.getMonth(), date: null, slot: null };

const show = (el, on) => el.classList.toggle("hidden", !on);

function message(text, kind) {
  const r = $("result");
  r.textContent = text;
  r.className = "msg " + kind;
  r.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderHouseTabs() {
  const box = $("houseTabs");
  box.style.display = HOUSES.length < 2 ? "none" : "";
  box.innerHTML = "";
  HOUSES.forEach((h) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = h.name;
    if (h.key === state.house.key) b.className = "active";
    b.onclick = () => {
      state.house = h; state.date = null; state.slot = null;
      show($("slotCard"), false); show($("formCard"), false); show($("result"), false);
      renderHouseTabs();
      loadCalendar();
    };
    box.appendChild(b);
  });
}

async function loadCalendar() {
  $("monthLabel").textContent = `${MONTHS[state.month]} ${state.year}`;
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const ym = `${state.year}-${pad(state.month + 1)}`;
  const grid = $("calendar");
  grid.classList.add("loading");

  let counts = {};
  let closed = {};
  try {
    const r = await apiGet({ action: "availability", house: state.house.name, month: ym });
    if (!r.ok) throw new Error(r.error);
    counts = r.counts;
    closed = r.closed || {};
  } catch (e) {
    console.error(e);
    message("Gagal memuatkan kalendar. Semak sambungan internet atau tetapan Apps Script.", "error");
  }

  grid.innerHTML = "";
  DOW.forEach((d) => {
    const e = document.createElement("div");
    e.className = "dow"; e.textContent = d; grid.appendChild(e);
  });
  const lead = (new Date(state.year, state.month, 1).getDay() + 6) % 7; // Isnin = 0
  for (let i = 0; i < lead; i++) {
    const e = document.createElement("div"); e.className = "day empty"; grid.appendChild(e);
  }
  for (let n = 1; n <= daysInMonth; n++) {
    const date = `${ym}-${pad(n)}`;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.textContent = n;
    if (isBookable(date)) {
      const remaining = Math.max(0, MAX_PER_DAY - (counts[date] || 0));
      const small = document.createElement("small");
      if (closed[date]) {
        b.classList.add("closed");
        b.title = closed[date];
        small.textContent = "Ditutup";
        b.disabled = true;
      } else if (remaining > 0) {
        b.classList.add("open");
        small.textContent = `${remaining} baki`;
        b.onclick = () => pickDate(date, b);
      } else {
        b.classList.add("full");
        small.textContent = "Penuh";
        b.disabled = true;
      }
      b.appendChild(small);
    } else {
      b.disabled = true;
    }
    if (date === state.date) b.classList.add("selected");
    grid.appendChild(b);
  }
  grid.classList.remove("loading");
}

async function pickDate(date, btn) {
  state.date = date; state.slot = null;
  document.querySelectorAll(".day.selected").forEach((e) => e.classList.remove("selected"));
  btn.classList.add("selected");
  show($("formCard"), false);
  show($("result"), false);

  let r;
  try {
    r = await apiGet({ action: "slots", house: state.house.name, date });
    if (!r.ok) throw new Error(r.error);
  } catch (e) {
    console.error(e);
    message("Gagal memuatkan slot. Cuba lagi.", "error");
    return;
  }
  const taken = new Set(r.taken);
  $("slotTitle").textContent = date;
  $("slotHint").textContent = `Baki kuota lawatan hari ini: ${r.remaining}. Slot yang dikelabukan telah ditempah.`;
  const box = $("slots");
  box.innerHTML = "";
  // Jika backend menghantar senarai sesi, ikut senarai itu (elak tidak sepadan); jika tidak, guna sesi lalai.
  const ids = Array.isArray(r.slot_ids) ? r.slot_ids : SLOTS.map((s) => s.id);
  ALL_SLOTS.filter((s) => ids.includes(s.id)).forEach((s) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "slot"; b.textContent = s.label;
    b.disabled = taken.has(s.id) || r.day_full;
    b.onclick = () => {
      state.slot = s.id;
      box.querySelectorAll(".slot").forEach((e) => e.classList.remove("selected"));
      b.classList.add("selected");
      show($("formCard"), true);
      $("formCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    box.appendChild(b);
  });
  show($("slotCard"), true);
}

function wire() {
  $("prevMonth").onclick = () => { state.month--; if (state.month < 0) { state.month = 11; state.year--; } loadCalendar(); };
  $("nextMonth").onclick = () => { state.month++; if (state.month > 11) { state.month = 0; state.year++; } loadCalendar(); };

  $("bookingForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (state.slot === null || !state.date) { message("Sila pilih tarikh dan slot dahulu.", "error"); return; }
    $("submitBtn").disabled = true;
    try {
      const r = await apiPost({
        action: "book",
        house: state.house.name,
        date: state.date,
        slot: state.slot,
        name: f.name.value,
        organisation: f.organisation.value,
        email: f.email.value,
        phone: f.phone.value,
        group_size: Number(f.group_size.value),
      });
      if (r.ok) {
        message(`${r.message} No. rujukan: ${r.reference}. Simpan nombor ini.`, "ok");
        f.reset();
        show($("formCard"), false); show($("slotCard"), false);
        state.date = null; state.slot = null;
        loadCalendar();
      } else {
        message(r.error, "error");
        if (r.code === "TAKEN" || r.code === "FULL") {
          await loadCalendar();
          const sel = document.querySelector(".day.selected");
          if (sel && state.date) pickDate(state.date, sel);
          show($("formCard"), false);
        }
      }
    } catch (err) {
      console.error(err);
      message("Ralat rangkaian. Sila cuba lagi.", "error");
    } finally {
      $("submitBtn").disabled = false;
    }
  };
}

renderHouseTabs();
wire();
if (!configured) {
  show($("setupWarn"), true);
  $("monthLabel").textContent = `${MONTHS[state.month]} ${state.year}`;
} else {
  loadCalendar();
}
