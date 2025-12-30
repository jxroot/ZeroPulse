"""
Command Execution Routes
Handles command execution via WinRM or SSH through Cloudflare Tunnel
"""
from fastapi import APIRouter, HTTPException, Depends
from api.models.command import CommandByTunnelRequest, CommandExecuteRequest
from api.services.command_executor import CommandExecutor
from api.services.database import Database
from api.services.winrm import WinRMService
from api.services.ssh import SSHService
from api.services.cloudflare import CloudflareService
from api.dependencies import get_current_user
from api.utils.logger import logger
from api.utils.exceptions import (
    exception_to_http,
    TunnelNotFoundError,
    TunnelOfflineError,
    TunnelConfigurationError,
    RouteProxyNotRunningError
)
from datetime import datetime
import uuid
import os
from pathlib import Path

router = APIRouter(tags=["commands"])

def get_cloudflare_service() -> CloudflareService:
    """Get CloudflareService instance, reading credentials from environment variables"""
    # Try to reload .env file if python-dotenv is available
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent.parent.parent / '.env'
        if env_path.exists():
            load_dotenv(env_path, override=True)
    except ImportError:
        pass
    
    # Read from environment variables (will be updated after setup)
    api_token = os.getenv("CLOUDFLARE_API_TOKEN", "")
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
    domain = os.getenv("CLOUDFLARE_DOMAIN", "")
    
    return CloudflareService(api_token, account_id, domain)

# Initialize services
winrm_service = WinRMService()
ssh_service = SSHService()
db = Database()
cloudflare_service = get_cloudflare_service()
from api.services.ssh_session_manager import SSHSessionManager
# Use shared instance for session management
ssh_session_manager = SSHSessionManager()
command_executor = CommandExecutor(winrm_service, ssh_service, cloudflare_service, db, ssh_session_manager)


async def _save_command_to_history(tunnel_id: str, command: str, result=None, error: str = None, connection_type: str = None, username: str = None, password: str = None):
    """Helper function to save command to history"""
    try:
        command_data_dict = {
            "id": str(uuid.uuid4()),
            "tunnel_id": tunnel_id,
            "command": command,
            "output": result.output if result else "",
            "error": result.error if result else (error or ""),
            "success": result.success if result else False,
            "exit_code": result.exit_code if result else -1,
            "timestamp": datetime.now().isoformat(),
            "connection_type": connection_type,
            "username": username,
            "password": "***" if password else None  # Don't store actual password, just indicate if it was used
        }
        logger.info(f"Attempting to save command to history. Command: {command[:50]}...")
        saved = await db.add_command(command_data_dict)
        if saved:
            logger.info(f"Command saved successfully to history. ID: {command_data_dict['id']}")
        else:
            logger.error(f"Failed to save command to history (add_command returned False)")
    except Exception as db_error:
        logger.exception(f"Exception while saving command to history: {db_error}")


