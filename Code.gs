/**
 * Sistem Tempahan Lawatan Parlimen - backend Google Apps Script.
 * Data disimpan dalam Google Sheet (sheet "Tempahan"). Diterbitkan sebagai Web App.
 *
 * Peraturan:
 *  - Isnin hingga Khamis sahaja, tarikh akan datang sahaja
 *  - 8 slot sehari (09:00 - 17:00), 1 jam setiap slot
 *  - Maksimum 4 lawatan sehari
 *  - Slot yang sama tidak boleh ditempah dua kali
 *
 * API (semua pulangan JSON):
 *  GET  ?action=availability&house=...&month=YYYY-MM   -> bilangan tempahan setiap hari
 *  GET  ?action=slots&house=...&date=YYYY-MM-DD        -> slot yang telah ditempah
 *  POST {action:"book", ...}                           -> buat tempahan
 *  POST {action:"admin_list", token}                   -> senarai tempahan (admin)
 *  POST {action:"admin_status", token, reference, status} -> sahkan / batal (admin)
 */

var TZ = 'Asia/Kuala_Lumpur';
var SHEET_NAME = 'Tempahan';
var EXPORT_SHEET_NAME = 'Disahkan';
var HOUSES = ['Parlimen'];
var MAX_PER_DAY = 4; // lawatan sehari
var MAX_GROUP = 50;
var SLOT_COUNT = 8; // 09:00 - 17:00
var FIRST_HOUR = 9;
var DAY_NAMES = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
var HEADERS = ['Rujukan', 'Tarikh', 'Hari', 'Masa', 'Dewan', 'Nama', 'Emel', 'Telefon',
  'Organisasi', 'Bil. Peserta', 'Status', 'Dibuat Pada', 'Disahkan Pada', 'No. Slot'];
var COL = { REF: 0, DATE: 1, DAY: 2, TIME: 3, HOUSE: 4, NAME: 5, EMAIL: 6, PHONE: 7,
  ORG: 8, SIZE: 9, STATUS: 10, CREATED: 11, CONFIRMED: 12, SLOT: 13 };
var ACTIVE = ['pending', 'confirmed'];

// ------------------------------------------------------------------ Pembantu

function pad_(n) { return (n < 10 ? '0' : '') + n; }

function slotLabel_(i) {
  return pad_(FIRST_HOUR + i) + ':00 - ' + pad_(FIRST_HOUR + i + 1) + ':00';
}

function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

function parseDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

/** Pulangkan mesej ralat jika tarikh tidak boleh ditempah, kalau tidak null. */
function dateError_(s) {
  var d = parseDate_(s);
  if (!d) return 'Format tarikh tidak sah (guna YYYY-MM-DD).';
  var wd = d.getUTCDay();
  if (wd < 1 || wd > 4) return 'Lawatan hanya boleh ditempah pada hari Isnin hingga Khamis.';
  if (s <= today_()) return 'Sila pilih tarikh akan datang.';
  return null;
}

function isInt_(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

function fail_(code, error) { return { ok: false, code: code, error: error }; }

/** Elak formula berbahaya apabila sel dibuka / dieksport. */
function safe_(s) { return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; }

function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME);
}

function readRows_(sheet) {
  var n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  var vals = sheet.getRange(2, 1, n, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!str_(r[COL.REF])) continue;
    out.push({
      row: i + 2,
      reference: str_(r[COL.REF]),
      date: str_(r[COL.DATE]),
      house: str_(r[COL.HOUSE]),
      name: str_(r[COL.NAME]),
      email: str_(r[COL.EMAIL]),
      phone: str_(r[COL.PHONE]),
      organisation: str_(r[COL.ORG]),
      group_size: Number(r[COL.SIZE]),
      status: str_(r[COL.STATUS]),
      created_at: str_(r[COL.CREATED]),
      confirmed_at: str_(r[COL.CONFIRMED]),
      slot_no: Number(r[COL.SLOT])
    });
  }
  return out;
}

function isActive_(r) { return ACTIVE.indexOf(r.status) >= 0; }

function takenSlots_(rows, house, date) {
  var taken = [];
  rows.forEach(function (r) {
    if (isActive_(r) && r.house === house && r.date === date) taken.push(r.slot_no);
  });
  return taken;
}

function isAdmin_(token) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!real && typeof token === 'string' && token === real;
}

var REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRef_(rows) {
  var used = {};
  rows.forEach(function (r) { used[r.reference] = true; });
  var ref;
  do {
    ref = 'PLK-';
    for (var i = 0; i < 6; i++) ref += REF_ALPHABET.charAt(Math.floor(Math.random() * REF_ALPHABET.length));
  } while (used[ref]);
  return ref;
}

// ------------------------------------------------------------------ Pengendali

function handleGet_(p) {
  switch (p.action) {
    case 'availability': return availability_(p);
    case 'slots': return slots_(p);
    default: return { ok: true, service: 'Tempahan Lawatan Parlimen' };
  }
}

