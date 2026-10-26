import { APPS_SCRIPT_URL } from "./config.js";

export const configured = /^https:\/\/script\.google\.com\//.test(APPS_SCRIPT_URL);

async function parse(res) {
  try {
    return await res.json();
  } catch (e) {
    return { ok: false, code: "SERVER", error: "Jawapan pelayan tidak sah. Semak URL Apps Script dan penerbitan Web App." };
  }
}

/** GET: data awam (kalendar & slot). */
export async function apiGet(params) {
  const res = await fetch(`${APPS_SCRIPT_URL}?${new URLSearchParams(params)}`);
  return parse(res);
}

/** POST: guna text/plain supaya pelayar tidak perlu preflight CORS (Apps Script tidak menyokong OPTIONS). */
export async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return parse(res);
}
