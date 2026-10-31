# 4A — ตั้งค่าเซิร์ฟเวอร์ (บรรทัด 1-40)

> [← ภาพรวม](00-overview.md) · โค้ด: [../src/index.js:1](../src/index.js) · endpoint 1 ตัว

## ทำอะไร
เตรียมเซิร์ฟเวอร์ก่อนรับคำขอ: หยิบเครื่องมือ → สร้างแอป → ใส่ด่านทั่วไป → เสิร์ฟหน้าเว็บ + Swagger → endpoint `/health`

## ทีละช่วง

| บรรทัด | โค้ด | แปลว่า |
|---|---|---|
| 1 | `require("dotenv").config()` | อ่านไฟล์ `.env` (รหัสฐานข้อมูล, JWT_SECRET) ต้องอยู่บนสุด |
| 2-10 | `express`, `helmet`, `cors`, `morgan`, `fs`, `path`, `swagger-ui-express`, `js-yaml`, `bcrypt` | หยิบแพ็กเกจ (ดูตารางล่าง) |
| 11 | `const pool = require("../db")` | ตัวเชื่อม MySQL (`..` = ขึ้นไป 1 ชั้น) |
| 12 | `getExchangeRate` | จาก `services/external-api.js` (แปลงราคา) |
| 13 | `generateToken, authenticateToken, requireAdmin` | จาก `middlewares/auth.js` (ด่าน JWT) |
| 15 | `const app = express()` | สร้างแอปเซิร์ฟเวอร์ |
| 16 | `PORT = process.env.PORT \|\| 3000` | พอร์ต 3000 → `localhost:3000` |
| 19 | `app.use(helmet())` | ใส่หัวข้อความปลอดภัยทุกคำตอบ |
| 20 | `app.use(cors())` | อนุญาตเว็บอื่นเรียก API |
| 21 | `morgan("dev")` ยกเว้นตอน test | พิมพ์ log ทุกคำขอในเทอร์มินัล |
| 22 | **`app.use(express.json())`** | **อ่าน JSON ที่หน้าเว็บส่งมา → `req.body`** (ลบแล้ว login/เพิ่มข้อมูลพังหมด) |
| 25 | `express.static(... "frontend")` | เสิร์ฟหน้าเว็บจากโฟลเดอร์ `frontend/` |
| 28-31 | อ่าน `openapi.yaml` → `/api-docs` | หน้าเอกสาร Swagger |
| 38-40 | `app.get("/health", ...)` | endpoint ตรวจว่าเซิร์ฟเวอร์ยังทำงาน |

**`app.use(X)`** = ทุกคำขอต้องผ่าน X ก่อน เรียงบนลงล่าง

## แพ็กเกจที่ใช้ (ถ้าอาจารย์ถามว่าใช้อะไรบ้าง)

| แพ็กเกจ | ไว้ทำ |
|---|---|
| express | รับคำขอ / ส่งคำตอบ |
| mysql2 (ผ่าน `db.js`) | คุยกับ MySQL |
| jsonwebtoken | ทำ/ตรวจ JWT |
| bcrypt | เข้ารหัสรหัสผ่าน |
| axios | เรียก API ภายนอก |
| helmet / cors / morgan | ความปลอดภัย / อนุญาตต่างโดเมน / log |
| swagger-ui-express + js-yaml | หน้าเอกสาร API |
| dotenv | อ่าน `.env` |

## 🎯 คำถามที่อาจารย์น่าถาม
- **หน้าเว็บกับ API อยู่เซิร์ฟเวอร์เดียวกันไหม?** → ใช่ บรรทัด 25 `express.static` เสิร์ฟโฟลเดอร์ `frontend/` จากพอร์ตเดียวกัน ไม่ต้องมีเว็บเซิร์ฟเวอร์แยก
- **Swagger มาจากไหน?** → บรรทัด 28-31 อ่าน `openapi.yaml` แล้วแสดงที่ `/api-docs`
- **`express.json()` ทำอะไร?** → แปลงข้อมูล JSON ในคำขอเป็น `req.body` ถ้าไม่มี POST/PATCH ใช้ไม่ได้

## 🌐 ดูของจริง
- http://localhost:3000/health → `{"status":"OK",...}`
- http://localhost:3000/app.js → เห็นโค้ดหน้าเว็บ (มาจากบรรทัด 25)
- http://localhost:3000/api-docs/ → Swagger
