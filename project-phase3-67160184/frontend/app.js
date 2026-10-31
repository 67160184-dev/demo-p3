const API_BASE = "/api/v1";
const JSON_HEADERS = { "Content-Type": "application/json" };

const $ = (id) => document.getElementById(id);

// ข้อมูลล่าสุดจาก API — ใช้ทั้งแสดงตาราง ค้นหา และเติมตัวเลือกในฟอร์ม
const state = { products: [], categories: [], suppliers: [] }; // ความจำของหน้าเว็บ: เก็บข้อมูลล่าสุดไว้ค้นหา/กรอง/เติมเมนู โดยไม่ต้องยิง API ซ้ำ

// fetch โยน TypeError เมื่อเชื่อมต่อไม่ได้ (เซิร์ฟเวอร์ปิด/เน็ตหลุด) — แปลงเป็นข้อความที่ผู้ใช้เข้าใจ
function errorText(err) {
  return err instanceof TypeError ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่าเปิด server และฐานข้อมูลอยู่" : err.message;
}

async function readError(res, hint = "อาจเกิดจากข้อมูลซ้ำ หรือข้อมูลไม่ถูกต้อง") {
  const body = await res.json().catch(() => ({}));
  const msg = body.error?.message || `เซิร์ฟเวอร์ตอบกลับผิดพลาด: ${res.status}`;
  return res.status === 500 ? `${msg} (${hint})` : msg;
}

// สร้าง element สั้นๆ: el("td", { className: "num", textContent: "10" }, child...)
function el(tag, props = {}, ...children) { // สร้าง element ด้วย textContent (ไม่ใช้ innerHTML) กัน XSS
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function button(label, className, onClick) {
  return el("button", { type: "button", className, textContent: label, onclick: onClick });
}

// ---------- แถบแจ้งผลมุมล่าง (หายเอง) ----------
let toastTimer;
function toast(message, kind = "ok") {
  const box = $("toast");
  box.textContent = message;
  box.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.className = `toast ${kind}`), kind === "error" ? 6000 : 3500);
}

function setCount(id, n) {
  $(id).textContent = n;
}

// แถวข้อความเต็มความกว้างตาราง: กำลังโหลด / ไม่มีข้อมูล / โหลดไม่สำเร็จ
// retry: ถ้าส่งฟังก์ชันมา จะมีปุ่ม "ลองใหม่" ใต้ข้อความ (ใช้ตอนโหลดข้อมูลไม่สำเร็จ)
function messageRow(tbodyId, text, kind = "", retry = null) {
  const cols = $(tbodyId).closest("table").tHead.rows[0].cells.length; // นับคอลัมน์จากหัวตาราง ให้ข้อความกว้างเต็มแถว (colSpan)
  const td = el("td", { colSpan: cols }, el("div", { textContent: text }));
  if (retry) td.append(button("↻ ลองใหม่", "small retry", retry));
  $(tbodyId).replaceChildren(el("tr", { className: `msg-row ${kind}` }, td));
}

// ======================================================================
// เข้าสู่ระบบ (JWT) — เก็บ token ใน localStorage แล้วแนบ "Authorization: Bearer <token>" กับคำขอที่แก้ข้อมูล
// ไม่ login = ดูได้อย่างเดียว (ซ่อนปุ่มเพิ่ม/แก้ไข/ลบด้วย class admin-only)
// ======================================================================
const TOKEN_KEY = "stockpro.token";
const session = { token: null, user: null };

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ใช้งานต่อได้ แต่รีเฟรชแล้วต้อง login ใหม่
  }
}

function loadToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setSession(token, user) {
  session.token = token;
  session.user = user;
  saveToken(token);
  const isAdmin = user?.role === "admin";
  document.body.classList.toggle("is-admin", isAdmin); // สวิตช์เดียวคุมทั้งหน้า: CSS ซ่อน/แสดงปุ่มแอดมินตาม class นี้
  $("auth-user").textContent = user?.email || "";
  closeAccountMenu();
}

// ---------- เมนูบัญชี (กดปุ่ม "บัญชี" ถึงจะเห็น) ----------
function closeAccountMenu() {
  $("account-menu").hidden = true;
  $("account-btn").setAttribute("aria-expanded", "false");
}

$("account-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const open = $("account-menu").hidden;
  $("account-menu").hidden = !open;
  $("account-btn").setAttribute("aria-expanded", String(open));
});
// คลิกที่อื่น หรือกด Esc แล้วเมนูปิด
document.addEventListener("click", (e) => {
  if (!e.target.closest(".account")) closeAccountMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAccountMenu();
});

function logout(message = "ออกจากระบบแล้ว") {
  setSession(null, null);
  if (message) toast(message, "info");
}

// เรียก API ที่ต้องยืนยันตัวตน — ถ้า token หมดอายุ/ไม่ถูกต้อง ออกจากระบบให้อัตโนมัติ
// (401 จากรหัสผ่านเดิมผิดตอนเปลี่ยนรหัส ไม่ใช่ปัญหา token จึงไม่ออกจากระบบ)
const SESSION_ERROR_CODES = ["NO_TOKEN", "INVALID_TOKEN"];

async function apiFetch(url, { method, body } = {}) {
  const headers = { Authorization: `Bearer ${session.token}` }; // แนบบัตร JWT ไปกับทุกคำขอที่แก้ข้อมูล
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) { // 401 = ไม่รู้ว่าเป็นใคร ดูรหัส error ว่าเป็นปัญหาบัตรหรือไม่
    const error = (await res.clone().json().catch(() => ({}))).error || {}; // clone = สำเนาคำตอบ เพราะเนื้อคำตอบอ่านได้ครั้งเดียว
    if (SESSION_ERROR_CODES.includes(error.code)) { // บัตรหาย/เสีย/หมดอายุ → ออกจากระบบให้ (รหัสผ่านเดิมผิดไม่เข้าเงื่อนไขนี้)
      logout(null);
      throw new Error(`${error.message} — กดปุ่ม "เข้าสู่ระบบ" มุมขวาบน`);
    }
  }
  return res;
}

// ---------- PATCH /api/v1/auth/change-password ----------
const MIN_PASSWORD_LENGTH = 8;