function handlePost_(b) {
  switch (b.action) {
    case 'book': return book_(b);
    case 'admin_list': return adminList_(b);
    case 'admin_status': return adminStatus_(b);
    default: return fail_('INVALID', 'Tindakan tidak dikenali.');
  }
}

function availability_(p) {
  var house = String(p.house || '');
  if (HOUSES.indexOf(house) < 0) return fail_('INVALID', 'Lokasi tidak sah.');
  var month = String(p.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail_('INVALID', 'Format bulan tidak sah (guna YYYY-MM).');
  var sheet = getSheet_();
  if (!sheet) return fail_('SERVER', 'Sheet belum disediakan. Jalankan fungsi setup().');
  var counts = {};
  readRows_(sheet).forEach(function (r) {
    if (isActive_(r) && r.house === house && r.date.indexOf(month + '-') === 0) {
      counts[r.date] = (counts[r.date] || 0) + 1;
    }
  });
  return { ok: true, house: house, month: month, counts: counts, max_per_day: MAX_PER_DAY };
}

function slots_(p) {
  var house = String(p.house || '');
  var date = String(p.date || '');
  if (HOUSES.indexOf(house) < 0) return fail_('INVALID', 'Lokasi tidak sah.');
  var de = dateError_(date);
  if (de) return fail_('INVALID', de);
  var sheet = getSheet_();
  if (!sheet) return fail_('SERVER', 'Sheet belum disediakan. Jalankan fungsi setup().');
  var taken = takenSlots_(readRows_(sheet), house, date);
  return {
    ok: true, house: house, date: date, taken: taken,
    remaining: Math.max(0, MAX_PER_DAY - taken.length),
    day_full: taken.length >= MAX_PER_DAY
  };
}

var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
var PHONE_RE = /^\+?[0-9\s\-]{7,15}$/;

function book_(b) {
  var house = String(b.house || '');
  if (HOUSES.indexOf(house) < 0) return fail_('INVALID', 'Lokasi tidak sah.');
  var date = String(b.date || '');
  var de = dateError_(date);
  if (de) return fail_('INVALID', de);
  var slot = Number(b.slot);
  if (b.slot === '' || b.slot === null || !isInt_(slot) || slot < 0 || slot >= SLOT_COUNT) {
    return fail_('INVALID', 'Slot tidak sah.');
  }
  var name = String(b.name || '').trim();
  if (!name || name.length > 100) return fail_('INVALID', 'Nama diperlukan (maksimum 100 aksara).');
  var email = String(b.email || '').trim();
  if (email.length > 120 || !EMAIL_RE.test(email)) return fail_('INVALID', 'Alamat emel tidak sah.');
  var phone = String(b.phone || '').trim();
  if (!PHONE_RE.test(phone)) return fail_('INVALID', 'Nombor telefon tidak sah.');
  var org = String(b.organisation || '').trim();
  if (org.length > 150) return fail_('INVALID', 'Nama organisasi terlalu panjang.');
  var size = Number(b.group_size);
  if (b.group_size === '' || b.group_size === null || !isInt_(size) || size < 1 || size > MAX_GROUP) {
    return fail_('INVALID', 'Bilangan peserta mesti antara 1 dan ' + MAX_GROUP + '.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet_();
    if (!sheet) return fail_('SERVER', 'Sheet belum disediakan. Jalankan fungsi setup().');
    var rows = readRows_(sheet);
    var taken = takenSlots_(rows, house, date);
    if (taken.length >= MAX_PER_DAY) return fail_('FULL', 'Kuota lawatan hari ini telah penuh.');
    if (taken.indexOf(slot) >= 0) return fail_('TAKEN', 'Slot ini telah ditempah. Sila pilih slot lain.');

    var ref = newRef_(rows);
    var wd = parseDate_(date).getUTCDay();
    var row = [ref, date, DAY_NAMES[wd], slotLabel_(slot), house, safe_(name), safe_(email), phone,
      safe_(org), size, 'pending', now_(), '', slot];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length).setValues([row]);
    return { ok: true, reference: ref, status: 'pending',
      message: 'Tempahan diterima. Status: menunggu pengesahan.' };
  } finally {
    lock.releaseLock();
  }
}

function adminList_(b) {
  if (!isAdmin_(b.token)) return fail_('UNAUTHORIZED', 'Token tidak sah.');
  var sheet = getSheet_();
  if (!sheet) return fail_('SERVER', 'Sheet belum disediakan. Jalankan fungsi setup().');
  var rows = readRows_(sheet);
  rows.sort(function (a, c) {
    if (a.date !== c.date) return a.date < c.date ? -1 : 1;
    return a.slot_no - c.slot_no;
  });
  return {
    ok: true,
    bookings: rows.map(function (r) {
      var d = parseDate_(r.date);
      return {
        reference: r.reference,
        date: r.date,
        day: d ? DAY_NAMES[d.getUTCDay()] : '',
        slot: slotLabel_(r.slot_no),
        house: r.house,
        name: r.name,
        email: r.email,
        phone: r.phone,
        organisation: r.organisation,
        group_size: r.group_size,
        status: r.status,
        created_at: r.created_at,
        confirmed_at: r.confirmed_at
      };
    })
  };
}

function adminStatus_(b) {
  if (!isAdmin_(b.token)) return fail_('UNAUTHORIZED', 'Token tidak sah.');
  var status = String(b.status || '');
  if (status !== 'confirmed' && status !== 'cancelled') {
    return fail_('INVALID', "Status mesti 'confirmed' atau 'cancelled'.");
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = getSheet_();
    if (!sheet) return fail_('SERVER', 'Sheet belum disediakan. Jalankan fungsi setup().');
    var rec = null;
    readRows_(sheet).forEach(function (r) { if (r.reference === String(b.reference || '')) rec = r; });
    if (!rec) return fail_('NOT_FOUND', 'Tempahan tidak dijumpai.');
    if (rec.status === 'cancelled') return fail_('CONFLICT', 'Tempahan yang dibatalkan tidak boleh diubah.');
    sheet.getRange(rec.row, COL.STATUS + 1).setValue(status);
    sheet.getRange(rec.row, COL.CONFIRMED + 1).setValue(
      status === 'confirmed' ? (rec.confirmed_at || now_()) : '');
    return { ok: true, reference: rec.reference, status: status };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------------ Titik masuk Web App

function doGet(e) {
  var out;
  try {
    out = handleGet_((e && e.parameter) || {});
  } catch (err) {
    console.error(err);
    out = fail_('SERVER', 'Ralat pelayan. Cuba lagi.');
  }
  return json_(out);
}

function doPost(e) {
  var out;
  var body = null;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_(fail_('INVALID', 'Permintaan tidak sah.'));
  }
  try {
    out = handlePost_(body || {});
  } catch (err2) {
    console.error(err2);
    out = fail_('SERVER', 'Ralat pelayan. Cuba lagi.');
  }
  return json_(out);
}

// ------------------------------------------------------------------ Suntingan terus dalam Sheet

/**
 * Apabila admin menukar Status kepada "confirmed" terus dalam Sheet,
 * isi lajur "Disahkan Pada" secara automatik (pencetus mudah, tiada pemasangan).
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  var c1 = range.getColumn();
  var c2 = c1 + range.getNumColumns() - 1;
  var statusCol = COL.STATUS + 1;
  if (statusCol < c1 || statusCol > c2) return;
  var r1 = Math.max(range.getRow(), 2);
  var r2 = range.getRow() + range.getNumRows() - 1;
  for (var r = r1; r <= r2; r++) {
    var status = String(sheet.getRange(r, statusCol).getValue());
    var confirmedCell = sheet.getRange(r, COL.CONFIRMED + 1);
    if (status === 'confirmed') {
      if (!String(confirmedCell.getValue())) confirmedCell.setValue(now_());
    } else {
      confirmedCell.setValue('');
    }
  }
}

// ------------------------------------------------------------------ Persediaan (jalankan sekali)

function randomToken_(len) {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var t = '';
  for (var i = 0; i < len; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
  return t;
}

/** Jalankan fungsi ini SEKALI dari editor Apps Script untuk menyediakan Sheet dan token admin. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  var maxRows = sheet.getMaxRows();

  // Semua lajur sebagai teks supaya "=..." tidak ditafsir sebagai formula dan tarikh kekal teks.
  sheet.getRange(1, 1, maxRows, HEADERS.length).setNumberFormat('@');
  sheet.getRange(2, COL.SIZE + 1, maxRows - 1, 1).setNumberFormat('0');
  sheet.getRange(2, COL.SLOT + 1, maxRows - 1, 1).setNumberFormat('0');

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1f3864').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['pending', 'confirmed', 'cancelled'], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, COL.STATUS + 1, maxRows - 1, 1).setDataValidation(rule);
  sheet.hideColumns(COL.SLOT + 1);
  sheet.setColumnWidths(1, 13, 130);

  // Sheet "Disahkan": senarai tempahan disahkan sahaja (sedia untuk File > Download > .xlsx)
  var ex = ss.getSheetByName(EXPORT_SHEET_NAME) || ss.insertSheet(EXPORT_SHEET_NAME);
  ex.clear();
  ex.getRange('A1').setFormula(
    '=IFERROR(FILTER(' + SHEET_NAME + '!A1:M,(' + SHEET_NAME + '!K1:K="confirmed")+(ROW(' + SHEET_NAME + '!K1:K)=1)>0),"Tiada tempahan disahkan")');

  var props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('ADMIN_TOKEN')) props.setProperty('ADMIN_TOKEN', randomToken_(24));
  Logger.log('SIAP. Token admin anda: ' + props.getProperty('ADMIN_TOKEN') +
    '  (boleh ditukar di Project Settings > Script properties > ADMIN_TOKEN)');
}
