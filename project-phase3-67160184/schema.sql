-- สร้างฐานข้อมูล
CREATE DATABASE IF NOT EXISTS product_db 
  DEFAULT CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE product_db;

-- ลบตารางเก่าหากมีอยู่ (เรียงลำดับตาม Foreign Key Dependency)
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS categories;
-- ไม่ลบ users? เพราะไม่อยากให้การล้างสินค้าไปลบบัญชี admin และรหัสผ่าน

-- 0. ตารางผู้ใช้ (users) — Phase 3: login ด้วย JWT ตามรูปแบบสัปดาห์ที่ 6 มีบทบาทเดียวคือ admin
--    ไม่ DROP ตารางนี้ (ใช้ IF NOT EXISTS); seed.sql จะตั้งรหัส admin กลับเป็นค่าเริ่มต้นเมื่อล้างข้อมูล
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin') NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 1. ตารางหมวดหมู่สินค้า (categories)
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. ตารางผู้จัดจำหน่าย (suppliers)
CREATE TABLE suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. ตารางสินค้า (products) - ตารางหลัก
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NOT NULL,
    supplier_id INT,
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    sku VARCHAR(50) NOT NULL UNIQUE,
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints & Foreign Keys
    -- ทำไม supplier_id ว่างได้แต่ category_id ว่างไม่ได้? เพราะสินค้าต้องอยู่ในหมวดหมู่เสมอ แต่ผู้จัดจำหน่ายอาจถูกลบไปแล้ว สินค้ายังต้องอยู่ต่อได้ นี่คือที่มาของ SET NULL ด้านล่าง
    CONSTRAINT fk_products_category 
        FOREIGN KEY (category_id) REFERENCES categories(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
        
    CONSTRAINT fk_products_supplier 
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
) ENGINE=InnoDB;
