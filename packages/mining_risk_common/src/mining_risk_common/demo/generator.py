"""
批量生成演示用企业模拟数据，并按风险等级导出 CSV。
"""

from __future__ import annotations

import csv
import random
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

from mining_risk_common.demo.data import DEMO_ENTERPRISES

# 风险等级 1（低）→ 4（高），对应四色预警
RISK_LEVEL_LABELS: Dict[int, str] = {1: "蓝", 2: "黄", 3: "橙", 4: "红"}

SCENARIO_CONFIG: Dict[str, Dict[str, Any]] = {
    "chemical": {
        "行业监管大类": "危险化学品",
        "国民经济大类": "化学原料和化学制品制造业",
        "管理类别基数": 1000,
        "名称前缀": ["宏达", "瑞祥", "远东", "盛泰", "恒源", "新能", "华安", "金源"],
        "名称后缀": ["危化品储运", "精细化工", "石化仓储", "气体充装", "涂料制造", "医药中间体"],
        "风险描述": {
            1: "例行巡检未发现异常，可燃气体浓度处于正常范围，消防设施完好",
            2: "2号储罐区气体检测仪偶发低报，已安排校验，通风系统运行正常",
            3: "储罐区可燃气体浓度间歇性升高至报警值附近，需加强通风与在线监测",
            4: "储罐区可燃气体浓度异常升高逼近爆炸下限，通风系统故障停运",
        },
        "管控措施": {
            1: "维持日常巡检与气体检测记录归档",
            2: "48小时内完成检测仪校验并复核通风联锁",
            3: "加强储罐区巡检频次，备妥应急切断与通风备用设备",
            4: "立即切断储罐进料阀门，启动备用通风系统，撤离非必要人员",
        },
    },
    "metallurgy": {
        "行业监管大类": "冶金",
        "国民经济大类": "黑色金属冶炼和压延加工业",
        "管理类别基数": 2000,
        "名称前缀": ["金泰", "宝钢", "龙腾", "华冶", "鑫钢", "中联", "北方", "扬子"],
        "名称后缀": ["钢铁炼铁厂", "轧钢厂", "铸造车间", "冶炼分厂", "焦化厂", "烧结厂"],
        "风险描述": {
            1: "高炉运行平稳，煤气系统压力与成分均在正常区间",
            2: "TRT机组振动值略高但在可控范围，已列入维保计划",
            3: "高炉煤气管道压力波动异常，炉顶温度多次逼近警戒值",
            4: "煤气管道压力剧烈波动，TRT透平机振动超标，炉顶温度连续超警",
        },
        "管控措施": {
            1: "按规程开展炉顶与煤气系统日常点检",
            2: "安排TRT机组专项维保并复核振动监测阈值",
            3: "降低鼓风量并增加炉顶打水，密切监控煤气成分",
            4: "降低鼓风量至正常值85%以下，增打水频率，煤气防护站待命",
        },
    },
    "dust": {
        "行业监管大类": "粉尘涉爆",
        "国民经济大类": "金属制品业",
        "管理类别基数": 3000,
        "名称前缀": ["鑫源", "联创", "宏粉尘", "顺达", "新铝", "泰和", "瑞丰", "广益"],
        "名称后缀": ["铝镁粉尘制品厂", "抛光车间", "木粉尘加工", "粮食加工", "纺织除尘车间"],
        "风险描述": {
            1: "湿式除尘运行正常，粉尘清扫制度执行到位，电气防爆符合要求",
            2: "部分工位粉尘浓度监测偏高，湿式除尘水位需定期复核",
            3: "抛光车间粉尘浓度上升，除尘水位偏低，防爆电气个别点位待整改",
            4: "粉尘浓度达爆炸极限区间，湿式除尘失效，非防爆电气仍在运行",
        },
        "管控措施": {
            1: "保持每日粉尘清扫与除尘系统水位记录",
            2: "一周内完成高浓度工位除尘能力评估与增湿措施",
            3: "暂停高风险工位作业，补充除尘水位并整改防爆电气",
            4: "立即停止产尘作业，切断非防爆电源，疏散人员并设警戒区",
        },
    },
}

# CSV 列顺序：通用字段 + 场景字段
COMMON_COLUMNS: List[str] = [
    "场景",
    "企业ID",
    "企业名称",
    "管理类别",
    "风险等级",
    "预测风险等级",
    "是否发生事故",
    "安全生产标准化建设情况",
    "企业职工总人数",
    "专职安全生产管理人员数",
    "兼职安全生产管理人员数",
    "上一年经营收入",
    "固定资产",
    "是否发现问题隐患 0-否 1-是",
    "具体风险描述",
    "管控措施",
    "安全等级",
    "企业规模",
    "行业监管大类",
    "国民经济大类",
]

