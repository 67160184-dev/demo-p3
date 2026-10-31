// Integration test: เรียก API จริงผ่าน Supertest + MySQL จริง (ฐานข้อมูลทดสอบ product_db_test)
// ครอบคลุม 5 Use Case ของ Phase 1, endpoint แปลงสกุลเงินของ Phase 2 และการจัดการข้อมูลแบบ admin (แก้ไข/ลบ)
const http = require("http");
const request = require("supertest");
const app = require("../index");
const pool = require("../../db");
const { config } = require("../services/external-api");

const jwt = require("jsonwebtoken");

const originalConfig = { ...config };
let rateServer;
let rateUrl;

// บัญชี admin จาก seed.sql — route ที่เพิ่ม/แก้ไข/ลบต้องแนบ token นี้
const ADMIN = { email: "admin@stockpro.com", password: "admin@stockpro.com1" };
let adminToken;
const withToken = (req) => req.set("Authorization", `Bearer ${adminToken}`);
const admin = {
  post: (url) => withToken(request(app).post(url)),
  patch: (url) => withToken(request(app).patch(url)),
  delete: (url) => withToken(request(app).delete(url)),
};

beforeAll(async () => {
  const login = await request(app).post("/api/v1/auth/login").send(ADMIN);
  adminToken = login.body.token;

  // บริการอัตราแลกเปลี่ยนจำลองบนเครื่อง (HTTP จริง) เพื่อให้ผล test คงที่ ไม่ขึ้นกับอินเทอร์เน็ต
  rateServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ rates: { THB: 1, USD: 0.028 } }));
  });
  await new Promise((resolve) => rateServer.listen(0, "127.0.0.1", resolve));
  rateUrl = `http://127.0.0.1:${rateServer.address().port}/v6/latest/THB`;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => Object.assign(config, originalConfig));

afterAll(async () => {
  await new Promise((resolve) => rateServer.close(resolve));
  await pool.end();
});

