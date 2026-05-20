@echo off
chcp 65001 >nul
echo 启动前端 Vite 开发服务器...
echo.
cd /d "c:\Users\sdlkl\Desktop\程序\合并\mining_risk_agent-master\frontend"
echo 当前目录: %cd%
echo.
npm run dev
pause