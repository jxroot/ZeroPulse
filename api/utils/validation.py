"""
Validation and Sanitization Utilities
Data validation and sanitization tools
"""
import re
from typing import Optional, Any


def sanitize_string(value: Any, max_length: Optional[int] = None, allow_empty: bool = True) -> Optional[str]:
    """
    Sanitize string input by removing dangerous characters
    
    Args:
        value: Input value to sanitize
        max_length: Maximum allowed length
        allow_empty: Whether to allow empty strings (returns None if False and empty)
    
    Returns:
        Sanitized string or None
    """
    if value is None:
        return None
    
    # Convert to string
    if not isinstance(value, str):
        value = str(value)
    
    # Strip whitespace
    value = value.strip()
    
    # If empty after strip
    if not value:
        return None if not allow_empty else ""
    
    # Remove dangerous characters (SQL injection, XSS, command injection, etc.)
    # Allow: alphanumeric, spaces, hyphens, underscores, dots, colons, slashes (for URLs)
    # Remove: < > " ' ; \ | & $ ` ( ) { } [ ] * ? ~ ! @ # % ^
    value = re.sub(r'[<>"\';\\|&$`(){}[\]*?~!@#%^]', '', value)
    
    # Limit length
    if max_length and len(value) > max_length:
        raise ValueError(f"Value must be {max_length} characters or less")
    
    return value


def validate_hostname(hostname: str, domain: Optional[str] = None) -> str:
    """
    Validate and sanitize hostname
    
    Args:
        hostname: Hostname to validate
        domain: Optional domain to validate against (hostname must end with this domain)
    
    Returns:
        Validated hostname
    
    Raises:
        ValueError: If hostname is invalid
    """
    if not hostname:
        raise ValueError("Hostname cannot be empty")
    
    hostname = hostname.strip().lower()
    
    # Basic hostname validation (RFC 1123)
    # Allow: alphanumeric, hyphens, dots
    if not re.match(r'^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?)*$', hostname):
        raise ValueError("Invalid hostname format")
    
    # Max length for hostname (253 characters per RFC)
    if len(hostname) > 253:
        raise ValueError("Hostname too long (max 253 characters)")
    
    # Each label max 63 characters
    labels = hostname.split('.')
    for label in labels:
        if len(label) > 63:
            raise ValueError("Hostname label too long (max 63 characters per label)")
    
    # Validate domain if provided
    if domain:
        domain = domain.strip().lower()
        if not hostname.endswith(f".{domain}") and hostname != domain:
            raise ValueError(f"Hostname must end with domain '{domain}' (e.g., subdomain.{domain})")
    
    return hostname


def validate_tunnel_id(tunnel_id: str) -> str:
    """
    Validate tunnel ID format (UUID)
    
    Args:
        tunnel_id: Tunnel ID to validate
    
    Returns:
        Validated tunnel ID
    
    Raises:
        ValueError: If tunnel ID is invalid
    """
    if not tunnel_id:
        raise ValueError("Tunnel ID cannot be empty")
    
    tunnel_id = tunnel_id.strip()
    
    # UUID format validation
    if not re.match(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', tunnel_id, re.IGNORECASE):
        raise ValueError("Invalid tunnel ID format (must be UUID)")
    
    return tunnel_id.lower()


def sanitize_url(url: str) -> str:
    """
    Sanitize URL input
    
    Args:
        url: URL to sanitize
    
    Returns:
        Sanitized URL
    
    Raises:
        ValueError: If URL is invalid
    """
    if not url:
        raise ValueError("URL cannot be empty")
    
    url = url.strip()
    
    # Basic URL validation
    # Allow: http://, https://, tcp://, ssh://
    if not re.match(r'^(http|https|tcp|ssh)://', url, re.IGNORECASE):
        raise ValueError("Invalid URL scheme (must be http://, https://, tcp://, or ssh://)")
    
    # Remove dangerous characters but keep URL structure
    # Remove: < > " ' ; \ | & $ ` ( ) { } [ ] * ? ~ ! @ # % ^
    url = re.sub(r'[<>"\';\\|&$`(){}[\]*?~!@#%^]', '', url)
    
    return url


def validate_label(label: Optional[str], max_length: int = 20) -> Optional[str]:
    """
    Validate and sanitize label
    
    Args:
        label: Label to validate
        max_length: Maximum length (default 20)
    
    Returns:
        Validated label or None
    """
    return sanitize_string(label, max_length=max_length, allow_empty=True)





