require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const YAML = require("js-yaml");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { getExchangeRate } = require("./services/external-api");
const { generateToken, authenticateToken, requireAdmin } = require("./middlewares/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(cors());
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
app.use(express.json()); // อ่าน JSON ที่หน้าเว็บส่งมาไว้ใน req.body (ไม่มีบรรทัดนี้ POST/PATCH ใช้ไม่ได้)

// Frontend — เสิร์ฟจาก origin เดียวกับ API เพื่อไม่ต้องพึ่ง CORS
app.use(express.static(path.join(__dirname, "..", "frontend"))); // เสิร์ฟหน้าเว็บ (index.html, style.css, app.js) จากโฟลเดอร์ frontend ที่พอร์ตเดียวกับ API

// Swagger UI — เอกสาร API จาก openapi.yaml
const openapiDocument = YAML.load(
  fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"),
);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument)); // หน้าเอกสาร Swagger สร้างจาก openapi.yaml

// ==========================================
// REST Endpoints
// ==========================================

// Health Check Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Product API is running" });
});

// ==========================================
// Authentication (Phase 3) — ดูข้อมูล (GET) ไม่ต้อง login; เพิ่ม/แก้ไข/ลบ ต้อง login เป็น admin
// ==========================================

// hash สำรองไว้เทียบเมื่อไม่พบอีเมล — ให้ใช้เวลาตรวจเท่ากันทุกกรณี ลด timing side-channel (ตามสัปดาห์ที่ 6)
const DUMMY_PASSWORD_HASH = "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin"; // hash ปลอมไว้เทียบเมื่อไม่พบอีเมล (กัน timing attack)

