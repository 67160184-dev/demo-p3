# บันทึกผลการทดสอบ Failure Scenario (External API)

**ระบบ:** StockPro (P5) · **รหัสนิสิต:** 67160184
**Endpoint ที่ทดสอบ:** `GET /api/v1/products/1/price?currency=USD` (เรียก Exchange Rate API ภายนอก)
**การตั้งค่า:** timeout 3000 ms (ยกเว้น S4 ตั้ง 1000 ms เพื่อให้เห็นผลเร็ว), retry 2 ครั้ง (รวมเรียกสูงสุด 3 ครั้ง), exponential backoff เริ่ม 500 ms + jitter (รอ ~250–500 ms ก่อนครั้งที่ 2 และ ~500–1000 ms ก่อนครั้งที่ 3)
**วิธีทดสอบ:** รันเซิร์ฟเวอร์จริง (`node src/index.js`) โดยเปลี่ยน `EXCHANGE_API_URL` / `EXTERNAL_API_TIMEOUT_MS` ผ่านตัวแปรแวดล้อม แล้วยิงด้วย `curl` เวลาที่บันทึกคือเวลาตอบกลับรวมที่ผู้ใช้ได้รับ log มาจาก console ของเซิร์ฟเวอร์ (`[external-api] ...`)
**ปลายทางที่ใช้:** Baseline และ S1–S5 เรียกปลายทางจริงบนเครือข่ายทั้งหมด ได้แก่ API อัตราแลกเปลี่ยนจริง (`open.er-api.com`), โดเมนที่ไม่มีอยู่จริง, พอร์ตที่ไม่มี service, บริการทดสอบสาธารณะ `httpbin.org` (ตอบ status ตามที่ขอ) และ IP ที่ไม่ตอบ (`10.255.255.1`) — มีเพียง **S6 ที่ใช้เซิร์ฟเวอร์จำลอง (mock) บนเครื่อง** เพราะไม่มีบริการสาธารณะที่ล้มเหลว 2 ครั้งแล้วสำเร็จครั้งที่ 3 ได้แน่นอน
**วันที่ทดสอบ:** 2026-10-08 (S1, S2, S6) และ 2026-10-11 (Baseline, S3, S4, S5, S7)

## สรุปผล

| # | สถานการณ์ | ปลายทาง | จำนวนครั้งที่เรียก | เวลาตอบกลับรวม | ผลที่ผู้ใช้ได้รับ | ตรงตามที่ออกแบบ |
| - | --- | --- | --- | --- | --- | --- |
| Baseline | API ภายนอกปกติ | `open.er-api.com` (จริง) | 1 | 412 ms | 200, `fallback:false`, ราคา USD | ผ่าน |
| S1 | URL ไม่มีอยู่จริง (DNS `ENOTFOUND`) | โดเมน `.invalid` (จริง) | 3 | 1,062 ms | 200, `fallback:true` (ราคา THB + ข้อความแจ้ง) | ผ่าน |
| S2 | ปลายทางปิด (`ECONNREFUSED` จำลองเน็ตขาด) | `localhost:9` ไม่มี service (จริง) | 3 | 1,229 ms | 200, `fallback:true` | ผ่าน |
| S3 | API ตอบ 503 ตลอด | `httpbin.org` (จริง) | 3 | 3,423 ms | 200, `fallback:true` | ผ่าน |
| S4 | API ไม่ตอบ (ค้าง) → timeout 1000 ms | `10.255.255.1` (จริง) | 3 | 4,431 ms | 200, `fallback:true` | ผ่าน |
| S5 | API ตอบ 404 | `httpbin.org` (จริง) | 1 (ไม่ retry) | 1,277 ms | 200, `fallback:true` | ผ่าน |
| S6 | ล้มเหลว (500) 2 ครั้ง แล้วครั้งที่ 3 สำเร็จ | **mock บนเครื่อง** | 3 | 1,430 ms | 200, `fallback:false`, ราคา USD | ผ่าน |
| S7 | ปิดอินเทอร์เน็ตจริง (ปิด Wi-Fi) | `open.er-api.com` (จริง, ค่าเริ่มต้น) | 3 | 1,092 ms | 200, `fallback:true` | ผ่าน |

ในทุกกรณีเซิร์ฟเวอร์ไม่ crash และไม่ค้าง ตอบกลับภายในเวลาที่คาดได้ (S4: 3 ครั้ง × 1 วินาที + backoff ≈ 4.4 วินาที)

## รายละเอียดแต่ละสถานการณ์

