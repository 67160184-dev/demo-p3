const axios = require("axios");

// ค่าตั้งต้น อ่านจาก env เพื่อให้จำลอง failure ได้ (เช่น ตั้ง EXCHANGE_API_URL ให้ผิด)
const config = {
  url: process.env.EXCHANGE_API_URL || "https://open.er-api.com/v6/latest/THB",
  timeoutMs: Number(process.env.EXTERNAL_API_TIMEOUT_MS) || 3000, // ค่าเริ่มต้น 3000 ms = 3 วินาทีต่อครั้ง; ปรับได้ใน .env
  maxRetries: Number(process.env.EXTERNAL_API_MAX_RETRIES ?? 2), // ค่าเริ่มต้น: ลองใหม่ 2 ครั้ง (รวมครั้งแรกเป็น 3 ครั้ง)
  backoffMs: Number(process.env.EXTERNAL_API_BACKOFF_MS) || 500, // Backoff = เวลาพักก่อนลองใหม่; 500 ms เป็นฐานเวลา (0.5 วินาที)
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry เฉพาะ network error / timeout (ไม่มี response), 429 และ 5xx — ไม่ retry 4xx อื่น ๆ
function isRetryable(error) {
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || status >= 500;
}

// เรียก API ภายนอกพร้อม timeout + retry (exponential backoff + jitter) — ถ้าล้มเหลวครบจะ throw
async function fetchWithRetry(url) {
  const totalAttempts = config.maxRetries + 1;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      console.log(`[external-api] attempt ${attempt}/${totalAttempts} GET ${url}`);
      const res = await axios.get(url, { timeout: config.timeoutMs });
      console.log(`[external-api] attempt ${attempt} success (HTTP ${res.status})`);
      return res.data;
    } catch (error) {
      const reason = error.response
        ? `HTTP ${error.response.status}`
        : error.code || error.message;
      console.log(`[external-api] attempt ${attempt} failed: ${reason}`);
      if (attempt >= totalAttempts || !isRetryable(error)) throw error;
      const base = 2 ** (attempt - 1) * config.backoffMs; // ฐานเวลาเพิ่มเป็น 2 เท่า: 500, 1000 ms, ...
      const delay = base / 2 + Math.random() * (base / 2); // เวลาพักจริงสุ่มในช่วงครึ่งหนึ่งถึงเต็มฐานเวลา
      console.log(`[external-api] retrying in ${Math.round(delay)} ms`);
      await sleep(delay);
    }
  }
}

// คืนอัตราแลกเปลี่ยนจาก THB -> currency
// สำเร็จ: { rate, source: "live" }
// ล้มเหลว (หลัง retry ครบ): { rate: null, source: "fallback", message } เพื่อให้ผู้เรียกตอบกลับผู้ใช้ได้โดยไม่ crash
async function getExchangeRate(currency) {
  try {
    const data = await fetchWithRetry(config.url);
    const rate = data && data.rates && data.rates[currency];
    if (typeof rate !== "number") {
      return { rate: null, source: "unsupported" };
    }
    return { rate, source: "live" };
  } catch (error) {
    console.log("[external-api] all attempts failed -> using fallback");
    // fetchWithRetry ล้มเหลว: กำหนด source เป็น "fallback" ให้ route แสดงราคาเงินบาทเดิม
    return {
      rate: null,
      source: "fallback",
      message:
        "ไม่สามารถดึงอัตราแลกเปลี่ยนได้ในขณะนี้ จึงแสดงราคาเป็นสกุลเงินบาท (THB) แทน",
    };
  }
}

module.exports = { getExchangeRate, fetchWithRetry, config };
