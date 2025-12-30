"""
Session Manager
مدیریت نشست‌های فعال کاربران
"""
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from api.utils.logger import logger
from api.services.database import Database
import asyncio

class SessionManager:
    """مدیریت نشست‌های فعال"""
    
    def __init__(self):
        # Database instance برای ذخیره‌سازی persistent
        self.db = Database()
        # Dictionary برای cache نشست‌های فعال: {token: session_info}
        self._sessions: Dict[str, Dict] = {}
        # Blacklist برای token های revoked شده: {token: expires_at}
        self._blacklist: Dict[str, datetime] = {}
        self._lock = asyncio.Lock()
        self._initialized = False
    
    async def initialize(self):
        """Initialize session manager by loading data from database (call from FastAPI startup)"""
        if self._initialized:
            return
        # Load sessions from database on startup
        await self._load_sessions_from_db()
        # Load blacklist from database on startup
        await self._load_blacklist_from_db()
        # Cleanup expired sessions and blacklist
        await self._cleanup_on_startup()
        self._initialized = True
    
    async def add_session(self, token: str, username: str, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> Dict:
        """
        افزودن نشست جدید
        
        Args:
            token: JWT token
            username: نام کاربری
            ip_address: آدرس IP
            user_agent: User agent string
        
        Returns:
            اطلاعات نشست
        """
        try:
            # Decode token برای دریافت expiration
            from jose import jwt as jose_jwt
            from api.utils.env import get_env
            JWT_SECRET_KEY = get_env("JWT_SECRET_KEY", required=True)
            JWT_ALGORITHM = get_env("JWT_ALGORITHM", "HS256")
            payload = jose_jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            exp = payload.get('exp')
            expires_at = datetime.fromtimestamp(exp) if exp else None
            
            session_info = {
                "token": token[:20] + "..." + token[-10:],  # نمایش جزئی از token
                "full_token": token,  # Store full token for removal
                "username": username,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "created_at": datetime.now().isoformat(),
                "expires_at": expires_at.isoformat() if expires_at else None,
                "last_activity": datetime.now().isoformat()
            }
            
            async with self._lock:
                self._sessions[token] = session_info
                # Save to database
                await self.db.add_session(session_info)
                logger.info(f"Session added. Total sessions: {len(self._sessions)}")
            
            logger.info(f"Session added for user: {username}, IP: {ip_address}")
            return session_info
        except Exception as e:
            logger.exception(f"Error adding session: {e}")
            return {}
    
    async def update_activity(self, token: str):
        """به‌روزرسانی آخرین فعالیت نشست"""
        async with self._lock:
            if token in self._sessions:
                last_activity = datetime.now().isoformat()
                self._sessions[token]["last_activity"] = last_activity
                # Update in database
                await self.db.update_session_activity(token, last_activity)
    
    async def remove_session(self, token: str) -> bool:
        """
        حذف نشست و اضافه کردن token به blacklist
        
        Args:
            token: JWT token (must be full token, not partial)
        
        Returns:
            True اگر نشست حذف شد یا به blacklist اضافه شد، False در غیر این صورت
        """
        async with self._lock:
            # Verify token is full token
            if len(token) < 100:
                logger.error(f"ERROR: remove_session called with partial token (length: {len(token)}): {token[:50]}...")
                # Try to find full token
                full_token = await self.find_session_by_partial_token(token)
                if full_token and len(full_token) > 100:
                    logger.info(f"Found full token for partial: {full_token[:30]}...")
                    token = full_token
                else:
                    logger.error(f"Could not find full token for partial: {token[:50]}...")
                    # Still add to blacklist but log warning
                    logger.warning(f"Adding partial token to blacklist anyway: {token[:50]}...")
            username = "unknown"
            expires_at_str = None
            
            if token in self._sessions:
                username = self._sessions[token].get("username", "unknown")
                expires_at_str = self._sessions[token].get("expires_at")
                # حذف از sessions
                del self._sessions[token]
                logger.debug(f"Removed session from memory: {token[:30]}...")
            
            # Always remove from database (even if not in memory)
            db_removed = await self.db.remove_session(token)
            if db_removed:
                logger.info(f"Removed session from database: {token[:30]}...")
            else:
                logger.warning(f"Session not found in database (might already be removed): {token[:30]}...")
            
            # همیشه token را به blacklist اضافه می‌کنیم (حتی اگر در sessions نبود)
            # سعی می‌کنیم expires_at را از token decode کنیم
            expires_at = None
            expires_at_str = None
            
            # اگر expires_at_str از session داشتیم، از آن استفاده کنیم
            if expires_at_str:
                try:
                    expires_at = datetime.fromisoformat(expires_at_str)
                    expires_at_str = expires_at.isoformat()
                except:
                    expires_at_str = None
            
            # اگر expires_at نداریم، سعی می‌کنیم از token decode کنیم
            if not expires_at_str:
                try:
                    from jose import jwt as jose_jwt
                    from api.utils.env import get_env
                    JWT_SECRET_KEY = get_env("JWT_SECRET_KEY", required=True)
                    JWT_ALGORITHM = get_env("JWT_ALGORITHM", "HS256")
                    # Check if token is valid JWT format (has 3 parts separated by dots)
                    if token.count('.') == 2 and len(token) > 50:
                        payload = jose_jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
                        exp = payload.get('exp')
                        if exp:
                            expires_at = datetime.fromtimestamp(exp)
                            expires_at_str = expires_at.isoformat()
                            logger.debug(f"Decoded token expiration: {expires_at_str}")
                        else:
                            # اگر exp نداریم، تا 24 ساعت بعد blacklist می‌کنیم
                            expires_at = datetime.now() + timedelta(hours=24)
                            expires_at_str = expires_at.isoformat()
                    else:
                        # Token format is invalid, use 24h expiry
                        expires_at = datetime.now() + timedelta(hours=24)
                        expires_at_str = expires_at.isoformat()
                        logger.debug(f"Token format invalid, using 24h expiry: {token[:30]}...")
                except Exception as e:
                    # اگر نتوانستیم token را decode کنیم، تا 24 ساعت بعد blacklist می‌کنیم
                    expires_at = datetime.now() + timedelta(hours=24)
                    expires_at_str = expires_at.isoformat()
                    logger.debug(f"Error decoding token for blacklist, using 24h expiry: {e}")
            
            # Add to blacklist
            self._blacklist[token] = expires_at if expires_at else datetime.fromisoformat(expires_at_str)
            success = await self.db.add_to_blacklist(token, expires_at_str)
            if success:
                logger.info(f"Token revoked and added to blacklist for user: {username}, expires_at: {expires_at_str}, token_length: {len(token)}")
                # Verify it was added
                if await self.db.is_token_in_blacklist(token):
                    logger.info(f"Verified: Token is now in blacklist: {token[:30]}...")
                else:
                    logger.error(f"ERROR: Token was NOT found in blacklist after adding: {token[:30]}...")
            else:
                logger.error(f"Failed to add token to blacklist: {token[:30]}...")
            
            return True
    
    async def get_session(self, token: str) -> Optional[Dict]:
        """
        دریافت اطلاعات یک نشست
        همیشه database را به عنوان منبع اصلی بررسی می‌کند
        """
        async with self._lock:
            # Always check database first (source of truth)
            db_session = await self.db.get_session(token)
            if db_session:
                # Update memory cache
                self._sessions[token] = db_session
                return db_session
            
            # If not in database, remove from memory cache if exists
            if token in self._sessions:
                del self._sessions[token]
            
            return None
    
    async def find_session_by_partial_token(self, partial_token: str) -> Optional[str]:
        """
        پیدا کردن full token با استفاده از partial token
        جستجو در memory و database
        
        Returns:
            full token اگر پیدا شود، None در غیر این صورت
        """
        async with self._lock:
            # Sync with database first
            await self._sync_sessions_from_db()
            
            # Normalize partial token (remove ... if present)
            normalized_partial = partial_token.replace("...", "").strip()
            logger.debug(f"Searching for session with partial token (normalized length: {len(normalized_partial)}): {normalized_partial[:30]}...")
            
            # Search in memory cache
            for full_token, session_info in self._sessions.items():
                stored_partial = session_info.get("token", "").replace("...", "")
                # Check if partial token matches start or end of full token
                if (normalized_partial in stored_partial or 
                    normalized_partial in full_token or
                    full_token.startswith(normalized_partial) or
                    full_token.endswith(normalized_partial)):
                    logger.info(f"Found session in memory cache: full_token length={len(full_token)}, {full_token[:30]}...")
                    # Verify it's a full token
                    if len(full_token) > 100:
                        return full_token
                    else:
                        logger.warning(f"Token from memory seems too short: {len(full_token)} chars")
            
            # Search in database
            db_sessions = await self.db.get_all_sessions()
            logger.debug(f"Searching in {len(db_sessions)} database sessions")
            for session in db_sessions:
                full_token = session.get("full_token") or session.get("token", "")
                if not full_token:
                    continue
                
                # Skip if it's not a full token (stored in token_partial format)
                if len(full_token) < 100:
                    continue
                    
                token_partial = session.get("token_partial") or ""
                token_partial_clean = token_partial.replace("...", "")
                
                # Check multiple matching strategies
                if (normalized_partial in token_partial_clean or 
                    normalized_partial in full_token or
                    full_token.startswith(normalized_partial) or
                    full_token.endswith(normalized_partial)):
                    # Add to memory cache
                    if full_token not in self._sessions:
                        session_info = {
                            "token": token_partial if token_partial else (full_token[:20] + "..." + full_token[-10:] if len(full_token) > 30 else full_token),
                            "full_token": full_token,
                            "username": session.get("username"),
                            "ip_address": session.get("ip_address"),
                            "user_agent": session.get("user_agent"),
                            "created_at": session.get("created_at"),
                            "expires_at": session.get("expires_at"),
                            "last_activity": session.get("last_activity")
                        }
                        self._sessions[full_token] = session_info
                    logger.info(f"Found session in database: full_token length={len(full_token)}, {full_token[:30]}...")
                    return full_token
            
            logger.warning(f"Session not found for partial token: {partial_token[:30]}...")
            return None
    
    async def get_all_sessions(self) -> List[Dict]:
        """
        دریافت لیست تمام نشست‌های فعال
        
        Returns:
            لیست نشست‌ها با اطلاعات کامل
        """
        async with self._lock:
            # Sync with database first - but don't add sessions that are in blacklist
            await self._sync_sessions_from_db()
            
            # Remove sessions that are in blacklist
            tokens_to_remove_from_memory = []
            for token in self._sessions.keys():
                if await self.db.is_token_in_blacklist(token):
                    tokens_to_remove_from_memory.append(token)
            
            for token in tokens_to_remove_from_memory:
                if token in self._sessions:
                    del self._sessions[token]
                    logger.debug(f"Removed blacklisted session from memory: {token[:30]}...")
            
            sessions = []
            now = datetime.now()
            expired_tokens = []
            
            for token, session_info in self._sessions.items():
                # بررسی انقضای نشست
                expires_at_str = session_info.get("expires_at")
                is_expired = False
                
                if expires_at_str:
                    try:
                        expires_at = datetime.fromisoformat(expires_at_str)
                        if expires_at < now:
                            # نشست منقضی شده - علامت‌گذاری برای حذف
                            is_expired = True
                            expired_tokens.append(token)
                            continue
                    except Exception as e:
                        logger.warning(f"Error parsing expires_at for session {token[:20]}: {e}")
                        pass
                
                # محاسبه مدت زمان فعال بودن
                created_at_str = session_info.get("created_at")
                last_activity_str = session_info.get("last_activity")
                
                duration = None
                idle_time = None
                
                if created_at_str:
                    try:
                        created_at = datetime.fromisoformat(created_at_str)
                        duration = (now - created_at).total_seconds()
                    except Exception as e:
                        logger.warning(f"Error parsing created_at for session {token[:20]}: {e}")
                        pass
                
                if last_activity_str:
                    try:
                        last_activity = datetime.fromisoformat(last_activity_str)
                        idle_time = (now - last_activity).total_seconds()
                    except Exception as e:
                        logger.warning(f"Error parsing last_activity for session {token[:20]}: {e}")
                        pass
                
                session_data = session_info.copy()
                # Remove full_token from response for security
                session_data.pop("full_token", None)
                session_data["duration_seconds"] = int(duration) if duration else None
                session_data["idle_seconds"] = int(idle_time) if idle_time else None
                session_data["duration_formatted"] = self._format_duration(duration) if duration else "N/A"
                session_data["idle_formatted"] = self._format_duration(idle_time) if idle_time else "N/A"
                session_data["is_expired"] = is_expired
                
                sessions.append(session_data)
            
            # حذف نشست‌های منقضی شده از dictionary و database
            for token in expired_tokens:
                if token in self._sessions:
                    username = self._sessions[token].get("username", "unknown")
                    del self._sessions[token]
                    # Remove from database
                    await self.db.remove_session(token)
                    logger.info(f"Expired session removed for user: {username}")
            
            # پاک کردن blacklist (بدون lock چون قبلاً lock گرفته شده)
            self._cleanup_blacklist_unlocked()
            
            logger.debug(f"Returning {len(sessions)} active sessions (total in dict: {len(self._sessions)})")
            return sessions
    
    async def is_token_revoked(self, token: str) -> bool:
        """
        بررسی اینکه آیا token revoked شده است یا نه
        
        Args:
            token: JWT token
        
        Returns:
            True اگر token revoked شده باشد، False در غیر این صورت
        """
        async with self._lock:
            # Check database blacklist first (more reliable)
            try:
                if await self.db.is_token_in_blacklist(token):
                    logger.info(f"Token REVOKED - found in database blacklist: {token[:30]}...")
                    return True
            except Exception as e:
                logger.exception(f"Error checking database blacklist: {e}")
            
            # Also check memory cache
            if token in self._blacklist:
                expires_at = self._blacklist[token]
                if expires_at < datetime.now():
                    # Token منقضی شده - از blacklist حذف می‌شود
                    del self._blacklist[token]
                    try:
                        await self.db.remove_from_blacklist(token)
                    except:
                        pass
                    logger.debug(f"Expired token removed from blacklist: {token[:20]}...")
                    return False
                logger.info(f"Token REVOKED - found in memory blacklist: {token[:30]}...")
                return True
            
            logger.debug(f"Token NOT revoked: {token[:30]}...")
            return False
    
    async def _cleanup_blacklist_unlocked(self):
        """پاک کردن token های منقضی شده از blacklist (بدون lock - باید از داخل lock صدا زده شود)"""
        now = datetime.now()
        expired_tokens = [
            token for token, expires_at in self._blacklist.items()
            if expires_at < now
        ]
        for token in expired_tokens:
            del self._blacklist[token]
        if expired_tokens:
            logger.debug(f"Cleaned up {len(expired_tokens)} expired tokens from blacklist")
    
    async def _cleanup_blacklist(self):
        """پاک کردن token های منقضی شده از blacklist (با lock)"""
        async with self._lock:
            self._cleanup_blacklist_unlocked()
            # Also cleanup database blacklist
            await self.db.cleanup_blacklist()
    
    async def _load_sessions_from_db(self):
        """بارگذاری sessions از دیتابیس هنگام startup"""
        try:
            db_sessions = await self.db.get_all_sessions()
            now = datetime.now()
            for session in db_sessions:
                token = session.get("token") or session.get("full_token")
                if not token:
                    continue
                
                # Check if session is expired
                expires_at_str = session.get("expires_at")
                if expires_at_str:
                    try:
                        expires_at = datetime.fromisoformat(expires_at_str)
                        if expires_at < now:
                            # Skip expired sessions
                            continue
                    except:
                        pass
                
                # Reconstruct session_info
                session_info = {
                    "token": session.get("token_partial") or (token[:20] + "..." + token[-10:]),
                    "full_token": token,
                    "username": session.get("username"),
                    "ip_address": session.get("ip_address"),
                    "user_agent": session.get("user_agent"),
                    "created_at": session.get("created_at"),
                    "expires_at": session.get("expires_at"),
                    "last_activity": session.get("last_activity")
                }
                self._sessions[token] = session_info
            
            logger.info(f"Loaded {len(self._sessions)} sessions from database")
        except Exception as e:
            logger.exception(f"Error loading sessions from database: {e}")
    
    async def _load_blacklist_from_db(self):
        """بارگذاری blacklist از دیتابیس هنگام startup"""
        try:
            # Load active blacklist entries from database
            async with self.db._get_connection() as conn:
                cursor = await conn.cursor()
                now = datetime.now().isoformat()
                await cursor.execute("SELECT token, expires_at FROM token_blacklist WHERE expires_at > ?", (now,))
                rows = await cursor.fetchall()
                for row in rows:
                    token = row[0]
                    expires_at_str = row[1]
                    try:
                        expires_at = datetime.fromisoformat(expires_at_str)
                        self._blacklist[token] = expires_at
                    except:
                        pass
            
            # Cleanup expired entries
            await self.db.cleanup_blacklist()
            logger.info(f"Loaded {len(self._blacklist)} blacklist entries from database")
        except Exception as e:
            logger.exception(f"Error loading blacklist from database: {e}")
    
    async def _cleanup_on_startup(self):
        """پاک کردن sessions و blacklist منقضی شده هنگام startup"""
        try:
            removed_count = await self.db.remove_expired_sessions()
            if removed_count > 0:
                logger.info(f"Removed {removed_count} expired sessions on startup")
            
            blacklist_count = await self.db.cleanup_blacklist()
            if blacklist_count > 0:
                logger.info(f"Cleaned up {blacklist_count} expired tokens from blacklist on startup")
        except Exception as e:
            logger.exception(f"Error cleaning up on startup: {e}")
    
    async def _sync_sessions_from_db(self):
        """همگام‌سازی sessions از دیتابیس"""
        try:
            db_sessions = await self.db.get_all_sessions()
            db_tokens = set()
            now = datetime.now()
            
            for session in db_sessions:
                token = session.get("full_token") or session.get("token", "")
                if not token:
                    continue
                
                # Skip if token is in blacklist (revoked)
                if await self.db.is_token_in_blacklist(token):
                    logger.debug(f"Skipping blacklisted session: {token[:30]}...")
                    continue
                
                db_tokens.add(token)
                
                # If session not in memory, add it
                if token not in self._sessions:
                    expires_at_str = session.get("expires_at")
                    if expires_at_str:
                        try:
                            expires_at = datetime.fromisoformat(expires_at_str)
                            if expires_at < now:
                                continue
                        except:
                            pass
                    
                    session_info = {
                        "token": session.get("token_partial") or (token[:20] + "..." + token[-10:]),
                        "full_token": token,
                        "username": session.get("username"),
                        "ip_address": session.get("ip_address"),
                        "user_agent": session.get("user_agent"),
                        "created_at": session.get("created_at"),
                        "expires_at": session.get("expires_at"),
                        "last_activity": session.get("last_activity")
                    }
                    self._sessions[token] = session_info
            
            # Remove sessions from memory that don't exist in database or are blacklisted
            memory_tokens = set(self._sessions.keys())
            for token in memory_tokens:
                if token not in db_tokens or await self.db.is_token_in_blacklist(token):
                    if token in self._sessions:
                        del self._sessions[token]
                        logger.debug(f"Removed session from memory (not in DB or blacklisted): {token[:30]}...")
        except Exception as e:
            logger.exception(f"Error syncing sessions from database: {e}")
    
    def _format_duration(self, seconds: Optional[float]) -> str:
        """فرمت کردن مدت زمان به صورت خوانا"""
        if seconds is None:
            return "N/A"
        
        if seconds < 60:
            return f"{int(seconds)}s"
        elif seconds < 3600:
            minutes = int(seconds / 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds / 3600)
            minutes = int((seconds % 3600) / 60)
            return f"{hours}h {minutes}m"


# Singleton instance
session_manager = SessionManager()