### Baseline — API ภายนอกทำงานปกติ
ไม่ตั้งค่าใด ๆ (ใช้ `https://open.er-api.com/v6/latest/THB` ตามค่าเริ่มต้น)

```
[external-api] attempt 1/3 GET https://open.er-api.com/v6/latest/THB
[external-api] attempt 1 success (HTTP 200)
```
Response (HTTP 200, 412 ms):
```json
{"message":"แปลงราคาสินค้าสำเร็จ","data":{"id":1,"name":"Wireless Ergonomic Mouse","price_thb":890,"currency":"USD","rate":0.02979,"converted_price":26.51,"fallback":false}}
```

### S1 — URL ไม่มีอยู่จริง
`EXCHANGE_API_URL=https://nonexistent-host-stockpro.invalid/v6/latest/THB`

```
[external-api] attempt 1/3 GET https://nonexistent-host-stockpro.invalid/v6/latest/THB
[external-api] attempt 1 failed: ENOTFOUND
[external-api] retrying in 369 ms
[external-api] attempt 2/3 GET https://nonexistent-host-stockpro.invalid/v6/latest/THB
[external-api] attempt 2 failed: ENOTFOUND
[external-api] retrying in 533 ms
[external-api] attempt 3/3 GET https://nonexistent-host-stockpro.invalid/v6/latest/THB
[external-api] attempt 3 failed: ENOTFOUND
[external-api] all attempts failed -> using fallback
```
Response (HTTP 200, 1,062 ms):
```json
{"message":"ไม่สามารถดึงอัตราแลกเปลี่ยนได้ในขณะนี้ จึงแสดงราคาเป็นสกุลเงินบาท (THB) แทน","data":{"id":1,"name":"Wireless Ergonomic Mouse","price_thb":890,"currency":"THB","converted_price":890,"fallback":true}}
```

### S2 — ปลายทางปิด / เครือข่ายใช้งานไม่ได้
`EXCHANGE_API_URL=http://localhost:9/latest` (ไม่มี service รับ) — จำลองการเชื่อมต่อไม่ได้ โดยไม่ได้ปิดอินเทอร์เน็ตของเครื่องจริง

```
[external-api] attempt 1/3 GET http://localhost:9/latest
[external-api] attempt 1 failed: ECONNREFUSED
[external-api] retrying in 475 ms
[external-api] attempt 2/3 GET http://localhost:9/latest
[external-api] attempt 2 failed: ECONNREFUSED
[external-api] retrying in 599 ms
[external-api] attempt 3/3 GET http://localhost:9/latest
[external-api] attempt 3 failed: ECONNREFUSED
[external-api] all attempts failed -> using fallback
```
Response: HTTP 200, `fallback:true` (1,229 ms)

### S3 — API ภายนอกตอบ 5xx
`EXCHANGE_API_URL=https://httpbin.org/status/503` (บริการทดสอบสาธารณะที่ตอบ 503 ทุกครั้ง)

```
[external-api] attempt 1/3 GET https://httpbin.org/status/503
[external-api] attempt 1 failed: HTTP 503
[external-api] retrying in 459 ms
[external-api] attempt 2/3 GET https://httpbin.org/status/503
[external-api] attempt 2 failed: HTTP 503
[external-api] retrying in 996 ms
[external-api] attempt 3/3 GET https://httpbin.org/status/503
[external-api] attempt 3 failed: HTTP 503
[external-api] all attempts failed -> using fallback
```
Response: HTTP 200, `fallback:true` (3,423 ms)

### S4 — Timeout
`EXCHANGE_API_URL=http://10.255.255.1/latest` (IP ที่ไม่มีเครื่องตอบ การเชื่อมต่อจะค้างจนชน timeout), `EXTERNAL_API_TIMEOUT_MS=1000`

```
[external-api] attempt 1/3 GET http://10.255.255.1/latest
[external-api] attempt 1 failed: ECONNABORTED
[external-api] retrying in 382 ms
[external-api] attempt 2/3 GET http://10.255.255.1/latest
[external-api] attempt 2 failed: ECONNABORTED
[external-api] retrying in 763 ms
[external-api] attempt 3/3 GET http://10.255.255.1/latest
[external-api] attempt 3 failed: ECONNABORTED
[external-api] all attempts failed -> using fallback
```
Response: HTTP 200, `fallback:true` (4,431 ms) — แต่ละครั้งถูกตัดที่ 1 วินาที ไม่รอไม่สิ้นสุด

### S5 — 4xx ไม่ retry
`EXCHANGE_API_URL=https://httpbin.org/status/404` (บริการทดสอบสาธารณะที่ตอบ 404)

