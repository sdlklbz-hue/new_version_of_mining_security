#!/usr/bin/env python
"""修正后端visualization.py的趋势数据，大幅增大波动"""
import sys

filepath = "packages/mining_risk_serve/src/mining_risk_serve/api/routers/visualization.py"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 替换基础趋势和波动参数 - 大幅增大
old = """        base_trend = np.linspace(15, 45, n_days)
        seasonal = 8 * np.sin(2 * np.pi * np.arange(n_days) / (365.25 / 4) * 12)
        weekly_pattern = 3 * np.sin(2 * np.pi * np.arange(n_days) / (7 / 4))
        noise = np.random.normal(0, 2.5, n_days)"""

new = """        base_trend = np.linspace(0, 300, n_days)
        seasonal = 100 * np.sin(2 * np.pi * np.arange(n_days) / (365.25 / 10) * 12)
        weekly_pattern = 60 * np.sin(2 * np.pi * np.arange(n_days) / (7 / 6))
        noise = np.random.normal(0, 60, n_days)"""

if old in content:
    content = content.replace(old, new, 1)
    print("OK: 基础趋势参数已替换")
else:
    print("WARN: 旧模式未找到，尝试查找当前内容...")
    # 查找当前文件内容
    import re
    m = re.search(r"base_trend = np\.linspace.*?\n.*?noise = np\.random\.normal.*?\n", content)
    if m:
        print(f"当前内容: {m.group()[:80]}...")
    sys.exit(1)

# 替换风险比例
old_risk = """        high_risk = (trend_values * np.random.uniform(0.15, 0.25, n_days)).astype(int)
        medium_risk = (trend_values * np.random.uniform(0.30, 0.40, n_days)).astype(int)
        low_risk = trend_values - high_risk - medium_risk"""

new_risk = """        high_risk_pcts = 0.15 + 0.25 * np.sin(2 * np.pi * np.arange(n_days) / 60) + np.random.normal(0, 0.10, n_days)
        high_risk_pcts = np.clip(high_risk_pcts, 0.02, 0.50)
        medium_risk_pcts = 0.30 + 0.30 * np.sin(2 * np.pi * np.arange(n_days) / 40 + 2.0) + np.random.normal(0, 0.12, n_days)
        medium_risk_pcts = np.clip(medium_risk_pcts, 0.03, 0.65)
        high_risk = (trend_values * high_risk_pcts).astype(int)
        medium_risk = (trend_values * medium_risk_pcts).astype(int)
        low_risk = trend_values - high_risk - medium_risk
        low_risk = np.maximum(low_risk, 0).astype(int)"""

if old_risk in content:
    content = content.replace(old_risk, new_risk, 1)
    print("OK: 风险比例已替换")
else:
    print("WARN: 旧风险比例未找到")
    sys.exit(1)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESS: 文件已更新")
