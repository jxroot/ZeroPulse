"""
Authentication Routes
Routes related to authentication
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator
from typing import Optional
from api.services.auth import authenticate_user, create_access_token, verify_token
from api.services.session_manager import session_manager
from api.dependencies import get_current_user
from api.utils.logger import logger, log_error_with_context
from api.utils.exceptions import AuthenticationError
from api.utils.error_codes import ErrorCode
from api.utils.password import validate_password_strength
from api.middleware.rate_limit import limiter
from datetime import timedelta

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer()


class LoginRequest(BaseModel):
    username: str
    password: str
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Username cannot be empty")
        if len(v) > 100:
            raise ValueError("Username must be less than 100 characters")
        return v.strip()
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if not v or len(v) == 0:
            raise ValueError("Password cannot be empty")
        return v


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # Expiration time in seconds


class VerifyResponse(BaseModel):
    valid: bool
    username: Optional[str] = None


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")  # Rate limit: 5 requests per minute
async def login(login_data: LoginRequest, request: Request):
    """
    User login and JWT token retrieval
    """
    # Check credentials
    if not await authenticate_user(login_data.username, login_data.password):
        raise AuthenticationError(
            message="Invalid credentials",
            detail="Incorrect username or password",
            context={"username": login_data.username}
        )
    
    # Create token
    access_token = create_access_token(
        data={"sub": login_data.username, "username": login_data.username}
    )
    
    # Add session to session manager
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    await session_manager.add_session(access_token, login_data.username, client_ip, user_agent)
    
    # Calculate expires_in (in seconds)
    from api.utils.env import get_env_int
    expires_in = get_env_int("JWT_EXPIRATION_HOURS", 24) * 3600
    
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in
    )


@router.get("/verify", response_model=VerifyResponse)
async def verify_token_endpoint(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify token validity
    Checks that:
    1. Token is valid (JWT signature)
    2. Session exists in database
    3. User exists in database and is active
    """
    token = credentials.credentials
    
    # Check JWT token
    payload = verify_token(token)
    if payload is None:
        raise AuthenticationError(
            message="Invalid or expired token",
            detail="The provided token is invalid or has expired",
            error_code=ErrorCode.AUTH_TOKEN_INVALID,
            context={"token_length": len(token) if token else 0}
        )
    
    username = payload.get("username")
    if not username:
        raise AuthenticationError(
            message="Invalid token payload",
            detail="Token payload does not contain username",
            error_code=ErrorCode.AUTH_TOKEN_INVALID
        )
    
    # Check if user exists in database and is active
    from api.services.database import Database
    db = Database()
    user = await db.get_user_by_username(username)
    
    if not user:
        raise AuthenticationError(
            message="User not found",
            detail="User account does not exist. Please login again.",
            error_code=ErrorCode.AUTH_TOKEN_INVALID
        )
    
    if not user.get("is_active", 1):
        raise AuthenticationError(
            message="User account disabled",
            detail="Your account has been disabled. Please contact administrator.",
            error_code=ErrorCode.AUTH_TOKEN_INVALID
        )
    
    # Check if session exists in database
    # If session not found but token is valid, create new session
    session = await session_manager.get_session(token)
    if not session:
        # Token is valid but session not found - create new session
        # This can happen when database restarted or session was cleaned up
        logger.info(f"Session not found for valid token, recreating session for user: {username}")
        # Create session without IP/user_agent (we don't have access to Request here)
        await session_manager.add_session(token, username, None, None)
    
    return VerifyResponse(valid=True, username=username)


