from mining_risk_common.dataplane.enterprise_db_adapter import (
    collect_enterprise_lookup_keys,
    flatten_enterprise_detail,
)


def test_flatten_enterprise_detail_merges_nested_sections():
    detail = {
        "企业名称": "测试企业有限公司",
        "详细数据": {
            "企业目录": [
                {
                    "时间戳": "2026-01-01",
                    "主键ID": "91320000MA1TEST001",
                    "企业名称": "测试企业有限公司",
                    "是否规上企业": 0,
                    "INDUS_TYPE_LAGRE_NAME": "木材加工和木、竹、藤、棕、草制品业",
                    "行业监管大类": "E",
                }
            ],
            "企业基本信息": [
                {
                    "修改时间": "2026-02-01",
                    "企业职工总人数": 48,
                    "上一年经营收入": 1200000,
                    "固定资产": 3000000,
                    "行业监管大类": "E",
                }
            ],
            "企业安全信息": [
                {
                    "修改时间": "2026-03-01",
                    "专职安全生产管理人员数": 2,
                    "兼职安全生产管理人员数": 1,
                    "安全生产标准化建设情况": 3,
                    "是否投保": 0,
                }
            ],
            "企业风险报告历史": [
                {
                    "修改时间": "2026-03-10",
                    "风险数量": 4,
                    "重大风险数量": 1,
                    "较大风险数量": 2,
                    "企业是否有较大以上安全生产风险": 1,
                }
            ],
            "企业生产经营地址": [
                {
                    "MAIN_ADDR": 1,
                    "修改时间": "2026-03-15",
                    "经度": 120.58,
                    "纬度": 31.30,
                }
            ],
        },
    }

    flat = flatten_enterprise_detail(detail)

    assert flat["企业名称"] == "测试企业有限公司"
    assert flat["enterprise_id"] == "91320000MA1TEST001"
    assert flat["企业职工总人数"] == 48
    assert flat["专职安全生产管理人员数"] == 2
    assert flat["风险数量"] == 4
    assert flat["经度"] == 120.58
    assert flat["纬度"] == 31.30
    assert flat["行业监管大类"] == "其他制造业"


def test_collect_enterprise_lookup_keys_includes_credit_code():
    detail = {
        "企业名称": "苏州汉丰新材料股份有限公司",
        "详细数据": {
            "企业日常检查记录": [
                {"统一社会信用代码": "913205007938006482", "企业名称": "苏州汉丰新材料股份有限公司"}
            ]
        },
    }
    keys = collect_enterprise_lookup_keys(detail)
    assert "苏州汉丰新材料股份有限公司" in keys
    assert "913205007938006482" in keys
