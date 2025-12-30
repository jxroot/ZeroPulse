"""
User Management Routes
Single user management
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel, field_validator
from api.services.database import Database
from api.dependencies import get_current_user
from api.utils.logger import logger
from api.utils.password import validate_password_strength
from api.services.session_manager import session_manager

db = Database()
router = APIRouter(prefix="/api/users", tags=["users"])


# Pydantic Models
class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if v is not None:
            if len(v.strip()) == 0:
                raise ValueError("Username cannot be empty")
            if len(v) > 100:
                raise ValueError("Username must be less than 100 characters")
            return v.strip()
        return v
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if v is not None:
            is_valid, error_msg = validate_password_strength(v)
            if not is_valid:
                raise ValueError(error_msg)
        return v


@router.get("/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """Get current user's information"""
    username = current_user.get("username")
    if not username:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = await db.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Remove sensitive information
    user_data = {
        "id": user.get("id"),
        "username": user.get("username"),
        "is_active": user.get("is_active"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at")
    }
    
    return {"success": True, "user": user_data}


@router.put("/me")
async def update_current_user(user_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's information"""
    username = current_user.get("username")
    if not username:
        raise HTTPException(status_code=404, detail="User not found")
    
    user = await db.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prepare updates
    updates = {k: v for k, v in user_data.dict(exclude_unset=True).items() if v is not None}
    
    # Check if username or password is being changed
    username_changed = "username" in updates and updates["username"] != username
    password_changed = "password" in updates
    
    # Validate password strength if password is being updated
    if password_changed:
        is_valid, error_msg = validate_password_strength(updates["password"])
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)
    
    # If username is being changed, check if it already exists
    if username_changed:
        new_username = updates["username"]
        existing = await db.get_user_by_username(new_username)
        if existing and existing.get("id") != user_id:
            raise HTTPException(status_code=400, detail="Username already exists")
    
    # Update user
    success = await db.update_user(user_id, updates)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update user")
    
    # If username or password changed, invalidate all sessions for this user
    should_logout = False
    if username_changed or password_changed:
        should_logout = True
        # Get all sessions for this user
        all_sessions = await session_manager.get_all_sessions()
        sessions_to_remove = []
        
        for session_token, session_info in all_sessions.items():
            session_username = session_info.get("username", "")
            # Remove all sessions for this user (both old and new username if username changed)
            if session_username == username or (username_changed and session_username == updates.get("username")):
                sessions_to_remove.append(session_token)
        
        # Remove all sessions
        removed_count = 0
        for token in sessions_to_remove:
            try:
                await session_manager.remove_session(token)
                removed_count += 1
            except Exception as e:
                logger.warning(f"Error removing session {token[:30]}...: {e}")
        
        logger.info(f"Invalidated {removed_count} session(s) for user {username} due to {'username' if username_changed else 'password'} change")
    
    return {
        "success": True,
        "message": "User updated successfully",
        "should_logout": should_logout  # Flag to tell frontend to logout
    }