app.post("/api/v1/auth/login", async (req, res, next) => { // สาธารณะ (ไม่ต้อง token) ตอบ 200 / 400 ส่งไม่ครบ / 401 ผิด
  const { email, password } = req.body; // หยิบ email กับ password จากข้อมูลที่หน้าเว็บส่งมา
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: { code: "BAD_REQUEST", message: "กรุณาระบุ email และ password" } });
  }
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]); // ? = ช่องใส่ค่าอย่างปลอดภัย กัน SQL injection (ห้ามต่อข้อความเอง)
    const user = rows[0];
    const isValid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH); // เทียบรหัสที่พิมพ์กับ hash แม้ไม่พบอีเมล ใช้เวลาเท่ากันทุกกรณี
    if (!user || !isValid) { // ตอบข้อความเดียวกันทั้ง 2 กรณี ไม่บอกว่าผิดที่อีเมลหรือรหัส
      return res
        .status(401)
        .json({ error: { code: "INVALID_CREDENTIALS", message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" } });
    }
    res.status(200).json({
      message: "เข้าสู่ระบบสำเร็จ",
      token: generateToken(user), // ออกบัตร JWT (auth.js) อายุ 1 ชม. ไม่ส่ง password_hash กลับ
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

// ข้อมูลผู้ใช้จาก token — หน้าเว็บใช้ตรวจว่า token ที่จำไว้ยังใช้ได้
app.get("/api/v1/auth/me", authenticateToken, (req, res) => { // ต้องมี token (ด่าน 1) คืนข้อมูลจากบัตรที่ req.user
  const { id, email, role } = req.user;
  res.status(200).json({ message: "สำเร็จ", data: { id, email, role } });
});

// เปลี่ยนรหัสผ่านของผู้ที่ login อยู่ (แบบฝึกหัดต่อยอดสัปดาห์ที่ 6) — ต้องยืนยันรหัสผ่านเดิมก่อน
const MIN_PASSWORD_LENGTH = 8;

app.patch("/api/v1/auth/change-password", authenticateToken, async (req, res, next) => { // ต้องมี token แก้ได้เฉพาะรหัสของตัวเอง (ใช้ id จากบัตร ไม่ใช่ที่หน้าเว็บส่ง)
  const { oldPassword, newPassword } = req.body;
  const badRequest = (message) => res.status(400).json({ error: { code: "BAD_REQUEST", message } });
  if (!oldPassword || !newPassword) return badRequest("กรุณาระบุ oldPassword และ newPassword");
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return badRequest(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  }
  if (oldPassword === newPassword) return badRequest("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "ไม่พบบัญชีผู้ใช้" } });
    }
    if (!(await bcrypt.compare(oldPassword, rows[0].password_hash))) { // รหัสเดิมผิด → 401 INVALID_CREDENTIALS (หน้าเว็บไม่ออกจากระบบ เพราะไม่ใช่ NO_TOKEN)
      return res
        .status(401)
        .json({ error: { code: "INVALID_CREDENTIALS", message: "รหัสผ่านเดิมไม่ถูกต้อง" } });
    }
    const newHash = await bcrypt.hash(newPassword, 10); // เข้ารหัสรหัสใหม่ (10 = ความหนักของการคำนวณ) ไม่เก็บรหัสจริง
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
    res.status(200).json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) {
    next(err);
  }
});

// 1. GET: ดึงข้อมูลสินค้าทั้งหมดพร้อม JOIN (UC-04)
app.get("/api/v1/products", async (req, res, next) => { // สาธารณะ: JOIN 3 ตาราง เอาชื่อหมวดหมู่/ผู้จัดจำหน่ายมาแสดง
  try {
    const query = `
      SELECT
        p.id, p.sku, p.name AS product_name, p.price, p.stock_quantity,
        p.category_id, c.name AS category_name, p.supplier_id, s.name AS supplier_name, p.created_at
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.id ASC; 
    `; //เรียงผลลัพธ์ตาม id จากน้อยไปมาก (ไม่งั้นลำดับแถวอาจสลับไปมาไม่แน่นอน)
    const [rows] = await pool.query(query); // รัน SQL ด้านบน (INNER JOIN หมวดหมู่ = ต้องมีเสมอ, LEFT JOIN ผู้จัดจำหน่าย = ว่างได้)
    res
      .status(200)
      .json({
        message: "ดึงข้อมูลสินค้าทั้งหมดสำเร็จ",
        total: rows.length,
        data: rows,
      });
  } catch (err) {
    next(err);
  }
});

// 2. GET: ดึงข้อมูลสินค้ารายชิ้นตาม ID
app.get("/api/v1/products/:id", async (req, res, next) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT
        p.id, p.sku, p.name AS product_name, p.price, p.stock_quantity,
        p.category_id, c.name AS category_name, p.supplier_id, s.name AS supplier_name, p.created_at
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = ?;
    `;
    const [rows] = await pool.query(query, [id]);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลสินค้า" } });
    }
    res.status(200).json({ message: "ดึงข้อมูลสินค้าสำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// 3. POST: เพิ่มสินค้าใหม่ (UC-03)
app.post("/api/v1/products", requireAdmin, async (req, res, next) => { // ต้องเป็น admin (requireAdmin) สำเร็จตอบ 201
  const { category_id, supplier_id, name, price, sku, stock_quantity } =
    req.body;
  try {
    const query = `
      INSERT INTO products (category_id, supplier_id, name, price, sku, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      category_id,
      supplier_id,
      name,
      price,
      sku,
      stock_quantity || 0, // ไม่ส่งสต็อกมาใส่ 0
    ]);
    res
      .status(201)
      .json({
        message: "เพิ่มสินค้าสำเร็จ",
        data: { id: result.insertId, name, sku, price },
      });
  } catch (err) {
    next(err);
  }
});

// 3.1 GET: ราคาสินค้าแปลงเป็นสกุลเงินอื่น (เรียก API ภายนอก + retry/timeout/fallback)
app.get("/api/v1/products/:id/price", async (req, res, next) => { // สาธารณะ: แปลงราคาด้วยอัตราจาก API ภายนอก (ดู services/external-api.js)
  const { id } = req.params;
  const currency = String(req.query.currency || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) { // ต้องเป็นตัวอักษร 3 ตัว เช่น USD ไม่งั้น 400
    return res.status(400).json({
      error: { code: "BAD_REQUEST", message: "รหัสสกุลเงินต้องเป็นตัวอักษร 3 ตัว เช่น USD" },
    });
  }
  try {
    const [rows] = await pool.query( // ค้นหาราคาสินค้าจาก MySQL ด้วย id ที่ผู้ใช้ส่งมา
      "SELECT id, name, price FROM products WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลสินค้า" } });
    }
    const product = rows[0];
    const price = Number(product.price);
    const result = await getExchangeRate(currency); // ขออัตราแลกเปลี่ยน; ฟังก์ชันนี้ดูแล retry/timeout/fallback

    if (result.source === "unsupported") {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: `ไม่รองรับสกุลเงิน ${currency}` },
      });
    }
    if (result.source === "fallback") { // ค่านี้ถูกกำหนดใน external-api.js เมื่อ API ภายนอกล้มเหลว
      return res.status(200).json({
        message: result.message,
        data: {
          id: product.id,
          name: product.name,
          price_thb: price,
          currency: "THB",
          converted_price: price,
          fallback: true,
        },
      });
    }
    res.status(200).json({
      message: "แปลงราคาสินค้าสำเร็จ",
      data: {
        id: product.id,
        name: product.name,
        price_thb: price,
        currency,
        rate: result.rate,
        converted_price: Number((price * result.rate).toFixed(2)), // ราคา × อัตรา ปัด 2 ตำแหน่ง
        fallback: false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// เลือกเฉพาะช่องที่อนุญาตให้แก้จาก body — ช่องอื่นถูกละเลย กันการแก้คอลัมน์ที่ไม่ควรแก้ (เช่น id)
function pickEditable(body, fields) { // คัดเฉพาะช่องที่อนุญาตให้แก้ ช่องอื่น (เช่น id) ถูกทิ้ง
  const changes = {};
  for (const field of fields) {
    if (body[field] !== undefined) changes[field] = body[field];
  }
  return changes;
}

function noEditableFields(res, fields) {
  return res.status(400).json({
    error: { code: "BAD_REQUEST", message: `ต้องส่งอย่างน้อย 1 ช่อง: ${fields.join(", ")}` },
  });
}

// 4. PATCH: แก้ไขข้อมูลสินค้า (UC-05) — ส่งเฉพาะช่องที่ต้องการแก้
const PRODUCT_EDITABLE_FIELDS = ["name", "sku", "price", "stock_quantity", "category_id", "supplier_id"];

app.patch("/api/v1/products/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin: ส่งเฉพาะช่องที่จะแก้ ช่องที่ไม่ส่งคงเดิม
  const { id } = req.params;
  const changes = pickEditable(req.body, PRODUCT_EDITABLE_FIELDS);
  if (Object.keys(changes).length === 0) return noEditableFields(res, PRODUCT_EDITABLE_FIELDS); // ไม่ส่งช่องที่แก้ได้เลย → 400

  try {
    const [result] = await pool.query("UPDATE products SET ? WHERE id = ?", [ // SET ? รับ object แล้วแปลงเป็น name=..., price=... ให้อย่างปลอดภัย
      changes,
      id,
    ]);

    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      return res
        .status(404)
        .json({
          error: { code: "NOT_FOUND", message: "ไม่พบสินค้าที่ต้องการแก้ไข" },
        });
    }

    res
      .status(200)
      .json({ message: "อัปเดตข้อมูลสินค้าสำเร็จ", updated_id: id });
  } catch (err) {
    next(err);
  }
});

// 4.1 DELETE: ลบสินค้า
app.delete("/api/v1/products/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM products WHERE id = ?", [id]);
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบสินค้าที่ต้องการลบ" } });
    }
    res.status(200).json({ message: "ลบสินค้าสำเร็จ", deleted_id: id });
  } catch (err) {
    next(err);
  }
});

