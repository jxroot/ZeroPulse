"""
Module Control Panel API Routes
Endpoints for managing dynamic module categories, sections, and items
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime
import uuid

from api.services.database import Database
from api.utils.logger import logger
from api.dependencies import get_current_user
from fastapi import HTTPException

router = APIRouter(prefix="/api/module-control", tags=["Module Control"])
db = Database()

async def get_current_user_id(current_user: dict):
    """Helper function to get current user ID"""
    current_user_id = current_user.get("user_id")
    if not current_user_id:
        user = await db.get_user_by_username(current_user.get("username"))
        current_user_id = user.get("id") if user else None
    
    if not current_user_id:
        raise HTTPException(status_code=404, detail="User not found")
    
    return current_user_id

# Pydantic Models
class ModuleCategoryCreate(BaseModel):
    name: str
    label: str
    icon: str
    order_index: int = 0
    is_active: bool = True
    is_default: bool = False

class ModuleCategoryUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    icon: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

class ModuleSectionCreate(BaseModel):
    category_id: str
    name: str
    label: str
    icon: Optional[str] = None
    order_index: int = 0
    is_active: bool = True

class ModuleSectionUpdate(BaseModel):
    category_id: Optional[str] = None
    name: Optional[str] = None
    label: Optional[str] = None
    icon: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None

class ModuleItemCreate(BaseModel):
    section_id: str
    name: str
    label: str
    icon: Optional[str] = None
    command: str
    execution_type: str = "powershell"
    order_index: int = 0
    is_active: bool = True
    requires_admin: bool = False
    description: Optional[str] = None

class ModuleItemUpdate(BaseModel):
    section_id: Optional[str] = None
    name: Optional[str] = None
    label: Optional[str] = None
    icon: Optional[str] = None
    command: Optional[str] = None
    execution_type: Optional[str] = None
    order_index: Optional[int] = None
    is_active: Optional[bool] = None
    requires_admin: Optional[bool] = None
    description: Optional[str] = None

# ==========================================
# Module Categories Endpoints
# ==========================================

@router.get("/categories")
async def get_categories(
    active_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of module categories
    """
    try:
        categories = await db.get_module_categories(active_only=active_only)
        return {
            "success": True,
            "categories": categories,
            "count": len(categories)
        }
    except Exception as e:
        logger.exception(f"Error getting module categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/categories/{category_id}")
