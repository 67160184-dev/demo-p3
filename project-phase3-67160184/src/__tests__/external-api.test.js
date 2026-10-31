// Unit test ของ retry/timeout/fallback (Phase 2) โดยยิง HTTP จริงไปยังเซิร์ฟเวอร์จำลองบนเครื่อง
const http = require("http");
const { getExchangeRate, fetchWithRetry, config } = require("../services/external-api");

const originalConfig = { ...config };
let server;
let baseUrl;
let hits;
let behaviour;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits++;
    behaviour(hits, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  jest.spyOn(console, "log").mockImplementation(() => {});
});

beforeEach(() => {
  hits = 0;
  Object.assign(config, { url: baseUrl, maxRetries: 2, backoffMs: 5, timeoutMs: 300 });
});

afterAll(async () => {
  Object.assign(config, originalConfig);
  await new Promise((resolve) => server.close(resolve));
});

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

test("5xx สองครั้งแล้วสำเร็จ: retry จนได้ผล (เรียกรวม 3 ครั้ง)", async () => {
  behaviour = (n, res) => (n < 3 ? json(res, 503, {}) : json(res, 200, { rates: { USD: 0.03 } }));
  const data = await fetchWithRetry(baseUrl);
  expect(data.rates.USD).toBe(0.03);
  expect(hits).toBe(3);
});

test("429 ถือว่า retry ได้", async () => {
  behaviour = (n, res) => (n === 1 ? json(res, 429, {}) : json(res, 200, { rates: { USD: 0.03 } }));
  await expect(getExchangeRate("USD")).resolves.toEqual({ rate: 0.03, source: "live" });
  expect(hits).toBe(2);
});

test("4xx อื่น (404) ไม่ retry และใช้ fallback ทันที", async () => {
  behaviour = (n, res) => json(res, 404, {});
  const result = await getExchangeRate("USD");
  expect(result.source).toBe("fallback");
  expect(hits).toBe(1);
});

test("ล้มเหลวครบทุกครั้ง: ใช้ fallback หลังเรียก maxRetries + 1 ครั้ง", async () => {
  behaviour = (n, res) => json(res, 500, {});
  const result = await getExchangeRate("USD");
  expect(result).toMatchObject({ rate: null, source: "fallback" });
  expect(hits).toBe(3);
});

test("timeout: ตอบช้ากว่า timeoutMs ถือว่าล้มเหลว", async () => {
  config.maxRetries = 0;
  behaviour = (n, res) => setTimeout(() => json(res, 200, { rates: { USD: 0.03 } }), 600);
  const result = await getExchangeRate("USD");
  expect(result.source).toBe("fallback");
});

test("สกุลเงินที่ไม่มีในผลลัพธ์ ได้ source = unsupported", async () => {
  behaviour = (n, res) => json(res, 200, { rates: { USD: 0.03 } });
  await expect(getExchangeRate("XYZ")).resolves.toEqual({ rate: null, source: "unsupported" });
});
