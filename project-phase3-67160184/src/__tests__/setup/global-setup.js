// สร้างฐานข้อมูลทดสอบแยก (product_db_test) จาก schema/seed ชุดเดียวกับระบบจริงทุกครั้งก่อนรัน test
// เพื่อให้ test เริ่มจากข้อมูลเดิมเสมอ และไม่แตะข้อมูล demo ใน product_db
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });
const mysql = require("mysql2/promise");

module.exports = async () => {
  const sqlDir = path.join(__dirname, "..", "..", "..");
  const load = (file) =>
    fs.readFileSync(path.join(sqlDir, file), "utf8").replace(/\bproduct_db\b/g, "product_db_test");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "1234",
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
  });
  // schema.sql ไม่ลบตาราง users — ฐานข้อมูลทดสอบต้องเริ่มใหม่หมดทุกครั้ง จึงลบทั้งฐานก่อน
  await conn.query("DROP DATABASE IF EXISTS product_db_test");
  await conn.query(load("schema.sql"));
  await conn.query(load("seed.sql"));
  await conn.end();
};
