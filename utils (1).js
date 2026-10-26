// Fungsi tulen (tiada rangkaian) supaya mudah diuji dengan Node.

export const HOUSES = [{ key: "parlimen", name: "Parlimen" }];
export const MAX_PER_DAY = 4; // lawatan sehari
export const MAX_GROUP = 50;
export const SLOT_HOURS = [10, 11, 13, 14, 15, 16]; // jam mula setiap sesi (12:00 - 13:00 rehat)
export const FIRST_HOUR = 9;
export const OPEN_WEEKDAYS = [1, 2, 3, 4]; // getDay(): Isnin - Khamis
export const DAY_NAMES = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
export const MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

export const pad = (n) => String(n).padStart(2, "0");

// Nombor sesi = jam mula - 9 (kekal sama dengan data lama dalam Sheet).
const slotFor = (h) => ({ id: h - FIRST_HOUR, label: `${pad(h)}:00 - ${pad(h + 1)}:00` });
export const ALL_SLOTS = Array.from({ length: 8 }, (_, i) => slotFor(FIRST_HOUR + i)); // 09:00 - 17:00
export const SLOTS = SLOT_HOURS.map(slotFor); // sesi yang dibuka
export const SLOT_COUNT = SLOTS.length;

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

/** Boleh ditempah: Isnin - Khamis sahaja, dan mesti tarikh akan datang. */
export function isBookable(dateStr, now = new Date()) {
  const d = parseDate(dateStr);
  if (!d) return false;
  if (!OPEN_WEEKDAYS.includes(d.getDay())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d > today;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
