// กำหนดค่าเริ่มต้น API_BASE เป็น "/api/v1"
const API_BASE = "/api/v1";
// ใช้ Content-Type นี้เมื่อส่งข้อมูล JSON ไปยัง API
const JSON_HEADERS = { "Content-Type": "application/json" };

// ย่อการค้นหา DOM ด้วย id เพื่อให้ฟังก์ชันด้านล่างอ้างองค์ประกอบได้ตรงกัน
const $ = (id) => document.getElementById(id);

// ข้อมูลล่าสุดจาก API — ใช้ทั้งแสดงตาราง ค้นหา และเติมตัวเลือกในฟอร์ม
const state = { products: [], categories: [], suppliers: [] }; // ความจำของหน้าเว็บ: เก็บข้อมูลล่าสุดไว้ค้นหา/กรอง/เติมเมนู โดยไม่ต้องยิง API ซ้ำ

// fetch โยน TypeError เมื่อเชื่อมต่อไม่ได้ (เซิร์ฟเวอร์ปิด/เน็ตหลุด) — แปลงเป็นข้อความที่ผู้ใช้เข้าใจ
// แปลงข้อผิดพลาดการเชื่อมต่อเป็นข้อความที่ผู้ใช้เข้าใจ และส่งข้อความเดิมสำหรับข้อผิดพลาดชนิดอื่น
function errorText(err) {
  // คืนข้อความแนะนำเมื่อเชื่อมต่อไม่ได้ หรือคืนข้อความข้อผิดพลาดเดิม
  return err instanceof TypeError ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่าเปิด server และฐานข้อมูลอยู่" : err.message;
}

// อ่านข้อความผิดพลาดจาก JSON ของ API; ถ้าเป็น HTTP 500 ให้ต่อคำแนะนำเพิ่มเติม
async function readError(res, hint = "อาจเกิดจากข้อมูลซ้ำ หรือข้อมูลไม่ถูกต้อง") {
  // อ่าน JSON จากคำตอบ API แล้วเก็บใน body
  const body = await res.json().catch(() => ({}));
  // ใช้ข้อความผิดพลาดจาก API ก่อน; หากไม่มีให้แสดงรหัสสถานะ HTTP แทน
  const msg = body.error?.message || `เซิร์ฟเวอร์ตอบกลับผิดพลาด: ${res.status}`;
  // เพิ่มคำแนะนำเมื่อ API ตอบ 500; สถานะอื่นใช้ข้อความที่อ่านมา
  return res.status === 500 ? `${msg} (${hint})` : msg;
}

// สร้าง element สั้นๆ: el("td", { className: "num", textContent: "10" }, child...)
// สร้าง DOM element กำหนดคุณสมบัติ แล้วเพิ่มลูกโดยไม่ประกอบ HTML จากข้อความผู้ใช้
function el(tag, props = {}, ...children) { // สร้าง element ด้วย textContent (ไม่ใช้ innerHTML) กัน XSS
  // สร้าง DOM element แล้วเก็บใน node
  const node = document.createElement(tag);
  // คัดลอกคุณสมบัติ props ลงใน DOM element ที่สร้าง
  Object.assign(node, props);
  // เพิ่มองค์ประกอบที่สร้างไว้เข้าไปท้ายส่วนนี้ของหน้า
  node.append(...children);
  // ส่ง node กลับจากฟังก์ชัน
  return node;
}

// สร้างปุ่มมาตรฐานที่ใช้ซ้ำในตารางและหน้าต่างต่าง ๆ
function button(label, className, onClick) {
  // คืนปุ่มที่มีข้อความ คลาส และฟังก์ชันเมื่อคลิกตามที่ส่งมา
  return el("button", { type: "button", className, textContent: label, onclick: onClick });
}

// ---------- แถบแจ้งผลมุมล่าง (หายเอง) ----------
let toastTimer;
// แสดงข้อความแจ้งผล แล้วตั้งเวลาให้แถบแจ้งเตือนหายเอง; ข้อผิดพลาดแสดงนานกว่าปกติ
function toast(message, kind = "ok") {
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน box
  const box = $("toast");
  // แสดงข้อความจาก message ใน box.textContent
  box.textContent = message;
  // เปลี่ยนคลาสของ box.className เป็น `toast show ${kind}`
  box.className = `toast show ${kind}`;
  // ยกเลิกตัวจับเวลาเดิม เพื่อไม่ให้ข้อความใหม่หายก่อนเวลา
  clearTimeout(toastTimer);
  // กำหนด toastTimer จาก setTimeout(() => (box.className = `toast ${kind}`), kind === "error" ? 6000 : 3500)
  toastTimer = setTimeout(() => (box.className = `toast ${kind}`), kind === "error" ? 6000 : 3500);
}

// อัปเดตตัวเลขจำนวนรายการบนแท็บที่มี id ตรงกับค่าที่ส่งมา
function setCount(id, n) {
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $(id).textContent = n;
}

// แถวข้อความเต็มความกว้างตาราง: กำลังโหลด / ไม่มีข้อมูล / โหลดไม่สำเร็จ
// retry: ถ้าส่งฟังก์ชันมา จะมีปุ่ม "ลองใหม่" ใต้ข้อความ (ใช้ตอนโหลดข้อมูลไม่สำเร็จ)
// แทนแถวตารางด้วยข้อความสถานะ และเพิ่มปุ่มลองใหม่เมื่อมีฟังก์ชัน retry
function messageRow(tbodyId, text, kind = "", retry = null) {
  const cols = $(tbodyId).closest("table").tHead.rows[0].cells.length; // นับคอลัมน์จากหัวตาราง ให้ข้อความกว้างเต็มแถว (colSpan)
  // สร้างองค์ประกอบ HTML แล้วเก็บใน td
  const td = el("td", { colSpan: cols }, el("div", { textContent: text }));
  // ถ้า retry ให้เพิ่มองค์ประกอบในหน้า
  if (retry) td.append(button("↻ ลองใหม่", "small retry", retry));
  // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
  $(tbodyId).replaceChildren(el("tr", { className: `msg-row ${kind}` }, td));
}

// ======================================================================
// เข้าสู่ระบบ (JWT) — เก็บ token ใน localStorage แล้วแนบ "Authorization: Bearer <token>" กับคำขอที่แก้ข้อมูล
// ไม่ login = ดูได้อย่างเดียว (ซ่อนปุ่มเพิ่ม/แก้ไข/ลบด้วย class admin-only)
// ======================================================================
const TOKEN_KEY = "stockpro.token";
// เก็บสถานะและค่าตั้งต้นใน session
const session = { token: null, user: null };

// บันทึกหรือลบ JWT ใน localStorage; หากเบราว์เซอร์ปิดกั้นการจัดเก็บ ให้ใช้งานต่อในหน้านี้
function saveToken(token) {
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // ถ้า token ให้ทำ localStorage.setItem(TOKEN_KEY, token)
    if (token) localStorage.setItem(TOKEN_KEY, token);
    // ทำกรณีที่เงื่อนไขก่อนหน้าไม่เป็นจริง
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ใช้งานต่อได้ แต่รีเฟรชแล้วต้อง login ใหม่
  }
}

// อ่าน JWT ที่เคยบันทึกไว้ และคืน null หาก localStorage ใช้งานไม่ได้
function loadToken() {
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // ส่งผล localStorage.getItem(TOKEN_KEY) กลับจากฟังก์ชัน
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // คืน null เพื่อบอกว่าไม่มีข้อมูลหรือไม่พบค่า
    return null;
  }
}

// อัปเดต token และผู้ใช้ปัจจุบัน พร้อมสลับปุ่มของผู้ดูแลระบบตาม role
function setSession(token, user) {
  // กำหนด session.token จาก token
  session.token = token;
  // กำหนด session.user จาก user
  session.user = user;
  // บันทึก token ตามสถานะใหม่
  saveToken(token);
  // อ่านค่าจากวัตถุที่อาจไม่มี แล้วเก็บใน isAdmin
  const isAdmin = user?.role === "admin";
  document.body.classList.toggle("is-admin", isAdmin); // สวิตช์เดียวคุมทั้งหน้า: CSS ซ่อน/แสดงปุ่มแอดมินตาม class นี้
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("auth-user").textContent = user?.email || "";
  // ปิดเมนูบัญชีหลังเปลี่ยนสถานะ
  closeAccountMenu();
}

// ---------- เมนูบัญชี (กดปุ่ม "บัญชี" ถึงจะเห็น) ----------
// ซ่อนเมนูบัญชีและตั้ง aria-expanded ให้สอดคล้องกับสถานะที่ปิด
function closeAccountMenu() {
  // กำหนดการซ่อนองค์ประกอบที่ระบุด้วย id
  $("account-menu").hidden = true;
  // ปรับ attribute เพื่อให้สถานะหน้าเว็บและการเข้าถึงสอดคล้องกัน
  $("account-btn").setAttribute("aria-expanded", "false");
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("account-btn").addEventListener("click", (e) => {
  // หยุดการส่งต่อเหตุการณ์คลิก เพื่อไม่ให้ตัวจัดการภายนอกปิดเมนู
  e.stopPropagation();
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน open
  const open = $("account-menu").hidden;
  // กำหนดการซ่อนองค์ประกอบที่ระบุด้วย id
  $("account-menu").hidden = !open;
  // ปรับ attribute เพื่อให้สถานะหน้าเว็บและการเข้าถึงสอดคล้องกัน
  $("account-btn").setAttribute("aria-expanded", String(open));
});
// คลิกที่อื่น หรือกด Esc แล้วเมนูปิด
document.addEventListener("click", (e) => {
  // ถ้า !e.target.closest(".account") ให้ทำ closeAccountMenu()
  if (!e.target.closest(".account")) closeAccountMenu();
});
// เมื่อเกิด keydown ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
document.addEventListener("keydown", (e) => {
  // ถ้า e.key === "Escape" ให้ทำ closeAccountMenu()
  if (e.key === "Escape") closeAccountMenu();
});

// ล้าง session และแจ้งผู้ใช้เมื่อมีข้อความให้แสดง
function logout(message = "ออกจากระบบแล้ว") {
  // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
  setSession(null, null);
  // ถ้า message ให้ทำ toast(message, "info")
  if (message) toast(message, "info");
}

// เรียก API ที่ต้องยืนยันตัวตน — ถ้า token หมดอายุ/ไม่ถูกต้อง ออกจากระบบให้อัตโนมัติ
// (401 จากรหัสผ่านเดิมผิดตอนเปลี่ยนรหัส ไม่ใช่ปัญหา token จึงไม่ออกจากระบบ)
const SESSION_ERROR_CODES = ["NO_TOKEN", "INVALID_TOKEN"];

// ส่งคำขอที่แนบ JWT; หากเซิร์ฟเวอร์ระบุว่า token ใช้ไม่ได้ ให้ล้าง session และแจ้งข้อผิดพลาด
async function apiFetch(url, { method, body } = {}) {
  const headers = { Authorization: `Bearer ${session.token}` }; // แนบบัตร JWT ไปกับทุกคำขอที่แก้ข้อมูล
  // ถ้า body !== undefined ให้ทำ headers["Content-Type"] = "application/json";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // ส่งคำขอ API แล้วเก็บคำตอบใน res
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) { // 401 = ไม่รู้ว่าเป็นใคร ดูรหัส error ว่าเป็นปัญหาบัตรหรือไม่
    const error = (await res.clone().json().catch(() => ({}))).error || {}; // clone = สำเนาคำตอบ เพราะเนื้อคำตอบอ่านได้ครั้งเดียว
    if (SESSION_ERROR_CODES.includes(error.code)) { // บัตรหาย/เสีย/หมดอายุ → ออกจากระบบให้ (รหัสผ่านเดิมผิดไม่เข้าเงื่อนไขนี้)
      // ล้างข้อมูลเข้าสู่ระบบเมื่อ token ใช้งานไม่ได้
      logout(null);
      // ส่งข้อผิดพลาดให้ตัวเรียกฟังก์ชันไปแสดงหรือจัดการ
      throw new Error(`${error.message} — กดปุ่ม "เข้าสู่ระบบ" มุมขวาบน`);
    }
  }
  // ส่ง res กลับจากฟังก์ชัน
  return res;
}

// ---------- PATCH /api/v1/auth/change-password ----------
const MIN_PASSWORD_LENGTH = 8;

