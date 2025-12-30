"""
Custom exceptions for C2 System API
Provides specific exception types for better error handling
"""

from fastapi import HTTPException, status
from typing import Optional, Dict, Any
from api.utils.error_codes import ErrorCode, get_error_description


class C2SystemException(Exception):
    """Base exception for C2 System"""
    def __init__(
        self, 
        message: str, 
        detail: str = None,
        error_code: ErrorCode = ErrorCode.INTERNAL_ERROR,
        context: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.detail = detail or message
        self.error_code = error_code
        self.context = context or {}
        super().__init__(self.message)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for JSON response"""
        return {
            "error_code": self.error_code.value,
            "message": self.message,
            "detail": self.detail,
            "description": get_error_description(self.error_code),
            "context": self.context
        }


class TunnelNotFoundError(C2SystemException):
    """Raised when a tunnel is not found"""
    def __init__(self, tunnel_id: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Tunnel not found: {tunnel_id}",
            detail=detail or f"Tunnel with ID '{tunnel_id}' was not found",
            error_code=ErrorCode.TUNNEL_NOT_FOUND,
            context={**(context or {}), "tunnel_id": tunnel_id}
        )


class TunnelOfflineError(C2SystemException):
    """Raised when a tunnel is offline or not healthy"""
    def __init__(self, tunnel_id: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"Tunnel is offline: {tunnel_id}",
            detail=detail or f"Tunnel '{tunnel_id}' is offline or not healthy",
            error_code=ErrorCode.TUNNEL_OFFLINE,
            context={**(context or {}), "tunnel_id": tunnel_id}
        )


class TunnelConfigurationError(C2SystemException):
    """Raised when tunnel configuration is invalid or missing"""
    def __init__(self, message: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            detail=detail or message,
            error_code=ErrorCode.TUNNEL_CONFIG_ERROR,
            context=context or {}
        )


class RouteProxyError(C2SystemException):
    """Raised when route proxy operation fails"""
    def __init__(self, message: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            detail=detail or message,
            error_code=ErrorCode.ROUTE_PROXY_NOT_FOUND,
            context=context or {}
        )


class RouteProxyNotFoundError(RouteProxyError):
    """Raised when a route proxy is not found"""
    def __init__(self, proxy_id: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        # RouteProxyError already sets error_code internally, so we don't pass it
        super().__init__(
            message=f"Route proxy not found: {proxy_id}",
            detail=detail or f"Route proxy '{proxy_id}' was not found",
            context={**(context or {}), "proxy_id": proxy_id}
        )
        # Override error_code for this specific exception type
        self.error_code = ErrorCode.ROUTE_PROXY_NOT_FOUND


class RouteProxyNotRunningError(RouteProxyError):
    """Raised when a route proxy is not running"""
    def __init__(self, proxy_id: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        # RouteProxyError already sets error_code internally, so we don't pass it
        super().__init__(
            message=f"Route proxy is not running: {proxy_id}",
            detail=detail or f"Route proxy '{proxy_id}' is not running",
            context={**(context or {}), "proxy_id": proxy_id}
        )
        # Override error_code for this specific exception type
        self.error_code = ErrorCode.ROUTE_PROXY_NOT_RUNNING


class WinRMError(C2SystemException):
    """Raised when WinRM operation fails"""
    def __init__(self, message: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            detail=detail or message,
            error_code=ErrorCode.WINRM_EXECUTION_FAILED,
            context=context or {}
        )


class WinRMConnectionError(WinRMError):
    """Raised when WinRM connection fails"""
    def __init__(self, host: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"WinRM connection failed: {host}",
            detail=detail or f"Failed to connect to WinRM service at '{host}'",
            error_code=ErrorCode.WINRM_CONNECTION_FAILED,
            context={**(context or {}), "host": host}
        )


class WinRMExecutionError(WinRMError):
    """Raised when WinRM command execution fails"""
    def __init__(self, command: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"WinRM command execution failed: {command}",
            detail=detail or f"Failed to execute command '{command}' via WinRM",
            error_code=ErrorCode.WINRM_EXECUTION_FAILED,
            context={**(context or {}), "command": command}
        )


class SSHError(C2SystemException):
    """Raised when SSH operation fails"""
    def __init__(self, message: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            detail=detail or message,
            error_code=ErrorCode.INTERNAL_ERROR,
            context=context or {}
        )


class SSHConnectionError(SSHError):
    """Raised when SSH connection fails"""
    def __init__(self, host: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"SSH connection failed: {host}",
            detail=detail or f"Failed to connect to SSH service at '{host}'",
            context={**(context or {}), "host": host}
        )


class SSHExecutionError(SSHError):
    """Raised when SSH command execution fails"""
    def __init__(self, command: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=f"SSH command execution failed: {command}",
            detail=detail or f"Failed to execute command '{command}' via SSH",
            context={**(context or {}), "command": command}
        )


class CloudflareAPIError(C2SystemException):
    """Raised when Cloudflare API operation fails"""
    def __init__(self, message: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            detail=detail or message,
            error_code=ErrorCode.CLOUDFLARE_API_ERROR,
            context=context or {}
        )


class CloudflaredNotFoundError(C2SystemException):
    """Raised when cloudflared executable is not found"""
    def __init__(self, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message="cloudflared executable not found",
            detail=detail or "cloudflared executable is not installed or not in PATH",
            error_code=ErrorCode.INTERNAL_ERROR,
            context=context or {}
        )


class DatabaseError(C2SystemException):
    """Raised when database operation fails"""
    def __init__(self, message: str, detail: str = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            detail=detail or message,
            error_code=ErrorCode.DATABASE_QUERY_ERROR,
            context=context or {}
        )


class AuthenticationError(C2SystemException):
    """Raised when authentication fails"""
    def __init__(self, message: str = None, detail: str = None, error_code: ErrorCode = None, context: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message or "Authentication failed",
            detail=detail or "Invalid credentials or authentication token",
            error_code=error_code or ErrorCode.AUTH_INVALID_CREDENTIALS,
            context=context or {}
        )


def exception_to_http(exception: C2SystemException, default_status: int = status.HTTP_400_BAD_REQUEST) -> HTTPException:
    """
    Convert custom exception to HTTPException with error code and context
    
    Args:
        exception: Custom exception instance
        default_status: Default HTTP status code
        
    Returns:
        HTTPException instance with structured error response
    """
    status_code = default_status
    
    # Map exception types to HTTP status codes
    if isinstance(exception, TunnelNotFoundError):
        status_code = status.HTTP_404_NOT_FOUND
    elif isinstance(exception, TunnelOfflineError):
        status_code = status.HTTP_400_BAD_REQUEST
    elif isinstance(exception, RouteProxyNotFoundError):
        status_code = status.HTTP_404_NOT_FOUND
    elif isinstance(exception, RouteProxyNotRunningError):
        status_code = status.HTTP_400_BAD_REQUEST
    elif isinstance(exception, WinRMConnectionError):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif isinstance(exception, SSHConnectionError):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    elif isinstance(exception, AuthenticationError):
        status_code = status.HTTP_401_UNAUTHORIZED
    elif isinstance(exception, CloudflareAPIError):
        status_code = status.HTTP_502_BAD_GATEWAY
    elif isinstance(exception, DatabaseError):
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    
    # Return structured error response
    return HTTPException(
        status_code=status_code,
        detail=exception.to_dict()
    )


