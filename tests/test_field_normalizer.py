import os

from mining_risk_common.dataplane.field_normalizer import (
    extract_decision_upload_constraints,
    normalize_enterprise_record,
)


os.environ.setdefault("GLM5_API_KEY", "test-key")


def test_normalize_chinese_demo_fields_to_training_columns():
    normalized, report = normalize_enterprise_record(
        {
            "企业ID": "CHEM-001",
            "企业名称": "测试危化企业",
            "企业职工总人数": 320,
            "安全生产标准化建设情况": 2,
            "行业监管大类": "危险化学品",
            "国民经济大类": "化学原料和化学制品制造业",
            "是否发生事故": 1,
            "是否发现问题隐患 0-否 1-是": 1,
            "重大危险源数量": 3,
        },
        enterprise_id="REQ-001",
        scenario_id="chemical",
    )

    assert normalized["enterprise_id"] == "REQ-001"
    assert normalized["enterprise_name"] == "测试危化企业"
    assert normalized["staff_num"] == 320
    assert normalized["safety_build"] == 2
    assert normalized["supervision_large"] == "危险化学品"
    assert normalized["indus_type_large"] == "化学原料和化学制品制造业"
    assert normalized["risk_accident_flag"] == 1
    assert normalized["has_risk_item"] == 1
    assert normalized["is_major_hazards"] == 1
    assert normalized["dangerous_chemical_enterprise"] == 1
    assert normalized["risk_whp_flag"] == 1
    assert "staff_num" not in report.defaulted_fields


def test_normalize_preserves_english_field_precedence():
    normalized, _ = normalize_enterprise_record(
        {
            "staff_num": 99,
            "企业职工总人数": 320,
            "supervision_large": "冶金",
            "行业监管大类": "危险化学品",
        },
        enterprise_id="ENT-001",
        scenario_id="chemical",
    )

    assert normalized["staff_num"] == 99
    assert normalized["supervision_large"] == "冶金"


def test_normalize_fills_pipeline_required_columns():
    normalized, report = normalize_enterprise_record(
        {"企业名称": "最小输入企业"},
        enterprise_id="ENT-MIN",
        scenario_id="dust",
    )

    assert normalized["enterprise_id"] == "ENT-MIN"
    assert normalized["staff_num"] == 0
    assert normalized["safety_build"] == "未知"
    assert normalized["cf_source"] == "API输入"
    assert normalized["is_explosive_dust"] == 1
    assert "staff_num" in report.defaulted_fields


def test_normalize_maps_demo_regulatory_chinese_columns():
    normalized, report = normalize_enterprise_record(
        {
            "企业ID": "DUST-1-001",
            "是否规上企业": 1,
            "是否投保": 1,
            "是否履行三同时手续": 1,
            "厂中厂": 0,
            "风险重点企业": 0,
            "关键风险企业": 0,
            "数据有效标识": 1,
            "危化品企业标识": 0,
            "危险化学品使用": 0,
            "有限空间关键企业": 0,
            "总风险数": 0,
            "D级风险数": 0,
            "风险等级": 1,
        },
        enterprise_id="DUST-1-001",
        scenario_id="dust",
    )
    assert normalized["above_designated"] == 1
    assert normalized["if_insure"] == 1
    assert normalized["if_comply_formality"] == 1
    assert normalized["factory_in_factory"] == 0
    assert normalized["risk_company_flag"] == 0
    assert normalized["risk_total_count"] == 0
    assert normalized["risk_level_d_count"] == 0
    assert "above_designated" not in report.defaulted_fields


def test_risk_level_does_not_override_explicit_risk_counts():
    normalized, _ = normalize_enterprise_record(
        {
            "风险等级": 1,
            "总风险数": 0,
            "D级风险数": 0,
        },
        scenario_id="dust",
    )
    assert normalized["risk_total_count"] == 0
    assert normalized["risk_level_d_count"] == 0


def test_extract_decision_upload_constraints_from_dust_demo_row():
    row = {
        "企业ID": "DUST-1-001",
        "预测风险等级": "蓝",
        "具体风险描述": "湿式除尘运行正常，粉尘清扫制度执行到位，电气防爆符合要求",
        "湿式除尘器数量": 2,
    }
    ctx = extract_decision_upload_constraints(row)
    assert ctx["risk_description"] == "湿式除尘运行正常，粉尘清扫制度执行到位，电气防爆符合要求"
    assert ctx["uploaded_predicted_level"] == "蓝"
    assert "企业ID" in ctx["table_column_names"]
    assert "具体风险描述" in ctx["table_column_names"]
    assert "湿式除尘器数量" in ctx["table_column_names"]