@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Logout and remove session
    """
    token = credentials.credentials
    await session_manager.remove_session(token)
    return {"message": "Logged out successfully"}


# ==================== Active Sessions ====================

@router.get("/sessions")
async def get_active_sessions(current_user: dict = Depends(get_current_user)):
    """
    Get list of active sessions
    For regular users: only their own sessions
    For admin: all sessions with is_current_user flag
    """
    try:
        all_sessions = await session_manager.get_all_sessions()
        current_username = current_user.get("username")
        current_role_id = current_user.get("role_id")
        is_admin = current_role_id == "role-admin"
        
        if is_admin:
            # Admin can see all sessions, but mark which ones belong to them
            sessions = []
            for session in all_sessions:
                session_copy = session.copy()
                session_copy["is_current_user"] = session.get("username") == current_username
                sessions.append(session_copy)
            return {
                "success": True,
                "sessions": sessions,
                "total": len(sessions),
                "is_admin": True
            }
        else:
            # Regular users can only see their own sessions
            user_sessions = [
                session for session in all_sessions 
                if session.get("username") == current_username
            ]
            return {
                "success": True,
                "sessions": user_sessions,
                "total": len(user_sessions),
                "is_admin": False
            }
    except Exception as e:
        log_error_with_context(
            message="Error getting active sessions",
            error_code=ErrorCode.INTERNAL_ERROR.value,
            context={"endpoint": "/api/auth/sessions"},
            exception=e
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": ErrorCode.INTERNAL_ERROR.value,
                "message": "Error getting active sessions",
                "detail": str(e)
            }
        )


@router.delete("/sessions/{session_token}")
async def terminate_session(session_token: str, current_user: dict = Depends(get_current_user)):
    """
    Terminate a specific session
    """
    try:
        from urllib.parse import unquote
        # URL decode the token
        session_token = unquote(session_token)
        
        # Search for session with partial token in memory and database
        full_token_to_remove = await session_manager.find_session_by_partial_token(session_token)
        
        if not full_token_to_remove:
            # If not found, maybe session_token itself is a full token
            # Check if it exists in sessions
            if await session_manager.get_session(session_token):
                full_token_to_remove = session_token
            else:
                raise HTTPException(status_code=404, detail="Session not found")
        
        # Check that full_token_to_remove is actually a full token
        if len(full_token_to_remove) < 100:
            logger.warning(f"WARNING: Token seems too short ({len(full_token_to_remove)} chars), might be partial: {full_token_to_remove[:50]}...")
            # Try to find full token again
            full_token_to_remove = await session_manager.find_session_by_partial_token(full_token_to_remove)
            if not full_token_to_remove or len(full_token_to_remove) < 100:
                logger.error(f"ERROR: Could not find full token for partial: {session_token[:50]}...")
                raise HTTPException(status_code=404, detail="Session not found - could not resolve full token")
        
        logger.info(f"Terminating session with full token (length: {len(full_token_to_remove)}): {full_token_to_remove[:30]}...")
        
        # Remove session and add to blacklist
        await session_manager.remove_session(full_token_to_remove)
        
        return {
            "success": True,
            "message": "Session terminated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        log_error_with_context(
            message="Error terminating session",
            error_code=ErrorCode.INTERNAL_ERROR.value,
            context={"endpoint": "/api/auth/sessions", "session_token_length": len(session_token)},
            exception=e
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": ErrorCode.INTERNAL_ERROR.value,
                "message": "Error terminating session",
                "detail": str(e)
            }
        )


@router.delete("/sessions")
async def terminate_all_sessions(request: Request, current_user: dict = Depends(get_current_user)):
    """
    Terminate all sessions (except current session)
    """
    try:
        # Get current token from Authorization header
        current_token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            current_token = auth_header.replace("Bearer ", "").strip()
        
        if not current_token:
            raise HTTPException(status_code=400, detail="Could not extract current token from request")
        
        logger.info(f"Terminating all sessions except current token: {current_token[:30]}...")
        
        # Get all sessions from database
        # Must use database to get full tokens
        tokens_to_remove = []
        
        # Get all sessions from database
        db_sessions = await session_manager.db.get_all_sessions()
        logger.info(f"Found {len(db_sessions)} sessions in database")
        
        for session in db_sessions:
            # Get full token from database session
            # In database.get_all_sessions(), 'full_token' field contains the full token
            full_token = session.get("full_token", "")
            if not full_token:
                # Fallback: try to get from 'token' field (raw database field)
                full_token = session.get("token", "")
            
            if not full_token:
                logger.warning(f"Session has no token/full_token field: {list(session.keys())}")
                continue
            
            # Verify it's a full token (JWT tokens are usually > 100 chars)
            if len(full_token) < 100:
                logger.warning(f"Token seems too short ({len(full_token)} chars), skipping: {full_token[:30]}...")
                continue
            
            # Skip current token
            if full_token == current_token:
                logger.info(f"Skipping current token: {full_token[:30]}...")
                continue
            
            tokens_to_remove.append(full_token)
            logger.info(f"Added token to remove list (length: {len(full_token)}): {full_token[:30]}...")
        
        logger.info(f"Found {len(tokens_to_remove)} sessions to terminate (excluding current token)")
        
        # Remove all sessions except current session
        count = 0
        for token in tokens_to_remove:
            try:
                await session_manager.remove_session(token)
                count += 1
            except Exception as e:
                logger.warning(f"Error removing session {token[:30]}...: {e}")
        
        logger.info(f"Terminated {count} session(s), keeping current session active")
        
        return {
            "success": True,
            "message": f"Terminated {count} session(s). Your current session remains active.",
            "terminated_count": count
        }
    except HTTPException:
        raise
    except Exception as e:
        log_error_with_context(
            message="Error terminating all sessions",
            error_code=ErrorCode.INTERNAL_ERROR.value,
            context={"endpoint": "/api/auth/sessions"},
            exception=e
        )
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": ErrorCode.INTERNAL_ERROR.value,
                "message": "Error terminating sessions",
                "detail": str(e)
            }
        )

