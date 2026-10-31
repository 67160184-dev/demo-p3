# 4C — สินค้า (บรรทัด 111-306) ⭐ ส่วนสำคัญที่สุด

> [← ภาพรวม](00-overview.md) · โค้ด: [../src/index.js:111](../src/index.js) · endpoint 6 ตัว

## 🎯 endpoint

| # | Method | Path | สิทธิ์ | ทำอะไร | ตอบ | บรรทัด |
|---|---|---|---|---|---|---|
| 1 | GET | `/api/v1/products` | สาธารณะ | ดูทั้งหมด (UC-04) | 200 | 112-134 |
| 2 | GET | `/api/v1/products/:id` | สาธารณะ | ดูรายชิ้น | 200 / 404 | 137-159 |
| 3 | POST | `/api/v1/products` | admin | เพิ่ม (UC-03) | 201 / 500 | 162-187 |
| 4 | GET | `/api/v1/products/:id/price` | สาธารณะ | แปลงราคา (Phase 2) | 200 / 400 / 404 | 190-245 |
| 5 | PATCH | `/api/v1/products/:id` | admin | แก้ไข (UC-05) | 200 / 400 / 404 / 500 | 265-290 |
| 6 | DELETE | `/api/v1/products/:id` | admin | ลบ | 200 / 404 | 293-306 |

## 1-2. GET ดูสินค้า — JOIN 3 ตาราง (บรรทัด 114-121, 140-148)

```sql
SELECT p.id, p.sku, p.name AS product_name, p.price, p.stock_quantity,
       p.category_id, c.name AS category_name, p.supplier_id, s.name AS supplier_name, p.created_at
FROM products p
INNER JOIN categories c ON p.category_id = c.id     -- 119
LEFT JOIN suppliers s ON p.supplier_id = s.id       -- 120
ORDER BY p.id ASC;
```
- `products` เก็บแค่เลข `category_id`, `supplier_id` → ต้อง **JOIN** เอาชื่อมาแสดงในคำสั่งเดียว
- `AS product_name` = ตั้งชื่อคอลัมน์ใหม่ (หน้าเว็บใช้ `p.product_name`) **จำเป็นต้องตั้ง** เพราะ `products.name` และ `categories.name` ชื่อคอลัมน์ชนกัน (ทั้งคู่ชื่อ `name`) ถ้าไม่ตั้งชื่อใหม่จะไม่รู้ว่า `name` ไหนเป็นของสินค้า ไหนเป็นของหมวดหมู่
- `p`, `c`, `s` = ชื่อย่อ (alias) ของ `products`, `categories`, `suppliers` — ตั้งไว้กันพิมพ์ชื่อตารางเต็มซ้ำทุกจุด
- รายชิ้นเหมือนกันแต่เพิ่ม `WHERE p.id = ?` ไม่เจอ → 404 (บรรทัด 150-154)
- `ORDER BY p.id ASC` ท้ายคำสั่ง: ถ้าไม่เรียง ฐานข้อมูลอาจคืนลำดับแถวไม่แน่นอนในแต่ละครั้งที่เรียก (ตารางในหน้าเว็บจะสลับที่ไปมา)

### 🎯 ทำไม INNER JOIN หมวดหมู่ แต่ LEFT JOIN ผู้จัดจำหน่าย (ดูตัวอย่างให้เห็นภาพ)

| สินค้า | category_id | supplier_id | ถ้าใช้ INNER JOIN suppliers (ผิด) | ใช้ LEFT JOIN suppliers (ถูก) |
|---|---|---|---|---|
| Mouse | 1 | 1 | แสดง | แสดง |
| USB Cable | 1 | `NULL` | **หายไปจากผลลัพธ์ทั้งแถว** ❌ | แสดง (supplier_name เป็น `NULL`) ✅ |

เหตุผล: `category_id` เป็น `NOT NULL` ในฐานข้อมูล (สินค้าต้องมีหมวดหมู่เสมอ) ใช้ `INNER JOIN` ได้ปลอดภัยเพราะจับคู่ได้ทุกแถวแน่นอน ส่วน `supplier_id` เป็น `NULL` ได้ (เช่นหลังลบผู้จัดจำหน่ายแล้วใช้ `ON DELETE SET NULL`) ถ้าใช้ `INNER JOIN` สินค้าที่ไม่มีผู้จัดจำหน่ายจะหายไปจากตารางทั้งแถว จึงต้องใช้ `LEFT JOIN` เพื่อเก็บทุกแถวจากฝั่ง `products` ไว้เสมอ

## 3. POST เพิ่มสินค้า (บรรทัด 162-187)
```
163  หยิบ category_id, supplier_id, name, price, sku, stock_quantity จาก req.body
167  INSERT INTO products (...) VALUES (?, ?, ?, ?, ?, ?)
176  stock_quantity || 0      ← ไม่ส่งสต็อกมาใส่ 0
182  201 { id: result.insertId, ... }   ← insertId = id ใหม่ที่ฐานข้อมูลสร้าง
```