function openChangePasswordForm() {
  openForm({
    title: "เปลี่ยนรหัสผ่านผู้ดูแลระบบ",
    submitLabel: "เปลี่ยนรหัสผ่าน",
    failText: "เปลี่ยนรหัสผ่านไม่สำเร็จ",
    fields: [
      { key: "oldPassword", label: "รหัสผ่านปัจจุบัน", type: "password", required: true },
      {
        key: "newPassword",
        label: "รหัสผ่านใหม่",
        type: "password",
        required: true,
        hint: `อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
        check: (v) => (v.length >= MIN_PASSWORD_LENGTH ? null : `รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`),
      },
      { key: "confirmPassword", label: "ยืนยันรหัสผ่านใหม่", type: "password", required: true, hint: "พิมพ์รหัสผ่านใหม่อีกครั้ง" },
    ],
    onSubmit: async (v) => {
      if (v.newPassword !== v.confirmPassword) throw new Error("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
      const res = await apiFetch(`${API_BASE}/auth/change-password`, {
        method: "PATCH",
        body: { oldPassword: v.oldPassword, newPassword: v.newPassword },
      });
      if (!res.ok) throw new Error(await readError(res));
      toast("เปลี่ยนรหัสผ่านแล้ว — ครั้งหน้าใช้รหัสใหม่เข้าสู่ระบบ");
    },
  });
}

// ---------- POST /api/v1/auth/login ----------
function openLoginForm() {
  openForm({
    title: "เข้าสู่ระบบผู้ดูแลระบบ",
    submitLabel: "เข้าสู่ระบบ",
    busyText: "กำลังเข้าสู่ระบบ...",
    failText: "เข้าสู่ระบบไม่สำเร็จ",
    fields: [
      { key: "email", label: "อีเมล", type: "email", required: true, placeholder: "อีเมลผู้ดูแลระบบ" },
      { key: "password", label: "รหัสผ่าน", type: "password", required: true },
    ],
    onSubmit: async (v) => {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email: v.email, password: v.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || `เข้าสู่ระบบไม่สำเร็จ: ${res.status}`);
      setSession(data.token, data.user);
      toast(`เข้าสู่ระบบแล้ว — เพิ่ม แก้ไข และลบข้อมูลได้`);
    },
  });
}

// ---------- GET /api/v1/auth/me — ตรวจว่า token ที่จำไว้จากครั้งก่อนยังใช้ได้ ----------
async function restoreSession() {
  const token = loadToken();
  if (!token) return setSession(null, null);
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    setSession(token, (await res.json()).data);
  } catch {
    setSession(null, null); // token หมดอายุหรือเซิร์ฟเวอร์ปิด — กลับเป็นโหมดดูอย่างเดียว
  }
}

$("login-btn").addEventListener("click", openLoginForm);
$("banner-login").addEventListener("click", openLoginForm);
$("logout-btn").addEventListener("click", () => logout());
$("change-password-btn").addEventListener("click", () => {
  closeAccountMenu();
  openChangePasswordForm();
});

function actionsCell(onEdit, onDelete) {
  return el(
    "td",
    { className: "actions admin-only" },
    el("div", { className: "row-actions" }, button("แก้ไข", "small", onEdit), button("ลบ", "small danger", onDelete)),
  );
}

const formatPrice = (value) =>
  Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ======================================================================
// หน้าต่างป๊อปอัปฟอร์ม — ใช้ร่วมกันทั้งเพิ่ม/แก้ไข
// fields: [{ key, label, type: "text"|"number"|"email"|"select", required, placeholder, hint, step,
//            options: [{ value, label }], emptyLabel, check: (value) => ข้อความ error หรือ null }]
// onSubmit(values) ต้อง throw Error ถ้าบันทึกไม่สำเร็จ — ข้อความจะแสดงในหน้าต่าง
// ======================================================================
function openForm({ title, fields, values = {}, submitLabel, onSubmit, extra = null, busyText = "กำลังบันทึก...", failText = "บันทึกไม่สำเร็จ" }) { // ฟอร์มป๊อปอัปกลาง ทุกฟอร์มเรียกตัวนี้ (ต่างกันแค่รายการช่อง fields กับ onSubmit)
  const dialog = $("form-dialog");
  const msg = $("dialog-msg");
  const submitBtn = $("dialog-submit");
  const inputs = [];

  $("dialog-title").textContent = title;
  submitBtn.textContent = submitLabel;
  msg.textContent = "";
  msg.className = "dialog-msg";

  $("dialog-fields").replaceChildren(
    ...fields.map((f) => {
      let input;
      if (f.type === "select") {
        input = el("select");
        if (f.emptyLabel !== undefined) input.append(new Option(f.emptyLabel, ""));
        f.options.forEach((o) => input.append(new Option(o.label, o.value)));
      } else {
        input = el("input", { type: f.type || "text", placeholder: f.placeholder || "" });
        if (f.type === "number") {
          input.min = "0";
          input.step = f.step || "1";
        }
      }
      input.id = `field-${f.key}`;
      input.value = values[f.key] ?? ""; // ?? ใช้ค่าสำรองเฉพาะตอนไม่มีค่า (เลข 0 ยังแสดงเป็น 0)
      const error = el("small", { className: "field-error" });
      inputs.push({ f, input, error });
      const wrap = el("div", { className: "field" }, el("label", { htmlFor: input.id, textContent: f.label + (f.required ? " *" : "") }), input);
      if (f.hint) wrap.append(el("small", { className: "field-hint", textContent: f.hint }));
      wrap.append(error);
      return wrap;
    }),
  );

  // ล้างค่าที่กรอกและข้อความ error ทั้งหมด
  const clearForm = () => {
    inputs.forEach(({ input, error }) => {
      input.value = "";
      error.textContent = "";
      input.classList.remove("invalid");
    });
    msg.textContent = "";
    msg.className = "dialog-msg";
  };

  // ฟอร์มเพิ่มข้อมูลมีปุ่ม "ใส่ข้อมูลตัวอย่าง" (กดซ้ำได้ชุดใหม่) และ "ล้างฟอร์ม"
  const extraBtn = $("dialog-extra");
  const clearBtn = $("dialog-clear");
  extraBtn.hidden = !extra;
  clearBtn.hidden = !extra;
  if (extra) {
    extraBtn.textContent = extra.label;
    extraBtn.onclick = () => {
      clearForm();
      const sample = extra.values();
      inputs.forEach(({ f, input }) => {
        if (sample[f.key] !== undefined) input.value = sample[f.key];
      });
    };
    clearBtn.onclick = () => {
      clearForm();
      inputs[0].input.focus();
    };
  }

  $("dialog-cancel").onclick = () => dialog.close();

  $("dialog-form").onsubmit = async (e) => {
    e.preventDefault(); // กันฟอร์มรีโหลดหน้า
    // ตรวจสอบเบื้องต้นฝั่ง Frontend ก่อนส่ง (ไม่ทดแทนการตรวจฝั่ง Backend)
    const result = {};
    let firstInvalid = null;
    for (const { f, input, error } of inputs) {
      const value = input.value.trim();
      let problem = null;
      if (f.required && value === "") problem = `กรุณา${f.type === "select" ? "เลือก" : "กรอก"}${f.label}`; // ช่องบังคับว่าง → แจ้งเตือนรายช่อง
      else if (value !== "" && f.check) problem = f.check(value); // กฎเฉพาะช่อง เช่น ราคา > 0 อีเมลถูกรูปแบบ
      error.textContent = problem || "";
      input.classList.toggle("invalid", Boolean(problem));
      if (problem && !firstInvalid) firstInvalid = input;
      result[f.key] = value;
    }
    if (firstInvalid) return firstInvalid.focus(); // มีช่องผิด → หยุด ไม่ยิง API เลย (ตรวจก่อนส่ง)

    submitBtn.disabled = true; // ปิดปุ่มกันกดซ้ำระหว่างบันทึก
    msg.textContent = busyText;
    msg.className = "dialog-msg";
    try {
      await onSubmit(result); // ยิง API จริง (POST/PATCH) ถ้าพังจะ throw ไป catch
      dialog.close();
    } catch (err) {
      msg.textContent = `${failText}: ${errorText(err)}`; // พลาด → ข้อความแดงในป๊อปอัป ไม่ปิดฟอร์ม ข้อมูลที่กรอกไม่หาย
      msg.className = "dialog-msg error";
    } finally {
      submitBtn.disabled = false;
    }
  };

  dialog.showModal();
  inputs[0].input.focus();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s]{6,20}$/;

// ---------- ข้อมูลตัวอย่างสำหรับปุ่ม "ใส่ข้อมูลตัวอย่าง" — กดซ้ำได้ชุดถัดไป ----------
// category / supplier = คำค้นในชื่อหมวดหมู่ / ชื่อผู้จัดจำหน่ายที่มีอยู่จริง (เรียงตามความเหมาะสม) — สินค้าจะได้หมวดและผู้จัดจำหน่ายที่เข้ากัน
const SAMPLE_PRODUCTS = [
  { name: "Bluetooth Speaker", price: "1590.00", stock_quantity: "25", category: ["electronic"], supplier: ["tech"] },
  { name: "Wireless Earbuds", price: "1290.00", stock_quantity: "30", category: ["electronic"], supplier: ["tech"] },
  { name: "Power Bank 20000mAh", price: "790.00", stock_quantity: "55", category: ["electronic"], supplier: ["tech"] },
  { name: "USB-C Cable 1m", price: "199.00", stock_quantity: "120", category: ["electronic"], supplier: ["tech"] },
  { name: "27-inch LED Monitor", price: "4590.00", stock_quantity: "9", category: ["electronic"], supplier: ["tech"] },
  { name: "Webcam 1080p", price: "990.00", stock_quantity: "40", category: ["electronic"], supplier: ["tech"] },
  { name: "Polo Shirt", price: "490.00", stock_quantity: "80", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  { name: "Running Shorts", price: "450.00", stock_quantity: "75", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  { name: "Wool Beanie", price: "290.00", stock_quantity: "60", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  { name: "Cotton Hoodie", price: "690.00", stock_quantity: "45", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  { name: "Slim Fit Jeans", price: "990.00", stock_quantity: "35", category: ["apparel", "cloth", "fashion"], supplier: ["fashion"] },
  { name: "Ceramic Coffee Mug", price: "159.00", stock_quantity: "60", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  { name: "Non-stick Frying Pan", price: "590.00", stock_quantity: "45", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  { name: "Air Fryer 4L", price: "2990.00", stock_quantity: "12", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  { name: "Glass Food Container Set", price: "390.00", stock_quantity: "50", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  { name: "Robot Vacuum Cleaner", price: "5990.00", stock_quantity: "7", category: ["kitchen", "home"], supplier: ["smarthome", "home"] },
  { name: "Standing Desk", price: "8900.00", stock_quantity: "6", category: ["furniture"], supplier: ["furniture", "smarthome", "home"] },
  { name: "Bookshelf 5-Tier", price: "2490.00", stock_quantity: "14", category: ["furniture"], supplier: ["furniture", "smarthome", "home"] },
  { name: "Bedside Table", price: "1290.00", stock_quantity: "18", category: ["furniture"], supplier: ["furniture", "smarthome", "home"] },
  { name: "LED Desk Lamp", price: "890.00", stock_quantity: "24", category: ["furniture", "home"], supplier: ["smarthome", "home"] },
  { name: "A4 Copy Paper 500 sheets", price: "125.00", stock_quantity: "200", category: ["stationery", "office"], supplier: ["office", "paper"] },
  { name: "Sticky Notes Pack", price: "49.00", stock_quantity: "300", category: ["stationery", "office"], supplier: ["office", "paper"] },
  { name: "Desk Organizer", price: "259.00", stock_quantity: "45", category: ["stationery", "office"], supplier: ["office", "paper"] },
  { name: "Highlighter Set 6 colors", price: "99.00", stock_quantity: "120", category: ["stationery", "office"], supplier: ["office", "paper"] },
  { name: "Yoga Mat 6mm", price: "450.00", stock_quantity: "50", category: ["sport"], supplier: ["sport"] },
  { name: "Stainless Water Bottle 750ml", price: "390.00", stock_quantity: "90", category: ["sport"], supplier: ["sport"] },
  { name: "Resistance Band Set", price: "350.00", stock_quantity: "70", category: ["sport"], supplier: ["sport"] },
  { name: "Camping Tent 2P", price: "3290.00", stock_quantity: "8", category: ["sport"], supplier: ["sport"] },
  { name: "Learn Node.js Handbook", price: "590.00", stock_quantity: "25", category: ["book"], supplier: ["book"] },
  { name: "SQL Basics Workbook", price: "450.00", stock_quantity: "30", category: ["book"], supplier: ["book"] },
  { name: "Building Blocks 500 pcs", price: "790.00", stock_quantity: "22", category: ["toy"], supplier: ["toy"] },
  { name: "Remote Control Car", price: "1190.00", stock_quantity: "15", category: ["toy"], supplier: ["toy"] },
  { name: "Garden Hose 15m", price: "450.00", stock_quantity: "30", category: ["garden"], supplier: ["garden"] },
  { name: "Plant Pot Set of 3", price: "290.00", stock_quantity: "55", category: ["garden"], supplier: ["garden"] },
  { name: "Moisturizing Cream 50g", price: "350.00", stock_quantity: "60", category: ["beauty"], supplier: ["beauty", "fashion"] },
  { name: "Dry Dog Food 3kg", price: "520.00", stock_quantity: "40", category: ["pet"], supplier: ["pet"] },
  { name: "Cat Scratching Post", price: "690.00", stock_quantity: "16", category: ["pet"], supplier: ["pet"] },
];
const SAMPLE_CATEGORIES = [
  { name: "Sports", description: "อุปกรณ์กีฬา" },
  { name: "Books", description: "หนังสือและสื่อการเรียน" },
  { name: "Toys", description: "ของเล่นเด็ก" },
  { name: "Beauty", description: "เครื่องสำอางและความงาม" },
  { name: "Garden", description: "อุปกรณ์ทำสวน" },
  { name: "Office Supplies", description: "อุปกรณ์สำนักงาน" },
];
const SAMPLE_SUPPLIERS = [
  { name: "SportGear Co., Ltd.", email: "sales@sportgear.co.th", phone: "021112222" },
  { name: "BookWorld Distribution", email: "contact@bookworld.co.th", phone: "022223333" },
  { name: "ToyLand Trading", email: "info@toyland.co.th", phone: "023334444" },
  { name: "GlowCare Beauty Supply", email: "hello@glowcare.co.th", phone: "026667777" },
  { name: "GreenGarden Supply", email: "hello@greengarden.co.th", phone: "024445555" },
  { name: "OfficePro Thailand", email: "order@officepro.co.th", phone: "025556666" },
];
const sampleTurn = { product: Math.floor(Math.random() * 1000), category: 0, supplier: 0 };

const findByKeywords = (items, keywords) => { // หาหมวด/ผู้จัดจำหน่ายที่ชื่อมีคำค้น (เรียงตามความเหมาะสม)
  for (const keyword of keywords) {
    const hit = items.find((item) => item.name.toLowerCase().includes(keyword));
    if (hit) return hit;
  }
  return null;
};

// SKU รูปแบบเดียวกับข้อมูลเดิม: SKU-<อักษร 3 ตัวแรกของหมวดหมู่>-<เลขลำดับถัดไป> เช่น SKU-ELE-006
function nextSku(category) { // SKU รูปแบบเดิม: SKU-<3 ตัวอักษรหมวด>-<เลขถัดไป>
  const prefix = category.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "GEN";
  const pattern = new RegExp(`^SKU-${prefix}-(\\d+)$`);
  const used = state.products.map((p) => Number(pattern.exec(p.sku)?.[1] ?? 0));
  return `SKU-${prefix}-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
}

// เลือกสินค้าตัวอย่างที่ (1) มีหมวดหมู่ที่เข้ากันอยู่ในระบบ (2) ชื่อยังไม่ซ้ำ (3) มีผู้จัดจำหน่ายที่เข้ากัน — แล้วเติมหมวดหมู่/ผู้จัดจำหน่าย/SKU ให้สอดคล้องกัน
function nextProductSample() { // เลือกสินค้าตัวอย่างที่หมวดและผู้จัดจำหน่ายเข้ากัน ชื่อไม่ซ้ำ
  const takenNames = new Set(state.products.map((p) => p.product_name.toLowerCase()));
  const candidates = SAMPLE_PRODUCTS.map((sample) => ({
    sample,
    category: findByKeywords(state.categories, sample.category),
    supplier: findByKeywords(state.suppliers, sample.supplier),
  })).filter((c) => c.category && !takenNames.has(c.sample.name.toLowerCase()));
  const matched = candidates.filter((c) => c.supplier);
  const pool = matched.length > 0 ? matched : candidates;

  if (pool.length === 0) {
    const sample = SAMPLE_PRODUCTS[sampleTurn.product++ % SAMPLE_PRODUCTS.length];
    return { name: sample.name, price: sample.price, stock_quantity: sample.stock_quantity };
  }
  const { sample, category, supplier } = pool[sampleTurn.product++ % pool.length];
  return {
    name: sample.name,
    price: sample.price,
    stock_quantity: sample.stock_quantity,
    sku: nextSku(category),
    category_id: category.id,
    supplier_id: supplier?.id ?? "",
  };
}

// เลือกชุดที่ชื่อ (หรืออีเมล) ยังไม่มีในระบบ เพราะฐานข้อมูลห้ามซ้ำ — ถ้าใช้ครบทุกชุดแล้ว ต่อท้ายด้วยตัวเลข
function nextUniqueSample(list, turnKey, isTaken, makeUnique) {
  for (let i = 0; i < list.length; i++) {
    const sample = list[sampleTurn[turnKey]++ % list.length];
    if (!isTaken(sample)) return { ...sample };
  }
  return makeUnique({ ...list[sampleTurn[turnKey]++ % list.length] }, Date.now() % 1000);
}

function nextCategorySample() {
  const taken = new Set(state.categories.map((c) => c.name.toLowerCase()));
  return nextUniqueSample(SAMPLE_CATEGORIES, "category", (s) => taken.has(s.name.toLowerCase()), (s, n) => ({ ...s, name: `${s.name} ${n}` }));
}

function nextSupplierSample() {
  const taken = new Set(state.suppliers.map((s) => s.email.toLowerCase()));
  return nextUniqueSample(SAMPLE_SUPPLIERS, "supplier", (s) => taken.has(s.email), (s, n) => ({
    ...s,
    name: `${s.name} ${n}`,
    email: s.email.replace("@", `${n}@`),
  }));
}

async function deleteRequest(url) {
  toast("กำลังลบ...", "info");
  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "ลองรีเฟรชหน้าแล้วทำใหม่"));
}

// ======================================================================
// สินค้า
// ======================================================================

// ---------- GET /api/v1/products ----------
async function loadProducts({ highlightId = null } = {}) { // GET สินค้า (สาธารณะ ใช้ fetch ธรรมดา) → เก็บใน state → วาดตาราง
  if (state.products.length === 0) messageRow("product-rows", "กำลังโหลดข้อมูล...");
  try {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error(await readError(res, "ฐานข้อมูลอาจไม่ได้เปิดอยู่ — ตรวจว่า Docker และ MySQL ทำงาน"));
    state.products = (await res.json()).data || [];
    renderProducts(highlightId);
  } catch (err) {
    messageRow("product-rows", `โหลดข้อมูลไม่สำเร็จ: ${errorText(err)}`, "error", () => {
      messageRow("product-rows", "กำลังโหลดข้อมูล...");
      loadProducts();
    });
    $("search-result").textContent = "";
  }
}

function renderProducts(highlightId = null) {
  setCount("count-products", state.products.length);
  $("price-th").textContent = `ราคา (${display.currency === "THB" ? "บาท" : display.currency})`;
  if (state.products.length === 0) {
    messageRow("product-rows", "ยังไม่มีสินค้า — กดปุ่ม \"＋ เพิ่มสินค้า\" มุมขวาบน");
    $("search-result").textContent = "";
    return;
  }
  $("product-rows").replaceChildren(
    ...state.products.map((p) => {
      const tr = el(
        "tr",
        { className: p.id === highlightId ? "highlight" : "" },
        el("td", { className: "id", textContent: p.id }),
        el("td", { className: "strong", textContent: p.product_name }),
        el("td", { className: "sub hide-md", textContent: p.sku }),
        el("td", { className: "hide-xs" }, categoryCell(p)),
        el("td", { className: "hide-sm" }, supplierCell(p)),
        priceCell(p),
        el("td", { className: "num", textContent: `${p.stock_quantity} ชิ้น` }),
        actionsCell(() => openProductForm(p), () => deleteProduct(p)),
      );
      // ข้อความที่ใช้ค้นหา: ชื่อ, SKU, หมวดหมู่, ผู้จัดจำหน่าย
      tr.dataset.search = [p.product_name, p.sku, p.category_name, p.supplier_name || ""].join(" ").toLowerCase(); // ฝังข้อความค้นหาไว้ในแถว ใช้กรองโดยไม่ยิง API
      tr.dataset.category = String(p.category_id);
      tr.dataset.supplier = p.supplier_id === null ? NO_SUPPLIER : String(p.supplier_id);
      return tr;
    }),
  );
  applySearch();
  const highlighted = $("product-rows").querySelector("tr.highlight");
  if (highlighted) {
    highlighted.scrollIntoView({ block: "nearest" }); // เลื่อนให้เห็นแถวที่เพิ่งเพิ่ม/แก้
    // สีจางหมดแล้วเอา class ออก ให้แถวกลับเป็นปกติ (ชี้เมาส์แล้วเปลี่ยนสีได้ตามเดิม)
    // ใช้ตัวจับเวลาด้วย เพราะถ้าแท็บถูกซ่อนอยู่ เบราว์เซอร์จะหยุดเล่นอนิเมชันและไม่ส่ง animationend
    const clearHighlight = () => highlighted.classList.remove("highlight");
    highlighted.cells[0].addEventListener("animationend", clearHighlight, { once: true });
    setTimeout(clearHighlight, 3200);
  }
}

// ---------- แสดงราคาทุกแถวเป็นสกุลเงินเดียวกัน (แถบ "แสดงราคาเป็น") ----------
// ขออัตราจาก API เดิมครั้งเดียวต่อการเลือก แล้วคูณราคาทุกแถวด้วยสูตรเดียวกับ backend (ราคา × อัตรา ปัด 2 ตำแหน่ง)
const display = { currency: "THB", rate: 1 }; // สกุลเงินที่แสดงทั้งตารางตอนนี้ + อัตราจาก THB
let displaySeq = 0;

function priceCell(p) {
  if (display.currency === "THB") return el("td", { className: "num", textContent: formatPrice(p.price) });
  const converted = Number((Number(p.price) * display.rate).toFixed(2)); // สูตรเดียวกับ backend: ราคา × อัตรา ปัด 2 ตำแหน่ง
  return el(
    "td",
    { className: "num" },
    el("div", { className: "strong", textContent: `${formatPrice(converted)} ${display.currency}` }),
    el("div", { className: "sub", textContent: `${formatPrice(p.price)} บาท` }),
  );
}

function markDisplayChip(code) {
  document.querySelectorAll("#currency-chips .chip").forEach((chip) => chip.setAttribute("aria-checked", String(chip.dataset.currency === code)));
}

function setCurrencyNote(text, isError = false) {
  $("currency-note").textContent = text;
  $("currency-note").className = isError ? "currency-note error" : "currency-note";
}

async function setDisplayCurrency(code) {
  const seq = ++displaySeq;
  if (code === "THB") {
    display.currency = "THB";
    display.rate = 1;
    markDisplayChip("THB");
    setCurrencyNote("");
    renderProducts();
    return;
  }
  if (state.products.length === 0) return setCurrencyNote("ยังไม่มีสินค้าให้แปลงราคา", true);

  document.querySelectorAll("#currency-chips .chip").forEach((chip) => (chip.disabled = true));
  setCurrencyNote("กำลังดึงอัตราแลกเปลี่ยน...");
  try {
    const res = await fetch(`${API_BASE}/products/${state.products[0].id}/price?currency=${encodeURIComponent(code)}`); // ขออัตราครั้งเดียวผ่านสินค้าชิ้นแรก แล้วคูณเองทุกแถว (ไม่ยิงทีละสินค้า)
    if (!res.ok) throw new Error(await readError(res, "ลองใหม่อีกครั้ง"));
    const { data } = await res.json();
    if (seq !== displaySeq) return;
    if (data.fallback) throw new Error("API อัตราแลกเปลี่ยนไม่พร้อมในขณะนี้");
    display.currency = code;
    display.rate = data.rate;
    markDisplayChip(code);
    setCurrencyNote(`อัตรา 1 ${code} ≈ ${formatPrice(1 / data.rate)} บาท`);
    renderProducts();
  } catch (err) {
    if (seq !== displaySeq) return;
    markDisplayChip(display.currency);
    setCurrencyNote(`แปลงราคาไม่สำเร็จ: ${errorText(err)}`, true);
  } finally {
    if (seq === displaySeq) document.querySelectorAll("#currency-chips .chip").forEach((chip) => (chip.disabled = false));
  }
}

$("currency-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip && !chip.disabled) setDisplayCurrency(chip.dataset.currency);
});

// ---------- ค้นหาสินค้า (กรองแถวที่โหลดมาแล้วฝั่งหน้าเว็บ ไม่เรียก API เพิ่ม) ----------
// matches(row): เงื่อนไขเพิ่มเติมนอกจากคำค้นหา (เช่น ตัวเลือกหมวดหมู่) — คืน true ถ้าแถวนี้ต้องแสดง
function filterRows({ inputId, bodyId, resultId, noMatchText, matches = () => true }) { // ซ่อน/แสดงแถวตามคำค้น + เงื่อนไขเพิ่ม (กรองในเบราว์เซอร์ ไม่ยิง API)
  const query = $(inputId).value.trim().toLowerCase();
  const body = $(bodyId);
  body.querySelector("tr.no-match")?.remove();
  const rows = [...body.querySelectorAll("tr[data-search]")];
  if (rows.length === 0) return;

  let shown = 0;
  rows.forEach((row) => {
    row.hidden = !(matches(row) && (!query || row.dataset.search.includes(query)));
    if (!row.hidden) shown++;
  });

  $(resultId).textContent = shown < rows.length || query ? `พบ ${shown} จาก ${rows.length} รายการ` : `ทั้งหมด ${rows.length} รายการ`;
  if (shown === 0) {
    const cols = body.closest("table").tHead.rows[0].cells.length;
    body.append(el("tr", { className: "msg-row no-match" }, el("td", { colSpan: cols, textContent: noMatchText })));
  }
}

const NO_MATCH_HINT = "— ค้นด้วยคำอื่น หรือลบคำค้นหาเพื่อแสดงทั้งหมด";
const NO_SUPPLIER = "none";

const applySearch = () =>
  filterRows({
    inputId: "product-search",
    bodyId: "product-rows",
    resultId: "search-result",
    noMatchText: "ไม่พบสินค้าที่ตรงกับคำค้นหาหรือตัวกรอง — ลองเปลี่ยนคำค้นหา หรือเลือก \"ทุกหมวดหมู่\" / \"ทุกผู้จัดจำหน่าย\"",
    matches: (row) => {
      const category = $("filter-category").value;
      const supplier = $("filter-supplier").value;
      return (!category || row.dataset.category === category) && (!supplier || row.dataset.supplier === supplier);
    },
  });

// เติมตัวเลือกในเมนูกรองจาก state (เรียกทุกครั้งที่โหลดหมวดหมู่/ผู้จัดจำหน่ายใหม่) — ค่าที่เลือกไว้ยังอยู่ ถ้ารายการนั้นถูกลบแล้วจะกลับเป็น "ทั้งหมด"
function fillFilterOptions() { // เติมเมนูกรองจากข้อมูลจริง ถ้ารายการที่เลือกถูกลบ กลับเป็น 'ทั้งหมด'
  const fill = (selectId, allLabel, items, extra = []) => {
    const select = $(selectId);
    const previous = select.value;
    select.replaceChildren(
      new Option(allLabel, ""),
      ...items.map((item) => new Option(item.name, String(item.id))),
      ...extra,
    );
    select.value = [...select.options].some((o) => o.value === previous) ? previous : "";
  };
  fill("filter-category", "ทุกหมวดหมู่", state.categories);
  fill("filter-supplier", "ทุกผู้จัดจำหน่าย", state.suppliers, [new Option("ไม่มีผู้จัดจำหน่าย", NO_SUPPLIER)]);
  applySearch();
}

$("filter-category").addEventListener("change", applySearch);
$("filter-supplier").addEventListener("change", applySearch);

const applyCategorySearch = () => filterRows({ inputId: "category-search", bodyId: "category-rows", resultId: "category-search-result", noMatchText: `ไม่พบหมวดหมู่ที่ตรงกับคำค้นหา ${NO_MATCH_HINT}` });
const applySupplierSearch = () => filterRows({ inputId: "supplier-search", bodyId: "supplier-rows", resultId: "supplier-search-result", noMatchText: `ไม่พบผู้จัดจำหน่ายที่ตรงกับคำค้นหา ${NO_MATCH_HINT}` });

$("product-search").addEventListener("input", applySearch);
$("category-search").addEventListener("input", applyCategorySearch);
$("supplier-search").addEventListener("input", applySupplierSearch);

// ======================================================================
// หน้าต่างรายละเอียด (อ่านอย่างเดียว) ของหมวดหมู่ / ผู้จัดจำหน่าย — ใช้ข้อมูลที่โหลดไว้แล้วใน state ไม่เรียก API เพิ่ม
// ======================================================================
function nameLink(text, onClick, extraClass = "") {
  return button(text, `link name-link ${extraClass}`.trim(), onClick);
}

// ปุ่ม "รายละเอียด" ท้ายแถวตารางหมวดหมู่/ผู้จัดจำหน่าย — ทุกคนเห็น (ไม่ใช่ admin-only)
function detailCell(onClick) {
  return el("td", { className: "actions" }, button("รายละเอียด", "small", onClick));
}

function openDetail({ title, subtitle, info, productsTitle, products }) {
  $("detail-title").textContent = title;
  $("detail-subtitle").textContent = subtitle;
  $("detail-info").replaceChildren(...info.flatMap(([label, value]) => [el("dt", { textContent: label }), el("dd", { textContent: value || "-" })]));
  $("detail-products-title").textContent = `${productsTitle} (${products.length} ชิ้น)`;
  $("detail-products").replaceChildren(
    ...(products.length === 0
      ? [el("li", { className: "empty", textContent: "ยังไม่มีสินค้า" })]
      : products.map((p) =>
          el(
            "li",
            {},
            el("b", { textContent: p.product_name }),
            el("small", { textContent: `${p.sku} · ${formatPrice(p.price)} บาท · สต็อก ${p.stock_quantity} ชิ้น` }),
          ),
        )),
  );
  $("detail-dialog").showModal();
}

function openCategoryDetail(c) {
  openDetail({
    title: c.name,
    subtitle: "รายละเอียดหมวดหมู่",
    info: [
      ["ID", String(c.id)],
      ["คำอธิบาย", c.description],
      ["จำนวนสินค้า", `${c.product_count} ชิ้น`],
    ],
    productsTitle: "สินค้าในหมวดหมู่นี้",
    products: state.products.filter((p) => p.category_id === c.id),
  });
}

function openSupplierDetail(s) {
  openDetail({
    title: s.name,
    subtitle: "รายละเอียดผู้จัดจำหน่าย",
    info: [
      ["ID", String(s.id)],
      ["รหัส", s.supplier_code],
      ["อีเมล", s.email],
      ["เบอร์โทร", s.phone],
      ["จำนวนสินค้า", `${s.product_count} ชิ้น`],
    ],
    productsTitle: "สินค้าจากผู้จัดจำหน่ายรายนี้",
    products: state.products.filter((p) => p.supplier_id === s.id),
  });
}

// ชื่อหมวดหมู่/ผู้จัดจำหน่ายในตารางสินค้า: กดแล้วค่อยหาข้อมูลจาก state (3 ตารางโหลดพร้อมกัน ตอนวาดแถวอาจยังโหลดไม่ครบ)
function categoryCell(p) {
  return nameLink(p.category_name, () => {
    const c = state.categories.find((x) => x.id === p.category_id);
    if (c) openCategoryDetail(c);
    else toast("ข้อมูลหมวดหมู่ยังโหลดไม่เสร็จ ลองกดอีกครั้ง", "info");
  });
}

function supplierCell(p) {
  if (p.supplier_id === null) return "-";
  return nameLink(p.supplier_name, () => {
    const s = state.suppliers.find((x) => x.id === p.supplier_id);
    if (s) openSupplierDetail(s);
    else toast("ข้อมูลผู้จัดจำหน่ายยังโหลดไม่เสร็จ ลองกดอีกครั้ง", "info");
  });
}

$("detail-close").addEventListener("click", () => $("detail-dialog").close());

function productFields(isEdit) { // ช่องของฟอร์มสินค้า (ตอนแก้ไข SKU บังคับ)
  return [
    { key: "name", label: "ชื่อสินค้า", required: true, placeholder: "เช่น USB-C Cable" },
    {
      key: "sku",
      label: "รหัสสินค้า (SKU)",
      required: isEdit,
      placeholder: isEdit ? "" : "เว้นว่างได้ ระบบสร้างให้",
      hint: "ต้องไม่ซ้ำกับสินค้าอื่น",
    },
    {
      key: "price",
      label: "ราคา (บาท)",
      type: "number",
      step: "0.01",
      required: true,
      placeholder: "เช่น 199.50",
      check: (v) => (Number(v) > 0 ? null : "ราคาต้องเป็นตัวเลขที่มากกว่า 0"),
    },
    {
      key: "stock_quantity",
      label: "จำนวนสต็อก (ชิ้น)",
      type: "number",
      required: true,
      placeholder: "เช่น 20 (ไม่มีของใส่ 0)",
      check: (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? null : "จำนวนสต็อกต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป"),
    },
    {
      key: "category_id",
      label: "หมวดหมู่",
      type: "select",
      required: true,
      emptyLabel: "-- เลือกหมวดหมู่ --",
      options: state.categories.map((c) => ({ value: c.id, label: c.name })),
      hint: state.categories.length ? "" : "ยังไม่มีหมวดหมู่ — เพิ่มที่เมนู \"หมวดหมู่\" ก่อน",
    },
    {
      key: "supplier_id",
      label: "ผู้จัดจำหน่าย",
      type: "select",
      // ต้องระบุผู้จัดจำหน่ายทุกครั้ง ทั้งเพิ่มและแก้ไข (สินค้าที่ผู้จัดจำหน่ายถูกลบไปแล้วต้องเลือกใหม่ก่อนบันทึก)
      required: true,
      emptyLabel: "-- เลือกผู้จัดจำหน่าย --",
      options: state.suppliers.map((s) => ({ value: s.id, label: s.name })),
      hint: state.suppliers.length ? "" : "ยังไม่มีผู้จัดจำหน่าย — เพิ่มที่เมนู \"ผู้จัดจำหน่าย\" ก่อน",
    },
  ];
}

// ---------- POST /api/v1/products และ PATCH /api/v1/products/:id ----------
function openProductForm(p = null) {
  const isEdit = p !== null;
  openForm({
    title: isEdit ? `แก้ไขสินค้า: ${p.product_name}` : "เพิ่มสินค้าใหม่",
    submitLabel: isEdit ? "บันทึกการแก้ไข" : "เพิ่มสินค้า",
    fields: productFields(isEdit),
    values: isEdit
      ? {
          name: p.product_name,
          sku: p.sku,
          price: Number(p.price).toFixed(2),
          stock_quantity: p.stock_quantity,
          category_id: p.category_id,
          supplier_id: p.supplier_id,
        }
      : {},
    extra: isEdit
      ? null
      : {
          label: "ใส่ข้อมูลตัวอย่าง",
          values: nextProductSample,
        },
    onSubmit: async (v) => {
      const body = {
        name: v.name,
        sku: v.sku || "SKU-" + Date.now(), // เว้นว่าง = ระบบสร้าง SKU ให้
        price: Number(v.price),
        stock_quantity: Number(v.stock_quantity),
        category_id: Number(v.category_id),
        supplier_id: Number(v.supplier_id),
      };
      const res = await apiFetch(isEdit ? `${API_BASE}/products/${p.id}` : `${API_BASE}/products`, { method: isEdit ? "PATCH" : "POST", body }); // แก้ไข = PATCH /:id, เพิ่ม = POST (ฟังก์ชันเดียวเลือกให้)
      if (!res.ok) throw new Error(await readError(res, "SKU นี้อาจซ้ำกับสินค้าอื่น"));
      const saved = await res.json();

      toast(isEdit ? `บันทึกการแก้ไข "${body.name}" แล้ว` : `เพิ่ม "${body.name}" แล้ว — แถวที่ไฮไลต์สีฟ้าในตาราง`);
      await loadProducts({ highlightId: isEdit ? p.id : saved.data?.id });
      loadCategories();
      loadSuppliers();
    },
  });
}

// ---------- DELETE /api/v1/products/:id ----------
async function deleteProduct(p) {
  if (!confirm(`ลบสินค้า "${p.product_name}" (${p.sku}) ใช่ไหม?\nลบแล้วย้อนกลับไม่ได้`)) return; // ยืนยันก่อนลบ บอกผลกระทบ
  try {
    await deleteRequest(`${API_BASE}/products/${p.id}`);
    toast(`ลบสินค้า "${p.product_name}" แล้ว`);
    await loadProducts();
    loadCategories();
    loadSuppliers();
  } catch (err) {
    toast(`ลบไม่สำเร็จ: ${errorText(err)}`, "error");
  }
}

$("add-product").addEventListener("click", () => openProductForm());

// ======================================================================
// หมวดหมู่
// ======================================================================

// ---------- GET /api/v1/categories ----------
async function loadCategories() {
  if (state.categories.length === 0) messageRow("category-rows", "กำลังโหลดข้อมูล...");
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) throw new Error(await readError(res, "ฐานข้อมูลอาจไม่ได้เปิดอยู่"));
    state.categories = (await res.json()).data || [];
    setCount("count-categories", state.categories.length);
    fillFilterOptions();
    if (state.categories.length === 0) {
      $("category-search-result").textContent = "";
      return messageRow("category-rows", "ยังไม่มีหมวดหมู่ — กดปุ่ม \"＋ เพิ่มหมวดหมู่\" มุมขวาบน");
    }
    $("category-rows").replaceChildren(
      ...state.categories.map((c) => {
        const tr = el(
          "tr",
          {},
          el("td", { className: "id hide-xs", textContent: c.id }),
          el("td", { className: "strong", textContent: c.name }),
          el("td", { className: "sub hide-sm", textContent: c.description || "-" }),
          el("td", { className: "num", textContent: `${c.product_count} ชิ้น` }),
          detailCell(() => openCategoryDetail(c)),
          actionsCell(() => openCategoryForm(c), () => deleteCategory(c)),
        );
        tr.dataset.search = [c.name, c.description || ""].join(" ").toLowerCase(); // ฝังข้อความค้นหาไว้ในแถว ใช้กรองโดยไม่ยิง API
        return tr;
      }),
    );
    applyCategorySearch();
  } catch (err) {
    $("category-search-result").textContent = "";
    messageRow("category-rows", `โหลดรายการหมวดหมู่ไม่สำเร็จ: ${errorText(err)}`, "error", () => {
      messageRow("category-rows", "กำลังโหลดข้อมูล...");
      loadCategories();
    });
  }
}

