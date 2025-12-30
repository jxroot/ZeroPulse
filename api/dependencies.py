"""
FastAPI Dependencies
Dependencies برای استفاده در routes
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
from api.services.auth import verify_token
from api.services.session_manager import session_manager
from api.utils.logger import logger

security = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dependency برای بررسی authentication در routes
    
    Args:
        credentials: HTTP Authorization credentials از header
    
    Returns:
        dict با اطلاعات user
    
    Raises:
        HTTPException: اگر token نامعتبر باشد
    """
    token = credentials.credentials
    
    # بررسی اینکه آیا token revoked شده است یا نه
    if await session_manager.is_token_revoked(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # بررسی JWT token
    payload = verify_token(token)
    if payload is None:
        logger.warning(f"Token verification failed: token is invalid or expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"Token verified successfully, payload: {payload}")
    
    # Get user from database - use session as primary source for username
    from api.services.database import Database
    db = Database()
    
    # First, try to get session from database (session is the source of truth)
    session = await session_manager.get_session(token)
    username: Optional[str] = None
    
    if session:
        # Use username from session (most reliable source)
        username = session.get("username")
        logger.info(f"Got username from session: '{username}'")
    else:
        # Fallback to token if session doesn't exist
        username = payload.get("username")
        if not username:
            username = payload.get("sub")
            logger.warning(f"Token payload missing 'username', using 'sub' field: {username}")
        
        if username is None:
            logger.error(f"Token payload missing both 'username' and 'sub': {payload}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        logger.info(f"Using username from token (no session found): '{username}'")
    
    logger.info(f"Final username to use: '{username}' (type: {type(username)}, repr: {repr(username)})")
    
    # Get user from database using the username (from session or token)
    user = await db.get_user_by_username(username)
    
    if not user:
        # Log for debugging (but don't expose user list in error response for security)
        logger.error(f"User not found in database: username='{username}' (type: {type(username)}, repr: {repr(username)}, length: {len(username) if username else 0})")
        logger.error(f"Token payload: {payload}")
        logger.error(f"Session: {session}")
        
        # Get all users for logging (but don't expose in error response)
        all_users = await db.get_users()
        available_usernames = [u.get('username') for u in all_users]
        logger.error(f"Available users in database (for logging only): {available_usernames}")
        
        # Try case-insensitive search
        for u in all_users:
            db_username = u.get('username')
            if db_username and db_username.lower() == username.lower():
                logger.warning(f"Found user with case-insensitive match: '{db_username}' matches '{username}'")
                user = await db.get_user_by_username(db_username)
                if user:
                    username = db_username  # Update username to match database
                break
        
        if not user:
            # Don't expose user list for security reasons
            logger.error(f"User not found: username='{username}', but user doesn't exist in database")
            logger.error(f"This usually means the token/session was created with a different username than what exists in the database")
            logger.error(f"User should logout and login again to get a new token with correct username")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "error_code": "ERR_1000",
                    "message": "User not found",
                    "detail": "User not found. The token may be invalid or the user account may have been changed. Please logout and login again.",
                    "context": {
                        "username": username
                    }
                },
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    # Session already retrieved above, verify it exists
    # If session doesn't exist, allow access (backward compatibility for single user system)
    if not session:
        logger.warning(f"Session not found for user '{username}', but allowing access for backward compatibility")
        # Try to create session if possible (for future requests)
        try:
            # We don't have request context here, so we can't get IP/UA
            # But we can still create a basic session entry
            await session_manager.add_session(token, username, None, None)
            logger.info(f"Created session for user '{username}'")
        except Exception as e:
            logger.warning(f"Could not create session for user: {e}")
    
    # بررسی اینکه user active است
    if not user.get("is_active", 1):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # به‌روزرسانی آخرین فعالیت نشست (اگر session وجود داشته باشد)
    if session:
        await session_manager.update_activity(token)
    
    user_id = user.get("id")
    if not user_id:
        logger.error(f"User object missing 'id' field: {user}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User data is invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"get_current_user returning: username='{username}', user_id='{user_id}'")
    
    return {
        "username": username,
        "sub": payload.get("sub"),
        "user_id": user_id
    }