// 5.0 GET: รายการหมวดหมู่ พร้อมจำนวนสินค้าในแต่ละหมวด
app.get("/api/v1/categories", async (req, res, next) => { // สาธารณะ: นับสินค้าในแต่ละหมวดด้วย COUNT + GROUP BY (LEFT JOIN ให้หมวดว่างยังแสดง)
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.description, COUNT(p.id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id ASC;
    `);
    res
      .status(200)
      .json({ message: "ดึงข้อมูลหมวดหมู่สำเร็จ", total: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

// 5. POST: เพิ่มหมวดหมู่สินค้าใหม่ (UC-01)
app.post("/api/v1/categories", requireAdmin, async (req, res, next) => {
  const { name, description } = req.body;
  try {
    const query = `INSERT INTO categories (name, description) VALUES (?, ?)`;
    const [result] = await pool.query(query, [name, description]);
    res
      .status(201)
      .json({
        message: "เพิ่มหมวดหมู่สำเร็จ",
        data: { id: result.insertId, name, description },
      });
  } catch (err) {
    next(err);
  }
});

// 5.1 DELETE: ลบหมวดหมู่ — สินค้าในหมวดถูกลบตามไปด้วย (ON DELETE CASCADE ใน schema.sql)
app.delete("/api/v1/categories/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin: ลบหมวด → สินค้าในหมวดถูกลบตาม (ON DELETE CASCADE)
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบหมวดหมู่ที่ต้องการลบ" } });
    }
    res.status(200).json({ message: "ลบหมวดหมู่สำเร็จ", deleted_id: id });
  } catch (err) {
    next(err);
  }
});

// 5.2 PATCH: แก้ไขหมวดหมู่ — ส่งเฉพาะช่องที่ต้องการแก้
const CATEGORY_EDITABLE_FIELDS = ["name", "description"];

app.patch("/api/v1/categories/:id", requireAdmin, async (req, res, next) => {
  const { id } = req.params;
  const changes = pickEditable(req.body, CATEGORY_EDITABLE_FIELDS);
  if (Object.keys(changes).length === 0) return noEditableFields(res, CATEGORY_EDITABLE_FIELDS);
  try {
    const [result] = await pool.query("UPDATE categories SET ? WHERE id = ?", [changes, id]);
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบหมวดหมู่ที่ต้องการแก้ไข" } });
    }
    res.status(200).json({ message: "อัปเดตหมวดหมู่สำเร็จ", updated_id: id });
  } catch (err) {
    next(err);
  }
});

// 6.0 GET: รายการผู้จัดจำหน่าย พร้อมจำนวนสินค้าที่ผูกอยู่
app.get("/api/v1/suppliers", async (req, res, next) => { // สาธารณะ: นับสินค้าที่ผูกกับผู้จัดจำหน่ายแต่ละราย
  try {
    const [rows] = await pool.query(`
      SELECT s.id, s.supplier_code, s.name, s.email, s.phone, COUNT(p.id) AS product_count
      FROM suppliers s
      LEFT JOIN products p ON p.supplier_id = s.id
      GROUP BY s.id
      ORDER BY s.id ASC;
    `);
    res
      .status(200)
      .json({ message: "ดึงข้อมูลผู้จัดจำหน่ายสำเร็จ", total: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

// 6.1 DELETE: ลบผู้จัดจำหน่าย — สินค้าที่ผูกอยู่เปลี่ยนเป็นไม่มีผู้จัดจำหน่าย (ON DELETE SET NULL)
app.delete("/api/v1/suppliers/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin: ลบผู้จัดจำหน่าย → สินค้ายังอยู่ ช่องผู้จัดจำหน่ายเป็นว่าง (ON DELETE SET NULL)
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM suppliers WHERE id = ?", [id]);
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้จัดจำหน่ายที่ต้องการลบ" } });
    }
    res.status(200).json({ message: "ลบผู้จัดจำหน่ายสำเร็จ", deleted_id: id });
  } catch (err) {
    next(err);
  }
});

// 6.2 PATCH: แก้ไขผู้จัดจำหน่าย — ส่งเฉพาะช่องที่ต้องการแก้
const SUPPLIER_EDITABLE_FIELDS = ["supplier_code", "name", "email", "phone"];

app.patch("/api/v1/suppliers/:id", requireAdmin, async (req, res, next) => {
  const { id } = req.params;
  const changes = pickEditable(req.body, SUPPLIER_EDITABLE_FIELDS);
  if (Object.keys(changes).length === 0) return noEditableFields(res, SUPPLIER_EDITABLE_FIELDS);
  try {
    const [result] = await pool.query("UPDATE suppliers SET ? WHERE id = ?", [changes, id]);
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้จัดจำหน่ายที่ต้องการแก้ไข" } });
    }
    res.status(200).json({ message: "อัปเดตข้อมูลผู้จัดจำหน่ายสำเร็จ", updated_id: id });
  } catch (err) {
    next(err);
  }
});

// 6. POST: เพิ่มข้อมูลผู้จัดจำหน่ายใหม่ (UC-02)
app.post("/api/v1/suppliers", requireAdmin, async (req, res, next) => {
  const { supplier_code, name, email, phone } = req.body;
  try {
    const query = `
      INSERT INTO suppliers (supplier_code, name, email, phone)
      VALUES (?, ?, ?, ?)
    `;
    const [result] = await pool.query(query, [
      supplier_code,
      name,
      email,
      phone || null, // เบอร์ไม่บังคับ เว้นว่าง = null
    ]);

    res.status(201).json({
      message: "เพิ่มข้อมูลผู้จัดจำหน่ายสำเร็จ",
      data: {
        id: result.insertId,
        supplier_code,
        name,
        email,
        phone: phone || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 404 Middleware
app.use((req, res) => { // ไม่ตรงกับ endpoint ไหนเลย → 404 (ต้องอยู่หลัง endpoint ทั้งหมด)
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "ไม่พบเส้นทางที่ร้องขอ" } });
});

// Error Handling Middleware
app.use((err, req, res, next) => { // มี 4 ช่อง = ตัวจัดการ error ทุกที่ที่เรียก next(err) มาจบที่นี่ → 500
  console.error(err.stack);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
      details: err.message,
    },
  });
});

// Start Server (ไม่ listen ตอนถูก require จาก test — Supertest เรียก app ตรงๆ)
if (require.main === module) { // เปิดพอร์ตเฉพาะตอนรันไฟล์นี้ตรงๆ (test เรียกแอปโดยไม่เปิดพอร์ต)
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

module.exports = app; // ให้ test (Supertest) หยิบแอปไปใช้
