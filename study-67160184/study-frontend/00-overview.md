# สรุปหน้าเว็บ (frontend) — ฉบับอ่านก่อนนำเสนอ

> ไฟล์ทบทวน (ไม่อยู่ในซิป) · โค้ด: [../frontend/index.html](../frontend/index.html) (174 บรรทัด) + [../frontend/style.css](../frontend/style.css) (170 บรรทัด) + [../frontend/app.js](../frontend/app.js) (1057 บรรทัด) · HTML/CSS/JavaScript ล้วน ไม่มี framework · 🎯 = อาจารย์น่าถาม · คู่กับ backend: [../study-index-js/00-overview.md](../study-index-js/00-overview.md)

## เวลาน้อย อ่านตามลำดับนี้

| ลำดับ | ไฟล์ | ทำไม |
|---|---|---|
| 1 | **00-overview.md** (ไฟล์นี้) | endpoint 16 ตัวที่หน้าเว็บเรียก + เกณฑ์คะแนน |
| 2 | **5F-products.md** | ตารางสินค้า, ค้นหา/กรอง, แปลงราคา — demo ใช้หน้านี้ |
| 3 | **5D-openForm.md** | 🎯 ตรวจข้อมูลก่อนส่ง (3 คะแนน) |
| 4 | **5C-login.md** | token, โหมดผู้เยี่ยมชม/แอดมิน |
| 5 | **5B-basics.md** | 🎯 loading/error (3 คะแนน) |
| 6 | **5G-categories-suppliers.md** · **5A-index-html.md** · **5E-sample-data.md** · **5H-tabs-start.md** | ส่วนที่เหลือ |

## แผนที่ไฟล์

| ส่วน | ไฟล์ / บรรทัด | เรื่อง |
|---|---|---|
| [5A](5A-index-html.md) | index.html 1-174 + style.css 1-170 | โครงหน้า + หน้าตา (CSS แยกไฟล์ 2026-10-29) |
| [5B](5B-basics.md) | app.js 1-53 | ตัวช่วยพื้นฐาน, toast, แถว loading/error |
| [5C](5C-login.md) | app.js 55-219 | ล็อกอิน, เมนูบัญชี, `apiFetch` |
| [5D](5D-openForm.md) | app.js 221-332 | ฟอร์มป๊อปอัปกลาง + ตรวจข้อมูล |
| [5E](5E-sample-data.md) | app.js 334-462 | ข้อมูลตัวอย่าง, `deleteRequest` |
| [5F](5F-products.md) | app.js 464-844 | สินค้า |
| [5G](5G-categories-suppliers.md) | app.js 846-1036 | หมวดหมู่ + ผู้จัดจำหน่าย |
| [5H](5H-tabs-start.md) | app.js 1038-1057 | แท็บ + คำสั่งเริ่มทำงาน |

## 🎯 เกณฑ์คะแนนส่วน Frontend (10 คะแนน) ตอบด้วยอะไร

| เกณฑ์ | คะแนน | หลักฐานในโค้ด |
|---|---|---|
| เรียก API จริง ≥ 3 endpoint รวม GET และการเปลี่ยนแปลงข้อมูล | 4 | เรียก **16 endpoint** ครบ GET/POST/PATCH/DELETE (ตารางล่าง) |
| หน้าจอเหมาะกับผู้ใช้ มีสถานะ loading/error ชัดเจน | 3 | "กำลังโหลดข้อมูล...", แถวแดง + ปุ่ม "↻ ลองใหม่" (`messageRow` บรรทัด 48), toast, "กำลังบันทึก..." |
| ฟอร์มตรวจข้อมูลก่อนส่ง | 3 | `openForm` บรรทัด 296-311: ช่องบังคับ, ราคา > 0, สต็อกจำนวนเต็ม ≥ 0, อีเมล/เบอร์ถูกรูปแบบ → กรอบแดง ไม่ยิง API |

## 🎯 endpoint 16 ตัวที่หน้าเว็บเรียก (ฟังก์ชันไหน บรรทัดไหน)

