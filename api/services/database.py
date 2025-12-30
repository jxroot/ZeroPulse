import aiosqlite
import json
from typing import List, Dict, Optional
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime

from api.utils.logger import logger
from api.utils.exceptions import DatabaseError
from api.utils.db_helpers import sanitize_column_name
from api.utils.env import get_database_path

DATABASE_PATH = get_database_path()


class Database:
    def __init__(self, db_path: Optional[str] = None):
        # Convert JSON path to SQLite path
        if db_path:
            db_path_str = str(db_path)
            if db_path_str.endswith('.json'):
                db_path_str = db_path_str.replace('.json', '.db')
            self.db_path = Path(db_path_str).resolve()
        else:
            # Convert default JSON path to SQLite
            db_path_str = str(DATABASE_PATH)
            if db_path_str.endswith('.json'):
                db_path_str = db_path_str.replace('.json', '.db')
            # Resolve to absolute path to avoid issues when running from different directories
            self.db_path = Path(db_path_str).resolve()
        
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        # Database initialization is now async - call ensure_initialized() before first use
    
    @asynccontextmanager
    async def _get_connection(self):
        """Async context manager for database connections"""
        conn = await aiosqlite.connect(str(self.db_path))
        conn.row_factory = aiosqlite.Row  # Enable column access by name
        try:
            yield conn
            await conn.commit()
        except Exception as e:
            await conn.rollback()
            logger.exception(f"Database error: {e}")
            raise DatabaseError(f"Database operation failed: {str(e)}")
        finally:
            await conn.close()
    
    async def _init_database(self):
        """Initialize database tables (async)"""
        async with self._get_connection() as conn:
            cursor = await conn.cursor()
            
            # Tunnels table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS tunnels (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    default_hostname TEXT,
                    winrm_username TEXT,
                    winrm_password TEXT,
                    winrm_ntlm_hash TEXT,
                    ssh_hostname TEXT,
                    ssh_password TEXT,
                    hostname TEXT,
                    token TEXT,
                    status TEXT,
                    created_at TEXT,
                    account_id TEXT,
                    connection_type TEXT,
                    ssh_key_path TEXT,
                    ssh_username TEXT,
                    label TEXT
                )
            """)
            
            # Add new columns to existing tunnels table if they don't exist (migration)
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN connection_type TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN ssh_key_path TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN ssh_username TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN ssh_hostname TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN winrm_username TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN winrm_password TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN label TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN winrm_ntlm_hash TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE tunnels ADD COLUMN ssh_password TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            # Agents table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    hostname TEXT,
                    ip_address TEXT,
                    os_info TEXT,
                    last_seen TEXT,
                    status TEXT,
                    metadata TEXT
                )
            """)
            
            # Commands table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS commands (
                    id TEXT PRIMARY KEY,
                    tunnel_id TEXT,
                    agent_id TEXT,
                    command TEXT,
                    output TEXT,
                    error TEXT,
                    success INTEGER,
                    exit_code INTEGER,
                    timestamp TEXT,
                    connection_type TEXT,
                    username TEXT,
                    password TEXT
                )
            """)
            
            # Add new columns to existing commands table (migration)
            try:
                await cursor.execute("ALTER TABLE commands ADD COLUMN connection_type TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE commands ADD COLUMN username TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            try:
                await cursor.execute("ALTER TABLE commands ADD COLUMN password TEXT")
            except aiosqlite.OperationalError:
                pass  # Column already exists
            
            # Modules table (PowerShell modules for execution)
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS modules (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    script TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            
            # Module Categories table (e.g., System, Network, Credential)
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS module_categories (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    label TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    order_index INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    is_default INTEGER DEFAULT 0,
                    created_at TEXT,
                    updated_at TEXT
                )
            """)
            
            # Add is_default column if it doesn't exist (migration)
            try:
                await cursor.execute("ALTER TABLE module_categories ADD COLUMN is_default INTEGER DEFAULT 0")
            except Exception:
                # Column already exists, ignore
                pass
            
            # Module Sections table (e.g., System Information, Security & Permissions)
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS module_sections (
                    id TEXT PRIMARY KEY,
                    category_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    label TEXT NOT NULL,
                    icon TEXT,
                    order_index INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT,
                    updated_at TEXT,
                    FOREIGN KEY (category_id) REFERENCES module_categories(id) ON DELETE CASCADE
                )
            """)
            
            # Module Items table (e.g., Get System Info, Check Privileges)
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS module_items (
                    id TEXT PRIMARY KEY,
                    section_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    label TEXT NOT NULL,
                    icon TEXT,
                    command TEXT NOT NULL,
                    execution_type TEXT DEFAULT 'powershell',
                    order_index INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    requires_admin INTEGER DEFAULT 0,
                    description TEXT,
                    created_at TEXT,
                    updated_at TEXT,
                    FOREIGN KEY (section_id) REFERENCES module_sections(id) ON DELETE CASCADE
                )
            """)
            
            # API Tokens table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS api_tokens (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    token TEXT UNIQUE NOT NULL,
                    token_hash TEXT,
                    expires_at TEXT,
                    never_expires INTEGER DEFAULT 0,
                    permissions TEXT,
                    created_by TEXT,
                    created_at TEXT,
                    last_used_at TEXT,
                    is_active INTEGER DEFAULT 1
                )
            """)
            
            # Sessions table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    token_partial TEXT,
                    username TEXT NOT NULL,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at TEXT NOT NULL,
                    expires_at TEXT,
                    last_activity TEXT NOT NULL
                )
            """)
            
            # Blacklist table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS token_blacklist (
                    token TEXT PRIMARY KEY,
                    expires_at TEXT NOT NULL
                )
            """)
            
            # Users table (email and full_name removed)
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role_id TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT,
                    last_login TEXT,
                    created_by TEXT,
                    FOREIGN KEY (role_id) REFERENCES roles(id)
                )
            """)
            
            # Migration: Remove email and full_name columns if they exist
            await self._migrate_remove_user_email_fullname(cursor)
            
            # Roles table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS roles (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    is_system INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT
                )
            """)
            
            # Permissions table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS permissions (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    resource TEXT NOT NULL,
                    action TEXT NOT NULL,
                    description TEXT,
                    hide_if_no_access INTEGER DEFAULT 0,
                    hide_completely INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            
            # Role Permissions junction table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS role_permissions (
                    role_id TEXT NOT NULL,
                    permission_id TEXT NOT NULL,
                    PRIMARY KEY (role_id, permission_id),
                    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
                    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
                )
            """)
            
            # User Permissions junction table (for custom permissions)
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_permissions (
                    user_id TEXT NOT NULL,
                    permission_id TEXT NOT NULL,
                    PRIMARY KEY (user_id, permission_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
                )
            """)
            
            # Migration: Remove email and full_name columns if they exist
            await self._migrate_remove_user_email_fullname(cursor)
            
            # Tunnel Groups table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS tunnel_groups (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    color TEXT,
                    order_index INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            
            # Tunnel Group Rules table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS tunnel_group_rules (
                    id TEXT PRIMARY KEY,
                    group_id TEXT NOT NULL,
                    pattern TEXT NOT NULL,
                    pattern_type TEXT NOT NULL,
                    order_index INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (group_id) REFERENCES tunnel_groups(id) ON DELETE CASCADE
                )
            """)
            
            # User Settings table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    user_id TEXT PRIMARY KEY,
                    tunnel_name_pattern TEXT,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create indexes
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions(resource)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id)")
            
            # Initialize default roles and permissions if they don't exist
            await self._init_default_roles_and_permissions(cursor)
            
            # Create indexes for better performance
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_commands_tunnel_id ON commands(tunnel_id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_commands_timestamp ON commands(timestamp DESC)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_commands_success ON commands(success)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_commands_agent_id ON commands(agent_id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_commands_tunnel_timestamp ON commands(tunnel_id, timestamp DESC)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_modules_name ON modules(name)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_modules_created_at ON modules(created_at DESC)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_api_tokens_is_active ON api_tokens(is_active)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_api_tokens_active_created ON api_tokens(is_active, created_at DESC)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_blacklist_expires_at ON token_blacklist(expires_at)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_tunnels_id ON tunnels(id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_agents_id ON agents(id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)")
            
            # Indexes for modular system
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_module_categories_order ON module_categories(order_index, is_active)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_module_sections_category ON module_sections(category_id, order_index, is_active)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_module_items_section ON module_items(section_id, order_index, is_active)")
            
            await conn.commit()
            logger.info(f"Database initialized at {self.db_path}")
    
    # Tunnel methods
    async def add_tunnel(self, tunnel: Dict) -> bool:
        """Add new Tunnel"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT OR REPLACE INTO tunnels 
                    (id, name, default_hostname, winrm_username, winrm_password, winrm_ntlm_hash, ssh_hostname, ssh_password, hostname, token, status, created_at, account_id, connection_type, ssh_key_path, ssh_username, label)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    tunnel.get("id"),
                    tunnel.get("name"),
                    tunnel.get("default_hostname"),
                    tunnel.get("winrm_username"),
                    tunnel.get("winrm_password"),
                    tunnel.get("winrm_ntlm_hash"),
                    tunnel.get("ssh_hostname"),
                    tunnel.get("ssh_password"),
                    tunnel.get("hostname"),
                    tunnel.get("token"),
                    tunnel.get("status"),
                    tunnel.get("created_at"),
                    tunnel.get("account_id"),
                    tunnel.get("connection_type"),
                    tunnel.get("ssh_key_path"),
                    tunnel.get("ssh_username"),
                    tunnel.get("label")
                ))
            logger.info(f"Tunnel {tunnel.get('id')} added/updated")
            return True
        except Exception as e:
            logger.exception(f"Error adding tunnel: {e}")
            return False
    
    async def get_tunnels(self) -> List[Dict]:
        """Get list of Tunnels"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Select only needed columns instead of SELECT *
                await cursor.execute("""SELECT id, name, default_hostname, winrm_username, 
                                              winrm_password, winrm_ntlm_hash, ssh_hostname, 
                                              ssh_password, hostname, token, status, created_at, 
                                              account_id, connection_type, ssh_key_path, 
                                              ssh_username, label 
                                       FROM tunnels 
                                       ORDER BY created_at DESC""")
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.exception(f"Error getting tunnels: {e}")
            return []
    
    async def get_tunnel_by_id(self, tunnel_id: str) -> Optional[Dict]:
        """Get Tunnel by ID"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Use indexed column lookup
                await cursor.execute("""SELECT id, name, default_hostname, winrm_username, 
                                              winrm_password, winrm_ntlm_hash, ssh_hostname, 
                                              ssh_password, hostname, token, status, created_at, 
                                              account_id, connection_type, ssh_key_path, 
                                              ssh_username, label 
                                       FROM tunnels 
                                       WHERE id = ?""", (tunnel_id,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting tunnel by id: {e}")
            return None
    
    async def save_tunnel_info(self, tunnel_id: str, hostname: Optional[str] = None, token: Optional[str] = None, name: Optional[str] = None) -> bool:
        """Save or update Tunnel information"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Check if tunnel exists
                await cursor.execute("SELECT id FROM tunnels WHERE id = ?", (tunnel_id,))
                existing = await cursor.fetchone()
                
                if existing:
                    # Update existing tunnel
                    update_fields = []
                    params = []
                    if hostname is not None:
                        update_fields.append("hostname = ?")
                        params.append(hostname)
                    if token is not None:
                        update_fields.append("token = ?")
                        params.append(token)
                    if name is not None:
                        update_fields.append("name = ?")
                        params.append(name)
                    
                    if update_fields:
                        params.append(tunnel_id)
                        query = f"UPDATE tunnels SET {', '.join(update_fields)} WHERE id = ?"
                        await cursor.execute(query, params)
                        logger.info(f"Tunnel {tunnel_id} updated")
                else:
                    # Insert new tunnel
                    await cursor.execute("""
                        INSERT INTO tunnels (id, name, hostname, token, created_at)
                        VALUES (?, ?, ?, ?, ?)
                    """, (tunnel_id, name or tunnel_id, hostname, token, datetime.now().isoformat()))
                    logger.info(f"Tunnel {tunnel_id} saved")
                return True
        except Exception as e:
            logger.exception(f"Error saving tunnel info: {e}")
            return False
    
    async def delete_tunnel(self, tunnel_id: str) -> bool:
        """Delete Tunnel"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM tunnels WHERE id = ?", (tunnel_id,))
                if cursor.rowcount > 0:
                    logger.info(f"Tunnel {tunnel_id} deleted")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error deleting tunnel: {e}")
            return False
    
    async def update_tunnel(self, tunnel_id: str, updates: Dict) -> bool:
        """Update Tunnel"""
        try:
            # Allowed columns for tunnels table
            allowed_columns = [
                'name', 'default_hostname', 'winrm_username', 'winrm_password', 'winrm_ntlm_hash',
                'ssh_hostname', 'ssh_password', 'hostname', 'token', 'status', 'created_at',
                'account_id', 'connection_type', 'ssh_key_path', 'ssh_username', 'label'
            ]
            
            # Build update query dynamically with column validation
            set_clauses = []
            values = []
            for key, value in updates.items():
                # Validate column name to prevent SQL injection
                sanitized_key = sanitize_column_name(key, allowed_columns)
                set_clauses.append(f"{sanitized_key} = ?")
                values.append(value)
            
            if not set_clauses:
                return False
            
            values.append(tunnel_id)
            query = f"UPDATE tunnels SET {', '.join(set_clauses)} WHERE id = ?"
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(query, values)
                if cursor.rowcount > 0:
                    logger.info(f"Tunnel {tunnel_id} updated")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error updating tunnel: {e}")
            return False
    
    # User Settings methods
    async def get_user_settings(self, user_id: str) -> Optional[Dict]:
        """Get user settings"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM user_settings WHERE user_id = ?", (user_id,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting user settings: {e}")
            return None
    
    async def update_user_settings(self, user_id: str, settings: Dict) -> bool:
        """Update user settings"""
        try:
            from datetime import datetime
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                existing = await self.get_user_settings(user_id)
                updated_at = datetime.now().isoformat()
                
                if existing:
                    set_clauses = []
                    values = []
                    allowed_keys = ['tunnel_name_pattern']
                    for key, value in settings.items():
                        if key in allowed_keys:
                            set_clauses.append(f"{key} = ?")
                            values.append(value)
                    
                    if set_clauses:
                        set_clauses.append("updated_at = ?")
                        values.append(updated_at)
                        values.append(user_id)
                        query = f"UPDATE user_settings SET {', '.join(set_clauses)} WHERE user_id = ?"
                        await cursor.execute(query, values)
                else:
                    tunnel_name_pattern = settings.get('tunnel_name_pattern')
                    await cursor.execute("""
                        INSERT INTO user_settings (user_id, tunnel_name_pattern, updated_at)
                        VALUES (?, ?, ?)
                    """, (user_id, tunnel_name_pattern, updated_at))
                
                return True
        except Exception as e:
            logger.exception(f"Error updating user settings: {e}")
            return False
    
    # Tunnel Groups methods
    async def get_tunnel_groups(self) -> List[Dict]:
        """Get all tunnel groups"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM tunnel_groups ORDER BY order_index, name")
                return [dict(row) for row in await cursor.fetchall()]
        except Exception as e:
            logger.exception(f"Error getting tunnel groups: {e}")
            return []
    
    async def create_tunnel_group(self, group_data: Dict) -> bool:
        """Create a new tunnel group"""
        try:
            from datetime import datetime
            import uuid
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                group_id = group_data.get('id') or str(uuid.uuid4())
                await cursor.execute("""
                    INSERT INTO tunnel_groups (id, name, color, order_index, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    group_id,
                    group_data.get('name'),
                    group_data.get('color'),
                    group_data.get('order_index', 0),
                    datetime.now().isoformat()
                ))
                return True
        except Exception as e:
            logger.exception(f"Error creating tunnel group: {e}")
            return False
    
    async def update_tunnel_group(self, group_id: str, group_data: Dict) -> bool:
        """Update a tunnel group"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                set_clauses = []
                values = []
                allowed_keys = ['name', 'color', 'order_index']
                for key, value in group_data.items():
                    if key in allowed_keys:
                        set_clauses.append(f"{key} = ?")
                        values.append(value)
                
                if not set_clauses:
                    return False
                
                values.append(group_id)
                query = f"UPDATE tunnel_groups SET {', '.join(set_clauses)} WHERE id = ?"
                await cursor.execute(query, values)
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating tunnel group: {e}")
            return False
    
    async def delete_tunnel_group(self, group_id: str) -> bool:
        """Delete a tunnel group (cascades to rules)"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM tunnel_groups WHERE id = ?", (group_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting tunnel group: {e}")
            return False
    
    # Tunnel Group Rules methods
    async def get_tunnel_group_rules(self) -> List[Dict]:
        """Get all tunnel group rules"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM tunnel_group_rules ORDER BY order_index, created_at")
                return [dict(row) for row in await cursor.fetchall()]
        except Exception as e:
            logger.exception(f"Error getting tunnel group rules: {e}")
            return []
    
    async def create_tunnel_group_rule(self, rule_data: Dict) -> bool:
        """Create a new tunnel group rule"""
        try:
            from datetime import datetime
            import uuid
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                rule_id = rule_data.get('id') or str(uuid.uuid4())
                await cursor.execute("""
                    INSERT INTO tunnel_group_rules (id, group_id, pattern, pattern_type, order_index, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    rule_id,
                    rule_data.get('group_id'),
                    rule_data.get('pattern'),
                    rule_data.get('pattern_type', 'prefix'),
                    rule_data.get('order_index', 0),
                    datetime.now().isoformat()
                ))
                return True
        except Exception as e:
            logger.exception(f"Error creating tunnel group rule: {e}")
            return False
    
    async def update_tunnel_group_rule(self, rule_id: str, rule_data: Dict) -> bool:
        """Update a tunnel group rule"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                set_clauses = []
                values = []
                allowed_keys = ['group_id', 'pattern', 'pattern_type', 'order_index']
                for key, value in rule_data.items():
                    if key in allowed_keys:
                        set_clauses.append(f"{key} = ?")
                        values.append(value)
                
                if not set_clauses:
                    return False
                
                values.append(rule_id)
                query = f"UPDATE tunnel_group_rules SET {', '.join(set_clauses)} WHERE id = ?"
                await cursor.execute(query, values)
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating tunnel group rule: {e}")
            return False
    
    async def delete_tunnel_group_rule(self, rule_id: str) -> bool:
        """Delete a tunnel group rule"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM tunnel_group_rules WHERE id = ?", (rule_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting tunnel group rule: {e}")
            return False
    
    async def get_tunnel_group_for_name(self, tunnel_name: str) -> Optional[Dict]:
        """Find the group for a tunnel name based on rules"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    SELECT r.*, g.name as group_name, g.color as group_color
                    FROM tunnel_group_rules r
                    INNER JOIN tunnel_groups g ON r.group_id = g.id
                    ORDER BY r.order_index
                """)
                rules = await cursor.fetchall()
                
                import re
                for rule_row in rules:
                    rule = dict(rule_row)
                    pattern = rule.get('pattern', '')
                    pattern_type = rule.get('pattern_type', 'prefix')
                    
                    if pattern_type == 'prefix':
                        if tunnel_name.startswith(pattern):
                            return {
                                'group_id': rule.get('group_id'),
                                'group_name': rule.get('group_name'),
                                'group_color': rule.get('group_color')
                            }
                    elif pattern_type == 'regex':
                        try:
                            if re.match(pattern, tunnel_name):
                                return {
                                    'group_id': rule.get('group_id'),
                                    'group_name': rule.get('group_name'),
                                    'group_color': rule.get('group_color')
                                }
                        except re.error:
                            logger.warning(f"Invalid regex pattern: {pattern}")
                            continue
                
                return None
        except Exception as e:
            logger.exception(f"Error getting tunnel group for name: {e}")
            return None
    
    # Agent methods
    async def add_agent(self, agent: Dict) -> bool:
        """Add new Agent"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Convert metadata dict to JSON string if needed
                metadata = agent.get("metadata")
                if isinstance(metadata, dict):
                    metadata = json.dumps(metadata)
                
                await cursor.execute("""
                    INSERT OR REPLACE INTO agents 
                    (id, hostname, ip_address, os_info, last_seen, status, metadata)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    agent.get("id"),
                    agent.get("hostname"),
                    agent.get("ip_address"),
                    agent.get("os_info"),
                    agent.get("last_seen"),
                    agent.get("status"),
                    metadata
                ))
            logger.info(f"Agent {agent.get('id')} added/updated")
            return True
        except Exception as e:
            logger.exception(f"Error adding agent: {e}")
            return False
    
    async def get_agents(self) -> List[Dict]:
        """Get list of Agents"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Select only needed columns and order by last_seen for better performance
                await cursor.execute("""SELECT id, hostname, ip_address, os_info, 
                                              last_seen, status, metadata 
                                       FROM agents 
                                       ORDER BY last_seen DESC""")
                rows = await cursor.fetchall()
                agents = []
                for row in rows:
                    agent = dict(row)
                    # Parse metadata JSON if exists
                    if agent.get("metadata"):
                        try:
                            agent["metadata"] = json.loads(agent["metadata"])
                        except:
                            pass
                    agents.append(agent)
                return agents
        except Exception as e:
            logger.exception(f"Error getting agents: {e}")
            return []
    
    async def get_agent_by_id(self, agent_id: str) -> Optional[Dict]:
        """Get Agent by ID"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Use indexed column lookup
                await cursor.execute("""SELECT id, hostname, ip_address, os_info, 
                                              last_seen, status, metadata 
                                       FROM agents 
                                       WHERE id = ?""", (agent_id,))
                row = await cursor.fetchone()
                if row:
                    agent = dict(row)
                    # Parse metadata JSON if exists
                    if agent.get("metadata"):
                        try:
                            agent["metadata"] = json.loads(agent["metadata"])
                        except:
                            pass
                    return agent
                return None
        except Exception as e:
            logger.exception(f"Error getting agent by id: {e}")
            return None
    
    async def update_agent(self, agent_id: str, updates: Dict) -> bool:
        """Update Agent"""
        try:
            # Allowed columns for agents table
            allowed_columns = ['hostname', 'ip_address', 'os_info', 'last_seen', 'status', 'metadata']
            
            # Build update query dynamically with column validation
            set_clauses = []
            values = []
            for key, value in updates.items():
                # Validate column name to prevent SQL injection
                sanitized_key = sanitize_column_name(key, allowed_columns)
                # Convert metadata dict to JSON string
                if sanitized_key == "metadata" and isinstance(value, dict):
                    value = json.dumps(value)
                set_clauses.append(f"{sanitized_key} = ?")
                values.append(value)
            
            if not set_clauses:
                return False
            
            values.append(agent_id)
            query = f"UPDATE agents SET {', '.join(set_clauses)} WHERE id = ?"
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(query, values)
                if cursor.rowcount > 0:
                    logger.info(f"Agent {agent_id} updated")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error updating agent: {e}")
            return False
    
    async def delete_agent(self, agent_id: str) -> bool:
        """Delete Agent"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
                if cursor.rowcount > 0:
                    logger.info(f"Agent {agent_id} deleted")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error deleting agent: {e}")
            return False
    
    # Command history methods
    async def add_command(self, command: Dict) -> bool:
        """Add command to history"""
        try:
            logger.info(f"Adding command to history: {command.get('command', 'unknown')[:50]}...")
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT INTO commands 
                    (id, tunnel_id, agent_id, command, output, error, success, exit_code, timestamp, connection_type, username, password)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    command.get("id"),
                    command.get("tunnel_id"),
                    command.get("agent_id"),
                    command.get("command"),
                    command.get("output", ""),
                    command.get("error"),
                    1 if command.get("success") else 0,
                    command.get("exit_code"),
                    command.get("timestamp"),
                    command.get("connection_type"),
                    command.get("username"),
                    command.get("password")
                ))
                
                # Keep only last 5000 commands
                await cursor.execute("""
                    DELETE FROM commands 
                    WHERE id NOT IN (
                        SELECT id FROM commands 
                        ORDER BY timestamp DESC 
                        LIMIT 5000
                    )
                """)
            
            logger.info(f"Command saved to history successfully. ID: {command.get('id')}")
            return True
        except Exception as e:
            logger.exception(f"Error adding command to history: {e}")
            logger.error(f"Command data: {command}")
            return False
    
    async def get_commands(
        self, 
        tunnel_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        search: Optional[str] = None,
        success_only: Optional[bool] = None
    ) -> List[Dict]:
        """Get command history with filters"""
        try:
            # Use specific columns instead of SELECT * for better performance
            query = """SELECT id, tunnel_id, agent_id, command, output, error, 
                             success, timestamp, connection_type, username 
                      FROM commands WHERE 1=1"""
            params = []
            
            if tunnel_id:
                query += " AND tunnel_id = ?"
                params.append(tunnel_id)
            
            if agent_id:
                query += " AND agent_id = ?"
                params.append(agent_id)
            
            if success_only is not None:
                query += " AND success = ?"
                params.append(1 if success_only else 0)
            
            if search:
                # Use indexed columns first, then LIKE for text search
                query += " AND (command LIKE ? OR output LIKE ? OR error LIKE ?)"
                search_param = f"%{search}%"
                params.extend([search_param, search_param, search_param])
            
            # Use index-friendly ORDER BY
            if tunnel_id:
                # Use composite index if tunnel_id is provided
                query += " ORDER BY timestamp DESC"
            else:
                query += " ORDER BY timestamp DESC"
            
            # Always use LIMIT to prevent large result sets
            if limit:
                query += " LIMIT ?"
                params.append(limit)
            else:
                # Default limit to prevent performance issues
                query += " LIMIT ?"
                params.append(1000)
            
            if offset:
                query += " OFFSET ?"
                params.append(offset)
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(query, params)
                rows = await cursor.fetchall()
                commands = []
                for row in rows:
                    cmd = dict(row)
                    # Convert success from integer to boolean
                    # SQLite stores 1/0, but we need to handle None as well
                    success_val = cmd.get("success")
                    if success_val is None:
                        cmd["success"] = False
                    else:
                        cmd["success"] = bool(success_val)
                    commands.append(cmd)
                return commands
        except Exception as e:
            logger.exception(f"Error getting commands: {e}")
            return []
    
    async def get_command_by_id(self, command_id: str) -> Optional[Dict]:
        """Get a command by ID"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Select specific columns instead of SELECT *
                await cursor.execute("""SELECT id, tunnel_id, agent_id, command, output, error, 
                                              success, timestamp, connection_type, username 
                                       FROM commands 
                                       WHERE id = ?""", (command_id,))
                row = await cursor.fetchone()
                if row:
                    cmd = dict(row)
                    # Convert success from integer to boolean
                    success_val = cmd.get("success")
                    if success_val is None:
                        cmd["success"] = False
                    else:
                        cmd["success"] = bool(success_val)
                    return cmd
                return None
        except Exception as e:
            logger.exception(f"Error getting command by id: {e}")
            return None
    
    async def delete_command(self, command_id: str) -> bool:
        """Delete a command from history"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM commands WHERE id = ?", (command_id,))
                if cursor.rowcount > 0:
                    logger.info(f"Command {command_id} deleted")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error deleting command: {e}")
            return False
    
    async def clear_commands(self, tunnel_id: Optional[str] = None) -> int:
        """Clear all commands (or commands for a tunnel)"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                if tunnel_id:
                    await cursor.execute("SELECT COUNT(*) FROM commands WHERE tunnel_id = ?", (tunnel_id,))
                    row = await cursor.fetchone()
                    count = row[0] if row else 0
                    await cursor.execute("DELETE FROM commands WHERE tunnel_id = ?", (tunnel_id,))
                else:
                    await cursor.execute("SELECT COUNT(*) FROM commands")
                    row = await cursor.fetchone()
                    count = row[0] if row else 0
                    await cursor.execute("DELETE FROM commands")
                logger.info(f"Cleared {count} command(s)")
                return count
        except Exception as e:
            logger.exception(f"Error clearing commands: {e}")
            return 0
    
    async def get_command_stats(self, tunnel_id: Optional[str] = None) -> Dict:
        """Command statistics"""
        try:
            query = "SELECT COUNT(*) as total, SUM(success) as successful FROM commands WHERE 1=1"
            params = []
            
            if tunnel_id:
                query += " AND tunnel_id = ?"
                params.append(tunnel_id)
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(query, params)
                row = await cursor.fetchone()
                total = row[0] or 0
                successful = row[1] or 0
                failed = total - successful
                
                return {
                    "total": total,
                    "successful": successful,
                    "failed": failed,
                    "success_rate": round((successful / total * 100), 2) if total > 0 else 0
                }
        except Exception as e:
            logger.exception(f"Error getting command stats: {e}")
            return {"total": 0, "successful": 0, "failed": 0, "success_rate": 0}
    
    # Module methods (for backward compatibility with settings.py)
    async def _read_db(self) -> Dict:
        """Read data (for backward compatibility)"""
        try:
            tunnels = await self.get_tunnels()
            agents = await self.get_agents()
            commands = await self.get_commands(limit=10000)  # Get all commands
            modules = await self.get_modules()
            
            return {
                "tunnels": tunnels,
                "agents": agents,
                "commands": commands,
                "modules": modules
            }
        except Exception as e:
            logger.exception(f"Error reading database: {e}")
            return {"tunnels": [], "agents": [], "commands": [], "modules": []}
    
    async def _write_db(self, data: Dict):
        """Write data (for backward compatibility)"""
        try:
            # This is mainly for modules compatibility
            if "modules" in data:
                # Update modules
                existing_modules = {m["id"]: m for m in await self.get_modules()}
                for module in data.get("modules", []):
                    if module.get("id") in existing_modules:
                        await self.update_module(module["id"], module)
                    else:
                        await self.add_module(module)
        except Exception as e:
            logger.exception(f"Error writing database: {e}")
    
    async def get_modules(self) -> List[Dict]:
        """Get list of modules"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Use indexed ORDER BY and select specific columns
                await cursor.execute("""SELECT id, name, description, script, 
                                              created_at, updated_at 
                                       FROM modules 
                                       ORDER BY created_at DESC""")
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.exception(f"Error getting modules: {e}")
            return []
    
    async def get_module_by_id(self, module_id: str) -> Optional[Dict]:
        """Get module by ID"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Select specific columns instead of SELECT *
                await cursor.execute("""SELECT id, name, description, script, 
                                              created_at, updated_at 
                                       FROM modules 
                                       WHERE id = ?""", (module_id,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting module by id: {e}")
            return None
    
    async def get_module_by_name(self, name: str) -> Optional[Dict]:
        """Get module by name"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Use indexed column lookup
                await cursor.execute("""SELECT id, name, description, script, 
                                              created_at, updated_at 
                                       FROM modules 
                                       WHERE name = ?""", (name,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting module by name: {e}")
            return None
    
    async def add_module(self, module: Dict) -> bool:
        """Add new module"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT INTO modules 
                    (id, name, description, script, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    module.get("id"),
                    module.get("name"),
                    module.get("description", ""),
                    module.get("script", ""),
                    module.get("created_at"),
                    module.get("updated_at")
                ))
            logger.info(f"Module {module.get('name')} added")
            return True
        except aiosqlite.IntegrityError as e:
            logger.error(f"Module with name '{module.get('name')}' already exists")
            return False
        except Exception as e:
            logger.exception(f"Error adding module: {e}")
            return False
    
    async def update_module(self, module_id: str, updates: Dict) -> bool:
        """Update module"""
        try:
            # Allowed columns for modules table
            allowed_columns = ['name', 'description', 'script', 'updated_at']
            
            # Build update query dynamically with column validation
            set_clauses = []
            values = []
            
            # Always update updated_at
            set_clauses.append("updated_at = ?")
            values.append(datetime.now().isoformat())
            
            for key, value in updates.items():
                if key not in ["id", "created_at"]:  # Don't allow updating these
                    # Validate column name to prevent SQL injection
                    sanitized_key = sanitize_column_name(key, allowed_columns)
                    set_clauses.append(f"{sanitized_key} = ?")
                    values.append(value)
            
            if len(set_clauses) == 1:  # Only updated_at
                return False
            
            values.append(module_id)
            query = f"UPDATE modules SET {', '.join(set_clauses)} WHERE id = ?"
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(query, values)
                if cursor.rowcount > 0:
                    logger.info(f"Module {module_id} updated")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error updating module: {e}")
            return False
    
    async def delete_module(self, module_id: str) -> bool:
        """Delete module"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM modules WHERE id = ?", (module_id,))
                if cursor.rowcount > 0:
                    logger.info(f"Module {module_id} deleted")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error deleting module: {e}")
            return False
    
    # API Token methods
    async def add_api_token(self, token_data: Dict) -> bool:
        """Add new API Token"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT INTO api_tokens 
                    (id, name, description, token, token_hash, expires_at, never_expires, permissions, created_by, created_at, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    token_data.get("id"),
                    token_data.get("name"),
                    token_data.get("description", ""),
                    token_data.get("token"),
                    token_data.get("token_hash"),
                    token_data.get("expires_at"),
                    1 if token_data.get("never_expires", False) else 0,
                    json.dumps(token_data.get("permissions", [])),
                    token_data.get("created_by"),
                    token_data.get("created_at"),
                    1 if token_data.get("is_active", True) else 0
                ))
            logger.info(f"API Token {token_data.get('name')} added")
            return True
        except aiosqlite.IntegrityError as e:
            logger.error(f"API Token already exists")
            return False
        except Exception as e:
            logger.exception(f"Error adding API token: {e}")
            return False
    
    async def get_api_tokens(self, include_inactive: bool = False) -> List[Dict]:
        """Get list of API Tokens"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Use indexed columns and ORDER BY
                if include_inactive:
                    await cursor.execute("""SELECT id, name, token_hash, permissions, 
                                                  created_at, expires_at, last_used_at, 
                                                  never_expires, is_active 
                                           FROM api_tokens 
                                           ORDER BY created_at DESC""")
                else:
                    await cursor.execute("""SELECT id, name, token_hash, permissions, 
                                                  created_at, expires_at, last_used_at, 
                                                  never_expires, is_active 
                                           FROM api_tokens 
                                           WHERE is_active = 1 
                                           ORDER BY created_at DESC""")
                rows = await cursor.fetchall()
                tokens = []
                for row in rows:
                    token_dict = dict(row)
                    # Parse permissions JSON
                    if token_dict.get("permissions"):
                        try:
                            token_dict["permissions"] = json.loads(token_dict["permissions"])
                        except:
                            token_dict["permissions"] = []
                    else:
                        token_dict["permissions"] = []
                    # Convert never_expires to boolean
                    token_dict["never_expires"] = bool(token_dict.get("never_expires", 0))
                    token_dict["is_active"] = bool(token_dict.get("is_active", 1))
                    # Don't return full token, only hash
                    token_dict.pop("token", None)
                    tokens.append(token_dict)
                return tokens
        except Exception as e:
            logger.exception(f"Error getting API tokens: {e}")
            return []
    
    async def get_api_token_by_hash(self, token_hash: str) -> Optional[Dict]:
        """Get API Token by hash"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Use indexed column lookup
                await cursor.execute("""SELECT id, name, token_hash, permissions, 
                                              created_at, expires_at, last_used_at, 
                                              never_expires, is_active 
                                       FROM api_tokens 
                                       WHERE token_hash = ? AND is_active = 1""", (token_hash,))
                row = await cursor.fetchone()
                if row:
                    token_dict = dict(row)
                    # Parse permissions JSON
                    if token_dict.get("permissions"):
                        try:
                            token_dict["permissions"] = json.loads(token_dict["permissions"])
                        except:
                            token_dict["permissions"] = []
                    else:
                        token_dict["permissions"] = []
                    token_dict["never_expires"] = bool(token_dict.get("never_expires", 0))
                    token_dict["is_active"] = bool(token_dict.get("is_active", 1))
                    return token_dict
                return None
        except Exception as e:
            logger.exception(f"Error getting API token by hash: {e}")
            return None
    
    async def update_api_token_last_used(self, token_hash: str) -> bool:
        """Update last usage of token"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    UPDATE api_tokens 
                    SET last_used_at = ? 
                    WHERE token_hash = ?
                """, (datetime.now().isoformat(), token_hash))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating API token last used: {e}")
            return False
    
    async def delete_api_token(self, token_id: str) -> bool:
        """Delete API Token"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM api_tokens WHERE id = ?", (token_id,))
                if cursor.rowcount > 0:
                    logger.info(f"API Token {token_id} deleted")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error deleting API token: {e}")
            return False
    
    async def deactivate_api_token(self, token_id: str) -> bool:
        """Disable API Token"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("UPDATE api_tokens SET is_active = 0 WHERE id = ?", (token_id,))
                if cursor.rowcount > 0:
                    logger.info(f"API Token {token_id} deactivated")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error deactivating API token: {e}")
            return False
    
    async def update_api_token(self, token_id: str, updates: Dict) -> bool:
        """Update API Token"""
        try:
            # Allowed columns for api_tokens table
            allowed_columns = ['name', 'description', 'permissions', 'expires_at', 'never_expires', 'is_active']
            
            # Build update query dynamically with column validation
            set_clauses = []
            values = []
            
            for key, value in updates.items():
                # Validate column name to prevent SQL injection
                sanitized_key = sanitize_column_name(key, allowed_columns)
                
                if sanitized_key == "permissions":
                    # Convert permissions list to JSON string
                    set_clauses.append("permissions = ?")
                    values.append(json.dumps(value) if isinstance(value, list) else value)
                elif sanitized_key == "never_expires":
                    # Convert boolean to integer
                    set_clauses.append("never_expires = ?")
                    values.append(1 if value else 0)
                elif sanitized_key in allowed_columns:
                    set_clauses.append(f"{sanitized_key} = ?")
                    values.append(value)
            
            if len(set_clauses) == 0:
                return False
            
            values.append(token_id)
            query = f"UPDATE api_tokens SET {', '.join(set_clauses)} WHERE id = ?"
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute(query, values)
                if cursor.rowcount > 0:
                    logger.info(f"API Token {token_id} updated")
                    return True
                return False
        except Exception as e:
            logger.exception(f"Error updating API token: {e}")
            return False
    
    async def get_api_token_by_id(self, token_id: str) -> Optional[Dict]:
        """Get API Token by ID"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM api_tokens WHERE id = ?", (token_id,))
                row = await cursor.fetchone()
                if row:
                    token_dict = dict(row)
                    # Parse permissions JSON
                    if token_dict.get("permissions"):
                        try:
                            token_dict["permissions"] = json.loads(token_dict["permissions"])
                        except:
                            token_dict["permissions"] = []
                    else:
                        token_dict["permissions"] = []
                    token_dict["never_expires"] = bool(token_dict.get("never_expires", 0))
                    token_dict["is_active"] = bool(token_dict.get("is_active", 1))
                    # Don't return full token
                    token_dict.pop("token", None)
                    return token_dict
                return None
        except Exception as e:
            logger.exception(f"Error getting API token by ID: {e}")
            return None
    
    # Session methods
    async def add_session(self, session_data: Dict) -> bool:
        """Add new session"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT OR REPLACE INTO sessions 
                    (token, token_partial, username, ip_address, user_agent, created_at, expires_at, last_activity)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    session_data.get("full_token"),
                    session_data.get("token"),
                    session_data.get("username"),
                    session_data.get("ip_address"),
                    session_data.get("user_agent"),
                    session_data.get("created_at"),
                    session_data.get("expires_at"),
                    session_data.get("last_activity")
                ))
                return True
        except Exception as e:
            logger.exception(f"Error adding session: {e}")
            return False
    
    async def get_session(self, token: str) -> Optional[Dict]:
        """Get session by token"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM sessions WHERE token = ?", (token,))
                row = await cursor.fetchone()
                if row:
                    session_dict = dict(row)
                    # Convert token_partial back to token for compatibility
                    full_token = session_dict.get("token", "")
                    token_partial = session_dict.get("token_partial", "")
                    session_dict["token"] = token_partial if token_partial else (full_token[:20] + "..." + full_token[-10:] if len(full_token) > 30 else full_token)
                    session_dict["full_token"] = full_token
                    return session_dict
                return None
        except Exception as e:
            logger.exception(f"Error getting session: {e}")
            return None
    
    async def get_all_sessions(self) -> List[Dict]:
        """Get all sessions"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM sessions ORDER BY created_at DESC")
                rows = await cursor.fetchall()
                logger.debug(f"Retrieved {len(rows)} session rows from database")
                sessions = []
                for row in rows:
                    session_dict = dict(row)
                    # Convert token_partial back to token for compatibility
                    full_token = session_dict.get("token", "")
                    token_partial = session_dict.get("token_partial", "")
                    
                    # Log if full_token is missing or too short
                    if not full_token or len(full_token) < 50:
                        logger.warning(f"Session for user {session_dict.get('username', 'unknown')} has invalid full_token (length: {len(full_token) if full_token else 0})")
                    
                    session_dict["token"] = token_partial if token_partial else (full_token[:20] + "..." + full_token[-10:] if len(full_token) > 30 else full_token)
                    session_dict["full_token"] = full_token
                    sessions.append(session_dict)
                
                logger.debug(f"Returning {len(sessions)} sessions from get_all_sessions")
                return sessions
        except Exception as e:
            logger.exception(f"Error getting all sessions: {e}")
            return []
    
    async def update_session_activity(self, token: str, last_activity: str) -> bool:
        """Update last_activity of a session"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    UPDATE sessions SET last_activity = ? WHERE token = ?
                """, (last_activity, token))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating session activity: {e}")
            return False
    
    async def remove_session(self, token: str) -> bool:
        """Delete session"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error removing session: {e}")
            return False
    
    async def remove_expired_sessions(self) -> int:
        """Delete expired sessions"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                now = datetime.now().isoformat()
                await cursor.execute("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ?", (now,))
                return cursor.rowcount
        except Exception as e:
            logger.exception(f"Error removing expired sessions: {e}")
            return 0
    
    # Blacklist methods
    async def add_to_blacklist(self, token: str, expires_at: str) -> bool:
        """Add token to blacklist"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT OR REPLACE INTO token_blacklist (token, expires_at)
                    VALUES (?, ?)
                """, (token, expires_at))
                logger.debug(f"Added token to blacklist: {token[:30]}..., expires_at: {expires_at}")
                # Verify it was added
                await cursor.execute("SELECT token FROM token_blacklist WHERE token = ?", (token,))
                if await cursor.fetchone():
                    logger.debug(f"Verified: Token exists in blacklist table: {token[:30]}...")
                else:
                    logger.error(f"ERROR: Token was NOT found in blacklist table after insert: {token[:30]}...")
                return True
        except Exception as e:
            logger.exception(f"Error adding to blacklist: {e}")
            return False
    
    async def is_token_in_blacklist(self, token: str) -> bool:
        """Check if token is in blacklist"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                now = datetime.now().isoformat()
                await cursor.execute("""
                    SELECT 1 FROM token_blacklist 
                    WHERE token = ? AND expires_at > ?
                """, (token, now))
                result = await cursor.fetchone() is not None
                if result:
                    logger.debug(f"Token found in database blacklist: {token[:30]}...")
                return result
        except Exception as e:
            logger.exception(f"Error checking blacklist: {e}")
            return False
    
    async def remove_from_blacklist(self, token: str) -> bool:
        """Remove token from blacklist"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM token_blacklist WHERE token = ?", (token,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error removing from blacklist: {e}")
            return False
    
    async def cleanup_blacklist(self) -> int:
        """Clear expired tokens from blacklist"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                now = datetime.now().isoformat()
                await cursor.execute("DELETE FROM token_blacklist WHERE expires_at < ?", (now,))
                return cursor.rowcount
        except Exception as e:
            logger.exception(f"Error cleaning up blacklist: {e}")
            return 0
    
    # ==========================================
    # Module Control Panel - Modular System
    # ==========================================
    
    # Module Categories Methods
    async def get_module_categories(self, active_only: bool = False) -> List[Dict]:
        """Get list of module categories"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                if active_only:
                    await cursor.execute("SELECT * FROM module_categories WHERE is_active = 1 ORDER BY order_index, name")
                else:
                    await cursor.execute("SELECT * FROM module_categories ORDER BY order_index, name")
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.exception(f"Error getting module categories: {e}")
            return []
    
    async def get_module_category(self, category_id: str) -> Optional[Dict]:
        """Get a specific category"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM module_categories WHERE id = ?", (category_id,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting module category: {e}")
            return None
    
    async def add_module_category(self, category: Dict) -> bool:
        """Add new category"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # If setting as default, unset all other defaults first
                if category.get("is_default", 0):
                    await cursor.execute("UPDATE module_categories SET is_default = 0")
                
                await cursor.execute("""
                    INSERT INTO module_categories 
                    (id, name, label, icon, order_index, is_active, is_default, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    category.get("id"),
                    category.get("name"),
                    category.get("label"),
                    category.get("icon"),
                    category.get("order_index", 0),
                    category.get("is_active", 1),
                    category.get("is_default", 0),
                    category.get("created_at"),
                    category.get("updated_at")
                ))
            logger.info(f"Module category {category.get('id')} added")
            return True
        except Exception as e:
            logger.exception(f"Error adding module category: {e}")
            return False
    
    async def update_module_category(self, category_id: str, category: Dict) -> bool:
        """Update category"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # If setting as default, unset all other defaults first
                if category.get("is_default") is not None and category.get("is_default"):
                    await cursor.execute("UPDATE module_categories SET is_default = 0 WHERE id != ?", (category_id,))
                
                # Build update query dynamically based on provided fields
                updates = []
                values = []
                
                if "name" in category:
                    updates.append("name = ?")
                    values.append(category.get("name"))
                if "label" in category:
                    updates.append("label = ?")
                    values.append(category.get("label"))
                if "icon" in category:
                    updates.append("icon = ?")
                    values.append(category.get("icon"))
                if "order_index" in category:
                    updates.append("order_index = ?")
                    values.append(category.get("order_index"))
                if "is_active" in category:
                    updates.append("is_active = ?")
                    values.append(category.get("is_active"))
                if "is_default" in category:
                    updates.append("is_default = ?")
                    values.append(category.get("is_default"))
                if "updated_at" in category:
                    updates.append("updated_at = ?")
                    values.append(category.get("updated_at"))
                
                values.append(category_id)
                
                if updates:
                    await cursor.execute(f"""
                        UPDATE module_categories 
                        SET {', '.join(updates)}
                        WHERE id = ?
                    """, values)
                    return cursor.rowcount > 0
                return False
        except Exception as e:
            logger.exception(f"Error updating module category: {e}")
            return False
    
    async def delete_module_category(self, category_id: str) -> bool:
        """Delete category"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM module_categories WHERE id = ?", (category_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting module category: {e}")
            return False
    
    # Module Sections Methods
    async def get_module_sections(self, category_id: Optional[str] = None, active_only: bool = False) -> List[Dict]:
        """Get list of module sections"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                if category_id:
                    if active_only:
                        await cursor.execute("SELECT * FROM module_sections WHERE category_id = ? AND is_active = 1 ORDER BY order_index, name", (category_id,))
                    else:
                        await cursor.execute("SELECT * FROM module_sections WHERE category_id = ? ORDER BY order_index, name", (category_id,))
                else:
                    if active_only:
                        await cursor.execute("SELECT * FROM module_sections WHERE is_active = 1 ORDER BY category_id, order_index, name")
                    else:
                        await cursor.execute("SELECT * FROM module_sections ORDER BY category_id, order_index, name")
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.exception(f"Error getting module sections: {e}")
            return []
    
    async def get_module_section(self, section_id: str) -> Optional[Dict]:
        """Get a specific section"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM module_sections WHERE id = ?", (section_id,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting module section: {e}")
            return None
    
    async def add_module_section(self, section: Dict) -> bool:
        """Add new section"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT INTO module_sections 
                    (id, category_id, name, label, icon, order_index, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    section.get("id"),
                    section.get("category_id"),
                    section.get("name"),
                    section.get("label"),
                    section.get("icon"),
                    section.get("order_index", 0),
                    section.get("is_active", 1),
                    section.get("created_at"),
                    section.get("updated_at")
                ))
            logger.info(f"Module section {section.get('id')} added")
            return True
        except Exception as e:
            logger.exception(f"Error adding module section: {e}")
            return False
    
    async def update_module_section(self, section_id: str, section: Dict) -> bool:
        """Update section"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    UPDATE module_sections 
                    SET category_id = ?, name = ?, label = ?, icon = ?, order_index = ?, is_active = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    section.get("category_id"),
                    section.get("name"),
                    section.get("label"),
                    section.get("icon"),
                    section.get("order_index"),
                    section.get("is_active"),
                    section.get("updated_at"),
                    section_id
                ))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating module section: {e}")
            return False
    
    async def delete_module_section(self, section_id: str) -> bool:
        """Delete section"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM module_sections WHERE id = ?", (section_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting module section: {e}")
            return False
    
    # Module Items Methods
    async def get_module_items(self, section_id: Optional[str] = None, active_only: bool = False) -> List[Dict]:
        """Get list of module items"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                if section_id:
                    if active_only:
                        await cursor.execute("SELECT * FROM module_items WHERE section_id = ? AND is_active = 1 ORDER BY order_index, name", (section_id,))
                    else:
                        await cursor.execute("SELECT * FROM module_items WHERE section_id = ? ORDER BY order_index, name", (section_id,))
                else:
                    if active_only:
                        await cursor.execute("SELECT * FROM module_items WHERE is_active = 1 ORDER BY section_id, order_index, name")
                    else:
                        await cursor.execute("SELECT * FROM module_items ORDER BY section_id, order_index, name")
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.exception(f"Error getting module items: {e}")
            return []
    
    async def get_module_item(self, item_id: str) -> Optional[Dict]:
        """Get a specific item"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM module_items WHERE id = ?", (item_id,))
                row = await cursor.fetchone()
                return dict(row) if row else None
        except Exception as e:
            logger.exception(f"Error getting module item: {e}")
            return None
    
    async def add_module_item(self, item: Dict) -> bool:
        """Add new item"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    INSERT INTO module_items 
                    (id, section_id, name, label, icon, command, execution_type, order_index, is_active, requires_admin, description, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    item.get("id"),
                    item.get("section_id"),
                    item.get("name"),
                    item.get("label"),
                    item.get("icon"),
                    item.get("command"),
                    item.get("execution_type", "powershell"),
                    item.get("order_index", 0),
                    item.get("is_active", 1),
                    item.get("requires_admin", 0),
                    item.get("description"),
                    item.get("created_at"),
                    item.get("updated_at")
                ))
            logger.info(f"Module item {item.get('id')} added")
            return True
        except Exception as e:
            logger.exception(f"Error adding module item: {e}")
            return False
    
    async def update_module_item(self, item_id: str, item: Dict) -> bool:
        """Update item"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("""
                    UPDATE module_items 
                    SET section_id = ?, name = ?, label = ?, icon = ?, command = ?, execution_type = ?, order_index = ?, is_active = ?, requires_admin = ?, description = ?, updated_at = ?
                    WHERE id = ?
                """, (
                    item.get("section_id"),
                    item.get("name"),
                    item.get("label"),
                    item.get("icon"),
                    item.get("command"),
                    item.get("execution_type"),
                    item.get("order_index"),
                    item.get("is_active"),
                    item.get("requires_admin"),
                    item.get("description"),
                    item.get("updated_at"),
                    item_id
                ))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating module item: {e}")
            return False
    
    async def delete_module_item(self, item_id: str) -> bool:
        """Delete item"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM module_items WHERE id = ?", (item_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting module item: {e}")
            return False
    
    async def get_full_module_structure(self) -> List[Dict]:
        """Get complete module structure (category + section + item)"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                
                # Get categories
                await cursor.execute("SELECT * FROM module_categories WHERE is_active = 1 ORDER BY order_index, name")
                categories = [dict(row) for row in await cursor.fetchall()]
                
                for category in categories:
                    # Get sections for this category
                    await cursor.execute("SELECT * FROM module_sections WHERE category_id = ? AND is_active = 1 ORDER BY order_index, name", (category['id'],))
                    sections = [dict(row) for row in await cursor.fetchall()]
                    
                    for section in sections:
                        # Get items for this section
                        await cursor.execute("SELECT * FROM module_items WHERE section_id = ? AND is_active = 1 ORDER BY order_index, name", (section['id'],))
                        items = [dict(row) for row in await cursor.fetchall()]
                        section['items'] = items
                    
                    category['sections'] = sections
                
                return categories
        except Exception as e:
            logger.exception(f"Error getting full module structure: {e}")
            return []
    
    # ==================== Migration Methods ====================
    
    async def _migrate_remove_user_email_fullname(self, cursor):
        """Migration: Remove email and full_name columns from users table"""
        try:
            # Check if email or full_name columns exist
            await cursor.execute("PRAGMA table_info(users)")
            columns = await cursor.fetchall()
            column_names = [col[1] for col in columns]
            
            has_email = 'email' in column_names
            has_full_name = 'full_name' in column_names
            
            if not has_email and not has_full_name:
                # Already migrated
                return
            
            # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
            # Step 1: Create new table without email and full_name
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS users_new (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role_id TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT,
                    last_login TEXT,
                    created_by TEXT,
                    FOREIGN KEY (role_id) REFERENCES roles(id)
                )
            """)
            
            # Step 2: Copy data from old table to new table
            await cursor.execute("""
                INSERT INTO users_new (id, username, password_hash, role_id, is_active, created_at, updated_at, last_login, created_by)
                SELECT id, username, password_hash, role_id, is_active, created_at, updated_at, last_login, created_by
                FROM users
            """)
            
            # Step 3: Drop old table
            await cursor.execute("DROP TABLE users")
            
            # Step 4: Rename new table to users
            await cursor.execute("ALTER TABLE users_new RENAME TO users")
            
            # Step 5: Recreate indexes
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id)")
            await cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            
            logger.info("Migration completed: Removed email and full_name columns from users table")
        except Exception as e:
            logger.exception(f"Error during migration to remove email/full_name: {e}")
            # Don't fail initialization if migration fails
    
    # ==================== RBAC Methods ====================
    
    async def _init_default_roles_and_permissions(self, cursor):
        """Initialize default roles and permissions"""
        from datetime import datetime
        import uuid
        
        now = datetime.now().isoformat()
        
        # Default roles
        default_roles = [
            {
                "id": "role-admin",
                "name": "admin",
                "description": "Full system access",
                "is_system": 1
            },
            {
                "id": "role-operator",
                "name": "operator",
                "description": "Can execute commands and manage agents",
                "is_system": 1
            },
            {
                "id": "role-viewer",
                "name": "viewer",
                "description": "Read-only access",
                "is_system": 1
            }
        ]
        
        # Default permissions
        default_permissions = [
            
            # Agents
            {"name": "agents:view", "resource": "agents", "action": "view", "description": "View agents"},
            {"name": "agents:manage", "resource": "agents", "action": "manage", "description": "Manage agents"},
            
            # Tunnels
            {"name": "tunnels:view", "resource": "tunnels", "action": "view", "description": "View tunnels"},
            {"name": "tunnels:manage", "resource": "tunnels", "action": "manage", "description": "Manage tunnels"},
            {"name": "tunnels:connect", "resource": "tunnels", "action": "connect", "description": "Connect to tunnels"},
            
            # Commands
            {"name": "commands:execute", "resource": "commands", "action": "execute", "description": "Execute commands"},
            {"name": "commands:view", "resource": "commands", "action": "view", "description": "View command history"},
            
            # Modules
            {"name": "modules:view", "resource": "modules", "action": "view", "description": "View modules"},
            {"name": "modules:execute", "resource": "modules", "action": "execute", "description": "Execute modules"},
            {"name": "modules:manage", "resource": "modules", "action": "manage", "description": "Manage modules"},
            
            # Tasks
            {"name": "tasks:view", "resource": "tasks", "action": "view", "description": "View tasks"},
            {"name": "tasks:manage", "resource": "tasks", "action": "manage", "description": "Manage tasks"},
            
            # Agent Script
            {"name": "agent_script:view", "resource": "agent_script", "action": "view", "description": "View agent script"},
            {"name": "agent_script:manage", "resource": "agent_script", "action": "manage", "description": "Edit agent script"},
            
            # Settings - General
            {"name": "settings:view", "resource": "settings", "action": "view", "description": "View settings"},
            {"name": "settings:manage", "resource": "settings", "action": "manage", "description": "Manage settings"},
            
            # Settings - Modules Management
            {"name": "settings:modules:view", "resource": "settings", "action": "modules:view", "description": "View modules in settings"},
            {"name": "settings:modules:manage", "resource": "settings", "action": "modules:manage", "description": "Manage modules in settings"},
            
            # Settings - Dependencies
            {"name": "settings:dependencies:view", "resource": "settings", "action": "dependencies:view", "description": "View dependencies"},
            {"name": "settings:dependencies:manage", "resource": "settings", "action": "dependencies:manage", "description": "Manage dependencies"},
            
            # Settings - System Log
            {"name": "settings:system_log:view", "resource": "settings", "action": "system_log:view", "description": "View system log"},
            
            # Settings - Active Sessions
            {"name": "settings:sessions:view", "resource": "settings", "action": "sessions:view", "description": "View active sessions"},
            {"name": "settings:sessions:manage", "resource": "settings", "action": "sessions:manage", "description": "Manage active sessions"},
            
            # Settings - API Tokens
            {"name": "settings:api:view", "resource": "settings", "action": "api:view", "description": "View API tokens"},
            {"name": "settings:api:manage", "resource": "settings", "action": "api:manage", "description": "Manage API tokens"},
            
            # Settings - Routes
            {"name": "settings:routes:view", "resource": "settings", "action": "routes:view", "description": "View routes in settings"},
            {"name": "settings:routes:manage", "resource": "settings", "action": "routes:manage", "description": "Manage routes in settings"},
            
            # Settings - Module Control
            {"name": "settings:module_control:view", "resource": "settings", "action": "module_control:view", "description": "View module control panel"},
            {"name": "settings:module_control:manage", "resource": "settings", "action": "module_control:manage", "description": "Manage module control panel"},
            
            # Settings - Users & Roles
            {"name": "settings:users:view", "resource": "settings", "action": "users:view", "description": "View users in settings"},
            {"name": "settings:users:manage", "resource": "settings", "action": "users:manage", "description": "Manage users in settings"},
            
            # Users & Roles (Global)
            {"name": "users:view", "resource": "users", "action": "view", "description": "View users"},
            {"name": "users:manage", "resource": "users", "action": "manage", "description": "Manage users"},
            {"name": "roles:view", "resource": "roles", "action": "view", "description": "View roles"},
            {"name": "roles:manage", "resource": "roles", "action": "manage", "description": "Manage roles"},
            
            # API (Global)
            {"name": "api:view", "resource": "api", "action": "view", "description": "View API tokens"},
            {"name": "api:manage", "resource": "api", "action": "manage", "description": "Manage API tokens"},
            
            # Routes (Global)
            {"name": "routes:view", "resource": "routes", "action": "view", "description": "View routes"},
            {"name": "routes:manage", "resource": "routes", "action": "manage", "description": "Manage routes"},
            
            # SSH Sessions
            {"name": "ssh:view", "resource": "ssh", "action": "view", "description": "View SSH sessions"},
            {"name": "ssh:connect", "resource": "ssh", "action": "connect", "description": "Connect via SSH"},
            {"name": "ssh:manage", "resource": "ssh", "action": "manage", "description": "Manage SSH sessions"},
            
            # VNC/Remote Desktop
            {"name": "vnc:view", "resource": "vnc", "action": "view", "description": "View VNC/Remote Desktop"},
            {"name": "vnc:connect", "resource": "vnc", "action": "connect", "description": "Connect via VNC"},
            {"name": "vnc:manage", "resource": "vnc", "action": "manage", "description": "Manage VNC sessions"},
            
            # TTYD/Shell
            {"name": "shell:view", "resource": "shell", "action": "view", "description": "View shell/TTYD"},
            {"name": "shell:connect", "resource": "shell", "action": "connect", "description": "Connect to shell/TTYD"},
            {"name": "shell:manage", "resource": "shell", "action": "manage", "description": "Manage shell/TTYD sessions"},
            
            # Files
            {"name": "files:view", "resource": "files", "action": "view", "description": "View files"},
            {"name": "files:upload", "resource": "files", "action": "upload", "description": "Upload files"},
            {"name": "files:download", "resource": "files", "action": "download", "description": "Download files"},
            {"name": "files:manage", "resource": "files", "action": "manage", "description": "Manage files"},
        ]
        
        # Insert default roles
        for role in default_roles:
            try:
                await cursor.execute("""
                    INSERT OR IGNORE INTO roles (id, name, description, is_system, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (role["id"], role["name"], role["description"], role["is_system"], now, now))
            except Exception:
                pass
        
        # Insert default permissions
        for perm in default_permissions:
            try:
                perm_id = f"perm-{perm['name'].replace(':', '-')}"
                hide_if_no_access = perm.get("hide_if_no_access", 0)
                hide_completely = perm.get("hide_completely", 0)
                await cursor.execute("""
                    INSERT OR IGNORE INTO permissions (id, name, resource, action, description, hide_if_no_access, hide_completely, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (perm_id, perm["name"], perm["resource"], perm["action"], perm["description"], hide_if_no_access, hide_completely, now))
            except Exception:
                pass
        
        # Assign permissions to admin role (all permissions)
        try:
            for perm in default_permissions:
                perm_id = f"perm-{perm['name'].replace(':', '-')}"
                await cursor.execute("""
                    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
                    VALUES (?, ?)
                """, ("role-admin", perm_id))
        except Exception:
            pass
        
        # Assign permissions to operator role
        operator_permissions = [
            # Agents
            "agents:view", "agents:manage",
            # Tunnels
            "tunnels:view", "tunnels:manage", "tunnels:connect",
            # Commands
            "commands:execute", "commands:view",
            # Modules
            "modules:view", "modules:execute",
            # Tasks
            "tasks:view", "tasks:manage",
            # Agent Script
            "agent_script:view",
            # Routes
            "routes:view",
            # SSH
            "ssh:view", "ssh:connect",
            # VNC
            "vnc:view", "vnc:connect",
            # Shell
            "shell:view", "shell:connect",
            # Files
            "files:view", "files:upload", "files:download",
            # Settings (limited)
            "settings:view", "settings:system_log:view", "settings:sessions:view"
        ]
        try:
            for perm_name in operator_permissions:
                perm_id = f"perm-{perm_name.replace(':', '-')}"
                await cursor.execute("""
                    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
                    VALUES (?, ?)
                """, ("role-operator", perm_id))
        except Exception:
            pass
        
        # Assign permissions to viewer role
        viewer_permissions = [
            # Agents
            "agents:view",
            # Tunnels
            "tunnels:view",
            # Commands
            "commands:view",
            # Modules
            "modules:view",
            # Tasks
            "tasks:view",
            # Routes
            "routes:view",
            # Settings (read-only)
            "settings:view", "settings:system_log:view"
        ]
        try:
            for perm_name in viewer_permissions:
                perm_id = f"perm-{perm_name.replace(':', '-')}"
                await cursor.execute("""
                    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
                    VALUES (?, ?)
                """, ("role-viewer", perm_id))
        except Exception:
            pass
    
    # User Management Methods
    async def create_user(self, user_data: Dict) -> bool:
        """Create a new user"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                import uuid
                from datetime import datetime
                from api.utils.password import hash_password
                
                user_id = user_data.get("id") or str(uuid.uuid4())
                now = datetime.now().isoformat()
                
                # Hash password if provided, otherwise use password_hash if provided
                if "password_hash" in user_data and user_data.get("password_hash"):
                    password_hash = user_data.get("password_hash")
                else:
                    password = user_data.get("password", "")
                    if not password:
                        raise ValueError("Either 'password' or 'password_hash' must be provided")
                    password_hash = hash_password(password)
                
                await cursor.execute("""
                    INSERT INTO users (id, username, password_hash, role_id, is_active, created_at, updated_at, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id,
                    user_data.get("username"),
                    password_hash,
                    user_data.get("role_id"),
                    user_data.get("is_active", 1),
                    now,
                    now,
                    user_data.get("created_by")
                ))
                return True
        except Exception as e:
            logger.exception(f"Error creating user: {e}")
            return False
    
    async def get_users(self) -> List[Dict]:
        """Get all users"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Select specific columns instead of u.* for better performance
                await cursor.execute("""
                    SELECT u.id, u.username, u.role_id, u.created_at, u.updated_at,
                           r.name as role_name, r.description as role_description
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    ORDER BY u.created_at DESC
                """)
                users = []
                for row in await cursor.fetchall():
                    user = dict(row)
                    # Fields already excluded from SELECT, no need to pop
                    users.append(user)
                return users
        except Exception as e:
            logger.exception(f"Error getting users: {e}")
            return []
    
    async def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """Get user by ID"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Select specific columns instead of u.* for better performance
                await cursor.execute("""
                    SELECT u.id, u.username, u.role_id, u.is_active, 
                           u.created_at, u.updated_at, u.created_by, u.last_login,
                           r.name as role_name, r.description as role_description
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    WHERE u.id = ?
                """, (user_id,))
                row = await cursor.fetchone()
                if row:
                    user = dict(row)
                    # Fields already excluded from SELECT, no need to pop
                    return user
                return None
        except Exception as e:
            logger.exception(f"Error getting user: {e}")
            return None
    
    async def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Get user by username (includes password hash for authentication)"""
        try:
            if not username:
                logger.warning("get_user_by_username called with empty username")
                return None
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Try exact match first (uses indexed username column)
                await cursor.execute("""
                    SELECT u.id, u.username, u.password_hash, u.role_id, u.is_active, 
                           u.created_at, u.updated_at, u.created_by,
                           r.name as role_name, r.description as role_description
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    WHERE u.username = ?
                """, (username,))
                row = await cursor.fetchone()
                if row:
                    user = dict(row)
                    logger.debug(f"Found user by exact match: username='{username}', id={user.get('id')}")
                    return user
                
                # Try case-insensitive match (fallback, less efficient)
                await cursor.execute("""
                    SELECT u.id, u.username, u.password_hash, u.role_id, u.is_active, 
                           u.created_at, u.updated_at, u.created_by,
                           r.name as role_name, r.description as role_description
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    WHERE LOWER(u.username) = LOWER(?)
                """, (username,))
                row = await cursor.fetchone()
                if row:
                    user = dict(row)
                    logger.warning(f"Found user by case-insensitive match: username='{username}' matched '{user.get('username')}', id={user.get('id')}")
                    return user
                
                logger.warning(f"User not found by username: '{username}'")
                return None
        except Exception as e:
            logger.exception(f"Error getting user by username '{username}': {e}")
            return None
    
    async def update_user(self, user_id: str, updates: Dict) -> bool:
        """Update user"""
        try:
            # Allowed columns for users table
            allowed_columns = ['username', 'password_hash', 'role_id', 'is_active', 'last_login', 'updated_at']
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                from datetime import datetime
                from api.utils.password import hash_password
                
                updates["updated_at"] = datetime.now().isoformat()
                
                # Hash password if provided
                if "password" in updates:
                    password = updates.pop("password")
                    updates["password_hash"] = hash_password(password)
                
                # Build update query dynamically with column validation
                set_clauses = []
                values = []
                for key, value in updates.items():
                    if key != "id":
                        # Validate column name to prevent SQL injection
                        sanitized_key = sanitize_column_name(key, allowed_columns)
                        set_clauses.append(f"{sanitized_key} = ?")
                        values.append(value)
                
                if not set_clauses:
                    return False
                
                values.append(user_id)
                query = f"UPDATE users SET {', '.join(set_clauses)} WHERE id = ?"
                await cursor.execute(query, values)
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error updating user: {e}")
            return False
    
    async def delete_user(self, user_id: str) -> bool:
        """Delete user"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting user: {e}")
            return False
    
    # Role Management Methods
    async def get_roles(self) -> List[Dict]:
        """Get all roles with their permissions"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM roles ORDER BY name")
                roles = []
                for row in await cursor.fetchall():
                    role = dict(row)
                    role_id = role["id"]
                    # Get permissions for this role
                    await cursor.execute("""
                        SELECT p.*
                        FROM permissions p
                        INNER JOIN role_permissions rp ON p.id = rp.permission_id
                        WHERE rp.role_id = ?
                    """, (role_id,))
                    permissions = [dict(perm_row) for perm_row in await cursor.fetchall()]
                    role["permissions"] = permissions
                    logger.info(f"Role {role_id} ({role.get('name')}) has {len(permissions)} permissions")
                    roles.append(role)
                logger.info(f"get_roles returning {len(roles)} roles with permissions")
                return roles
        except Exception as e:
            logger.exception(f"Error getting roles: {e}")
            return []
    
    async def get_role_by_id(self, role_id: str) -> Optional[Dict]:
        """Get role by ID with permissions"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM roles WHERE id = ?", (role_id,))
                row = await cursor.fetchone()
                if row:
                    role = dict(row)
                    # Get permissions for this role
                    # Note: hide_if_no_access and hide_completely are only in permissions table, not role_permissions
                    await cursor.execute("""
                        SELECT p.*
                        FROM permissions p
                        INNER JOIN role_permissions rp ON p.id = rp.permission_id
                        WHERE rp.role_id = ?
                    """, (role_id,))
                    role["permissions"] = [dict(row) for row in await cursor.fetchall()]
                    return role
                return None
        except Exception as e:
            logger.exception(f"Error getting role: {e}")
            return None
    
    async def create_role(self, role_data: Dict) -> bool:
        """Create a new role"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                import uuid
                from datetime import datetime
                
                role_id = role_data.get("id") or str(uuid.uuid4())
                now = datetime.now().isoformat()
                
                await cursor.execute("""
                    INSERT INTO roles (id, name, description, is_system, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    role_id,
                    role_data.get("name"),
                    role_data.get("description"),
                    role_data.get("is_system", 0),
                    now,
                    now
                ))
                
                # Add permissions if provided
                if "permission_ids" in role_data:
                    for perm_id in role_data["permission_ids"]:
                        await cursor.execute("""
                            INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
                            VALUES (?, ?)
                        """, (role_id, perm_id))
                
                return True
        except Exception as e:
            logger.exception(f"Error creating role: {e}")
            return False
    
    async def update_role(self, role_id: str, updates: Dict) -> bool:
        """Update role"""
        try:
            # Allowed columns for roles table
            allowed_columns = ['name', 'description', 'updated_at']
            
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                from datetime import datetime
                
                logger.info(f"Updating role {role_id} with updates: {updates}")
                
                updates["updated_at"] = datetime.now().isoformat()
                
                # Handle permissions separately - extract before building UPDATE query
                permission_ids = updates.pop("permission_ids", None)
                permission_settings = updates.pop("permission_settings", {})
                
                logger.info(f"Permission IDs: {permission_ids}")
                logger.info(f"Permission settings: {permission_settings}")
                
                # Build update query dynamically with column validation
                set_clauses = []
                values = []
                for key, value in updates.items():
                    if key != "id":
                        # Validate column name to prevent SQL injection
                        sanitized_key = sanitize_column_name(key, allowed_columns)
                        set_clauses.append(f"{sanitized_key} = ?")
                        values.append(value)
                
                if set_clauses:
                    values.append(role_id)
                    await cursor.execute(f"""
                        UPDATE roles 
                        SET {', '.join(set_clauses)}
                        WHERE id = ?
                    """, values)
                    logger.info(f"Updated role table with {len(set_clauses)} fields")
                
                # Update permissions
                if permission_ids is not None:
                    # Remove all existing permissions
                    await cursor.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
                    deleted_count = cursor.rowcount
                    logger.info(f"Deleted {deleted_count} existing permissions for role {role_id}")
                    
                    # Add new permissions
                    inserted_count = 0
                    for perm_id in permission_ids:
                        perm_settings = permission_settings.get(perm_id, {})
                        hide_if_no_access = perm_settings.get("hide_if_no_access", 0)
                        hide_completely = perm_settings.get("hide_completely", 0)
                        await cursor.execute("""
                            INSERT INTO role_permissions (role_id, permission_id, hide_if_no_access, hide_completely)
                            VALUES (?, ?, ?, ?)
                        """, (role_id, perm_id, hide_if_no_access, hide_completely))
                        inserted_count += 1
                        logger.info(f"Inserted permission {perm_id} for role {role_id} with hide_if_no_access={hide_if_no_access}, hide_completely={hide_completely}")
                    
                    logger.info(f"Inserted {inserted_count} permissions for role {role_id}")
                else:
                    logger.warning(f"No permission_ids provided for role {role_id}, skipping permission update")
                
                # Explicit commit to ensure changes are saved
                conn.commit()
                logger.info(f"Successfully updated role {role_id}")
                return True
        except Exception as e:
            logger.exception(f"Error updating role: {e}")
            return False
    
    async def delete_role(self, role_id: str) -> bool:
        """Delete role (only if not system role)"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                # Check if it's a system role
                await cursor.execute("SELECT is_system FROM roles WHERE id = ?", (role_id,))
                row = await cursor.fetchone()
                if row and dict(row).get("is_system") == 1:
                    return False  # Cannot delete system roles
                
                await cursor.execute("DELETE FROM roles WHERE id = ?", (role_id,))
                return cursor.rowcount > 0
        except Exception as e:
            logger.exception(f"Error deleting role: {e}")
            return False
    
    # Permission Management Methods
    async def get_permissions(self) -> List[Dict]:
        """Get all permissions"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT * FROM permissions ORDER BY resource, action")
                return [dict(row) for row in await cursor.fetchall()]
        except Exception as e:
            logger.exception(f"Error getting permissions: {e}")
            return []
    
    async def get_user_permissions(self, user_id: str) -> List[str]:
        """Get all permissions for a user (from role + custom permissions)"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                
                # Get role permissions
                await cursor.execute("""
                    SELECT p.name FROM permissions p
                    INNER JOIN role_permissions rp ON p.id = rp.permission_id
                    INNER JOIN users u ON rp.role_id = u.role_id
                    WHERE u.id = ?
                """, (user_id,))
                permissions = [row[0] for row in await cursor.fetchall()]
                
                # Get custom user permissions
                await cursor.execute("""
                    SELECT p.name FROM permissions p
                    INNER JOIN user_permissions up ON p.id = up.permission_id
                    WHERE up.user_id = ?
                """, (user_id,))
                custom_permissions = [row[0] for row in await cursor.fetchall()]
                
                # Combine and remove duplicates
                all_permissions = list(set(permissions + custom_permissions))
                return all_permissions
        except Exception as e:
            logger.exception(f"Error getting user permissions: {e}")
            return []
    
    async def check_user_permission(self, user_id: str, permission_name: str) -> bool:
        """Check if user has a specific permission (always True for single user system)"""
        # Single user system - all users have all permissions
        return True
    
    async def has_any_users(self) -> bool:
        """Check if any users exist in the database"""
        try:
            async with self._get_connection() as conn:
                cursor = await conn.cursor()
                await cursor.execute("SELECT COUNT(*) as count FROM users")
                row = await cursor.fetchone()
                return row[0] > 0 if row else False
        except Exception as e:
            logger.exception(f"Error checking if users exist: {e}")
            return False
