"""
noVNC Management Routes
Handles starting, stopping, and checking noVNC client status
"""
from fastapi import APIRouter, HTTPException, Depends
from api.services.process_manager import process_manager
from api.services.command_executor import CommandExecutor
from api.services.winrm import WinRMService
from api.services.ssh import SSHService
from api.services.cloudflare import CloudflareService
from api.services.database import Database
from api.dependencies import get_current_user
from api.utils.logger import logger
from api.routes.vnc_check import check_vnc_server_on_windows
import socket
import subprocess
import time
import os
from pathlib import Path

router = APIRouter(tags=["commands"])

# Cache for CloudflareService instance
_cloudflare_service_cache = None
_cloudflare_credentials_hash = None

def get_cloudflare_service() -> CloudflareService:
    """Get CloudflareService instance, reading credentials from environment variables"""
    global _cloudflare_service_cache, _cloudflare_credentials_hash
    
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
    
    # Create hash of credentials to detect changes
    credentials_hash = f"{api_token}:{account_id}:{domain}"
    
    # Return cached instance if credentials haven't changed
    if _cloudflare_service_cache and _cloudflare_credentials_hash == credentials_hash:
        return _cloudflare_service_cache
    
    # Create new instance with updated credentials
    _cloudflare_service_cache = CloudflareService(api_token, account_id, domain)
    _cloudflare_credentials_hash = credentials_hash
    
    return _cloudflare_service_cache

# Initialize services
winrm_service = WinRMService()
ssh_service = SSHService()
db = Database()
# Import shared SSH session manager from command_execution module
from api.routes.command_execution import ssh_session_manager
command_executor = CommandExecutor(winrm_service, ssh_service, get_cloudflare_service(), db, ssh_session_manager)


def cleanup_dead_novnc_processes():
    """Clean up dead novnc processes from dictionary"""
    return process_manager.cleanup_dead_novnc_processes()


