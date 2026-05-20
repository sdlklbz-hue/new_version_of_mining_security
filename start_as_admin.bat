@echo off
chcp 65001 >nul

:: ============================================
:: 工矿企业风险预警智能体 - 一键启动脚本
:: 自动请求管理员权限
:: ============================================

:: 检查是否已经是管理员，如果不是则自动提权
fltmc >nul 2>&1 || (
    echo 正在请求管理员权限...
    mshta "javascript: var shell = new ActiveXObject('Shell.Application'); shell.ShellExecute('%~s0', '', '', 'runas', 1); close();"
    exit /b
)

echo.
echo ============================================
echo   工矿企业风险预警智能体
echo   管理员模式启动
echo ============================================
echo.

:: 1. 停止 Sangfor VPN 服务（Winsock 破坏者）
echo [1/5] 停止 Sangfor VPN 服务...
net stop SangforPWEx /y >nul 2>&1
net stop SangforSP /y >nul 2>&1
echo       [OK] Sangfor 服务已停止
echo.

:: 2. 重置 Winsock
echo [2/5] 重置 Winsock 目录...
netsh winsock reset >nul 2>&1
echo       [OK] Winsock 已重置
echo.

:: 等待系统生效
echo [3/5] 等待网络栈恢复...
ping -n 4 127.0.0.1 >nul
echo       [OK]
echo.

:: 3. 设置环境变量
set MRA_ALLOW_UNAUTHENTICATED_ADMIN=true
set MRA_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

cd /d "%~dp0"

:: 4. 启动后端
echo [4/5] 启动后端 FastAPI (端口 8000)...
start "MiningRiskAgent-Backend" cmd /c "title Backend (MiningRiskAgent) && python run_api.py"
echo       后端启动中...

:: 等待后端初始化
timeout /t 6 /nobreak >nul

:: 5. 启动前端
echo [5/5] 启动前端 Vite...
cd frontend
start "MiningRiskAgent-Frontend" cmd /c "title Frontend (MiningRiskAgent) && npm run dev"
cd ..
echo       前端启动中 (端口 5173)...
echo.

echo ============================================
echo   所有服务已启动！
echo.
echo   API 后端: http://localhost:8000
echo   API 文档: http://localhost:8000/docs
echo   前端页面: http://localhost:5173
echo.
echo   关闭方式：关闭对应的 CMD 窗口
echo ============================================
echo.
pause
