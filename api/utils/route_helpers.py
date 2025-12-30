"""
Helper functions for route error handling
Provides utilities for consistent error handling across all routes
"""

from fastapi import HTTPException
from api.utils.exceptions import C2SystemException
from api.utils.error_codes import ErrorCode
from api.utils.logger import log_error_with_context
from typing import Optional, Dict, Any, Callable
import functools


def handle_route_errors(
    error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    context: Optional[Dict[str, Any]] = None
):
    """
    Decorator for handling errors in routes with proper logging
    
    Usage:
        @router.get("/example")
        @handle_route_errors(ErrorCode.TUNNEL_NOT_FOUND, {"endpoint": "/example"})
        async def example_route():
            # Your code here
            pass
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except C2SystemException:
                # Let custom exceptions be handled by global handler
                raise
            except HTTPException:
                # Re-raise HTTPExceptions as-is
                raise
            except Exception as e:
                # Log unexpected errors
                log_error_with_context(
                    message=f"Unexpected error in {func.__name__}",
                    error_code=error_code.value,
                    context={**(context or {}), "function": func.__name__},
                    exception=e
                )
                raise HTTPException(
                    status_code=500,
                    detail={
                        "error_code": error_code.value,
                        "message": "An unexpected error occurred",
                        "detail": str(e),
                        "context": context or {}
                    }
                )
        return wrapper
    return decorator


def create_error_response(
    error_code: ErrorCode,
    message: str,
    detail: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Create a standardized error response dictionary
    
    Args:
        error_code: Error code enum
        message: Error message
        detail: Detailed error description
        context: Additional context
        
    Returns:
        Dictionary with error information
    """
    return {
        "error_code": error_code.value,
        "message": message,
        "detail": detail or message,
        "context": context or {}
    }