// ---------- POST /api/v1/categories และ PATCH /api/v1/categories/:id ----------
function openCategoryForm(c = null) {
  const isEdit = c !== null;
  openForm({
    title: isEdit ? `แก้ไขหมวดหมู่: ${c.name}` : "เพิ่มหมวดหมู่ใหม่",
    submitLabel: isEdit ? "บันทึกการแก้ไข" : "เพิ่มหมวดหมู่",
    fields: [
      { key: "name", label: "ชื่อหมวดหมู่", required: true, placeholder: "เช่น Sports", hint: "ต้องไม่ซ้ำกับหมวดหมู่อื่น" },
      { key: "description", label: "คำอธิบาย", placeholder: "เช่น อุปกรณ์กีฬา" },
    ],
    values: isEdit ? { name: c.name, description: c.description } : {},
    extra: isEdit ? null : { label: "ใส่ข้อมูลตัวอย่าง", values: nextCategorySample },
    onSubmit: async (v) => {
      const body = { name: v.name, description: v.description || null };
      const res = await apiFetch(isEdit ? `${API_BASE}/categories/${c.id}` : `${API_BASE}/categories`, { method: isEdit ? "PATCH" : "POST", body }); // แก้ไข = PATCH /:id, เพิ่ม = POST (ฟังก์ชันเดียวเลือกให้)
      if (!res.ok) throw new Error(await readError(res, "ชื่อหมวดหมู่นี้อาจมีอยู่แล้ว"));
      toast(isEdit ? `บันทึกหมวดหมู่ "${body.name}" แล้ว` : `เพิ่มหมวดหมู่ "${body.name}" แล้ว — เลือกได้ตอนเพิ่มสินค้า`);
      await loadCategories();
      if (isEdit) loadProducts(); // ชื่อหมวดหมู่ในตารางสินค้าเปลี่ยนตาม
    },
  });
}

