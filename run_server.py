"""
اسکریپت راه‌اندازی C2 Server
"""

import uvicorn
import os
from api.utils.env import get_env, get_env_int

C2_SERVER_HOST = get_env("C2_SERVER_HOST", "0.0.0.0")
C2_SERVER_PORT = get_env_int("C2_SERVER_PORT", 8000)

# بررسی محیط production
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

if __name__ == "__main__":
    if IS_PRODUCTION:
        # تنظیمات Production
        uvicorn.run(
            "api.main:app",
            host=C2_SERVER_HOST,
            port=C2_SERVER_PORT,
            workers=int(os.getenv("UVICORN_WORKERS", "4")),  # تعداد worker processes
            log_level="warning",  # فقط warning و error در production
            access_log=False,  # غیرفعال کردن access log در production
            loop="uvloop",  # استفاده از uvloop برای performance بهتر
            http="httptools"  # استفاده از httptools
        )
    else:
        # تنظیمات Development
        # reload=False برای جلوگیری از تداخل با عملیات‌های background
        # اگر می‌خواهید auto-reload داشته باشید، reload=True کنید و بعد از تغییر فایل، سرور را دستی restart کنید
        uvicorn.run(
            "api.main:app",
            host=C2_SERVER_HOST,
            port=C2_SERVER_PORT,
            reload=False,  # غیرفعال کردن auto-reload برای جلوگیری از تداخل
            log_level="info"
        )

