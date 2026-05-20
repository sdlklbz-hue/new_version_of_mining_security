
<#
工矿企业风险预警智能体 - 前端启动脚本
#>

$ErrorActionPreference = "Stop"

# 设置工作目录
$projectPath = $PWD.Path
Write-Host "📁 项目目录: $projectPath" -ForegroundColor Cyan

# 进入前端目录
Set-Location "$projectPath\frontend"
Write-Host "🔧 进入前端目录..." -ForegroundColor Cyan

# 安装依赖（如果 node_modules 不存在）
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 安装前端依赖..." -ForegroundColor Cyan
    npm install
    Write-Host "✅ 前端依赖安装成功" -ForegroundColor Green
}

# 启动前端服务
Write-Host "🚀 启动前端服务... (端口: 5173)" -ForegroundColor Green
Write-Host "🌐 访问地址: http://localhost:5173" -ForegroundColor Yellow
npm run dev
