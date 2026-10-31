USE product_db;

-- 1. เพิ่มข้อมูลตัวอย่างตาราง categories (3 ระเบียน)
INSERT INTO categories (name, description) VALUES
('Electronics', 'อุปกรณ์อิเล็กทรอนิกส์และแกดเจ็ต'),
('Apparel', 'เสื้อผ้าและเครื่องแต่งกาย'),
('Home & Kitchen', 'ของใช้ในบ้านและเครื่องครัว');

-- 2. เพิ่มข้อมูลตัวอย่างตาราง suppliers (3 ระเบียน)
INSERT INTO suppliers (supplier_code, name, email, phone) VALUES
('SUP-001', 'TechSupply Co., Ltd.', 'contact@techsupply.com', '021234567'),
('SUP-002', 'FashionHub Thailand', 'sales@fashionhub.co.th', '029876543'),
('SUP-003', 'SmartHome Trading', 'info@smarthome.com', '034555888');

-- 0. บัญชีผู้ดูแลระบบ (admin) สำหรับ login — อีเมล admin@stockpro.com รหัสผ่านเริ่มต้น admin@stockpro.com1
--    เก็บเป็น bcrypt hash (salt rounds 10) ไม่เก็บรหัสผ่านจริง
--    เมื่อล้างข้อมูลด้วย schema.sql + seed.sql ให้บัญชีนี้กลับไปใช้รหัสเริ่มต้นด้วย
INSERT INTO users (email, password_hash, role) VALUES
('admin@stockpro.com', '$2b$10$p0/mi2G1Nu/q62vu/9sYY.Q59XHpBkIahr2I7yG476tzBX9oYxIm6', 'admin')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role);

-- 3. เพิ่มข้อมูลตัวอย่างตาราง products (3 ระเบียน)
INSERT INTO products (category_id, supplier_id, name, price, sku, stock_quantity) VALUES
(1, 1, 'Wireless Ergonomic Mouse', 890.00, 'SKU-ELE-001', 50),
(2, 2, 'Cotton Oversized T-Shirt', 350.00, 'SKU-APP-001', 120),
(3, 3, 'Stainless Steel Coffee Maker', 2490.00, 'SKU-HOM-001', 15);
