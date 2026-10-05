# PriceCompare GPU 🎮

เว็บไซต์เปรียบเทียบราคาการ์ดจอ (GPU) จากร้านค้าไอทีในประเทศไทย

## ร้านค้าที่รองรับ
- JIB
- Advice
- BaNANA IT
- iHAVECPU

## Tech Stack
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js + Express.js
- **Database**: MySQL / MariaDB (mysql2)
- **Scraper**: Playwright
- **Scheduler**: node-cron

## การติดตั้ง

### 1. Clone โปรเจค
```bash
git clone <repo-url>
cd pricecompare-gpu
```

### 2. ติดตั้ง Dependencies
```bash
npm install
npx playwright install chromium
```

### 3. ตั้งค่า Environment Variables
```bash
cp .env.example .env
# แก้ไข .env ให้ตรงกับ Database ของคุณ
```

### 4. สร้าง Database
```bash
# สร้าง Database ใน MySQL ก่อน
mysql -u root -p < database/schema.sql
```

### 5. รันเซิร์ฟเวอร์
```bash
# Development
npm run dev

# Production
npm start
```

เปิดเบราว์เซอร์ที่ `http://localhost:3000`

## โครงสร้างโปรเจค

```
pricecompare-gpu/
├── src/
│   ├── app.js                  # Express Server หลัก
│   ├── config/
│   │   └── database.js         # MySQL Connection
│   ├── routes/
│   │   ├── gpuRoutes.js        # GPU API Routes
│   │   ├── storeRoutes.js      # Store API Routes
│   │   └── historyRoutes.js    # History API Routes
│   ├── controllers/
│   │   └── gpuController.js    # Business Logic
│   ├── scraper/
│   │   ├── jib.js              # JIB Scraper
│   │   ├── advice.js           # Advice Scraper
│   │   ├── banana.js           # BaNANA Scraper
│   │   └── ihavecpu.js         # iHAVECPU Scraper
│   ├── scheduler/
│   │   └── priceScheduler.js   # Cron Job Scheduler
│   └── utils/
│       ├── productMatcher.js   # GPU Product Matching
│       └── logger.js           # Logging Utility
├── public/
│   ├── index.html              # หน้าแรก Dashboard
│   ├── gpu.html                # หน้ารายการ GPU
│   ├── compare.html            # หน้าเปรียบเทียบราคา
│   ├── history.html            # หน้าประวัติราคา
│   ├── admin.html              # Admin Dashboard
│   ├── css/styles.css          # Global Styles
│   └── js/
│       ├── app.js              # หน้าแรก JS
│       ├── gpu.js              # GPU List JS
│       ├── compare.js          # Compare JS
│       └── history.js          # History JS
├── database/
│   └── schema.sql              # Database Schema
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## REST API

| Method | Endpoint | คำอธิบาย |
|--------|----------|-----------|
| GET | `/api/gpus` | รายการ GPU ทั้งหมด |
| GET | `/api/gpus/:id` | รายละเอียด GPU |
| GET | `/api/gpus/search?q=RTX5070` | ค้นหา GPU |
| GET | `/api/gpus/:id/prices` | ราคาแต่ละร้าน |
| GET | `/api/gpus/:id/history` | ประวัติราคา |
| GET | `/api/stores` | รายการร้านค้า |
| GET | `/api/status` | สถานะระบบ |

## หมายเหตุ

- ระบบ Scraper ทำงานอัตโนมัติทุก 60 นาที
- ไม่มีระบบสั่งซื้อ — เมื่อกด "ดูสินค้า" จะเปิดไปยังร้านค้าโดยตรง
- ห้ามใช้ระบบ bypass CAPTCHA หรือ Proxy Rotation
