"""
Error Codes for C2 System API
Standard error codes for consistent error handling across the application
"""

from enum import Enum
from typing import Optional


class ErrorCode(str, Enum):
    """Standard error codes for C2 System API"""
    
    # General Errors (1000-1999)
    INTERNAL_ERROR = "ERR_1000"
    INVALID_REQUEST = "ERR_1001"
    VALIDATION_ERROR = "ERR_1002"
    RESOURCE_NOT_FOUND = "ERR_1003"
    UNAUTHORIZED = "ERR_1004"
    FORBIDDEN = "ERR_1005"
    RATE_LIMIT_EXCEEDED = "ERR_1006"
    
    # Authentication Errors (2000-2099)
    AUTH_INVALID_CREDENTIALS = "ERR_2000"
    AUTH_TOKEN_EXPIRED = "ERR_2001"
    AUTH_TOKEN_INVALID = "ERR_2002"
    AUTH_TOKEN_MISSING = "ERR_2003"
    AUTH_SESSION_EXPIRED = "ERR_2004"
    AUTH_INSUFFICIENT_PERMISSIONS = "ERR_2005"
    
    # Tunnel Errors (3000-3099)
    TUNNEL_NOT_FOUND = "ERR_3000"
    TUNNEL_OFFLINE = "ERR_3001"
    TUNNEL_CONFIG_ERROR = "ERR_3002"
    TUNNEL_CREATE_FAILED = "ERR_3003"
    TUNNEL_UPDATE_FAILED = "ERR_3004"
    TUNNEL_DELETE_FAILED = "ERR_3005"
    TUNNEL_ROUTE_INVALID = "ERR_3006"
    TUNNEL_ROUTE_NOT_FOUND = "ERR_3007"
    
    # DNS Errors (3100-3199)
    DNS_RECORD_NOT_FOUND = "ERR_3100"
    DNS_RECORD_CREATE_FAILED = "ERR_3101"
    DNS_RECORD_UPDATE_FAILED = "ERR_3102"
    DNS_RECORD_DELETE_FAILED = "ERR_3103"
    DNS_RECORD_CONFLICT = "ERR_3104"
    DNS_ZONE_NOT_FOUND = "ERR_3105"
    
    # Route Proxy Errors (3200-3299)
    ROUTE_PROXY_NOT_FOUND = "ERR_3200"
    ROUTE_PROXY_NOT_RUNNING = "ERR_3201"
    ROUTE_PROXY_START_FAILED = "ERR_3202"
    ROUTE_PROXY_STOP_FAILED = "ERR_3203"
    ROUTE_PROXY_PORT_IN_USE = "ERR_3204"
    
    # WinRM Errors (4000-4099)
    WINRM_CONNECTION_FAILED = "ERR_4000"
    WINRM_EXECUTION_FAILED = "ERR_4001"
    WINRM_TIMEOUT = "ERR_4002"
    WINRM_AUTH_FAILED = "ERR_4003"
    
    # Cloudflare API Errors (5000-5099)
    CLOUDFLARE_API_ERROR = "ERR_5000"
    CLOUDFLARE_API_TIMEOUT = "ERR_5001"
    CLOUDFLARE_API_RATE_LIMIT = "ERR_5002"
    CLOUDFLARE_INVALID_RESPONSE = "ERR_5003"
    CLOUDFLARE_TUNNEL_NOT_FOUND = "ERR_5004"
    
    # Database Errors (6000-6099)
    DATABASE_CONNECTION_ERROR = "ERR_6000"
    DATABASE_QUERY_ERROR = "ERR_6001"
    DATABASE_TRANSACTION_ERROR = "ERR_6002"
    DATABASE_RECORD_NOT_FOUND = "ERR_6003"
    
    # Command Execution Errors (7000-7099)
    COMMAND_EXECUTION_FAILED = "ERR_7000"
    COMMAND_TIMEOUT = "ERR_7001"
    COMMAND_INVALID = "ERR_7002"
    COMMAND_NOT_ALLOWED = "ERR_7003"
    
    # Settings Errors (8000-8099)
    SETTINGS_TOKEN_CREATE_FAILED = "ERR_8000"
    SETTINGS_TOKEN_UPDATE_FAILED = "ERR_8001"
    SETTINGS_TOKEN_DELETE_FAILED = "ERR_8002"
    SETTINGS_TOKEN_NOT_FOUND = "ERR_8003"
    SETTINGS_MODULE_CREATE_FAILED = "ERR_8004"
    SETTINGS_MODULE_UPDATE_FAILED = "ERR_8005"
    SETTINGS_MODULE_DELETE_FAILED = "ERR_8006"
    SETTINGS_MODULE_NOT_FOUND = "ERR_8007"


