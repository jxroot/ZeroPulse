from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime
import uuid
import re

from api.services.database import Database
from api.utils.logger import logger
from api.dependencies import get_current_user

router = APIRouter(prefix="/api/tunnel-groups", tags=["tunnel-groups"])
db = Database()

# Pydantic Models
class TunnelGroupCreate(BaseModel):
    name: str
    color: Optional[str] = None
    order_index: Optional[int] = 0

class TunnelGroupUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    order_index: Optional[int] = None

class TunnelGroupRuleCreate(BaseModel):
    group_id: str
    pattern: str
    pattern_type: str = "prefix"  # "prefix" or "regex"
    order_index: Optional[int] = 0

class TunnelGroupRuleUpdate(BaseModel):
    group_id: Optional[str] = None
    pattern: Optional[str] = None
    pattern_type: Optional[str] = None
    order_index: Optional[int] = None

class TunnelPatternUpdate(BaseModel):
    pattern: str

# Tunnel Groups endpoints
@router.get("")
async def get_tunnel_groups(current_user: dict = Depends(get_current_user)):
    """Get all tunnel groups"""
    try:
        groups = await db.get_tunnel_groups()
        return {"success": True, "groups": groups}
    except Exception as e:
        logger.exception(f"Error getting tunnel groups: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting tunnel groups: {str(e)}")

@router.post("")
async def create_tunnel_group(group_data: TunnelGroupCreate, current_user: dict = Depends(get_current_user)):
    """Create a new tunnel group"""
    try:
        group_dict = {
            "name": group_data.name,
            "color": group_data.color,
            "order_index": group_data.order_index or 0
        }
        success = await db.create_tunnel_group(group_dict)
        if success:
            # Get the created group
            groups = await db.get_tunnel_groups()
            created_group = next((g for g in groups if g.get("name") == group_data.name), None)
            return {"success": True, "group": created_group}
        raise HTTPException(status_code=500, detail="Failed to create tunnel group")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating tunnel group: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating tunnel group: {str(e)}")

@router.put("/{group_id}")
async def update_tunnel_group(group_id: str, group_data: TunnelGroupUpdate, current_user: dict = Depends(get_current_user)):
    """Update a tunnel group"""
    try:
        update_dict = {}
        if group_data.name is not None:
            update_dict["name"] = group_data.name
        if group_data.color is not None:
            update_dict["color"] = group_data.color
        if group_data.order_index is not None:
            update_dict["order_index"] = group_data.order_index
        
        if not update_dict:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        success = await db.update_tunnel_group(group_id, update_dict)
        if success:
            groups = await db.get_tunnel_groups()
            updated_group = next((g for g in groups if g.get("id") == group_id), None)
            return {"success": True, "group": updated_group}
        raise HTTPException(status_code=404, detail="Tunnel group not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating tunnel group: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating tunnel group: {str(e)}")

