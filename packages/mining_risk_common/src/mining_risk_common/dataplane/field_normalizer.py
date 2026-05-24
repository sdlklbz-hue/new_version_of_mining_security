"""
API 输入字段标准化。

前端演示数据使用中文展示字段，训练与持久化 pipeline 使用 config.yaml 中的
英文训练字段。这里在进入 sklearn pipeline 前做一次轻量规范化：
- 英文字段直通且优先级最高
- 常见中文字段映射为英文训练字段
- 按训练配置补齐 pipeline transform 所需列，避免 ColumnTransformer 缺列失败
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Optional, Set

from mining_risk_common.utils.config import get_config


FIELD_ALIASES: Dict[str, List[str]] = {
    "enterprise_id": ["企业ID", "企业id", "企业编号", "统一社会信用代码", "社会统一信用代码"],
    "enterprise_name": ["企业名称", "公司名称", "单位名称"],
    "staff_num": ["企业职工总人数", "职工总人数", "员工人数", "从业人数"],
    "fulltime_safety_num": ["专职安全生产管理人员数", "专职安全管理人员数"],
    "parttime_safety_num": ["兼职安全生产管理人员数", "兼职安全管理人员数"],
    "safety_num": ["安全管理人员数量", "安全生产管理人员数"],
    "safety_dept_num": ["部门安全管理人员数量", "安全管理部门人数"],
    "fulltime_cert_num": ["专职安全管理人持证员数", "专职持证人数"],
    "parttime_cert_num": ["兼职安全管理人持证员数", "兼职持证人数"],
    "special_work_cert_num": ["特种作业持证人数", "特种作业人员持证人数"],
    "last_year_income": ["上一年经营收入", "上年经营收入", "年经营收入"],
    "fixed_assets": ["固定资产", "固定资产总额"],
    "insure_money": ["投保金额"],
    "injury_insurance": ["工伤保险支出", "工伤保险支出（万元）"],
    "insure_num": ["投保人数"],
    "last_year_turnover": ["上一年人员流动率", "上年人员流动率"],
    "safety_build": ["安全生产标准化建设情况", "安全标准化等级"],
    "supervision_large": ["行业监管大类", "监管行业大类"],
    "indus_type_class": ["国民经济门类"],
    "indus_type_large": ["国民经济大类"],
    "indus_type_middle": ["国民经济中类"],
    "indus_type_small": ["国民经济小类"],
    "above_designated": ["是否规上企业"],
    "if_insure": ["是否投保"],
    "if_comply_formality": ["是否履行三同时手续"],
    "factory_in_factory": ["厂中厂"],
    "if_valid": ["数据有效标识"],
    "risk_company_flag": ["风险重点企业"],
    "risk_company_key_flag": ["关键风险企业"],
    "risk_whp_flag": ["危化品企业标识"],
    "risk_whp_use_flag": ["危险化学品使用"],
    "risk_finite_key_flag": ["有限空间关键企业"],
    "latest_risk_report_id": ["最近风险报告ID", "风险报告ID"],
    "risk_accident_flag": ["是否发生事故", "曾发生事故"],
    "has_risk_item": ["是否发现问题隐患 0-否 1-是", "是否发现问题隐患", "有风险项"],
    "dangerous_chemical_enterprise": ["危险化学品企业", "危化品企业"],
    "is_major_hazards": ["重大危险源", "是否重大危险源"],
    "is_explosive_dust": ["爆炸性粉尘企业", "粉尘涉爆企业"],
    "is_finite_space": ["有限空间企业", "是否有限空间"],
    "confined_spaces_enterprise": ["有限空间作业企业"],
    "is_metal_smelter": ["金属冶炼企业", "冶金企业"],
    "is_ammonia_refrigerating": ["氨制冷企业"],
    "is_gas_company": ["燃气企业"],
    "dust_ganshi_num": ["干式除尘系统数量"],
    "dust_shishi_num": ["湿式除尘系统数量", "湿式除尘器数量"],
    "dust_clear_count": ["除尘作业次数", "粉尘清扫次数"],
    "gaolu_num": ["高炉数量"],
    "zhuanlu_num": ["转炉数量"],
    "dianlu_num": ["电炉数量"],
    "risk_total_count": ["总风险数", "风险总数"],
    "risk_level_a_count": ["A级风险数"],
    "risk_level_b_count": ["B级风险数"],
    "risk_level_c_count": ["C级风险数"],
    "risk_level_d_count": ["D级风险数"],
    "risk_with_accident_count": ["曾发事故的风险数"],
    "check_total_count": ["检查总次数"],
    "check_trouble_count": ["检查发现问题次数"],
    "trouble_total_count": ["隐患总数", "问题隐患总数"],
    "trouble_level_1_count": ["一般隐患数"],
    "trouble_level_2_count": ["重大隐患数"],
    "trouble_unrectified_count": ["未整改隐患数"],
    "writ_total_count": ["文书总数"],
    "writ_from_case_count": ["立案文书数"],
    "writ_from_check_count": ["检查文书数"],
    "total_penalty_money": ["处罚金额", "总处罚金额"],
    "dir_longitude": ["经度", "企业经度"],
    "dir_latitude": ["纬度", "企业纬度"],
    "cf_source": ["数据来源", "来源"],
    "report_time": ["报告时间", "上报时间"],
    "business_status": ["经营状态"],
    "rh_production_status": ["生产状态"],
}


SCENARIO_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "chemical": {
        "supervision_large": "危险化学品",
        "indus_type_large": "化学原料和化学制品制造业",
        "dangerous_chemical_enterprise": 1,
        "risk_whp_flag": 1,
        "risk_whp_use_flag": 1,
    },
    "metallurgy": {
        "supervision_large": "冶金",
        "indus_type_large": "黑色金属冶炼和压延加工业",
        "is_metal_smelter": 1,
    },
    "dust": {
        "supervision_large": "粉尘涉爆",
        "indus_type_large": "金属制品业",
        "is_explosive_dust": 1,
    },
}


@dataclass
class NormalizationReport:
    """字段规范化过程的可审计报告。

    Attributes:
        mapped_fields: 由中文别名映射到英文字段名的记录，格式 ``别名->canonical``。
        defaulted_fields: 因缺失而被填充默认值的英文字段名列表。
    """

    mapped_fields: List[str]
    defaulted_fields: List[str]


def normalize_enterprise_record(
    raw: Mapping[str, Any],
    enterprise_id: Optional[str] = None,
    scenario_id: Optional[str] = None,
) -> tuple[Dict[str, Any], NormalizationReport]:
    """将 API/前端输入规范化为训练流水线所需的英文字段字典。

    处理顺序：补全 ``enterprise_id`` → 中英文字段别名映射 → 场景默认值 →
    演示字段派生 → 按 ``config.features`` 补齐 pipeline 必填列。

    Args:
        raw (Mapping[str, Any]): 原始请求体或单行企业数据（可含中文键名）。
        enterprise_id (Optional[str]): 路径或查询参数中的企业 ID，用于补全 ``enterprise_id`` 列。
        scenario_id (Optional[str]): 行业场景 ID（``chemical`` / ``metallurgy`` / ``dust``），
            用于填充 ``SCENARIO_DEFAULTS`` 中的缺省字段。

    Returns:
        tuple[Dict[str, Any], NormalizationReport]: 规范化后的记录字典与变更报告。
    """


    normalized: Dict[str, Any] = dict(raw)
    mapped_fields: List[str] = []

    if enterprise_id and not normalized.get("enterprise_id"):
        normalized["enterprise_id"] = enterprise_id

    for canonical, aliases in FIELD_ALIASES.items():
        if _has_value(normalized.get(canonical)):
            continue
        for alias in aliases:
            if _has_value(raw.get(alias)):
                normalized[canonical] = raw[alias]
                mapped_fields.append(f"{alias}->{canonical}")
                break

    _apply_scenario_defaults(normalized, scenario_id)
    _derive_demo_fields(normalized)

    required = required_feature_columns()
    defaulted_fields = _fill_missing_required_fields(normalized, required)

    return normalized, NormalizationReport(
        mapped_fields=mapped_fields,
        defaulted_fields=defaulted_fields,
    )


def required_feature_columns() -> Set[str]:
    """汇总当前配置下特征流水线可能要求的全部原始输入列名。

    合并 ``id/binary/numeric/enum/text/industry`` 列及 ``special_features`` 中
    引用的列，并排除目标列 ``new_level``。

    Returns:
        Set[str]: 去重后的英文字段名集合。
    """


    cfg = get_config().features
    required: Set[str] = set()
    for cols in (
        cfg.id_columns,
        cfg.binary_columns,
        cfg.numeric_columns,
        cfg.enum_columns,
        cfg.text_columns,
        cfg.industry_columns,
    ):
        required.update(cols)

    sf = cfg.special_features or {}
    required.update(_flatten_special_features(sf))

    source_col = sf.get("source_col")
    if source_col:
        required.add(source_col)
    # 训练产物中当前包含可信度来源列。
    required.add("cf_source")

    required.discard(cfg.target_column)
    return required


def _flatten_special_features(special_features: Mapping[str, Any]) -> Set[str]:
    """展开 ``special_features`` 配置块中引用的全部原始列名。

    Args:
        special_features (Mapping[str, Any]): ``config.features.special_features`` 字典。

    Returns:
        Set[str]: 需要出现在输入 DataFrame 中的列名集合。
    """
    required: Set[str] = set()
    dust = special_features.get("dust_removal", {}) or {}
    required.update(c for c in (dust.get("dry_col"), dust.get("wet_col")) if c)
    required.update(special_features.get("confined_space_cols", []) or [])
    required.update(special_features.get("hazardous_chemical_cols", []) or [])
    time_col = special_features.get("time_col")
    if time_col:
        required.add(time_col)
    required.update(special_features.get("time_decay_value_cols", []) or [])
    geo = special_features.get("geo_fence", {}) or {}
    required.update(c for c in (geo.get("lon_col"), geo.get("lat_col")) if c)
    ent_id = special_features.get("enterprise_id_col")
    if ent_id:
        required.add(ent_id)
    required.update(special_features.get("hazard_cols", []) or [])
    required.update(special_features.get("document_cols", []) or [])
    return required


def _apply_scenario_defaults(record: MutableMapping[str, Any], scenario_id: Optional[str]) -> None:
    """
            按场景填充默认字段（原地）。
        
        Args:
                record (MutableMapping[str, Any]): 企业记录。
                scenario_id (Optional[str]): chemical/metallurgy/dust。
        """
    if not scenario_id:
        scenario_id = str(record.get("scenario_id") or "")
    defaults = SCENARIO_DEFAULTS.get(scenario_id, {})
    for key, value in defaults.items():
        if not _has_value(record.get(key)):
            record[key] = value


def _derive_demo_fields(record: MutableMapping[str, Any]) -> None:
    """从前端演示字段派生一组训练特征，尽量保持语义保守。"""


    _has_explicit_risk_counts = any(
        _has_value(record.get(key))
        for key in (
            "risk_total_count",
            "总风险数",
            "risk_level_a_count",
            "A级风险数",
            "risk_level_b_count",
            "B级风险数",
            "risk_level_c_count",
            "C级风险数",
            "risk_level_d_count",
            "D级风险数",
        )
    )
    if _has_value(record.get("风险等级")) and not _has_explicit_risk_counts:
        try:
            risk_level = int(float(record["风险等级"]))
        except (TypeError, ValueError):
            risk_level = 0
        record.setdefault("risk_total_count", max(risk_level, 0))
        record.setdefault("risk_level_a_count", 1 if risk_level >= 4 else 0)
        record.setdefault("risk_level_b_count", 1 if risk_level == 3 else 0)
        record.setdefault("risk_level_c_count", 1 if risk_level == 2 else 0)
        record.setdefault("risk_level_d_count", 1 if risk_level <= 1 and risk_level > 0 else 0)

    if _has_value(record.get("是否发现问题隐患 0-否 1-是")):
        has_trouble = _to_int(record.get("是否发现问题隐患 0-否 1-是"))
        record.setdefault("trouble_total_count", has_trouble)
        record.setdefault("check_trouble_count", has_trouble)

    if _has_value(record.get("重大危险源数量")):
        record.setdefault("is_major_hazards", 1 if _to_float(record.get("重大危险源数量")) > 0 else 0)
    if _has_value(record.get("重大危险源")) and not _has_value(record.get("is_major_hazards")):
        record.setdefault("is_major_hazards", _to_int(record.get("重大危险源")))

    if _has_value(record.get("危化品储罐数量")):
        record.setdefault("dangerous_chemical_enterprise", 1 if _to_float(record.get("危化品储罐数量")) > 0 else 0)

    if _has_value(record.get("高炉容积_m3")):
        record.setdefault("gaolu_num", 1 if _to_float(record.get("高炉容积_m3")) > 0 else 0)
        record.setdefault("is_metal_smelter", 1)

    if _has_value(record.get("湿式除尘器数量")):
        record.setdefault("dust_shishi_num", record["湿式除尘器数量"])


def _fill_missing_required_fields(record: MutableMapping[str, Any], required: Iterable[str]) -> List[str]:
    """
            为必填列填充类型默认值（原地）。
        
        Args:
                record (MutableMapping): 记录。
                required (Iterable[str]): 必填列。
        
        Returns:
                List[str]: 被填充的列名。
        """
    cfg = get_config().features
    binary_cols = set(cfg.binary_columns)
    numeric_cols = set(cfg.numeric_columns)
    enum_cols = set(cfg.enum_columns)
    industry_cols = set(cfg.industry_columns)
    id_cols = set(cfg.id_columns)

    defaulted: List[str] = []
    for col in sorted(required):
        if _has_value(record.get(col)):
            continue
        if col in binary_cols:
            value: Any = 0
        elif col in numeric_cols:
            value = 0
        elif col in enum_cols or col in industry_cols:
            value = "未知"
        elif col == "report_time":
            value = date.today().isoformat()
        elif col == "cf_source":
            value = "API输入"
        elif col in id_cols:
            value = record.get("enterprise_id") or "unknown"
        else:
            value = 0
        record[col] = value
        defaulted.append(col)
    return defaulted


def _has_value(value: Any) -> bool:
    """
            判断字段是否非空。
        
        Args:
                value (Any): 取值。
        
        Returns:
                bool: 是否有效。
        """
    return value is not None and value != ""


def _to_int(value: Any) -> int:
    """
            安全转 int，失败返回 0。
        
        Args:
                value (Any): 输入。
        
        Returns:
                int: 结果。
        """
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


RISK_DESCRIPTION_KEYS: tuple[str, ...] = ("具体风险描述", "risk_desc", "risk_description")
UPLOADED_PREDICTED_LEVEL_KEYS: tuple[str, ...] = ("预测风险等级", "predicted_risk_level_label")
_DECISION_CONTEXT_SKIP_KEYS: frozenset[str] = frozenset(
    {"features", "memory_results", "prediction", "decision", "node_status"}
)


def extract_decision_upload_constraints(record: Mapping[str, Any]) -> Dict[str, str]:
    """提取决策 Prompt 所需的上传表格约束（具体风险描述与列名）。

    Args:
        record: 规范化前/后的企业单行数据（通常含中文表头键名）。

    Returns:
        含 ``risk_description``、``table_column_names``、``uploaded_predicted_level`` 的字典。
    """
    risk_description = "（未提供）"
    for key in RISK_DESCRIPTION_KEYS:
        if _has_value(record.get(key)):
            risk_description = str(record[key]).strip()
            break

    uploaded_predicted_level = "（未提供）"
    for key in UPLOADED_PREDICTED_LEVEL_KEYS:
        if _has_value(record.get(key)):
            uploaded_predicted_level = str(record[key]).strip()
            break

    column_names = [
        str(key)
        for key in record.keys()
        if str(key) not in _DECISION_CONTEXT_SKIP_KEYS
    ]
    table_column_names = "、".join(column_names) if column_names else "（未提供）"

    return {
        "risk_description": risk_description,
        "table_column_names": table_column_names,
        "uploaded_predicted_level": uploaded_predicted_level,
    }


def _to_float(value: Any) -> float:
    """
            安全转 float，失败返回 0.0。
        
        Args:
                value (Any): 输入。
        
        Returns:
                float: 结果。
        """
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
