"""
C2 Server startup script
"""

import uvicorn
import os
from api.utils.env import get_env, get_env_int

C2_SERVER_HOST = get_env("C2_SERVER_HOST", "0.0.0.0")
C2_SERVER_PORT = get_env_int("C2_SERVER_PORT", 8000)

# Check production environment
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

if __name__ == "__main__":
    if IS_PRODUCTION:
        # Production settings
        uvicorn.run(
            "api.main:app",
            host=C2_SERVER_HOST,
            port=C2_SERVER_PORT,
            workers=int(os.getenv("UVICORN_WORKERS", "4")),  # Number of worker processes
            log_level="warning",  # Only warning and error in production
            access_log=False,  # Disable access log in production
            loop="uvloop",  # Use uvloop for better performance
            http="httptools"  # Use httptools
        )
    else:
        # Development settings
        # reload=False to prevent interference with background operations
        # If you want auto-reload, set reload=True and manually restart server after file changes
        uvicorn.run(
            "api.main:app",
            host=C2_SERVER_HOST,
            port=C2_SERVER_PORT,
            reload=False,  # Disable auto-reload to prevent interference
            log_level="info"
        )

