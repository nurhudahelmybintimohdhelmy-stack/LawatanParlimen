import { configured, apiPost } from "./api.js";
import { esc, parseDate, DAY_NAMES } from "./utils.js";

const $ = (id) => document.getElementById(id);
const LABEL = { pending: "Menunggu", confirmed: "Disahkan", cancelled: "Dibatalkan" };
let token = "";
let all = [];

function note(text, kind) {
  const m = $("msg");
  m.textContent = text;
  m.className = "msg " + kind;
}

function filtered(extra = {}) {
  const status = extra.status ?? $("statusFilter").value;
  const from = $("from").value, to = $("to").value;
  return all.filter((r) =>
    (!status || r.status === status) &&
    (!from || r.date >= from) && (!to || r.date <= to));
}

function render() {
  const rows = filtered();
  $("rows").innerHTML = rows.map((r) => `
      <tr>
        <td>${esc(r.reference)}</td>
        <td>${esc(r.date)}<br><small>${esc(r.day)}</small></td>
        <td>${esc(r.slot)}</td>
        <td>${esc(r.name)}<br><small>${esc(r.email)}<br>${esc(r.phone)}${r.organisation ? "<br>" + esc(r.organisation) : ""}</small></td>
        <td>${esc(r.group_size)}</td>
        <td><span class="badge ${esc(r.status)}">${esc(LABEL[r.status] || r.status)}</span></td>
        <td>
          ${r.status === "pending" ? `<button data-ref="${esc(r.reference)}" data-s="confirmed">Sahkan</button>` : ""}
          ${r.status !== "cancelled" ? `<button data-ref="${esc(r.reference)}" data-s="cancelled">Batal</button>` : ""}
        </td>
      </tr>`).join("") || `<tr><td colspan="7">Tiada tempahan.</td></tr>`;
}

async function load() {
  const r = await apiPost({ action: "admin_list", token });
  if (!r.ok) throw new Error(r.error || "Gagal memuatkan tempahan.");
  all = r.bookings;
  render();
}

async function exportExcel() {
  const rows = filtered({ status: "confirmed" });
  if (!rows.length) { alert("Tiada tempahan disahkan untuk dieksport (ikut tapisan semasa)."); return; }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tempahan Disahkan");
  ws.columns = [
    { header: "Rujukan", width: 13 }, { header: "Tarikh", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Hari", width: 10 }, { header: "Masa", width: 15 },
    { header: "Nama", width: 26 }, { header: "Emel", width: 28 }, { header: "Telefon", width: 15 },
    { header: "Organisasi", width: 26 }, { header: "Bil. Peserta", width: 12 },
    { header: "Dibuat Pada", width: 20 }, { header: "Disahkan Pada", width: 20 },
  ];
  rows.forEach((r) => {
    const d = parseDate(r.date);
    ws.addRow([r.reference, d, d ? DAY_NAMES[d.getDay()] : r.day, r.slot, r.name, r.email,
      r.phone, r.organisation || "", r.group_size, r.created_at, r.confirmed_at]);
  });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.alignment = { horizontal: "center", vertical: "middle" };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: { row: 1, column: 11 } };

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  a.download = `tempahan-disahkan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function wire() {
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    token = $("token").value;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      await load();
      $("msg").className = "msg hidden";
      $("loginCard").classList.add("hidden");
      $("panel").classList.remove("hidden");
    } catch (err) {
      console.error(err);
      token = "";
      note(err.message || "Log masuk gagal.", "error");
    } finally {
      btn.disabled = false;
    }
  };
  $("logoutBtn").onclick = () => {
    token = ""; all = []; $("token").value = "";
    $("panel").classList.add("hidden");
    $("loginCard").classList.remove("hidden");
  };

  $("rows").onclick = async (e) => {
    const b = e.target.closest("button[data-ref]");
    if (!b) return;
    if (b.dataset.s === "cancelled" && !confirm("Batalkan tempahan ini? Slot akan dikosongkan semula.")) return;
    b.disabled = true;
    try {
      const r = await apiPost({ action: "admin_status", token, reference: b.dataset.ref, status: b.dataset.s });
      if (!r.ok) throw new Error(r.error);
      await load();
    } catch (err) {
      console.error(err);
      alert(err.message || "Tindakan gagal.");
      b.disabled = false;
    }
  };
  ["statusFilter", "from", "to"].forEach((id) => ($(id).onchange = render));
  $("exportBtn").onclick = exportExcel;
}

if (!configured) {
  $("setupWarn").classList.remove("hidden");
  $("loginCard").classList.add("hidden");
} else {
  wire();
}
