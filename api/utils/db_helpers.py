"""
Database Helper Utilities
ابزارهای کمکی برای دیتابیس
"""
import re
from typing import List, Dict, Any


def sanitize_column_name(column_name: str, allowed_columns: List[str]) -> str:
    """
    Sanitize و validate نام ستون برای جلوگیری از SQL injection
    
    Args:
        column_name: نام ستون
        allowed_columns: لیست ستون‌های مجاز
    
    Returns:
        نام ستون sanitized
    
    Raises:
        ValueError: اگر نام ستون مجاز نباشد
    """
    # Remove any dangerous characters
    column_name = re.sub(r'[^a-zA-Z0-9_]', '', column_name)
    
    # Check if column is in allowed list
    if column_name not in allowed_columns:
        raise ValueError(f"Column '{column_name}' is not allowed. Allowed columns: {allowed_columns}")
    
    return column_name


def build_update_query(table_name: str, updates: Dict[str, Any], allowed_columns: List[str], id_column: str = "id") -> tuple:
    """
    ساخت UPDATE query به صورت امن
    
    Args:
        table_name: نام جدول
        updates: دیکشنری با key-value pairs برای update
        allowed_columns: لیست ستون‌های مجاز
        id_column: نام ستون ID
    
    Returns:
        Tuple of (query_string, values_list)
    
    Raises:
        ValueError: اگر column name مجاز نباشد
    """
    set_clauses = []
    values = []
    
    for key, value in updates.items():
        # Validate column name
        sanitized_key = sanitize_column_name(key, allowed_columns)
        set_clauses.append(f"{sanitized_key} = ?")
        values.append(value)
    
    if not set_clauses:
        raise ValueError("No valid columns to update")
    
    # Add ID value at the end
    values.append(updates.get(id_column))
    
    query = f"UPDATE {table_name} SET {', '.join(set_clauses)} WHERE {id_column} = ?"
    
    return query, values

