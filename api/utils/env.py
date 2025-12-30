"""
Environment Variables Utilities
ابزارهای خواندن environment variables
"""
import os
from pathlib import Path
from typing import Optional

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Try to load .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    env_path = PROJECT_ROOT / '.env'
    if env_path.exists():
        load_dotenv(env_path)
except ImportError:
    pass  # python-dotenv is optional


def get_env(key: str, default: str = "", required: bool = False) -> str:
    """
    Get environment variable with optional default and required check
    
    Args:
        key: Environment variable name
        default: Default value if not set
        required: If True, raise ValueError if not set
    
    Returns:
        Environment variable value
    
    Raises:
        ValueError: If required=True and variable is not set
    """
    value = os.getenv(key, default)
    
    if required and not value:
        raise ValueError(f"Environment variable {key} is required but not set")
    
    return value


def get_env_int(key: str, default: int = 0, required: bool = False) -> int:
    """
    Get environment variable as integer
    
    Args:
        key: Environment variable name
        default: Default value if not set
        required: If True, raise ValueError if not set
    
    Returns:
        Environment variable value as integer
    """
    value = get_env(key, str(default) if default else "", required)
    
    if not value:
        return default
    
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"Environment variable {key} must be an integer, got: {value}")


def get_env_bool(key: str, default: bool = False) -> bool:
    """
    Get environment variable as boolean
    
    Args:
        key: Environment variable name
        default: Default value if not set
    
    Returns:
        Environment variable value as boolean
    """
    value = os.getenv(key, "").lower()
    
    if value in ("true", "1", "yes", "on"):
        return True
    elif value in ("false", "0", "no", "off", ""):
        return False
    
    return default


def get_database_path() -> str:
    """
    Get database path from environment variable or default
    
    Returns:
        Absolute path to database file
    """
    db_path_env = os.getenv("DATABASE_PATH")
    
    if db_path_env:
        db_path = Path(db_path_env)
        if not db_path.is_absolute():
            db_path = PROJECT_ROOT / db_path
        return str(db_path.resolve())
    else:
        return str((PROJECT_ROOT / "data" / "database.db").resolve())


def validate_production_secrets():
    """
    Validate that required secrets are set in production environment
    
    Raises:
        ValueError: If required secrets are missing in production
    """
    if os.getenv("ENVIRONMENT", "").lower() == "production":
        if not get_env("JWT_SECRET_KEY"):
            raise ValueError("JWT_SECRET_KEY must be set in production environment")
        
        if not get_env("WINRM_PASSWORD"):
            import warnings
            warnings.warn("WINRM_PASSWORD is not set - this may cause issues", UserWarning)

