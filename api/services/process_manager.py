"""
Process Manager Service
Manages cloudflared, route proxy, and novnc processes
Thread-safe operations for process management
"""

import subprocess
import os
import time
import re
import threading
import socket
import shutil
from typing import Dict, Optional, Tuple, List
from datetime import datetime

from api.utils.logger import logger
from api.utils.exceptions import CloudflaredNotFoundError, RouteProxyError


class ProcessManager:
    """Manages cloudflared, route proxy, and novnc processes"""
    
    def __init__(self):
        # Thread-safe dictionaries for process storage
        self._lock = threading.Lock()
        self.cloudflared_processes: Dict[str, Dict] = {}  # {tunnel_id: {...}}
        self.route_proxies: Dict[str, Dict] = {}  # {route_key: {...}}
        self.novnc_processes: Dict[str, Dict] = {}  # {tunnel_id: {...}}
        self.ttyd_processes: Dict[str, Dict] = {}  # {tunnel_id: {...}}
    
    def find_cloudflared_path(self) -> str:
        """
        Find cloudflared executable path (Linux only)
        
        Returns:
            Path to cloudflared executable
            
        Raises:
            CloudflaredNotFoundError: If cloudflared not found
        """
        # Linux/Unix paths
        possible_paths = [
            "/usr/local/bin/cloudflared",
            "/usr/bin/cloudflared",
            "cloudflared"  # If in PATH
        ]
        
        for path in possible_paths:
            # For executable names (cloudflared), check if they exist in PATH
            if path == "cloudflared":
                # Check if command exists in PATH
                found_path = shutil.which(path)
                if found_path:
                    logger.debug(f"cloudflared found in PATH: {found_path}")
                    return found_path
            elif os.path.exists(path):
                logger.debug(f"cloudflared found: {path}")
                return path
        
        raise CloudflaredNotFoundError("cloudflared not found. Please install cloudflared.")
    
    def find_free_port(self, start_port: int = 5987, max_port: int = 6100) -> int:
        """Find a free port in the specified range"""
        for port in range(start_port, max_port + 1):
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                result = sock.connect_ex(('127.0.0.1', port))
                if result != 0:  # Port is free
                    sock.close()
                    return port
            except:
                pass
            finally:
                sock.close()
        
        raise Exception("No free port found")
    
    def _extract_port_from_output(self, line: str) -> Optional[int]:
        """Extract port number from cloudflared output line"""
        port_patterns = [
            r'127\.0\.0\.1:(\d{4,5})',  # 127.0.0.1:5986
            r'localhost:(\d{4,5})',      # localhost:5986
            r'0\.0\.0\.0:(\d{4,5})',    # 0.0.0.0:5986
            r'local port[:\s]+(\d+)',    # local port: 5986
        ]
        
        for pattern in port_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                port = int(match.group(1))
                # Check if port is in valid range (1024-65535)
                if 1024 <= port <= 65535:
                    return port
        return None
    
    def start_cloudflared_proxy(self, hostname: str, target_port: int = 5986) -> Tuple[subprocess.Popen, int]:
        """
        Start cloudflared access tcp proxy
        
        Args:
            hostname: Cloudflare Tunnel hostname
            target_port: Target port on server side (default 5986)
        
        Returns:
            (process, local_port): process and local port that cloudflared created
        """
        logger.debug(f"Starting cloudflared proxy for hostname: {hostname}, target_port: {target_port}")
        
        cloudflared_path = self.find_cloudflared_path()
        
        cmd = [
            cloudflared_path,
            "access", "tcp",
            "--hostname", hostname,
            "--url", f"localhost:{target_port}"
        ]
        
        logger.debug(f"Executing command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            creationflags=0
        )
        
        logger.debug(f"cloudflared process started. PID: {process.pid}")
        
        # Read local port from stdout and stderr using threading
        local_port = None
        output_lines = []
        port_found = threading.Event()
        
        def read_output(pipe, lines_list, found_event):
            """Read output in a separate thread"""
            try:
                for line in iter(pipe.readline, ''):
                    if line:
                        line = line.strip()
                        lines_list.append(line)
                        port = self._extract_port_from_output(line)
                        if port:
                            found_event.set()
                            lines_list.append(f"PORT_FOUND:{port}")
                            return
            except Exception as e:
                logger.debug(f"Error reading output: {e}")
        
        stdout_thread = threading.Thread(target=read_output, args=(process.stdout, output_lines, port_found), daemon=True)
        stderr_thread = threading.Thread(target=read_output, args=(process.stderr, output_lines, port_found), daemon=True)
        
        stdout_thread.start()
        stderr_thread.start()
        
        # Wait for port to be found (max 15 seconds)
        logger.debug("Waiting for local port to be found...")
        if port_found.wait(timeout=15):
            logger.debug("Port found!")
            for line in output_lines:
                if line.startswith("PORT_FOUND:"):
                    local_port = int(line.split(":")[1])
                    logger.debug(f"Local port: {local_port}")
                    break
        else:
            logger.debug("Port not found in first 15 seconds. Continuing check...")
        
        # Check if process is still running
        if process.poll() is not None:
            all_output = "\n".join(output_lines)
            raise Exception(f"cloudflared stopped. Output: {all_output}")
        
        # If port not found, read more from cloudflared output
        if local_port is None:
            time.sleep(5)
            for line in output_lines:
                port = self._extract_port_from_output(line)
                if port:
                    local_port = port
                    break
            
            if local_port is None:
                all_output = "\n".join(output_lines)
                try:
                    process.terminate()
                    process.wait(timeout=5)
                except:
                    try:
                        process.kill()
                    except:
                        pass
                raise Exception(f"cloudflared local port not found. Output: {all_output}")
        
        # Check if process is still running
        if process.poll() is not None:
            all_output = "\n".join(output_lines)
            logger.error(f"cloudflared stopped. Output: {all_output}")
            try:
                process.terminate()
                process.wait(timeout=5)
            except:
                try:
                    process.kill()
                except:
                    pass
            raise Exception(f"cloudflared stopped. Output: {all_output}")
        
        logger.debug(f"cloudflared process is running. Port: {local_port}")
        
        return process, local_port
    
    def get_or_create_cloudflared_proxy(self, tunnel_id: str, hostname: str) -> int:
        """
        Get or create cloudflared proxy for Tunnel
        
        Args:
            tunnel_id: Tunnel ID
            hostname: Tunnel hostname
            
        Returns:
            local_port: Local port that cloudflared created
        """
        with self._lock:
            logger.debug(f"Getting or creating cloudflared proxy for tunnel_id: {tunnel_id}, hostname: {hostname}")
            
            if tunnel_id in self.cloudflared_processes:
                process = self.cloudflared_processes[tunnel_id]["process"]
                if process.poll() is None:  # process is still running
                    existing_port = self.cloudflared_processes[tunnel_id]["port"]
                    logger.debug(f"Using existing cloudflared proxy. Port: {existing_port}")
                    return existing_port
                else:
                    logger.debug("cloudflared process stopped. Recreating...")
                    del self.cloudflared_processes[tunnel_id]
            
            logger.debug("Creating new cloudflared proxy...")
            process, local_port = self.start_cloudflared_proxy(hostname, target_port=5986)
            
            self.cloudflared_processes[tunnel_id] = {
                "process": process,
                "port": local_port,
                "hostname": hostname
            }
            
            return local_port
    
    def start_route_proxy(
        self, 
        hostname: str, 
        target_port: int, 
        route_key: str = None, 
        local_port: Optional[int] = None,
        route_type: str = "tcp"
    ) -> Tuple[subprocess.Popen, int]:
        """
        Start cloudflared access tcp or ssh for a route
        
        Args:
            hostname: Cloudflare Tunnel hostname
            target_port: Target port on server side
            route_key: Unique key for this route
            local_port: Optional local port - if specified, used as --url port instead of target_port
            route_type: Type of route - "tcp" or "ssh" (default: "tcp")
        
        Returns:
            (process, local_port): process and local port
        """
        url_port = local_port if local_port else target_port
        route_type_lower = route_type.lower()
        logger.debug(f"Starting route proxy for hostname: {hostname}, target_port: {target_port}, route_type: {route_type_lower}, using url port: {url_port}")
        
        cloudflared_path = self.find_cloudflared_path()
        
        # Use SSH access for SSH routes, TCP access for TCP routes
        if route_type_lower == "ssh":
            cmd = [
                cloudflared_path,
                "access", "ssh",
                "--hostname", hostname,
                "--url", f"localhost:{url_port}"
            ]
        else:
            cmd = [
                cloudflared_path,
                "access", "tcp",
                "--hostname", hostname,
                "--url", f"localhost:{url_port}"
            ]
        
        logger.debug(f"Executing command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            creationflags=0
        )
        
        logger.debug(f"cloudflared route proxy process started. PID: {process.pid}")
        
        def read_output(pipe, pipe_name):
            try:
                for line in iter(pipe.readline, ''):
                    if not line:
                        break
                    line = line.strip()
                    logger.debug(f"[{pipe_name}] {line}")
                    
                    # Check for errors
                    if "error" in line.lower() or "failed" in line.lower() or "bind: address already in use" in line.lower():
                        logger.error(f"[{pipe_name}] Error detected: {line}")
                        if route_key and "bind: address already in use" in line.lower():
                            logger.error(f"Port binding failed for {route_key}. Process will be marked as failed.")
                            with self._lock:
                                if route_key in self.route_proxies:
                                    self.route_proxies[route_key]["error"] = "Port binding failed: address already in use"
                                    try:
                                        self.route_proxies[route_key]["process"].kill()
                                    except:
                                        pass
                    
                    # Look for local port in output
                    port = self._extract_port_from_output(line)
                    if port:
                        logger.debug(f"Found cloudflared local port: {port}")
                        with self._lock:
                            if route_key and route_key in self.route_proxies:
                                self.route_proxies[route_key]["cloudflared_port"] = port
                                self.route_proxies[route_key]["local_port"] = port
            except Exception as e:
                logger.error(f"Error reading {pipe_name}: {e}")
            finally:
                try:
                    pipe.close()
                except:
                    pass
        
        stdout_thread = threading.Thread(target=read_output, args=(process.stdout, "stdout"), daemon=True)
        stderr_thread = threading.Thread(target=read_output, args=(process.stderr, "stderr"), daemon=True)
        
        stdout_thread.start()
        stderr_thread.start()
        
        # Store process info immediately with timestamp
        if route_key:
            with self._lock:
                self.route_proxies[route_key] = {
                    "process": process,
                    "local_port": url_port,
                    "hostname": hostname,
                    "target_port": target_port,
                    "route_type": route_type_lower,
                    "cloudflared_port": url_port,
                    "started_at": time.time(),
                    "last_used_at": time.time()
                }
        
        return process, url_port
    
    def kill_route_proxy(self, route_key: str):
        """Kill cloudflared process for a route"""
        with self._lock:
            if route_key in self.route_proxies:
                process = self.route_proxies[route_key]["process"]
                try:
                    process.terminate()
                    process.wait(timeout=5)
                except:
                    try:
                        process.kill()
                    except:
                        pass
                del self.route_proxies[route_key]
                logger.debug(f"Killed route proxy for: {route_key}")
    
    def cleanup_dead_route_proxies(self) -> int:
        """Clean up dead route proxy processes from dictionary"""
        cleaned_count = 0
        with self._lock:
            keys_to_remove = []
            for key, proxy_info in self.route_proxies.items():
                process = proxy_info["process"]
                if process.poll() is not None:  # process is dead
                    logger.debug(f"Found dead process in dictionary: {key}, removing...")
                    keys_to_remove.append(key)
            
            for key in keys_to_remove:
                del self.route_proxies[key]
                cleaned_count += 1
        
        return cleaned_count
    
    def kill_all_route_proxies(self) -> int:
        """Kill all route proxy processes"""
        self.cleanup_dead_route_proxies()
        
        killed_count = 0
        with self._lock:
            route_keys = list(self.route_proxies.keys())
            
            for route_key in route_keys:
                if route_key in self.route_proxies:
                    process = self.route_proxies[route_key]["process"]
                    try:
                        process.terminate()
                        process.wait(timeout=5)
                    except:
                        try:
                            process.kill()
                        except:
                            pass
                    del self.route_proxies[route_key]
                    killed_count += 1
                    logger.debug(f"Killed route proxy for: {route_key}")
        
        return killed_count
    
    def get_route_proxy(self, route_key: str) -> Optional[Dict]:
        """Get route proxy info by route_key"""
        with self._lock:
            return self.route_proxies.get(route_key)
    
    def get_all_route_proxies(self) -> Dict[str, Dict]:
        """Get all route proxies"""
        with self._lock:
            return self.route_proxies.copy()
    
    def format_uptime(self, seconds: int) -> str:
        """Format uptime in human-readable format"""
        if seconds < 60:
            return f"{seconds}s"
        elif seconds < 3600:
            minutes = seconds // 60
            return f"{minutes}m"
        elif seconds < 86400:
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            return f"{hours}h {minutes}m"
        else:
            days = seconds // 86400
            hours = (seconds % 86400) // 3600
            return f"{days}d {hours}h"
    
    def find_novnc_path(self) -> str:
        """
        Find novnc executable path (Linux only)
        
        Returns:
            Path to novnc executable
            
        Raises:
            FileNotFoundError: If novnc not found
        """
        # First, check if novnc is installed via snap
        try:
            result = subprocess.run(
                ["snap", "list", "novnc"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout:
                # novnc is installed via snap
                snap_path = "/snap/bin/novnc"
                if os.path.exists(snap_path):
                    logger.debug(f"novnc found via snap: {snap_path}")
                    return snap_path
                # Even if file doesn't exist, if snap says it's installed, return the path
                # (snap binaries might be symlinks that are created on demand)
                logger.debug(f"novnc installed via snap, using path: {snap_path}")
                return snap_path
        except Exception as e:
            logger.debug(f"Error checking snap for novnc: {e}")
        
        # Linux/Unix paths
        possible_paths = [
            "/snap/bin/novnc",
            "/usr/bin/novnc",
            "/usr/local/bin/novnc",
            "novnc"  # If in PATH
        ]
        
        for path in possible_paths:
            # For executable names (novnc), check if they exist in PATH
            if path == "novnc":
                # Check if command exists in PATH
                found_path = shutil.which(path)
                if found_path:
                    logger.debug(f"novnc found in PATH: {found_path}")
                    return found_path
            elif os.path.exists(path):
                logger.debug(f"novnc found: {path}")
                return path
        
        raise FileNotFoundError("novnc not found. Please install novnc.")
    
    def start_novnc(
        self,
        tunnel_id: str,
        listen_port: int,
        vnc_host: str,
        vnc_port: int
    ) -> subprocess.Popen:
        """
        Start novnc process
        
        Args:
            tunnel_id: Tunnel ID
            listen_port: Port to listen on
            vnc_host: VNC server hostname
            vnc_port: VNC server port
            
        Returns:
            subprocess.Popen: Process object
        """
        logger.debug(f"Starting novnc for tunnel {tunnel_id}: listen_port={listen_port}, vnc={vnc_host}:{vnc_port}")
        
        novnc_path = self.find_novnc_path()
        
        cmd = [
            novnc_path,
            "--listen", str(listen_port),
            "--vnc", f"{vnc_host}:{vnc_port}"
        ]
        
        logger.debug(f"Executing command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            creationflags=0
        )
        
        logger.debug(f"novnc process started. PID: {process.pid}")
        
        # Store process info
        with self._lock:
            self.novnc_processes[tunnel_id] = {
                "process": process,
                "listen_port": listen_port,
                "vnc_host": vnc_host,
                "vnc_port": vnc_port,
                "started_at": time.time()
            }
        
        return process
    
    def get_novnc(self, tunnel_id: str) -> Optional[Dict]:
        """Get novnc process info by tunnel_id"""
        with self._lock:
            return self.novnc_processes.get(tunnel_id)
    
    def kill_novnc(self, tunnel_id: str):
        """Kill novnc process for a tunnel"""
        with self._lock:
            if tunnel_id in self.novnc_processes:
                process = self.novnc_processes[tunnel_id]["process"]
                try:
                    process.terminate()
                    process.wait(timeout=5)
                except:
                    try:
                        process.kill()
                    except:
                        pass
                del self.novnc_processes[tunnel_id]
                logger.debug(f"Killed novnc for tunnel: {tunnel_id}")
    
    def cleanup_dead_novnc_processes(self) -> int:
        """Clean up dead novnc processes from dictionary"""
        cleaned_count = 0
        with self._lock:
            keys_to_remove = []
            for tunnel_id, info in self.novnc_processes.items():
                process = info.get("process")
                if process:
                    if process.poll() is not None:  # Process is dead
                        logger.debug(f"Found dead novnc process for tunnel {tunnel_id}, removing from dict")
                        keys_to_remove.append(tunnel_id)
                        cleaned_count += 1
                    else:
                        # Process is running, verify port is listening
                        listen_port = info.get("listen_port")
                        if listen_port:
                            try:
                                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                                result = sock.connect_ex(('127.0.0.1', listen_port))
                                sock.close()
                                if result != 0:  # Port not listening
                                    logger.debug(f"novnc process for tunnel {tunnel_id} exists but port {listen_port} not listening")
                                    keys_to_remove.append(tunnel_id)
                                    cleaned_count += 1
                            except Exception as e:
                                logger.debug(f"Error checking novnc port for tunnel {tunnel_id}: {e}")
                                keys_to_remove.append(tunnel_id)
                                cleaned_count += 1
            
            for key in keys_to_remove:
                try:
                    # Try to kill the process if it still exists
                    if key in self.novnc_processes:
                        process = self.novnc_processes[key].get("process")
                        if process:
                            try:
                                process.terminate()
                                process.wait(timeout=2)
                            except:
                                try:
                                    process.kill()
                                except:
                                    pass
                        del self.novnc_processes[key]
                except Exception as e:
                    logger.debug(f"Error removing novnc process for tunnel {key}: {e}")
        
        return cleaned_count
    
    def kill_all_novnc_processes(self) -> int:
        """Kill all novnc processes"""
        self.cleanup_dead_novnc_processes()
        
        killed_count = 0
        with self._lock:
            tunnel_ids = list(self.novnc_processes.keys())
            
            for tunnel_id in tunnel_ids:
                if tunnel_id in self.novnc_processes:
                    process = self.novnc_processes[tunnel_id]["process"]
                    try:
                        process.terminate()
                        process.wait(timeout=5)
                    except:
                        try:
                            process.kill()
                        except:
                            pass
                    del self.novnc_processes[tunnel_id]
                    killed_count += 1
                    logger.debug(f"Killed novnc for tunnel: {tunnel_id}")
        
        return killed_count
    
    def find_ttyd_path(self) -> str:
        """
        Find ttyd executable path (Linux only)
        
        Returns:
            Path to ttyd executable
            
        Raises:
            FileNotFoundError: If ttyd not found
        """
        # Linux/Unix paths
        possible_paths = [
            "/usr/local/bin/ttyd",
            "/usr/bin/ttyd",
            "ttyd"  # If in PATH
        ]
        
        for path in possible_paths:
            # For executable names (ttyd), check if they exist in PATH
            if path == "ttyd":
                # Check if command exists in PATH
                found_path = shutil.which(path)
                if found_path:
                    logger.debug(f"ttyd found in PATH: {found_path}")
                    return found_path
            elif os.path.exists(path):
                logger.debug(f"ttyd found: {path}")
                return path
        
        raise FileNotFoundError("ttyd not found. Please install ttyd.")
    
    def start_ttyd(
        self,
        tunnel_id: str,
        listen_port: int,
        username: str,
        password: str,
        ssh_user: str,
        ssh_host: str,
        ssh_port: int,
        writable: bool = True,
        shared_session: bool = False
    ) -> subprocess.Popen:
        """
        Start ttyd process
        
        Args:
            tunnel_id: Tunnel ID
            listen_port: Port to listen on
            username: Username for ttyd authentication
            password: Password for ttyd authentication
            ssh_user: SSH username
            ssh_host: SSH hostname
            ssh_port: SSH port
            writable: Enable writable mode (--writable flag)
            
        Returns:
            subprocess.Popen: Process object
        """
        logger.debug(f"Starting ttyd for tunnel {tunnel_id}: listen_port={listen_port}, ssh={ssh_user}@{ssh_host}:{ssh_port}, shared_session={shared_session}")
        
        ttyd_path = self.find_ttyd_path()
        
        # Build base command
        cmd = [
            ttyd_path,
            "-c", f"{username}:{password}",
            "--writable" if writable else None,
            "-p", str(listen_port)
        ]
        
        # Build command to execute
        if shared_session:
            # Use tmux for shared session
            # Build ttyd command parts
            ttyd_base = f"{ttyd_path} -c {username}:{password}"
            if writable:
                ttyd_base += " --writable"
            ttyd_base += f" -p {listen_port}"
            
            # Build tmux command
            tmux_cmd = f"bash -c 'tmux has-session -t shared 2>/dev/null || tmux new -s shared -d \"ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR {ssh_user}@{ssh_host} -p {ssh_port}\"; tmux attach -t shared'"
            
            # Full command: ttyd [options] "tmux command"
            full_cmd = f"{ttyd_base} {tmux_cmd}"
            
            logger.debug(f"Executing command: {full_cmd}")
            
            # For shell commands with quotes, use shell=True
            process = subprocess.Popen(
                full_cmd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                creationflags=0
            )
        else:
            # Regular SSH command - simple connection
            ssh_command = (
                f'ssh -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null '
                f'-o LogLevel=ERROR {ssh_user}@{ssh_host} -p {ssh_port}'
            )
            
            # Remove None values (when writable is False)
            cmd = [c for c in cmd if c is not None]
            
            # Build full command string for ttyd
            # ttyd expects: ttyd [options] <command>
            cmd_str = ' '.join(cmd) + ' ' + ssh_command
            
            logger.debug(f"Executing command: {cmd_str}")
            
            # Use shell=True since ttyd command contains spaces and quotes
            process = subprocess.Popen(
                cmd_str,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                creationflags=0
            )
        
        logger.debug(f"ttyd process started. PID: {process.pid}")
        
        # Store process info
        with self._lock:
            self.ttyd_processes[tunnel_id] = {
                "process": process,
                "listen_port": listen_port,
                "username": username,
                "password": password,
                "ssh_user": ssh_user,
                "ssh_host": ssh_host,
                "ssh_port": ssh_port,
                "writable": writable,
                "shared_session": shared_session,
                "started_at": time.time()
            }
        
        return process
    
    def get_ttyd(self, tunnel_id: str) -> Optional[Dict]:
        """Get ttyd process info by tunnel_id"""
        with self._lock:
            return self.ttyd_processes.get(tunnel_id)
    
    def kill_ttyd(self, tunnel_id: str):
        """Kill ttyd process for a tunnel"""
        with self._lock:
            if tunnel_id not in self.ttyd_processes:
                logger.debug(f"ttyd process not found for tunnel: {tunnel_id}")
                return
            
            info = self.ttyd_processes[tunnel_id]
            process = info.get("process")
            listen_port = info.get("listen_port")
            
            if process:
                try:
                    # Try graceful termination first
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                        logger.debug(f"ttyd process terminated gracefully for tunnel: {tunnel_id}")
                    except subprocess.TimeoutExpired:
                        # Process didn't terminate, force kill
                        logger.debug(f"ttyd process didn't terminate, force killing for tunnel: {tunnel_id}")
                        try:
                            process.kill()
                            process.wait(timeout=2)
                        except:
                            pass
                except Exception as e:
                    logger.debug(f"Error terminating ttyd process: {e}")
                    try:
                        process.kill()
                        process.wait(timeout=2)
                    except:
                        pass
            
            # Verify port is released
            if listen_port:
                max_retries = 3
                for i in range(max_retries):
                    try:
                        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        result = sock.connect_ex(('127.0.0.1', listen_port))
                        sock.close()
                        if result != 0:  # Port is free
                            break
                        # Port still in use, wait a bit and check again
                        if i < max_retries - 1:
                            time.sleep(0.5)
                            # Try to find and kill process using the port
                            try:
                                import subprocess as sp
                                result = sp.run(['lsof', '-ti', f':{listen_port}'], 
                                              capture_output=True, text=True, timeout=5)
                                if result.returncode == 0 and result.stdout.strip():
                                    pid = result.stdout.strip().split('\n')[0]
                                    try:
                                        kill_proc = sp.run(['kill', '-9', pid], 
                                                         capture_output=True, text=True, timeout=5)
                                        logger.debug(f"Killed process {pid} using port {listen_port}")
                                    except:
                                        pass
                            except:
                                pass
                    except Exception as e:
                        logger.debug(f"Error checking port {listen_port}: {e}")
                        break
            
            # Remove from dictionary
            del self.ttyd_processes[tunnel_id]
            logger.debug(f"Killed ttyd for tunnel: {tunnel_id}, port: {listen_port}")
    
    def cleanup_dead_ttyd_processes(self) -> int:
        """Clean up dead ttyd processes from dictionary"""
        cleaned_count = 0
        with self._lock:
            keys_to_remove = []
            for tunnel_id, info in self.ttyd_processes.items():
                process = info.get("process")
                if process:
                    if process.poll() is not None:  # Process is dead
                        logger.debug(f"Found dead ttyd process for tunnel {tunnel_id}, removing from dict")
                        keys_to_remove.append(tunnel_id)
                        cleaned_count += 1
                    else:
                        # Process is running, verify port is listening
                        listen_port = info.get("listen_port")
                        if listen_port:
                            try:
                                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                                result = sock.connect_ex(('127.0.0.1', listen_port))
                                sock.close()
                                if result != 0:  # Port not listening
                                    logger.debug(f"ttyd process for tunnel {tunnel_id} exists but port {listen_port} not listening")
                                    keys_to_remove.append(tunnel_id)
                                    cleaned_count += 1
                            except Exception as e:
                                logger.debug(f"Error checking ttyd port for tunnel {tunnel_id}: {e}")
                                keys_to_remove.append(tunnel_id)
                                cleaned_count += 1
            
            for key in keys_to_remove:
                try:
                    # Try to kill the process if it still exists
                    if key in self.ttyd_processes:
                        process = self.ttyd_processes[key].get("process")
                        if process:
                            try:
                                process.terminate()
                                process.wait(timeout=2)
                            except:
                                try:
                                    process.kill()
                                except:
                                    pass
                        del self.ttyd_processes[key]
                except Exception as e:
                    logger.debug(f"Error removing ttyd process for tunnel {key}: {e}")
        
        return cleaned_count
    
    def kill_all_ttyd_processes(self) -> int:
        """Kill all ttyd processes"""
        self.cleanup_dead_ttyd_processes()
        
        killed_count = 0
        with self._lock:
            tunnel_ids = list(self.ttyd_processes.keys())
            
            for tunnel_id in tunnel_ids:
                if tunnel_id in self.ttyd_processes:
                    process = self.ttyd_processes[tunnel_id]["process"]
                    try:
                        process.terminate()
                        process.wait(timeout=5)
                    except:
                        try:
                            process.kill()
                        except:
                            pass
                    del self.ttyd_processes[tunnel_id]
                    killed_count += 1
                    logger.debug(f"Killed ttyd for tunnel: {tunnel_id}")
        
        return killed_count


# Global process manager instance
process_manager = ProcessManager()

