# 4D — หมวดหมู่ (บรรทัด 308-377)

> [← ภาพรวม](00-overview.md) · โค้ด: [../src/index.js:308](../src/index.js) · endpoint 4 ตัว · โครงเหมือนสินค้า (4C)

## 🎯 endpoint

| Method | Path | สิทธิ์ | ทำอะไร | ตอบ | บรรทัด |
|---|---|---|---|---|---|
| GET | `/api/v1/categories` | สาธารณะ | ดูทั้งหมด + นับสินค้า | 200 | 309-324 |
| POST | `/api/v1/categories` | admin | เพิ่ม (UC-01) | 201 / 500 | 327-341 |
| DELETE | `/api/v1/categories/:id` | admin | ลบ | 200 / 404 | 344-357 |
| PATCH | `/api/v1/categories/:id` | admin | แก้ชื่อ/คำอธิบาย | 200 / 400 / 404 / 500 | 362-377 |

## GET นับจำนวนสินค้า (บรรทัด 311-317)
```sql
SELECT c.id, c.name, c.description, COUNT(p.id) AS product_count
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.id
ORDER BY c.id ASC;
```
- `COUNT(p.id)` นับสินค้าของแต่ละหมวด · `GROUP BY c.id` = จับกลุ่มทีละหมวด
- **LEFT JOIN** เพื่อให้หมวดที่ไม่มีสินค้ายังขึ้น (นับได้ 0) ถ้าใช้ INNER JOIN หมวดว่างจะหายไป
- จำนวนนี้ **ไม่ได้เก็บไว้ในตาราง** คำนวณสดทุกครั้ง จึงไม่มีทางเพี้ยน

## POST / PATCH / DELETE
- POST (330) `INSERT INTO categories (name, description) VALUES (?, ?)` → 201 + `insertId`
- PATCH (360-367) แก้ได้แค่ `name`, `description` ผ่าน `pickEditable` (เหมือนสินค้า)
- DELETE (347) `DELETE FROM categories WHERE id = ?` ไม่พบ → 404

## 🎯 คำถามที่อาจารย์น่าถาม + คำตอบสั้น

| คำถาม | คำตอบ |
|---|---|
| **ลบหมวดหมู่ที่มีสินค้าเกิดอะไรขึ้น** | สินค้าในหมวด **ถูกลบตาม** เพราะ FK ตั้ง `ON DELETE CASCADE` ใน `schema.sql` (โค้ดบรรทัด 347 สั่งลบแค่หมวด ฐานข้อมูลลบสินค้าให้เอง) หน้าเว็บจึงเตือนจำนวนสินค้าก่อนลบ |
| **"N ชิ้น" มาจากไหน** | `COUNT(p.id)` + `GROUP BY` บรรทัด 312-315 คำนวณสด |
| **ทำไม LEFT JOIN** | ให้หมวดที่ยังไม่มีสินค้าแสดงด้วย (0 ชิ้น) |
| **ชื่อหมวดซ้ำได้ไหม** | ไม่ได้ `name` เป็น UNIQUE ส่งซ้ำ → ฐานข้อมูลปฏิเสธ → 500 |
