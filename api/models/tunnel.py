from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import re


class Connection(BaseModel):
    """Connection model for Tunnel"""
    colo_name: Optional[str] = None
    uuid: Optional[str] = None
    id: Optional[str] = None
    is_pending_reconnect: Optional[bool] = False
    origin_ip: Optional[str] = None
    opened_at: Optional[str] = None
    client_id: Optional[str] = None
    client_version: Optional[str] = None


class Tunnel(BaseModel):
    id: str
    account_tag: Optional[str] = None
    created_at: Optional[str] = None
    deleted_at: Optional[str] = None
    name: str
    connections: Optional[List[Connection]] = []
    conns_active_at: Optional[str] = None
    conns_inactive_at: Optional[str] = None
    tun_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}
    status: str = "down"
    remote_config: Optional[bool] = False
    # Additional fields from database
    hostname: Optional[str] = None
    token: Optional[str] = None
    label: Optional[str] = None
    connection_type: Optional[str] = None
    # Group fields
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    group_color: Optional[str] = None


class TunnelCreate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None


class TunnelResponse(BaseModel):
    success: bool
    tunnel_id: Optional[str] = None
    token: Optional[str] = None
    name: Optional[str] = None
    tunnel: Optional[Tunnel] = None
    message: Optional[str] = None


class TunnelLabelUpdate(BaseModel):
    """Model for updating tunnel label with validation and sanitization"""
    label: Optional[str] = Field(
        None,
        max_length=20,
        description="Tunnel label (max 20 characters)"
    )
    
    @field_validator('label', mode='before')
    @classmethod
    def validate_and_sanitize_label(cls, v):
        """Validate and sanitize label"""
        if v is None:
            return None
        
        # Convert to string if not already
        if not isinstance(v, str):
            v = str(v)
        
        # Strip whitespace
        v = v.strip()
        
        # If empty after strip, return None
        if not v:
            return None
        
        # Remove dangerous characters (SQL injection, XSS, etc.)
        # Allow: alphanumeric, spaces, hyphens, underscores, and common Unicode characters
        v = re.sub(r'[<>"\';\\]', '', v)
        
        # Limit length to 20 characters
        if len(v) > 20:
            raise ValueError("Label must be 20 characters or less")
        
        return v


class TunnelUpdate(BaseModel):
    """Model for updating tunnel info"""
    name: Optional[str] = None
    hostname: Optional[str] = None
    
    @field_validator('name', mode='before')
    @classmethod
    def validate_name(cls, v):
        """Validate and sanitize name"""
        if v is None:
            return None
        if not isinstance(v, str):
            v = str(v)
        v = v.strip()
        if not v:
            return None
        # Remove dangerous characters
        v = re.sub(r'[<>"\';\\]', '', v)
        if len(v) > 100:
            raise ValueError("Name must be 100 characters or less")
        return v
    
    @field_validator('hostname', mode='before')
    @classmethod
    def validate_hostname(cls, v):
        """Validate and sanitize hostname"""
        if v is None:
            return None
        if not isinstance(v, str):
            v = str(v)
        v = v.strip()
        if not v:
            return None
        # Basic hostname validation (RFC 1123)
        if not re.match(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$', v):
            raise ValueError("Invalid hostname format")
        return v

