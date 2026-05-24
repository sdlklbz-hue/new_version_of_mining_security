"""管理类 API 的轻量级鉴权模块。

通过 ``X-Admin-Token`` 请求头校验运维/迭代等敏感接口的访问权限。
"""

import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException, status


def _admin_token() -> str:
    """读取配置的管理员令牌。

    Returns:
        str: 环境变量 ``MRA_ADMIN_TOKEN`` 的值（去首尾空白）。
    """

    return os.getenv("MRA_ADMIN_TOKEN", "").strip()


def _allow_unauthenticated_admin() -> bool:
    """是否允许在未配置令牌时放行管理接口（仅用于本地演示）。

    Returns:
        bool: 当 ``MRA_ALLOW_UNAUTHENTICATED_ADMIN`` 为 true/1/on 时返回 True。
    """

    return os.getenv("MRA_ALLOW_UNAUTHENTICATED_ADMIN", "").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


async def require_admin_token(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """FastAPI 依赖：校验可变/敏感运维接口的管理员令牌。

    Args:
        x_admin_token (Optional[str]): 请求头 ``X-Admin-Token`` 中的令牌。

    Raises:
        HTTPException: 未配置令牌、令牌不匹配或未授权时返回 503/401。
    """

    expected = _admin_token()
    if not expected:
        if _allow_unauthenticated_admin():
            return
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="管理接口未启用：请设置 MRA_ADMIN_TOKEN，或仅在本地演示时设置 MRA_ALLOW_UNAUTHENTICATED_ADMIN=true。",
        )

    if not x_admin_token or not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少或无效的管理令牌",
        )