// เปิดฟอร์มเปลี่ยนรหัสผ่าน ตรวจความยาวและการยืนยัน ก่อนส่ง PATCH ไปยัง API
function openChangePasswordForm() {
  // เปิดฟอร์มกลางพร้อมข้อมูลและงานบันทึกที่กำหนด
  openForm({
    // ตั้งชื่อหน้าต่างเป็น "เปลี่ยนรหัสผ่านผู้ดูแลระบบ"
    title: "เปลี่ยนรหัสผ่านผู้ดูแลระบบ",
    // กำหนดค่า submitLabel เป็น "เปลี่ยนรหัสผ่าน"
    submitLabel: "เปลี่ยนรหัสผ่าน",
    // กำหนดค่า failText เป็น "เปลี่ยนรหัสผ่านไม่สำเร็จ"
    failText: "เปลี่ยนรหัสผ่านไม่สำเร็จ",
    // เริ่มรายการช่องที่จะแสดงในแบบฟอร์ม
    fields: [
      // เพิ่มช่อง oldPassword ในฟอร์ม
      { key: "oldPassword", label: "รหัสผ่านปัจจุบัน", type: "password", required: true },
      {
        // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "newPassword"
        key: "newPassword",
        // กำหนดข้อความชื่อช่องเป็น "รหัสผ่านใหม่"
        label: "รหัสผ่านใหม่",
        // กำหนดชนิดช่องรับข้อมูลเป็น "password"
        type: "password",
        // กำหนดว่าช่องนี้ต้องกรอก
        required: true,
        // แสดงคำแนะนำช่องข้อมูลตาม `อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`
        hint: `อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
        // กำหนดกฎตรวจค่าช่องนี้ โดยคืนข้อความเมื่อไม่ผ่านหรือ null เมื่อผ่าน
        check: (v) => (v.length >= MIN_PASSWORD_LENGTH ? null : `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`),
      },
      // เพิ่มช่อง confirmPassword ในฟอร์ม
      { key: "confirmPassword", label: "ยืนยันรหัสผ่านใหม่", type: "password", required: true, hint: "พิมพ์รหัสผ่านใหม่อีกครั้ง" },
    ],
    // กำหนดงานที่จะทำหลังตรวจแบบฟอร์มผ่าน
    onSubmit: async (v) => {
      // ถ้า v.newPassword !== v.confirmPassword ให้แจ้งข้อผิดพลาด
      if (v.newPassword !== v.confirmPassword) throw new Error("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      // ส่งคำขอ API แล้วเก็บคำตอบใน res
      const res = await apiFetch(`${API_BASE}/auth/change-password`, {
        // กำหนดวิธีส่ง HTTP เป็น "PATCH"
        method: "PATCH",
        // กำหนดข้อมูลที่จะส่งในคำขอ API
        body: { oldPassword: v.oldPassword, newPassword: v.newPassword },
      });
      // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
      if (!res.ok) throw new Error(await readError(res));
      // แจ้งผลการทำงานให้ผู้ใช้เห็น
      toast("เปลี่ยนรหัสผ่านแล้ว — ครั้งหน้าใช้รหัสใหม่เข้าสู่ระบบ");
    },
  });
}

// ---------- POST /api/v1/auth/login ----------
// เปิดฟอร์มเข้าสู่ระบบ ส่งอีเมลกับรหัสผ่าน แล้วเก็บ token และข้อมูลผู้ใช้เมื่อสำเร็จ
function openLoginForm() {
  // เปิดฟอร์มกลางพร้อมข้อมูลและงานบันทึกที่กำหนด
  openForm({
    // ตั้งชื่อหน้าต่างเป็น "เข้าสู่ระบบผู้ดูแลระบบ"
    title: "เข้าสู่ระบบผู้ดูแลระบบ",
    // กำหนดค่า submitLabel เป็น "เข้าสู่ระบบ"
    submitLabel: "เข้าสู่ระบบ",
    // กำหนดค่า busyText เป็น "กำลังเข้าสู่ระบบ..."
    busyText: "กำลังเข้าสู่ระบบ...",
    // กำหนดค่า failText เป็น "เข้าสู่ระบบไม่สำเร็จ"
    failText: "เข้าสู่ระบบไม่สำเร็จ",
    // เริ่มรายการช่องที่จะแสดงในแบบฟอร์ม
    fields: [
      // เพิ่มช่อง email ในฟอร์ม
      { key: "email", label: "อีเมล", type: "email", required: true, placeholder: "อีเมลผู้ดูแลระบบ" },
      // เพิ่มช่อง password ในฟอร์ม
      { key: "password", label: "รหัสผ่าน", type: "password", required: true },
    ],
    // กำหนดงานที่จะทำหลังตรวจแบบฟอร์มผ่าน
    onSubmit: async (v) => {
      // ส่งคำขอ API แล้วเก็บคำตอบใน res
      const res = await fetch(`${API_BASE}/auth/login`, {
        // กำหนดวิธีส่ง HTTP เป็น "POST"
        method: "POST",
        // กำหนดส่วนหัว HTTP สำหรับคำขอนี้
        headers: JSON_HEADERS,
        // กำหนดข้อมูลที่จะส่งในคำขอ API
        body: JSON.stringify({ email: v.email, password: v.password }),
      });
      // อ่าน JSON จากคำตอบ API แล้วเก็บใน data
      const data = await res.json().catch(() => ({}));
      // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
      if (!res.ok) throw new Error(data.error?.message || `เข้าสู่ระบบไม่สำเร็จ: ${res.status}`);
      // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
      setSession(data.token, data.user);
      // แจ้งผลการทำงานให้ผู้ใช้เห็น
      toast(`เข้าสู่ระบบแล้ว — เพิ่ม แก้ไข และลบข้อมูลได้`);
    },
  });
}

// ---------- GET /api/v1/auth/me — ตรวจว่า token ที่จำไว้จากครั้งก่อนยังใช้ได้ ----------
// ตรวจ token ที่ค้างจากการเปิดครั้งก่อนกับ /auth/me และกลับเป็นผู้เยี่ยมชมหากใช้ไม่ได้
async function restoreSession() {
  // อ่าน token ที่เคยบันทึกไว้เพื่อกู้คืนการเข้าสู่ระบบ
  const token = loadToken();
  // ถ้า !token ให้ส่งผลกลับและหยุดฟังก์ชัน
  if (!token) return setSession(null, null);
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // ส่งคำขอ API แล้วเก็บคำตอบใน res
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
    if (!res.ok) throw new Error();
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setSession(token, (await res.json()).data);
  } catch {
    setSession(null, null); // token หมดอายุหรือเซิร์ฟเวอร์ปิด — กลับเป็นโหมดดูอย่างเดียว
  }
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("login-btn").addEventListener("click", openLoginForm);
// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("banner-login").addEventListener("click", openLoginForm);
// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("logout-btn").addEventListener("click", () => logout());
// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("change-password-btn").addEventListener("click", () => {
  // ปิดเมนูบัญชีหลังเปลี่ยนสถานะ
  closeAccountMenu();
  // เปิดหน้าต่างเปลี่ยนรหัสผ่านเมื่อกดเมนู
  openChangePasswordForm();
});

// สร้างช่องปุ่มแก้ไขและลบ โดยให้ CSS แสดงเฉพาะผู้ดูแลระบบ
function actionsCell(onEdit, onDelete) {
  // คืนช่องตารางที่รวมปุ่มแก้ไขและลบสำหรับผู้ดูแลระบบ
  return el(
    // เลือกแท็ก td เพื่อสร้างองค์ประกอบ DOM
    "td",
    // กำหนดคลาส CSS และคุณสมบัติขององค์ประกอบที่กำลังสร้าง
    { className: "actions admin-only" },
    // สร้างองค์ประกอบ div พร้อมข้อความหรือคลาสที่ระบุ
    el("div", { className: "row-actions" }, button("แก้ไข", "small", onEdit), button("ลบ", "small danger", onDelete)),
  );
}

// แสดงตัวเลขราคาแบบไทย พร้อมทศนิยมสองตำแหน่งทุกกรณี
const formatPrice = (value) =>
  // แปลงค่าเป็นตัวเลขก่อนจัดรูปแบบราคา
  Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ======================================================================
// หน้าต่างป๊อปอัปฟอร์ม — ใช้ร่วมกันทั้งเพิ่ม/แก้ไข
// fields: [{ key, label, type: "text"|"number"|"email"|"select", required, placeholder, hint, step,
//            options: [{ value, label }], emptyLabel, check: (value) => ข้อความ error หรือ null }]
// onSubmit(values) ต้อง throw Error ถ้าบันทึกไม่สำเร็จ — ข้อความจะแสดงในหน้าต่าง
// ======================================================================
// สร้างฟอร์มจากคำอธิบายช่องข้อมูล ตรวจค่า แสดงข้อผิดพลาดรายช่อง และเรียก onSubmit เมื่อผ่าน
function openForm({ title, fields, values = {}, submitLabel, onSubmit, extra = null, busyText = "กำลังบันทึก...", failText = "บันทึกไม่สำเร็จ" }) { // ฟอร์มป๊อปอัปกลาง ทุกฟอร์มเรียกตัวนี้ (ต่างกันแค่รายการช่อง fields กับ onSubmit)
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน dialog
  const dialog = $("form-dialog");
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน msg
  const msg = $("dialog-msg");
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน submitBtn
  const submitBtn = $("dialog-submit");
  // เก็บรายการข้อมูลที่ระบุใน inputs
  const inputs = [];

  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("dialog-title").textContent = title;
  // แสดงข้อความจาก submitLabel ใน submitBtn.textContent
  submitBtn.textContent = submitLabel;
  // แสดงข้อความจาก "" ใน msg.textContent
  msg.textContent = "";
  // เปลี่ยนคลาสของ msg.className เป็น "dialog-msg"
  msg.className = "dialog-msg";

  // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
  $("dialog-fields").replaceChildren(
    // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
    ...fields.map((f) => {
      // ประกาศ input ไว้เก็บค่าที่จะกำหนดภายหลัง
      let input;
      // ตรวจ f.type === "select" ก่อนทำคำสั่งในบล็อกนี้
      if (f.type === "select") {
        // กำหนด input จาก el("select")
        input = el("select");
        // ถ้า f.emptyLabel !== undefined ให้เพิ่มองค์ประกอบในหน้า
        if (f.emptyLabel !== undefined) input.append(new Option(f.emptyLabel, ""));
        // เพิ่มองค์ประกอบที่สร้างไว้เข้าไปท้ายส่วนนี้ของหน้า
        f.options.forEach((o) => input.append(new Option(o.label, o.value)));
      } else {
        // กำหนด input จาก el("input", { type: f.type || "text", placeholder: f.placeholder || "" })
        input = el("input", { type: f.type || "text", placeholder: f.placeholder || "" });
        // ตรวจ f.type === "number" ก่อนทำคำสั่งในบล็อกนี้
        if (f.type === "number") {
          // กำหนด input.min จาก "0"
          input.min = "0";
          // กำหนด input.step จาก f.step || "1"
          input.step = f.step || "1";
        }
      }
      // กำหนด input.id จาก `field-${f.key}`
      input.id = `field-${f.key}`;
      input.value = values[f.key] ?? ""; // ?? ใช้ค่าสำรองเฉพาะตอนไม่มีค่า (เลข 0 ยังแสดงเป็น 0)
      // สร้างองค์ประกอบ HTML แล้วเก็บใน error
      const error = el("small", { className: "field-error" });
      // เก็บช่องที่สร้างพร้อมข้อความ error เพื่อใช้ตรวจและล้างค่าในภายหลัง
      inputs.push({ f, input, error });
      // สร้างองค์ประกอบ HTML แล้วเก็บใน wrap
      const wrap = el("div", { className: "field" }, el("label", { htmlFor: input.id, textContent: f.label + (f.required ? " *" : "") }), input);
      // ถ้า f.hint ให้เพิ่มองค์ประกอบในหน้า
      if (f.hint) wrap.append(el("small", { className: "field-hint", textContent: f.hint }));
      // เพิ่มองค์ประกอบที่สร้างไว้เข้าไปท้ายส่วนนี้ของหน้า
      wrap.append(error);
      // ส่ง wrap กลับจากฟังก์ชัน
      return wrap;
    }),
  );

  // ล้างค่าที่กรอกและข้อความ error ทั้งหมด
  const clearForm = () => {
    // วนผ่านช่องในฟอร์มเพื่อปรับค่าหรือสถานะของแต่ละช่อง
    inputs.forEach(({ input, error }) => {
      // กำหนด input.value จาก ""
      input.value = "";
      // แสดงข้อความจาก "" ใน error.textContent
      error.textContent = "";
      // ปรับคลาส CSS เพื่อเปลี่ยนสถานะการแสดงผล
      input.classList.remove("invalid");
    });
    // แสดงข้อความจาก "" ใน msg.textContent
    msg.textContent = "";
    // เปลี่ยนคลาสของ msg.className เป็น "dialog-msg"
    msg.className = "dialog-msg";
  };

  // ฟอร์มเพิ่มข้อมูลมีปุ่ม "ใส่ข้อมูลตัวอย่าง" (กดซ้ำได้ชุดใหม่) และ "ล้างฟอร์ม"
  const extraBtn = $("dialog-extra");
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน clearBtn
  const clearBtn = $("dialog-clear");
  // กำหนดการซ่อน extraBtn.hidden ตาม !extra
  extraBtn.hidden = !extra;
  // กำหนดการซ่อน clearBtn.hidden ตาม !extra
  clearBtn.hidden = !extra;
  // ตรวจ extra ก่อนทำคำสั่งในบล็อกนี้
  if (extra) {
    // แสดงข้อความจาก extra.label ใน extraBtn.textContent
    extraBtn.textContent = extra.label;
    // กำหนด extraBtn.onclick จาก () => {
    extraBtn.onclick = () => {
      // ล้างค่าและข้อความผิดพลาดของฟอร์มก่อนกรอกใหม่
      clearForm();
      // เลือกข้อมูลตัวอย่างชุดถัดไปโดยวนกลับเมื่อถึงท้ายรายการ
      const sample = extra.values();
      // วนผ่านช่องในฟอร์มเพื่อปรับค่าหรือสถานะของแต่ละช่อง
      inputs.forEach(({ f, input }) => {
        // ถ้า sample[f.key] !== undefined ให้ทำ input.value = sample[f.key];
        if (sample[f.key] !== undefined) input.value = sample[f.key];
      });
    };
    // กำหนด clearBtn.onclick จาก () => {
    clearBtn.onclick = () => {
      // ล้างค่าและข้อความผิดพลาดของฟอร์มก่อนกรอกใหม่
      clearForm();
      // ย้ายโฟกัสไปยังช่องที่ผู้ใช้ควรกรอก
      inputs[0].input.focus();
    };
  }

  // ปิดหน้าต่างป๊อปอัป
  $("dialog-cancel").onclick = () => dialog.close();

  // ผูกการส่งฟอร์มกับการตรวจข้อมูลและเรียก API
  $("dialog-form").onsubmit = async (e) => {
    e.preventDefault(); // กันฟอร์มรีโหลดหน้า
    // ตรวจสอบเบื้องต้นฝั่ง Frontend ก่อนส่ง (ไม่ทดแทนการตรวจฝั่ง Backend)
    const result = {};
    // เก็บช่องแรกที่ตรวจไม่ผ่าน เพื่อเลื่อนโฟกัสไปหลังตรวจครบ
    let firstInvalid = null;
    // วนตาม const { f, input, error } of inputs เพื่อประมวลผลแต่ละรายการ
    for (const { f, input, error } of inputs) {
      // ตัดช่องว่างหัวท้ายของค่าที่ผู้ใช้กรอกก่อนตรวจ
      const value = input.value.trim();
      // เริ่มต้นว่าช่องนี้ไม่มีข้อผิดพลาด แล้วตรวจตามกฎด้านล่าง
      let problem = null;
      if (f.required && value === "") problem = `กรุณา${f.type === "select" ? "เลือก" : "กรอก"}${f.label}`; // ช่องบังคับว่าง → แจ้งเตือนรายช่อง
      else if (value !== "" && f.check) problem = f.check(value); // กฎเฉพาะช่อง เช่น ราคา > 0 อีเมลถูกรูปแบบ
      // แสดงข้อความจาก problem || "" ใน error.textContent
      error.textContent = problem || "";
      // ปรับคลาส CSS เพื่อเปลี่ยนสถานะการแสดงผล
      input.classList.toggle("invalid", Boolean(problem));
      // ถ้า problem && !firstInvalid ให้ทำ firstInvalid = input;
      if (problem && !firstInvalid) firstInvalid = input;
      // กำหนด result[f.key] จาก value
      result[f.key] = value;
    }
    if (firstInvalid) return firstInvalid.focus(); // มีช่องผิด → หยุด ไม่ยิง API เลย (ตรวจก่อนส่ง)

    submitBtn.disabled = true; // ปิดปุ่มกันกดซ้ำระหว่างบันทึก
    // แสดงข้อความจาก busyText ใน msg.textContent
    msg.textContent = busyText;
    // เปลี่ยนคลาสของ msg.className เป็น "dialog-msg"
    msg.className = "dialog-msg";
    // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
    try {
      await onSubmit(result); // ยิง API จริง (POST/PATCH) ถ้าพังจะ throw ไป catch
      // ปิดหน้าต่างป๊อปอัป
      dialog.close();
    } catch (err) {
      msg.textContent = `${failText}: ${errorText(err)}`; // พลาด → ข้อความแดงในป๊อปอัป ไม่ปิดฟอร์ม ข้อมูลที่กรอกไม่หาย
      // เปลี่ยนคลาสของ msg.className เป็น "dialog-msg error"
      msg.className = "dialog-msg error";
    } finally {
      // กำหนด submitBtn.disabled จาก false
      submitBtn.disabled = false;
    }
  };

  // เปิดหน้าต่างป๊อปอัปแบบ modal
  dialog.showModal();
  // ย้ายโฟกัสไปยังช่องที่ผู้ใช้ควรกรอก
  inputs[0].input.focus();
}

// กำหนดรูปแบบตรวจอีเมลว่ามีข้อความก่อนและหลัง @ รวมทั้งจุดในโดเมน
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// กำหนดรูปแบบเบอร์โทรให้ใช้ตัวเลข เครื่องหมาย + - หรือช่องว่าง ความยาว 6–20 ตัว
const PHONE_PATTERN = /^[0-9+\-\s]{6,20}$/;

// ---------- ข้อมูลตัวอย่างสำหรับปุ่ม "ใส่ข้อมูลตัวอย่าง" — กดซ้ำได้ชุดถัดไป ----------
// category / supplier = คำค้นในชื่อหมวดหมู่ / ชื่อผู้จัดจำหน่ายที่มีอยู่จริง (เรียงตามความเหมาะสม) — สินค้าจะได้หมวดและผู้จัดจำหน่ายที่เข้ากัน
const SAMPLE_PRODUCTS = [
  // ข้อมูลตัวอย่างสินค้า Bluetooth Speaker พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Bluetooth Speaker", price: "1590.00", stock_quantity: "25", category: ["electronic"], supplier: ["tech"] },
  // ข้อมูลตัวอย่างสินค้า Wireless Earbuds พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Wireless Earbuds", price: "1290.00", stock_quantity: "30", category: ["electronic"], supplier: ["tech"] },
  // ข้อมูลตัวอย่างสินค้า Power Bank 20000mAh พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Power Bank 20000mAh", price: "790.00", stock_quantity: "55", category: ["electronic"], supplier: ["tech"] },
  // ข้อมูลตัวอย่างสินค้า USB-C Cable 1m พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "USB-C Cable 1m", price: "199.00", stock_quantity: "120", category: ["electronic"], supplier: ["tech"] },
  // ข้อมูลตัวอย่างสินค้า 27-inch LED Monitor พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "27-inch LED Monitor", price: "4590.00", stock_quantity: "9", category: ["electronic"], supplier: ["tech"] },
  // ข้อมูลตัวอย่างสินค้า Webcam 1080p พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Webcam 1080p", price: "990.00", stock_quantity: "40", category: ["electronic"], supplier: ["tech"] },
  // ข้อมูลตัวอย่างสินค้า Polo Shirt พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Polo Shirt", price: "490.00", stock_quantity: "80", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  // ข้อมูลตัวอย่างสินค้า Running Shorts พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Running Shorts", price: "450.00", stock_quantity: "75", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  // ข้อมูลตัวอย่างสินค้า Wool Beanie พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Wool Beanie", price: "290.00", stock_quantity: "60", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  // ข้อมูลตัวอย่างสินค้า Cotton Hoodie พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Cotton Hoodie", price: "690.00", stock_quantity: "45", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  // ข้อมูลตัวอย่างสินค้า Slim Fit Jeans พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Slim Fit Jeans", price: "990.00", stock_quantity: "35", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  // ข้อมูลตัวอย่างสินค้า Ceramic Coffee Mug พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Ceramic Coffee Mug", price: "159.00", stock_quantity: "60", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Non-stick Frying Pan พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Non-stick Frying Pan", price: "590.00", stock_quantity: "45", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Air Fryer 4L พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Air Fryer 4L", price: "2990.00", stock_quantity: "12", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Glass Food Container Set พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Glass Food Container Set", price: "390.00", stock_quantity: "50", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Robot Vacuum Cleaner พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Robot Vacuum Cleaner", price: "5990.00", stock_quantity: "7", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Standing Desk พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Standing Desk", price: "8900.00", stock_quantity: "6", category: ["furniture"], supplier: ["furniture", "smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Bookshelf 5-Tier พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Bookshelf 5-Tier", price: "2490.00", stock_quantity: "14", category: ["furniture"], supplier: ["furniture", "smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า Bedside Table พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Bedside Table", price: "1290.00", stock_quantity: "18", category: ["furniture"], supplier: ["furniture", "smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า LED Desk Lamp พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "LED Desk Lamp", price: "890.00", stock_quantity: "24", category: ["furniture", "home"], supplier: ["smarthome", "home"] },
  // ข้อมูลตัวอย่างสินค้า A4 Copy Paper 500 sheets พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "A4 Copy Paper 500 sheets", price: "125.00", stock_quantity: "200", category: ["stationery", "office"], supplier: ["office", "paper"] },
  // ข้อมูลตัวอย่างสินค้า Sticky Notes Pack พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Sticky Notes Pack", price: "49.00", stock_quantity: "300", category: ["stationery", "office"], supplier: ["office", "paper"] },
  // ข้อมูลตัวอย่างสินค้า Desk Organizer พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Desk Organizer", price: "259.00", stock_quantity: "45", category: ["stationery", "office"], supplier: ["office", "paper"] },
  // ข้อมูลตัวอย่างสินค้า Highlighter Set 6 colors พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Highlighter Set 6 colors", price: "99.00", stock_quantity: "120", category: ["stationery", "office"], supplier: ["office", "paper"] },
  // ข้อมูลตัวอย่างสินค้า Yoga Mat 6mm พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Yoga Mat 6mm", price: "450.00", stock_quantity: "50", category: ["sport"], supplier: ["sport"] },
  // ข้อมูลตัวอย่างสินค้า Stainless Water Bottle 750ml พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Stainless Water Bottle 750ml", price: "390.00", stock_quantity: "90", category: ["sport"], supplier: ["sport"] },
  // ข้อมูลตัวอย่างสินค้า Resistance Band Set พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Resistance Band Set", price: "350.00", stock_quantity: "70", category: ["sport"], supplier: ["sport"] },
  // ข้อมูลตัวอย่างสินค้า Camping Tent 2P พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Camping Tent 2P", price: "3290.00", stock_quantity: "8", category: ["sport"], supplier: ["sport"] },
  // ข้อมูลตัวอย่างสินค้า Learn Node.js Handbook พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Learn Node.js Handbook", price: "590.00", stock_quantity: "25", category: ["book"], supplier: ["book"] },
  // ข้อมูลตัวอย่างสินค้า SQL Basics Workbook พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "SQL Basics Workbook", price: "450.00", stock_quantity: "30", category: ["book"], supplier: ["book"] },
  // ข้อมูลตัวอย่างสินค้า Building Blocks 500 pcs พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Building Blocks 500 pcs", price: "790.00", stock_quantity: "22", category: ["toy"], supplier: ["toy"] },
  // ข้อมูลตัวอย่างสินค้า Remote Control Car พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Remote Control Car", price: "1190.00", stock_quantity: "15", category: ["toy"], supplier: ["toy"] },
  // ข้อมูลตัวอย่างสินค้า Garden Hose 15m พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Garden Hose 15m", price: "450.00", stock_quantity: "30", category: ["garden"], supplier: ["garden"] },
  // ข้อมูลตัวอย่างสินค้า Plant Pot Set of 3 พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Plant Pot Set of 3", price: "290.00", stock_quantity: "55", category: ["garden"], supplier: ["garden"] },
  // ข้อมูลตัวอย่างสินค้า Moisturizing Cream 50g พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Moisturizing Cream 50g", price: "350.00", stock_quantity: "60", category: ["beauty"], supplier: ["beauty", "fashion"] },
  // ข้อมูลตัวอย่างสินค้า Dry Dog Food 3kg พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Dry Dog Food 3kg", price: "520.00", stock_quantity: "40", category: ["pet"], supplier: ["pet"] },
  // ข้อมูลตัวอย่างสินค้า Cat Scratching Post พร้อมราคา จำนวน และคำค้นสำหรับจับคู่หมวดกับผู้จัดจำหน่าย
  { name: "Cat Scratching Post", price: "690.00", stock_quantity: "16", category: ["pet"], supplier: ["pet"] },
];
// เก็บรายการข้อมูลที่ระบุใน SAMPLE_CATEGORIES
const SAMPLE_CATEGORIES = [
  // ข้อมูลตัวอย่างหมวดหมู่ Sports พร้อมคำอธิบาย
  { name: "Sports", description: "อุปกรณ์กีฬา" },
  // ข้อมูลตัวอย่างหมวดหมู่ Books พร้อมคำอธิบาย
  { name: "Books", description: "หนังสือและสื่อการเรียน" },
  // ข้อมูลตัวอย่างหมวดหมู่ Toys พร้อมคำอธิบาย
  { name: "Toys", description: "ของเล่นเด็ก" },
  // ข้อมูลตัวอย่างหมวดหมู่ Beauty พร้อมคำอธิบาย
  { name: "Beauty", description: "เครื่องสำอางและความงาม" },
  // ข้อมูลตัวอย่างหมวดหมู่ Garden พร้อมคำอธิบาย
  { name: "Garden", description: "อุปกรณ์ทำสวน" },
  // ข้อมูลตัวอย่างหมวดหมู่ Office Supplies พร้อมคำอธิบาย
  { name: "Office Supplies", description: "อุปกรณ์สำนักงาน" },
];
// เก็บรายการข้อมูลที่ระบุใน SAMPLE_SUPPLIERS
const SAMPLE_SUPPLIERS = [
  // ข้อมูลตัวอย่างผู้จัดจำหน่าย SportGear Co., Ltd. พร้อมอีเมลและเบอร์โทร
  { name: "SportGear Co., Ltd.", email: "sales@sportgear.co.th", phone: "021112222" },
  // ข้อมูลตัวอย่างผู้จัดจำหน่าย BookWorld Distribution พร้อมอีเมลและเบอร์โทร
  { name: "BookWorld Distribution", email: "contact@bookworld.co.th", phone: "022223333" },
  // ข้อมูลตัวอย่างผู้จัดจำหน่าย ToyLand Trading พร้อมอีเมลและเบอร์โทร
  { name: "ToyLand Trading", email: "info@toyland.co.th", phone: "023334444" },
  // ข้อมูลตัวอย่างผู้จัดจำหน่าย GlowCare Beauty Supply พร้อมอีเมลและเบอร์โทร
  { name: "GlowCare Beauty Supply", email: "hello@glowcare.co.th", phone: "026667777" },
  // ข้อมูลตัวอย่างผู้จัดจำหน่าย GreenGarden Supply พร้อมอีเมลและเบอร์โทร
  { name: "GreenGarden Supply", email: "hello@greengarden.co.th", phone: "024445555" },
  // ข้อมูลตัวอย่างผู้จัดจำหน่าย OfficePro Thailand พร้อมอีเมลและเบอร์โทร
  { name: "OfficePro Thailand", email: "order@officepro.co.th", phone: "025556666" },
];
// เก็บสถานะและค่าตั้งต้นใน sampleTurn
const sampleTurn = { product: Math.floor(Math.random() * 1000), category: 0, supplier: 0 };

const findByKeywords = (items, keywords) => { // หาหมวด/ผู้จัดจำหน่ายที่ชื่อมีคำค้น (เรียงตามความเหมาะสม)
  // วนตาม const keyword of keywords เพื่อประมวลผลแต่ละรายการ
  for (const keyword of keywords) {
    // ค้นหารายการแรกที่ตรงเงื่อนไขแล้วเก็บใน hit
    const hit = items.find((item) => item.name.toLowerCase().includes(keyword));
    // ถ้า hit ให้ทำ return hit;
    if (hit) return hit;
  }
  // คืน null เพื่อบอกว่าไม่มีข้อมูลหรือไม่พบค่า
  return null;
};

// SKU รูปแบบเดียวกับข้อมูลเดิม: SKU-<อักษร 3 ตัวแรกของหมวดหมู่>-<เลขลำดับถัดไป> เช่น SKU-ELE-006
// หาหมายเลข SKU ถัดไปจากสินค้าในหมวดเดียวกัน โดยใช้รหัสหมวดสามตัวอักษร
function nextSku(category) { // SKU รูปแบบเดิม: SKU-<3 ตัวอักษรหมวด>-<เลขถัดไป>
  // ดึงตัวอักษรอังกฤษสามตัวแรกจากชื่อหมวดหมู่เพื่อใช้เป็นรหัส SKU
  const prefix = category.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
  // สร้างรูปแบบตรวจข้อความแล้วเก็บใน pattern
  const pattern = new RegExp(`^SKU-${prefix}-(\\d+)$`);
  // อ่านเลขท้าย SKU ของสินค้าที่มีอยู่เพื่อหาลำดับถัดไป
  const used = state.products.map((p) => Number(pattern.exec(p.sku)?.[1] ?? 0));
  // ส่งผล `SKU-${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, "0")}` กลับจากฟังก์ชัน
  return `SKU-${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
}

// เลือกสินค้าตัวอย่างที่ (1) มีหมวดหมู่ที่เข้ากันอยู่ในระบบ (2) ชื่อยังไม่ซ้ำ (3) มีผู้จัดจำหน่ายที่เข้ากัน — แล้วเติมหมวดหมู่/ผู้จัดจำหน่าย/SKU ให้สอดคล้องกัน
// เลือกสินค้าตัวอย่างที่ชื่อไม่ซ้ำและมีหมวดที่เข้ากัน; ถ้าไม่มีหมวดให้กรอกข้อมูลพื้นฐานก่อน
function nextProductSample() { // เลือกสินค้าตัวอย่างที่หมวดและผู้จัดจำหน่ายเข้ากัน ชื่อไม่ซ้ำ
  // สร้างชุดข้อมูลไม่ซ้ำใน takenNames เพื่อใช้ตรวจซ้ำ
  const takenNames = new Set(state.products.map((p) => p.product_name.toLowerCase()));
  // แปลงสมาชิกแต่ละตัวแล้วเก็บรายการใหม่ใน candidates
  const candidates = SAMPLE_PRODUCTS.map((sample) => ({
    // ส่งค่า sample ต่อในรายการนี้
    sample,
    // กำหนดค่า category เป็น findByKeywords(state.categories, sample.category)
    category: findByKeywords(state.categories, sample.category),
    // กำหนดค่า supplier เป็น findByKeywords(state.suppliers, sample.supplier)
    supplier: findByKeywords(state.suppliers, sample.supplier),
  // คงเฉพาะสินค้าตัวอย่างที่มีหมวดตรงกันและชื่อยังไม่ซ้ำ
  })).filter((c) => c.category && !takenNames.has(c.sample.name.toLowerCase()));
  // กรองสมาชิกตามเงื่อนไขแล้วเก็บใน matched
  const matched = candidates.filter((c) => c.supplier);
  // เลือกกลุ่มตัวอย่างที่มีผู้จัดจำหน่ายตรงกัน ถ้าไม่มีใช้กลุ่มที่มีหมวดตรงกัน
  const pool = matched.length > 0 ? matched : candidates;

  // ตรวจ pool.length === 0 ก่อนทำคำสั่งในบล็อกนี้
  if (pool.length === 0) {
    // เลือกข้อมูลตัวอย่างชุดถัดไปโดยวนกลับเมื่อถึงท้ายรายการ
    const sample = SAMPLE_PRODUCTS[sampleTurn.product++ % SAMPLE_PRODUCTS.length];
    // หากยังจับคู่หมวดไม่ได้ ให้เติมเพียงข้อมูลพื้นฐานเพื่อให้ผู้ใช้เลือกหมวดเอง
    return { name: sample.name, price: sample.price, stock_quantity: sample.stock_quantity };
  }
  // แยก { sample, category, supplier } จาก pool[sampleTurn.product++ % pool.length]
  const { sample, category, supplier } = pool[sampleTurn.product++ % pool.length];
  // เติม SKU หมวดหมู่ และผู้จัดจำหน่ายที่จับคู่ได้ลงในสินค้าตัวอย่าง
  return {
    // กำหนดค่า name เป็น sample.name
    name: sample.name,
    // กำหนดค่า price เป็น sample.price
    price: sample.price,
    // กำหนดค่า stock_quantity เป็น sample.stock_quantity
    stock_quantity: sample.stock_quantity,
    // กำหนดค่า sku เป็น nextSku(category)
    sku: nextSku(category),
    // กำหนดค่า category_id เป็น category.id
    category_id: category.id,
    // กำหนดค่า supplier_id เป็น supplier?.id ?? ""
    supplier_id: supplier?.id ?? "",
  };
}

// เลือกชุดที่ชื่อ (หรืออีเมล) ยังไม่มีในระบบ เพราะฐานข้อมูลห้ามซ้ำ — ถ้าใช้ครบทุกชุดแล้ว ต่อท้ายด้วยตัวเลข
// เลือกข้อมูลตัวอย่างที่ยังไม่ซ้ำ; เมื่อใช้ชุดเดิมครบแล้วเติมลำดับให้ไม่ชนข้อมูลเดิม
function nextUniqueSample(list, turnKey, isTaken, makeUnique) {
  // วนตาม let i = 0; i < list.length; i++ เพื่อประมวลผลแต่ละรายการ
  for (let i = 0; i < list.length; i++) {
    // เลือกข้อมูลตัวอย่างชุดถัดไปโดยวนกลับเมื่อถึงท้ายรายการ
    const sample = list[sampleTurn[turnKey]++ % list.length];
    // ถ้า !isTaken(sample) ให้ทำ return { ...sample };
    if (!isTaken(sample)) return { ...sample };
  }
  // ส่งผล makeUnique({ ...list[sampleTurn[turnKey]++ % list.length] }, Date.now() % 1000) กลับจากฟังก์ชัน
  return makeUnique({ ...list[sampleTurn[turnKey]++ % list.length] }, Date.now() % 1000);
}

// หาตัวอย่างหมวดหมู่ที่ชื่อไม่ซ้ำกับรายการใน state
function nextCategorySample() {
  // สร้างชุดข้อมูลไม่ซ้ำใน taken เพื่อใช้ตรวจซ้ำ
  const taken = new Set(state.categories.map((c) => c.name.toLowerCase()));
  // เลือกหมวดตัวอย่างที่ชื่อไม่ซ้ำ หรือเติมเลขท้ายเมื่อใช้ทุกชื่อแล้ว
  return nextUniqueSample(SAMPLE_CATEGORIES, "category", (s) => taken.has(s.name.toLowerCase()), (s, n) => ({ ...s, name: `${s.name} ${n}` }));
}

// หาตัวอย่างผู้จัดจำหน่ายที่รหัส ชื่อ และอีเมลไม่ซ้ำ
function nextSupplierSample() {
  // สร้างชุดข้อมูลไม่ซ้ำใน taken เพื่อใช้ตรวจซ้ำ
  const taken = new Set(state.suppliers.map((s) => s.email.toLowerCase()));
  // เลือกผู้จัดจำหน่ายตัวอย่างที่อีเมลไม่ซ้ำ หรือเติมเลขในชื่อและอีเมล
  return nextUniqueSample(SAMPLE_SUPPLIERS, "supplier", (s) => taken.has(s.email), (s, n) => ({
    // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
    ...s,
    // กำหนดค่า name เป็น `${s.name} ${n}`
    name: `${s.name} ${n}`,
    // กำหนดค่า email เป็น s.email.replace("@", `${n}@`)
    email: s.email.replace("@", `${n}@`),
  }));
}

// ส่งคำขอ DELETE ที่ต้องมี JWT และแปลงคำตอบผิดพลาดให้ผู้เรียกแสดงได้
async function deleteRequest(url) {
  // แจ้งผลการทำงานให้ผู้ใช้เห็น
  toast("กำลังลบ...", "info");
  // ส่งคำขอ API แล้วเก็บคำตอบใน res
  const res = await apiFetch(url, { method: "DELETE" });
  // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
  if (!res.ok) throw new Error(await readError(res, "ลองรีเฟรชหน้าแล้วทำใหม่"));
}

// ======================================================================
// สินค้า
// ======================================================================

// ---------- GET /api/v1/products ----------
// โหลดรายการสินค้าจาก API เก็บใน state แล้ววาดตาราง; เมื่อผิดพลาดแสดงปุ่มลองใหม่
async function loadProducts({ highlightId = null } = {}) { // GET สินค้า (สาธารณะ ใช้ fetch ธรรมดา) → เก็บใน state → วาดตาราง
  // ถ้า state.products.length === 0 ให้ทำ messageRow("product-rows", "กำลังโหลดข้อมูล...")
  if (state.products.length === 0) messageRow("product-rows", "กำลังโหลดข้อมูล...");
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // ส่งคำขอ API แล้วเก็บคำตอบใน res
    const res = await fetch(`${API_BASE}/products`);
    // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
    if (!res.ok) throw new Error(await readError(res, "ฐานข้อมูลอาจไม่ได้เปิดอยู่ — ตรวจว่า Docker และ MySQL ทำงาน"));
    // กำหนด state.products จาก (await res.json()).data || []
    state.products = (await res.json()).data || [];
    // วาดตารางใหม่จากข้อมูลที่อยู่ใน state
    renderProducts(highlightId);
  } catch (err) {
    // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
    messageRow("product-rows", `โหลดข้อมูลไม่สำเร็จ: ${errorText(err)}`, "error", () => {
      // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
      messageRow("product-rows", "กำลังโหลดข้อมูล...");
      // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
      loadProducts();
    });
    // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
    $("search-result").textContent = "";
  }
}

// สร้างแถวสินค้าใหม่จาก state อัปเดตจำนวนและราคา แล้วไฮไลต์แถวที่เพิ่งบันทึก
function renderProducts(highlightId = null) {
  // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
  setCount("count-products", state.products.length);
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("price-th").textContent = `ราคา (${display.currency === "THB" ? "บาท" : display.currency})`;
  // ตรวจ state.products.length === 0 ก่อนทำคำสั่งในบล็อกนี้
  if (state.products.length === 0) {
    // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
    messageRow("product-rows", "ยังไม่มีสินค้า — กดปุ่ม \"＋ เพิ่มสินค้า\" มุมขวาบน");
    // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
    $("search-result").textContent = "";
    // ออกจากฟังก์ชันทันที เพราะกรณีนี้จัดการเสร็จแล้ว
    return;
  }
  // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
  $("product-rows").replaceChildren(
    // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
    ...state.products.map((p) => {
      // สร้างองค์ประกอบ HTML แล้วเก็บใน tr
      const tr = el(
        // เลือกแท็ก tr เพื่อสร้างองค์ประกอบ DOM
        "tr",
        // กำหนดคลาส CSS และคุณสมบัติขององค์ประกอบที่กำลังสร้าง
        { className: p.id === highlightId ? "highlight" : "" },
        // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
        el("td", { className: "id", textContent: p.id }),
        // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
        el("td", { className: "strong", textContent: p.product_name }),
        // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
        el("td", { className: "sub hide-md", textContent: p.sku }),
        // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
        el("td", { className: "hide-xs" }, categoryCell(p)),
        // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
        el("td", { className: "hide-sm" }, supplierCell(p)),
        // เพิ่มช่องราคาที่แปลงเป็นสกุลเงินที่เลือก
        priceCell(p),
        // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
        el("td", { className: "num", textContent: `${p.stock_quantity} ชิ้น` }),
        // เพิ่มช่องปุ่มแก้ไขและลบสำหรับผู้ดูแลระบบในแถวนี้
        actionsCell(() => openProductForm(p), () => deleteProduct(p)),
      );
      // ข้อความที่ใช้ค้นหา: ชื่อ, SKU, หมวดหมู่, ผู้จัดจำหน่าย
      tr.dataset.search = [p.product_name, p.sku, p.category_name, p.supplier_name || ""].join(" ").toLowerCase(); // ฝังข้อความค้นหาไว้ในแถว ใช้กรองโดยไม่ยิง API
      // กำหนด tr.dataset.category จาก String(p.category_id)
      tr.dataset.category = String(p.category_id);
      // กำหนด tr.dataset.supplier จาก p.supplier_id === null ? NO_SUPPLIER : String(p.supplier_id)
      tr.dataset.supplier = p.supplier_id === null ? NO_SUPPLIER : String(p.supplier_id);
      // ส่ง tr กลับจากฟังก์ชัน
      return tr;
    }),
  );
  // กรองแถวสินค้าใหม่ตามค่าค้นหาและตัวกรอง
  applySearch();
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน highlighted
  const highlighted = $("product-rows").querySelector("tr.highlight");
  // ตรวจ highlighted ก่อนทำคำสั่งในบล็อกนี้
  if (highlighted) {
    highlighted.scrollIntoView({ block: "nearest" }); // เลื่อนให้เห็นแถวที่เพิ่งเพิ่ม/แก้
    // สีจางหมดแล้วเอา class ออก ให้แถวกลับเป็นปกติ (ชี้เมาส์แล้วเปลี่ยนสีได้ตามเดิม)
    // ใช้ตัวจับเวลาด้วย เพราะถ้าแท็บถูกซ่อนอยู่ เบราว์เซอร์จะหยุดเล่นอนิเมชันและไม่ส่ง animationend
    const clearHighlight = () => highlighted.classList.remove("highlight");
    // ลบไฮไลต์เมื่อภาพเคลื่อนไหวจบ และรับเหตุการณ์เพียงครั้งเดียว
    highlighted.cells[0].addEventListener("animationend", clearHighlight, { once: true });
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setTimeout(clearHighlight, 3200);
  }
}

// ---------- แสดงราคาทุกแถวเป็นสกุลเงินเดียวกัน (แถบ "แสดงราคาเป็น") ----------
// ขออัตราจาก API เดิมครั้งเดียวต่อการเลือก แล้วคูณราคาทุกแถวด้วยสูตรเดียวกับ backend (ราคา × อัตรา ปัด 2 ตำแหน่ง)
const display = { currency: "THB", rate: 1 }; // สกุลเงินที่แสดงทั้งตารางตอนนี้ + อัตราจาก THB
// กำหนดค่าเริ่มต้น displaySeq เป็น 0
let displaySeq = 0;

// สร้างช่องราคาเป็นบาทหรือคูณอัตราแลกเปลี่ยนสำหรับสกุลที่เลือก พร้อมแสดงราคาบาทเดิม
function priceCell(p) {
  // ถ้า display.currency === "THB" ให้ส่งผลกลับและหยุดฟังก์ชัน
  if (display.currency === "THB") return el("td", { className: "num", textContent: formatPrice(p.price) });
  const converted = Number((Number(p.price) * display.rate).toFixed(2)); // สูตรเดียวกับ backend: ราคา × อัตรา ปัด 2 ตำแหน่ง
  // คืนช่องราคาที่แสดงทั้งราคาที่แปลงแล้วและราคาบาทเดิม
  return el(
    // เลือกแท็ก td เพื่อสร้างองค์ประกอบ DOM
    "td",
    // กำหนดคลาส CSS และคุณสมบัติขององค์ประกอบที่กำลังสร้าง
    { className: "num" },
    // สร้างองค์ประกอบ div พร้อมข้อความหรือคลาสที่ระบุ
    el("div", { className: "strong", textContent: `${formatPrice(converted)} ${display.currency}` }),
    // สร้างองค์ประกอบ div พร้อมข้อความหรือคลาสที่ระบุ
    el("div", { className: "sub", textContent: `${formatPrice(p.price)} บาท` }),
  );
}

// อัปเดต aria-checked ของปุ่มสกุลเงินให้ตรงกับสกุลที่ใช้อยู่
function markDisplayChip(code) {
  // ปรับ attribute เพื่อให้สถานะหน้าเว็บและการเข้าถึงสอดคล้องกัน
  document.querySelectorAll("#currency-chips .chip").forEach((chip) => chip.setAttribute("aria-checked", String(chip.dataset.currency === code)));
}

// แสดงข้อความสถานะอัตราแลกเปลี่ยนและเปลี่ยนสีเมื่อเกิดข้อผิดพลาด
function setCurrencyNote(text, isError = false) {
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("currency-note").textContent = text;
  // เปลี่ยนรูปแบบข้อความอัตราแลกเปลี่ยนตามสถานะข้อผิดพลาด
  $("currency-note").className = isError ? "currency-note error" : "currency-note";
}

// ขออัตราแลกเปลี่ยนครั้งเดียวต่อการเลือก ป้องกันคำตอบเก่าทับคำตอบใหม่ แล้ววาดราคาทั้งตาราง
async function setDisplayCurrency(code) {
  // เพิ่มลำดับคำขอ เพื่อแยกคำตอบล่าสุดออกจากคำตอบเก่า
  const seq = ++displaySeq;
  // ตรวจ code === "THB" ก่อนทำคำสั่งในบล็อกนี้
  if (code === "THB") {
    // กำหนด display.currency จาก "THB"
    display.currency = "THB";
    // กำหนด display.rate จาก 1
    display.rate = 1;
    // ทำเครื่องหมายปุ่มสกุลเงินที่ใช้อยู่ให้ถูกต้อง
    markDisplayChip("THB");
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setCurrencyNote("");
    // วาดตารางใหม่จากข้อมูลที่อยู่ใน state
    renderProducts();
    // ออกจากฟังก์ชันทันที เพราะกรณีนี้จัดการเสร็จแล้ว
    return;
  }
  // ถ้า state.products.length === 0 ให้ส่งผลกลับและหยุดฟังก์ชัน
  if (state.products.length === 0) return setCurrencyNote("ยังไม่มีสินค้าให้แปลงราคา", true);

  // ปิดปุ่มสกุลเงินชั่วคราวขณะรอคำตอบ API
  document.querySelectorAll("#currency-chips .chip").forEach((chip) => (chip.disabled = true));
  // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
  setCurrencyNote("กำลังดึงอัตราแลกเปลี่ยน...");
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    const res = await fetch(`${API_BASE}/products/${state.products[0].id}/price?currency=${encodeURIComponent(code)}`); // ขออัตราครั้งเดียวผ่านสินค้าชิ้นแรก แล้วคูณเองทุกแถว (ไม่ยิงทีละสินค้า)
    // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
    if (!res.ok) throw new Error(await readError(res, "ลองใหม่อีกครั้ง"));
    // แยก { data } จาก await res.json()
    const { data } = await res.json();
    // ถ้า seq !== displaySeq ให้ทำ return;
    if (seq !== displaySeq) return;
    // ถ้า data.fallback ให้แจ้งข้อผิดพลาด
    if (data.fallback) throw new Error("API อัตราแลกเปลี่ยนไม่พร้อมในขณะนี้");
    // กำหนด display.currency จาก code
    display.currency = code;
    // กำหนด display.rate จาก data.rate
    display.rate = data.rate;
    // ทำเครื่องหมายปุ่มสกุลเงินที่ใช้อยู่ให้ถูกต้อง
    markDisplayChip(code);
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setCurrencyNote(`อัตรา 1 ${code} ≈ ${formatPrice(1 / data.rate)} บาท`);
    // วาดตารางใหม่จากข้อมูลที่อยู่ใน state
    renderProducts();
  } catch (err) {
    // ถ้า seq !== displaySeq ให้ทำ return;
    if (seq !== displaySeq) return;
    // ทำเครื่องหมายปุ่มสกุลเงินที่ใช้อยู่ให้ถูกต้อง
    markDisplayChip(display.currency);
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setCurrencyNote(`แปลงราคาไม่สำเร็จ: ${errorText(err)}`, true);
  } finally {
    // ถ้า seq === displaySeq ให้ทำ document.querySelectorAll("#currency-chips .chip").forEach((chip) => (chip.disabled = fals
    if (seq === displaySeq) document.querySelectorAll("#currency-chips .chip").forEach((chip) => (chip.disabled = false));
  }
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("currency-chips").addEventListener("click", (e) => {
  // หาปุ่มสกุลเงินที่ผู้ใช้กดจากเป้าหมายของเหตุการณ์
  const chip = e.target.closest(".chip");
  // ถ้า chip && !chip.disabled ให้ทำ setDisplayCurrency(chip.dataset.currency)
  if (chip && !chip.disabled) setDisplayCurrency(chip.dataset.currency);
});

// ---------- ค้นหาสินค้า (กรองแถวที่โหลดมาแล้วฝั่งหน้าเว็บ ไม่เรียก API เพิ่ม) ----------
// matches(row): เงื่อนไขเพิ่มเติมนอกจากคำค้นหา (เช่น ตัวเลือกหมวดหมู่) — คืน true ถ้าแถวนี้ต้องแสดง
// กรองแถวตารางจากข้อความค้นหาและเงื่อนไขเสริมโดยใช้ข้อมูลที่อยู่ในเบราว์เซอร์
function filterRows({ inputId, bodyId, resultId, noMatchText, matches = () => true }) { // ซ่อน/แสดงแถวตามคำค้น + เงื่อนไขเพิ่ม (กรองในเบราว์เซอร์ ไม่ยิง API)
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน query
  const query = $(inputId).value.trim().toLowerCase();
  // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน body
  const body = $(bodyId);
  // ลบแถวข้อความไม่พบข้อมูลเก่าก่อนกรองใหม่
  body.querySelector("tr.no-match")?.remove();
  // เก็บรายการข้อมูลที่ระบุใน rows
  const rows = [...body.querySelectorAll("tr[data-search]")];
  // ถ้า rows.length === 0 ให้ทำ return;
  if (rows.length === 0) return;

  // กำหนดค่าเริ่มต้น shown เป็น 0
  let shown = 0;
  // วนตรวจแถวแต่ละแถวเพื่อกำหนดว่าควรแสดงหรือซ่อน
  rows.forEach((row) => {
    // กำหนดการซ่อน row.hidden ตาม !(matches(row) && (!query || row.dataset.search.includes(query)))
    row.hidden = !(matches(row) && (!query || row.dataset.search.includes(query)));
    // ถ้า !row.hidden ให้ทำ shown++;
    if (!row.hidden) shown++;
  });

  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $(resultId).textContent = shown < rows.length || query ? `พบ ${shown} จาก ${rows.length} รายการ` : `ทั้งหมด ${rows.length} รายการ`;
  // ตรวจ shown === 0 ก่อนทำคำสั่งในบล็อกนี้
  if (shown === 0) {
    // นับจำนวนคอลัมน์ของตารางเพื่อให้ข้อความสถานะกินเต็มแถว
    const cols = body.closest("table").tHead.rows[0].cells.length;
    // เพิ่มองค์ประกอบที่สร้างไว้เข้าไปท้ายส่วนนี้ของหน้า
    body.append(el("tr", { className: "msg-row no-match" }, el("td", { colSpan: cols, textContent: noMatchText })));
  }
}

// กำหนดค่าเริ่มต้น NO_MATCH_HINT เป็น "— ค้นด้วยคำอื่น หรือลบคำค้นหาเพื่อแสดงทั้งหมด"
const NO_MATCH_HINT = "— ค้นด้วยคำอื่น หรือลบคำค้นหาเพื่อแสดงทั้งหมด";
// กำหนดค่าเริ่มต้น NO_SUPPLIER เป็น "none"
const NO_SUPPLIER = "none";

// ใช้คำค้นหา หมวดหมู่ และผู้จัดจำหน่ายที่เลือกกรองแถวสินค้าในตารางเดียวกัน
const applySearch = () =>
  // ใช้ตัวกรองกลางกับข้อความค้นหาและเงื่อนไขที่กำหนด
  filterRows({
    // กำหนดค่า inputId เป็น "product-search"
    inputId: "product-search",
    // กำหนดค่า bodyId เป็น "product-rows"
    bodyId: "product-rows",
    // กำหนดค่า resultId เป็น "search-result"
    resultId: "search-result",
    // กำหนดค่า noMatchText เป็น "ไม่พบสินค้าที่ตรงกับคำค้นหาหรือตัวกรอง — ลองเปลี่ยนคำค้นหา หรือเลือก \"ทุกหมวดหมู่\" / \"
    noMatchText: "ไม่พบสินค้าที่ตรงกับคำค้นหาหรือตัวกรอง — ลองเปลี่ยนคำค้นหา หรือเลือก \"ทุกหมวดหมู่\" / \"ทุกผู้จัดจำหน่าย\"",
    // กำหนดค่า matches เป็น (row) => {
    matches: (row) => {
      // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน category
      const category = $("filter-category").value;
      // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน supplier
      const supplier = $("filter-supplier").value;
      // ส่งผล (!category || row.dataset.category === category) && (!supplier || row.dataset.supplier === supplier) กลับจากฟังก์ชัน
      return (!category || row.dataset.category === category) && (!supplier || row.dataset.supplier === supplier);
    },
  });

// เติมตัวเลือกในเมนูกรองจาก state (เรียกทุกครั้งที่โหลดหมวดหมู่/ผู้จัดจำหน่ายใหม่) — ค่าที่เลือกไว้ยังอยู่ ถ้ารายการนั้นถูกลบแล้วจะกลับเป็น "ทั้งหมด"
// เติมตัวเลือกหมวดหมู่และผู้จัดจำหน่ายจาก state โดยรักษาค่าที่เลือกไว้หากยังมีรายการนั้น
function fillFilterOptions() { // เติมเมนูกรองจากข้อมูลจริง ถ้ารายการที่เลือกถูกลบ กลับเป็น 'ทั้งหมด'
  // ตัวช่วยเติมตัวเลือกใน select โดยรักษาค่าที่เลือกไว้ถ้ายังมีรายการนั้น
  const fill = (selectId, allLabel, items, extra = []) => {
    // หาองค์ประกอบบนหน้าเว็บแล้วเก็บใน select
    const select = $(selectId);
    // จำค่าที่เลือกก่อนสร้างตัวเลือกใหม่
    const previous = select.value;
    // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
    select.replaceChildren(
      // สร้างตัวเลือกเริ่มต้นของเมนูแบบเลื่อนลง
      new Option(allLabel, ""),
      // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
      ...items.map((item) => new Option(item.name, String(item.id))),
      // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
      ...extra,
    );
    // กำหนด select.value จาก [...select.options].some((o) => o.value === previous) ? previous : ""
    select.value = [...select.options].some((o) => o.value === previous) ? previous : "";
  };
  // เติมตัวเลือกของหมวดหมู่หรือผู้จัดจำหน่ายจากข้อมูลล่าสุด
  fill("filter-category", "ทุกหมวดหมู่", state.categories);
  // เติมตัวเลือกของหมวดหมู่หรือผู้จัดจำหน่ายจากข้อมูลล่าสุด
  fill("filter-supplier", "ทุกผู้จัดจำหน่าย", state.suppliers, [new Option("ไม่มีผู้จัดจำหน่าย", NO_SUPPLIER)]);
  // กรองแถวสินค้าใหม่ตามค่าค้นหาและตัวกรอง
  applySearch();
}

// เมื่อเกิด change ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("filter-category").addEventListener("change", applySearch);
// เมื่อเกิด change ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("filter-supplier").addEventListener("change", applySearch);

// ใช้ตัวกรองตารางกลางกับชื่อหมวดหมู่และแสดงข้อความเมื่อไม่พบข้อมูล
const applyCategorySearch = () => filterRows({ inputId: "category-search", bodyId: "category-rows", resultId: "category-search-result", noMatchText: `ไม่พบหมวดหมู่ที่ตรงกับคำค้นหา ${NO_MATCH_HINT}` });
// ใช้ตัวกรองตารางกลางกับข้อมูลผู้จัดจำหน่ายและแสดงข้อความเมื่อไม่พบข้อมูล
const applySupplierSearch = () => filterRows({ inputId: "supplier-search", bodyId: "supplier-rows", resultId: "supplier-search-result", noMatchText: `ไม่พบผู้จัดจำหน่ายที่ตรงกับคำค้นหา ${NO_MATCH_HINT}` });

// เมื่อเกิด input ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("product-search").addEventListener("input", applySearch);
// เมื่อเกิด input ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("category-search").addEventListener("input", applyCategorySearch);
// เมื่อเกิด input ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("supplier-search").addEventListener("input", applySupplierSearch);

// ======================================================================
// หน้าต่างรายละเอียด (อ่านอย่างเดียว) ของหมวดหมู่ / ผู้จัดจำหน่าย — ใช้ข้อมูลที่โหลดไว้แล้วใน state ไม่เรียก API เพิ่ม
// ======================================================================
// สร้างปุ่มชื่อที่กดเปิดหน้ารายละเอียดได้
function nameLink(text, onClick, extraClass = "") {
  // ส่งผล button(text, `link name-link ${extraClass}`.trim(), onClick) กลับจากฟังก์ชัน
  return button(text, `link name-link ${extraClass}`.trim(), onClick);
}

// ปุ่ม "รายละเอียด" ท้ายแถวตารางหมวดหมู่/ผู้จัดจำหน่าย — ทุกคนเห็น (ไม่ใช่ admin-only)
// สร้างช่องปุ่มรายละเอียดซึ่งผู้เยี่ยมชมกดดูได้
function detailCell(onClick) {
  // คืนช่องปุ่มรายละเอียดที่ทุกคนกดได้
  return el("td", { className: "actions" }, button("รายละเอียด", "small", onClick));
}

// เติมข้อมูลและรายการสินค้าลงหน้าต่างรายละเอียด แล้วเปิดหน้าต่าง
function openDetail({ title, subtitle, info, productsTitle, products }) {
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("detail-title").textContent = title;
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("detail-subtitle").textContent = subtitle;
  // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
  $("detail-info").replaceChildren(...info.flatMap(([label, value]) => [el("dt", { textContent: label }), el("dd", { textContent: value || "-" })]));
  // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
  $("detail-products-title").textContent = `${productsTitle} (${products.length} ชิ้น)`;
  // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
  $("detail-products").replaceChildren(
    // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
    ...(products.length === 0
      // เลือกข้อมูลกรณีเงื่อนไขเป็นจริง
      ? [el("li", { className: "empty", textContent: "ยังไม่มีสินค้า" })]
      // เลือกข้อมูลกรณีเงื่อนไขเป็นเท็จ
      : products.map((p) =>
          // สร้างองค์ประกอบ DOM จากข้อมูลที่ส่งให้ el
          el(
            // เลือกแท็ก li เพื่อสร้างองค์ประกอบ DOM
            "li",
            {},
            // สร้างองค์ประกอบ b พร้อมข้อความหรือคลาสที่ระบุ
            el("b", { textContent: p.product_name }),
            // สร้างองค์ประกอบ small พร้อมข้อความหรือคลาสที่ระบุ
            el("small", { textContent: `${p.sku} · ${formatPrice(p.price)} บาท · สต็อก ${p.stock_quantity} ชิ้น` }),
          ),
        )),
  );
  // เปิดหน้าต่างป๊อปอัปแบบ modal
  $("detail-dialog").showModal();
}

// แสดงข้อมูลหมวดหมู่พร้อมสินค้าที่มี category_id ตรงกัน
function openCategoryDetail(c) {
  // เปิดหน้าต่างรายละเอียดพร้อมข้อมูลที่กำหนด
  openDetail({
    // ตั้งชื่อหน้าต่างเป็น c.name
    title: c.name,
    // กำหนดค่า subtitle เป็น "รายละเอียดหมวดหมู่"
    subtitle: "รายละเอียดหมวดหมู่",
    // กำหนดค่า info เป็น [
    info: [
      // กำหนดคู่ข้อมูล ["ID", String(c.id)], สำหรับแสดงในหน้าต่างรายละเอียด
      ["ID", String(c.id)],
      // กำหนดคู่ข้อมูล ["คำอธิบาย", c.description], สำหรับแสดงในหน้าต่างรายละเอียด
      ["คำอธิบาย", c.description],
      // กำหนดคู่ข้อมูล ["จำนวนสินค้า", `${c.product_count} ชิ้น`], สำหรับแสดงในหน้าต่างรายละเอียด
      ["จำนวนสินค้า", `${c.product_count} ชิ้น`],
    ],
    // กำหนดค่า productsTitle เป็น "สินค้าในหมวดหมู่นี้"
    productsTitle: "สินค้าในหมวดหมู่นี้",
    // กำหนดค่า products เป็น state.products.filter((p) => p.category_id === c.id)
    products: state.products.filter((p) => p.category_id === c.id),
  });
}

// แสดงข้อมูลผู้จัดจำหน่ายพร้อมสินค้าที่มี supplier_id ตรงกัน
function openSupplierDetail(s) {
  // เปิดหน้าต่างรายละเอียดพร้อมข้อมูลที่กำหนด
  openDetail({
    // ตั้งชื่อหน้าต่างเป็น s.name
    title: s.name,
    // กำหนดค่า subtitle เป็น "รายละเอียดผู้จัดจำหน่าย"
    subtitle: "รายละเอียดผู้จัดจำหน่าย",
    // กำหนดค่า info เป็น [
    info: [
      // กำหนดคู่ข้อมูล ["ID", String(s.id)], สำหรับแสดงในหน้าต่างรายละเอียด
      ["ID", String(s.id)],
      // กำหนดคู่ข้อมูล ["รหัส", s.supplier_code], สำหรับแสดงในหน้าต่างรายละเอียด
      ["รหัส", s.supplier_code],
      // กำหนดคู่ข้อมูล ["อีเมล", s.email], สำหรับแสดงในหน้าต่างรายละเอียด
      ["อีเมล", s.email],
      // กำหนดคู่ข้อมูล ["เบอร์โทร", s.phone], สำหรับแสดงในหน้าต่างรายละเอียด
      ["เบอร์โทร", s.phone],
      // กำหนดคู่ข้อมูล ["จำนวนสินค้า", `${s.product_count} ชิ้น`], สำหรับแสดงในหน้าต่างรายละเอียด
      ["จำนวนสินค้า", `${s.product_count} ชิ้น`],
    ],
    // กำหนดค่า productsTitle เป็น "สินค้าจากผู้จัดจำหน่ายรายนี้"
    productsTitle: "สินค้าจากผู้จัดจำหน่ายรายนี้",
    // กำหนดค่า products เป็น state.products.filter((p) => p.supplier_id === s.id)
    products: state.products.filter((p) => p.supplier_id === s.id),
  });
}

// ชื่อหมวดหมู่/ผู้จัดจำหน่ายในตารางสินค้า: กดแล้วค่อยหาข้อมูลจาก state (3 ตารางโหลดพร้อมกัน ตอนวาดแถวอาจยังโหลดไม่ครบ)
// แสดงชื่อหมวดหมู่เป็นปุ่มและค้นหาข้อมูลล่าสุดเมื่อผู้ใช้กด
function categoryCell(p) {
  // แสดงชื่อหมวดหมู่เป็นปุ่ม; เมื่อกดจึงค้นหาข้อมูลล่าสุดและเปิดรายละเอียด
  return nameLink(p.category_name, () => {
    // หาหมวดหมู่ล่าสุดที่มี id ตรงกับสินค้า
    const c = state.categories.find((x) => x.id === p.category_id);
    // ถ้า c ให้ทำ openCategoryDetail(c)
    if (c) openCategoryDetail(c);
    // ทำกรณีที่เงื่อนไขก่อนหน้าไม่เป็นจริง
    else toast("ข้อมูลหมวดหมู่ยังโหลดไม่เสร็จ ลองกดอีกครั้ง", "info");
  });
}

// แสดงชื่อผู้จัดจำหน่ายเป็นปุ่ม หรือขีดกลางเมื่อสินค้าไม่มีผู้จัดจำหน่าย
function supplierCell(p) {
  // ถ้า p.supplier_id === null ให้ทำ return "-";
  if (p.supplier_id === null) return "-";
  // แสดงชื่อผู้จัดจำหน่ายเป็นปุ่ม; เมื่อกดจึงค้นหาข้อมูลล่าสุดและเปิดรายละเอียด
  return nameLink(p.supplier_name, () => {
    // หาผู้จัดจำหน่ายล่าสุดที่มี id ตรงกับสินค้า
    const s = state.suppliers.find((x) => x.id === p.supplier_id);
    // ถ้า s ให้ทำ openSupplierDetail(s)
    if (s) openSupplierDetail(s);
    // ทำกรณีที่เงื่อนไขก่อนหน้าไม่เป็นจริง
    else toast("ข้อมูลผู้จัดจำหน่ายยังโหลดไม่เสร็จ ลองกดอีกครั้ง", "info");
  });
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("detail-close").addEventListener("click", () => $("detail-dialog").close());

// กำหนดช่องและกฎตรวจข้อมูลของฟอร์มสินค้า โดยเพิ่มข้อกำหนดตามโหมดเพิ่มหรือแก้ไข
function productFields(isEdit) { // ช่องของฟอร์มสินค้า (ตอนแก้ไข SKU บังคับ)
  // ส่งชุดคำอธิบายช่องข้อมูลสินค้าให้ฟอร์มกลางสร้างช่องรับข้อมูล
  return [
    // เพิ่มช่อง name ในฟอร์ม
    { key: "name", label: "ชื่อสินค้า", required: true, placeholder: "เช่น USB-C Cable" },
    {
      // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "sku"
      key: "sku",
      // กำหนดข้อความชื่อช่องเป็น "รหัสสินค้า (SKU)"
      label: "รหัสสินค้า (SKU)",
      // กำหนดว่าช่องนี้ต้องกรอกตามเงื่อนไขที่ระบุ
      required: isEdit,
      // แสดงตัวอย่างการกรอก isEdit ? "" : "เว้นว่างได้ ระบบสร้างให้" ในช่องข้อมูล
      placeholder: isEdit ? "" : "เว้นว่างได้ ระบบสร้างให้",
      // แสดงคำแนะนำช่องข้อมูลตาม "ต้องไม่ซ้ำกับสินค้าอื่น"
      hint: "ต้องไม่ซ้ำกับสินค้าอื่น",
    },
    {
      // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "price"
      key: "price",
      // กำหนดข้อความชื่อช่องเป็น "ราคา (บาท)"
      label: "ราคา (บาท)",
      // กำหนดชนิดช่องรับข้อมูลเป็น "number"
      type: "number",
      // กำหนดค่า step เป็น "0.01"
      step: "0.01",
      // กำหนดว่าช่องนี้ต้องกรอก
      required: true,
      // แสดงตัวอย่างการกรอก "เช่น 199.50" ในช่องข้อมูล
      placeholder: "เช่น 199.50",
      // กำหนดกฎตรวจค่าช่องนี้ โดยคืนข้อความเมื่อไม่ผ่านหรือ null เมื่อผ่าน
      check: (v) => (Number(v) > 0 ? null : "ราคาต้องเป็นตัวเลขที่มากกว่า 0"),
    },
    {
      // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "stock_quantity"
      key: "stock_quantity",
      // กำหนดข้อความชื่อช่องเป็น "จำนวนสต็อก (ชิ้น)"
      label: "จำนวนสต็อก (ชิ้น)",
      // กำหนดชนิดช่องรับข้อมูลเป็น "number"
      type: "number",
      // กำหนดว่าช่องนี้ต้องกรอก
      required: true,
      // แสดงตัวอย่างการกรอก "เช่น 20 (ไม่มีของใส่ 0)" ในช่องข้อมูล
      placeholder: "เช่น 20 (ไม่มีของใส่ 0)",
      // กำหนดกฎตรวจค่าช่องนี้ โดยคืนข้อความเมื่อไม่ผ่านหรือ null เมื่อผ่าน
      check: (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? null : "จำนวนสต็อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป"),
    },
    {
      // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "category_id"
      key: "category_id",
      // กำหนดข้อความชื่อช่องเป็น "หมวดหมู่"
      label: "หมวดหมู่",
      // กำหนดชนิดช่องรับข้อมูลเป็น "select"
      type: "select",
      // กำหนดว่าช่องนี้ต้องกรอก
      required: true,
      // กำหนดค่า emptyLabel เป็น "-- เลือกหมวดหมู่ --"
      emptyLabel: "-- เลือกหมวดหมู่ --",
      // กำหนดตัวเลือกของช่องแบบ select
      options: state.categories.map((c) => ({ value: c.id, label: c.name })),
      // แสดงคำแนะนำช่องข้อมูลตาม state.categories.length ? "" : "ยังไม่มีหมวดหมู่ — เพิ่มที่เมนู \"หมวดหมู่\
      hint: state.categories.length ? "" : "ยังไม่มีหมวดหมู่ — เพิ่มที่เมนู \"หมวดหมู่\" ก่อน",
    },
    {
      // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "supplier_id"
      key: "supplier_id",
      // กำหนดข้อความชื่อช่องเป็น "ผู้จัดจำหน่าย"
      label: "ผู้จัดจำหน่าย",
      // กำหนดชนิดช่องรับข้อมูลเป็น "select"
      type: "select",
      // ต้องระบุผู้จัดจำหน่ายทุกครั้ง ทั้งเพิ่มและแก้ไข (สินค้าที่ผู้จัดจำหน่ายถูกลบไปแล้วต้องเลือกใหม่ก่อนบันทึก)
      required: true,
      // กำหนดค่า emptyLabel เป็น "-- เลือกผู้จัดจำหน่าย --"
      emptyLabel: "-- เลือกผู้จัดจำหน่าย --",
      // กำหนดตัวเลือกของช่องแบบ select
      options: state.suppliers.map((s) => ({ value: s.id, label: s.name })),
      // แสดงคำแนะนำช่องข้อมูลตาม state.suppliers.length ? "" : "ยังไม่มีผู้จัดจำหน่าย — เพิ่มที่เมนู \"ผู้จั
      hint: state.suppliers.length ? "" : "ยังไม่มีผู้จัดจำหน่าย — เพิ่มที่เมนู \"ผู้จัดจำหน่าย\" ก่อน",
    },
  ];
}

// ---------- POST /api/v1/products และ PATCH /api/v1/products/:id ----------
// เปิดฟอร์มสินค้า ส่ง POST เมื่อเพิ่มหรือ PATCH เมื่อแก้ไข แล้วโหลดตารางใหม่
function openProductForm(p = null) {
  // ตรวจว่ามีข้อมูลเดิมหรือไม่ เพื่อเลือกโหมดแก้ไขหรือเพิ่มใหม่
  const isEdit = p !== null;
  // เปิดฟอร์มกลางพร้อมข้อมูลและงานบันทึกที่กำหนด
  openForm({
    // ตั้งชื่อหน้าต่างเป็น isEdit ? `แก้ไขสินค้า: ${p.product_name}` : "เพิ่มสินค้าใหม่"
    title: isEdit ? `แก้ไขสินค้า: ${p.product_name}` : "เพิ่มสินค้าใหม่",
    // กำหนดค่า submitLabel เป็น isEdit ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"
    submitLabel: isEdit ? "บันทึกการแก้ไข" : "เพิ่มสินค้า",
    // เริ่มรายการช่องที่จะแสดงในแบบฟอร์ม
    fields: productFields(isEdit),
    // กำหนดค่าเริ่มต้นให้ช่องในแบบฟอร์ม
    values: isEdit
      // เลือกข้อมูลกรณีเงื่อนไขเป็นจริง
      ? {
          // กำหนดค่า name เป็น p.product_name
          name: p.product_name,
          // กำหนดค่า sku เป็น p.sku
          sku: p.sku,
          // กำหนดค่า price เป็น Number(p.price).toFixed(2)
          price: Number(p.price).toFixed(2),
          // กำหนดค่า stock_quantity เป็น p.stock_quantity
          stock_quantity: p.stock_quantity,
          // กำหนดค่า category_id เป็น p.category_id
          category_id: p.category_id,
          // กำหนดค่า supplier_id เป็น p.supplier_id
          supplier_id: p.supplier_id,
        }
      // เลือกข้อมูลกรณีเงื่อนไขเป็นเท็จ
      : {},
    // กำหนดค่า extra เป็น isEdit
    extra: isEdit
      // เลือกข้อมูลกรณีเงื่อนไขเป็นจริง
      ? null
      // เลือกข้อมูลกรณีเงื่อนไขเป็นเท็จ
      : {
          // กำหนดข้อความชื่อช่องเป็น "ใส่ข้อมูลตัวอย่าง"
          label: "ใส่ข้อมูลตัวอย่าง",
          // กำหนดค่าเริ่มต้นให้ช่องในแบบฟอร์ม
          values: nextProductSample,
        },
    // กำหนดงานที่จะทำหลังตรวจแบบฟอร์มผ่าน
    onSubmit: async (v) => {
      // เก็บสถานะและค่าตั้งต้นใน body
      const body = {
        // กำหนดค่า name เป็น v.name
        name: v.name,
        sku: v.sku || "SKU-" + Date.now(), // เว้นว่าง = ระบบสร้าง SKU ให้
        // กำหนดค่า price เป็น Number(v.price)
        price: Number(v.price),
        // กำหนดค่า stock_quantity เป็น Number(v.stock_quantity)
        stock_quantity: Number(v.stock_quantity),
        // กำหนดค่า category_id เป็น Number(v.category_id)
        category_id: Number(v.category_id),
        // กำหนดค่า supplier_id เป็น Number(v.supplier_id)
        supplier_id: Number(v.supplier_id),
      };
      const res = await apiFetch(isEdit ? `${API_BASE}/products/${p.id}` : `${API_BASE}/products`, { method: isEdit ? "PATCH" : "POST", body }); // แก้ไข = PATCH /:id, เพิ่ม = POST (ฟังก์ชันเดียวเลือกให้)
      // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
      if (!res.ok) throw new Error(await readError(res, "SKU นี้อาจซ้ำกับสินค้าอื่น"));
      // อ่าน JSON จากคำตอบ API แล้วเก็บใน saved
      const saved = await res.json();

      // แจ้งผลการทำงานให้ผู้ใช้เห็น
      toast(isEdit ? `บันทึกการแก้ไข "${body.name}" แล้ว` : `เพิ่ม "${body.name}" แล้ว — แถวที่ไฮไลต์สีฟ้าในตาราง`);
      // รอ loadProducts({ highlightId: isEdit ? p.id : saved.data?.id }) ให้เสร็จก่อนทำต่อ
      await loadProducts({ highlightId: isEdit ? p.id : saved.data?.id });
      // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
      loadCategories();
      // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
      loadSuppliers();
    },
  });
}

// ---------- DELETE /api/v1/products/:id ----------
// ขอยืนยันก่อนลบสินค้า ส่ง DELETE แล้วโหลดรายการใหม่
async function deleteProduct(p) {
  if (!confirm(`ลบสินค้า "${p.product_name}" (${p.sku}) ใช่ไหม?\nลบแล้วย้อนกลับไม่ได้`)) return; // ยืนยันก่อนลบ บอกผลกระทบ
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // รอ deleteRequest(`${API_BASE}/products/${p.id}`) ให้เสร็จก่อนทำต่อ
    await deleteRequest(`${API_BASE}/products/${p.id}`);
    // แจ้งผลการทำงานให้ผู้ใช้เห็น
    toast(`ลบสินค้า "${p.product_name}" แล้ว`);
    // รอ loadProducts() ให้เสร็จก่อนทำต่อ
    await loadProducts();
    // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
    loadCategories();
    // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
    loadSuppliers();
  } catch (err) {
    // แจ้งผลการทำงานให้ผู้ใช้เห็น
    toast(`ลบไม่สำเร็จ: ${errorText(err)}`, "error");
  }
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("add-product").addEventListener("click", () => openProductForm());

// ======================================================================
// หมวดหมู่
// ======================================================================

// ---------- GET /api/v1/categories ----------
// โหลดหมวดหมู่พร้อมจำนวนสินค้า แล้วสร้างแถวตารางและตัวเลือกสำหรับฟอร์มกับตัวกรอง
async function loadCategories() {
  // ถ้า state.categories.length === 0 ให้ทำ messageRow("category-rows", "กำลังโหลดข้อมูล...")
  if (state.categories.length === 0) messageRow("category-rows", "กำลังโหลดข้อมูล...");
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // ส่งคำขอ API แล้วเก็บคำตอบใน res
    const res = await fetch(`${API_BASE}/categories`);
    // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
    if (!res.ok) throw new Error(await readError(res, "ฐานข้อมูลอาจไม่ได้เปิดอยู่"));
    // กำหนด state.categories จาก (await res.json()).data || []
    state.categories = (await res.json()).data || [];
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setCount("count-categories", state.categories.length);
    // อัปเดตตัวเลือกกรองจากหมวดหมู่และผู้จัดจำหน่ายล่าสุด
    fillFilterOptions();
    // ตรวจ state.categories.length === 0 ก่อนทำคำสั่งในบล็อกนี้
    if (state.categories.length === 0) {
      // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
      $("category-search-result").textContent = "";
      // ส่งผล messageRow("category-rows", "ยังไม่มีหมวดหมู่ — กดปุ่ม \"＋ เพิ่มหมวดหมู่\" มุมขวาบน") กลับจากฟังก์ชัน
      return messageRow("category-rows", "ยังไม่มีหมวดหมู่ — กดปุ่ม \"＋ เพิ่มหมวดหมู่\" มุมขวาบน");
    }
    // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
    $("category-rows").replaceChildren(
      // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
      ...state.categories.map((c) => {
        // สร้างองค์ประกอบ HTML แล้วเก็บใน tr
        const tr = el(
          // เลือกแท็ก tr เพื่อสร้างองค์ประกอบ DOM
          "tr",
          {},
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "id hide-xs", textContent: c.id }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "strong", textContent: c.name }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "sub hide-sm", textContent: c.description || "-" }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "num", textContent: `${c.product_count} ชิ้น` }),
          // เพิ่มปุ่มเปิดรายละเอียดให้แถวนี้
          detailCell(() => openCategoryDetail(c)),
          // เพิ่มช่องปุ่มแก้ไขและลบสำหรับผู้ดูแลระบบในแถวนี้
          actionsCell(() => openCategoryForm(c), () => deleteCategory(c)),
        );
        tr.dataset.search = [c.name, c.description || ""].join(" ").toLowerCase(); // ฝังข้อความค้นหาไว้ในแถว ใช้กรองโดยไม่ยิง API
        // ส่ง tr กลับจากฟังก์ชัน
        return tr;
      }),
    );
    // กรองแถวหมวดหมู่ตามคำค้นหา
    applyCategorySearch();
  } catch (err) {
    // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
    $("category-search-result").textContent = "";
    // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
    messageRow("category-rows", `โหลดรายการหมวดหมู่ไม่สำเร็จ: ${errorText(err)}`, "error", () => {
      // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
      messageRow("category-rows", "กำลังโหลดข้อมูล...");
      // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
      loadCategories();
    });
  }
}