@router.post("/execute-by-tunnel/{tunnel_id}")
async def execute_command_by_tunnel(
    tunnel_id: str, 
    command_data: CommandByTunnelRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Execute command directly on Tunnel using cloudflared access tcp"""
    command = command_data.command
    result = None
    
    try:
        logger.info(f"Executing command on tunnel {tunnel_id}: {command[:100]}")
        result = await command_executor.execute_command(tunnel_id, command, use_powershell=False)
        logger.info(f"Command executed. Success: {result.success}, Exit code: {result.exit_code}")
        
        # Get connection info for history
        connection_type = await command_executor.get_connection_type(tunnel_id)
        tunnel = await db.get_tunnel_by_id(tunnel_id)
        username = None
        password = None
        if connection_type == "winrm":
            username = tunnel.get("winrm_username") if tunnel else None
            password = tunnel.get("winrm_password") if tunnel else None
        elif connection_type == "ssh":
            username = tunnel.get("ssh_username") if tunnel else None
            password = tunnel.get("ssh_password") if tunnel else None
        
        # Save command to history (even if execution failed)
        await _save_command_to_history(tunnel_id, command, result, connection_type=connection_type, username=username, password=password)
        
        return result
        
    except (TunnelConfigurationError, TunnelNotFoundError, TunnelOfflineError, RouteProxyNotRunningError) as e:
        # Save failed command to history
        error_detail = getattr(e, 'detail', str(e))
        # Try to get connection info even if command failed
        try:
            connection_type = await command_executor.get_connection_type(tunnel_id)
            tunnel = await db.get_tunnel_by_id(tunnel_id)
            username = None
            password = None
            if connection_type == "winrm":
                username = tunnel.get("winrm_username") if tunnel else None
                password = tunnel.get("winrm_password") if tunnel else None
            elif connection_type == "ssh":
                username = tunnel.get("ssh_username") if tunnel else None
                password = tunnel.get("ssh_password") if tunnel else None
            await _save_command_to_history(tunnel_id, command, error=error_detail, connection_type=connection_type, username=username, password=password)
        except:
            await _save_command_to_history(tunnel_id, command, error=error_detail)
        raise exception_to_http(e)
        
    except Exception as e:
        # Save error command to history
        error_detail = getattr(e, 'detail', str(e))
        # Try to get connection info even if command failed
        try:
            connection_type = await command_executor.get_connection_type(tunnel_id)
            tunnel = await db.get_tunnel_by_id(tunnel_id)
            username = None
            password = None
            if connection_type == "winrm":
                username = tunnel.get("winrm_username") if tunnel else None
                password = tunnel.get("winrm_password") if tunnel else None
            elif connection_type == "ssh":
                username = tunnel.get("ssh_username") if tunnel else None
                password = tunnel.get("ssh_password") if tunnel else None
            await _save_command_to_history(tunnel_id, command, error=error_detail, connection_type=connection_type, username=username, password=password)
        except:
            await _save_command_to_history(tunnel_id, command, error=error_detail)
        logger.exception(f"Error executing command on tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute-ps-by-tunnel/{tunnel_id}")
async def execute_powershell_by_tunnel(
    tunnel_id: str, 
    command_data: CommandByTunnelRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Execute PowerShell script directly on Tunnel using cloudflared access tcp"""
    command = command_data.command
    result = None
    
    try:
        logger.info(f"Executing PowerShell command on tunnel {tunnel_id}: {command[:100]}")
        result = await command_executor.execute_command(tunnel_id, command, use_powershell=True)
        logger.info(f"PowerShell command executed. Success: {result.success}, Exit code: {result.exit_code}")
        
        # Save command to history (even if execution failed)
        await _save_command_to_history(tunnel_id, command, result)
        
        return result
        
    except (TunnelConfigurationError, TunnelNotFoundError, TunnelOfflineError, RouteProxyNotRunningError) as e:
        # Save failed command to history
        error_detail = getattr(e, 'detail', str(e))
        await _save_command_to_history(tunnel_id, command, error=error_detail)
        raise exception_to_http(e)
        
    except Exception as e:
        # Save error command to history
        error_detail = getattr(e, 'detail', str(e))
        await _save_command_to_history(tunnel_id, command, error=error_detail)
        logger.exception(f"Error executing PowerShell command on tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/execute/{tunnel_id}")
async def execute_command(
    tunnel_id: str,
    request_data: CommandExecuteRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute command on tunnel with execution type (cmd or powershell)
    This endpoint is used by the Module Control Panel
    """
    command = request_data.command
    execution_type = request_data.execution_type or "cmd"
    
    # Normalize execution_type
    use_powershell = execution_type.lower() in ["powershell", "ps", "pwsh"]
    
    result = None
    
    try:
        logger.info(f"Executing {execution_type} command on tunnel {tunnel_id}: {command[:100]}")
        hostname = request_data.hostname
        result = await command_executor.execute_command(tunnel_id, command, use_powershell=use_powershell, hostname=hostname)
        logger.info(f"Command executed. Success: {result.success}, Exit code: {result.exit_code}")
        
        # Get connection info for history
        connection_type = await command_executor.get_connection_type(tunnel_id)
        tunnel = await db.get_tunnel_by_id(tunnel_id)
        username = None
        password = None
        if connection_type == "winrm":
            username = tunnel.get("winrm_username") if tunnel else None
            password = tunnel.get("winrm_password") if tunnel else None
        elif connection_type == "ssh":
            username = tunnel.get("ssh_username") if tunnel else None
            password = tunnel.get("ssh_password") if tunnel else None
        
        # Save command to history (even if execution failed)
        await _save_command_to_history(tunnel_id, command, result, connection_type=connection_type, username=username, password=password)
        
        return result
        
    except (TunnelConfigurationError, TunnelNotFoundError, TunnelOfflineError, RouteProxyNotRunningError) as e:
        # Save failed command to history
        error_detail = getattr(e, 'detail', str(e))
        # Try to get connection info even if command failed
        try:
            connection_type = await command_executor.get_connection_type(tunnel_id)
            tunnel = await db.get_tunnel_by_id(tunnel_id)
            username = None
            password = None
            if connection_type == "winrm":
                username = tunnel.get("winrm_username") if tunnel else None
                password = tunnel.get("winrm_password") if tunnel else None
            elif connection_type == "ssh":
                username = tunnel.get("ssh_username") if tunnel else None
                password = tunnel.get("ssh_password") if tunnel else None
            await _save_command_to_history(tunnel_id, command, error=error_detail, connection_type=connection_type, username=username, password=password)
        except:
            await _save_command_to_history(tunnel_id, command, error=error_detail)
        raise exception_to_http(e)
        
    except Exception as e:
        # Save error command to history
        error_detail = getattr(e, 'detail', str(e))
        # Try to get connection info even if command failed
        try:
            connection_type = await command_executor.get_connection_type(tunnel_id)
            tunnel = await db.get_tunnel_by_id(tunnel_id)
            username = None
            password = None
            if connection_type == "winrm":
                username = tunnel.get("winrm_username") if tunnel else None
                password = tunnel.get("winrm_password") if tunnel else None
            elif connection_type == "ssh":
                username = tunnel.get("ssh_username") if tunnel else None
                password = tunnel.get("ssh_password") if tunnel else None
            await _save_command_to_history(tunnel_id, command, error=error_detail, connection_type=connection_type, username=username, password=password)
        except:
            await _save_command_to_history(tunnel_id, command, error=error_detail)
        logger.exception(f"Error executing command on tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-winrm/{tunnel_id}")
async def test_winrm(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """Quick WinRM test - Check if WinRM is working on target system"""
    try:
        return await command_executor.test_winrm(tunnel_id)
    except Exception as e:
        logger.exception(f"Error testing WinRM for tunnel {tunnel_id}: {e}")
        error_msg = getattr(e, 'detail', str(e))
        return {
            "success": False,
            "tunnel_status": "error",
            "winrm_status": "error",
            "message": f"Error: {error_msg}"
        }


@router.get("/test-ssh/{tunnel_id}")
async def test_ssh(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """Quick SSH test - Check if SSH is working on target system"""
    try:
        return command_executor.test_ssh(tunnel_id)
    except Exception as e:
        logger.exception(f"Error testing SSH for tunnel {tunnel_id}: {e}")
        error_msg = getattr(e, 'detail', str(e))
        return {
            "success": False,
            "tunnel_status": "error",
            "ssh_status": "error",
            "message": f"Error: {error_msg}"
        }


@router.post("/test-winrm/{tunnel_id}")
async def test_winrm_custom(tunnel_id: str, test_data: dict, current_user: dict = Depends(get_current_user)):
    """Test WinRM connection with custom parameters"""
    try:
        hostname = test_data.get("hostname")
        username = test_data.get("username")
        password = test_data.get("password")
        
        if not hostname or not username or not password:
            return {
                "success": False,
                "message": "hostname, username, and password are required"
            }
        
        return await command_executor.test_winrm(tunnel_id, hostname=hostname, username=username, password=password)
    except Exception as e:
        logger.exception(f"Error testing WinRM for tunnel {tunnel_id}: {e}")
        error_msg = getattr(e, 'detail', str(e))
        return {
            "success": False,
            "message": f"Error: {error_msg}",
            "error": str(e)
        }


@router.post("/test-ssh/{tunnel_id}")
async def test_ssh_custom(tunnel_id: str, test_data: dict, current_user: dict = Depends(get_current_user)):
    """Test SSH connection with custom parameters"""
    try:
        hostname = test_data.get("hostname")
        username = test_data.get("username")
        
        if not hostname or not username:
            return {
                "success": False,
                "message": "hostname and username are required"
            }
        
        return await command_executor.test_ssh(tunnel_id, hostname=hostname, username=username)
    except Exception as e:
        logger.exception(f"Error testing SSH for tunnel {tunnel_id}: {e}")
        error_msg = getattr(e, 'detail', str(e))
        return {
            "success": False,
            "message": f"Error: {error_msg}",
            "error": str(e)
        }