// ---------- DELETE /api/v1/categories/:id ----------
async function deleteCategory(c) {
  const warn = c.product_count > 0 ? `\n\n⚠️ สินค้า ${c.product_count} ชิ้นในหมวดนี้จะถูกลบไปด้วย` : "";
  if (!confirm(`ลบหมวดหมู่ "${c.name}" ใช่ไหม?\nลบแล้วย้อนกลับไม่ได้${warn}`)) return; // ยืนยันก่อนลบ บอกผลกระทบ
  try {
    await deleteRequest(`${API_BASE}/categories/${c.id}`);
    toast(`ลบหมวดหมู่ "${c.name}" แล้ว`);
    await loadCategories();
    loadSuppliers();
    loadProducts();
  } catch (err) {
    toast(`ลบไม่สำเร็จ: ${errorText(err)}`, "error");
  }
}

$("add-category").addEventListener("click", () => openCategoryForm());

// ======================================================================
// ผู้จัดจำหน่าย
// ======================================================================

// ---------- GET /api/v1/suppliers ----------
async function loadSuppliers() {
  if (state.suppliers.length === 0) messageRow("supplier-rows", "กำลังโหลดข้อมูล...");
  try {
    const res = await fetch(`${API_BASE}/suppliers`);
    if (!res.ok) throw new Error(await readError(res, "ฐานข้อมูลอาจไม่ได้เปิดอยู่"));
    state.suppliers = (await res.json()).data || [];
    setCount("count-suppliers", state.suppliers.length);
    fillFilterOptions();
    if (state.suppliers.length === 0) {
      $("supplier-search-result").textContent = "";
      return messageRow("supplier-rows", "ยังไม่มีผู้จัดจำหน่าย — กดปุ่ม \"＋ เพิ่มผู้จัดจำหน่าย\" มุมขวาบน");
    }
    $("supplier-rows").replaceChildren(
      ...state.suppliers.map((s) => {
        const tr = el(
          "tr",
          {},
          el("td", { className: "id hide-xs", textContent: s.id }),
          el("td", { className: "strong", textContent: s.name }),
          el("td", { className: "sub hide-md", textContent: s.supplier_code }),
          el("td", { className: "hide-sm", textContent: s.email }),
          el("td", { className: "hide-md", textContent: s.phone || "-" }),
          el("td", { className: "num", textContent: `${s.product_count} ชิ้น` }),
          detailCell(() => openSupplierDetail(s)),
          actionsCell(() => openSupplierForm(s), () => deleteSupplier(s)),
        );
        tr.dataset.search = [s.name, s.supplier_code, s.email, s.phone || ""].join(" ").toLowerCase(); // ฝังข้อความค้นหาไว้ในแถว ใช้กรองโดยไม่ยิง API
        return tr;
      }),
    );
    applySupplierSearch();
  } catch (err) {
    $("supplier-search-result").textContent = "";
    messageRow("supplier-rows", `โหลดรายการผู้จัดจำหน่ายไม่สำเร็จ: ${errorText(err)}`, "error", () => {
      messageRow("supplier-rows", "กำลังโหลดข้อมูล...");
      loadSuppliers();
    });
  }
}

