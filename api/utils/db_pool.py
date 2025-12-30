"""
Database Connection Pool
Connection pooling برای بهبود عملکرد
"""
import aiosqlite
from typing import Optional
from pathlib import Path
from api.utils.env import get_database_path
from api.utils.logger import logger

DATABASE_PATH = get_database_path()


class DatabasePool:
    """Connection pool برای aiosqlite"""
    
    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            db_path_str = str(db_path)
            if db_path_str.endswith('.json'):
                db_path_str = db_path_str.replace('.json', '.db')
            self.db_path = Path(db_path_str).resolve()
        else:
            db_path_str = str(DATABASE_PATH)
            if db_path_str.endswith('.json'):
                db_path_str = db_path_str.replace('.json', '.db')
            self.db_path = Path(db_path_str).resolve()
        
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._pool: Optional[aiosqlite.Connection] = None
    
    async def get_connection(self):
        """
        Get connection from pool (for now, returns single connection)
        Note: aiosqlite doesn't support true connection pooling,
        but we can reuse connections within a request context
        """
        # For now, return a new connection each time
        # In the future, we can implement connection reuse
        conn = await aiosqlite.connect(str(self.db_path))
        conn.row_factory = aiosqlite.Row
        return conn
    
    async def close(self):
        """Close pool"""
        if self._pool:
            await self._pool.close()
            self._pool = None


# Global pool instance (for future use)
_db_pool: Optional[DatabasePool] = None


def get_db_pool() -> DatabasePool:
    """Get global database pool instance"""
    global _db_pool
    if _db_pool is None:
        _db_pool = DatabasePool()
    return _db_pool