# Error code descriptions for better error messages
ERROR_DESCRIPTIONS = {
    ErrorCode.INTERNAL_ERROR: "An internal server error occurred",
    ErrorCode.INVALID_REQUEST: "The request is invalid",
    ErrorCode.VALIDATION_ERROR: "Request validation failed",
    ErrorCode.RESOURCE_NOT_FOUND: "The requested resource was not found",
    ErrorCode.UNAUTHORIZED: "Authentication required",
    ErrorCode.FORBIDDEN: "Insufficient permissions",
    ErrorCode.RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
    
    ErrorCode.AUTH_INVALID_CREDENTIALS: "Invalid username or password",
    ErrorCode.AUTH_TOKEN_EXPIRED: "Authentication token has expired",
    ErrorCode.AUTH_TOKEN_INVALID: "Invalid authentication token",
    ErrorCode.AUTH_TOKEN_MISSING: "Authentication token is missing",
    ErrorCode.AUTH_SESSION_EXPIRED: "Session has expired",
    ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS: "Insufficient permissions for this operation",
    
    ErrorCode.TUNNEL_NOT_FOUND: "Tunnel not found",
    ErrorCode.TUNNEL_OFFLINE: "Tunnel is offline or not healthy",
    ErrorCode.TUNNEL_CONFIG_ERROR: "Tunnel configuration error",
    ErrorCode.TUNNEL_CREATE_FAILED: "Failed to create tunnel",
    ErrorCode.TUNNEL_UPDATE_FAILED: "Failed to update tunnel",
    ErrorCode.TUNNEL_DELETE_FAILED: "Failed to delete tunnel",
    ErrorCode.TUNNEL_ROUTE_INVALID: "Invalid tunnel route configuration",
    ErrorCode.TUNNEL_ROUTE_NOT_FOUND: "Tunnel route not found",
    
    ErrorCode.DNS_RECORD_NOT_FOUND: "DNS record not found",
    ErrorCode.DNS_RECORD_CREATE_FAILED: "Failed to create DNS record",
    ErrorCode.DNS_RECORD_UPDATE_FAILED: "Failed to update DNS record",
    ErrorCode.DNS_RECORD_DELETE_FAILED: "Failed to delete DNS record",
    ErrorCode.DNS_RECORD_CONFLICT: "DNS record conflict (record already exists)",
    ErrorCode.DNS_ZONE_NOT_FOUND: "DNS zone not found",
    
    ErrorCode.ROUTE_PROXY_NOT_FOUND: "Route proxy not found",
    ErrorCode.ROUTE_PROXY_NOT_RUNNING: "Route proxy is not running",
    ErrorCode.ROUTE_PROXY_START_FAILED: "Failed to start route proxy",
    ErrorCode.ROUTE_PROXY_STOP_FAILED: "Failed to stop route proxy",
    ErrorCode.ROUTE_PROXY_PORT_IN_USE: "Port is already in use",
    
    ErrorCode.WINRM_CONNECTION_FAILED: "WinRM connection failed",
    ErrorCode.WINRM_EXECUTION_FAILED: "WinRM command execution failed",
    ErrorCode.WINRM_TIMEOUT: "WinRM operation timed out",
    ErrorCode.WINRM_AUTH_FAILED: "WinRM authentication failed",
    
    ErrorCode.CLOUDFLARE_API_ERROR: "Cloudflare API error",
    ErrorCode.CLOUDFLARE_API_TIMEOUT: "Cloudflare API request timed out",
    ErrorCode.CLOUDFLARE_API_RATE_LIMIT: "Cloudflare API rate limit exceeded",
    ErrorCode.CLOUDFLARE_INVALID_RESPONSE: "Invalid response from Cloudflare API",
    ErrorCode.CLOUDFLARE_TUNNEL_NOT_FOUND: "Cloudflare tunnel not found",
    
    ErrorCode.DATABASE_CONNECTION_ERROR: "Database connection error",
    ErrorCode.DATABASE_QUERY_ERROR: "Database query error",
    ErrorCode.DATABASE_TRANSACTION_ERROR: "Database transaction error",
    ErrorCode.DATABASE_RECORD_NOT_FOUND: "Database record not found",
    
    ErrorCode.COMMAND_EXECUTION_FAILED: "Command execution failed",
    ErrorCode.COMMAND_TIMEOUT: "Command execution timed out",
    ErrorCode.COMMAND_INVALID: "Invalid command",
    ErrorCode.COMMAND_NOT_ALLOWED: "Command not allowed",
    
    ErrorCode.SETTINGS_TOKEN_CREATE_FAILED: "Failed to create API token",
    ErrorCode.SETTINGS_TOKEN_UPDATE_FAILED: "Failed to update API token",
    ErrorCode.SETTINGS_TOKEN_DELETE_FAILED: "Failed to delete API token",
    ErrorCode.SETTINGS_TOKEN_NOT_FOUND: "API token not found",
    ErrorCode.SETTINGS_MODULE_CREATE_FAILED: "Failed to create module",
    ErrorCode.SETTINGS_MODULE_UPDATE_FAILED: "Failed to update module",
    ErrorCode.SETTINGS_MODULE_DELETE_FAILED: "Failed to delete module",
    ErrorCode.SETTINGS_MODULE_NOT_FOUND: "Module not found",
}


def get_error_description(error_code: ErrorCode) -> str:
    """Get human-readable description for an error code"""
    return ERROR_DESCRIPTIONS.get(error_code, "Unknown error")

