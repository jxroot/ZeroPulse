"""
ttyd Management Routes
Handles starting, stopping, and checking ttyd status
"""
from fastapi import APIRouter, HTTPException, Depends
from api.services.process_manager import process_manager
from api.services.database import Database
from api.dependencies import get_current_user
from api.utils.logger import logger
import socket
import subprocess
import time

db = Database()

router = APIRouter(tags=["commands"])


def cleanup_dead_ttyd_processes():
    """Clean up dead ttyd processes from dictionary"""
    return process_manager.cleanup_dead_ttyd_processes()


@router.get("/check-ttyd/{tunnel_id}")
async def check_ttyd(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """
    بررسی وضعیت ttyd برای یک tunnel
    """
    try:
        # Check if ttyd is installed
        try:
            process_manager.find_ttyd_path()
        except FileNotFoundError:
            # Get installation info from settings
            from api.routes.settings import check_ttyd as check_ttyd_install
            install_info = check_ttyd_install()
            
            error_message = "❌ ttyd Not Installed\n\n" \
                          "ttyd is not installed on this system. Please install it first.\n\n"
            
            if install_info.get("install_command"):
                error_message += f"Install command: {install_info['install_command']}"
            else:
                error_message += "Install command: sudo apt-get install ttyd"
            
            return {
                "success": False,
                "running": False,
                "error": "ttyd_not_installed",
                "message": error_message
            }
        
        # Clean up dead processes first
        cleanup_dead_ttyd_processes()
        
        # Get tunnel info from database for SSH credentials
        tunnel = await db.get_tunnel_by_id(tunnel_id)
        
        # Check if ttyd process exists for this tunnel
        ttyd_info = process_manager.get_ttyd(tunnel_id)
        if ttyd_info:
            process = ttyd_info["process"]
            listen_port = ttyd_info.get("listen_port")
            
            # Verify process is still running
            if process.poll() is None:  # process is still running
                # Also verify port is listening - this is critical
                if listen_port:
                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(1)  # Set timeout
                        result = sock.connect_ex(('127.0.0.1', listen_port))
                        sock.close()
                        if result == 0:  # Port is listening
                            # Use tunnel SSH info if ttyd_info has unknown values
                            ssh_user = ttyd_info.get("ssh_user") or "unknown"
                            ssh_host = ttyd_info.get("ssh_host") or "unknown"
                            ssh_port = ttyd_info.get("ssh_port") or "unknown"
                            
                            # Replace unknown values with tunnel data if available
                            if ssh_user == "unknown" and tunnel and tunnel.get("ssh_username"):
                                ssh_user = tunnel.get("ssh_username")
                            if ssh_host == "unknown" and tunnel:
                                ssh_host = tunnel.get("ssh_hostname") or tunnel.get("default_hostname") or "localhost"
                            if ssh_port == "unknown":
                                ssh_port = 22
                            
                            return {
                                "success": True,
                                "running": True,
                                "listen_port": ttyd_info["listen_port"],
                                "username": ttyd_info.get("username") or "unknown",
                                "ssh_user": ssh_user,
                                "ssh_host": ssh_host,
                                "ssh_port": ssh_port,
                                "writable": ttyd_info.get("writable", True),
                                "shared_session": ttyd_info.get("shared_session", False),
                                "started_at": ttyd_info.get("started_at"),
                                "pid": process.pid
                            }
                        else:
                            # Port not listening, process might be dead or stuck
                            logger.debug(f"ttyd process exists but port {listen_port} not listening, killing process")
                            process_manager.kill_ttyd(tunnel_id)
                            # Return not running
                            return {
                                "success": True,
                                "running": False
                            }
                    except Exception as e:
                        logger.debug(f"Error checking ttyd port: {e}")
                        process_manager.kill_ttyd(tunnel_id)
                        return {
                            "success": True,
                            "running": False
                        }
                else:
                    # No listen_port, but process is running - verify it's actually ttyd
                    # If we can't verify port, don't trust the process
                    logger.debug(f"ttyd process exists but no listen_port, killing to be safe")
                    process_manager.kill_ttyd(tunnel_id)
                    return {
                        "success": True,
                        "running": False
                    }
            else:
                # Process stopped, remove from dict
                logger.debug(f"ttyd process for tunnel {tunnel_id} has stopped")
                process_manager.kill_ttyd(tunnel_id)
        
        # If not in dictionary, check if port might be in use by a ttyd process
        # This handles the case where server was reloaded but process is still running
        common_ports = [8080, 8081, 8082, 8083, 8084, 8085]
        for port in common_ports:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                result = sock.connect_ex(('127.0.0.1', port))
                sock.close()
                if result == 0:  # Port is listening
                    # Check if it might be a ttyd process
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
                                    if 'ttyd' in proc_name.lower():
                                        # Found a ttyd process - verify it's actually running
                                        try:
                                            # Check if process is actually running
                                            check_proc = sp.run(['ps', '-p', pid], 
                                                              capture_output=True, text=True, timeout=5)
                                            if check_proc.returncode != 0:
                                                # Process is not running, skip
                                                continue
                                            
                                            # Verify port is actually listening (double check)
                                            sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                                            sock2.settimeout(1)
                                            port_check = sock2.connect_ex(('127.0.0.1', port))
                                            sock2.close()
                                            
                                            if port_check != 0:
                                                # Port not listening, skip
                                                continue
                                            
                                            # Get tunnel info from database for SSH credentials
                                            tunnel = await db.get_tunnel_by_id(tunnel_id)
                                            
                                            # Use tunnel SSH info if available
                                            ssh_user = "unknown"
                                            ssh_host = "unknown"
                                            ssh_port = 22
                                            
                                            if tunnel:
                                                ssh_user = tunnel.get("ssh_username") or "unknown"
                                                ssh_host = tunnel.get("ssh_hostname") or tunnel.get("default_hostname") or "localhost"
                                            
                                            # Found a ttyd process - return it as running
                                            logger.debug(f"Found ttyd process (PID: {pid}) on port {port} but not in dictionary")
                                            return {
                                                "success": True,
                                                "running": True,
                                                "listen_port": port,
                                                "username": "unknown",
                                                "ssh_user": ssh_user,
                                                "ssh_host": ssh_host,
                                                "ssh_port": ssh_port,
                                                "writable": True,
                                                "started_at": time.time(),
                                                "pid": int(pid),
                                                "recovered": True
                                            }
                                        except Exception as e:
                                            logger.debug(f"Error verifying ttyd process {pid}: {e}")
                                            continue
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


@router.post("/start-ttyd/{tunnel_id}")
async def start_ttyd(tunnel_id: str, ttyd_data: dict, current_user: dict = Depends(get_current_user)):
    """
    راه‌اندازی ttyd برای یک tunnel
    """
    try:
        # Get parameters
        listen_port = ttyd_data.get("listen_port", 8080)
        username = ttyd_data.get("username", "a")
        password = ttyd_data.get("password", "a")
        ssh_user = ttyd_data.get("ssh_user", "cltwo")
        ssh_host = ttyd_data.get("ssh_host", "localhost")
        ssh_port = ttyd_data.get("ssh_port", 2222)
        writable = ttyd_data.get("writable", True)
        shared_session = ttyd_data.get("shared_session", False)
        
        # Clean up dead processes first
        cleanup_dead_ttyd_processes()
        
        # Check if already running
        ttyd_info = process_manager.get_ttyd(tunnel_id)
        if ttyd_info:
            process = ttyd_info["process"]
            listen_port_old = ttyd_info.get("listen_port")
            
            # Check if process is still running
            if process.poll() is None:  # process is still running
                # If same port, return already running
                if listen_port_old == listen_port:
                    return {
                        "success": True,
                        "message": "ttyd is already running",
                        "already_running": True,
                        "listen_port": ttyd_info["listen_port"],
                        "username": ttyd_info["username"],
                        "ssh_user": ttyd_info["ssh_user"],
                        "ssh_host": ttyd_info["ssh_host"],
                        "ssh_port": ttyd_info["ssh_port"],
                        "writable": ttyd_info["writable"]
                    }
                else:
                    # Different port requested, kill old process
                    logger.debug(f"Killing old ttyd process on port {listen_port_old} to start on port {listen_port}")
                    process_manager.kill_ttyd(tunnel_id)
                    # Wait a bit for port to be released
                    time.sleep(0.5)
            else:
                # Process stopped, remove from dict
                logger.debug(f"Old ttyd process is dead, removing from dict")
                process_manager.kill_ttyd(tunnel_id)
        
        # Check if port is available
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(('0.0.0.0', listen_port))
            sock.close()
        except OSError:
            # Port is in use - check if it's a ttyd process we can kill
            port_freed = False
            try:
                import subprocess as sp
                # Find process using the port
                result = sp.run(['lsof', '-ti', f':{listen_port}'], 
                              capture_output=True, text=True, timeout=5)
                if result.returncode == 0 and result.stdout.strip():
                    pids = result.stdout.strip().split('\n')
                    for pid in pids:
                        pid = pid.strip()
                        if not pid:
                            continue
                        # Check if it's a ttyd process
                        try:
                            proc_result = sp.run(['ps', '-p', pid, '-o', 'comm='], 
                                               capture_output=True, text=True, timeout=5)
                            if proc_result.returncode == 0:
                                proc_name = proc_result.stdout.strip()
                                if 'ttyd' in proc_name.lower():
                                    # Found a ttyd process - kill it
                                    logger.debug(f"Found existing ttyd process (PID: {pid}) using port {listen_port}, killing it...")
                                    try:
                                        # Try graceful kill first
                                        kill_result = sp.run(['kill', pid], 
                                                           capture_output=True, text=True, timeout=5)
                                        if kill_result.returncode == 0:
                                            # Wait a bit for process to die
                                            time.sleep(0.5)
                                            # Check if still running
                                            check_result = sp.run(['ps', '-p', pid], 
                                                                 capture_output=True, text=True, timeout=5)
                                            if check_result.returncode != 0:
                                                # Process is dead
                                                logger.debug(f"Successfully killed ttyd process {pid}")
                                                port_freed = True
                                            else:
                                                # Force kill
                                                logger.debug(f"Force killing ttyd process {pid}")
                                                sp.run(['kill', '-9', pid], 
                                                      capture_output=True, text=True, timeout=5)
                                                time.sleep(0.3)
                                                port_freed = True
                                        else:
                                            # Try force kill
                                            logger.debug(f"Force killing ttyd process {pid}")
                                            sp.run(['kill', '-9', pid], 
                                                  capture_output=True, text=True, timeout=5)
                                            time.sleep(0.3)
                                            port_freed = True
                                    except Exception as kill_error:
                                        logger.debug(f"Error killing ttyd process {pid}: {kill_error}")
                                        # Try force kill as last resort
                                        try:
                                            sp.run(['kill', '-9', pid], 
                                                  capture_output=True, text=True, timeout=5)
                                            time.sleep(0.3)
                                            port_freed = True
                                        except:
                                            pass
                        except:
                            pass
            except Exception as e:
                logger.debug(f"Error checking port {listen_port}: {e}")
            
            # If we killed a ttyd process, verify port is now free
            if port_freed:
                time.sleep(0.5)  # Give it a moment
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.bind(('0.0.0.0', listen_port))
                    sock.close()
                    logger.debug(f"Port {listen_port} is now free after killing ttyd process")
                except OSError:
                    # Port still in use, might be another process
                    logger.warning(f"Port {listen_port} still in use after killing ttyd process")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Port {listen_port} is still in use. Please choose a different port or stop the existing process manually."
                    )
            else:
                # Port is in use by non-ttyd process or we couldn't kill it
                raise HTTPException(
                    status_code=400,
                    detail=f"Port {listen_port} is already in use. Please choose a different port or stop the existing process."
                )
        
        # Start ttyd process using process_manager
        try:
            process = process_manager.start_ttyd(
                tunnel_id, 
                listen_port, 
                username, 
                password, 
                ssh_user, 
                ssh_host, 
                ssh_port, 
                writable,
                shared_session
            )
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
            process_manager.kill_ttyd(tunnel_id)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to start ttyd: {stderr}"
            )
        
        return {
            "success": True,
            "message": "ttyd started successfully",
            "listen_port": listen_port,
            "username": username,
            "ssh_user": ssh_user,
            "ssh_host": ssh_host,
            "ssh_port": ssh_port,
            "writable": writable,
            "shared_session": shared_session,
            "pid": process.pid
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop-ttyd/{tunnel_id}")
async def stop_ttyd(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """
    متوقف کردن ttyd برای یک tunnel
    """
    try:
        ttyd_info = process_manager.get_ttyd(tunnel_id)
        if not ttyd_info:
            return {
                "success": False,
                "message": "ttyd is not running for this tunnel"
            }
        
        listen_port = ttyd_info.get("listen_port")
        process_manager.kill_ttyd(tunnel_id)
        
        # Clean up dead processes
        cleanup_dead_ttyd_processes()
        
        # Verify process is actually stopped
        time.sleep(0.5)  # Give it a moment to fully stop
        remaining_info = process_manager.get_ttyd(tunnel_id)
        if remaining_info:
            logger.warning(f"ttyd process still exists after kill for tunnel {tunnel_id}, forcing cleanup")
            process_manager.kill_ttyd(tunnel_id)  # Try again
        
        return {
            "success": True,
            "message": "ttyd stopped successfully",
            "listen_port": listen_port
        }
    
    except Exception as e:
        logger.exception(f"Error stopping ttyd for tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


