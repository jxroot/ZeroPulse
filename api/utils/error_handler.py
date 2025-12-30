"""
Global error handler for FastAPI
Provides centralized error handling with proper logging and error codes
"""

from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from api.utils.exceptions import C2SystemException, exception_to_http
from api.utils.logger import log_request_error, log_error_with_context
from api.utils.error_codes import ErrorCode
from typing import Optional
import traceback
import logging


async def c2_system_exception_handler(request: Request, exc: C2SystemException) -> JSONResponse:
    """
    Handle C2SystemException with proper logging and error codes
    
    Args:
        request: FastAPI request object
        exc: C2SystemException instance
        
    Returns:
        JSONResponse with structured error
    """
    # Log the error with context
    log_request_error(
        endpoint=str(request.url.path),
        method=request.method,
        error=exc,
        error_code=exc.error_code.value,
        **exc.context
    )
    
    # Convert to HTTPException
    http_exc = exception_to_http(exc)
    
    # Return structured error response
    return JSONResponse(
        status_code=http_exc.status_code,
        content=http_exc.detail
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """
    Handle HTTPException with error codes
    
    Args:
        request: FastAPI request object
        exc: HTTPException instance
        
    Returns:
        JSONResponse with structured error
    """
    # Extract error code from detail if it's a dict
    error_detail = exc.detail
    error_code = ErrorCode.INTERNAL_ERROR.value
    
    if isinstance(error_detail, dict):
        error_code = error_detail.get("error_code", ErrorCode.INTERNAL_ERROR.value)
        message = error_detail.get("message", str(exc.detail))
        detail = error_detail.get("detail", message)
        context = error_detail.get("context", {})
    else:
        message = str(exc.detail)
        detail = message
        context = {}
    
    # Log the error
    log_request_error(
        endpoint=str(request.url.path),
        method=request.method,
        error=exc,
        error_code=error_code,
        **context
    )
    
    # Return structured error response
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error_code": error_code,
            "message": message,
            "detail": detail,
            "context": context
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """
    Handle request validation errors with detailed information
    
    Args:
        request: FastAPI request object
        exc: RequestValidationError instance
        
    Returns:
        JSONResponse with validation error details
    """
    errors = exc.errors()
    
    # Log validation error
    log_error_with_context(
        message=f"Validation error: {request.method} {request.url.path}",
        error_code=ErrorCode.VALIDATION_ERROR.value,
        context={
            "endpoint": str(request.url.path),
            "method": request.method,
            "validation_errors": errors
        }
    )
    
    # Format validation errors
    formatted_errors = []
    for error in errors:
        formatted_errors.append({
            "field": ".".join(str(loc) for loc in error.get("loc", [])),
            "message": error.get("msg"),
            "type": error.get("type")
        })
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error_code": ErrorCode.VALIDATION_ERROR.value,
            "message": "Request validation failed",
            "detail": "One or more fields failed validation",
            "validation_errors": formatted_errors
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle unexpected exceptions with proper logging
    
    Args:
        request: FastAPI request object
        exc: Exception instance
        
    Returns:
        JSONResponse with error information
    """
    # Log the unexpected error with full traceback
    log_error_with_context(
        message=f"Unexpected error: {request.method} {request.url.path}",
        error_code=ErrorCode.INTERNAL_ERROR.value,
        context={
            "endpoint": str(request.url.path),
            "method": request.method,
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exc()
        },
        exception=exc,
        level=logging.CRITICAL
    )
    
    # Return generic error (don't expose internal details)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error_code": ErrorCode.INTERNAL_ERROR.value,
            "message": "An internal server error occurred",
            "detail": "Please contact support if this issue persists"
        }
    )

