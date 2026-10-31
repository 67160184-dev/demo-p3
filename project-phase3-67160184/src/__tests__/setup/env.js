// ต้องตั้งก่อน require db.js — dotenv จะไม่ทับค่าที่ตั้งไว้แล้ว
process.env.DB_NAME = "product_db_test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.JWT_EXPIRES_IN = "1h";