async def get_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a specific category
    """
    category = await db.get_module_category(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    return {
        "success": True,
        "category": category
    }

@router.post("/categories")
async def create_category(
    category: ModuleCategoryCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create new category
    """
    try:
        category_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        category_data = {
            "id": category_id,
            "name": category.name,
            "label": category.label,
            "icon": category.icon,
            "order_index": category.order_index,
            "is_active": 1 if category.is_active else 0,
            "is_default": 1 if category.is_default else 0,
            "created_at": now,
            "updated_at": now
        }
        
        success = await db.add_module_category(category_data)
        
        if success:
            return {
                "success": True,
                "message": "Category created successfully",
                "category_id": category_id,
                "category": category_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create category")
    
    except Exception as e:
        logger.exception(f"Error creating module category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    category: ModuleCategoryUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update category
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    try:
        update_data = {**existing}
        
        if category.name is not None:
            update_data["name"] = category.name
        if category.label is not None:
            update_data["label"] = category.label
        if category.icon is not None:
            update_data["icon"] = category.icon
        if category.order_index is not None:
            update_data["order_index"] = category.order_index
        if category.is_active is not None:
            update_data["is_active"] = 1 if category.is_active else 0
        if category.is_default is not None:
            update_data["is_default"] = 1 if category.is_default else 0
        
        update_data["updated_at"] = datetime.now().isoformat()
        
        success = await db.update_module_category(category_id, update_data)
        
        if success:
            return {
                "success": True,
                "message": "Category updated successfully",
                "category": update_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update category")
    
    except Exception as e:
        logger.exception(f"Error updating module category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/categories/{category_id}/set-default")
async def set_default_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Set a category as default
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    try:
        # Unset all other defaults
        all_categories = await db.get_module_categories(active_only=False)
        for cat in all_categories:
            if cat["id"] != category_id and cat.get("is_default"):
                update_data = {**cat}
                update_data["is_default"] = 0
                update_data["updated_at"] = datetime.now().isoformat()
                await db.update_module_category(cat["id"], update_data)
        
        # Set this category as default
        update_data = {**existing}
        update_data["is_default"] = 1
        update_data["updated_at"] = datetime.now().isoformat()
        
        success = await db.update_module_category(category_id, update_data)
        
        if success:
            return {
                "success": True,
                "message": "Default category set successfully",
                "category": update_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to set default category")
    
    except Exception as e:
        logger.exception(f"Error setting default category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/categories/{category_id}/unset-default")
async def unset_default_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Remove category from default state
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    try:
        update_data = {**existing}
        update_data["is_default"] = 0
        update_data["updated_at"] = datetime.now().isoformat()
        
        success = await db.update_module_category(category_id, update_data)
        
        if success:
            return {
                "success": True,
                "message": "Default category unset successfully",
                "category": update_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to unset default category")
    
    except Exception as e:
        logger.exception(f"Error unsetting default category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete category
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_category(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    try:
        success = await db.delete_module_category(category_id)
        
        if success:
            return {
                "success": True,
                "message": "Category deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to delete category")
    
    except Exception as e:
        logger.exception(f"Error deleting module category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# Module Sections Endpoints
# ==========================================

@router.get("/sections")
async def get_sections(
    category_id: Optional[str] = None,
    active_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of module sections
    """
    try:
        sections = await db.get_module_sections(category_id=category_id, active_only=active_only)
        return {
            "success": True,
            "sections": sections,
            "count": len(sections)
        }
    except Exception as e:
        logger.exception(f"Error getting module sections: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sections/{section_id}")
async def get_section(
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a specific section
    """
    section = await db.get_module_section(section_id)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    
    return {
        "success": True,
        "section": section
    }

@router.post("/sections")
async def create_section(
    section: ModuleSectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create new section
    """
    try:
        await get_current_user_id(current_user)
        section_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        section_data = {
            "id": section_id,
            "category_id": section.category_id,
            "name": section.name,
            "label": section.label,
            "icon": section.icon,
            "order_index": section.order_index,
            "is_active": 1 if section.is_active else 0,
            "created_at": now,
            "updated_at": now
        }
        
        success = await db.add_module_section(section_data)
        
        if success:
            return {
                "success": True,
                "message": "Section created successfully",
                "section_id": section_id,
                "section": section_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create section")
    
    except Exception as e:
        logger.exception(f"Error creating module section: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/sections/{section_id}")
async def update_section(
    section_id: str,
    section: ModuleSectionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update section
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_section(section_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Section not found")
    
    try:
        update_data = {**existing}
        
        if section.category_id is not None:
            update_data["category_id"] = section.category_id
        if section.name is not None:
            update_data["name"] = section.name
        if section.label is not None:
            update_data["label"] = section.label
        if section.icon is not None:
            update_data["icon"] = section.icon
        if section.order_index is not None:
            update_data["order_index"] = section.order_index
        if section.is_active is not None:
            update_data["is_active"] = 1 if section.is_active else 0
        
        update_data["updated_at"] = datetime.now().isoformat()
        
        success = await db.update_module_section(section_id, update_data)
        
        if success:
            return {
                "success": True,
                "message": "Section updated successfully",
                "section": update_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update section")
    
    except Exception as e:
        logger.exception(f"Error updating module section: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sections/{section_id}")
async def delete_section(
    section_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete section
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_section(section_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Section not found")
    
    try:
        success = await db.delete_module_section(section_id)
        
        if success:
            return {
                "success": True,
                "message": "Section deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to delete section")
    
    except Exception as e:
        logger.exception(f"Error deleting module section: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# Module Items Endpoints
# ==========================================

@router.get("/items")
async def get_items(
    section_id: Optional[str] = None,
    active_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of module items
    """
    try:
        items = await db.get_module_items(section_id=section_id, active_only=active_only)
        return {
            "success": True,
            "items": items,
            "count": len(items)
        }
    except Exception as e:
        logger.exception(f"Error getting module items: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/items/{item_id}")
async def get_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get a specific item
    """
    item = await db.get_module_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {
        "success": True,
        "item": item
    }

@router.post("/items")
async def create_item(
    item: ModuleItemCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Create new item
    """
    try:
        # Get current user ID
        current_user_id = await get_current_user_id(current_user)
        item_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        item_data = {
            "id": item_id,
            "section_id": item.section_id,
            "name": item.name,
            "label": item.label,
            "icon": item.icon,
            "command": item.command,
            "execution_type": item.execution_type,
            "order_index": item.order_index,
            "is_active": 1 if item.is_active else 0,
            "requires_admin": 1 if item.requires_admin else 0,
            "description": item.description,
            "created_at": now,
            "updated_at": now
        }
        
        success = await db.add_module_item(item_data)
        
        if success:
            return {
                "success": True,
                "message": "Item created successfully",
                "item_id": item_id,
                "item": item_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to create item")
    
    except Exception as e:
        logger.exception(f"Error creating module item: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/items/{item_id}")
async def update_item(
    item_id: str,
    item: ModuleItemUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update item
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_item(item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        update_data = {**existing}
        
        if item.section_id is not None:
            update_data["section_id"] = item.section_id
        if item.name is not None:
            update_data["name"] = item.name
        if item.label is not None:
            update_data["label"] = item.label
        if item.icon is not None:
            update_data["icon"] = item.icon
        if item.command is not None:
            update_data["command"] = item.command
        if item.execution_type is not None:
            update_data["execution_type"] = item.execution_type
        if item.order_index is not None:
            update_data["order_index"] = item.order_index
        if item.is_active is not None:
            update_data["is_active"] = 1 if item.is_active else 0
        if item.requires_admin is not None:
            update_data["requires_admin"] = 1 if item.requires_admin else 0
        if item.description is not None:
            update_data["description"] = item.description
        
        update_data["updated_at"] = datetime.now().isoformat()
        
        success = await db.update_module_item(item_id, update_data)
        
        if success:
            return {
                "success": True,
                "message": "Item updated successfully",
                "item": update_data
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to update item")
    
    except Exception as e:
        logger.exception(f"Error updating module item: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete item
    """
    await get_current_user_id(current_user)
    existing = await db.get_module_item(item_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        success = await db.delete_module_item(item_id)
        
        if success:
            return {
                "success": True,
                "message": "Item deleted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to delete item")
    
    except Exception as e:
        logger.exception(f"Error deleting module item: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# Full Structure Endpoint
# ==========================================

@router.get("/structure")
async def get_full_structure(
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete module structure (category + section + item)
    """
    try:
        structure = await db.get_full_module_structure()
        return {
            "success": True,
            "structure": structure,
            "count": len(structure)
        }
    except Exception as e:
        logger.exception(f"Error getting full module structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# Bulk Operations
# ==========================================

@router.post("/import")
async def import_structure(
    structure: Dict,
    current_user: dict = Depends(get_current_user)
):
    """
    Import complete module structure
    """
    try:
        # TODO: Implement bulk import
        return {
            "success": True,
            "message": "Structure imported successfully"
        }
    except Exception as e:
        logger.exception(f"Error importing module structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export")
async def export_structure(
    current_user: dict = Depends(get_current_user)
):
    """
    Export complete module structure
    """
    try:
        structure = await db.get_full_module_structure()
        return {
            "success": True,
            "structure": structure,
            "export_date": datetime.now().isoformat()
        }
    except Exception as e:
        logger.exception(f"Error exporting module structure: {e}")
        raise HTTPException(status_code=500, detail=str(e))