// ---------- POST /api/v1/suppliers และ PATCH /api/v1/suppliers/:id ----------
function openSupplierForm(s = null) {
  const isEdit = s !== null;
  openForm({
    title: isEdit ? `แก้ไขผู้จัดจำหน่าย: ${s.name}` : "เพิ่มผู้จัดจำหน่ายใหม่",
    submitLabel: isEdit ? "บันทึกการแก้ไข" : "เพิ่มผู้จัดจำหน่าย",
    fields: [
      { key: "name", label: "ชื่อบริษัท", required: true, placeholder: "เช่น SportGear Co., Ltd." },
      {
        key: "email",
        label: "อีเมล",
        type: "email",
        required: true,
        placeholder: "เช่น sales@sportgear.co.th",
        hint: "ต้องไม่ซ้ำกับผู้จัดจำหน่ายอื่น",
        check: (v) => (EMAIL_PATTERN.test(v) ? null : "กรุณากรอกอีเมลให้ถูกต้อง เช่น sales@example.com"),
      },
      {
        key: "phone",
        label: "เบอร์โทร",
        placeholder: "เช่น 021112222",
        check: (v) => (PHONE_PATTERN.test(v) ? null : "เบอร์โทรต้องเป็นตัวเลข (6-20 หลัก)"),
      },
      {
        key: "supplier_code",
        label: "รหัสผู้จัดจำหน่าย",
        required: isEdit,
        placeholder: isEdit ? "" : "เว้นว่างได้ ระบบสร้างให้",
      },
    ],
    values: isEdit ? { name: s.name, email: s.email, phone: s.phone, supplier_code: s.supplier_code } : {},
    extra: isEdit ? null : { label: "ใส่ข้อมูลตัวอย่าง", values: nextSupplierSample },
    onSubmit: async (v) => {
      const body = {
        name: v.name,
        email: v.email,
        phone: v.phone || null,
        supplier_code: v.supplier_code || "SUP-" + String(Date.now()).slice(-8),
      };
      const res = await apiFetch(isEdit ? `${API_BASE}/suppliers/${s.id}` : `${API_BASE}/suppliers`, { method: isEdit ? "PATCH" : "POST", body }); // แก้ไข = PATCH /:id, เพิ่ม = POST (ฟังก์ชันเดียวเลือกให้)
      if (!res.ok) throw new Error(await readError(res, "อีเมลหรือรหัสผู้จัดจำหน่ายนี้อาจมีอยู่แล้ว"));
      toast(isEdit ? `บันทึกผู้จัดจำหน่าย "${body.name}" แล้ว` : `เพิ่มผู้จัดจำหน่าย "${body.name}" แล้ว — เลือกได้ตอนเพิ่มสินค้า`);
      await loadSuppliers();
      if (isEdit) loadProducts(); // ชื่อผู้จัดจำหน่ายในตารางสินค้าเปลี่ยนตาม
    },
  });
}

