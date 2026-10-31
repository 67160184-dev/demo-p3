// Phase 3: ยืนยันตัวตนด้วย JWT + ตรวจบทบาท ตามรูปแบบสัปดาห์ที่ 6 (authenticateToken → authorizeRole)
const jwt = require("jsonwebtoken");

// ต้องตั้ง JWT_SECRET ใน .env เสมอ — ค่าสำรองนี้มีไว้ให้รันบนเครื่องที่ยังไม่มี .env ได้เท่านั้น (เหมือนค่าเริ่มต้นใน db.js)
const DEV_FALLBACK_SECRET = "stockpro-dev-only-secret-set-JWT_SECRET-in-env";

// [กุญแจลับ] เลือกกุญแจที่ใช้เซ็น/ตรวจบัตร
function jwtSecret() {
  return process.env.JWT_SECRET || DEV_FALLBACK_SECRET;
}

// [ออกบัตร] เรียกตอนล็อกอินสำเร็จ
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, jwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
}

// [ตัวช่วย] ตอบ error รูปแบบเดียวกัน
function sendAuthError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// [ด่าน 1] ตรวจว่ามีบัตร (token) และบัตรจริง
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  // authorization: "Bearer <token>"
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return sendAuthError(res, 401, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
  }
  try {
    // verify ผ่าน จะได้ payload ของผู้ใช้กลับมา { id, email, role }
    req.user = jwt.verify(token, jwtSecret());
    next();
  } catch (err) {
    return sendAuthError(res, 401, "INVALID_TOKEN", "Token ไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }
}

// [ด่าน 2] ตรวจว่าเป็น admin
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendAuthError(res, 401, "NO_TOKEN", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
    }
    if (!allowedRoles.includes(req.user.role)) {
      return sendAuthError(res, 403, "FORBIDDEN", "คุณไม่มีสิทธิ์ทำรายการนี้ (เฉพาะผู้ดูแลระบบ)");
    }
    next();
  };
}

// [รวม 2 ด่าน]
// ใช้กับทุก route ที่เพิ่ม/แก้ไข/ลบข้อมูล: ต้อง login และเป็น admin
const requireAdmin = [authenticateToken, authorizeRole("admin")];

// [ส่งออก] ให้ไฟล์อื่นหยิบไปใช้
module.exports = { generateToken, authenticateToken, authorizeRole, requireAdmin, jwtSecret };