// ---------- POST /api/v1/categories และ PATCH /api/v1/categories/:id ----------
// เปิดฟอร์มหมวดหมู่ ส่ง POST หรือ PATCH ตามโหมด แล้วรีเฟรชข้อมูลที่เกี่ยวข้อง
function openCategoryForm(c = null) {
  // ตรวจว่ามีข้อมูลเดิมหรือไม่ เพื่อเลือกโหมดแก้ไขหรือเพิ่มใหม่
  const isEdit = c !== null;
  // เปิดฟอร์มกลางพร้อมข้อมูลและงานบันทึกที่กำหนด
  openForm({
    // ตั้งชื่อหน้าต่างเป็น isEdit ? `แก้ไขหมวดหมู่: ${c.name}` : "เพิ่มหมวดหมู่ใหม่"
    title: isEdit ? `แก้ไขหมวดหมู่: ${c.name}` : "เพิ่มหมวดหมู่ใหม่",
    // กำหนดค่า submitLabel เป็น isEdit ? "บันทึกการแก้ไข" : "เพิ่มหมวดหมู่"
    submitLabel: isEdit ? "บันทึกการแก้ไข" : "เพิ่มหมวดหมู่",
    // เริ่มรายการช่องที่จะแสดงในแบบฟอร์ม
    fields: [
      // เพิ่มช่อง name ในฟอร์ม
      { key: "name", label: "ชื่อหมวดหมู่", required: true, placeholder: "เช่น Sports", hint: "ต้องไม่ซ้ำกับหมวดหมู่อื่น" },
      // เพิ่มช่อง description ในฟอร์ม
      { key: "description", label: "คำอธิบาย", placeholder: "เช่น อุปกรณ์กีฬา" },
    ],
    // กำหนดค่าเริ่มต้นให้ช่องในแบบฟอร์ม
    values: isEdit ? { name: c.name, description: c.description } : {},
    // กำหนดค่า extra เป็น isEdit ? null : { label: "ใส่ข้อมูลตัวอย่าง", values: nextCategorySample }
    extra: isEdit ? null : { label: "ใส่ข้อมูลตัวอย่าง", values: nextCategorySample },
    // กำหนดงานที่จะทำหลังตรวจแบบฟอร์มผ่าน
    onSubmit: async (v) => {
      // เก็บสถานะและค่าตั้งต้นใน body
      const body = { name: v.name, description: v.description || null };
      const res = await apiFetch(isEdit ? `${API_BASE}/categories/${c.id}` : `${API_BASE}/categories`, { method: isEdit ? "PATCH" : "POST", body }); // แก้ไข = PATCH /:id, เพิ่ม = POST (ฟังก์ชันเดียวเลือกให้)
      // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
      if (!res.ok) throw new Error(await readError(res, "ชื่อหมวดหมู่นี้อาจมีอยู่แล้ว"));
      // แจ้งผลการทำงานให้ผู้ใช้เห็น
      toast(isEdit ? `บันทึกหมวดหมู่ "${body.name}" แล้ว` : `เพิ่มหมวดหมู่ "${body.name}" แล้ว — เลือกได้ตอนเพิ่มสินค้า`);
      // รอ loadCategories() ให้เสร็จก่อนทำต่อ
      await loadCategories();
      if (isEdit) loadProducts(); // ชื่อหมวดหมู่ในตารางสินค้าเปลี่ยนตาม
    },
  });
}