// ---------- DELETE /api/v1/suppliers/:id ----------
async function deleteSupplier(s) {
  const warn = s.product_count > 0 ? `\n\nสินค้า ${s.product_count} ชิ้นจะเปลี่ยนเป็น "ไม่มีผู้จัดจำหน่าย" (สินค้าไม่ถูกลบ)` : "";
  if (!confirm(`ลบผู้จัดจำหน่าย "${s.name}" ใช่ไหม?\nลบแล้วย้อนกลับไม่ได้${warn}`)) return; // ยืนยันก่อนลบ บอกผลกระทบ
  try {
    await deleteRequest(`${API_BASE}/suppliers/${s.id}`);
    toast(`ลบผู้จัดจำหน่าย "${s.name}" แล้ว`);
    await loadSuppliers();
    loadProducts();
  } catch (err) {
    toast(`ลบไม่สำเร็จ: ${errorText(err)}`, "error");
  }
}

$("add-supplier").addEventListener("click", () => openSupplierForm());

// ======================================================================
// เมนู สินค้า / หมวดหมู่ / ผู้จัดจำหน่าย (จำเมนูไว้ใน URL เช่น #categories รีเฟรชแล้วอยู่หน้าเดิม)
// ======================================================================
function showTab(name) {
  const tabs = [...document.querySelectorAll(".tab")];
  if (!tabs.some((t) => t.dataset.tab === name)) name = "products";
  tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`); // จำแท็บใน URL (#categories) โดยไม่โหลดหน้าใหม่
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
showTab(location.hash.slice(1));

restoreSession(); // เช็กบัตรที่จำไว้ (GET /auth/me)
loadProducts(); // โหลด 3 ตารางพร้อมกัน (GET สาธารณะ)
loadCategories();
loadSuppliers();
