"""
Database Migration System
Database migration system
"""
import aiosqlite
from typing import List, Dict, Optional
from pathlib import Path
from api.utils.env import get_database_path
from api.utils.logger import logger

DATABASE_PATH = get_database_path()
from datetime import datetime


class Migration:
    """Base class for migrations"""
    
    def __init__(self, version: int, name: str, description: str = ""):
        self.version = version
        self.name = name
        self.description = description
    
    async def up(self, conn: aiosqlite.Connection) -> None:
        """Apply migration"""
        raise NotImplementedError
    
    async def down(self, conn: aiosqlite.Connection) -> None:
        """Rollback migration"""
        raise NotImplementedError


class MigrationManager:
    """Manager for database migrations"""
    
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
        self.migrations: List[Migration] = []
    
    def register_migration(self, migration: Migration):
        """Register a migration"""
        self.migrations.append(migration)
        # Sort by version
        self.migrations.sort(key=lambda m: m.version)
    
    async def _ensure_migrations_table(self, conn: aiosqlite.Connection):
        """Create migrations table if it doesn't exist"""
        cursor = await conn.cursor()
        await cursor.execute("""
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                applied_at TEXT NOT NULL
            )
        """)
        await conn.commit()
    
    async def get_applied_migrations(self, conn: aiosqlite.Connection) -> List[int]:
        """Get list of applied migration versions"""
        cursor = await conn.cursor()
        await cursor.execute("SELECT version FROM migrations ORDER BY version")
        rows = await cursor.fetchall()
        return [row[0] for row in rows]
    
    async def apply_migration(self, migration: Migration, conn: aiosqlite.Connection):
        """Apply a single migration"""
        cursor = await conn.cursor()
        try:
            await migration.up(conn)
            await cursor.execute("""
                INSERT INTO migrations (version, name, description, applied_at)
                VALUES (?, ?, ?, ?)
            """, (
                migration.version,
                migration.name,
                migration.description,
                datetime.now().isoformat()
            ))
            await conn.commit()
            logger.info(f"Applied migration {migration.version}: {migration.name}")
        except Exception as e:
            await conn.rollback()
            logger.exception(f"Error applying migration {migration.version}: {e}")
            raise
    
    async def migrate(self) -> int:
        """
        Apply all pending migrations
        
        Returns:
            Number of migrations applied
        """
        conn = await aiosqlite.connect(str(self.db_path))
        try:
            await self._ensure_migrations_table(conn)
            applied = await self.get_applied_migrations(conn)
            
            applied_count = 0
            for migration in self.migrations:
                if migration.version not in applied:
                    await self.apply_migration(migration, conn)
                    applied_count += 1
            
            return applied_count
        finally:
            await conn.close()


# Migration: Add password_hash_migration_flag column
class Migration001_AddPasswordHashFlag(Migration):
    """Migration to add flag for password hash type"""
    
    def __init__(self):
        super().__init__(
            version=1,
            name="add_password_hash_type",
            description="Add password_hash_type column to users table for bcrypt migration"
        )
    
    async def up(self, conn: aiosqlite.Connection):
        cursor = await conn.cursor()
        try:
            await cursor.execute("ALTER TABLE users ADD COLUMN password_hash_type TEXT DEFAULT 'sha256'")
        except aiosqlite.OperationalError as e:
            if "duplicate column" in str(e).lower():
                logger.info("Column password_hash_type already exists, skipping")
            else:
                raise
    
    async def down(self, conn: aiosqlite.Connection):
        # SQLite doesn't support DROP COLUMN easily, so we'll skip rollback
        logger.warning("Rollback for password_hash_type column not supported")


# Initialize migration manager
migration_manager = MigrationManager()
migration_manager.register_migration(Migration001_AddPasswordHashFlag())

