"""
将 datasets/enterprise_db 下企业档案 JSON（嵌套「详细数据」）转为决策/预测 API 可接受的扁平记录。

预测工作流中的 normalize_enterprise_record 只识别平铺中英文字段，无法直接消费
{ "详细数据": { "企业基本信息": [...], ... } } 结构。
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, MutableMapping, Optional

# 与 visualization._record_sort_key 保持一致
_SORT_KEYS = ("MAIN_ADDR", "修改时间", "时间戳", "创建时间", "报告时间", "REPORT_TIME_CHAR")


def _as_float(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _record_sort_key(record: Dict[str, Any]) -> float:
    for key in _SORT_KEYS:
        value = _as_float(record.get(key))
        if value is not None:
            return value
    for key in _SORT_KEYS:
        text = record.get(key)
        if text not in (None, ""):
            return 0.0
    return 0.0


def _latest_record(records: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(records, list):
        return None
    candidates = [r for r in records if isinstance(r, dict)]
    if not candidates:
        return None
    return max(candidates, key=_record_sort_key)


def _pick_main_address(records: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(records, list):
        return None
    mains = [r for r in records if isinstance(r, dict) and r.get("MAIN_ADDR") in (1, "1", True)]
    if mains:
        return max(mains, key=_record_sort_key)
    return _latest_record(records)


def _merge_dict(target: MutableMapping[str, Any], source: Mapping[str, Any]) -> None:
    for key, value in source.items():
        if value in (None, ""):
            continue
        target[key] = value


def _map_industry_code(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    text = str(value).strip()
    code_map = {
        "A": "专用设备制造业",
        "E": "其他制造业",
        "G": "铁路、船舶、航空航天和其他运输设备制造业",
        "H": "铁路、船舶、航空航天和其他运输设备制造业",
        "J": "电力、热力生产和供应业",
        "L": "其他制造业",
        "M": "其他制造业",
        "N": "废弃资源综合利用业",
        "O": "装卸搬运和仓储业",
    }
    if text in code_map:
        return code_map[text]
    if "," in text:
        first = text.split(",", 1)[0].strip()
        return code_map.get(first, text)
    return text


def _apply_uppercase_aliases(record: MutableMapping[str, Any]) -> None:
    aliases = {
        "INDUS_TYPE_CLASS_NAME": "国民经济门类",
        "INDUS_TYPE_LAGRE_NAME": "国民经济大类",
        "INDUS_TYPE_MIDDLE_NAME": "国民经济中类",
        "INDUS_TYPE_SMALL_NAME": "国民经济小类",
        "DUST_GANSHI_NUM": "干式除尘系统数量",
        "DUST_SHISHI_NUM": "湿式除尘系统数量",
        "DUST_WORK_NUM": "除尘作业次数",
        "GAOLU_NUM": "高炉数量",
        "ZHUANLU_NUM": "转炉数量",
        "DIANLU_NUM": "电炉数量",
    }
    for src, dst in aliases.items():
        if src in record and not record.get(dst):
            record[dst] = record[src]


def _aggregate_risk_and_checks(sections: Mapping[str, Any], flat: MutableMapping[str, Any]) -> None:
    risk_hist = _latest_record(sections.get("企业风险报告历史"))
    if risk_hist:
        total = _as_float(risk_hist.get("风险数量"))
        major = _as_float(risk_hist.get("重大风险数量"))
        larger = _as_float(risk_hist.get("较大风险数量"))
        if total is not None:
            flat.setdefault("风险数量", int(total))
            flat.setdefault("总风险数", int(total))
        if major is not None:
            flat.setdefault("重大风险数量", int(major))
            flat.setdefault("D级风险数", int(major))
        if larger is not None:
            flat.setdefault("较大风险数量", int(larger))
            flat.setdefault("C级风险数", int(larger))
        if risk_hist.get("企业是否有较大以上安全生产风险") not in (None, ""):
            flat.setdefault(
                "是否发现问题隐患 0-否 1-是",
                1 if int(float(risk_hist["企业是否有较大以上安全生产风险"])) else 0,
            )

    checks = sections.get("企业日常检查记录")
    if isinstance(checks, list) and checks:
        flat.setdefault("检查总次数", len(checks))
        trouble = sum(
            1
            for item in checks
            if isinstance(item, dict) and int(float(item.get("TROUBLE_FLAG") or 0)) == 1
        )
        flat.setdefault("检查发现问题次数", trouble)
        flat.setdefault("隐患总数", trouble)


def flatten_enterprise_detail(detail: Mapping[str, Any]) -> Dict[str, Any]:
    """把企业库单文件 JSON 转为预测/决策请求体 data 字段可用的平铺字典。"""
    flat: Dict[str, Any] = {}
    name = str(detail.get("企业名称") or "").strip()
    if name:
        flat["企业名称"] = name

    sections = detail.get("详细数据")
    if not isinstance(sections, dict):
        return flat

    merge_order = (
        "企业目录",
        "企业国民经济分类",
        "企业基本信息",
        "企业行业分类",
        "企业安全信息",
        "企业生产状态记录",
        "企业生产经营地址",
        "企业风险报告历史",
    )
    for section in merge_order:
        records = sections.get(section)
        if section == "企业生产经营地址":
            picked = _pick_main_address(records)
        else:
            picked = _latest_record(records)
        if picked:
            _merge_dict(flat, picked)

    prod = _latest_record(sections.get("企业生产状态记录"))
    if prod and prod.get("生产状态") not in (None, ""):
        flat.setdefault("生产状态", prod.get("生产状态"))
        flat.setdefault("rh_production_status", prod.get("生产状态"))

    _aggregate_risk_and_checks(sections, flat)
    _apply_uppercase_aliases(flat)

    if flat.get("行业监管大类"):
        mapped = _map_industry_code(flat.get("行业监管大类"))
        if mapped:
            flat["行业监管大类"] = mapped

    ent_id = (
        flat.get("统一社会信用代码")
        or flat.get("主键ID")
        or flat.get("企业ID")
        or name
    )
    if ent_id:
        flat["企业ID"] = str(ent_id)
        flat["enterprise_id"] = str(ent_id)

    coord = None
    addr_records = sections.get("企业生产经营地址")
    picked_addr = _pick_main_address(addr_records) or _latest_record(addr_records)
    if picked_addr:
        lng = _as_float(picked_addr.get("经度"))
        lat = _as_float(picked_addr.get("纬度"))
        if lng is not None and lat is not None:
            flat.setdefault("经度", lng)
            flat.setdefault("纬度", lat)

    return flat


_ID_FIELDS = (
    "统一社会信用代码",
    "企业ID",
    "enterprise_id",
    "主键ID",
    "ENTERPRISE_ID",
)


def collect_enterprise_lookup_keys(detail: Mapping[str, Any]) -> List[str]:
    """收集企业档案可用于关联决策记录的主键（名称、信用代码等）。"""
    keys: List[str] = []
    seen: set[str] = set()

    def add(value: Any) -> None:
        text = str(value or "").strip()
        if not text or text in seen:
            return
        seen.add(text)
        keys.append(text)

    add(detail.get("企业名称"))
    sections = detail.get("详细数据")
    if isinstance(sections, dict):
        for records in sections.values():
            if not isinstance(records, list):
                continue
            for record in records:
                if not isinstance(record, dict):
                    continue
                add(record.get("企业名称"))
                for field in _ID_FIELDS:
                    add(record.get(field))
    return keys
