# ERD — StockPro (ฐานข้อมูล `product_db`)

ภาพสำหรับส่งงานคือ [erd.png](erd.png) — ไฟล์นี้เป็นฉบับข้อความ (Mermaid) แสดงผลเป็นแผนภาพได้ใน VS Code (`Ctrl+Shift+V`) หรือ GitHub

```mermaid
erDiagram
    categories ||--o{ products : "1 : N  (ON DELETE CASCADE)"
    suppliers  |o--o{ products : "0..1 : N  (ON DELETE SET NULL)"

    categories {
        INT id PK "AUTO_INCREMENT"
        VARCHAR_100 name UK "NOT NULL"
        TEXT description
        TIMESTAMP created_at
    }
    suppliers {
        INT id PK "AUTO_INCREMENT"
        VARCHAR_20 supplier_code UK "NOT NULL"
        VARCHAR_150 name "NOT NULL"
        VARCHAR_100 email UK "NOT NULL"
        VARCHAR_20 phone
        TIMESTAMP created_at
    }
    products {
        INT id PK "AUTO_INCREMENT"
        INT category_id FK "NOT NULL"
        INT supplier_id FK "NULL"
        VARCHAR_150 name "NOT NULL"
        DECIMAL_10_2 price "NOT NULL, >= 0"
        VARCHAR_50 sku UK "NOT NULL"
        INT stock_quantity "NOT NULL, >= 0"
        TIMESTAMP created_at
    }
    users {
        INT id PK "AUTO_INCREMENT"
        VARCHAR_100 email UK "NOT NULL"
        VARCHAR_255 password_hash "bcrypt"
        ENUM role "admin"
        TIMESTAMP created_at
    }
```

## ความสัมพันธ์

| จาก | ไป | ชนิด | เมื่อลบฝั่งแม่ |
|---|---|---|---|
| `categories.id` | `products.category_id` | 1 : N (สินค้าต้องมี 1 หมวดหมู่) | **CASCADE** — สินค้าในหมวดถูกลบตาม |
| `suppliers.id` | `products.supplier_id` | 0..1 : N (สินค้าไม่มีผู้จัดจำหน่ายได้) | **SET NULL** — สินค้ายังอยู่ ช่องผู้จัดจำหน่ายเป็นว่าง |

`users` ใช้เก็บบัญชีผู้ดูแลระบบสำหรับ login (JWT) ไม่มี foreign key เชื่อมกับตารางอื่น

คำอธิบาย: **PK** = Primary Key · **FK** = Foreign Key · **UK** = Unique
