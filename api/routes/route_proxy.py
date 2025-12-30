"""
Route Proxy Management Routes
Handles starting, stopping, and managing route proxies
"""
from fastapi import APIRouter, HTTPException, Depends
from api.services.process_manager import process_manager
from api.services.cloudflare import CloudflareService
from api.dependencies import get_current_user
from api.utils.logger import logger
import socket
import subprocess
import time
import re
import os
import asyncio
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


def cleanup_dead_route_proxies():
    """Clean up dead route proxy processes from dictionary"""
    return process_manager.cleanup_dead_route_proxies()


def kill_all_route_proxies():
    """Kill all route proxy processes"""
    return process_manager.kill_all_route_proxies()


def kill_route_proxy(route_key: str):
    """Kill cloudflared process for a route"""
    process_manager.kill_route_proxy(route_key)


def start_route_proxy(hostname: str, target_port: int, route_key: str = None, local_port: int = None, route_type: str = "tcp"):
    """Start cloudflared access tcp or ssh for a route"""
    return process_manager.start_route_proxy(hostname, target_port, route_key, local_port, route_type)


def _check_port_available(port: int) -> bool:
    """Check if a port is available"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(('127.0.0.1', port))
        sock.close()
        return True
    except OSError:
        return False


async def _kill_process_using_port(port: int):
    """Try to kill process using a port"""
    try:
        import subprocess as sp
        # Try lsof first
        try:
            result = await asyncio.to_thread(
                lambda: sp.run(['lsof', '-ti', f':{port}'], 
                          capture_output=True, text=True, timeout=5)
            )
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                for pid in pids:
                    pid = pid.strip()
                    if pid:
                        logger.debug(f"Found process {pid} using port {port}, killing it...")
                        try:
                            await asyncio.to_thread(
                                lambda: sp.run(['kill', '-9', pid], timeout=5)
                            )
                            await asyncio.sleep(0.5)  # Wait a bit for process to die
                        except:
                            pass
        except:
            # Try fuser as fallback
            try:
                await asyncio.to_thread(
                    lambda: sp.run(['fuser', '-k', f'{port}/tcp'], 
                              capture_output=True, text=True, timeout=5)
                )
                await asyncio.sleep(0.5)
            except:
                pass
    except Exception as kill_error:
        logger.debug(f"Error trying to kill process using port: {kill_error}")


@router.post("/start-route-proxy")
async def start_route_proxy_endpoint(
    route_data: dict, 
    current_user: dict = Depends(get_current_user)
):
    """Start cloudflared access tcp or ssh for a route"""
    try:
        hostname = route_data.get("hostname")
        target_port = route_data.get("target_port")
        local_port = route_data.get("local_port")  # Optional local port
        route_type = route_data.get("route_type", "tcp")  # Default to tcp for backward compatibility
        
        if not hostname or not target_port:
            raise HTTPException(status_code=400, detail="hostname and target_port are required")
        
        # If local_port is specified, use it in route_key to allow multiple instances
        if local_port:
            route_key = f"{hostname}-{target_port}-{local_port}"
        else:
            route_key = f"{hostname}-{target_port}"
        
        # Check if already running with same route_key
        proxy_info = process_manager.get_route_proxy(route_key)
        if proxy_info:
            process = proxy_info["process"]
            if process.poll() is None:  # process is still running
                return {
                    "success": True,
                    "message": f"Route proxy already running for {hostname}:{target_port}",
                    "local_port": proxy_info["local_port"],
                    "already_running": True
                }
            else:
                # Process stopped, remove from dict
                logger.debug(f"Process for {route_key} has stopped, removing from dict")
                process_manager.kill_route_proxy(route_key)
        
        # First, clean up all dead processes from dictionary
        cleanup_dead_route_proxies()
        
        # Check for existing processes with same hostname and target_port
        url_port = local_port if local_port else target_port
        
        # Check if port is in use by another process in our dictionary
        all_proxies = process_manager.get_all_route_proxies()
        for key, proxy_info in all_proxies.items():
            if (proxy_info.get("hostname") == hostname and 
                proxy_info.get("target_port") == target_port):
                existing_process = proxy_info["process"]
                if existing_process.poll() is None:  # process is still running
                    existing_local_port = proxy_info.get("local_port")
                    if existing_local_port == url_port:
                        # Same port, kill the old process
                        logger.debug(f"Found existing process using same port {url_port}, killing it")
                        kill_route_proxy(key)
                        break
                    else:
                        # Different port, but same route - kill old one to avoid confusion
                        logger.debug(f"Found existing process with different port, killing it")
                        kill_route_proxy(key)
        
        # Check if port is available
        if not _check_port_available(url_port):
            logger.debug(f"Port {url_port} is already in use")
            # First, check if this port is used by an existing route proxy
            found_existing_proxy = False
            all_proxies = process_manager.get_all_route_proxies()
            for key, proxy_info in all_proxies.items():
                existing_local_port = proxy_info.get("local_port")
                existing_hostname = proxy_info.get("hostname")
                existing_target_port = proxy_info.get("target_port")
                existing_process = proxy_info.get("process")
                
                # Check if port matches and process is still running
                if (existing_local_port == url_port and 
                    existing_process and 
                    existing_process.poll() is None):
                    # Verify port is actually listening
                    try:
                        test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        result = test_sock.connect_ex(('127.0.0.1', url_port))
                        test_sock.close()
                        if result == 0:  # Port is listening
                            # Found existing active proxy - return its info
                            found_existing_proxy = True
                            started_at = proxy_info.get("started_at", time.time())
                            uptime = int(time.time() - started_at)
                            logger.debug(f"Found existing active proxy for port {url_port}, returning its info")
                            return {
                                "success": True,
                                "message": f"Route proxy already running for {existing_hostname}:{existing_target_port}",
                                "local_port": existing_local_port,
                                "hostname": existing_hostname,
                                "target_port": existing_target_port,
                                "already_running": True,
                                "pid": existing_process.pid,
                                "uptime": uptime
                            }
                    except Exception as check_error:
                        logger.debug(f"Error checking existing proxy port: {check_error}")
                        pass
            
            # If not found in route_proxies, try to kill process using the port
            if not found_existing_proxy:
                await _kill_process_using_port(url_port)
                
                # Check again if port is available
                if not _check_port_available(url_port):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Port {url_port} is already in use by another process. Please stop it manually or choose a different port."
                    )
        
        # Start new proxy (non-blocking)
        try:
            process, returned_local_port = start_route_proxy(hostname, target_port, route_key, local_port, route_type)
            
            # Wait a bit to check if process started successfully
            await asyncio.sleep(1.5)
            
            # Check if process is still running
            if process.poll() is not None:
                # Process already exited (error)
                stderr_output = ""
                if process.stderr:
                    try:
                        # Try to read stderr (non-blocking)
                        import select
                        if select.select([process.stderr], [], [], 0.1)[0]:
                            stderr_output = process.stderr.read(1000)
                    except:
                        pass
                
                # Remove from dict if it was added
                process_manager.kill_route_proxy(route_key)
                
                error_msg = f"Process exited immediately"
                if stderr_output and "bind: address already in use" in stderr_output:
                    error_msg = f"Port {returned_local_port} is already in use. Please stop the existing process or choose a different port."
                elif stderr_output:
                    error_msg = f"Process failed: {stderr_output[:200]}"
                
                raise HTTPException(status_code=500, detail=error_msg)
            
            # Check if there's an error in route_proxies
            proxy_info = process_manager.get_route_proxy(route_key)
            if proxy_info and proxy_info.get("error"):
                error_msg = proxy_info["error"]
                process_manager.kill_route_proxy(route_key)
                raise HTTPException(status_code=500, detail=error_msg)
            
            # Return immediately with the port we're using
            return {
                "success": True,
                "message": f"Route proxy is starting for {hostname}:{target_port}" + 
                          (f" on local port {returned_local_port}" if returned_local_port else ""),
                "local_port": returned_local_port,
                "already_running": False,
                "status": "starting"  # Indicates it's starting in background
            }
        except HTTPException:
            # Re-raise HTTPException without modification
            raise
        except Exception as e:
            error_msg = str(e)
            logger.exception(f"Failed to start route proxy: {error_msg}")
            raise HTTPException(status_code=500, detail=f"Error starting route proxy: {error_msg}")
            
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.exception(f"Unexpected error starting route proxy: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Error starting route proxy: {error_msg}")


@router.post("/stop-route-proxy")
async def stop_route_proxy_endpoint(
    route_data: dict, 
    current_user: dict = Depends(get_current_user)
):
    """Stop cloudflared process for a route proxy"""
    try:
        hostname = route_data.get("hostname")
        target_port = route_data.get("target_port")
        local_port = route_data.get("local_port")  # Optional local port
        
        if not hostname or not target_port:
            raise HTTPException(status_code=400, detail="hostname and target_port are required")
        
        # Try to find the route_key - check both with and without local_port
        route_key = None
        
        # First try with local_port if specified
        if local_port:
            route_key = f"{hostname}-{target_port}-{local_port}"
            proxy_info = process_manager.get_route_proxy(route_key)
            if proxy_info:
                process = proxy_info["process"]
                if process.poll() is None:  # process is still running
                    kill_route_proxy(route_key)
                    return {
                        "success": True,
                        "message": f"Route proxy stopped successfully for {hostname}:{target_port}"
                    }
        
        # Try without local_port
        route_key = f"{hostname}-{target_port}"
        proxy_info = process_manager.get_route_proxy(route_key)
        if proxy_info:
            process = proxy_info["process"]
            if process.poll() is None:  # process is still running
                kill_route_proxy(route_key)
                return {
                    "success": True,
                    "message": f"Route proxy stopped successfully for {hostname}:{target_port}"
                }
        
        # If not found by route_key, search all route_proxies by hostname and target_port
        all_proxies = process_manager.get_all_route_proxies()
        for key, proxy_info in all_proxies.items():
            if (proxy_info.get("hostname") == hostname and 
                proxy_info.get("target_port") == target_port):
                process = proxy_info["process"]
                if process.poll() is None:  # process is still running
                    kill_route_proxy(key)
                    return {
                        "success": True,
                        "message": f"Route proxy stopped successfully for {hostname}:{target_port}"
                    }
        
        # Not found
        return {
            "success": False,
            "message": f"No active route proxy found for {hostname}:{target_port}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error stopping route proxy: {str(e)}")


@router.get("/route-proxies/{tunnel_id}")
async def get_tunnel_route_proxies(
    tunnel_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """Get route proxies for a specific tunnel based on its routes"""
    try:
        # Get tunnel routes directly from cloudflare service
        config = await get_cloudflare_service().get_tunnel_config(tunnel_id)
        if not config:
            raise HTTPException(status_code=404, detail="Tunnel config not found")
        
        ingress = config.get("config", {}).get("ingress", [])
        proxies_info = []
        
        # Check each route for TCP and SSH services
        for route in ingress:
            if not route.get("hostname"):
                continue
                
            service = route.get("service", "")
            route_type = None
            
            # Determine route type
            if service.startswith("ssh://"):
                route_type = "ssh"
            elif service.startswith("tcp://"):
                route_type = "tcp"
            else:
                continue  # Skip non-TCP/SSH routes
            
            hostname = route["hostname"]
            
            # Extract target port
            port_match = re.search(r':(\d+)$', service)
            if port_match:
                target_port = int(port_match.group(1))
                
                # Check all possible route_keys (with and without local_port)
                route_key = f"{hostname}-{target_port}"
                is_running = False
                local_port = None
                found_proxy = None
                
                # Check if proxy exists with this route_key
                found_proxy = process_manager.get_route_proxy(route_key)
                if found_proxy:
                    process = found_proxy["process"]
                    if process.poll() is None:  # process is still running
                        is_running = True
                        local_port = found_proxy["local_port"]
                else:
                    # Check all route_proxies to find matching hostname and target_port
                    all_proxies = process_manager.get_all_route_proxies()
                    for key, proxy_info in all_proxies.items():
                        if (proxy_info.get("hostname") == hostname and 
                            proxy_info.get("target_port") == target_port):
                            process = proxy_info["process"]
                            if process.poll() is None:  # process is still running
                                is_running = True
                                local_port = proxy_info["local_port"]
                                found_proxy = proxy_info
                                route_key = key  # Update route_key to the actual one
                                break
                
                proxy_info = {
                    "hostname": hostname,
                    "target_port": target_port,
                    "route_type": route_type,
                    "local_port": local_port,
                    "is_running": is_running,
                    "route_key": route_key
                }
                
                # Add timing information if proxy is running
                if is_running and found_proxy:
                    started_at = found_proxy.get("started_at", time.time())
                    last_used_at = found_proxy.get("last_used_at", started_at)
                    uptime_seconds = int(time.time() - started_at)
                    idle_seconds = int(time.time() - last_used_at)
                    
                    proxy_info["started_at"] = started_at
                    proxy_info["last_used_at"] = last_used_at
                    proxy_info["uptime_seconds"] = uptime_seconds
                    proxy_info["idle_seconds"] = idle_seconds
                    proxy_info["uptime_formatted"] = process_manager.format_uptime(uptime_seconds)
                    proxy_info["idle_formatted"] = process_manager.format_uptime(idle_seconds)
                
                proxies_info.append(proxy_info)
        
        # Add ttyd processes if running
        ttyd_info = process_manager.get_ttyd(tunnel_id)
        if ttyd_info:
            process = ttyd_info.get("process")
            if process and process.poll() is None:  # process is still running
                listen_port = ttyd_info.get("listen_port")
                if listen_port:
                    # Verify port is listening
                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(1)
                        result = sock.connect_ex(('127.0.0.1', listen_port))
                        sock.close()
                        if result == 0:  # Port is listening
                            # Get hostname from ingress routes or use tunnel_id
                            hostname = None
                            for route in ingress:
                                if route.get("hostname"):
                                    hostname = route["hostname"]
                                    break
                            
                            if not hostname:
                                # Use tunnel_id as fallback
                                hostname = f"{tunnel_id}.ttyd"
                            
                            ssh_user = ttyd_info.get("ssh_user", "unknown")
                            ssh_host = ttyd_info.get("ssh_host", "localhost")
                            ssh_port = ttyd_info.get("ssh_port", 22)
                            
                            started_at = ttyd_info.get("started_at", time.time())
                            uptime_seconds = int(time.time() - started_at)
                            idle_seconds = uptime_seconds  # ttyd doesn't track last_used_at separately
                            
                            ttyd_proxy_info = {
                                "hostname": hostname,
                                "target_port": ssh_port,
                                "route_type": "ttyd",
                                "local_port": listen_port,
                                "is_running": True,
                                "route_key": f"ttyd-{tunnel_id}",
                                "started_at": started_at,
                                "last_used_at": started_at,
                                "uptime_seconds": uptime_seconds,
                                "idle_seconds": idle_seconds,
                                "uptime_formatted": process_manager.format_uptime(uptime_seconds),
                                "idle_formatted": process_manager.format_uptime(idle_seconds),
                                "ssh_user": ssh_user,
                                "ssh_host": ssh_host,
                                "ssh_port": ssh_port,
                                "username": ttyd_info.get("username", "unknown"),
                                "pid": process.pid
                            }
                            proxies_info.append(ttyd_proxy_info)
                    except Exception as e:
                        logger.debug(f"Error checking ttyd port for tunnel {tunnel_id}: {e}")
        
        # Add novnc processes if running
        novnc_info = process_manager.get_novnc(tunnel_id)
        if novnc_info:
            process = novnc_info.get("process")
            if process and process.poll() is None:  # process is still running
                listen_port = novnc_info.get("listen_port")
                if listen_port:
                    # Verify port is listening
                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        sock.settimeout(1)
                        result = sock.connect_ex(('127.0.0.1', listen_port))
                        sock.close()
                        if result == 0:  # Port is listening
                            # Get hostname from ingress routes or use tunnel_id
                            hostname = None
                            for route in ingress:
                                if route.get("hostname"):
                                    hostname = route["hostname"]
                                    break
                            
                            if not hostname:
                                # Use tunnel_id as fallback
                                hostname = f"{tunnel_id}.novnc"
                            
                            vnc_host = novnc_info.get("vnc_host", "localhost")
                            vnc_port = novnc_info.get("vnc_port", 5900)
                            
                            started_at = novnc_info.get("started_at", time.time())
                            uptime_seconds = int(time.time() - started_at)
                            idle_seconds = uptime_seconds  # novnc doesn't track last_used_at separately
                            
                            novnc_proxy_info = {
                                "hostname": hostname,
                                "target_port": vnc_port,
                                "route_type": "novnc",
                                "local_port": listen_port,
                                "is_running": True,
                                "route_key": f"novnc-{tunnel_id}",
                                "started_at": started_at,
                                "last_used_at": started_at,
                                "uptime_seconds": uptime_seconds,
                                "idle_seconds": idle_seconds,
                                "uptime_formatted": process_manager.format_uptime(uptime_seconds),
                                "idle_formatted": process_manager.format_uptime(idle_seconds),
                                "vnc_host": vnc_host,
                                "vnc_port": vnc_port,
                                "pid": process.pid
                            }
                            proxies_info.append(novnc_proxy_info)
                    except Exception as e:
                        logger.debug(f"Error checking novnc port for tunnel {tunnel_id}: {e}")
        
        return {
            "success": True,
            "proxies": proxies_info
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting tunnel route proxies: {str(e)}")


@router.post("/kill-all-route-proxies")
async def kill_all_route_proxies_endpoint(current_user: dict = Depends(get_current_user)):
    """Kill all running route proxy processes"""
    try:
        killed_count = kill_all_route_proxies()
        return {
            "success": True,
            "message": f"Successfully killed {killed_count} route proxy process(es)",
            "killed_count": killed_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error killing all route proxies: {str(e)}")


@router.post("/cleanup-route-proxies")
async def cleanup_route_proxies_endpoint(current_user: dict = Depends(get_current_user)):
    """Clean up dead route proxy processes from dictionary"""
    try:
        cleaned_count = cleanup_dead_route_proxies()
        return {
            "success": True,
            "message": f"Cleaned up {cleaned_count} dead route proxy process(es)",
            "cleaned_count": cleaned_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cleaning up route proxies: {str(e)}")

