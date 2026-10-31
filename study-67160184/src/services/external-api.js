// นำเข้า axios แล้วเก็บไว้ใน axios
const axios = require("axios");

// ค่าตั้งต้น อ่านจาก env เพื่อให้จำลอง failure ได้ (เช่น ตั้ง EXCHANGE_API_URL ให้ผิด)
// เก็บชุดข้อมูลเริ่มต้นไว้ใน config
const config = {
  // กำหนดคุณสมบัติ url เป็น process.env.EXCHANGE_API_URL || "https://open.er-api.com/v6/latest/THB"
  url: process.env.EXCHANGE_API_URL || "https://open.er-api.com/v6/latest/THB",
  // กำหนดคุณสมบัติ timeoutMs ตามเงื่อนไขหรือค่าที่ระบุ
  timeoutMs: Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 3000, // ค่าเริ่มต้น 3000 ms = 3 วินาทีต่อครั้ง; ปรับได้ใน .env
  // กำหนดคุณสมบัติ maxRetries ตามเงื่อนไขหรือค่าที่ระบุ
  maxRetries: Number(process.env.EXTERNAL_API_MAX_RETRIES ?? 2), // ค่าเริ่มต้น: ลองใหม่ 2 ครั้ง (รวมครั้งแรกเป็น 3 ครั้ง)
  // กำหนดคุณสมบัติ backoffMs ตามเงื่อนไขหรือค่าที่ระบุ
  backoffMs: Number(process.env.EXTERNAL_API_BACKOFF_MS) || 500, // Backoff = เวลาพักก่อนลองใหม่; 500 ms เป็นฐานเวลา (0.5 วินาที)
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
};

// กำหนด sleep จาก (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry เฉพาะ network error / timeout (ไม่มี response), 429 และ 5xx — ไม่ retry 4xx อื่น ๆ
// ประกาศฟังก์ชัน isRetryable รับ error
function isRetryable(error) {
  // ตรวจ (!error.response) return true; แล้วทำคำสั่งเมื่อเป็นจริง
  if (!error.response) return true;
  // กำหนด status จาก error.response.status
  const status = error.response.status;
  // ส่งค่ากลับ: status === 429 || status >= 500
  return status === 429 || status >= 500;
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// เรียก API ภายนอกพร้อม timeout + retry (exponential backoff + jitter) — ถ้าล้มเหลวครบจะ throw
// ประกาศฟังก์ชัน fetchWithRetry รับ url
async function fetchWithRetry(url) {
  // กำหนด totalAttempts จาก config.maxRetries + 1
  const totalAttempts = config.maxRetries + 1;
  // วนตาม (let attempt = 1; attempt <= totalAttempts; attempt++)
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
    try {
      // เรียก console.log(`[external-api] attempt ${attempt}/${totalAttempts} GET ${url}`)
      console.log(`[external-api] attempt ${attempt}/${totalAttempts} GET ${url}`);
      // รอคำตอบ API แล้วเก็บไว้ใน res
      const res = await axios.get(url, { timeout: config.timeoutMs });
      // เรียก console.log(`[external-api] attempt ${attempt} success (HTTP ${res.status})`)
      console.log(`[external-api] attempt ${attempt} success (HTTP ${res.status})`);
      // ส่งค่ากลับ: res.data
      return res.data;
    // จับข้อผิดพลาดจากบล็อกก่อนหน้า
    } catch (error) {
      // กำหนด reason จาก error.response
      const reason = error.response
        // เลือกค่ากรณีเงื่อนไขเป็นจริง
        ? `HTTP ${error.response.status}`
        // เลือกค่ากรณีเงื่อนไขเป็นเท็จ
        : error.code || error.message;
      // เรียก console.log(`[external-api] attempt ${attempt} failed: ${reason}`)
      console.log(`[external-api] attempt ${attempt} failed: ${reason}`);
      // ตรวจ (attempt >= totalAttempts || !isRetryable(error)) throw error; แล้วทำคำสั่งเมื่อเป็นจริง
      if (attempt >= totalAttempts || !isRetryable(error)) throw error;
      // คำนวณค่า base จากข้อมูลและเงื่อนไขในบรรทัดนี้
      const base = 2 ** (attempt - 1) * config.backoffMs; // ฐานเวลาเพิ่มเป็น 2 เท่า: 500, 1000 ms, ...
      // คำนวณค่า delay จากข้อมูลและเงื่อนไขในบรรทัดนี้
      const delay = base / 2 + Math.random() * (base / 2); // เวลาพักจริงสุ่มในช่วงครึ่งหนึ่งถึงเต็มฐานเวลา
      // เรียก console.log(`[external-api] retrying in ${Math.round(delay)} ms`)
      console.log(`[external-api] retrying in ${Math.round(delay)} ms`);
      // รอการทำงานของ sleep(delay)
      await sleep(delay);
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// คืนอัตราแลกเปลี่ยนจาก THB -> currency
// สำเร็จ: { rate, source: "live" }
// ล้มเหลว (หลัง retry ครบ): { rate: null, source: "fallback", message } เพื่อให้ผู้เรียกตอบกลับผู้ใช้ได้โดยไม่ crash
// ประกาศฟังก์ชัน getExchangeRate รับ currency
async function getExchangeRate(currency) {
  // เริ่มบล็อกคำสั่งที่อาจเกิดข้อผิดพลาด
  try {
    // รอคำตอบ API แล้วเก็บไว้ใน data
    const data = await fetchWithRetry(config.url);
    // กำหนด rate จาก data && data.rates && data.rates[currency]
    const rate = data && data.rates && data.rates[currency];
    // ตรวจ (typeof rate !== "number") แล้วทำคำสั่งเมื่อเป็นจริง
    if (typeof rate !== "number") {
      // ส่งค่ากลับ: { rate: null, source: "unsupported" }
      return { rate: null, source: "unsupported" };
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    }
    // ส่งค่ากลับ: { rate, source: "live" }
    return { rate, source: "live" };
  // จับข้อผิดพลาดจากบล็อกก่อนหน้า
  } catch (error) {
    // เรียก console.log("[external-api] all attempts failed -> using fallback")
    console.log("[external-api] all attempts failed -> using fallback");
    // fetchWithRetry ล้มเหลว: กำหนด source เป็น "fallback" ให้ route แสดงราคาเงินบาทเดิม
    // ส่งค่ากลับ: {
    return {
      // กำหนดคุณสมบัติ rate เป็น null
      rate: null,
      // กำหนดคุณสมบัติ source เป็น "fallback"
      source: "fallback",
      // กำหนดคุณสมบัติ message เป็น 
      message:
        // ส่งข้อความแจ้งผู้ใช้ว่า API ภายนอกล้มเหลว จึงแสดงราคาเป็นบาทเดิม
        "ไม่สามารถดึงอัตราแลกเปลี่ยนได้ในขณะนี้ จึงแสดงราคาเป็นสกุลเงินบาท (THB) แทน",
    // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
    };
  // จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
  }
// จบบล็อกหรือรายการค่าที่เริ่มไว้ก่อนหน้า
}

// กำหนด module.exports จาก { getExchangeRate, fetchWithRetry, config }
module.exports = { getExchangeRate, fetchWithRetry, config };
