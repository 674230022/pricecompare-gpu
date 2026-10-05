@echo off
echo ============================================
echo  PriceCompare GPU - Database Setup Script
echo ============================================
echo.

REM ตรวจสอบว่า MySQL อยู่ใน PATH หรือเป็น XAMPP
WHERE mysql >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    SET MYSQL_CMD=mysql
) ELSE IF EXIST "C:\xampp\mysql\bin\mysql.exe" (
    SET MYSQL_CMD=C:\xampp\mysql\bin\mysql.exe
) ELSE (
    echo [ERROR] ไม่พบ MySQL กรุณาติดตั้ง MySQL หรือ XAMPP ก่อน
    pause
    exit /b 1
)

echo [INFO] พบ MySQL: %MYSQL_CMD%
echo.
echo [INFO] กำลังสร้าง Database และตาราง...
echo.

SET /P DB_PASS=กรุณาใส่ Password MySQL (กด Enter ถ้าไม่มี Password): 

IF "%DB_PASS%"=="" (
    %MYSQL_CMD% -u root < database\schema.sql
) ELSE (
    %MYSQL_CMD% -u root -p%DB_PASS% < database\schema.sql
)

IF %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] สร้าง Database เสร็จสมบูรณ์!
    echo.
    echo Database: price_compare_db
    echo Tables: stores, products, prices, price_history, scraper_logs
    echo.
    echo ขั้นตอนถัดไป:
    echo 1. แก้ไข .env ใส่ค่า DB_PASSWORD ให้ถูกต้อง
    echo 2. รัน: npm run dev
) ELSE (
    echo.
    echo [ERROR] เกิดข้อผิดพลาด กรุณาตรวจสอบ:
    echo - MySQL Server กำลังทำงานอยู่หรือไม่?
    echo - Password ถูกต้องหรือไม่?
)

echo.
pause
