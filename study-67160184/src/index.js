// เรียก require ด้วยค่าที่ระบุในบรรทัดนี้
require("dotenv").config();
// นำเข้า express แล้วเก็บไว้ใน express
const express = require("express");
// นำเข้า helmet แล้วเก็บไว้ใน helmet
const helmet = require("helmet");
// นำเข้า cors แล้วเก็บไว้ใน cors
const cors = require("cors");
// นำเข้า morgan แล้วเก็บไว้ใน morgan
const morgan = require("morgan");
// นำเข้า fs แล้วเก็บไว้ใน fs
const fs = require("fs");
// นำเข้า path แล้วเก็บไว้ใน path
const path = require("path");
// นำเข้า swagger-ui-express แล้วเก็บไว้ใน swaggerUi
const swaggerUi = require("swagger-ui-express");
// นำเข้า js-yaml แล้วเก็บไว้ใน YAML
const YAML = require("js-yaml");
// นำเข้า bcrypt แล้วเก็บไว้ใน bcrypt
const bcrypt = require("bcrypt");
// นำเข้า ../db แล้วเก็บไว้ใน pool
const pool = require("../db");
// แยกค่า { getExchangeRate } จาก require("./services/external-api");
const { getExchangeRate } = require("./services/external-api");
// แยกค่า { generateToken, authenticateToken, requireAdmin } จาก require("./middlewares/auth");
const { generateToken, authenticateToken, requireAdmin } = require("./middlewares/auth");

// กำหนด app จาก express()
const app = express();
// กำหนด PORT จาก process.env.PORT || 3000
const PORT = process.env.PORT || 3000;

// Middlewares
// เรียก app.use(helmet())
app.use(helmet());
// เรียก app.use(cors())
app.use(cors());
// ตรวจ (process.env.NODE_ENV !== "test") app.use(morgan("dev")); แล้วทำคำสั่งเมื่อเป็นจริง
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));
// ติดตั้ง middleware นี้เข้ากับแอป Express
app.use(express.json()); // อ่าน JSON ที่หน้าเว็บส่งมาไว้ใน req.body (ไม่มีบรรทัดนี้ POST/PATCH ใช้ไม่ได้)

// Frontend — เสิร์ฟจาก origin เดียวกับ API เพื่อไม่ต้องพึ่ง CORS
// ติดตั้ง middleware นี้เข้ากับแอป Express
app.use(express.static(path.join(__dirname, "..", "frontend"))); // เสิร์ฟหน้าเว็บ (index.html, style.css, app.js) จากโฟลเดอร์ frontend ที่พอร์ตเดียวกับ API

// Swagger UI — เอกสาร API จาก openapi.yaml
// กำหนด openapiDocument จาก YAML.load(
const openapiDocument = YAML.load(
  // เรียก fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"),
  fs.readFileSync(path.join(__dirname, "..", "openapi.yaml"), "utf8"),
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
);
// ติดตั้ง middleware นี้เข้ากับแอป Express
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument)); // หน้าเอกสาร Swagger สร้างจาก openapi.yaml

// ==========================================
// REST Endpoints
// ==========================================