SCENARIO_EXTRA_COLUMNS: Dict[str, List[str]] = {
    "chemical": ["危化品储罐数量", "重大危险源数量", "消防设施完好率", "气体检测仪在线率"],
    "metallurgy": [
        "高炉容积_m3",
        "煤气柜容量_万m3",
        "铁水包在线数量",
        "炉壳温度测点完好率",
        "煤气报警器覆盖率",
    ],
    "dust": [
        "抛光工位数量",
        "湿式除尘器数量",
        "粉尘清扫制度执行率",
        "防爆电气覆盖率",
        "静电接地完好率",
    ],
}

SAFETY_LEVEL_BY_RISK: Dict[int, str] = {1: "A级", 2: "B级", 3: "C级", 4: "D级"}
SCALE_BY_RISK: Dict[int, str] = {1: "大型", 2: "中型", 3: "中型", 4: "小型"}


def _scale_numeric(base: float, risk_level: int, spread: float, rng: random.Random) -> float:
    """风险越高，安全设施类指标越低；规模类指标随等级波动。"""
    factor = 1.15 - risk_level * 0.12
    jitter = rng.uniform(-spread, spread)
    return round(max(0.05, min(1.0, base * factor + jitter)), 2)


def _build_enterprise(
    scenario_id: str,
    risk_level: int,
    index: int,
    rng: random.Random,
) -> Dict[str, Any]:
    cfg = SCENARIO_CONFIG[scenario_id]
    prefix = cfg["名称前缀"][index % len(cfg["名称前缀"])]
    suffix = cfg["名称后缀"][(index // len(cfg["名称前缀"])) % len(cfg["名称后缀"])]
    ent_id = f"{scenario_id[:4].upper()}-{risk_level}-{index:03d}"
    staff = rng.randint(40, 800) if risk_level <= 2 else rng.randint(30, 400)
    full_time_safety = max(1, int(staff / rng.randint(80, 200)))
    accident = 1 if risk_level >= 4 and rng.random() > 0.35 else (1 if risk_level == 3 and rng.random() > 0.7 else 0)
    hazard = 1 if risk_level >= 2 else 0
    std_build = max(1, 5 - risk_level + rng.randint(-1, 0))

    row: Dict[str, Any] = {
        "场景": scenario_id,
        "企业ID": ent_id,
        "企业名称": f"{prefix}{suffix}（模拟-{RISK_LEVEL_LABELS[risk_level]}）",
        "管理类别": cfg["管理类别基数"] + risk_level * 10 + index,
        "风险等级": risk_level,
        "预测风险等级": RISK_LEVEL_LABELS[risk_level],
        "是否发生事故": accident,
        "安全生产标准化建设情况": std_build,
        "企业职工总人数": staff,
        "专职安全生产管理人员数": full_time_safety,
        "兼职安全生产管理人员数": max(0, full_time_safety // 2),
        "上一年经营收入": rng.randint(500, 50000) if risk_level <= 2 else rng.randint(300, 8000),
        "固定资产": rng.randint(1000, 200000),
        "是否发现问题隐患 0-否 1-是": hazard,
        "具体风险描述": cfg["风险描述"][risk_level],
        "管控措施": cfg["管控措施"][risk_level],
        "安全等级": SAFETY_LEVEL_BY_RISK[risk_level],
        "企业规模": SCALE_BY_RISK[risk_level],
        "行业监管大类": cfg["行业监管大类"],
        "国民经济大类": cfg["国民经济大类"],
    }

    if scenario_id == "chemical":
        row.update(
            {
                "危化品储罐数量": rng.randint(2, 20) if risk_level >= 3 else rng.randint(1, 8),
                "重大危险源数量": max(0, risk_level - 1 + rng.randint(0, 2)),
                "消防设施完好率": _scale_numeric(0.95, risk_level, 0.05, rng),
                "气体检测仪在线率": _scale_numeric(0.92, risk_level, 0.06, rng),
            }
        )
    elif scenario_id == "metallurgy":
        row.update(
            {
                "高炉容积_m3": rng.choice([800, 1200, 2000, 3200]),
                "煤气柜容量_万m3": rng.randint(5, 20),
                "铁水包在线数量": rng.randint(2, 12),
                "炉壳温度测点完好率": _scale_numeric(0.9, risk_level, 0.05, rng),
                "煤气报警器覆盖率": _scale_numeric(0.93, risk_level, 0.04, rng),
            }
        )
    else:
        row.update(
            {
                "抛光工位数量": rng.randint(4, 24) if risk_level >= 3 else rng.randint(2, 10),
                "湿式除尘器数量": rng.randint(1, 6),
                "粉尘清扫制度执行率": _scale_numeric(0.88, risk_level, 0.08, rng),
                "防爆电气覆盖率": _scale_numeric(0.9, risk_level, 0.07, rng),
                "静电接地完好率": _scale_numeric(0.88, risk_level, 0.06, rng),
            }
        )
    return row


def generate_mock_enterprises(
    *,
    per_level_per_scenario: int = 10,
    scenarios: Sequence[str] = ("chemical", "metallurgy", "dust"),
    seed: int = 42,
    include_builtin: bool = True,
) -> List[Dict[str, Any]]:
    """生成模拟企业列表，按风险等级升序、场景次序排列。"""
    rng = random.Random(seed)
    rows: List[Dict[str, Any]] = []

    if include_builtin:
        for scenario_id, record in DEMO_ENTERPRISES.items():
            builtin = dict(record)
            builtin["场景"] = scenario_id
            level = int(builtin.get("风险等级", 3))
            builtin["预测风险等级"] = RISK_LEVEL_LABELS.get(level, "橙")
            rows.append(builtin)

    for risk_level in range(1, 5):
        for scenario_id in scenarios:
            for i in range(per_level_per_scenario):
                rows.append(_build_enterprise(scenario_id, risk_level, i + 1, rng))

    rows.sort(key=lambda r: (int(r["风险等级"]), str(r["场景"]), str(r["企业ID"])))
    return rows


def columns_for_scenario(scenario_id: str, include_meta: bool = True) -> List[str]:
    """返回单场景 CSV 列（不含其它场景专属空列）。"""
    cols = list(COMMON_COLUMNS)
    if not include_meta:
        cols = [c for c in cols if c != "场景"]
    cols.extend(SCENARIO_EXTRA_COLUMNS.get(scenario_id, []))
    return cols


def csv_columns_for_rows(rows: Iterable[Dict[str, Any]]) -> List[str]:
    """根据行内容推导完整列顺序（合并版，含全部场景字段）。"""
    seen: Dict[str, None] = {}
    for col in COMMON_COLUMNS:
        seen[col] = None
    for extra in SCENARIO_EXTRA_COLUMNS.values():
        for col in extra:
            seen[col] = None
    for row in rows:
        for key in row:
            if key not in seen:
                seen[key] = None
    return list(seen.keys())


def write_csv(path: Path, rows: List[Dict[str, Any]], columns: List[str] | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = columns or csv_columns_for_rows(rows)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def export_mock_csv(
    output_dir: str | Path,
    *,
    per_level_per_scenario: int = 10,
    seed: int = 42,
) -> Dict[str, Path]:
    """
    导出模拟数据 CSV：
    - mock_enterprises_all.csv：全部记录，按风险等级从低到高排序
    - mock_enterprises_risk_level_{1-4}.csv：按等级分文件
    - mock_enterprises_{scenario}.csv：按场景分文件（同样按等级排序）
    """
    out = Path(output_dir)
    all_rows = generate_mock_enterprises(
        per_level_per_scenario=per_level_per_scenario,
        seed=seed,
    )
    columns = csv_columns_for_rows(all_rows)
    paths: Dict[str, Path] = {}

    all_path = out / "mock_enterprises_all.csv"
    write_csv(all_path, all_rows, columns)
    paths["all"] = all_path

    for level in range(1, 5):
        level_rows = [r for r in all_rows if int(r["风险等级"]) == level]
        level_path = out / f"mock_enterprises_risk_level_{level}.csv"
        write_csv(level_path, level_rows, columns)
        paths[f"level_{level}"] = level_path

    for scenario_id in ("chemical", "metallurgy", "dust"):
        scenario_rows = [r for r in all_rows if r["场景"] == scenario_id]
        scenario_path = out / f"mock_enterprises_{scenario_id}.csv"
        write_csv(scenario_path, scenario_rows, columns_for_scenario(scenario_id, include_meta=False))
        paths[scenario_id] = scenario_path

    return paths