// ---------- DELETE /api/v1/categories/:id ----------
// แจ้งผลกระทบต่อสินค้าในหมวดก่อนลบ แล้วรีเฟรชข้อมูล
async function deleteCategory(c) {
  // หากหมวดนี้มีสินค้า ให้แจ้งจำนวนสินค้าที่จะถูกลบตามก่อนขอยืนยัน
  const warn = c.product_count > 0 ? `\n\n⚠️ สินค้า ${c.product_count} ชิ้นในหมวดนี้จะถูกลบไปด้วย` : "";
  if (!confirm(`ลบหมวดหมู่ "${c.name}" ใช่ไหม?\nลบแล้วย้อนกลับไม่ได้${warn}`)) return; // ยืนยันก่อนลบ บอกผลกระทบ
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // รอ deleteRequest(`${API_BASE}/categories/${c.id}`) ให้เสร็จก่อนทำต่อ
    await deleteRequest(`${API_BASE}/categories/${c.id}`);
    // แจ้งผลการทำงานให้ผู้ใช้เห็น
    toast(`ลบหมวดหมู่ "${c.name}" แล้ว`);
    // รอ loadCategories() ให้เสร็จก่อนทำต่อ
    await loadCategories();
    // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
    loadSuppliers();
    // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
    loadProducts();
  } catch (err) {
    // แจ้งผลการทำงานให้ผู้ใช้เห็น
    toast(`ลบไม่สำเร็จ: ${errorText(err)}`, "error");
  }
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("add-category").addEventListener("click", () => openCategoryForm());

