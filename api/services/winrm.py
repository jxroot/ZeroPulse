import winrm
import asyncio
from typing import Optional, Dict
from datetime import datetime

from api.utils.env import get_env
from api.utils.logger import logger
from api.utils.exceptions import WinRMConnectionError, WinRMExecutionError

WINRM_USERNAME = get_env("WINRM_USERNAME", "WinRMUser")
WINRM_PASSWORD = get_env("WINRM_PASSWORD", "")


class WinRMService:
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        self.username = username or WINRM_USERNAME
        self.password = password or WINRM_PASSWORD
        # Timeout settings
        self.connect_timeout = 30  # Connection timeout (seconds)
        self.read_timeout = 60  # Read timeout (seconds)
        self.operation_timeout = 300  # WinRM operation timeout (seconds) - increased for large file operations
        # read_timeout_sec must be greater than operation_timeout_sec
        self.read_timeout_sec = 360  # pywinrm read timeout (must be greater than operation_timeout) - increased for large file operations
    
    def create_session(self, hostname: str, port: int = 443, use_ssl: bool = True, auto_fallback: bool = True) -> Optional[winrm.Session]:
        """
        Create WinRM Session
        
        Args:
            hostname: Hostname or IP
            port: Port (443 for HTTPS, 5986 for localhost)
            use_ssl: Use SSL
            auto_fallback: If SSL fails with wrong version error, try HTTP automatically
        
        Returns:
            winrm.Session or None
        """
        try:
            protocol = "https" if use_ssl else "http"
            url = f"{protocol}://{hostname}:{port}/wsman"
            
            logger.debug(f"Creating WinRM Session: {url}")
            logger.debug(f"Username: {self.username}")
            logger.debug(f"Timeouts: connect={self.connect_timeout}s, read={self.read_timeout}s, operation={self.operation_timeout}s, read_timeout_sec={self.read_timeout_sec}s")
            
            # Create session with timeout
            # pywinrm uses read_timeout_sec and operation_timeout_sec
            session = winrm.Session(
                url,
                auth=(self.username, self.password),
                transport='ntlm',
                server_cert_validation='ignore',
                read_timeout_sec=self.read_timeout_sec,
                operation_timeout_sec=self.operation_timeout
            )
            
            logger.debug("WinRM Session created successfully")
            return session
        except Exception as e:
            error_str = str(e)
            # Check if it's an SSL version error and we should try HTTP fallback
            if auto_fallback and use_ssl and ("WRONG_VERSION_NUMBER" in error_str or "wrong version number" in error_str.lower()):
                logger.warning(f"SSL connection failed with version error, trying HTTP fallback: {error_str}")
                try:
                    # Try HTTP instead
                    http_url = f"http://{hostname}:{port}/wsman"
                    logger.debug(f"Trying HTTP fallback: {http_url}")
                    session = winrm.Session(
                        http_url,
                        auth=(self.username, self.password),
                        transport='ntlm',
                        server_cert_validation='ignore',
                        read_timeout_sec=self.read_timeout_sec,
                        operation_timeout_sec=self.operation_timeout
                    )
                    logger.info(f"Successfully connected using HTTP fallback on port {port}")
                    return session
                except Exception as fallback_error:
                    logger.exception(f"HTTP fallback also failed: {fallback_error}")
                    raise WinRMConnectionError(f"Failed to create WinRM session with both HTTPS and HTTP: {str(e)}")
            
            logger.exception(f"Error creating WinRM Session: {e}")
            raise WinRMConnectionError(f"Failed to create WinRM session: {str(e)}")
    
    async def execute_command(self, hostname: str, command: str, port: int = 443, use_ssl: bool = True) -> Dict:
        """
        Execute command on Agent
        
        Args:
            hostname: Agent hostname
            command: Command to execute
            port: Port (443 for Cloudflare Tunnel, 5986 for localhost)
            use_ssl: Use SSL
        
        Returns:
            Dict with keys: success, output, error, exit_code
        """
        logger.debug(f"Executing command: {command}")
        logger.debug(f"Hostname: {hostname}, Port: {port}, SSL: {use_ssl}")
        
        try:
            session = await asyncio.to_thread(self.create_session, hostname, port, use_ssl)
        except WinRMConnectionError as e:
            logger.error(f"Session not created: {e}")
            return {
                "success": False,
                "output": None,
                "error": str(e),
                "exit_code": -1
            }
        
        try:
            logger.debug("Executing command...")
            # Execute command (run in thread since pywinrm is synchronous)
            result = await asyncio.to_thread(session.run_cmd, command)
            
            # Read output
            stdout = result.std_out.decode('utf-8', errors='ignore') if result.std_out else ""
            stderr = result.std_err.decode('utf-8', errors='ignore') if result.std_err else ""
            exit_code = result.status_code
            
            # Clean CLIXML from output (PowerShell remoting format)
            stdout = self._clean_clixml(stdout)
            stderr = self._clean_clixml(stderr)
            
            logger.debug(f"Command executed. Exit Code: {exit_code}")
            logger.debug(f"Stdout Length: {len(stdout)} chars")
            logger.debug(f"Stderr Length: {len(stderr)} chars")
            
            # Consider command successful if:
            # 1. Exit code is 0, OR
            # 2. Exit code is 0 and we have output (definitely successful)
            # 3. Exit code is non-zero but we have output and no error (some commands return non-zero but have valid output)
            # Only fail if exit_code is non-zero AND we have an error message AND no output
            is_success = (
                exit_code == 0 or
                (exit_code == 0 and stdout.strip()) or
                (exit_code != 0 and stdout.strip() and not stderr.strip())
            )
            
            # If exit_code is 0, stderr is likely informational (not an error)
            # Combine it with output and set error to None
            if exit_code == 0:
                combined_output = stdout
                if stderr:
                    # Append stderr to output if it exists
                    if combined_output:
                        combined_output = combined_output + "\n" + stderr
                    else:
                        combined_output = stderr
                return {
                    "success": is_success,
                    "output": combined_output,
                    "error": None,
                    "exit_code": exit_code
                }
            else:
                # Exit code is non-zero, treat stderr as error
                return {
                    "success": is_success,
                    "output": stdout,
                    "error": stderr if stderr else None,
                    "exit_code": exit_code
                }
        
        except Exception as e:
            logger.exception(f"Error executing command: {e}")
            
            # Parse error message for better user feedback
            error_msg = self._parse_error_message(str(e))
            
            return {
                "success": False,
                "output": None,
                "error": error_msg,
                "exit_code": -1
            }
    
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
                # Add extracted messages before existing output
                output = '\n'.join(cleaned_messages) + '\n' + output
        
        # Clean up any remaining escape sequences
        output = output.replace('_x000A_', '\n')
        output = output.replace('_x000D_', '\r')
        output = output.replace('_x0009_', '\t')
        output = re.sub(r'_x[0-9A-Fa-f]{4}_', '', output)
        
        # Remove any remaining XML tags
        output = re.sub(r'<[^>]+>', '', output)
        
        # Remove any remaining CLIXML markers
        output = output.replace('#< CLIXML', '').strip()
        
        # Clean up multiple newlines
        output = re.sub(r'\n{3,}', '\n\n', output)
        
        return output.strip()
    
    def _extract_error_from_clixml(self, clixml_output: str) -> str:
        """
        Extract error message from CLIXML output.
        Returns empty string if no error found.
        """
        if not clixml_output or '#< CLIXML' not in clixml_output:
            return ""
        
        import re
        
        # Look for error messages in CLIXML
        # Check for <ToString> with error-like content
        to_string_pattern = r'<ToString>([^<]+)</ToString>'
        matches = re.findall(to_string_pattern, clixml_output)
        
        # Also check for <S N="Message"> tags
        message_pattern = r'<S N="Message">([^<]+)</S>'
        message_matches = re.findall(message_pattern, clixml_output)
        
        # Combine and clean
        all_messages = matches + message_matches
        if all_messages:
            # Clean escape sequences
            cleaned = []
            for msg in all_messages:
                msg = msg.replace('_x000A_', '\n')
                msg = msg.replace('_x000D_', '\r')
                msg = msg.replace('_x0009_', '\t')
                msg = re.sub(r'_x[0-9A-Fa-f]{4}_', '', msg)
                if msg.strip():
                    cleaned.append(msg.strip())
            
            if cleaned:
                return '\n'.join(cleaned)
        
        return ""
    
    def _parse_error_message(self, error_msg: str) -> str:
        """Parse error message for better user feedback"""
        if "WRONG_VERSION_NUMBER" in error_msg or "wrong version number" in error_msg.lower():
            return "❌ SSL Version Mismatch\n\n" \
                   "The SSL/TLS handshake failed. Possible causes:\n\n" \
                   "• WinRM service is configured for HTTP instead of HTTPS\n" \
                   "• Port 5986 is listening on HTTP instead of HTTPS\n" \
                   "• SSL/TLS configuration mismatch\n\n" \
                   "The system will automatically try HTTP as fallback."
        elif "ConnectionResetError" in error_msg or "Connection aborted" in error_msg:
            return "❌ Connection Reset\n\n" \
                   "The connection was reset by the remote host. Possible causes:\n\n" \
                   "• WinRM service is not running on the target machine\n" \
                   "• WinRM HTTPS listener is not configured (port 5986)\n" \
                   "• Firewall is blocking the connection\n" \
                   "• SSL certificate validation failed\n" \
                   "• Cloudflare Tunnel proxy connection issue"
        elif "Connection refused" in error_msg or "Cannot connect" in error_msg:
            return "❌ Connection Refused\n\n" \
                   "Cannot connect to WinRM service. Please verify:\n\n" \
                   "• WinRM service is running on the target machine\n" \
                   "• HTTPS listener is configured on port 5986 (or HTTP on port 5985)\n" \
                   "• Firewall allows connections on the WinRM port"
        elif "timeout" in error_msg.lower():
            return "⏱️ Connection Timeout\n\n" \
                   "The connection timed out. Possible reasons:\n\n" \
                   "• Target machine is not responding\n" \
                   "• Firewall is blocking the connection\n" \
                   "• WinRM service is not accessible"
        return error_msg
    
    async def execute_powershell(self, hostname: str, script: str, port: int = 443, use_ssl: bool = True) -> Dict:
        """
        Execute PowerShell script on Agent
        
        Args:
            hostname: Agent hostname
            script: PowerShell script
            port: Port
            use_ssl: Use SSL
        
        Returns:
            Dict with keys: success, output, error, exit_code
        """
        logger.debug(f"Executing PowerShell script (length: {len(script)} chars)")
        logger.debug(f"Script preview (first 200 chars): {script[:200]}")
        logger.debug(f"Script contains newlines: {script.count(chr(10))}")
        
        try:
            session = await asyncio.to_thread(self.create_session, hostname, port, use_ssl)
        except WinRMConnectionError as e:
            logger.error(f"Session not created: {e}")
            return {
                "success": False,
                "output": None,
                "error": str(e),
                "exit_code": -1
            }
        
        try:
            # Execute PowerShell script (run_ps handles multi-line scripts natively)
            # Run in thread since pywinrm is synchronous
            result = await asyncio.to_thread(session.run_ps, script)
            
            # Read output
            stdout = result.std_out.decode('utf-8', errors='ignore') if result.std_out else ""
            stderr = result.std_err.decode('utf-8', errors='ignore') if result.std_err else ""
            exit_code = result.status_code
            
            # Clean CLIXML from output (PowerShell remoting format)
            # Check if output contains CLIXML - if so, it's likely an error even if exit_code is 0
            stdout_cleaned = self._clean_clixml(stdout)
            stderr_cleaned = self._clean_clixml(stderr)
            
            # If CLIXML was found and cleaned, check if there's actual useful output
            has_clixml = '#< CLIXML' in stdout or '#< CLIXML' in stderr
            
            # If CLIXML was present but cleaned output is empty, it might be an error
            if has_clixml and not stdout_cleaned.strip() and not stderr_cleaned.strip():
                # Try to extract error message from CLIXML
                error_msg = self._extract_error_from_clixml(stdout + stderr)
                if error_msg:
                    stderr_cleaned = error_msg
                    exit_code = 1  # Treat as error
            
            logger.debug(f"PowerShell script executed. Exit Code: {exit_code}")
            logger.debug(f"Stdout Length: {len(stdout_cleaned)} chars")
            logger.debug(f"Stderr Length: {len(stderr_cleaned)} chars")
            logger.debug(f"Had CLIXML: {has_clixml}")
            
            # Consider command successful if:
            # 1. Exit code is 0 and no CLIXML errors, OR
            # 2. Exit code is 0 and we have cleaned output (definitely successful)
            # 3. Exit code is non-zero but we have cleaned output and no error (some commands return non-zero but have valid output)
            # Only fail if exit_code is non-zero AND we have an error AND no output
            is_success = (
                (exit_code == 0 and not has_clixml) or
                (exit_code == 0 and stdout_cleaned.strip() and not has_clixml) or
                (exit_code != 0 and stdout_cleaned.strip() and not stderr_cleaned.strip() and not has_clixml)
            )
            
            # If exit_code is 0, stderr is likely informational (not an error)
            # Combine it with output and set error to None
            if exit_code == 0:
                combined_output = stdout_cleaned
                if stderr_cleaned:
                    # Append stderr to output if it exists
                    if combined_output:
                        combined_output = combined_output + "\n" + stderr_cleaned
                    else:
                        combined_output = stderr_cleaned
                return {
                    "success": is_success,
                    "output": combined_output,
                    "error": None,
                    "exit_code": exit_code
                }
            else:
                # Exit code is non-zero, treat stderr as error
                return {
                    "success": is_success,
                    "output": stdout_cleaned,
                    "error": stderr_cleaned if stderr_cleaned else None,
                    "exit_code": exit_code
                }
        
        except Exception as e:
            logger.exception(f"Error executing PowerShell script: {e}")
            error_msg = self._parse_error_message(str(e))
            
            return {
                "success": False,
                "output": None,
                "error": error_msg,
                "exit_code": -1
            }
    
    async def test_connection(self, hostname: str, port: int = 443, use_ssl: bool = True) -> bool:
        """
        Test connection to Agent
        
        Args:
            hostname: Agent hostname
            port: Port
            use_ssl: Use SSL
        
        Returns:
            bool: Success or failure
        """
        result = await self.execute_command(hostname, "whoami", port, use_ssl)
        return result["success"]