## 4. แปลงราคา (บรรทัด 190-245) — ต่อกับขั้น 3 `external-api.js`
```
192  อ่าน ?currency= (ไม่ส่ง = USD) แปลงเป็นตัวใหญ่
193  ไม่ใช่ตัวอักษร 3 ตัว → 400
200  SELECT ราคาจาก products  ไม่พบ → 404
210  getExchangeRate(currency)   ← timeout 3 วิ / retry 2 ครั้ง / fallback
212  "unsupported" → 400 ไม่รองรับสกุลเงิน
217  "fallback"   → 200 ราคาบาทเดิม + fallback: true
230  สำเร็จ        → 200 converted_price = ราคา × rate ปัด 2 ตำแหน่ง (บรรทัด 238)
```

## 5. PATCH แก้ไข — รับเฉพาะช่องที่อนุญาต (บรรทัด 248-290)
```js
const PRODUCT_EDITABLE_FIELDS = ["name", "sku", "price", "stock_quantity", "category_id", "supplier_id"]; // 263
const changes = pickEditable(req.body, PRODUCT_EDITABLE_FIELDS);   // 267 คัดเฉพาะช่องในรายการ
if (Object.keys(changes).length === 0) return noEditableFields(...); // 268 ไม่ส่งช่องใดเลย → 400
await pool.query("UPDATE products SET ? WHERE id = ?", [changes, id]); // 271
if (result.affectedRows === 0) → 404                               // 276 ไม่มีแถวถูกแก้ = id ไม่มี
```
- `pickEditable` (บรรทัด 248-254) วนดูทีละช่องในรายการ ถ้าคำขอส่งมาก็เก็บ **ช่องอื่น เช่น `id` ถูกละทิ้ง** กันคนแอบแก้
- `SET ?` กับ object → ไลบรารีแปลงเป็น `name = ..., price = ...` ให้อย่างปลอดภัย
- `affectedRows` = จำนวนแถวที่ถูกแก้ เป็น 0 แปลว่าไม่พบ id

## 6. DELETE ลบ (บรรทัด 293-306)
`DELETE FROM products WHERE id = ?` → `affectedRows === 0` → 404 ไม่งั้น 200

## 🎯 คำถามที่อาจารย์น่าถาม + คำตอบสั้น

| คำถาม | คำตอบ |
|---|---|
| **ชื่อหมวดหมู่ในตารางสินค้ามาจากไหน** | `GET /products` บรรทัด 119 `INNER JOIN categories` ต่อตารางด้วย `category_id` |
| **ทำไม INNER JOIN หมวดหมู่ แต่ LEFT JOIN ผู้จัดจำหน่าย** | สินค้าต้องมีหมวดหมู่เสมอ แต่ผู้จัดจำหน่ายว่างได้ (ลบแล้ว SET NULL) LEFT JOIN จึงยังแสดงสินค้าที่ไม่มีผู้จัดจำหน่าย |
| **PATCH ต่างจาก PUT ยังไง** | PATCH ส่งเฉพาะช่องที่แก้ ช่องที่ไม่ส่งคงเดิม (PUT ต้องส่งครบทุกช่อง) |
| **กันแก้ id ยังไง** | `pickEditable` + รายการช่องที่อนุญาต (บรรทัด 263) ช่องอื่นถูกละทิ้ง |
| **ส่ง SKU ซ้ำ / หมวดหมู่ที่ไม่มีจริง ได้อะไร** | ฐานข้อมูลปฏิเสธ (UNIQUE / FOREIGN KEY) → `next(err)` → **500** (ข้อจำกัด: ควรเป็น 409/400 ถ้าทำต่อจะจับ error ชนิดนี้แยก) |
| **⚠️ POST ตรวจข้อมูลที่ backend ไหม** | **ตอบตามจริง:** POST ไม่ได้ตรวจช่องเองที่ backend (หน้าเว็บตรวจก่อนส่ง) อาศัยกฎฐานข้อมูล NOT NULL / CHECK ราคา ≥ 0 / UNIQUE / FK ถ้าผิดได้ 500 ไม่ใช่ 400 — ถ้าทำต่อจะเพิ่มการตรวจที่ backend ให้ตอบ 400 พร้อมบอกช่องที่ผิด |
| **ข้อมูลเพิ่ม 10 เท่า อะไรช้าก่อน** | `GET /products` ส่งทุกแถวไม่มี LIMIT → เพิ่ม pagination (`LIMIT/OFFSET`) และค้นหาที่ backend |
| **แปลงราคาถ้า API ภายนอกล่ม** | ลอง 3 ครั้ง (timeout 3 วิ + backoff) แล้ว fallback ตอบ 200 ราคาบาทเดิม `fallback: true` ไม่ crash |
| **ทำไมเพิ่มสำเร็จตอบ 201 ไม่ใช่ 200** | 201 Created = สร้างข้อมูลใหม่สำเร็จ ตามหลัก REST |

## 🌐 ดูของจริง
http://localhost:3000/api/v1/products (JSON ดิบ) · F12 Network → กด แก้ไข → บันทึก → `PATCH products/1` ดู Request Payload เห็นเฉพาะช่องที่ส่ง
