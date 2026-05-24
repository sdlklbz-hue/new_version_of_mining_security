"""
Proposer 节点：将预警决策拆解为 JSON 原子命题列表
"""

import json
from typing import Any, Dict, List

from mining_risk_common.utils.logger import get_logger

logger = get_logger(__name__)


class Proposer:
    """Proposer 节点：将 LLM 决策 JSON 拆解为 MARCH 校验用的原子命题列表。"""


    @staticmethod
    def decompose(decision: Dict[str, Any]) -> List[Dict[str, str]]:
        """将结构化决策拆解为原子命题列表。

        按风险定级、政府干预、企业管控、SHAP 归因、概率分布等维度生成
        带 ``id`` / ``proposition`` / ``category`` 的命题条目，供后续
        MARCH 三重隔离校验逐条验证。

        Args:
            decision (Dict[str, Any]): 决策字典，需包含 ``predicted_level``、
                ``government_advice``、``enterprise_advice`` 等可选字段。

        Returns:
            List[Dict[str, str]]: 原子命题列表，每项含 ``id``、``proposition``、
                ``category`` 三个键。
        """

        propositions = []

        # 拆解风险等级判定
        level = decision.get("predicted_level", "")
        if level:
            propositions.append({
                "id": "prop_001",
                "proposition": f"企业风险等级判定为{level}",
                "category": "风险定级",
            })

        # 拆解政府干预建议
        gov_advice = decision.get("government_advice", "")
        if gov_advice:
            propositions.append({
                "id": "prop_002",
                "proposition": f"建议政府部门采取以下措施：{gov_advice[:200]}",
                "category": "政府干预",
            })

        # 拆解企业管控建议
        ent_advice = decision.get("enterprise_advice", "")
        if ent_advice:
            propositions.append({
                "id": "prop_003",
                "proposition": f"建议企业采取以下措施：{ent_advice[:200]}",
                "category": "企业管控",
            })

        # 拆解特征归因
        shap = decision.get("shap_contributions", [])
        if shap:
            top_feature = shap[0].get("feature", "未知特征")
            propositions.append({
                "id": "prop_004",
                "proposition": f"核心风险驱动因素为：{top_feature}",
                "category": "特征归因",
            })

        # 拆解概率分布（如存在）
        prob_dist = decision.get("probability_distribution", {})
        if prob_dist:
            top_level = max(prob_dist, key=prob_dist.get)
            propositions.append({
                "id": "prop_005",
                "proposition": f"模型判定最高置信等级为：{top_level}（置信度 {prob_dist[top_level]:.2%}）",
                "category": "模型置信",
            })

        return propositions

    @staticmethod
    def to_json(propositions: List[Dict[str, str]]) -> str:
        """将原子命题列表序列化为 JSON 字符串。

        Args:
            propositions (List[Dict[str, str]]): ``decompose`` 输出的命题列表。

        Returns:
            str: UTF-8、缩进为 2 的 JSON 文本（``ensure_ascii=False``）。
        """

        return json.dumps(propositions, ensure_ascii=False, indent=2)

    @staticmethod
    def from_json(json_str: str) -> List[Dict[str, str]]:
        """从 JSON 字符串反序列化为原子命题列表。

        Args:
            json_str (str): ``to_json`` 生成的 JSON 文本。

        Returns:
            List[Dict[str, str]]: 解析后的命题列表。

        Raises:
            json.JSONDecodeError: JSON 格式非法时由 ``json.loads`` 抛出。
        """

        return json.loads(json_str)
