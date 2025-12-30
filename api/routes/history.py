"""
Command History Routes
API endpoints for command history and logging
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from api.dependencies import get_current_user
from api.services.database import Database
from api.utils.logger import logger
from typing import Optional
from datetime import datetime
import csv
import io
import json

router = APIRouter(prefix="/api/history", tags=["history"])

db = Database()


@router.get("/commands")
async def get_command_history(
    tunnel_id: Optional[str] = Query(None, description="Filter by tunnel ID"),
    limit: Optional[int] = Query(10, ge=1, le=1000, description="Limit results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    search: Optional[str] = Query(None, description="Search in command/output"),
    success_only: Optional[bool] = Query(None, description="Filter by success status"),
    current_user: dict = Depends(get_current_user)
):
    """Get command history with filters"""
    try:
        commands = await db.get_commands(
            tunnel_id=tunnel_id,
            limit=limit,
            offset=offset,
            search=search,
            success_only=success_only
        )
        
        stats = await db.get_command_stats(tunnel_id=tunnel_id)
        
        return {
            "success": True,
            "commands": commands,
            "stats": stats,
            "total": len(commands)
        }
    except Exception as e:
        logger.exception(f"Error getting command history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commands/{command_id}")
async def get_command(
    command_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific command by ID"""
    try:
        command = await db.get_command_by_id(command_id)
        if not command:
            raise HTTPException(status_code=404, detail="Command not found")
        
        return {
            "success": True,
            "command": command
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting command: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/commands/{command_id}")
async def delete_command(
    command_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a command from history"""
    try:
        success = await db.delete_command(command_id)
        if not success:
            raise HTTPException(status_code=404, detail="Command not found")
        
        return {
            "success": True,
            "message": "Command deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting command: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/commands")
async def clear_command_history(
    tunnel_id: Optional[str] = Query(None, description="Clear history for specific tunnel"),
    current_user: dict = Depends(get_current_user)
):
    """Clear command history"""
    try:
        count = await db.clear_commands(tunnel_id=tunnel_id)
        return {
            "success": True,
            "message": f"Cleared {count} command(s)",
            "deleted_count": count
        }
    except Exception as e:
        logger.exception(f"Error clearing command history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commands/export/csv")
async def export_commands_csv(
    tunnel_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Export command history to CSV"""
    try:
        commands = await db.get_commands(tunnel_id=tunnel_id)
        
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "id", "tunnel_id", "command", "success", "exit_code", 
            "timestamp", "output_length", "error"
        ])
        writer.writeheader()
        
        for cmd in commands:
            writer.writerow({
                "id": cmd.get("id", ""),
                "tunnel_id": cmd.get("tunnel_id", ""),
                "command": cmd.get("command", "")[:200],  # Truncate long commands
                "success": cmd.get("success", False),
                "exit_code": cmd.get("exit_code", ""),
                "timestamp": cmd.get("timestamp", ""),
                "output_length": len(cmd.get("output", "")),
                "error": cmd.get("error", "")[:200] if cmd.get("error") else ""
            })
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="command_history_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'}
        )
    except Exception as e:
        logger.exception(f"Error exporting commands to CSV: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/commands/export/json")
async def export_commands_json(
    tunnel_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Export command history to JSON"""
    try:
        commands = await db.get_commands(tunnel_id=tunnel_id)
        
        return StreamingResponse(
            iter([json.dumps(commands, indent=2, ensure_ascii=False)]),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="command_history_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json"'}
        )
    except Exception as e:
        logger.exception(f"Error exporting commands to JSON: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_command_stats(
    tunnel_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Get command statistics"""
    try:
        stats = await db.get_command_stats(tunnel_id=tunnel_id)
        return {
            "success": True,
            "stats": stats
        }
    except Exception as e:
        logger.exception(f"Error getting command stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