// Health Check Endpoint
// เปิดเส้นทาง GET "/health" เพื่อรับคำขอ
app.get("/health", (req, res) => {
  // เรียก res.status(200).json({ status: "OK", message: "Product API is running" })
  res.status(200).json({ status: "OK", message: "Product API is running" });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// ==========================================
// Authentication (Phase 3) — ดูข้อมูล (GET) ไม่ต้อง login; เพิ่ม/แก้ไข/ลบ ต้อง login เป็น admin
// ==========================================

// hash สำรองสำหรับกรณีไม่พบอีเมล เพื่อยังเรียก bcrypt.compare; เวลาตอบกลับอาจต่างกันได้ จึงไม่ควรถือเป็นการป้องกัน timing attack ที่สมบูรณ์
// คำนวณค่า DUMMY_PASSWORD_HASH จากข้อมูลและเงื่อนไขในบรรทัดนี้
const DUMMY_PASSWORD_HASH = "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidin"; // hash ปลอมไว้เทียบเมื่อไม่พบอีเมล (กัน timing attack)

// เปิดเส้นทาง POST "/api/v1/auth/login" เพื่อรับคำขอ
app.post("/api/v1/auth/login", async (req, res, next) => { // สาธารณะ (ไม่ต้อง token) ตอบ 200 / 400 ส่งไม่ครบ / 401 ผิด
  // แยกค่า { email, password } จาก req.body; // หยิบ email กับ password จากข้อมูลที่หน้าเว็บส่งมา
  const { email, password } = req.body; // หยิบ email กับ password จากข้อมูลที่หน้าเว็บส่งมา
  // ตรวจ (!email || !password) แล้วทำคำสั่งเมื่อเป็นจริง
  if (!email || !password) {
    // ส่งค่ากลับ: res
    return res
      // ตั้งสถานะ HTTP เป็น 400
      .status(400)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({ error: { code: "BAD_REQUEST", message: "กรุณาระบุ email และ password" } });
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // อ่านผลลัพธ์จากฐานข้อมูลแล้วแยกรายการแถวหรือผลการแก้ไข
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]); // ? = ช่องใส่ค่าอย่างปลอดภัย กัน SQL injection (ห้ามต่อข้อความเอง)
    // กำหนด user จาก rows[0]
    const user = rows[0];
    // ตรวจรหัสผ่านกับแฮช แล้วเก็บผลใน isValid
    const isValid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH); // เทียบรหัสที่พิมพ์กับ hash แม้ไม่พบอีเมล ใช้เวลาเท่ากันทุกกรณี
    // ตรวจ (!user || !isValid) แล้วทำคำสั่งเมื่อเป็นจริง
    if (!user || !isValid) { // ตอบข้อความเดียวกันทั้ง 2 กรณี ไม่บอกว่าผิดที่อีเมลหรือรหัส
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 401
        .status(401)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "INVALID_CREDENTIALS", message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({
    res.status(200).json({
      // กำหนดคุณสมบัติ message เป็น "เข้าสู่ระบบสำเร็จ"
      message: "เข้าสู่ระบบสำเร็จ",
      // กำหนดคุณสมบัติ token ตามเงื่อนไขหรือค่าที่ระบุ
      token: generateToken(user), // ออกบัตร JWT (auth.js) อายุ 1 ชม. ไม่ส่ง password_hash กลับ
      // กำหนดคุณสมบัติ user เป็น { id: user.id, email: user.email, role: user.role }
      user: { id: user.id, email: user.email, role: user.role },
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// ข้อมูลผู้ใช้จาก token — หน้าเว็บใช้ตรวจว่า token ที่จำไว้ยังใช้ได้
// เปิดเส้นทาง GET "/api/v1/auth/me" เพื่อรับคำขอ
app.get("/api/v1/auth/me", authenticateToken, (req, res) => { // ต้องมี token (ด่าน 1) คืนข้อมูลจากบัตรที่ req.user
  // แยกค่า { id, email, role } จาก req.user;
  const { id, email, role } = req.user;
  // เรียก res.status(200).json({ message: "สำเร็จ", data: { id, email, role } })
  res.status(200).json({ message: "สำเร็จ", data: { id, email, role } });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// เปลี่ยนรหัสผ่านของผู้ที่ login อยู่ (แบบฝึกหัดต่อยอดสัปดาห์ที่ 6) — ต้องยืนยันรหัสผ่านเดิมก่อน
// กำหนด MIN_PASSWORD_LENGTH จาก 8
const MIN_PASSWORD_LENGTH = 8;

// เปิดเส้นทาง PATCH "/api/v1/auth/change-password" เพื่อรับคำขอ
app.patch("/api/v1/auth/change-password", authenticateToken, async (req, res, next) => { // ต้องมี token แก้ได้เฉพาะรหัสของตัวเอง (ใช้ id จากบัตร ไม่ใช่ที่หน้าเว็บส่ง)
  // แยกค่า { oldPassword, newPassword } จาก req.body;
  const { oldPassword, newPassword } = req.body;
  // กำหนด badRequest จาก (message) => res.status(400).json({ error: { code: "BAD_REQUEST", message } })
  const badRequest = (message) => res.status(400).json({ error: { code: "BAD_REQUEST", message } });
  // ตรวจ (!oldPassword || !newPassword) return badRequest("กรุณาระบุ oldPassword และ newPassword"); แล้วทำคำสั่งเมื่อเป็นจริง
  if (!oldPassword || !newPassword) return badRequest("กรุณาระบุ oldPassword และ newPassword");
  // ตรวจ (String(newPassword).length < MIN_PASSWORD_LENGTH) แล้วทำคำสั่งเมื่อเป็นจริง
  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    // ส่งค่ากลับ: badRequest(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`)
    return badRequest(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
  // ตรวจ (oldPassword === newPassword) return badRequest("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม"); แล้วทำคำสั่งเมื่อเป็นจริง
  if (oldPassword === newPassword) return badRequest("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");

  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [rows] จาก await pool.query("SELECT * FROM users WHERE id = ?", [req.user.id]);
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.user.id]);
    // ตรวจ (rows.length === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (rows.length === 0) {
      // ส่งค่ากลับ: res.status(404).json({ error: { code: "NOT_FOUND", message: "ไม่พบบัญชีผู้ใช้" } })
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "ไม่พบบัญชีผู้ใช้" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // ตรวจ (!(await bcrypt.compare(oldPassword, rows[0].password_hash))) แล้วทำคำสั่งเมื่อเป็นจริง
    if (!(await bcrypt.compare(oldPassword, rows[0].password_hash))) { // รหัสเดิมผิด → 401 INVALID_CREDENTIALS (หน้าเว็บไม่ออกจากระบบ เพราะไม่ใช่ NO_TOKEN)
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 401
        .status(401)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "INVALID_CREDENTIALS", message: "รหัสผ่านเดิมไม่ถูกต้อง" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // สร้างแฮชรหัสผ่านใหม่ แล้วเก็บใน newHash
    const newHash = await bcrypt.hash(newPassword, 10); // เข้ารหัสรหัสใหม่ (10 = ความหนักของการคำนวณ) ไม่เก็บรหัสจริง
    // รอการทำงานของ pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id])
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
    // เรียก res.status(200).json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" })
    res.status(200).json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 1. GET: ดึงข้อมูลสินค้าทั้งหมดพร้อม JOIN (UC-04)
// เปิดเส้นทาง GET "/api/v1/products" เพื่อรับคำขอ
app.get("/api/v1/products", async (req, res, next) => { // สาธารณะ: JOIN 3 ตาราง เอาชื่อหมวดหมู่/ผู้จัดจำหน่ายมาแสดง
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // เก็บคำสั่ง SQL หลายบรรทัดไว้ในตัวแปร query
    const query = `
      -- เลือกคอลัมน์ที่จะอ่านจากฐานข้อมูล
      SELECT
        -- ระบุคอลัมน์สินค้าและชื่อคอลัมน์ผลลัพธ์
        p.id, p.sku, p.name AS product_name, p.price, p.stock_quantity,
        -- ระบุคอลัมน์สินค้าและชื่อคอลัมน์ผลลัพธ์
        p.category_id, c.name AS category_name, p.supplier_id, s.name AS supplier_name, p.created_at
      -- กำหนดตารางหลักและชื่อย่อในคำสั่งค้นหา
      FROM products p
      -- เชื่อมตารางหมวดหมู่ที่สินค้าต้องมีเสมอ
      INNER JOIN categories c ON p.category_id = c.id
      -- เชื่อมตารางผู้จัดจำหน่ายโดยยอมให้ข้อมูลว่าง
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      -- เรียงผลลัพธ์ตามคอลัมน์และทิศทางที่ระบุ
      ORDER BY p.id ASC;
    `;
    // อ่านผลลัพธ์จากฐานข้อมูลแล้วแยกรายการแถวหรือผลการแก้ไข
    const [rows] = await pool.query(query); // รัน SQL ด้านบน (INNER JOIN หมวดหมู่ = ต้องมีเสมอ, LEFT JOIN ผู้จัดจำหน่าย = ว่างได้)
    // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
    res
      // ตั้งสถานะ HTTP เป็น 200
      .status(200)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({
        // กำหนดคุณสมบัติ message เป็น "ดึงข้อมูลสินค้าทั้งหมดสำเร็จ"
        message: "ดึงข้อมูลสินค้าทั้งหมดสำเร็จ",
        // กำหนดคุณสมบัติ total เป็น rows.length
        total: rows.length,
        // กำหนดคุณสมบัติ data เป็น rows
        data: rows,
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 2. GET: ดึงข้อมูลสินค้ารายชิ้นตาม ID
// เปิดเส้นทาง GET "/api/v1/products/:id" เพื่อรับคำขอ
app.get("/api/v1/products/:id", async (req, res, next) => {
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // เก็บคำสั่ง SQL หลายบรรทัดไว้ในตัวแปร query
    const query = `
      -- เลือกคอลัมน์ที่จะอ่านจากฐานข้อมูล
      SELECT
        -- ระบุคอลัมน์สินค้าและชื่อคอลัมน์ผลลัพธ์
        p.id, p.sku, p.name AS product_name, p.price, p.stock_quantity,
        -- ระบุคอลัมน์สินค้าและชื่อคอลัมน์ผลลัพธ์
        p.category_id, c.name AS category_name, p.supplier_id, s.name AS supplier_name, p.created_at
      -- กำหนดตารางหลักและชื่อย่อในคำสั่งค้นหา
      FROM products p
      -- เชื่อมตารางหมวดหมู่ที่สินค้าต้องมีเสมอ
      INNER JOIN categories c ON p.category_id = c.id
      -- เชื่อมตารางผู้จัดจำหน่ายโดยยอมให้ข้อมูลว่าง
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      -- กรองข้อมูลตามเงื่อนไข โดย ? รับค่าจากพารามิเตอร์
      WHERE p.id = ?;
    `;
    // แยกค่า [rows] จาก await pool.query(query, [id]);
    const [rows] = await pool.query(query, [id]);
    // ตรวจ (rows.length === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (rows.length === 0) {
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลสินค้า" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({ message: "ดึงข้อมูลสินค้าสำเร็จ", data: rows[0] })
    res.status(200).json({ message: "ดึงข้อมูลสินค้าสำเร็จ", data: rows[0] });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 3. POST: เพิ่มสินค้าใหม่ (UC-03)
// เปิดเส้นทาง POST "/api/v1/products" เพื่อรับคำขอ
app.post("/api/v1/products", requireAdmin, async (req, res, next) => { // ต้องเป็น admin (requireAdmin) สำเร็จตอบ 201
  // แยกค่า { category_id, supplier_id, name, price, sku, stock_quantity } จาก 
  const { category_id, supplier_id, name, price, sku, stock_quantity } =
    // เรียก req.body
    req.body;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // เก็บคำสั่ง SQL หลายบรรทัดไว้ในตัวแปร query
    const query = `
      -- ระบุตารางและคอลัมน์ที่จะเพิ่มข้อมูล
      INSERT INTO products (category_id, supplier_id, name, price, sku, stock_quantity)
      -- กำหนดตำแหน่ง ? สำหรับค่าที่ส่งแยกจากคำสั่ง SQL
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    // แยกค่า [result] จาก await pool.query(query, [
    const [result] = await pool.query(query, [
      // ส่งค่า category_id ตามลำดับพารามิเตอร์หรือรายการ
      category_id,
      // ส่งค่า supplier_id ตามลำดับพารามิเตอร์หรือรายการ
      supplier_id,
      // ส่งค่า name ตามลำดับพารามิเตอร์หรือรายการ
      name,
      // ส่งค่า price ตามลำดับพารามิเตอร์หรือรายการ
      price,
      // ส่งค่า sku ตามลำดับพารามิเตอร์หรือรายการ
      sku,
      // ส่งค่า stock_quantity || 0 ตามลำดับพารามิเตอร์หรือรายการ
      stock_quantity || 0, // ไม่ส่งสต็อกมา = 0
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    ]);
    // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
    res
      // ตั้งสถานะ HTTP เป็น 201
      .status(201)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({
        // กำหนดคุณสมบัติ message เป็น "เพิ่มสินค้าสำเร็จ"
        message: "เพิ่มสินค้าสำเร็จ",
        // กำหนดคุณสมบัติ data เป็น { id: result.insertId, name, sku, price }
        data: { id: result.insertId, name, sku, price },
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 3.1 GET: ราคาสินค้าแปลงเป็นสกุลเงินอื่น (เรียก API ภายนอก + retry/timeout/fallback)
// เปิดเส้นทาง GET "/api/v1/products/:id/price" เพื่อรับคำขอ
app.get("/api/v1/products/:id/price", async (req, res, next) => { // สาธารณะ: แปลงราคาด้วยอัตราจาก API ภายนอก (ดู services/external-api.js)
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // กำหนด currency จาก String(req.query.currency || "USD").toUpperCase()
  const currency = String(req.query.currency || "USD").toUpperCase();
  // ตรวจ (!/^[A-Z] แล้วทำคำสั่งเมื่อเป็นจริง
  if (!/^[A-Z]{3}$/.test(currency)) { // ต้องเป็นตัวอักษร 3 ตัว เช่น USD ไม่งั้น 400
    // ส่งค่ากลับ: res.status(400).json({
    return res.status(400).json({
      // กำหนดคุณสมบัติ error ตามเงื่อนไขหรือค่าที่ระบุ
      error: { code: "BAD_REQUEST", message: "รหัสสกุลเงินต้องเป็นตัวอักษร 3 ตัว เช่น USD" },
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    });
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [rows] จาก await pool.query( // ค้นหาราคาสินค้าจาก MySQL ด้วย id ที่ผู้ใช้ส่งมา
    const [rows] = await pool.query( // ค้นหาราคาสินค้าจาก MySQL ด้วย id ที่ผู้ใช้ส่งมา
      // เลือก id ชื่อ และราคาของสินค้าที่ตรงกับ id โดยใช้ ? เป็นพารามิเตอร์
      "SELECT id, name, price FROM products WHERE id = ?",
      // ส่ง id แยกจากข้อความ SQL เพื่อให้ไดรเวอร์ใส่ค่าอย่างปลอดภัย
      [id],
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    );
    // ตรวจ (rows.length === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (rows.length === 0) {
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลสินค้า" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // กำหนด product จาก rows[0]
    const product = rows[0];
    // กำหนด price จาก Number(product.price)
    const price = Number(product.price);
    // ขออัตราแลกเปลี่ยนแล้วเก็บผลใน result
    const result = await getExchangeRate(currency); // ขออัตราแลกเปลี่ยน; ฟังก์ชันนี้ดูแล retry/timeout/fallback

    // ตรวจ (result.source === "unsupported") แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.source === "unsupported") {
      // ส่งค่ากลับ: res.status(400).json({
      return res.status(400).json({
        // กำหนดคุณสมบัติ error เป็น { code: "BAD_REQUEST", message: `ไม่รองรับสกุลเงิน ${currency}` }
        error: { code: "BAD_REQUEST", message: `ไม่รองรับสกุลเงิน ${currency}` },
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // ตรวจ (result.source === "fallback") แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.source === "fallback") { // ค่านี้ถูกกำหนดใน external-api.js เมื่อ API ภายนอกล้มเหลว
      // ส่งค่ากลับ: res.status(200).json({
      return res.status(200).json({
        // กำหนดคุณสมบัติ message เป็น result.message
        message: result.message,
        // กำหนดคุณสมบัติ data เป็น {
        data: {
          // กำหนดคุณสมบัติ id เป็น product.id
          id: product.id,
          // กำหนดคุณสมบัติ name เป็น product.name
          name: product.name,
          // กำหนดคุณสมบัติ price_thb เป็น price
          price_thb: price,
          // กำหนดคุณสมบัติ currency เป็น "THB"
          currency: "THB",
          // กำหนดคุณสมบัติ converted_price เป็น price
          converted_price: price,
          // กำหนดคุณสมบัติ fallback เป็น true
          fallback: true,
        // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
        },
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({
    res.status(200).json({
      // กำหนดคุณสมบัติ message เป็น "แปลงราคาสินค้าสำเร็จ"
      message: "แปลงราคาสินค้าสำเร็จ",
      // กำหนดคุณสมบัติ data เป็น {
      data: {
        // กำหนดคุณสมบัติ id เป็น product.id
        id: product.id,
        // กำหนดคุณสมบัติ name เป็น product.name
        name: product.name,
        // กำหนดคุณสมบัติ price_thb เป็น price
        price_thb: price,
        // ส่งค่า currency ตามลำดับพารามิเตอร์หรือรายการ
        currency,
        // กำหนดคุณสมบัติ rate เป็น result.rate
        rate: result.rate,
        // กำหนดคุณสมบัติ converted_price เป็น Number((price * result.rate).toFixed(2)), // ราคา × อัตรา ปัด 2 ตำแหน่ง
        converted_price: Number((price * result.rate).toFixed(2)), // ราคา × อัตรา ปัด 2 ตำแหน่ง
        // กำหนดคุณสมบัติ fallback เป็น false
        fallback: false,
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      },
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// เลือกเฉพาะช่องที่อนุญาตให้แก้จาก body — ช่องอื่นถูกละเลย กันการแก้คอลัมน์ที่ไม่ควรแก้ (เช่น id)
// ประกาศฟังก์ชัน pickEditable รับ body, fields
function pickEditable(body, fields) { // คัดเฉพาะช่องที่อนุญาตให้แก้ ช่องอื่น (เช่น id) ถูกทิ้ง
  // เก็บชุดข้อมูลเริ่มต้นไว้ใน changes
  const changes = {};
  // วนตาม (const field of fields)
  for (const field of fields) {
    // ตรวจ (body[field] !== undefined) changes[field] = body[field]; แล้วทำคำสั่งเมื่อเป็นจริง
    if (body[field] !== undefined) changes[field] = body[field];
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
  // ส่งค่ากลับ: changes
  return changes;
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// ประกาศฟังก์ชัน noEditableFields รับ res, fields
function noEditableFields(res, fields) {
  // ส่งค่ากลับ: res.status(400).json({
  return res.status(400).json({
    // กำหนดคุณสมบัติ error ตามเงื่อนไขหรือค่าที่ระบุ
    error: { code: "BAD_REQUEST", message: `ต้องส่งอย่างน้อย 1 ช่อง: ${fields.join(", ")}` },
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// 4. PATCH: แก้ไขข้อมูลสินค้า (UC-05) — ส่งเฉพาะช่องที่ต้องการแก้
// เก็บรายการข้อมูลเริ่มต้นไว้ใน PRODUCT_EDITABLE_FIELDS
const PRODUCT_EDITABLE_FIELDS = ["name", "sku", "price", "stock_quantity", "category_id", "supplier_id"];

// เปิดเส้นทาง PATCH "/api/v1/products/:id" เพื่อรับคำขอ
app.patch("/api/v1/products/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin: ส่งเฉพาะช่องที่จะแก้ ช่องที่ไม่ส่งคงเดิม
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // กำหนด changes จาก pickEditable(req.body, PRODUCT_EDITABLE_FIELDS)
  const changes = pickEditable(req.body, PRODUCT_EDITABLE_FIELDS);
  // ตรวจเงื่อนไขในบรรทัดนี้ก่อนทำคำสั่งถัดไป
  if (Object.keys(changes).length === 0) return noEditableFields(res, PRODUCT_EDITABLE_FIELDS); // ไม่ส่งช่องที่แก้ได้เลย → 400

  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // อ่านผลลัพธ์จากฐานข้อมูลแล้วแยกรายการแถวหรือผลการแก้ไข
    const [result] = await pool.query("UPDATE products SET ? WHERE id = ?", [ // SET ? รับ object แล้วแปลงเป็น name=..., price=... ให้อย่างปลอดภัย
      // ส่งค่า changes ตามลำดับพารามิเตอร์หรือรายการ
      changes,
      // ส่งค่า id ตามลำดับพารามิเตอร์หรือรายการ
      id,
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    ]);

    // ตรวจ (result.affectedRows === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({
          // กำหนดคุณสมบัติ error เป็น { code: "NOT_FOUND", message: "ไม่พบสินค้าที่ต้องการแก้ไข" }
          error: { code: "NOT_FOUND", message: "ไม่พบสินค้าที่ต้องการแก้ไข" },
        // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
        });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }

    // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
    res
      // ตั้งสถานะ HTTP เป็น 200
      .status(200)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({ message: "อัปเดตข้อมูลสินค้าสำเร็จ", updated_id: id });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 4.1 DELETE: ลบสินค้า
// เปิดเส้นทาง DELETE "/api/v1/products/:id" เพื่อรับคำขอ
app.delete("/api/v1/products/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [result] จาก await pool.query("DELETE FROM products WHERE id = ?", [id]);
    const [result] = await pool.query("DELETE FROM products WHERE id = ?", [id]);
    // ตรวจ (result.affectedRows === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบสินค้าที่ต้องการลบ" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({ message: "ลบสินค้าสำเร็จ", deleted_id: id })
    res.status(200).json({ message: "ลบสินค้าสำเร็จ", deleted_id: id });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 5.0 GET: รายการหมวดหมู่ พร้อมจำนวนสินค้าในแต่ละหมวด
// เปิดเส้นทาง GET "/api/v1/categories" เพื่อรับคำขอ
app.get("/api/v1/categories", async (req, res, next) => { // สาธารณะ: นับสินค้าในแต่ละหมวดด้วย COUNT + GROUP BY (LEFT JOIN ให้หมวดว่างยังแสดง)
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [rows] จาก await pool.query(`
    const [rows] = await pool.query(`
      -- เลือกข้อมูลหมวดหมู่และนับจำนวนสินค้าที่ผูกกับแต่ละหมวด
      SELECT c.id, c.name, c.description, COUNT(p.id) AS product_count
      -- ใช้ categories เป็นตารางหลักเพื่อให้หมวดที่ไม่มีสินค้ายังปรากฏ
      FROM categories c
      -- เชื่อมสินค้าแบบ LEFT JOIN เพื่อเก็บหมวดที่ไม่มีสินค้า
      LEFT JOIN products p ON p.category_id = c.id
      -- รวมแถวสินค้าเป็นหนึ่งแถวต่อหมวดก่อนนับ
      GROUP BY c.id
      -- เรียงหมวดตาม id จากน้อยไปมาก
      ORDER BY c.id ASC;
    `);
    // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
    res
      // ตั้งสถานะ HTTP เป็น 200
      .status(200)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({ message: "ดึงข้อมูลหมวดหมู่สำเร็จ", total: rows.length, data: rows });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 5. POST: เพิ่มหมวดหมู่สินค้าใหม่ (UC-01)
// เปิดเส้นทาง POST "/api/v1/categories" เพื่อรับคำขอ
app.post("/api/v1/categories", requireAdmin, async (req, res, next) => {
  // แยกค่า { name, description } จาก req.body;
  const { name, description } = req.body;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // เก็บคำสั่ง SQL หลายบรรทัดไว้ในตัวแปร query
    const query = `INSERT INTO categories (name, description) VALUES (?, ?)`;
    // แยกค่า [result] จาก await pool.query(query, [name, description]);
    const [result] = await pool.query(query, [name, description]);
    // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
    res
      // ตั้งสถานะ HTTP เป็น 201
      .status(201)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({
        // กำหนดคุณสมบัติ message เป็น "เพิ่มหมวดหมู่สำเร็จ"
        message: "เพิ่มหมวดหมู่สำเร็จ",
        // กำหนดคุณสมบัติ data เป็น { id: result.insertId, name, description }
        data: { id: result.insertId, name, description },
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 5.1 DELETE: ลบหมวดหมู่ — สินค้าในหมวดถูกลบตามไปด้วย (ON DELETE CASCADE ใน schema.sql)
// เปิดเส้นทาง DELETE "/api/v1/categories/:id" เพื่อรับคำขอ
app.delete("/api/v1/categories/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin: ลบหมวด → สินค้าในหมวดถูกลบตาม (ON DELETE CASCADE)
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [result] จาก await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    const [result] = await pool.query("DELETE FROM categories WHERE id = ?", [id]);
    // ตรวจ (result.affectedRows === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบหมวดหมู่ที่ต้องการลบ" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({ message: "ลบหมวดหมู่สำเร็จ", deleted_id: id })
    res.status(200).json({ message: "ลบหมวดหมู่สำเร็จ", deleted_id: id });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 5.2 PATCH: แก้ไขหมวดหมู่ — ส่งเฉพาะช่องที่ต้องการแก้
// เก็บรายการข้อมูลเริ่มต้นไว้ใน CATEGORY_EDITABLE_FIELDS
const CATEGORY_EDITABLE_FIELDS = ["name", "description"];

// เปิดเส้นทาง PATCH "/api/v1/categories/:id" เพื่อรับคำขอ
app.patch("/api/v1/categories/:id", requireAdmin, async (req, res, next) => {
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // กำหนด changes จาก pickEditable(req.body, CATEGORY_EDITABLE_FIELDS)
  const changes = pickEditable(req.body, CATEGORY_EDITABLE_FIELDS);
  // ตรวจ (Object.keys(changes).length === 0) return noEditableFields(res, CATEGORY_EDITABLE_FIELDS); แล้วทำคำสั่งเมื่อเป็นจริง
  if (Object.keys(changes).length === 0) return noEditableFields(res, CATEGORY_EDITABLE_FIELDS);
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [result] จาก await pool.query("UPDATE categories SET ? WHERE id = ?", [changes, id]);
    const [result] = await pool.query("UPDATE categories SET ? WHERE id = ?", [changes, id]);
    // ตรวจ (result.affectedRows === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบหมวดหมู่ที่ต้องการแก้ไข" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({ message: "อัปเดตหมวดหมู่สำเร็จ", updated_id: id })
    res.status(200).json({ message: "อัปเดตหมวดหมู่สำเร็จ", updated_id: id });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 6.0 GET: รายการผู้จัดจำหน่าย พร้อมจำนวนสินค้าที่ผูกอยู่
// เปิดเส้นทาง GET "/api/v1/suppliers" เพื่อรับคำขอ
app.get("/api/v1/suppliers", async (req, res, next) => { // สาธารณะ: นับสินค้าที่ผูกกับผู้จัดจำหน่ายแต่ละราย
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [rows] จาก await pool.query(`
    const [rows] = await pool.query(`
      -- เลือกข้อมูลผู้จัดจำหน่ายและนับจำนวนสินค้าที่ผูกอยู่
      SELECT s.id, s.supplier_code, s.name, s.email, s.phone, COUNT(p.id) AS product_count
      -- ใช้ suppliers เป็นตารางหลักเพื่อให้รายที่ยังไม่มีสินค้าปรากฏ
      FROM suppliers s
      -- เชื่อมสินค้าแบบ LEFT JOIN โดยไม่ตัดผู้จัดจำหน่ายที่ไม่มีสินค้า
      LEFT JOIN products p ON p.supplier_id = s.id
      -- รวมแถวสินค้าเป็นหนึ่งแถวต่อผู้จัดจำหน่ายก่อนนับ
      GROUP BY s.id
      -- เรียงผู้จัดจำหน่ายตาม id จากน้อยไปมาก
      ORDER BY s.id ASC;
    `);
    // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
    res
      // ตั้งสถานะ HTTP เป็น 200
      .status(200)
      // ส่งข้อมูลในวงเล็บกลับเป็น JSON
      .json({ message: "ดึงข้อมูลผู้จัดจำหน่ายสำเร็จ", total: rows.length, data: rows });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 6.1 DELETE: ลบผู้จัดจำหน่าย — สินค้าที่ผูกอยู่เปลี่ยนเป็นไม่มีผู้จัดจำหน่าย (ON DELETE SET NULL)
// เปิดเส้นทาง DELETE "/api/v1/suppliers/:id" เพื่อรับคำขอ
app.delete("/api/v1/suppliers/:id", requireAdmin, async (req, res, next) => { // ต้องเป็น admin: ลบผู้จัดจำหน่าย → สินค้ายังอยู่ ช่องผู้จัดจำหน่ายเป็นว่าง (ON DELETE SET NULL)
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [result] จาก await pool.query("DELETE FROM suppliers WHERE id = ?", [id]);
    const [result] = await pool.query("DELETE FROM suppliers WHERE id = ?", [id]);
    // ตรวจ (result.affectedRows === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้จัดจำหน่ายที่ต้องการลบ" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({ message: "ลบผู้จัดจำหน่ายสำเร็จ", deleted_id: id })
    res.status(200).json({ message: "ลบผู้จัดจำหน่ายสำเร็จ", deleted_id: id });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 6.2 PATCH: แก้ไขผู้จัดจำหน่าย — ส่งเฉพาะช่องที่ต้องการแก้
// เก็บรายการข้อมูลเริ่มต้นไว้ใน SUPPLIER_EDITABLE_FIELDS
const SUPPLIER_EDITABLE_FIELDS = ["supplier_code", "name", "email", "phone"];

// เปิดเส้นทาง PATCH "/api/v1/suppliers/:id" เพื่อรับคำขอ
app.patch("/api/v1/suppliers/:id", requireAdmin, async (req, res, next) => {
  // แยกค่า { id } จาก req.params;
  const { id } = req.params;
  // กำหนด changes จาก pickEditable(req.body, SUPPLIER_EDITABLE_FIELDS)
  const changes = pickEditable(req.body, SUPPLIER_EDITABLE_FIELDS);
  // ตรวจ (Object.keys(changes).length === 0) return noEditableFields(res, SUPPLIER_EDITABLE_FIELDS); แล้วทำคำสั่งเมื่อเป็นจริง
  if (Object.keys(changes).length === 0) return noEditableFields(res, SUPPLIER_EDITABLE_FIELDS);
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // แยกค่า [result] จาก await pool.query("UPDATE suppliers SET ? WHERE id = ?", [changes, id]);
    const [result] = await pool.query("UPDATE suppliers SET ? WHERE id = ?", [changes, id]);
    // ตรวจ (result.affectedRows === 0) แล้วทำคำสั่งเมื่อเป็นจริง
    if (result.affectedRows === 0) { // ไม่มีแถวถูกแก้/ลบ = ไม่พบ id นี้ → 404
      // ส่งค่ากลับ: res
      return res
        // ตั้งสถานะ HTTP เป็น 404
        .status(404)
        // ส่งข้อมูลในวงเล็บกลับเป็น JSON
        .json({ error: { code: "NOT_FOUND", message: "ไม่พบผู้จัดจำหน่ายที่ต้องการแก้ไข" } });
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก res.status(200).json({ message: "อัปเดตข้อมูลผู้จัดจำหน่ายสำเร็จ", updated_id: id })
    res.status(200).json({ message: "อัปเดตข้อมูลผู้จัดจำหน่ายสำเร็จ", updated_id: id });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 6. POST: เพิ่มข้อมูลผู้จัดจำหน่ายใหม่ (UC-02)
// เปิดเส้นทาง POST "/api/v1/suppliers" เพื่อรับคำขอ
app.post("/api/v1/suppliers", requireAdmin, async (req, res, next) => {
  // แยกค่า { supplier_code, name, email, phone } จาก req.body;
  const { supplier_code, name, email, phone } = req.body;
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // เก็บคำสั่ง SQL หลายบรรทัดไว้ในตัวแปร query
    const query = `
      -- ระบุตารางและคอลัมน์ที่จะเพิ่มข้อมูล
      INSERT INTO suppliers (supplier_code, name, email, phone)
      -- กำหนดตำแหน่ง ? สำหรับค่าที่ส่งแยกจากคำสั่ง SQL
      VALUES (?, ?, ?, ?)
    `;
    // แยกค่า [result] จาก await pool.query(query, [
    const [result] = await pool.query(query, [
      // ส่งค่า supplier_code ตามลำดับพารามิเตอร์หรือรายการ
      supplier_code,
      // ส่งค่า name ตามลำดับพารามิเตอร์หรือรายการ
      name,
      // ส่งค่า email ตามลำดับพารามิเตอร์หรือรายการ
      email,
      // ทำคำสั่ง phone || null,
      phone || null, // เบอร์ไม่บังคับ เว้นว่าง = null
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    ]);

    // เรียก res.status(201).json({
    res.status(201).json({
      // กำหนดคุณสมบัติ message เป็น "เพิ่มข้อมูลผู้จัดจำหน่ายสำเร็จ"
      message: "เพิ่มข้อมูลผู้จัดจำหน่ายสำเร็จ",
      // กำหนดคุณสมบัติ data เป็น {
      data: {
        // กำหนดคุณสมบัติ id เป็น result.insertId
        id: result.insertId,
        // ส่งค่า supplier_code ตามลำดับพารามิเตอร์หรือรายการ
        supplier_code,
        // ส่งค่า name ตามลำดับพารามิเตอร์หรือรายการ
        name,
        // ส่งค่า email ตามลำดับพารามิเตอร์หรือรายการ
        email,
        // กำหนดคุณสมบัติ phone เป็น phone || null
        phone: phone || null,
      // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
      },
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    });
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next(err);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// 404 Middleware
// เรียก app.use((req, res) => { // ไม่ตรงกับ endpoint ไหนเลย → 404 (ต้องอยู่หลัง endpoint ทั้งหมด)
app.use((req, res) => { // ไม่ตรงกับ endpoint ไหนเลย → 404 (ต้องอยู่หลัง endpoint ทั้งหมด)
  // เริ่มสร้างคำตอบ HTTP โดยตั้งสถานะและข้อมูล JSON ในบรรทัดถัดไป
  res
    // ตั้งสถานะ HTTP เป็น 404
    .status(404)
    // ส่งข้อมูลในวงเล็บกลับเป็น JSON
    .json({ error: { code: "NOT_FOUND", message: "ไม่พบเส้นทางที่ร้องขอ" } });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// Error Handling Middleware
// ติดตั้ง middleware นี้เข้ากับแอป Express
app.use((err, req, res, next) => { // มี 4 ช่อง = ตัวจัดการ error ทุกที่ที่เรียก next(err) มาจบที่นี่ → 500
  // เรียก console.error(err.stack)
  console.error(err.stack);
  // เรียก res.status(500).json({
  res.status(500).json({
    // กำหนดคุณสมบัติ error เป็น {
    error: {
      // กำหนดคุณสมบัติ code เป็น "INTERNAL_SERVER_ERROR"
      code: "INTERNAL_SERVER_ERROR",
      // กำหนดคุณสมบัติ message เป็น "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์"
      message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
      // กำหนดคุณสมบัติ details เป็น err.message
      details: err.message,
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    },
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
});

// Start Server (ไม่ listen ตอนถูก require จาก test — Supertest เรียก app ตรงๆ)
// ตรวจ (require.main === module) แล้วทำคำสั่งเมื่อเป็นจริง
if (require.main === module) { // เปิดพอร์ตเฉพาะตอนรันไฟล์นี้ตรงๆ (test เรียกแอปโดยไม่เปิดพอร์ต)
  // เรียก app.listen(PORT, () => {
  app.listen(PORT, () => {
    // เรียก console.log(`🚀 Server running on http://localhost:${PORT}`)
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// กำหนด module.exports จาก app; // ให้ test (Supertest) หยิบแอปไปใช้
module.exports = app; // ให้ test (Supertest) หยิบแอปไปใช้
