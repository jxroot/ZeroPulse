"""
Authentication Service
مدیریت احراز هویت با JWT
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from api.utils.password import verify_password_with_migration
from api.utils.env import get_env, get_env_int, validate_production_secrets

# Load JWT settings (will validate in production)
JWT_SECRET_KEY = get_env("JWT_SECRET_KEY", "")
JWT_ALGORITHM = get_env("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = get_env_int("JWT_EXPIRATION_HOURS", 24)

# Validate production secrets on import
validate_production_secrets()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    ایجاد JWT access token
    
    Args:
        data: داده‌های مورد نظر برای encode در token
        expires_delta: مدت زمان اعتبار token (اختیاری)
    
    Returns:
        JWT token string
    """
    to_encode = data.copy()
    
    # اگر exp در data وجود دارد، از آن استفاده می‌کنیم (برای never expire)
    if "exp" not in to_encode:
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
        to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """
    بررسی اعتبار JWT token
    
    Args:
        token: JWT token string
    
    Returns:
        dict با اطلاعات user یا None اگر token نامعتبر باشد
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


async def authenticate_user(username: str, password: str) -> bool:
    """
    احراز هویت کاربر
    
    Args:
        username: نام کاربری
        password: رمز عبور
    
    Returns:
        True اگر credentials صحیح باشد، False در غیر این صورت
    """
    from api.services.database import Database
    from datetime import datetime
    
    db = Database()
    
    # Try to get user from database
    user = await db.get_user_by_username(username)
    
    if not user:
        return False
    
    # Check if user is active
    if not user.get("is_active", 1):
        return False
    
    # Verify password (supports both bcrypt and SHA256 for migration)
    stored_hash = user.get("password_hash")
    is_valid, new_hash = verify_password_with_migration(password, stored_hash)
    
    if is_valid:
        # Update last login
        update_data = {"last_login": datetime.now().isoformat()}
        
        # If password was migrated from SHA256 to bcrypt, update hash
        if new_hash:
            update_data["password_hash"] = new_hash
        
        await db.update_user(user["id"], update_data)
        return True
    
    return False

