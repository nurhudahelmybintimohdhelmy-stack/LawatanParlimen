// Fungsi tulen (tiada rangkaian) supaya mudah diuji dengan Node.

export const HOUSES = [
  { key: "rakyat", name: "Dewan Rakyat" },
  { key: "negara", name: "Dewan Negara" },
];
export const MAX_PER_DAY = 4; // lawatan sehari bagi setiap dewan
export const MAX_GROUP = 50;
export const SLOT_COUNT = 8; // 09:00 - 17:00
export const FIRST_HOUR = 9;
export const OPEN_WEEKDAYS = [1, 2, 3, 4]; // getDay(): Isnin - Khamis
export const DAY_NAMES = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];
export const MONTHS = ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"];

export const pad = (n) => String(n).padStart(2, "0");

export const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => ({
  id: i,
  label: `${pad(FIRST_HOUR + i)}:00 - ${pad(FIRST_HOUR + i + 1)}:00`,
}));

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
