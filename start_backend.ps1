
<#
工矿企业风险预警智能体 - 后端启动脚本
使用前请确保已创建并激活虚拟环境
#>

$ErrorActionPreference = "Stop"

# 设置工作目录
$projectPath = $PWD.Path
Write-Host "📁 项目目录: $projectPath" -ForegroundColor Cyan

# 检查虚拟环境
if (-not (Test-Path "venv")) {
    Write-Host "❌ 虚拟环境不存在，正在创建..." -ForegroundColor Yellow
    python -m venv venv
    Write-Host "✅ 虚拟环境创建成功" -ForegroundColor Green
}

# 激活虚拟环境
Write-Host "🔧 激活虚拟环境..." -ForegroundColor Cyan
.\venv\Scripts\Activate.ps1

# 安装依赖（如果未安装）
if (-not (Get-Command "uvicorn" -ErrorAction SilentlyContinue)) {
    Write-Host "📦 安装依赖..." -ForegroundColor Cyan
    pip install -r requirements.txt
    Write-Host "✅ 依赖安装成功" -ForegroundColor Green
}

# 启动后端服务
Write-Host "🚀 启动后端服务... (端口: 8000)" -ForegroundColor Green
Write-Host "📝 API文档: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "❤️ 健康检查: http://localhost:8000/health" -ForegroundColor Yellow
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
