"""
SSH Sessions Management Routes
Handles SSH session management (get status, close sessions)
"""
from fastapi import APIRouter, HTTPException, Depends
from api.services.ssh_session_manager import SSHSessionManager
from api.services.process_manager import process_manager
from api.dependencies import get_current_user
from api.utils.logger import logger

router = APIRouter(tags=["ssh-sessions"])

# Import shared SSH session manager from command_execution module
from api.routes.command_execution import ssh_session_manager


@router.get("/{tunnel_id}")
async def get_session_status(
    tunnel_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get SSH session status for a tunnel"""
    try:
        # First check if route proxy is running for SSH (port 22)
        target_port = 22
        all_proxies = process_manager.get_all_route_proxies()
        route_proxy_running = False
        
        for key, proxy_info in all_proxies.items():
            if proxy_info.get("target_port") == target_port:
                process = proxy_info.get("process")
                if process and process.poll() is None:  # process is still running
                    route_proxy_running = True
                    break
        
        if not route_proxy_running:
            return {
                "success": True,
                "session_exists": False,
                "active": False,
                "message": "Route proxy for SSH (port 22) is not running. Please start it manually from Route Proxies section first."
            }
        
        session_info = await ssh_session_manager.get_session_info(tunnel_id)
        
        if not session_info:
            return {
                "success": True,
                "session_exists": False,
                "active": False,
                "message": "No SSH session found for this tunnel"
            }
        
        return {
            "success": True,
            "session_exists": True,
            "active": session_info.get("active", False),
            "hostname": session_info.get("hostname"),
            "port": session_info.get("port"),
            "username": session_info.get("username"),
            "created_at": session_info.get("created_at"),
            "socket_path": session_info.get("socket_path")
        }
    except Exception as e:
        logger.exception(f"Error getting SSH session status for tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting session status: {str(e)}")


@router.delete("/{tunnel_id}")
async def close_session(
    tunnel_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Close SSH session for a tunnel"""
    try:
        success = await ssh_session_manager.close_session(tunnel_id)
        
        if success:
            return {
                "success": True,
                "message": f"SSH session closed for tunnel {tunnel_id}"
            }
        else:
            return {
                "success": False,
                "message": f"No SSH session found for tunnel {tunnel_id}"
            }
    except Exception as e:
        logger.exception(f"Error closing SSH session for tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error closing session: {str(e)}")


@router.get("")
async def list_all_sessions(
    current_user: dict = Depends(get_current_user)
):
    """List all SSH sessions"""
    try:
        sessions = await ssh_session_manager.list_sessions()
        
        return {
            "success": True,
            "sessions": sessions,
            "count": len(sessions)
        }
    except Exception as e:
        logger.exception(f"Error listing SSH sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing sessions: {str(e)}")


@router.delete("")
async def close_all_sessions(
    current_user: dict = Depends(get_current_user)
):
    """Close all SSH sessions"""
    try:
        await ssh_session_manager.close_all_sessions()
        
        return {
            "success": True,
            "message": "All SSH sessions closed"
        }
    except Exception as e:
        logger.exception(f"Error closing all SSH sessions: {e}")
        raise HTTPException(status_code=500, detail=f"Error closing all sessions: {str(e)}")