// ======================================================================
// ผู้จัดจำหน่าย
// ======================================================================

// ---------- GET /api/v1/suppliers ----------
// โหลดผู้จัดจำหน่ายพร้อมจำนวนสินค้า แล้วสร้างแถวตารางและตัวเลือกที่ใช้ในฟอร์ม
async function loadSuppliers() {
  // ถ้า state.suppliers.length === 0 ให้ทำ messageRow("supplier-rows", "กำลังโหลดข้อมูล...")
  if (state.suppliers.length === 0) messageRow("supplier-rows", "กำลังโหลดข้อมูล...");
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // ส่งคำขอ API แล้วเก็บคำตอบใน res
    const res = await fetch(`${API_BASE}/suppliers`);
    // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
    if (!res.ok) throw new Error(await readError(res, "ฐานข้อมูลอาจไม่ได้เปิดอยู่"));
    // กำหนด state.suppliers จาก (await res.json()).data || []
    state.suppliers = (await res.json()).data || [];
    // อัปเดตสถานะหน้าเว็บตามค่าที่ส่งให้ฟังก์ชัน
    setCount("count-suppliers", state.suppliers.length);
    // อัปเดตตัวเลือกกรองจากหมวดหมู่และผู้จัดจำหน่ายล่าสุด
    fillFilterOptions();
    // ตรวจ state.suppliers.length === 0 ก่อนทำคำสั่งในบล็อกนี้
    if (state.suppliers.length === 0) {
      // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
      $("supplier-search-result").textContent = "";
      // ส่งผล messageRow("supplier-rows", "ยังไม่มีผู้จัดจำหน่าย — กดปุ่ม \"＋ เพิ่มผู้จัดจำหน่าย\" มุมขวาบน") กลับจากฟังก์ชัน
      return messageRow("supplier-rows", "ยังไม่มีผู้จัดจำหน่าย — กดปุ่ม \"＋ เพิ่มผู้จัดจำหน่าย\" มุมขวาบน");
    }
    // ล้างลูกเดิมและใส่องค์ประกอบใหม่ในส่วนนี้ของหน้า
    $("supplier-rows").replaceChildren(
      // กระจายสมาชิกจากรายการนี้เข้าไปในรายการผลลัพธ์
      ...state.suppliers.map((s) => {
        // สร้างองค์ประกอบ HTML แล้วเก็บใน tr
        const tr = el(
          // เลือกแท็ก tr เพื่อสร้างองค์ประกอบ DOM
          "tr",
          {},
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "id hide-xs", textContent: s.id }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "strong", textContent: s.name }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "sub hide-md", textContent: s.supplier_code }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "hide-sm", textContent: s.email }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "hide-md", textContent: s.phone || "-" }),
          // สร้างองค์ประกอบ td พร้อมข้อความหรือคลาสที่ระบุ
          el("td", { className: "num", textContent: `${s.product_count} ชิ้น` }),
          // เพิ่มปุ่มเปิดรายละเอียดให้แถวนี้
          detailCell(() => openSupplierDetail(s)),
          // เพิ่มช่องปุ่มแก้ไขและลบสำหรับผู้ดูแลระบบในแถวนี้
          actionsCell(() => openSupplierForm(s), () => deleteSupplier(s)),
        );
        tr.dataset.search = [s.name, s.supplier_code, s.email, s.phone || ""].join(" ").toLowerCase(); // ฝังข้อความค้นหาไว้ในแถว ใช้กรองโดยไม่ยิง API
        // ส่ง tr กลับจากฟังก์ชัน
        return tr;
      }),
    );
    // กรองแถวผู้จัดจำหน่ายตามคำค้นหา
    applySupplierSearch();
  } catch (err) {
    // เปลี่ยนข้อความขององค์ประกอบที่ระบุด้วย id
    $("supplier-search-result").textContent = "";
    // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
    messageRow("supplier-rows", `โหลดรายการผู้จัดจำหน่ายไม่สำเร็จ: ${errorText(err)}`, "error", () => {
      // แสดงข้อความสถานะในตารางแทนรายการข้อมูล
      messageRow("supplier-rows", "กำลังโหลดข้อมูล...");
      // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
      loadSuppliers();
    });
  }
}

