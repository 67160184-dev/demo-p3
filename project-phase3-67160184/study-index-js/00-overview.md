# สรุป `src/index.js` ทั้ง 6 ส่วน — ฉบับอ่านก่อนนำเสนอ

> ไฟล์ทบทวน (ไม่อยู่ในซิป) · โค้ด: [../src/index.js](../src/index.js) 489 บรรทัด 18 endpoint · 🎯 = อาจารย์น่าถาม

## เวลาน้อย อ่านตามลำดับนี้

| ลำดับ | ไฟล์ | ทำไม | เวลา |
|---|---|---|---|
| 1 | **00-overview.md** (ไฟล์นี้) | ตาราง endpoint 18 ตัว ท่องให้ได้ | 5 นาที |
| 2 | **4C-products.md** | ส่วนใหญ่สุด อาจารย์ถามบ่อยสุด | 10 นาที |
| 3 | **4B-auth.md** | login / ความปลอดภัย | 7 นาที |
| 4 | **4D-categories.md** + **4E-suppliers.md** | CASCADE กับ SET NULL | 5 นาที |
| 5 | **4F-errors-start.md** | error 404/500 | 3 นาที |
| 6 | **4A-setup.md** | ตั้งค่าเซิร์ฟเวอร์ | 3 นาที |

## แผนที่ไฟล์

| ส่วน | บรรทัด | endpoint | เรื่อง |
|---|---|---|---|
| [4A](4A-setup.md) | 1-40 | 1 | นำเข้าแพ็กเกจ, ด่านทั่วไป, เสิร์ฟหน้าเว็บ, Swagger, `/health` |
| [4B](4B-auth.md) | 42-109 | 3 | login, `/auth/me`, เปลี่ยนรหัสผ่าน |
| [4C](4C-products.md) | 111-306 | 6 | สินค้า |
| [4D](4D-categories.md) | 308-377 | 4 | หมวดหมู่ |
| [4E](4E-suppliers.md) | 379-461 | 4 | ผู้จัดจำหน่าย |
| [4F](4F-errors-start.md) | 463-489 | 0 | 404, ตัวจัดการ error, เปิดเซิร์ฟเวอร์ |

## 🎯 endpoint ทั้ง 18 ตัว (ท่องตารางนี้)

**สูตรจำ: อ่านเปิดหมด · เขียนต้อง admin** (ยกเว้น login ต้องเปิด และ 2 ตัวของบัญชีตัวเองแค่ต้องมี token)

| # | Method | Path | สิทธิ์ | ตอบ | บรรทัด |
|---|---|---|---|---|---|
| 1 | GET | `/health` | สาธารณะ | 200 | 38 |
| 2 | POST | `/api/v1/auth/login` | สาธารณะ | 200 / 400 / 401 | 49 |
| 3 | GET | `/api/v1/auth/me` | token | 200 / 401 | 76 |
| 4 | PATCH | `/api/v1/auth/change-password` | token | 200 / 400 / 401 / 404 | 84 |
| 5 | GET | `/api/v1/products` | สาธารณะ | 200 | 112 |
| 6 | GET | `/api/v1/products/:id` | สาธารณะ | 200 / 404 | 137 |
| 7 | POST | `/api/v1/products` | admin | 201 / 401 / 403 / 500 | 162 |
| 8 | GET | `/api/v1/products/:id/price` | สาธารณะ | 200 / 400 / 404 | 190 |
| 9 | PATCH | `/api/v1/products/:id` | admin | 200 / 400 / 404 / 500 | 265 |
| 10 | DELETE | `/api/v1/products/:id` | admin | 200 / 404 | 293 |
| 11 | GET | `/api/v1/categories` | สาธารณะ | 200 | 309 |
| 12 | POST | `/api/v1/categories` | admin | 201 / 500 | 327 |
| 13 | DELETE | `/api/v1/categories/:id` | admin | 200 / 404 | 344 |
| 14 | PATCH | `/api/v1/categories/:id` | admin | 200 / 400 / 404 / 500 | 362 |
| 15 | GET | `/api/v1/suppliers` | สาธารณะ | 200 | 380 |
| 16 | DELETE | `/api/v1/suppliers/:id` | admin | 200 / 404 | 398 |
| 17 | PATCH | `/api/v1/suppliers/:id` | admin | 200 / 400 / 404 / 500 | 416 |
| 18 | POST | `/api/v1/suppliers` | admin | 201 / 500 | 434 |

รวม: สาธารณะ 7 · token 2 · admin 9 = 18 (ตรงกับ Swagger `/api-docs`) · ทุกตัวที่เป็น admin ถ้าไม่มี token ได้ **401** ถ้า token ไม่ใช่ admin ได้ **403**

## รหัสสถานะที่ต้องรู้

| รหัส | ความหมาย | เกิดเมื่อ |
|---|---|---|
| 200 | สำเร็จ | ดู / แก้ / ลบ สำเร็จ |
| 201 | สร้างสำเร็จ | POST เพิ่มข้อมูลใหม่ |
| 400 | คำขอผิด | ส่งไม่ครบ, PATCH ไม่ส่งช่องใดเลย, สกุลเงินผิด |
| 401 | ไม่รู้ว่าเป็นใคร | ไม่มี token / token เสีย / login ผิด |
| 403 | รู้ว่าใคร แต่ไม่มีสิทธิ์ | token ไม่ใช่ admin |
| 404 | ไม่พบ | id ที่ไม่มีอยู่ / path ที่ไม่มี |
| 500 | เซิร์ฟเวอร์ผิดพลาด | ข้อมูลซ้ำ (UNIQUE), id อ้างอิงไม่มีจริง (FK), ฐานข้อมูลล่ม |

## รูปแบบเดียวที่ใช้ทั้งไฟล์ (เข้าใจอันนี้ = อ่านได้ทุก endpoint)

```js
app.METHOD("path", [ด่าน], async (req, res, next) => {
  const ... = req.params / req.body / req.query;   // 1 อ่านข้อมูลจากคำขอ
  try {
    const [rows] = await pool.query("SQL ... ?", [ค่า]);   // 2 สั่ง SQL (ใช้ ? กัน SQL injection)
    if (ไม่พบ) return res.status(404).json(...);           // 3 ตรวจผล
    res.status(200).json({ message, data });                // 4 ตอบกลับ
  } catch (err) { next(err); }                              // 5 พัง → ส่งไปตัวจัดการ error (บรรทัด 471)
});
```

- `req.params` = ค่าใน path เช่น `/products/5` → `id = "5"`
- `req.body` = ข้อมูล JSON ที่หน้าเว็บส่งมา (POST/PATCH)
- `req.query` = ค่าหลัง `?` เช่น `?currency=USD`
