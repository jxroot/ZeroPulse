"""
Rate Limiting Middleware
Request rate limiting to prevent abuse
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from api.utils.error_codes import ErrorCode
from api.utils.logger import logger

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


def get_rate_limit_key(request: Request) -> str:
    """
    Get rate limit key based on user or IP
    
    Args:
        request: FastAPI request object
    
    Returns:
        Rate limit key (username or IP address)
    """
    # Try to get username from token if authenticated
    try:
        authorization = request.headers.get("Authorization")
        if authorization:
            from api.services.auth import verify_token
            scheme, token = authorization.split()
            if scheme.lower() == "bearer":
                payload = verify_token(token)
                if payload:
                    username = payload.get("username") or payload.get("sub")
                    if username:
                        return f"user:{username}"
    except Exception:
        pass
    
    # Fallback to IP address
    return get_remote_address(request)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """
    Custom handler for rate limit exceeded
    
    Args:
        request: FastAPI request object
        exc: RateLimitExceeded exception
    
    Returns:
        JSONResponse with error details
    """
    logger.warning(f"Rate limit exceeded for {get_rate_limit_key(request)}: {request.url.path}")
    
    # Get retry_after if available, otherwise use default 60 seconds
    # RateLimitExceeded may not have retry_after attribute in some versions
    retry_after = 60  # Default to 60 seconds
    if hasattr(exc, 'retry_after'):
        retry_after = exc.retry_after
    elif hasattr(exc, 'detail') and isinstance(exc.detail, dict):
        retry_after = exc.detail.get('retry_after', 60)
    
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "error_code": ErrorCode.RATE_LIMIT_EXCEEDED.value,
            "message": "Rate limit exceeded",
            "detail": f"Too many requests. Please try again later.",
            "retry_after": retry_after
        },
        headers={"Retry-After": str(retry_after)}
    )

