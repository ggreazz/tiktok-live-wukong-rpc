@echo off
chcp 65001 >nul
title 🐒 ศาลเจ้าพ่อเห้งเจีย (ซุนหงอคง 孙悟空) — TikTok Live Interactive 9:16
cd /d "%~dp0"

echo ============================================================
echo 🐒 ศาลเจ้าพ่อเห้งเจีย (ซุนหงอคง) TIKTOK LIVE INTERACTIVE
echo ============================================================

if not exist "node_modules" (
  echo 📦 กำลังติดตั้ง Node.js packages ครั้งแรก...
  call npm install
)

if not exist ".venv" (
  where python >nul 2>nul
  if %errorlevel% equ 0 (
    echo 🎙️ กำลังตั้งค่าระบบเสียงพากย์ภาษาไทย Python TTS ครั้งแรก...
    python -m venv .venv
    call .venv\Scripts\pip install gTTS soundfile numpy scipy sherpa-onnx
  )
)

echo 🚀 กำลังเปิดระบบเซิร์ฟเวอร์และหน้าจอ Live (พอร์ต 3000)...
start "" "http://localhost:3000/?v=%RANDOM%"
node server.js
pause