// ---------- POST /api/v1/suppliers และ PATCH /api/v1/suppliers/:id ----------
// เปิดฟอร์มผู้จัดจำหน่าย ตรวจอีเมลกับเบอร์โทร; รหัสบังคับเฉพาะตอนแก้ไข แล้วส่ง POST หรือ PATCH
function openSupplierForm(s = null) {
  // ตรวจว่ามีข้อมูลเดิมหรือไม่ เพื่อเลือกโหมดแก้ไขหรือเพิ่มใหม่
  const isEdit = s !== null;
  // เปิดฟอร์มกลางพร้อมข้อมูลและงานบันทึกที่กำหนด
  openForm({
    // ตั้งชื่อหน้าต่างเป็น isEdit ? `แก้ไขผู้จัดจำหน่าย: ${s.name}` : "เพิ่มผู้จัดจำหน่ายใหม่"
    title: isEdit ? `แก้ไขผู้จัดจำหน่าย: ${s.name}` : "เพิ่มผู้จัดจำหน่ายใหม่",
    // กำหนดค่า submitLabel เป็น isEdit ? "บันทึกการแก้ไข" : "เพิ่มผู้จัดจำหน่าย"
    submitLabel: isEdit ? "บันทึกการแก้ไข" : "เพิ่มผู้จัดจำหน่าย",
    // เริ่มรายการช่องที่จะแสดงในแบบฟอร์ม
    fields: [
      // เพิ่มช่อง name ในฟอร์ม
      { key: "name", label: "ชื่อบริษัท", required: true, placeholder: "เช่น SportGear Co., Ltd." },
      {
        // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "email"
        key: "email",
        // กำหนดข้อความชื่อช่องเป็น "อีเมล"
        label: "อีเมล",
        // กำหนดชนิดช่องรับข้อมูลเป็น "email"
        type: "email",
        // กำหนดว่าช่องนี้ต้องกรอก
        required: true,
        // แสดงตัวอย่างการกรอก "เช่น sales@sportgear.co.th" ในช่องข้อมูล
        placeholder: "เช่น sales@sportgear.co.th",
        // แสดงคำแนะนำช่องข้อมูลตาม "ต้องไม่ซ้ำกับผู้จัดจำหน่ายอื่น"
        hint: "ต้องไม่ซ้ำกับผู้จัดจำหน่ายอื่น",
        // กำหนดกฎตรวจค่าช่องนี้ โดยคืนข้อความเมื่อไม่ผ่านหรือ null เมื่อผ่าน
        check: (v) => (EMAIL_PATTERN.test(v) ? null : "กรุณากรอกอีเมลให้ถูกต้อง เช่น sales@example.com"),
      },
      {
        // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "phone"
        key: "phone",
        // กำหนดข้อความชื่อช่องเป็น "เบอร์โทร"
        label: "เบอร์โทร",
        // แสดงตัวอย่างการกรอก "เช่น 021112222" ในช่องข้อมูล
        placeholder: "เช่น 021112222",
        // กำหนดกฎตรวจค่าช่องนี้ โดยคืนข้อความเมื่อไม่ผ่านหรือ null เมื่อผ่าน
        check: (v) => (PHONE_PATTERN.test(v) ? null : "เบอร์โทรต้องเป็นตัวเลข (6-20 หลัก)"),
      },
      {
        // ตั้งชื่อคีย์ข้อมูลช่องนี้เป็น "supplier_code"
        key: "supplier_code",
        // กำหนดข้อความชื่อช่องเป็น "รหัสผู้จัดจำหน่าย"
        label: "รหัสผู้จัดจำหน่าย",
        // กำหนดว่าช่องนี้ต้องกรอกตามเงื่อนไขที่ระบุ
        required: isEdit,
        // แสดงตัวอย่างการกรอก isEdit ? "" : "เว้นว่างได้ ระบบสร้างให้" ในช่องข้อมูล
        placeholder: isEdit ? "" : "เว้นว่างได้ ระบบสร้างให้",
      },
    ],
    // กำหนดค่าเริ่มต้นให้ช่องในแบบฟอร์ม
    values: isEdit ? { name: s.name, email: s.email, phone: s.phone, supplier_code: s.supplier_code } : {},
    // กำหนดค่า extra เป็น isEdit ? null : { label: "ใส่ข้อมูลตัวอย่าง", values: nextSupplierSample }
    extra: isEdit ? null : { label: "ใส่ข้อมูลตัวอย่าง", values: nextSupplierSample },
    // กำหนดงานที่จะทำหลังตรวจแบบฟอร์มผ่าน
    onSubmit: async (v) => {
      // เก็บสถานะและค่าตั้งต้นใน body
      const body = {
        // กำหนดค่า name เป็น v.name
        name: v.name,
        // กำหนดค่า email เป็น v.email
        email: v.email,
        // กำหนดค่า phone เป็น v.phone || null
        phone: v.phone || null,
        // กำหนดค่า supplier_code เป็น v.supplier_code || "SUP-" + String(Date.now()).slice(-8)
        supplier_code: v.supplier_code || "SUP-" + String(Date.now()).slice(-8),
      };
      const res = await apiFetch(isEdit ? `${API_BASE}/suppliers/${s.id}` : `${API_BASE}/suppliers`, { method: isEdit ? "PATCH" : "POST", body }); // แก้ไข = PATCH /:id, เพิ่ม = POST (ฟังก์ชันเดียวเลือกให้)
      // ถ้า !res.ok ให้แจ้งข้อผิดพลาด
      if (!res.ok) throw new Error(await readError(res, "อีเมลหรือรหัสผู้จัดจำหน่ายนี้อาจมีอยู่แล้ว"));
      // แจ้งผลการทำงานให้ผู้ใช้เห็น
      toast(isEdit ? `บันทึกผู้จัดจำหน่าย "${body.name}" แล้ว` : `เพิ่มผู้จัดจำหน่าย "${body.name}" แล้ว — เลือกได้ตอนเพิ่มสินค้า`);
      // รอ loadSuppliers() ให้เสร็จก่อนทำต่อ
      await loadSuppliers();
      if (isEdit) loadProducts(); // ชื่อผู้จัดจำหน่ายในตารางสินค้าเปลี่ยนตาม
    },
  });
}