```
[external-api] attempt 1/3 GET https://httpbin.org/status/404
[external-api] attempt 1 failed: HTTP 404
[external-api] all attempts failed -> using fallback
```
Response: HTTP 200, `fallback:true` (1,277 ms) — เรียกครั้งเดียว เพราะ 4xx เป็นความผิดของ request การลองซ้ำไม่ช่วย

### S6 — Retry สำเร็จหลังล้มเหลวชั่วคราว (ใช้ mock)
`EXCHANGE_API_URL=http://localhost:9100/flaky` — **เซิร์ฟเวอร์จำลอง (mock) บนเครื่อง** ที่ตอบ 500 สองครั้งแรก แล้วตอบ 200 พร้อม `{"rates":{"USD":0.03}}` ใช้ mock เพราะไม่มีบริการสาธารณะที่ล้มเหลวตามจำนวนครั้งที่กำหนดได้แน่นอน (ตัวเลข rate 0.03 จึงเป็นค่าที่ mock กำหนด ไม่ใช่อัตราจริง)

```
[external-api] attempt 1/3 GET http://localhost:9100/flaky
[external-api] attempt 1 failed: HTTP 500
[external-api] retrying in 349 ms
[external-api] attempt 2/3 GET http://localhost:9100/flaky
[external-api] attempt 2 failed: HTTP 500
[external-api] retrying in 929 ms
[external-api] attempt 3/3 GET http://localhost:9100/flaky
[external-api] attempt 3 success (HTTP 200)
```
Response: HTTP 200, `fallback:false`, `rate:0.03`, `converted_price:26.7` (1,430 ms)

### S7 — ปิดอินเทอร์เน็ตจริง
ไม่ตั้งค่าใด ๆ (ใช้ `https://open.er-api.com/v6/latest/THB` ตามค่าเริ่มต้น) เปิดเซิร์ฟเวอร์ตอนยังมีอินเทอร์เน็ต แล้ว**ปิด Wi-Fi ของเครื่อง**ก่อนยิง request ทดสอบด้วย `Measure-Command { curl.exe -s "http://localhost:3000/api/v1/products/1/price?currency=USD" }` ใน PowerShell (เรียก `localhost` ได้แม้ไม่มีอินเทอร์เน็ต)

```
[external-api] attempt 1/3 GET https://open.er-api.com/v6/latest/THB
[external-api] attempt 1 failed: ENOTFOUND
[external-api] retrying in 339 ms
[external-api] attempt 2/3 GET https://open.er-api.com/v6/latest/THB
[external-api] attempt 2 failed: ENOTFOUND
[external-api] retrying in 634 ms
[external-api] attempt 3/3 GET https://open.er-api.com/v6/latest/THB
[external-api] attempt 3 failed: ENOTFOUND
[external-api] all attempts failed -> using fallback
GET /api/v1/products/1/price?currency=USD 200 1039.598 ms - 344
```
Response (HTTP 200, 344 bytes — เวลาตอบกลับที่ฝั่งผู้ใช้วัดได้ 1,092 ms ด้วย `Measure-Command` และฝั่งเซิร์ฟเวอร์ 1,040 ms):
```json
{"message":"ไม่สามารถดึงอัตราแลกเปลี่ยนได้ในขณะนี้ จึงแสดงราคาเป็นสกุลเงินบาท (THB) แทน","data":{"id":1,"name":"Wireless Ergonomic Mouse","price_thb":890,"currency":"THB","converted_price":890,"fallback":true}}
```
(ในหน้าต่าง PowerShell ข้อความภาษาไทยในช่อง `message` แสดงเป็นตัวอักษรเพี้ยน เพราะ console ใช้ encoding เก่าแสดงผล UTF-8 ไม่ถูก ส่วนอื่นของ response ตรงตามด้านบนทุกตัวอักษร)
เมื่อไม่มีอินเทอร์เน็ต เครื่องหาชื่อโดเมนไม่ได้ จึงได้ error `ENOTFOUND` แบบเดียวกับ S1 ระบบลองใหม่ครบ 2 ครั้งแล้วตอบ fallback ไม่ค้าง

## ข้อสังเกต
- Retry ทำงานตามที่กำหนด: ลองซ้ำ 2 ครั้ง (รวม 3 ครั้ง) เมื่อ network error, timeout และ 5xx และหยุดทันทีเมื่อเจอ 4xx
- Timeout ตัดการรอที่เวลาที่ตั้งไว้ในทุกครั้งที่เรียก
- Fallback ทำให้ผู้ใช้ยังได้ราคาเป็นบาทพร้อมข้อความอธิบายและ `fallback:true` แทนที่จะเกิด error 500
