# Sistem Tempahan Lawatan Parlimen

Tempah lawatan ke Parlimen Malaysia. Dewan Rakyat dan Dewan Negara (kalendar berasingan).

- Isnin – Khamis sahaja (Jumaat, Sabtu, Ahad ditutup)
- 8 slot sehari, 9:00 pagi – 5:00 petang
- Maksimum 4 lawatan sehari bagi setiap dewan
- Admin boleh sahkan tempahan dan eksport ke Excel (tempahan disahkan sahaja)

## Fail dalam repo ini (semua di root)

| Fail | Fungsi |
|---|---|
| `index.html` | Halaman tempahan |
| `admin.html` | Panel admin |
| `style.css` | Rekaan |
| `app.js`, `admin.js`, `api.js`, `utils.js` | Logik laman |
| `config.js` | URL Apps Script (backend Google Sheet) |
| `Code.gs` | Kod backend untuk ditampal dalam Google Apps Script (tidak digunakan oleh GitHub Pages) |

## GitHub Pages

Settings → Pages → Deploy from a branch → Branch `main`, folder `/ (root)` → Save.

## Backend

Data disimpan dalam Google Sheet melalui Google Apps Script. Tampal `Code.gs` dalam Extensions → Apps Script, jalankan `setup`, kemudian Deploy sebagai Web app dan letak URL `/exec` dalam `config.js`.
