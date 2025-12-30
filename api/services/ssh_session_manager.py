"""
SSH Session Manager
Manages persistent SSH sessions using SSH ControlMaster
"""
import subprocess
import os
import threading
import time
import asyncio
from typing import Optional, Dict
from pathlib import Path
from api.utils.logger import logger


class SSHSessionManager:
    """Manages persistent SSH sessions using ControlMaster"""
    
    def __init__(self):
        self.sessions: Dict[str, Dict] = {}  # tunnel_id -> session info
        self._lock = threading.Lock()
        self.control_dir = Path("/tmp/ssh_control")
        self.control_dir.mkdir(mode=0o700, exist_ok=True)
        self.connect_timeout = 30
        self.command_timeout = 60
    
    def _get_socket_path(self, tunnel_id: str) -> str:
        """Generate socket path for tunnel"""
        return str(self.control_dir / f"control_{tunnel_id}.sock")
    
    def _validate_key_path(self, key_path: str) -> bool:
        """Validate SSH key file exists and has correct permissions"""
        if not key_path:
            return False
        
        key_file = Path(key_path)
        if not key_file.exists():
            logger.error(f"SSH key file not found: {key_path}")
            return False
        
        if not key_file.is_file():
            logger.error(f"SSH key path is not a file: {key_path}")
            return False
        
        # Check permissions (should be 600 or 400)
        stat_info = os.stat(key_path)
        mode = stat_info.st_mode & 0o777
        if mode not in [0o600, 0o400]:
            logger.warning(f"SSH key file permissions are {oct(mode)}, recommended: 600 or 400")
        
        return True
    
    async def _is_session_active(self, socket_path: str) -> bool:
        """Check if SSH session is still active"""
        try:
            # Use ssh -O check to verify control socket is active
            result = await asyncio.to_thread(
                lambda: subprocess.run(
                    ["ssh", "-O", "check", "-S", socket_path, "localhost"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False
                )
            )
            return result.returncode == 0
        except Exception as e:
            logger.debug(f"Error checking session status: {e}")
            return False
    
    async def get_or_create_session(
        self,
        tunnel_id: str,
        hostname: str,
        port: int,
        username: str,
        key_path: Optional[str] = None
    ) -> Optional[str]:
        """
        Get existing session or create a new one
        
        Args:
            tunnel_id: Tunnel ID
            hostname: Target hostname or IP
            port: SSH port
            username: SSH username
            key_path: Path to SSH private key file
            
        Returns:
            socket_path if session created/exists, None on error
        """
        DEFAULT_KEY_PATH = "/root/.ssh/id_ed25519"
        if not key_path:
            key_path = DEFAULT_KEY_PATH
        
        # Validate key path
        if not self._validate_key_path(key_path):
            logger.error(f"Invalid SSH key path: {key_path}")
            return None
        
        socket_path = self._get_socket_path(tunnel_id)
        
        with self._lock:
            # Check if session already exists and is active
            if tunnel_id in self.sessions:
                session_info = self.sessions[tunnel_id]
                stored_socket_path = session_info.get("socket_path")
                
                # Verify session is still active
                if stored_socket_path and await self._is_session_active(stored_socket_path):
                    logger.debug(f"Reusing existing SSH session for tunnel {tunnel_id}")
                    return stored_socket_path
                else:
                    # Session is dead, remove it
                    logger.debug(f"SSH session for tunnel {tunnel_id} is dead, removing")
                    self._cleanup_session(tunnel_id)
            
            # Create new session
            logger.debug(f"Creating new SSH session for tunnel {tunnel_id}")
            
            # Build SSH master command
            ssh_cmd = [
                "ssh",
                "-M",  # Master mode
                "-S", socket_path,  # Control socket path
                "-f",  # Background
                "-N",  # Don't execute command, just keep connection open
                "-q",  # Quiet mode
                "-o", "StrictHostKeyChecking=no",
                "-o", "UserKnownHostsFile=/dev/null",
                "-o", "LogLevel=ERROR",
                "-o", f"ConnectTimeout={self.connect_timeout}",
                "-o", "BatchMode=yes",
                "-p", str(port),
                "-i", key_path,
                f"{username}@{hostname}"
            ]
            
            try:
                logger.debug(f"Starting SSH master connection: {' '.join(ssh_cmd)}")
                result = await asyncio.to_thread(
                    lambda: subprocess.run(
                        ssh_cmd,
                        capture_output=True,
                        text=True,
                        timeout=self.connect_timeout + 5,
                        check=False
                    )
                )
                
                if result.returncode != 0:
                    logger.error(f"Failed to create SSH master connection: {result.stderr}")
                    return None
                
                # Wait a bit for connection to establish
                await asyncio.sleep(0.5)
                
                # Verify session is active
                if not await self._is_session_active(socket_path):
                    logger.error(f"SSH master connection created but not active")
                    return None
                
                # Store session info
                self.sessions[tunnel_id] = {
                    "socket_path": socket_path,
                    "hostname": hostname,
                    "port": port,
                    "username": username,
                    "key_path": key_path,
                    "created_at": time.time()
                }
                
                logger.info(f"SSH session created successfully for tunnel {tunnel_id}. Total sessions: {len(self.sessions)}")
                logger.debug(f"Session info stored: {self.sessions[tunnel_id]}")
                return socket_path
                
            except subprocess.TimeoutExpired:
                logger.error(f"SSH master connection timed out for tunnel {tunnel_id}")
                return None
            except Exception as e:
                logger.exception(f"Error creating SSH session for tunnel {tunnel_id}: {e}")
                return None
    
    async def execute_command(
        self,
        tunnel_id: str,
        command: str,
        use_powershell: bool = False
    ) -> Dict:
        """
        Execute command via existing SSH session
        
        Args:
            tunnel_id: Tunnel ID
            command: Command to execute
            use_powershell: Whether to execute PowerShell command
            
        Returns:
            Dict with keys: success, output, error, exit_code
        """
        # Get session info and socket path (with lock)
        with self._lock:
            if tunnel_id not in self.sessions:
                logger.debug(f"Session not found for tunnel {tunnel_id} in execute_command")
                return {
                    "success": False,
                    "output": None,
                    "error": f"SSH session not found for tunnel {tunnel_id}. Please create a session first.",
                    "exit_code": -1
                }
            
            session_info = self.sessions[tunnel_id].copy()  # Copy to avoid holding lock
            socket_path = session_info.get("socket_path")
            logger.debug(f"Checking session active status for tunnel {tunnel_id}, socket_path: {socket_path}")
            is_active = socket_path and await self._is_session_active(socket_path) if socket_path else False
            logger.debug(f"Session active status for tunnel {tunnel_id}: {is_active}")
        
        # Check if session is dead and needs recreation (outside lock to avoid deadlock)
        if not socket_path or not is_active:
            # Session is dead, try to recreate
            logger.warning(f"SSH session for tunnel {tunnel_id} is dead, attempting to recreate")
            
            with self._lock:
                self._cleanup_session(tunnel_id)
            
            # Try to recreate session (outside lock)
            hostname = session_info.get("hostname")
            port = session_info.get("port")
            username = session_info.get("username")
            key_path = session_info.get("key_path")
            
            if not all([hostname, port, username]):
                return {
                    "success": False,
                    "output": None,
                    "error": "SSH session is dead and cannot be recreated (missing connection info)",
                    "exit_code": -1
                }
            
            new_socket_path = await self.get_or_create_session(tunnel_id, hostname, port, username, key_path)
            if not new_socket_path:
                return {
                    "success": False,
                    "output": None,
                    "error": "Failed to recreate SSH session",
                    "exit_code": -1
                }
            socket_path = new_socket_path
        
        # Execute command via control socket
        if use_powershell:
            # PowerShell command execution
            import base64
            try:
                command_bytes = command.encode('utf-16-le')
                encoded_command = base64.b64encode(command_bytes).decode('ascii')
                powershell_command = f'powershell.exe -NoProfile -NonInteractive -EncodedCommand {encoded_command}'
            except Exception as e:
                logger.warning(f"Failed to encode PowerShell command, falling back: {e}")
                escaped_command = command.replace('\\', '\\\\').replace('"', '\\"').replace('$', '`$')
                powershell_command = f'powershell.exe -NoProfile -NonInteractive -Command "{escaped_command}"'
            
            command_to_execute = powershell_command
        else:
            command_to_execute = command
        
        # Build SSH command using control socket
        ssh_cmd = [
            "ssh",
            "-S", socket_path,  # Use control socket
            "-q",  # Quiet mode
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",
            "-o", "BatchMode=yes",
            "localhost",  # Hostname doesn't matter when using control socket
            command_to_execute
        ]
        
        try:
            logger.debug(f"Executing command via SSH session: {command[:100]}")
            
            result = await asyncio.to_thread(
                lambda: subprocess.run(
                    ssh_cmd,
                    capture_output=True,
                    text=True,
                    timeout=self.command_timeout,
                    check=False
                )
            )
            
            stdout = result.stdout if result.stdout else ""
            stderr = result.stderr if result.stderr else ""
            exit_code = result.returncode
            
            logger.debug(f"Command executed via SSH session. Exit Code: {exit_code}")
            
            # Clean PowerShell output if needed
            if use_powershell:
                stdout = self._clean_clixml(stdout)
                stderr = self._clean_clixml(stderr)
            
            if exit_code != 0:
                error_msg = stderr if stderr else f"Command failed with exit code {exit_code}"
                return {
                    "success": False,
                    "output": stdout if stdout else None,
                    "error": error_msg,
                    "exit_code": exit_code
                }
            
            # Exit code is 0, stderr is likely informational (not an error)
            # Combine it with output and set error to None
            combined_output = stdout
            if stderr:
                # Append stderr to output if it exists
                if combined_output:
                    combined_output = combined_output + "\n" + stderr
                else:
                    combined_output = stderr
            
            return {
                "success": True,
                "output": combined_output,
                "error": None,
                "exit_code": exit_code
            }
            
        except subprocess.TimeoutExpired:
            logger.error(f"Command execution timed out after {self.command_timeout} seconds")
            return {
                "success": False,
                "output": None,
                "error": f"Command execution timed out after {self.command_timeout} seconds",
                "exit_code": -1
            }
        except Exception as e:
            logger.exception(f"Error executing command via SSH session: {e}")
            return {
                "success": False,
                "output": None,
                "error": str(e),
                "exit_code": -1
            }
    
    def _clean_clixml(self, output: str) -> str:
        """Remove CLIXML (PowerShell remoting XML format) from output"""
        if not output:
            return output
        
        import re
        
        if '#< CLIXML' not in output:
            return output
        
        # Extract actual messages from CLIXML
        to_string_pattern = r'<ToString>([^<]+)</ToString>'
        matches = re.findall(to_string_pattern, output)
        
        message_pattern = r'<S N="Message">([^<]+)</S>'
        message_matches = re.findall(message_pattern, output)
        
        extracted_messages = []
        if matches:
            extracted_messages.extend(matches)
        if message_matches:
            extracted_messages.extend(message_matches)
        
        # Remove CLIXML blocks
        clixml_pattern = r'#< CLIXML.*?</Objs>'
        output = re.sub(clixml_pattern, '', output, flags=re.DOTALL)
        
        # Add extracted messages
        if extracted_messages:
            cleaned_messages = []
            for msg in extracted_messages:
                msg = msg.replace('_x000A_', '\n')
                msg = msg.replace('_x000D_', '\r')
                msg = msg.replace('_x0009_', '\t')
                msg = re.sub(r'_x[0-9A-Fa-f]{4}_', '', msg)
                cleaned_messages.append(msg.strip())
            
            if not output.strip():
                output = '\n'.join(cleaned_messages)
            else:
                output = '\n'.join(cleaned_messages) + '\n' + output
        
        output = output.replace('#< CLIXML', '').strip()
        return output
    
    async def is_session_active(self, tunnel_id: str) -> bool:
        """Check if session is active"""
        with self._lock:
            if tunnel_id not in self.sessions:
                return False
            
            session_info = self.sessions[tunnel_id]
            socket_path = session_info.get("socket_path")
            
            if not socket_path:
                return False
        
        return await self._is_session_active(socket_path)
    
    async def close_session(self, tunnel_id: str) -> bool:
        """Close SSH session for a tunnel"""
        with self._lock:
            if tunnel_id not in self.sessions:
                logger.debug(f"SSH session not found for tunnel {tunnel_id}")
                return False
            
            session_info = self.sessions[tunnel_id]
            socket_path = session_info.get("socket_path")
        
        if socket_path:
            try:
                # Use ssh -O exit to close control master
                result = await asyncio.to_thread(
                    lambda: subprocess.run(
                        ["ssh", "-O", "exit", "-S", socket_path, "localhost"],
                        capture_output=True,
                        text=True,
                        timeout=5,
                        check=False
                    )
                )
                
                if result.returncode == 0:
                    logger.info(f"SSH session closed for tunnel {tunnel_id}")
                else:
                    logger.warning(f"Failed to close SSH session gracefully: {result.stderr}")
                
            except Exception as e:
                logger.warning(f"Error closing SSH session: {e}")
        
        # Cleanup session info
        with self._lock:
            self._cleanup_session(tunnel_id)
        return True
    
    def _cleanup_session(self, tunnel_id: str):
        """Clean up session info and socket file"""
        if tunnel_id in self.sessions:
            session_info = self.sessions[tunnel_id]
            socket_path = session_info.get("socket_path")
            
            # Remove socket file if exists
            if socket_path and os.path.exists(socket_path):
                try:
                    os.remove(socket_path)
                except Exception as e:
                    logger.warning(f"Failed to remove socket file {socket_path}: {e}")
            
            del self.sessions[tunnel_id]
    
    async def close_all_sessions(self):
        """Close all SSH sessions"""
        with self._lock:
            tunnel_ids = list(self.sessions.keys())
        for tunnel_id in tunnel_ids:
            await self.close_session(tunnel_id)
    
    async def get_session_info(self, tunnel_id: str) -> Optional[Dict]:
        """Get session information"""
        with self._lock:
            logger.debug(f"Getting session info for tunnel {tunnel_id}. Total sessions: {len(self.sessions)}")
            logger.debug(f"Session IDs: {list(self.sessions.keys())}")
            if tunnel_id not in self.sessions:
                logger.debug(f"Tunnel {tunnel_id} not found in sessions")
                return None
            
            session_info = self.sessions[tunnel_id].copy()
            socket_path = session_info.get("socket_path")
        
        session_info["active"] = await self._is_session_active(socket_path) if socket_path else False
        logger.debug(f"Session info for tunnel {tunnel_id}: active={session_info['active']}, socket_path={socket_path}")
        return session_info
    
    async def list_sessions(self) -> Dict[str, Dict]:
        """List all active sessions"""
        with self._lock:
            sessions_copy = {k: v.copy() for k, v in self.sessions.items()}
        
        sessions = {}
        for tunnel_id, session_info in sessions_copy.items():
            socket_path = session_info.get("socket_path")
            sessions[tunnel_id] = {
                **session_info,
                "active": await self._is_session_active(socket_path) if socket_path else False
            }
        return sessions

