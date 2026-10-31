// Phase 3: ยืนยันตัวตนด้วย JWT + ตรวจบทบาท ตามรูปแบบสัปดาห์ที่ 6 (authenticateToken → authorizeRole)
// นำเข้า jsonwebtoken แล้วเก็บไว้ใน jwt
const jwt = require("jsonwebtoken");

// ใช้ JWT_SECRET จาก .env เมื่อมีค่า; ค่าสำรองนี้มีไว้ให้รันบนเครื่องพัฒนาเท่านั้น
// กำหนด DEV_FALLBACK_SECRET จาก "stockpro-dev-only-secret-set-JWT_SECRET-in-env"
const DEV_FALLBACK_SECRET = "stockpro-dev-only-secret-set-JWT_SECRET-in-env";

// [กุญแจลับ] เลือกกุญแจที่ใช้เซ็น/ตรวจบัตร
// ประกาศฟังก์ชัน jwtSecret รับ ไม่มีพารามิเตอร์
function jwtSecret() {
  // ส่งค่ากลับ: process.env.JWT_SECRET || DEV_FALLBACK_SECRET
  return process.env.JWT_SECRET || DEV_FALLBACK_SECRET;
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// [ออกบัตร] เรียกตอนล็อกอินสำเร็จ
// ประกาศฟังก์ชัน generateToken รับ user
function generateToken(user) {
  // ส่งค่ากลับ: jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret(), {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret(), {
    // กำหนดคุณสมบัติ expiresIn เป็น process.env.JWT_EXPIRES_IN || "1h"
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// [ตัวช่วย] ตอบ error รูปแบบเดียวกัน
// ประกาศฟังก์ชัน sendAuthError รับ res, status, code, message
function sendAuthError(res, status, code, message) {
  // ส่งค่ากลับ: res.status(status).json({ error: { code, message } })
  return res.status(status).json({ error: { code, message } });
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// [ด่าน 1] ตรวจว่ามีบัตร (token) และบัตรจริง
// ประกาศฟังก์ชัน authenticateToken รับ req, res, next
function authenticateToken(req, res, next) {
  // กำหนด authHeader จาก req.headers["authorization"]
  const authHeader = req.headers["authorization"];
  // authorization: "Bearer <token>"
  // กำหนด token จาก authHeader && authHeader.split(" ")[1]
  const token = authHeader && authHeader.split(" ")[1];
  // ตรวจ (!token) แล้วทำคำสั่งเมื่อเป็นจริง
  if (!token) {
    // ส่งค่ากลับ: sendAuthError(res, 401, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อนใช้งาน")
    return sendAuthError(res, 401, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // verify ผ่าน จะได้ payload ของผู้ใช้กลับมา { id, email, role }
    // กำหนด req.user จาก jwt.verify(token, jwtSecret())
    req.user = jwt.verify(token, jwtSecret());
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next();
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (err) {
    // ส่งผลลัพธ์ที่คำนวณจากข้อมูลในบรรทัดนี้กลับไป
    return sendAuthError(res, 401, "INVALID_TOKEN", "Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// [ด่าน 2] ตรวจว่าเป็น admin
// ประกาศฟังก์ชัน authorizeRole รับ ...allowedRoles
function authorizeRole(...allowedRoles) {
  // ส่งค่ากลับ: (req, res, next) => {
  return (req, res, next) => {
    // ตรวจ (!req.user) แล้วทำคำสั่งเมื่อเป็นจริง
    if (!req.user) {
      // ส่งค่ากลับ: sendAuthError(res, 401, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อนใช้งาน")
      return sendAuthError(res, 401, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // ตรวจ (!allowedRoles.includes(req.user.role)) แล้วทำคำสั่งเมื่อเป็นจริง
    if (!allowedRoles.includes(req.user.role)) {
      // ส่งค่ากลับ: sendAuthError(res, 403, "FORBIDDEN", "คุณไม่มีสิทธิ์ทำรายการนี้ (เฉพาะผู้ดูแลระบบ)")
      return sendAuthError(res, 403, "FORBIDDEN", "คุณไม่มีสิทธิ์ทำรายการนี้ (เฉพาะผู้ดูแลระบบ)");
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // เรียก next ด้วยค่าที่ระบุในบรรทัดนี้
    next();
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  };
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// [รวม 2 ด่าน]
// ใช้กับทุก route ที่เพิ่ม/แก้ไข/ลบข้อมูล: ต้อง login และเป็น admin
// เก็บรายการข้อมูลเริ่มต้นไว้ใน requireAdmin
const requireAdmin = [authenticateToken, authorizeRole("admin")];

// [ส่งออก] ให้ไฟล์อื่นหยิบไปใช้
// ส่งออกฟังก์ชันและค่าที่ระบุให้โมดูลอื่นใช้
module.exports = { generateToken, authenticateToken, authorizeRole, requireAdmin, jwtSecret };