// ---------- DELETE /api/v1/suppliers/:id ----------
// แจ้งว่าสินค้าจะยังอยู่แต่ไม่มีผู้จัดจำหน่าย แล้วลบและรีเฟรชข้อมูล
async function deleteSupplier(s) {
  // หากมีสินค้าผูกอยู่ ให้แจ้งว่าสินค้ายังอยู่แต่จะไม่มีผู้จัดจำหน่าย
  const warn = s.product_count > 0 ? `\n\nสินค้า ${s.product_count} ชิ้นจะเปลี่ยนเป็น "ไม่มีผู้จัดจำหน่าย" (สินค้าไม่ถูกลบ)` : "";
  if (!confirm(`ลบผู้จัดจำหน่าย "${s.name}" ใช่ไหม?\nลบแล้วย้อนกลับไม่ได้${warn}`)) return; // ยืนยันก่อนลบ บอกผลกระทบ
  // เริ่มทำงานส่วนที่อาจเกิดข้อผิดพลาด เพื่อให้ catch จัดการได้
  try {
    // รอ deleteRequest(`${API_BASE}/suppliers/${s.id}`) ให้เสร็จก่อนทำต่อ
    await deleteRequest(`${API_BASE}/suppliers/${s.id}`);
    // แจ้งผลการทำงานให้ผู้ใช้เห็น
    toast(`ลบผู้จัดจำหน่าย "${s.name}" แล้ว`);
    // รอ loadSuppliers() ให้เสร็จก่อนทำต่อ
    await loadSuppliers();
    // โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
    loadProducts();
  } catch (err) {
    // แจ้งผลการทำงานให้ผู้ใช้เห็น
    toast(`ลบไม่สำเร็จ: ${errorText(err)}`, "error");
  }
}