@router.delete("/{group_id}")
async def delete_tunnel_group(group_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a tunnel group"""
    try:
        success = await db.delete_tunnel_group(group_id)
        if success:
            return {"success": True, "message": "Tunnel group deleted successfully"}
        raise HTTPException(status_code=404, detail="Tunnel group not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting tunnel group: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting tunnel group: {str(e)}")

# Tunnel Group Rules endpoints
@router.get("/rules")
async def get_tunnel_group_rules(current_user: dict = Depends(get_current_user)):
    """Get all tunnel group rules"""
    try:
        rules = await db.get_tunnel_group_rules()
        return {"success": True, "rules": rules}
    except Exception as e:
        logger.exception(f"Error getting tunnel group rules: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting tunnel group rules: {str(e)}")

@router.post("/rules")
async def create_tunnel_group_rule(rule_data: TunnelGroupRuleCreate, current_user: dict = Depends(get_current_user)):
    """Create a new tunnel group rule"""
    try:
        # Validate pattern_type
        if rule_data.pattern_type not in ["prefix", "regex"]:
            raise HTTPException(status_code=400, detail="pattern_type must be 'prefix' or 'regex'")
        
        # Validate regex pattern if type is regex
        if rule_data.pattern_type == "regex":
            try:
                re.compile(rule_data.pattern)
            except re.error as e:
                raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {str(e)}")
        
        rule_dict = {
            "group_id": rule_data.group_id,
            "pattern": rule_data.pattern,
            "pattern_type": rule_data.pattern_type,
            "order_index": rule_data.order_index or 0
        }
        success = await db.create_tunnel_group_rule(rule_dict)
        if success:
            rules = await db.get_tunnel_group_rules()
            created_rule = next((r for r in rules if r.get("group_id") == rule_data.group_id and r.get("pattern") == rule_data.pattern), None)
            return {"success": True, "rule": created_rule}
        raise HTTPException(status_code=500, detail="Failed to create tunnel group rule")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating tunnel group rule: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating tunnel group rule: {str(e)}")

@router.put("/rules/{rule_id}")
async def update_tunnel_group_rule(rule_id: str, rule_data: TunnelGroupRuleUpdate, current_user: dict = Depends(get_current_user)):
    """Update a tunnel group rule"""
    try:
        update_dict = {}
        if rule_data.group_id is not None:
            update_dict["group_id"] = rule_data.group_id
        if rule_data.pattern is not None:
            update_dict["pattern"] = rule_data.pattern
        if rule_data.pattern_type is not None:
            if rule_data.pattern_type not in ["prefix", "regex"]:
                raise HTTPException(status_code=400, detail="pattern_type must be 'prefix' or 'regex'")
            update_dict["pattern_type"] = rule_data.pattern_type
        if rule_data.order_index is not None:
            update_dict["order_index"] = rule_data.order_index
        
        # Validate regex pattern if type is regex and pattern is provided
        if update_dict.get("pattern_type") == "regex" and update_dict.get("pattern"):
            try:
                re.compile(update_dict["pattern"])
            except re.error as e:
                raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {str(e)}")
        
        if not update_dict:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        success = await db.update_tunnel_group_rule(rule_id, update_dict)
        if success:
            rules = await db.get_tunnel_group_rules()
            updated_rule = next((r for r in rules if r.get("id") == rule_id), None)
            return {"success": True, "rule": updated_rule}
        raise HTTPException(status_code=404, detail="Tunnel group rule not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating tunnel group rule: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating tunnel group rule: {str(e)}")

@router.delete("/rules/{rule_id}")
async def delete_tunnel_group_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a tunnel group rule"""
    try:
        success = await db.delete_tunnel_group_rule(rule_id)
        if success:
            return {"success": True, "message": "Tunnel group rule deleted successfully"}
        raise HTTPException(status_code=404, detail="Tunnel group rule not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting tunnel group rule: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting tunnel group rule: {str(e)}")

# User Settings endpoints
@router.get("/settings/tunnel-pattern")
async def get_tunnel_pattern(current_user: dict = Depends(get_current_user)):
    """Get user's tunnel name pattern filter"""
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        settings = await db.get_user_settings(user_id)
        pattern = settings.get("tunnel_name_pattern") if settings else None
        # Default to "tunnel-" if no pattern is set
        if pattern is None:
            pattern = "tunnel-"
        
        return {"success": True, "pattern": pattern}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting tunnel pattern: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting tunnel pattern: {str(e)}")

@router.put("/settings/tunnel-pattern")
async def update_tunnel_pattern(pattern_data: TunnelPatternUpdate, current_user: dict = Depends(get_current_user)):
    """Update user's tunnel name pattern filter"""
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID not found")
        
        success = await db.update_user_settings(user_id, {"tunnel_name_pattern": pattern_data.pattern})
        if success:
            return {"success": True, "pattern": pattern_data.pattern, "message": "Tunnel pattern updated successfully"}
        raise HTTPException(status_code=500, detail="Failed to update tunnel pattern")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating tunnel pattern: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating tunnel pattern: {str(e)}")

