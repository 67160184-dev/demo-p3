# 5C — ล็อกอิน, เมนูบัญชี, `apiFetch` (app.js 55-219)

> [← ภาพรวม](00-overview.md) · โค้ด: [../frontend/app.js:55](../frontend/app.js) · คู่กับ backend [4B](../study-index-js/4B-auth.md) และ `middlewares/auth.js`

## ทีละตัว

| บรรทัด | ชื่อ | ทำอะไร |
|---|---|---|
| 59-60 | `TOKEN_KEY`, `session` | ชื่อช่องเก็บ token ใน `localStorage` + ความจำว่าใครล็อกอินอยู่ |
| 62-77 | `saveToken` / `loadToken` | เก็บ/อ่าน token ใน `localStorage` (ปิดแท็บแล้วยังอยู่) ครอบ `try/catch` เผื่อเบราว์เซอร์ปิดการเก็บ |
| 79-87 | `setSession(token, user)` | ⭐ บรรทัด 84 `document.body.classList.toggle("is-admin", isAdmin)` = **สวิตช์โชว์/ซ่อนปุ่มแอดมินทั้งหน้า** |
| 89-107 | เมนูบัญชี | กดปุ่ม 👤 บัญชี ถึงเห็นเมนู คลิกที่อื่นหรือกด Esc เมนูปิด |
| 109 | `logout()` | ล้าง token กลับเป็นโหมดผู้เยี่ยมชม |
| 116-130 | **`apiFetch(url, {method, body})`** | ⭐ ทุกคำขอที่แก้ข้อมูลผ่านตัวนี้ |
| 135-162 | `openChangePasswordForm` | ฟอร์มเปลี่ยนรหัส: รหัสใหม่ ≥ 8 ตัว (148) + สองช่องต้องตรงกัน → `PATCH /auth/change-password` |
| 165-187 | `openLoginForm` | ฟอร์มล็อกอิน → `POST /auth/login` (176) สำเร็จ `setSession` ปุ่มแอดมินโผล่ทันที |
| 190-200 | `restoreSession` | เปิดหน้าใหม่ มี token เก่า → ถาม `GET /auth/me` ว่ายังใช้ได้ไหม (ไม่เชื่อ token เก่าโดยไม่ตรวจ) |
| 210-216 | `actionsCell` | เซลล์ปุ่ม "แก้ไข" "ลบ" ท้ายแถว (class `admin-only`) |

## `apiFetch` ทำ 2 อย่าง (บรรทัด 118-130)

```js
const headers = { Authorization: `Bearer ${session.token}` };   // 119 แนบบัตรทุกครั้ง
...
if (res.status === 401) {                                       // 122
  const error = (await res.clone().json()...).error || {};      // 123 อ่านรหัส error
  if (SESSION_ERROR_CODES.includes(error.code)) {              // 124 NO_TOKEN หรือ INVALID_TOKEN
    logout(null);                                               // 125 token เสีย/หมดอายุ → ออกจากระบบอัตโนมัติ
    throw new Error(`... กดปุ่ม "เข้าสู่ระบบ" มุมขวาบน`);
  }
}
```
- 401 จาก "รหัสผ่านเดิมผิด" (`INVALID_CREDENTIALS`) **ไม่** ออกจากระบบ เพราะไม่อยู่ในรายการบรรทัด 116
- `res.clone()` = สำเนาคำตอบ เพราะเนื้อคำตอบอ่านได้ครั้งเดียว ฟังก์ชันที่เรียกต่อยังต้องอ่านได้

## 🎯 คำถามที่อาจารย์น่าถาม

| คำถาม | คำตอบ |
|---|---|
| **token เก็บที่ไหน** | `localStorage` ของเบราว์เซอร์ (`stockpro.token`) ข้อเสีย: ถ้าเว็บโดน XSS อาจถูกขโมย จึงใช้ `textContent` กัน XSS · ระบบจริงอาจใช้ httpOnly cookie |
| **หน้าเว็บส่ง token ยังไง** | header `Authorization: Bearer <token>` ใน `apiFetch` บรรทัด 119 |
| **token หมดอายุระหว่างใช้งาน** | backend ตอบ 401 `INVALID_TOKEN` → `apiFetch` ออกจากระบบให้ ปุ่มแอดมินหาย แจ้งให้ล็อกอินใหม่ |
| **รีเฟรชแล้วทำไมยังล็อกอินอยู่** | token อยู่ใน localStorage แล้ว `restoreSession` ตรวจกับ `/auth/me` ก่อนใช้ |
| **ซ่อนปุ่มอย่างเดียวพอไหม** | ไม่พอ ซ่อนเพื่อ UX ส่วน backend ตรวจ token ทุกครั้ง ต่อให้แก้ HTML ให้ปุ่มโผล่ก็ยิงไม่ผ่าน (401) |

## 🌐 ลองดูเอง (F12)
Console พิมพ์ `JSON.parse(atob(session.token.split(".")[1]))` เห็นข้อมูลในบัตร · พิมพ์ `session.token = "abc"` แล้วกดแก้ไข→บันทึก → ถูกออกจากระบบอัตโนมัติ (Network เห็น 401)