describe("Authentication: login ด้วย JWT และสิทธิ์ admin", () => {
  test("POST /api/v1/auth/login ด้วยบัญชี admin ได้ token และ role admin", async () => {
    const res = await request(app).post("/api/v1/auth/login").send(ADMIN);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user).toMatchObject({ email: ADMIN.email, role: "admin" });
  });

  test("รหัสผ่านผิด หรืออีเมลไม่มีในระบบ ตอบ 401 ข้อความเดียวกัน", async () => {
    const wrongPassword = await request(app).post("/api/v1/auth/login").send({ ...ADMIN, password: "wrong" });
    const unknownEmail = await request(app).post("/api/v1/auth/login").send({ email: "nobody@x.com", password: "x" });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error).toEqual(unknownEmail.body.error);
  });

  test("ไม่ส่ง email/password ตอบ 400", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    expect(res.status).toBe(400);
  });

  test("GET /api/v1/auth/me คืนข้อมูลผู้ใช้จาก token / ไม่มี token ตอบ 401", async () => {
    const me = await withToken(request(app).get("/api/v1/auth/me"));
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ email: ADMIN.email, role: "admin" });
    expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
  });

  test("ดูข้อมูล (GET) ไม่ต้อง login", async () => {
    expect((await request(app).get("/api/v1/products")).status).toBe(200);
    expect((await request(app).get("/api/v1/categories")).status).toBe(200);
  });

  test("เพิ่ม/แก้ไข/ลบ โดยไม่มี token ตอบ 401 NO_TOKEN และข้อมูลไม่เปลี่ยน", async () => {
    const post = await request(app).post("/api/v1/categories").send({ name: "NoToken" });
    const patch = await request(app).patch("/api/v1/products/1").send({ price: 1 });
    const del = await request(app).delete("/api/v1/suppliers/1");
    [post, patch, del].forEach((res) => {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("NO_TOKEN");
    });
    const product = await request(app).get("/api/v1/products/1");
    expect(product.body.data.price).not.toBe("1.00");
  });

  test("token ปลอม/ผิดลายเซ็น ตอบ 401 INVALID_TOKEN", async () => {
    const forged = jwt.sign({ id: 1, role: "admin" }, "wrong-secret");
    const res = await request(app).delete("/api/v1/products/1").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  test("เปลี่ยนรหัสผ่าน: รหัสเดิมผิด 401, รหัสใหม่สั้น/ซ้ำของเดิม/ไม่ครบ 400, ไม่มี token 401", async () => {
    const url = "/api/v1/auth/change-password";
    const wrongOld = await admin.patch(url).send({ oldPassword: "wrong", newPassword: "NewPass@1234" });
    expect(wrongOld.status).toBe(401);
    expect(wrongOld.body.error.code).toBe("INVALID_CREDENTIALS");
    expect((await admin.patch(url).send({ oldPassword: ADMIN.password, newPassword: "short" })).status).toBe(400);
    expect((await admin.patch(url).send({ oldPassword: ADMIN.password, newPassword: ADMIN.password })).status).toBe(400);
    expect((await admin.patch(url).send({ oldPassword: ADMIN.password })).status).toBe(400);
    expect((await request(app).patch(url).send({ oldPassword: ADMIN.password, newPassword: "NewPass@1234" })).status).toBe(401);
  });

  test("เปลี่ยนรหัสผ่านสำเร็จ: รหัสใหม่ login ได้ รหัสเดิมใช้ไม่ได้ (แล้วเปลี่ยนกลับ)", async () => {
    const url = "/api/v1/auth/change-password";
    const changed = await admin.patch(url).send({ oldPassword: ADMIN.password, newPassword: "NewPass@1234" });
    expect(changed.status).toBe(200);

    const loginNew = await request(app).post("/api/v1/auth/login").send({ email: ADMIN.email, password: "NewPass@1234" });
    const loginOld = await request(app).post("/api/v1/auth/login").send(ADMIN);
    expect(loginNew.status).toBe(200);
    expect(loginOld.status).toBe(401);

    // เปลี่ยนกลับ ให้ test อื่นใช้รหัสเดิมได้
    const back = await admin.patch(url).send({ oldPassword: "NewPass@1234", newPassword: ADMIN.password });
    expect(back.status).toBe(200);
  });

  test("token ถูกต้องแต่ role ไม่ใช่ admin ตอบ 403 FORBIDDEN", async () => {
    const staffToken = jwt.sign({ id: 99, role: "staff" }, process.env.JWT_SECRET);
    const res = await request(app).delete("/api/v1/products/1").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("GET /health", () => {
  test("ตอบ 200 และสถานะ OK", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });
});

describe("UC-04 ดูรายการสินค้าพร้อมรายละเอียด", () => {
  test("GET /api/v1/products คืนสินค้าพร้อมชื่อหมวดหมู่และผู้จัดจำหน่าย (JOIN)", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(res.body.data.length);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.data[0]).toMatchObject({
      id: 1,
      sku: "SKU-ELE-001",
      product_name: "Wireless Ergonomic Mouse",
      category_name: "Electronics",
      supplier_name: "TechSupply Co., Ltd.",
    });
  });

  test("GET /api/v1/products/1 คืนสินค้ารายชิ้น", async () => {
    const res = await request(app).get("/api/v1/products/1");
    expect(res.status).toBe(200);
    expect(res.body.data.product_name).toBe("Wireless Ergonomic Mouse");
  });

  test("GET /api/v1/products/99999 ตอบ 404 NOT_FOUND", async () => {
    const res = await request(app).get("/api/v1/products/99999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("UC-03 เพิ่มสินค้าใหม่", () => {
  test("POST /api/v1/products ตอบ 201 และอ่านกลับได้จริงจากฐานข้อมูล", async () => {
    const sku = `SKU-TEST-${Date.now()}`;
    const res = await admin
      .post("/api/v1/products")
      .send({ category_id: 2, supplier_id: null, name: "Test Hoodie", price: 590, sku, stock_quantity: 12 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "Test Hoodie", sku });

    const check = await request(app).get(`/api/v1/products/${res.body.data.id}`);
    expect(check.body.data).toMatchObject({ sku, category_name: "Apparel", supplier_name: null, stock_quantity: 12 });
  });

  test("SKU ซ้ำ ฐานข้อมูลปฏิเสธและตอบ 500", async () => {
    const res = await admin
      .post("/api/v1/products")
      .send({ category_id: 1, supplier_id: 1, name: "Duplicate", price: 10, sku: "SKU-ELE-001" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});

describe("UC-05 อัปเดตราคาและสต็อก", () => {
  test("PATCH /api/v1/products/2 แล้วค่าใหม่ถูกบันทึกจริง", async () => {
    const res = await admin.patch("/api/v1/products/2").send({ price: 360, stock_quantity: 100 });
    expect(res.status).toBe(200);

    const check = await request(app).get("/api/v1/products/2");
    expect(check.body.data.price).toBe("360.00");
    expect(check.body.data.stock_quantity).toBe(100);
  });

  test("PATCH สินค้าที่ไม่มีอยู่ ตอบ 404", async () => {
    const res = await admin.patch("/api/v1/products/99999").send({ price: 1, stock_quantity: 1 });
    expect(res.status).toBe(404);
  });
});

describe("Phase 2: GET /api/v1/products/:id/price (เรียก API ภายนอก)", () => {
  test("แปลงราคาเป็น USD เมื่อ API ภายนอกตอบปกติ", async () => {
    config.url = rateUrl;
    const res = await request(app).get("/api/v1/products/1/price?currency=usd");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ currency: "USD", rate: 0.028, converted_price: 24.92, fallback: false });
  });

  test("สกุลเงินที่ไม่รองรับ ตอบ 400", async () => {
    config.url = rateUrl;
    const res = await request(app).get("/api/v1/products/1/price?currency=XYZ");
    expect(res.status).toBe(400);
  });

  test("รหัสสกุลเงินผิดรูปแบบ ตอบ 400 โดยไม่เรียก API ภายนอก", async () => {
    const res = await request(app).get("/api/v1/products/1/price?currency=US1");
    expect(res.status).toBe(400);
  });

  test("สินค้าที่ไม่มีอยู่ ตอบ 404", async () => {
    const res = await request(app).get("/api/v1/products/99999/price");
    expect(res.status).toBe(404);
  });

  test("API ภายนอกล่ม ตอบ 200 พร้อม fallback เป็นราคา THB", async () => {
    Object.assign(config, { url: "http://127.0.0.1:9/down", maxRetries: 1, backoffMs: 10, timeoutMs: 500 });
    const res = await request(app).get("/api/v1/products/1/price?currency=USD");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ currency: "THB", converted_price: 890, fallback: true });
  });
});

describe("UC-01 เพิ่มหมวดหมู่สินค้า", () => {
  test("POST /api/v1/categories ตอบ 201", async () => {
    const name = `Sports-${Date.now()}`;
    const res = await admin.post("/api/v1/categories").send({ name, description: "อุปกรณ์กีฬา" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name, description: "อุปกรณ์กีฬา" });
  });

  test("ชื่อหมวดหมู่ซ้ำ ตอบ 500", async () => {
    const res = await admin.post("/api/v1/categories").send({ name: "Electronics" });
    expect(res.status).toBe(500);
  });
});

describe("UC-02 เพิ่มผู้จัดจำหน่าย", () => {
  test("POST /api/v1/suppliers ตอบ 201 (phone เป็น null ได้)", async () => {
    const stamp = Date.now();
    const res = await admin
      .post("/api/v1/suppliers")
      .send({ supplier_code: `SUP-${String(stamp).slice(-8)}`, name: "SportGear", email: `sales${stamp}@sportgear.co.th` });
    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBeNull();
  });

  test("อีเมลซ้ำ ตอบ 500", async () => {
    const res = await admin
      .post("/api/v1/suppliers")
      .send({ supplier_code: "SUP-DUP", name: "Dup", email: "contact@techsupply.com" });
    expect(res.status).toBe(500);
  });
});

// ---------- จัดการข้อมูลแบบ admin (เพิ่มหลัง Phase 2): แก้ชื่อ/SKU, ลบ, รายการหมวดหมู่/ผู้จัดจำหน่าย ----------
// ทุก test สร้างข้อมูลของตัวเองก่อนลบ ไม่แตะข้อมูล seed ที่ test อื่นใช้
async function createProduct(overrides = {}) {
  const res = await admin
    .post("/api/v1/products")
    .send({ category_id: 1, supplier_id: 1, name: "Temp", price: 10, sku: `SKU-TMP-${Date.now()}-${Math.random()}`, ...overrides });
  return res.body.data.id;
}

describe("แก้ไขชื่อ/SKU สินค้า (PATCH แบบส่งเฉพาะช่องที่แก้)", () => {
  test("PATCH name และ sku แล้วค่าใหม่ถูกบันทึกจริง ราคาเดิมไม่เปลี่ยน", async () => {
    const id = await createProduct({ price: 77 });
    const sku = `SKU-RENAMED-${Date.now()}`;
    const res = await admin.patch(`/api/v1/products/${id}`).send({ name: "Renamed", sku });
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/v1/products/${id}`);
    expect(check.body.data).toMatchObject({ product_name: "Renamed", sku, price: "77.00" });
  });

  test("PATCH category_id และ supplier_id ย้ายหมวดหมู่/ผู้จัดจำหน่ายได้จริง", async () => {
    const id = await createProduct({ category_id: 1, supplier_id: 1 });
    const res = await admin.patch(`/api/v1/products/${id}`).send({ category_id: 3, supplier_id: 3 });
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/v1/products/${id}`);
    expect(check.body.data).toMatchObject({
      category_id: 3,
      category_name: "Home & Kitchen",
      supplier_id: 3,
      supplier_name: "SmartHome Trading",
    });
  });

  test("PATCH supplier_id เป็น null ได้ (ไม่ระบุผู้จัดจำหน่าย)", async () => {
    const id = await createProduct();
    const res = await admin.patch(`/api/v1/products/${id}`).send({ supplier_id: null });
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/v1/products/${id}`);
    expect(check.body.data.supplier_name).toBeNull();
  });

  test("PATCH category_id ที่ไม่มีอยู่ ฐานข้อมูลปฏิเสธ (foreign key) ตอบ 500", async () => {
    const id = await createProduct();
    const res = await admin.patch(`/api/v1/products/${id}`).send({ category_id: 99999 });
    expect(res.status).toBe(500);
  });

  test("ไม่ส่งช่องที่แก้ได้เลย ตอบ 400", async () => {
    const res = await admin.patch("/api/v1/products/1").send({ unknown_field: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  test("แก้ SKU ให้ซ้ำกับสินค้าอื่น ตอบ 500", async () => {
    const id = await createProduct();
    const res = await admin.patch(`/api/v1/products/${id}`).send({ sku: "SKU-ELE-001" });
    expect(res.status).toBe(500);
  });
});

describe("ลบสินค้า", () => {
  test("DELETE /api/v1/products/:id ตอบ 200 แล้วอ่านกลับไม่เจอ (404)", async () => {
    const id = await createProduct();
    const res = await admin.delete(`/api/v1/products/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted_id).toBe(String(id));

    const check = await request(app).get(`/api/v1/products/${id}`);
    expect(check.status).toBe(404);
  });

  test("ลบสินค้าที่ไม่มีอยู่ ตอบ 404", async () => {
    const res = await admin.delete("/api/v1/products/99999");
    expect(res.status).toBe(404);
  });
});

describe("รายการและการลบหมวดหมู่", () => {
  test("GET /api/v1/categories คืนรายการพร้อมจำนวนสินค้า", async () => {
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(res.body.data.length);
    const electronics = res.body.data.find((c) => c.name === "Electronics");
    expect(electronics.product_count).toBeGreaterThanOrEqual(1);
  });

  test("ลบหมวดหมู่แล้วสินค้าในหมวดถูกลบตาม (ON DELETE CASCADE)", async () => {
    const cat = await admin.post("/api/v1/categories").send({ name: `ToDelete-${Date.now()}` });
    const productId = await createProduct({ category_id: cat.body.data.id });

    const res = await admin.delete(`/api/v1/categories/${cat.body.data.id}`);
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/v1/products/${productId}`);
    expect(check.status).toBe(404);
  });

  test("PATCH /api/v1/categories/:id แก้ชื่อและคำอธิบายได้จริง สินค้าเห็นชื่อใหม่", async () => {
    const cat = await admin.post("/api/v1/categories").send({ name: `Old-${Date.now()}` });
    const productId = await createProduct({ category_id: cat.body.data.id });
    const name = `Renamed-${Date.now()}`;

    const res = await admin.patch(`/api/v1/categories/${cat.body.data.id}`).send({ name, description: "ใหม่" });
    expect(res.status).toBe(200);

    const list = await request(app).get("/api/v1/categories");
    expect(list.body.data.find((c) => c.id === cat.body.data.id)).toMatchObject({ name, description: "ใหม่" });
    const product = await request(app).get(`/api/v1/products/${productId}`);
    expect(product.body.data.category_name).toBe(name);
  });

  test("PATCH หมวดหมู่ให้ชื่อซ้ำ ตอบ 500 / ไม่ส่งช่องใด ตอบ 400 / id ที่ไม่มี ตอบ 404", async () => {
    const cat = await admin.post("/api/v1/categories").send({ name: `Dup-${Date.now()}` });
    expect((await admin.patch(`/api/v1/categories/${cat.body.data.id}`).send({ name: "Electronics" })).status).toBe(500);
    expect((await admin.patch(`/api/v1/categories/${cat.body.data.id}`).send({})).status).toBe(400);
    expect((await admin.patch("/api/v1/categories/99999").send({ name: "X" })).status).toBe(404);
  });

  test("ลบหมวดหมู่ที่ไม่มีอยู่ ตอบ 404", async () => {
    const res = await admin.delete("/api/v1/categories/99999");
    expect(res.status).toBe(404);
  });
});

describe("รายการและการลบผู้จัดจำหน่าย", () => {
  test("GET /api/v1/suppliers คืนรายการพร้อมจำนวนสินค้า", async () => {
    const res = await request(app).get("/api/v1/suppliers");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(res.body.data.length);
    expect(res.body.data[0]).toHaveProperty("product_count");
  });

  test("ลบผู้จัดจำหน่ายแล้วสินค้ายังอยู่ แต่ไม่มีผู้จัดจำหน่าย (ON DELETE SET NULL)", async () => {
    const stamp = Date.now();
    const sup = await admin
      .post("/api/v1/suppliers")
      .send({ supplier_code: `DEL-${String(stamp).slice(-8)}`, name: "ToDelete", email: `del${stamp}@example.com` });
    const productId = await createProduct({ supplier_id: sup.body.data.id });

    const res = await admin.delete(`/api/v1/suppliers/${sup.body.data.id}`);
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/v1/products/${productId}`);
    expect(check.status).toBe(200);
    expect(check.body.data.supplier_name).toBeNull();
  });

  test("PATCH /api/v1/suppliers/:id แก้ชื่อ อีเมล เบอร์ และรหัสได้จริง", async () => {
    const stamp = Date.now();
    const sup = await admin
      .post("/api/v1/suppliers")
      .send({ supplier_code: `ED-${String(stamp).slice(-8)}`, name: "Before", email: `before${stamp}@example.com` });
    const changes = { name: "After", email: `after${stamp}@example.com`, phone: "021234000", supplier_code: `EX-${String(stamp).slice(-8)}` };

    const res = await admin.patch(`/api/v1/suppliers/${sup.body.data.id}`).send(changes);
    expect(res.status).toBe(200);

    const list = await request(app).get("/api/v1/suppliers");
    expect(list.body.data.find((s) => s.id === sup.body.data.id)).toMatchObject(changes);
  });

  test("PATCH ผู้จัดจำหน่ายให้อีเมลซ้ำ ตอบ 500 / ไม่ส่งช่องใด ตอบ 400 / id ที่ไม่มี ตอบ 404", async () => {
    const stamp = Date.now();
    const sup = await admin
      .post("/api/v1/suppliers")
      .send({ supplier_code: `DP-${String(stamp).slice(-8)}`, name: "Dup", email: `dup${stamp}@example.com` });
    expect((await admin.patch(`/api/v1/suppliers/${sup.body.data.id}`).send({ email: "contact@techsupply.com" })).status).toBe(500);
    expect((await admin.patch(`/api/v1/suppliers/${sup.body.data.id}`).send({ id: 1 })).status).toBe(400);
    expect((await admin.patch("/api/v1/suppliers/99999").send({ name: "X" })).status).toBe(404);
  });

  test("ลบผู้จัดจำหน่ายที่ไม่มีอยู่ ตอบ 404", async () => {
    const res = await admin.delete("/api/v1/suppliers/99999");
    expect(res.status).toBe(404);
  });
});

describe("เส้นทางที่ไม่มีอยู่", () => {
  test("ตอบ 404 NOT_FOUND", async () => {
    const res = await request(app).get("/api/v1/unknown");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