| # | Method | Path | ฟังก์ชันใน app.js | บรรทัด |
|---|---|---|---|---|
| 1 | POST | `/auth/login` | `openLoginForm` | 165 (fetch 176) |
| 2 | GET | `/auth/me` | `restoreSession` | 190 (fetch 194) |
| 3 | PATCH | `/auth/change-password` | `openChangePasswordForm` | 135 (154) |
| 4 | GET | `/products` | `loadProducts` | 469 (472) |
| 5 | POST | `/products` | `openProductForm` (เพิ่ม) | 787 (818) |
| 6 | PATCH | `/products/:id` | `openProductForm` (แก้ไข) | 787 (818) |
| 7 | DELETE | `/products/:id` | `deleteProduct` | 831 (834) |
| 8 | GET | `/products/:id/price` | `setDisplayCurrency` (แถบ "แสดงราคาเป็น") | 551 (566) |
| 9 | GET | `/categories` | `loadCategories` | 851 (854) |
| 10 | POST | `/categories` | `openCategoryForm` (เพิ่ม) | 890 (903) |
| 11 | PATCH | `/categories/:id` | `openCategoryForm` (แก้ไข) | 890 (903) |
| 12 | DELETE | `/categories/:id` | `deleteCategory` | 913 (917) |
| 13 | GET | `/suppliers` | `loadSuppliers` | 934 (937) |
| 14 | POST | `/suppliers` | `openSupplierForm` (เพิ่ม) | 975 (1013) |
| 15 | PATCH | `/suppliers/:id` | `openSupplierForm` (แก้ไข) | 975 (1013) |
| 16 | DELETE | `/suppliers/:id` | `deleteSupplier` | 1023 (1027) |

ไม่ได้เรียก 2 ตัว: `GET /health` (ไว้ตรวจเซิร์ฟเวอร์) และ `GET /products/:id` (หน้าเว็บใช้รายการทั้งหมดที่โหลดไว้แล้ว)
GET ใช้ `fetch` ธรรมดา (ไม่ต้อง token) · POST/PATCH/DELETE ใช้ `apiFetch` (แนบ token)

## เปิดหน้าเว็บแล้วเกิดอะไร (ลำดับจริง)
1. เบราว์เซอร์ขอ `/` → backend ส่ง `index.html` (express.static)
2. `<link href="style.css">` (index.html 8) โหลดหน้าตา และบรรทัดท้าย `<script src="app.js">` (index.html 172) โหลดโค้ด
3. app.js บรรทัด 1052-1057: เปิดแท็บตาม URL → เช็ก token เก่า (`/auth/me`) → โหลด 3 ตาราง (GET products / categories / suppliers) พร้อมกัน
4. ได้ JSON → วาดแถวตาราง → ผู้ใช้กดปุ่ม → เรียก endpoint ตามตารางข้างบน

## 🎯 "ตรงนี้มาจากไหน" (ชี้หน้าจอ)

| บนจอ | มาจาก |
|---|---|
| ตารางสินค้า | `renderProducts` (485) ← `GET /products` ← SQL JOIN 3 ตาราง |
| ชื่อหมวดหมู่/ผู้จัดจำหน่ายในตารางสินค้า | `p.category_name` / `p.supplier_name` ← JOIN ใน backend |
| "N ชิ้น" ในตารางหมวดหมู่ | `c.product_count` ← `COUNT` + `GROUP BY` ใน backend |
| ตัวเลขข้างแท็บ | `setCount` (42) นับจากข้อมูลที่โหลดมา |
| "พบ X จาก Y รายการ" | `filterRows` (592) นับในเบราว์เซอร์ |
| ราคา USD ทั้งตาราง | `priceCell` (531) ← อัตราจาก `GET /products/:id/price` × ราคา |
| ปุ่มแก้ไข/ลบโผล่/หาย | class `is-admin` ที่ `<body>` (app.js 84) + CSS (style.css 32) |
