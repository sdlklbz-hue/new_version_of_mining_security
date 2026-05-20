@echo off
chcp 65001 >nul
cd /d "%~dp0"
set MRA_ALLOW_UNAUTHENTICATED_ADMIN=true
set MRA_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
echo 启动后端 API...
python run_api.py
pause
