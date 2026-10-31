# โฟลเดอร์ติว — อ่านโค้ดคู่กับสรุป

> **นี่คือสำเนาสำหรับอ่านทำความเข้าใจ ไม่ใช่ไฟล์ส่ง** · ไฟล์ส่งคือ `D:\API Backend\project-phase3-67160184.zip` · โค้ดในโฟลเดอร์นี้ **เหมือนกับในซิปทุกตัวอักษร** (ตรวจด้วย hash แล้ว) ไม่ต้องรันที่นี่ (ไม่มี `package.json` / `node_modules`) ใช้อ่านอย่างเดียว

> **อัปเดต 2026-10-30:** หน้าสินค้าไม่มีปุ่ม "แปลงราคา" รายแถวแล้ว แปลงราคาใช้แถบ **"แสดงราคาเป็น"** เหนือตารางที่เดียว (`setDisplayCurrency` app.js 551, `priceCell` 531) · โค้ดและสรุปในโฟลเดอร์นี้อัปเดตตามแล้ว

## โครงโฟลเดอร์

```
study-67160184/
├── 00-start-here.md          ← ไฟล์นี้
├── study-progress.md         ← สถานะการติว ขั้น 1-6 + จุดที่อาจารย์จะถาม
├── study-index-js/           ← สรุป backend 6 ส่วน (4A-4F) + ตาราง endpoint 18 ตัว
├── study-frontend/           ← สรุปหน้าเว็บ 8 ส่วน (5A-5H) + ตาราง 16 endpoint ที่หน้าเว็บเรียก
├── src/
│   ├── index.js              ← backend หลัก 489 บรรทัด (มีคอมเมนต์ต่อท้ายบรรทัดที่ยาก)
│   ├── middlewares/auth.js   ← ด่านตรวจ JWT 59 บรรทัด (มีหัวข้อ [ด่าน 1] [ด่าน 2])
│   └── services/external-api.js  ← เรียก API อัตราแลกเปลี่ยน (timeout/retry/fallback)
├── frontend/
│   ├── index.html            ← โครงหน้า 174 บรรทัด
│   ├── style.css             ← หน้าตา 170 บรรทัด
│   └── app.js                ← การทำงานของหน้าเว็บ 1057 บรรทัด (มีคอมเมนต์ต่อท้าย)
└── db.js, schema.sql, seed.sql   ← เชื่อมฐานข้อมูล / ตาราง / ข้อมูลตั้งต้น
```

ในไฟล์สรุปมีลิงก์กดเปิดโค้ดตรงบรรทัดได้ (เช่น `../src/index.js`) เพราะโครงโฟลเดอร์ตรงกับที่ลิงก์ชี้

## ลำดับอ่านที่แนะนำ (เรียงตามที่อาจารย์ชอบถาม)

| ลำดับ | อ่านสรุป | เปิดโค้ดคู่กัน | เรื่อง |
|---|---|---|---|
| 1 | [study-index-js/00-overview.md](study-index-js/00-overview.md) | — | ตาราง endpoint 18 ตัว + รหัสสถานะ + รูปแบบ route |
| 2 | [study-index-js/4C-products.md](study-index-js/4C-products.md) | `src/index.js` บรรทัด 111-306 | สินค้า 6 endpoint (JOIN, PATCH, แปลงราคา) |
| 3 | [study-index-js/4B-auth.md](study-index-js/4B-auth.md) | `src/index.js` 42-109 + `src/middlewares/auth.js` | login, JWT, SQL injection, timing attack |
| 4 | [study-index-js/4D-categories.md](study-index-js/4D-categories.md) + [4E](study-index-js/4E-suppliers.md) | `src/index.js` 308-461 + `schema.sql` | CASCADE vs SET NULL |
| 5 | [study-frontend/00-overview.md](study-frontend/00-overview.md) | — | เกณฑ์ Frontend 10 คะแนน ↔ โค้ด |
| 6 | [study-frontend/5D-openForm.md](study-frontend/5D-openForm.md) | `frontend/app.js` 221-332 | ตรวจข้อมูลก่อนส่ง |
| 7 | [study-frontend/5C-login.md](study-frontend/5C-login.md), [5B](study-frontend/5B-basics.md), [5F](study-frontend/5F-products.md) | `frontend/app.js` | token, loading/error, หน้าสินค้า |
| 8 | [study-index-js/4F-errors-start.md](study-index-js/4F-errors-start.md), [4A](study-index-js/4A-setup.md) | `src/index.js` 1-40, 463-489 | ตั้งค่า, 404/500 |

ขั้น 3 (API ภายนอก) อ่านที่หัวข้อ "ขั้น 3" ใน [study-progress.md](study-progress.md) คู่กับ `src/services/external-api.js`

## วิธีอ่านคอมเมนต์ในโค้ด
คอมเมนต์ภาษาไทยอยู่ **ต่อท้ายบรรทัด** หลังเครื่องหมาย `//` เช่น

```js
const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]); // ? = ช่องใส่ค่าอย่างปลอดภัย กัน SQL injection
```
มีเฉพาะจุดที่ยากและอาจารย์น่าถาม ไม่ได้คอมเมนต์ทุกบรรทัด บรรทัดที่อยู่ใน SQL หลายบรรทัดไม่มีคอมเมนต์ (อธิบายไว้ที่บรรทัด `pool.query` ถัดจากนั้น)

## สูตรอ่านโค้ดทุกบรรทัด (ถ้าอาจารย์ให้เปิดโค้ดอธิบาย)
ถามตัวเอง 3 ข้อกับบรรทัดนั้น: **(1) รับอะไรเข้ามา (2) ทำอะไร (3) ผลลัพธ์ไปไหนต่อ**

## สูตรตอบ "ตรงนี้มาจากไหน"
สิ่งที่เห็นบนจอ → `app.js` วาดจากอะไร → เรียก endpoint ไหน → SQL อะไร → ตารางไหน
(ไม้เด็ด: F12 → Network → รีเฟรช → คลิกคำขอ `products` → แท็บ Response)

## จำให้ได้ 3 บรรทัด
1. **อ่านเปิดหมด เขียนต้อง admin** (GET สาธารณะ 7 · ต้องมี token 2 · ต้องเป็น admin 9 = 18)
2. **ตรวจ 3 ชั้น:** หน้าเว็บ (ผู้ใช้รู้เร็ว) → backend (ตัดสินจริง) → ฐานข้อมูล (UNIQUE / FOREIGN KEY ด่านสุดท้าย)
3. **ลบหมวดหมู่ = สินค้าหายตาม (CASCADE) · ลบผู้จัดจำหน่าย = สินค้ายังอยู่ (SET NULL)**

## ข้อจำกัดที่ยอมรับตรงๆ ได้ถ้าอาจารย์ถาม
ไม่มี pagination · ไม่มี rate limiter · POST ไม่ตรวจข้อมูลที่ backend (ข้อมูลผิดได้ 500 แทน 400) · ผู้จัดจำหน่ายบังคับเลือกที่หน้าเว็บเท่านั้น (API รับ null ได้) · ข้อมูลซ้ำตอบ 500 แทน 409