// เมื่อเกิด click ให้เรียกตัวจัดการเหตุการณ์ที่ระบุ
$("add-supplier").addEventListener("click", () => openSupplierForm());

// ======================================================================
// เมนู สินค้า / หมวดหมู่ / ผู้จัดจำหน่าย (จำเมนูไว้ใน URL เช่น #categories รีเฟรชแล้วอยู่หน้าเดิม)
// ======================================================================
// เปิดแท็บที่เลือก ซ่อนแผงอื่น อัปเดต aria-selected และจำแท็บไว้ใน URL
function showTab(name) {
  // เก็บรายการข้อมูลที่ระบุใน tabs
  const tabs = [...document.querySelectorAll(".tab")];
  // ถ้า !tabs.some((t ให้ทำ => t.dataset.tab === name)) name = "products";
  if (!tabs.some((t) => t.dataset.tab === name)) name = "products";
  // ปรับ attribute เพื่อให้สถานะหน้าเว็บและการเข้าถึงสอดคล้องกัน
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  // ซ่อนทุกแผงเนื้อหายกเว้นแผงของแท็บที่เลือก
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    // กำหนดการซ่อน panel.hidden ตาม panel.dataset.panel !== name
    panel.hidden = panel.dataset.panel !== name;
  });
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`); // จำแท็บใน URL (#categories) โดยไม่โหลดหน้าใหม่
}

// ผูกปุ่มแท็บทุกปุ่มกับ showTab เพื่อสลับเนื้อหาเมื่อคลิก
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
// เปิดแท็บตามค่า hash ของ URL เมื่อเริ่มหน้า
showTab(location.hash.slice(1));

restoreSession(); // เช็กบัตรที่จำไว้ (GET /auth/me)

loadProducts(); // โหลดสินค้าผ่าน GET สาธารณะ; สองบรรทัดถัดไปโหลดหมวดหมู่และผู้จัดจำหน่าย
// โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
loadCategories();
// โหลดข้อมูลชุดนี้จาก API ใหม่แล้วแสดงบนหน้า
loadSuppliers();
