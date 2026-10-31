# 5H — แท็บ + คำสั่งเริ่มทำงาน (app.js 1038-1057)

> [← ภาพรวม](00-overview.md) · โค้ด: [../frontend/app.js:1038](../frontend/app.js)

## `showTab(name)` (1041-1049)
- สลับแผงที่มองเห็น (`hidden`) และไฮไลต์แท็บ (`aria-selected`)
- บรรทัด 1048 `history.replaceState(..., "#categories")` จำแท็บไว้ใน URL **ไม่โหลดหน้าใหม่** รีเฟรชแล้วอยู่แท็บเดิม
- สลับแท็บ **ไม่ยิง API** แค่ซ่อน/โชว์ของที่โหลดไว้แล้ว

## คำสั่งที่รันตอนเปิดหน้า (1051-1057) — จุดเริ่มต้นของทุกอย่าง

```js
document.querySelectorAll(".tab").forEach(...)   // 1051 ผูกปุ่มแท็บ
showTab(location.hash.slice(1));                  // 1052 เปิดแท็บตาม URL (ไม่มี = สินค้า)
restoreSession();                                 // 1054 เช็ก token เก่า → GET /auth/me
loadProducts();                                   // 1055 GET /products
loadCategories();                                 // 1056 GET /categories
loadSuppliers();                                  // 1057 GET /suppliers
```
ทั้ง 4 ตัวท้ายทำงาน **พร้อมกัน** ไม่รอกัน (เป็น async) GET เปิดให้ทุกคน ผู้เยี่ยมชมจึงเห็นข้อมูลโดยไม่ต้องรอผลล็อกอิน

## 🎯 ถ้าถูกถาม
- **เปิดหน้าเว็บแล้วหน้าเว็บเรียก API อะไรบ้าง?** → 4 ตัว: `/auth/me` (ถ้ามี token เก่า), `/products`, `/categories`, `/suppliers` (ดูได้ใน F12 → Network)
- **เป็น SPA ไหม?** → ใช่ หน้าเดียว ไม่โหลดหน้าใหม่ สลับแท็บ/เพิ่ม/แก้/ลบ อัปเดตตารางด้วย JavaScript
