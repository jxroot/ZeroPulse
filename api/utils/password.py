"""
Password Utilities
ابزارهای مدیریت رمز عبور با bcrypt
"""
import bcrypt
import re
from typing import Tuple, Optional


def hash_password(password: str) -> str:
    """
    Hash password با استفاده از bcrypt
    
    Args:
        password: رمز عبور plain text
    
    Returns:
        Hashed password string
    """
    # Generate salt and hash password
    salt = bcrypt.gensalt(rounds=12)  # 12 rounds برای تعادل بین امنیت و عملکرد
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    بررسی password با استفاده از bcrypt
    
    Args:
        plain_password: رمز عبور plain text
        hashed_password: رمز عبور hashed شده
    
    Returns:
        True اگر password صحیح باشد، False در غیر این صورت
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception:
        return False


def validate_password_strength(password: str) -> Tuple[bool, Optional[str]]:
    """
    بررسی قدرت رمز عبور
    
    Requirements:
    - حداقل 8 کاراکتر
    - حداقل یک حرف بزرگ
    - حداقل یک حرف کوچک
    - حداقل یک عدد
    - حداقل یک کاراکتر خاص (!@#$%^&*)
    
    Args:
        password: رمز عبور برای بررسی
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not password:
        return False, "Password cannot be empty"
    
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    
    if len(password) > 128:
        return False, "Password must be less than 128 characters"
    
    # Check for at least one uppercase letter
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    # Check for at least one lowercase letter
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    # Check for at least one digit
    if not re.search(r'\d', password):
        return False, "Password must contain at least one number"
    
    # Check for at least one special character
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>/?]', password):
        return False, "Password must contain at least one special character (!@#$%^&*...)"
    
    # Check for common weak passwords
    weak_passwords = [
        'password', '12345678', 'qwerty', 'abc123', 'password123',
        'admin', 'letmein', 'welcome', 'monkey', '1234567890'
    ]
    if password.lower() in weak_passwords:
        return False, "Password is too common. Please choose a stronger password"
    
    return True, None


def verify_password_with_migration(plain_password: str, hashed_password: str) -> Tuple[bool, Optional[str]]:
    """
    بررسی password با پشتیبانی از migration از SHA256 به bcrypt
    
    Args:
        plain_password: رمز عبور plain text
        hashed_password: رمز عبور hashed شده (bcrypt یا SHA256)
    
    Returns:
        Tuple of (is_valid, new_bcrypt_hash)
        - is_valid: True اگر password صحیح باشد
        - new_bcrypt_hash: bcrypt hash جدید اگر migration انجام شد، None در غیر این صورت
    """
    import hashlib
    
    # Try bcrypt verification first
    if verify_password(plain_password, hashed_password):
        return True, None
    
    # If bcrypt fails, try SHA256 (for migration from old system)
    sha256_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    if sha256_hash == hashed_password:
        # Password matches old SHA256 hash - return new bcrypt hash for migration
        return True, hash_password(plain_password)
    
    return False, None


def migrate_sha256_to_bcrypt(sha256_hash: str, plain_password: str) -> Optional[str]:
    """
    تبدیل password از SHA256 به bcrypt (برای migration)
    
    Args:
        sha256_hash: Hash قدیمی SHA256
        plain_password: رمز عبور plain text برای verify کردن
    
    Returns:
        bcrypt hash جدید یا None اگر verify نشد
    """
    import hashlib
    
    # Verify old hash
    computed_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    if computed_hash == sha256_hash:
        # Return new bcrypt hash
        return hash_password(plain_password)
    
    return None