@router.get("/check-novnc/{tunnel_id}")
async def check_novnc(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """
    Check noVNC status for a tunnel
    """
    try:
        # First, check if VNC Server is installed on Windows
        vnc_check = await check_vnc_server_on_windows(tunnel_id, command_executor)
        
        # If system is not Windows (Linux), skip VNC Server check and proceed to noVNC check
        if vnc_check.get("is_windows") is False:
            # For Linux systems, skip VNC Server check and proceed directly to noVNC check
            logger.info(f"Tunnel {tunnel_id} is connected to Linux system, skipping VNC Server check")
            # Continue to noVNC check below - don't return error
        elif not vnc_check.get("installed"):
            # Windows system but VNC Server not installed
            error_message = f"❌ VNC Server Not Installed\n\n{vnc_check.get('message', 'VNC Server is not installed on the Windows system.')}\n\n"
            error_message += "Please install a VNC Server (TightVNC, RealVNC, or UltraVNC) on the Windows system first."
            
            return {
                "success": False,
                "running": False,
                "error": vnc_check.get("error", "vnc_not_installed"),
                "message": error_message
            }
        elif vnc_check.get("error") == "vnc_not_running":
            # Windows system but VNC Server not running
            error_message = f"⚠️ VNC Server Not Running\n\n{vnc_check.get('message', 'VNC Server is installed but not running.')}\n\n"
            error_message += "Please start the VNC Server service on the Windows system."
            
            return {
                "success": False,
                "running": False,
                "error": "vnc_not_running",
                "message": error_message
            }
        
        # VNC Server is installed and running, now check if novnc (client) is installed
        try:
            process_manager.find_novnc_path()
        except FileNotFoundError:
            # Get installation info from settings
            from api.routes.settings import check_novnc as check_novnc_install
            install_info = check_novnc_install()
            
            error_message = "❌ noVNC Not Installed\n\n" \
                          "noVNC is not installed on this system. Please install it first.\n\n"
            
            if install_info.get("install_command"):
                error_message += f"Install command: {install_info['install_command']}"
            else:
                error_message += "Install command: sudo snap install novnc"
            
            return {
                "success": False,
                "running": False,
                "error": "novnc_not_installed",
                "message": error_message
            }
        
        # Clean up dead processes
        cleanup_dead_novnc_processes()
        
        # Check if novnc process exists for this tunnel
        novnc_info = process_manager.get_novnc(tunnel_id)
        if novnc_info:
            process = novnc_info["process"]
            listen_port = novnc_info.get("listen_port")
            
            # Verify process is still running
            if process.poll() is None:  # process is still running
                # Also verify port is listening
                if listen_port:
                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        result = sock.connect_ex(('127.0.0.1', listen_port))
                        sock.close()
                        if result == 0:  # Port is listening
                            return {
                                "success": True,
                                "running": True,
                                "listen_port": novnc_info["listen_port"],
                                "vnc_host": novnc_info["vnc_host"],
                                "vnc_port": novnc_info["vnc_port"],
                                "started_at": novnc_info["started_at"],
                                "pid": process.pid
                            }
                        else:
                            # Port not listening, process might be dead
                            logger.debug(f"novnc process exists but port {listen_port} not listening")
                            process_manager.kill_novnc(tunnel_id)
                    except Exception as e:
                        logger.debug(f"Error checking novnc port: {e}")
                        process_manager.kill_novnc(tunnel_id)
                else:
                    # No listen_port, but process is running
                    return {
                        "success": True,
                        "running": True,
                        "listen_port": novnc_info.get("listen_port"),
                        "vnc_host": novnc_info["vnc_host"],
                        "vnc_port": novnc_info["vnc_port"],
                        "started_at": novnc_info["started_at"],
                        "pid": process.pid
                    }
            else:
                # Process stopped, remove from dict
                logger.debug(f"novnc process for tunnel {tunnel_id} has stopped")
                process_manager.kill_novnc(tunnel_id)
        
        # If not in dictionary, check if port might be in use by a novnc process
        # This handles the case where server was reloaded but process is still running
        common_ports = [6080, 6081, 6082, 6083, 6084, 6085]
        for port in common_ports:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                result = sock.connect_ex(('127.0.0.1', port))
                sock.close()
                if result == 0:  # Port is listening
                    # Check if it might be a novnc process
                    try:
                        import subprocess as sp
                        result = sp.run(['lsof', '-ti', f':{port}'], 
                                      capture_output=True, text=True, timeout=5)
                        if result.returncode == 0 and result.stdout.strip():
                            pid = result.stdout.strip().split('\n')[0]
                            # Check process name
                            try:
                                proc_result = sp.run(['ps', '-p', pid, '-o', 'comm='], 
                                                   capture_output=True, text=True, timeout=5)
                                if proc_result.returncode == 0:
                                    proc_name = proc_result.stdout.strip()
                                    if 'novnc' in proc_name.lower():
                                        # Found a novnc process - return it as running
                                        logger.debug(f"Found novnc process (PID: {pid}) on port {port} but not in dictionary")
                                        return {
                                            "success": True,
                                            "running": True,
                                            "listen_port": port,
                                            "vnc_host": "unknown",
                                            "vnc_port": "unknown",
                                            "started_at": time.time(),
                                            "pid": int(pid),
                                            "recovered": True
                                        }
                            except:
                                pass
                    except:
                        pass
            except:
                pass
        
        return {
            "success": True,
            "running": False
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start-novnc/{tunnel_id}")
async def start_novnc(tunnel_id: str, novnc_data: dict, current_user: dict = Depends(get_current_user)):
    """
    Start noVNC for a tunnel
    """
    try:
        # Get parameters
        listen_port = novnc_data.get("listen_port", 6080)
        vnc_host = novnc_data.get("vnc_host", "127.0.0.1")
        vnc_port = novnc_data.get("vnc_port", 5900)
        
        # Check if already running
        novnc_info = process_manager.get_novnc(tunnel_id)
        if novnc_info:
            process = novnc_info["process"]
            if process.poll() is None:  # process is still running
                return {
                    "success": True,
                    "message": "novnc is already running",
                    "already_running": True,
                    "listen_port": novnc_info["listen_port"],
                    "vnc_host": novnc_info["vnc_host"],
                    "vnc_port": novnc_info["vnc_port"]
                }
            else:
                # Process stopped, remove from dict
                process_manager.kill_novnc(tunnel_id)
        
        # Check if port is available
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(('0.0.0.0', listen_port))
            sock.close()
        except OSError:
            # Port is in use - check if it's a novnc process we can recover
            try:
                import subprocess as sp
                # Find process using the port
                result = sp.run(['lsof', '-ti', f':{listen_port}'], 
                              capture_output=True, text=True, timeout=5)
                if result.returncode == 0 and result.stdout.strip():
                    pid = result.stdout.strip().split('\n')[0]
                    # Check if it's a novnc process
                    try:
                        proc_result = sp.run(['ps', '-p', pid, '-o', 'comm='], 
                                           capture_output=True, text=True, timeout=5)
                        if proc_result.returncode == 0:
                            proc_name = proc_result.stdout.strip()
                            if 'novnc' in proc_name.lower():
                                # Found a novnc process - try to recover it
                                logger.debug(f"Found existing novnc process (PID: {pid}) using port {listen_port}, recovering...")
                                try:
                                    # Try to create a process object from PID (read-only, but we can check if it exists)
                                    import psutil
                                    proc = psutil.Process(int(pid))
                                    if proc.is_running():
                                        logger.debug(f"Found existing novnc process (PID: {pid}) but can't fully recover process object")
                                        return {
                                            "success": True,
                                            "message": "Found existing novnc process but cannot recover it fully. Please stop it manually and restart.",
                                            "already_running": False,
                                            "listen_port": listen_port,
                                            "vnc_host": vnc_host,
                                            "vnc_port": vnc_port,
                                            "pid": int(pid),
                                            "recovered": False,
                                            "note": "Please stop the existing process manually"
                                        }
                                except ImportError:
                                    # psutil not available, skip recovery
                                    pass
                                except Exception as recover_error:
                                    logger.debug(f"Error recovering novnc process: {recover_error}")
                    except:
                        pass
            except:
                pass
            
            # Port is in use and we can't recover, raise error
            raise HTTPException(
                status_code=400,
                detail=f"Port {listen_port} is already in use. Please choose a different port or stop the existing process."
            )
        
        # Start novnc process using process_manager
        try:
            process = process_manager.start_novnc(tunnel_id, listen_port, vnc_host, vnc_port)
        except FileNotFoundError as e:
            raise HTTPException(
                status_code=500,
                detail=str(e)
            )
        
        # Wait a bit to check if process started successfully
        time.sleep(1)
        
        if process.poll() is not None:
            # Process already exited (error)
            stderr = process.stderr.read() if process.stderr else ""
            process_manager.kill_novnc(tunnel_id)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start novnc: {stderr}"
            )
        
        return {
            "success": True,
            "message": "novnc started successfully",
            "listen_port": listen_port,
            "vnc_host": vnc_host,
            "vnc_port": vnc_port,
            "pid": process.pid
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop-novnc/{tunnel_id}")
async def stop_novnc(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """
    Stop noVNC for a tunnel
    """
    try:
        novnc_info = process_manager.get_novnc(tunnel_id)
        if not novnc_info:
            return {
                "success": False,
                "message": "novnc is not running for this tunnel"
            }
        
        process_manager.kill_novnc(tunnel_id)
        
        return {
            "success": True,
            "message": "novnc stopped successfully"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

