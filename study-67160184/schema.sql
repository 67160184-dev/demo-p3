-- สร้างฐานข้อมูล
-- สร้างฐานข้อมูลหากยังไม่มี
CREATE DATABASE IF NOT EXISTS product_db 
  -- ตั้งชุดอักขระเริ่มต้นเป็น utf8mb4 เพื่อรองรับอักษรหลายภาษา
  DEFAULT CHARACTER SET utf8mb4 
  -- กำหนดรูปแบบการเปรียบเทียบข้อความแบบ utf8mb4_unicode_ci
  COLLATE utf8mb4_unicode_ci;

-- เลือกฐานข้อมูลสำหรับคำสั่งถัดไป
USE product_db;

-- ลบตารางเก่าหากมีอยู่ (เรียงลำดับตาม Foreign Key Dependency)
-- ลบตารางเดิมก่อนสร้างข้อมูลชุดใหม่
DROP TABLE IF EXISTS products;
-- ลบตารางเดิมก่อนสร้างข้อมูลชุดใหม่
DROP TABLE IF EXISTS suppliers;
-- ลบตารางเดิมก่อนสร้างข้อมูลชุดใหม่
DROP TABLE IF EXISTS categories;
-- ไม่ลบ users? เพราะไม่อยากให้การล้างสินค้าไปลบบัญชี admin และรหัสผ่าน

-- 0. ตารางผู้ใช้ (users) — Phase 3: login ด้วย JWT ตามรูปแบบสัปดาห์ที่ 6 มีบทบาทเดียวคือ admin
--    ไม่ DROP ตารางนี้ (ใช้ IF NOT EXISTS); seed.sql จะตั้งรหัส admin กลับเป็นค่าเริ่มต้นเมื่อล้างข้อมูล
-- เริ่มสร้างตารางและกำหนดคอลัมน์
CREATE TABLE IF NOT EXISTS users (
    -- กำหนดคอลัมน์ id ชนิด INT
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- กำหนดคอลัมน์ email ชนิด VARCHAR และห้ามว่าง โดยห้ามซ้ำ
    email VARCHAR(100) NOT NULL UNIQUE,
    -- กำหนดคอลัมน์ password_hash ชนิด VARCHAR และห้ามว่าง
    password_hash VARCHAR(255) NOT NULL,
    -- กำหนดคอลัมน์ role ชนิด ENUM และห้ามว่าง
    role ENUM('admin') NOT NULL DEFAULT 'admin',
    -- กำหนดคอลัมน์ created_at ชนิด TIMESTAMP
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- จบโครงสร้างตารางและเลือกเอนจิน InnoDB
) ENGINE=InnoDB;

-- 1. ตารางหมวดหมู่สินค้า (categories)
-- เริ่มสร้างตารางและกำหนดคอลัมน์
CREATE TABLE categories (
    -- กำหนดคอลัมน์ id ชนิด INT
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- กำหนดคอลัมน์ name ชนิด VARCHAR และห้ามว่าง โดยห้ามซ้ำ
    name VARCHAR(100) NOT NULL UNIQUE,
    -- กำหนดคอลัมน์ description ชนิด TEXT
    description TEXT,
    -- กำหนดคอลัมน์ created_at ชนิด TIMESTAMP
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- จบโครงสร้างตารางและเลือกเอนจิน InnoDB
) ENGINE=InnoDB;

-- 2. ตารางผู้จัดจำหน่าย (suppliers)
-- เริ่มสร้างตารางและกำหนดคอลัมน์
CREATE TABLE suppliers (
    -- กำหนดคอลัมน์ id ชนิด INT
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- กำหนดคอลัมน์ supplier_code ชนิด VARCHAR และห้ามว่าง โดยห้ามซ้ำ
    supplier_code VARCHAR(20) NOT NULL UNIQUE,
    -- กำหนดคอลัมน์ name ชนิด VARCHAR และห้ามว่าง
    name VARCHAR(150) NOT NULL,
    -- กำหนดคอลัมน์ email ชนิด VARCHAR และห้ามว่าง โดยห้ามซ้ำ
    email VARCHAR(100) NOT NULL UNIQUE,
    -- กำหนดคอลัมน์ phone ชนิด VARCHAR
    phone VARCHAR(20),
    -- กำหนดคอลัมน์ created_at ชนิด TIMESTAMP
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- จบโครงสร้างตารางและเลือกเอนจิน InnoDB
) ENGINE=InnoDB;

-- 3. ตารางสินค้า (products) - ตารางหลัก
-- เริ่มสร้างตารางและกำหนดคอลัมน์
CREATE TABLE products (
    -- กำหนดคอลัมน์ id ชนิด INT
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- กำหนดคอลัมน์ category_id ชนิด INT และห้ามว่าง
    category_id INT NOT NULL,
    -- กำหนดคอลัมน์ supplier_id ชนิด INT
    supplier_id INT,
    -- กำหนดคอลัมน์ name ชนิด VARCHAR และห้ามว่าง
    name VARCHAR(150) NOT NULL,
    -- กำหนดคอลัมน์ price ชนิด DECIMAL และห้ามว่าง
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    -- กำหนดคอลัมน์ sku ชนิด VARCHAR และห้ามว่าง โดยห้ามซ้ำ
    sku VARCHAR(50) NOT NULL UNIQUE,
    -- กำหนดคอลัมน์ stock_quantity ชนิด INT และห้ามว่าง
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    -- กำหนดคอลัมน์ created_at ชนิด TIMESTAMP
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints & Foreign Keys
    -- ทำไม supplier_id ว่างได้แต่ category_id ว่างไม่ได้? เพราะสินค้าต้องอยู่ในหมวดหมู่เสมอ แต่ผู้จัดจำหน่ายอาจถูกลบไปแล้ว สินค้ายังต้องอยู่ต่อได้ นี่คือที่มาของ SET NULL ด้านล่าง
    -- ตั้งชื่อข้อกำหนดความสัมพันธ์ระหว่างตาราง
    CONSTRAINT fk_products_category 
        -- เชื่อมคอลัมน์นี้กับคีย์หลักของตารางอื่น
        FOREIGN KEY (category_id) REFERENCES categories(id) 
        -- กำหนดผลเมื่อระเบียนที่อ้างถึงถูกลบ
        ON DELETE CASCADE 
        -- กำหนดผลเมื่อคีย์ที่อ้างถึงถูกแก้ไข
        ON UPDATE CASCADE,
        
    -- ตั้งชื่อข้อกำหนดความสัมพันธ์ระหว่างตาราง
    CONSTRAINT fk_products_supplier 
        -- เชื่อมคอลัมน์นี้กับคีย์หลักของตารางอื่น
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) 
        -- กำหนดผลเมื่อระเบียนที่อ้างถึงถูกลบ
        ON DELETE SET NULL 
        -- กำหนดผลเมื่อคีย์ที่อ้างถึงถูกแก้ไข
        ON UPDATE CASCADE
-- จบโครงสร้างตารางและเลือกเอนจิน InnoDB
) ENGINE=InnoDB;
