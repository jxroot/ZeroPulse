import subprocess
import os
import base64
from typing import Optional, Dict
from pathlib import Path

from api.utils.logger import logger
from api.utils.exceptions import SSHConnectionError, SSHExecutionError


class SSHService:
    def __init__(self, default_username: Optional[str] = None, default_port: int = 22):
        self.default_username = default_username
        self.default_port = default_port
        # Timeout settings
        self.connect_timeout = 30  # Connection timeout (seconds)
        self.command_timeout = 60  # Command execution timeout (seconds)
    
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
    
    def execute_command(
        self,
        hostname: str,
        command: str,
        port: int = 22,
        username: Optional[str] = None,
        key_path: Optional[str] = None
    ) -> Dict:
        """
        Execute command via SSH
        
        Args:
            hostname: Target hostname or IP
            command: Command to execute
            port: SSH port (default: 22)
            username: SSH username
            key_path: Path to SSH private key file (if None, uses default: /root/.ssh/id_ed25519)
        
        Returns:
            Dict with keys: success, output, error, exit_code
        """
        logger.debug(f"Executing SSH command: {command}")
        logger.debug(f"Hostname: {hostname}, Port: {port}, Username: {username}")
        
        # Use default key path if not provided
        DEFAULT_KEY_PATH = "/root/.ssh/id_ed25519"
        if not key_path:
            key_path = DEFAULT_KEY_PATH
        
        # Validate key path
        if not self._validate_key_path(key_path):
            return {
                "success": False,
                "output": None,
                "error": f"SSH key file not found or invalid: {key_path}",
                "exit_code": -1
            }
        
        # Use default username if not provided
        username = username or self.default_username
        if not username:
            return {
                "success": False,
                "output": None,
                "error": "SSH username is required",
                "exit_code": -1
            }
        
        # Build SSH command
        ssh_cmd = [
            "ssh",
            "-q",  # Quiet mode - suppress warnings and info messages
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "LogLevel=ERROR",  # Suppress warnings and info messages
            "-o", "ConnectTimeout=30",
            "-o", "BatchMode=yes",  # Disable password prompts
            "-p", str(port),
            "-i", key_path  # Always use key file
        ]
        
        # Add hostname and command
        ssh_cmd.append(f"{username}@{hostname}")
        ssh_cmd.append(command)
        
        try:
            logger.debug(f"Executing SSH command: {' '.join(ssh_cmd)}")
            
            # Execute command with timeout
            result = subprocess.run(
                ssh_cmd,
                capture_output=True,
                text=True,
                timeout=self.command_timeout,
                check=False
            )
            
            stdout = result.stdout if result.stdout else ""
            stderr = result.stderr if result.stderr else ""
            exit_code = result.returncode
            
            logger.debug(f"SSH command executed. Exit Code: {exit_code}")
            logger.debug(f"Stdout Length: {len(stdout)} chars")
            logger.debug(f"Stderr Length: {len(stderr)} chars")
            
            # Parse error messages for better user feedback
            if exit_code != 0 and stderr:
                logger.debug(f"SSH command failed with exit code {exit_code}, stderr: {stderr}")
                error_msg = self._parse_error_message(stderr)
                logger.debug(f"Parsed error message: {error_msg}")
                return {
                    "success": False,
                    "output": stdout if stdout else None,
                    "error": error_msg,
                    "exit_code": exit_code
                }
            elif exit_code != 0 and not stderr:
                logger.debug(f"SSH command failed with exit code {exit_code} but no stderr. stdout: {stdout}")
                # Try to parse stdout as error if stderr is empty
                if stdout:
                    error_msg = self._parse_error_message(stdout)
                    if error_msg != stdout:  # If parsing changed it
                        return {
                            "success": False,
                            "output": None,
                            "error": error_msg,
                            "exit_code": exit_code
                        }
                # Default error message
                return {
                    "success": False,
                    "output": stdout if stdout else None,
                    "error": f"SSH command failed with exit code {exit_code}",
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
            logger.error(f"SSH command timed out after {self.command_timeout} seconds")
            return {
                "success": False,
                "output": None,
                "error": f"Command execution timed out after {self.command_timeout} seconds",
                "exit_code": -1
            }
        
        except FileNotFoundError:
            logger.error("SSH client not found. Please install OpenSSH client.")
            return {
                "success": False,
                "output": None,
                "error": "SSH client not found. Please install OpenSSH client (ssh command).",
                "exit_code": -1
            }
        
        except Exception as e:
            logger.exception(f"Error executing SSH command: {e}")
            error_str = str(e)
            logger.debug(f"Raw exception string: {error_str}")
            error_msg = self._parse_error_message(error_str)
            logger.debug(f"Parsed exception error message: {error_msg}")
            return {
                "success": False,
                "output": None,
                "error": error_msg,
                "exit_code": -1
            }
    
    def _parse_error_message(self, error_msg: str) -> str:
        """Parse error message for better user feedback"""
        error_lower = error_msg.lower()

        # Connection issues
        if "connection refused" in error_lower or "connection timed out" in error_lower:
            return "❌ Connection Refused\n\n" \
                   "Cannot connect to SSH service. Please verify:\n\n" \
                   "• SSH service is running on the target machine\n" \
                   "• Port 22 (or specified port) is open\n" \
                   "• Firewall allows SSH connections\n" \
                   "• Cloudflare Tunnel route proxy is running correctly"

        elif "no route to host" in error_lower or "network is unreachable" in error_lower:
            return "❌ No Route to Host\n\n" \
                   "Cannot reach the target host. Please verify:\n\n" \
                   "• Hostname/IP is correct\n" \
                   "• Network connectivity is available\n" \
                   "• Cloudflare Tunnel route proxy is running"

        # Authentication issues
        elif "permission denied" in error_lower or "authentication failed" in error_lower:
            return "❌ Authentication Failed\n\n" \
                   "SSH authentication failed. Please verify:\n\n" \
                   "• SSH key file exists and is readable\n" \
                   "• SSH key has correct permissions (600 or 400)\n" \
                   "• Public key is added to authorized_keys on target server\n" \
                   "• Username is correct\n" \
                   "• SSH service allows key-based authentication"

        elif "host key verification failed" in error_lower:
            return "❌ Host Key Verification Failed\n\n" \
                   "The host key verification failed. This usually resolves automatically, " \
                   "but you may need to update known_hosts or use StrictHostKeyChecking=no"

        # SSH client issues
        elif "ssh client not found" in error_lower or "command not found" in error_lower:
            return "❌ SSH Client Not Found\n\n" \
                   "SSH client is not installed or not in PATH. Please install OpenSSH client."

        # Timeout issues
        elif "timeout" in error_lower:
            return "⏱️ Connection Timeout\n\n" \
                   "The SSH connection timed out. Possible causes:\n\n" \
                   "• Target machine is not responding\n" \
                   "• Firewall is blocking the connection\n" \
                   "• Network connectivity issues\n" \
                   "• SSH service is overloaded"

        # Key file issues
        elif "no such file" in error_lower or "key file not found" in error_lower:
            return "❌ SSH Key File Missing\n\n" \
                   "The specified SSH key file does not exist. Please verify:\n\n" \
                   "• SSH key file path is correct\n" \
                   "• SSH key file exists at the specified location"

        # Generic SSH errors
        elif any(keyword in error_lower for keyword in ["ssh", "failed", "error"]):
            return f"❌ SSH Error\n\n{error_msg}\n\n" \
                   "Please check the SSH service configuration and network connectivity."

        return error_msg
    
    def execute_powershell(
        self,
        hostname: str,
        command: str,
        port: int = 22,
        username: Optional[str] = None,
        key_path: Optional[str] = None
    ) -> Dict:
        """
        Execute PowerShell command via SSH
        
        Args:
            hostname: Target hostname or IP
            command: PowerShell command to execute
            port: SSH port (default: 22)
            username: SSH username
            key_path: Path to SSH private key file (if None, uses default: /root/.ssh/id_ed25519)
        
        Returns:
            Dict with keys: success, output, error, exit_code
        """
        # Use base64 encoding for PowerShell commands to avoid shell interpretation issues
        # This ensures the command is properly passed to PowerShell without shell interference
        try:
            # Encode command to base64 (PowerShell expects UTF-16LE encoding)
            command_bytes = command.encode('utf-16-le')
            encoded_command = base64.b64encode(command_bytes).decode('ascii')
            
            # Use -EncodedCommand parameter for reliable execution
            powershell_command = f'powershell.exe -NoProfile -NonInteractive -EncodedCommand {encoded_command}'
        except Exception as e:
            logger.warning(f"Failed to encode command with base64, falling back to -Command: {e}")
            # Fallback to -Command with proper escaping
            escaped_command = command.replace('\\', '\\\\').replace('"', '\\"').replace('$', '`$')
            powershell_command = f'powershell.exe -NoProfile -NonInteractive -Command "{escaped_command}"'
        
        # Execute with Windows PowerShell only
        logger.debug(f"Executing PowerShell command: {command[:100]}")
        result = self.execute_command(hostname, powershell_command, port, username, key_path)
        
        # Clean CLIXML from output if present (PowerShell remoting format)
        if result.get("output"):
            result["output"] = self._clean_clixml(result["output"])
        if result.get("error"):
            result["error"] = self._clean_clixml(result["error"])
        
        return result
    
    def _clean_clixml(self, output: str) -> str:
        """
        Remove CLIXML (PowerShell remoting XML format) from output.
        CLIXML starts with '#< CLIXML' and contains XML data that should be filtered.
        """
        if not output:
            return output
        
        import re
        
        # Check if output contains CLIXML
        if '#< CLIXML' not in output:
            return output
        
        # Extract actual messages from CLIXML before removing it
        # Look for <ToString> tags which contain the actual message
        to_string_pattern = r'<ToString>([^<]+)</ToString>'
        matches = re.findall(to_string_pattern, output)
        
        # Also look for <S N="Message"> tags
        message_pattern = r'<S N="Message">([^<]+)</S>'
        message_matches = re.findall(message_pattern, output)
        
        # Combine all extracted messages
        extracted_messages = []
        if matches:
            extracted_messages.extend(matches)
        if message_matches:
            extracted_messages.extend(message_matches)
        
        # Remove all CLIXML blocks (from #< CLIXML to </Objs>)
        clixml_pattern = r'#< CLIXML.*?</Objs>'
        output = re.sub(clixml_pattern, '', output, flags=re.DOTALL)
        
        # If we extracted messages, add them to output
        if extracted_messages:
            # Clean extracted messages
            cleaned_messages = []
            for msg in extracted_messages:
                # Decode escape sequences
                msg = msg.replace('_x000A_', '\n')
                msg = msg.replace('_x000D_', '\r')
                msg = msg.replace('_x0009_', '\t')
                # Remove other escape sequences like _xD83C_ (emoji parts)
                msg = re.sub(r'_x[0-9A-Fa-f]{4}_', '', msg)
                cleaned_messages.append(msg.strip())
            
            # Add extracted messages to output if output is empty or add as prefix
            if not output.strip():
                output = '\n'.join(cleaned_messages)
            else:
                # Prepend extracted messages if they exist
                output = '\n'.join(cleaned_messages) + '\n' + output
        
        # Remove any remaining CLIXML markers
        output = output.replace('#< CLIXML', '').strip()
        
        return output
    
    def execute_command_via_session(
        self,
        socket_path: str,
        command: str
    ) -> Dict:
        """
        Execute command via existing SSH ControlMaster session
        
        Args:
            socket_path: Path to SSH control socket
            command: Command to execute
        
        Returns:
            Dict with keys: success, output, error, exit_code
        """
        logger.debug(f"Executing SSH command via session: {command}")
        
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
            command
        ]
        
        try:
            logger.debug(f"Executing SSH command via session: {' '.join(ssh_cmd)}")
            
            result = subprocess.run(
                ssh_cmd,
                capture_output=True,
                text=True,
                timeout=self.command_timeout,
                check=False
            )
            
            stdout = result.stdout if result.stdout else ""
            stderr = result.stderr if result.stderr else ""
            exit_code = result.returncode
            
            logger.debug(f"SSH command executed via session. Exit Code: {exit_code}")
            
            # Parse error messages for better user feedback
            if exit_code != 0 and stderr:
                logger.debug(f"SSH command failed with exit code {exit_code}, stderr: {stderr}")
                error_msg = self._parse_error_message(stderr)
                return {
                    "success": False,
                    "output": stdout if stdout else None,
                    "error": error_msg,
                    "exit_code": exit_code
                }
            elif exit_code != 0 and not stderr:
                logger.debug(f"SSH command failed with exit code {exit_code} but no stderr")
                return {
                    "success": False,
                    "output": stdout if stdout else None,
                    "error": f"SSH command failed with exit code {exit_code}",
                    "exit_code": exit_code
                }
            
            return {
                "success": exit_code == 0,
                "output": stdout,
                "error": stderr if stderr else None,
                "exit_code": exit_code
            }
        
        except subprocess.TimeoutExpired:
            logger.error(f"SSH command timed out after {self.command_timeout} seconds")
            return {
                "success": False,
                "output": None,
                "error": f"Command execution timed out after {self.command_timeout} seconds",
                "exit_code": -1
            }
        except FileNotFoundError:
            logger.error("SSH client not found. Please install OpenSSH client.")
            return {
                "success": False,
                "output": None,
                "error": "SSH client not found. Please install OpenSSH client (ssh command).",
                "exit_code": -1
            }
        except Exception as e:
            logger.exception(f"Error executing SSH command via session: {e}")
            error_str = str(e)
            error_msg = self._parse_error_message(error_str)
            return {
                "success": False,
                "output": None,
                "error": error_msg,
                "exit_code": -1
            }
    
    def test_connection(
        self,
        hostname: str,
        port: int = 22,
        username: Optional[str] = None,
        key_path: Optional[str] = None
    ) -> bool:
        """
        Test SSH connection
        
        Args:
            hostname: Target hostname or IP
            port: SSH port (default: 22)
            username: SSH username
            key_path: Path to SSH private key file
        
        Returns:
            bool: Success or failure
        """
        result = self.execute_command(hostname, "echo 'SSH connection test successful'", port, username, key_path)
        return result["success"]

