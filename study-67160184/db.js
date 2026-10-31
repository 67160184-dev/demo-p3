// เรียก require ด้วยค่าที่ระบุในบรรทัดนี้
require("dotenv").config(); // โหลดค่าใน .env เข้า process.env ก่อนอ่านค่าการเชื่อมต่อ
// นำเข้า mysql2/promise แล้วเก็บไว้ใน mysql
const mysql = require("mysql2/promise"); // ใช้ไดรเวอร์ MySQL แบบ Promise เพื่อเรียกด้วย await

// ตั้งค่า Connection Pool สำหรับ MySQL
// สร้าง connection pool ให้คำขอหลายรายการใช้การเชื่อมต่อ MySQL ซ้ำได้
const pool = mysql.createPool({ // สร้างกลุ่มการเชื่อมต่อที่ใช้ซ้ำได้
  // กำหนดคุณสมบัติ host เป็น process.env.DB_HOST || "localhost", // ที่อยู่เซิร์ฟเวอร์ฐานข้อมูล
  host: process.env.DB_HOST || "localhost", // ที่อยู่เซิร์ฟเวอร์ฐานข้อมูล
  // กำหนดคุณสมบัติ user เป็น process.env.DB_USER || "root", // ชื่อผู้ใช้ฐานข้อมูล
  user: process.env.DB_USER || "root", // ชื่อผู้ใช้ฐานข้อมูล
  // กำหนดคุณสมบัติ password เป็น process.env.DB_PASSWORD || "1234", // รหัสผ่านฐานข้อมูล
  password: process.env.DB_PASSWORD || "1234", // รหัสผ่านฐานข้อมูล
  // กำหนดคุณสมบัติ database เป็น process.env.DB_NAME || "product_db", // ชื่อฐานข้อมูลที่จะใช้งาน
  database: process.env.DB_NAME || "product_db", // ชื่อฐานข้อมูลที่จะใช้งาน
  // กำหนดคุณสมบัติ port เป็น process.env.DB_PORT || 3306, // พอร์ต MySQL
  port: process.env.DB_PORT || 3306, // พอร์ต MySQL
  // กำหนดคุณสมบัติ waitForConnections เป็น true, // ให้คำขอรอเมื่อการเชื่อมต่อเต็ม
  waitForConnections: true, // ให้คำขอรอเมื่อการเชื่อมต่อเต็ม
  // กำหนดคุณสมบัติ connectionLimit เป็น 10, // เปิดการเชื่อมต่อพร้อมกันได้สูงสุด 10 รายการ
  connectionLimit: 10, // เปิดการเชื่อมต่อพร้อมกันได้สูงสุด 10 รายการ
  // กำหนดคุณสมบัติ queueLimit เป็น 0, // ไม่จำกัดจำนวนคำขอที่รอในคิว
  queueLimit: 0, // ไม่จำกัดจำนวนคำขอที่รอในคิว
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}); // จบตัวเลือกของ connection pool

// ส่ง pool ให้ไฟล์ API ใช้ query ฐานข้อมูล
module.exports = pool; // ส่ง pool ให้ไฟล์ API นำไป query ฐานข้อมูล
