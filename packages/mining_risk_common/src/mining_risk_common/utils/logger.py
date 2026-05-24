"""
日志工具模块。

统一控制台与轮转文件输出的日志格式、级别与路径策略。
"""

import logging
import logging.handlers
import os
from pathlib import Path
from typing import Optional

from mining_risk_common.utils.config import get_config


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """获取已配置的日志记录器。

    首次调用时为该 ``name`` 挂载控制台 Handler；若配置中指定了日志文件，
    则额外挂载按大小轮转的 ``RotatingFileHandler``。重复调用同一 ``name`` 时
    直接返回已有实例，避免重复添加 Handler。

    Args:
        name (str): 日志记录器名称，通常传入 ``__name__``。
        level (Optional[str]): 日志级别字符串（如 ``INFO``）；未指定时从
            ``config.logging.level`` 读取。

    Returns:
        logging.Logger: 已设置级别与 Handler 的记录器实例。
    """

    config = get_config()
    log_level = level or config.logging.level
    log_format = config.logging.format
    log_file = config.logging.file

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # 避免重复添加 Handler
    if logger.handlers:
        return logger

    # 控制台输
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    console_formatter = logging.Formatter(log_format)
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    # 文件输出（按大小轮转
    if log_file:
        log_dir = os.path.dirname(log_file)
        if log_dir:
            Path(log_dir).mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=config.logging.max_bytes,
            backupCount=config.logging.backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(getattr(logging, log_level.upper(), logging.INFO))
        file_formatter = logging.Formatter(log_format)
        file_handler.setFormatter(file_formatter)
        logger.addHandler(file_handler)

    return logger
