"""
Logging utility for C2 System API
Provides structured logging with appropriate levels and context
"""

import logging
import sys
import traceback
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
import json

# Create logs directory if it doesn't exist
LOG_DIR = Path(__file__).parent.parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# Default log format
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Structured log format for JSON logging
STRUCTURED_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(context)s"

# Log file path (unified logging)
LOG_FILE = LOG_DIR / "c2_system.log"


def setup_logger(
    name: str = "c2_system",
    level: int = logging.INFO,
    log_to_file: bool = True,
    log_to_console: bool = True
) -> logging.Logger:
    """
    Setup and configure a logger with unified file handler
    
    Args:
        name: Logger name
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_to_file: Whether to log to file
        log_to_console: Whether to log to console
        
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Avoid adding handlers multiple times
    if logger.handlers:
        return logger
    
    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)
    
    # Console handler
    if log_to_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
    
    # Unified file handler (all levels: DEBUG, INFO, WARNING, ERROR, CRITICAL)
    if log_to_file:
        file_handler = logging.FileHandler(LOG_FILE, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)  # Log all levels
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


# Create default logger instance
logger = setup_logger()

# Convenience functions for backward compatibility with print statements
def debug(message: str, *args, **kwargs):
    """Log debug message"""
    logger.debug(message, *args, **kwargs)


def info(message: str, *args, **kwargs):
    """Log info message"""
    logger.info(message, *args, **kwargs)


def warning(message: str, *args, **kwargs):
    """Log warning message"""
    logger.warning(message, *args, **kwargs)


def error(message: str, *args, **kwargs):
    """Log error message"""
    logger.error(message, *args, **kwargs)


def critical(message: str, *args, **kwargs):
    """Log critical message"""
    logger.critical(message, *args, **kwargs)


def exception(message: str, *args, exc_info=True, **kwargs):
    """Log exception with traceback"""
    logger.exception(message, *args, exc_info=exc_info, **kwargs)


def log_error_with_context(
    message: str,
    error_code: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    exception: Optional[Exception] = None,
    level: int = logging.ERROR
):
    """
    Log error with structured context for better debugging
    
    Args:
        message: Error message
        error_code: Error code (e.g., ERR_3000)
        context: Additional context dictionary
        exception: Exception instance (if any)
        level: Logging level
    """
    context_dict = context or {}
    if error_code:
        context_dict["error_code"] = error_code
    
    if exception:
        context_dict["exception_type"] = type(exception).__name__
        context_dict["exception_message"] = str(exception)
        context_dict["traceback"] = traceback.format_exc()
    
    context_str = json.dumps(context_dict, default=str, ensure_ascii=False)
    full_message = f"{message} | Context: {context_str}"
    
    logger.log(level, full_message, exc_info=exception is not None)


def log_request_error(
    endpoint: str,
    method: str,
    error: Exception,
    error_code: Optional[str] = None,
    user_id: Optional[str] = None,
    request_id: Optional[str] = None,
    **kwargs
):
    """
    Log API request error with full context
    
    Args:
        endpoint: API endpoint
        method: HTTP method
        error: Exception instance
        error_code: Error code
        user_id: User ID (if authenticated)
        request_id: Request ID for tracing
        **kwargs: Additional context
    """
    context = {
        "endpoint": endpoint,
        "method": method,
        "error_type": type(error).__name__,
        "error_message": str(error),
        **kwargs
    }
    
    if user_id:
        context["user_id"] = user_id
    if request_id:
        context["request_id"] = request_id
    
    log_error_with_context(
        message=f"API Error: {method} {endpoint}",
        error_code=error_code,
        context=context,
        exception=error
    )


