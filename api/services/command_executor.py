"""
Command Executor Service
Handles command execution via WinRM or SSH through Cloudflare Tunnel
Extracts common logic for CMD, PowerShell, and SSH execution
"""

from typing import Optional, Literal
from api.models.command import CommandResponse
from api.services.winrm import WinRMService
from api.services.ssh import SSHService
from api.services.ssh_session_manager import SSHSessionManager
from api.services.cloudflare import CloudflareService
from api.services.database import Database
from api.services.process_manager import process_manager
from api.utils.exceptions import (
    TunnelNotFoundError,
    TunnelOfflineError,
    TunnelConfigurationError,
    RouteProxyNotRunningError
)
from api.utils.logger import logger


class CommandExecutor:
    """Handles command execution via WinRM or SSH"""
    
    def __init__(
        self,
        winrm_service: WinRMService,
        ssh_service: SSHService,
        cloudflare_service: CloudflareService,
        database: Database,
        ssh_session_manager: Optional[SSHSessionManager] = None
    ):
        self.winrm_service = winrm_service
        self.ssh_service = ssh_service
        self.cloudflare_service = cloudflare_service
        self.database = database
        self.ssh_session_manager = ssh_session_manager or SSHSessionManager()
    
    async def get_tunnel_hostname(self, tunnel_id: str, connection_type: Optional[str] = None) -> Optional[str]:
        """
        Get default hostname for connection from database or ingress routes
        
        Args:
            tunnel_id: Tunnel ID
            connection_type: 'winrm' or 'ssh' - if None, will be determined automatically
            
        Returns:
            hostname or None if not found
        """
        tunnel = await self.database.get_tunnel_by_id(tunnel_id)
        if not tunnel:
            return None
        
        # Determine connection type if not provided
        if not connection_type:
            connection_type = await self.get_connection_type(tunnel_id)
        
        # First try database
        if connection_type == "ssh":
            hostname = tunnel.get("ssh_hostname") or tunnel.get("default_hostname")
        else:
            hostname = tunnel.get("default_hostname") or tunnel.get("ssh_hostname")
        
        logger.debug(f"[get_tunnel_hostname] After database check: hostname={hostname}, connection_type={connection_type}, tunnel_id={tunnel_id}")
        
        # If not in database, try to get from ingress routes
        if not hostname:
            logger.debug(f"[get_tunnel_hostname] Hostname not found in database, trying ingress routes...")
            try:
                config = await self.cloudflare_service.get_tunnel_config(tunnel_id)
                if config:
                    config_data = config.get("config", {})
                    if isinstance(config_data, dict):
                        ingress = config_data.get("ingress", [])
                        for route in ingress:
                            if not route.get("hostname"):
                                continue
                            service = route.get("service", "")
                            service_lower = service.lower().strip()
                            
                            if connection_type == "ssh":
                                # Check if it's an SSH service (ssh://) or TCP service with port 22
                                if service_lower.startswith("ssh://") or (service_lower.startswith("tcp://") and ":22" in service_lower):
                                    hostname = route["hostname"]
                                    logger.info(f"[get_tunnel_hostname] Using hostname from ingress route for SSH: {hostname}")
                                    break
                            else:
                                # Check if it's a WinRM service (TCP with port 5986)
                                if service_lower.startswith("tcp://") and ":5986" in service_lower:
                                    hostname = route["hostname"]
                                    logger.info(f"[get_tunnel_hostname] Using hostname from ingress route for WinRM: {hostname}")
                                    break
            except Exception as e:
                logger.debug(f"[get_tunnel_hostname] Error getting hostname from ingress routes: {e}")
        
        logger.info(f"[get_tunnel_hostname] Final result for tunnel {tunnel_id}, connection_type={connection_type}: hostname={hostname}")
        return hostname
    
    async def get_connection_type(self, tunnel_id: str) -> Literal["winrm", "ssh"]:
        """
        Determine connection type based on tunnel configuration and routes
        
        Priority:
        1. Database connection_type (user preference - most reliable)
        2. Ingress routes from Cloudflare (check for WinRM first, then SSH)
        3. Default to WinRM
        
        Args:
            tunnel_id: Tunnel ID
            
        Returns:
            'winrm' or 'ssh'
        """
        # First check database for explicit connection_type (user preference - most reliable)
        tunnel = await self.database.get_tunnel_by_id(tunnel_id)
        if tunnel:
            conn_type_db = tunnel.get("connection_type")
            logger.info(f"[get_connection_type] Database check for tunnel {tunnel_id}: connection_type={conn_type_db}")
            if conn_type_db:
                conn_type = conn_type_db.lower()
                if conn_type in ["winrm", "ssh"]:
                    # If database says SSH but we have WinRM routes, prioritize WinRM
                    # Check ingress routes to verify
                    try:
                        config = await self.cloudflare_service.get_tunnel_config(tunnel_id)
                        if config:
                            config_data = config.get("config", {})
                            if not isinstance(config_data, dict):
                                config_data = {}
                            ingress = config_data.get("ingress", [])
                            
                            has_winrm_route = False
                            has_ssh_route = False
                            
                            for route in ingress:
                                service = route.get("service", "").strip().lower()
                                if service.startswith("tcp://") and ":5986" in service:
                                    has_winrm_route = True
                                elif service.startswith("ssh://") or (service.startswith("tcp://") and ":22" in service):
                                    has_ssh_route = True
                            
                            # If database says SSH but we have WinRM route, prioritize WinRM
                            if conn_type == "ssh" and has_winrm_route:
                                logger.warning(f"[get_connection_type] Database says SSH but WinRM route found, prioritizing WinRM for tunnel {tunnel_id}")
                                # Update database to reflect correct connection type
                                await self.database.update_tunnel(tunnel_id, {"connection_type": "winrm"})
                                return "winrm"
                    except Exception as e:
                        logger.warning(f"[get_connection_type] Error checking routes for override: {e}")
                    
                    logger.info(f"[get_connection_type] ✓ Using connection_type from database: {conn_type} for tunnel {tunnel_id}")
                    return conn_type
                else:
                    logger.warning(f"[get_connection_type] Invalid connection_type in database: {conn_type}, ignoring")
            else:
                logger.info(f"[get_connection_type] No connection_type in database for tunnel {tunnel_id}, checking ingress routes")
        else:
            logger.warning(f"[get_connection_type] Tunnel {tunnel_id} not found in database, checking ingress routes")
        
        # If no database connection_type, check ingress routes from Cloudflare
        # Check for WinRM first (port 5986), then SSH (port 22)
        # If both exist, prioritize WinRM
        try:
            # Use get_tunnel_config to get the actual config structure
            config = await self.cloudflare_service.get_tunnel_config(tunnel_id)
            if config:
                config_data = config.get("config", {})
                if not isinstance(config_data, dict):
                    config_data = {}
                ingress = config_data.get("ingress", [])
                
                logger.info(f"[get_connection_type] Checking ingress routes for tunnel {tunnel_id}, found {len(ingress)} routes")
                
                has_winrm_route = False
                has_ssh_route = False
                
                # First pass: Check all routes to see what we have
                for route in ingress:
                    service = route.get("service", "").strip()  # Strip whitespace
                    hostname = route.get("hostname", "")
                    logger.info(f"[get_connection_type] Route #{ingress.index(route)}: hostname={hostname}, service='{service}'")
                    
                    service_lower = service.lower()
                    if service_lower.startswith("tcp://") and ":5986" in service_lower:
                        has_winrm_route = True
                        logger.info(f"[get_connection_type] ✓ Found WinRM route (tcp://:5986) for tunnel {tunnel_id}: {service}")
                    elif service_lower.startswith("ssh://") or (service_lower.startswith("tcp://") and ":22" in service_lower):
                        has_ssh_route = True
                        logger.info(f"[get_connection_type] ✓ Found SSH route for tunnel {tunnel_id}: {service}")
                
                # Prioritize WinRM if both exist
                if has_winrm_route:
                    logger.info(f"[get_connection_type] Returning 'winrm' (WinRM route found, prioritizing over SSH)")
                    return "winrm"
                elif has_ssh_route:
                    logger.info(f"[get_connection_type] Returning 'ssh' (SSH route found)")
                    return "ssh"
                
                logger.warning(f"[get_connection_type] ✗ No matching route found in {len(ingress)} routes for tunnel {tunnel_id}")
        except Exception as e:
            logger.warning(f"Error determining connection type from routes: {e}", exc_info=True)
        
        # Default to WinRM for backward compatibility
        logger.info(f"[get_connection_type] Using default connection type 'winrm' for tunnel {tunnel_id}")
        return "winrm"
    
    async def validate_tunnel_for_command(self, tunnel_id: str) -> tuple[str, dict, str]:
        """
        Validate tunnel is ready for command execution
        
        Args:
            tunnel_id: Tunnel ID
            
        Returns:
            (hostname, tunnel_info, connection_type): Hostname, tunnel information, and connection type
            
        Raises:
            TunnelConfigurationError: If hostname not configured
            TunnelNotFoundError: If tunnel not found
            TunnelOfflineError: If tunnel is not healthy
        """
        # Get connection type
        connection_type = await self.get_connection_type(tunnel_id)
        
        # Get tunnel info for status check
        cf_tunnel = await self.cloudflare_service.get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise TunnelNotFoundError(tunnel_id=tunnel_id)
        
        # Get hostname based on connection type (connection_type is already determined from ingress routes in get_connection_type)
        hostname = await self.get_tunnel_hostname(tunnel_id, connection_type)
        if not hostname:
            conn_name = "WinRM" if connection_type == "winrm" else "SSH"
            hostname_field = "Default Hostname for WinRM" if connection_type == "winrm" else "Default Hostname for SSH"
            raise TunnelConfigurationError(
                f"Default hostname for {conn_name} connection is not set. "
                f"Please go to Tunnel Routes (Config) and set the '{hostname_field}' field first."
            )
        
        # Check tunnel status
        
        tunnel_status = cf_tunnel.get("status", "down")
        if tunnel_status != "healthy":
            raise TunnelOfflineError(
                tunnel_id=tunnel_id,
                detail=f"Client is offline. Tunnel status: {tunnel_status}. Cannot execute command."
            )
        
        return hostname, cf_tunnel, connection_type
    
    def get_route_proxy_port(self, hostname: str, connection_type: str) -> int:
        """
        Get route proxy port for connection (WinRM port 5986 or SSH port 22)
        
        Args:
            hostname: Tunnel hostname
            connection_type: 'winrm' or 'ssh'
            
        Returns:
            local_port: Local port for connection
            
        Raises:
            RouteProxyNotRunningError: If route proxy is not running
        """
        target_port = 5986 if connection_type == "winrm" else 22
        route_key = f"{hostname}-{target_port}"
        
        # Check if route proxy exists and is running
        proxy_info = process_manager.get_route_proxy(route_key)
        if proxy_info:
            process = proxy_info["process"]
            if process.poll() is None:  # process is still running
                local_port = proxy_info["local_port"]
                logger.debug(f"Using existing route proxy. Port: {local_port}")
                return local_port
            else:
                # Process stopped, remove from dict
                process_manager.kill_route_proxy(route_key)
        
        # Also check for route proxies with same hostname and target_port
        all_proxies = process_manager.get_all_route_proxies()
        for key, proxy_info in all_proxies.items():
            if (proxy_info.get("hostname") == hostname and 
                proxy_info.get("target_port") == target_port):
                process = proxy_info["process"]
                if process.poll() is None:  # process is still running
                    local_port = proxy_info["local_port"]
                    logger.debug(f"Found route proxy with different key. Port: {local_port}")
                    return local_port
        
        # If no match found by hostname, try to find route proxy by target_port only
        # This handles cases where hostname from database doesn't match the hostname used when starting the proxy
        # Only use this fallback if there's exactly one running proxy for this target_port
        matching_by_port = []
        for key, proxy_info in all_proxies.items():
            if proxy_info.get("target_port") == target_port:
                process = proxy_info["process"]
                if process.poll() is None:  # process is still running
                    matching_by_port.append(proxy_info)
        
        if len(matching_by_port) == 1:
            # Exactly one route proxy for this port - use it
            proxy_info = matching_by_port[0]
            local_port = proxy_info["local_port"]
            logger.debug(f"Found route proxy by target_port only (hostname mismatch). Port: {local_port}, Stored hostname: {proxy_info.get('hostname')}")
            return local_port
        elif len(matching_by_port) > 1:
            # Multiple proxies for this port - can't determine which one to use
            logger.warning(f"Multiple route proxies found for target_port {target_port}, but hostname '{hostname}' doesn't match any of them")
        
        conn_name = "WinRM" if connection_type == "winrm" else "SSH"
        raise RouteProxyNotRunningError(
            proxy_id=route_key,
            detail=f"Route proxy for {conn_name} (port {target_port}) is not running. "
                   "Please start it manually from Route Proxies section first.",
            context={"hostname": hostname, "target_port": target_port}
        )
    
    def get_winrm_route_proxy_port(self, hostname: str) -> int:
        """
        Get route proxy port for WinRM (port 5986) - backward compatibility
        
        Args:
            hostname: Tunnel hostname
            
        Returns:
            local_port: Local port for WinRM connection
            
        Raises:
            RouteProxyNotRunningError: If route proxy is not running
        """
        return self.get_route_proxy_port(hostname, "winrm")
    
    async def execute_command(
        self,
        tunnel_id: str,
        command: str,
        use_powershell: bool = False,
        hostname: Optional[str] = None
    ) -> CommandResponse:
        """
        Execute command via WinRM or SSH
        
        Args:
            tunnel_id: Tunnel ID
            command: Command to execute
            use_powershell: Whether to use PowerShell execution (only for WinRM)
            
        Returns:
            CommandResponse with execution results
            
        Raises:
            TunnelConfigurationError: If hostname not configured
            TunnelNotFoundError: If tunnel not found
            TunnelOfflineError: If tunnel is not healthy
            RouteProxyNotRunningError: If route proxy is not running
        """
        # Validate tunnel and get connection type
        # Use provided hostname if available, otherwise get from validation
        if hostname:
            # Get connection type and tunnel info without hostname validation
            connection_type = await self.get_connection_type(tunnel_id)
            cf_tunnel = await self.cloudflare_service.get_tunnel(tunnel_id)
            if not cf_tunnel:
                raise TunnelNotFoundError(tunnel_id=tunnel_id)
            tunnel_info = cf_tunnel
            
            # Check tunnel status
            tunnel_status = cf_tunnel.get("status", "down")
            if tunnel_status != "healthy":
                raise TunnelOfflineError(
                    tunnel_id=tunnel_id,
                    detail=f"Client is offline. Tunnel status: {tunnel_status}. Cannot execute command."
                )
        else:
            hostname, tunnel_info, connection_type = await self.validate_tunnel_for_command(tunnel_id)
        
        logger.debug(f"Executing command via {connection_type.upper()} on tunnel {tunnel_id}: {command[:100]}")
        
        # Get route proxy port
        local_port = self.get_route_proxy_port(hostname, connection_type)
        
        # Execute command based on connection type
        if connection_type == "ssh":
            # Get SSH username from database (key path is fixed: /root/.ssh/id_ed25519)
            tunnel = await self.database.get_tunnel_by_id(tunnel_id)
            ssh_username = tunnel.get("ssh_username") if tunnel else None
            
            if not ssh_username:
                raise TunnelConfigurationError(
                    "SSH username is not configured. "
                    "Please go to Tunnel Routes (Config) and set the 'SSH Username' field."
                )
            
            # Use SSH Session Manager for persistent sessions
            # Get or create session
            DEFAULT_KEY_PATH = "/root/.ssh/id_ed25519"
            socket_path = await self.ssh_session_manager.get_or_create_session(
                tunnel_id=tunnel_id,
                hostname="localhost",
                port=local_port,
                username=ssh_username,
                key_path=DEFAULT_KEY_PATH
            )
            
            if not socket_path:
                raise TunnelConfigurationError(
                    "Failed to create or reuse SSH session. "
                    "Please check SSH connection settings."
                )
            
            # Execute command via session
            result = await self.ssh_session_manager.execute_command(
                tunnel_id=tunnel_id,
                command=command,
                use_powershell=use_powershell
            )
        else:
            # WinRM execution
            # Get WinRM credentials from database
            tunnel = await self.database.get_tunnel_by_id(tunnel_id)
            winrm_username = tunnel.get("winrm_username") if tunnel else None
            winrm_password = tunnel.get("winrm_password") if tunnel else None
            
            logger.debug(f"WinRM credentials for tunnel {tunnel_id}: username={winrm_username}, password={'***' if winrm_password else None}")
            
            # Create WinRM service with tunnel-specific credentials if available
            winrm_service = self.winrm_service
            if winrm_username or winrm_password:
                from api.services.winrm import WinRMService
                winrm_service = WinRMService(username=winrm_username, password=winrm_password)
                logger.debug(f"Using tunnel-specific WinRM credentials for tunnel {tunnel_id}")
            else:
                logger.debug(f"Using default WinRM credentials for tunnel {tunnel_id}")
            
            if use_powershell:
                result = await winrm_service.execute_powershell(
                    "localhost",
                    command,
                    port=local_port,
                    use_ssl=True
                )
            else:
                result = await winrm_service.execute_command(
                    "localhost",
                    command,
                    port=local_port,
                    use_ssl=True
                )
        
        # Ensure success is a boolean (handle cases where it might be empty string or missing)
        success = result.get("success", False)
        original_success = success
        
        if isinstance(success, str):
            # Convert string to boolean
            if success == "":
                logger.warning(f"Received empty string for success, defaulting to False. Result: {result}")
                success = False
            else:
                success = success.lower() in ("true", "1", "yes")
        elif success is None:
            success = False
        else:
            success = bool(success)
        
        if original_success != success:
            logger.debug(f"Converted success value from {original_success!r} (type: {type(original_success).__name__}) to {success} (type: {type(success).__name__})")
        
        logger.debug(f"Command execution {'succeeded' if success else 'failed'}")
        
        return CommandResponse(
            success=success,
            output=result.get("output"),
            error=result.get("error"),
            exit_code=result.get("exit_code")
        )
    
    async def test_winrm(self, tunnel_id: str, hostname: Optional[str] = None, username: Optional[str] = None, password: Optional[str] = None) -> dict:
        """
        Test WinRM connection

        Args:
            tunnel_id: Tunnel ID
            hostname: Optional custom hostname (if not provided, uses default from database)
            username: Optional custom username (if not provided, uses default from config)
            password: Optional custom password (if not provided, uses default from config)

        Returns:
            dict with test results
        """
        try:
            # Check tunnel status first
            cf_tunnel = await self.cloudflare_service.get_tunnel(tunnel_id)
            if not cf_tunnel:
                return {
                    "success": False,
                    "tunnel_status": "not_found",
                    "winrm_status": "unknown",
                    "message": f"Tunnel {tunnel_id} not found"
                }

            tunnel_status = cf_tunnel.get("status", "down")
            if tunnel_status != "healthy":
                return {
                    "success": False,
                    "tunnel_status": tunnel_status,
                    "winrm_status": "unknown",
                    "message": f"Client is offline. Tunnel status: {tunnel_status}. Cannot execute command."
                }

            # Use provided hostname, or try to find from Cloudflare config, active route proxy, or database
            if not hostname:
                # First, try to get hostname from Cloudflare config routes (most reliable source)
                # This is the hostname that was used when starting the route proxy
                try:
                    config = await self.cloudflare_service.get_tunnel_config(tunnel_id)
                    if config:
                        ingress = config.get("config", {}).get("ingress", [])
                        for route in ingress:
                            if not route.get("hostname"):
                                continue
                            service = route.get("service", "")
                            # Check if it's a TCP service with port 5986 (WinRM)
                            if service.startswith("tcp://") and ":5986" in service:
                                hostname = route["hostname"]
                                logger.debug(f"Using hostname from Cloudflare config: {hostname}")
                                break
                except Exception as e:
                    logger.debug(f"Error getting hostname from Cloudflare config: {e}")
                
                # If still no hostname, try to find from active route proxy for WinRM (port 5986)
                if not hostname:
                    target_port = 5986
                    all_proxies = process_manager.get_all_route_proxies()
                    active_proxy = None
                    for key, proxy_info in all_proxies.items():
                        if proxy_info.get("target_port") == target_port:
                            process = proxy_info.get("process")
                            if process and process.poll() is None:  # process is still running
                                active_proxy = proxy_info
                                break
                    
                    if active_proxy:
                        hostname = active_proxy.get("hostname")
                        logger.debug(f"Using hostname from active route proxy: {hostname}")
                
                # If still no hostname, get from database
                if not hostname:
                    hostname = await self.get_tunnel_hostname(tunnel_id, "winrm")
            
            if not hostname:
                return {
                    "success": False,
                    "tunnel_status": "unknown",
                    "winrm_status": "configuration_error",
                    "message": "Default hostname for WinRM connection is not set. Please set it in Tunnel Routes (Config)."
                }

            local_port = self.get_route_proxy_port(hostname, "winrm")

            # Create WinRM service with custom credentials if provided
            winrm_service = self.winrm_service
            if username or password:
                from api.services.winrm import WinRMService
                winrm_service = WinRMService(username=username, password=password)

            # Test WinRM connection
            test_result = await winrm_service.execute_command(
                "localhost",
                "whoami",
                port=local_port,
                use_ssl=True
            )

            if test_result["success"]:
                return {
                    "success": True,
                    "tunnel_status": cf_tunnel.get("status", "unknown"),
                    "winrm_status": "working",
                    "cloudflare_port": local_port,
                    "message": "WinRM is working correctly"
                }
            else:
                return {
                    "success": False,
                    "tunnel_status": cf_tunnel.get("status", "unknown"),
                    "winrm_status": "failed",
                    "message": test_result.get("error", "WinRM test failed")
                }
        except TunnelConfigurationError as e:
            return {
                "success": False,
                "tunnel_status": "unknown",
                "winrm_status": "unknown",
                "message": e.detail
            }
        except TunnelNotFoundError as e:
            return {
                "success": False,
                "tunnel_status": "not_found",
                "winrm_status": "unknown",
                "message": e.detail
            }
        except TunnelOfflineError as e:
            return {
                "success": False,
                "tunnel_status": "unknown",
                "winrm_status": "unknown",
                "message": e.detail
            }
        except RouteProxyNotRunningError as e:
            return {
                "success": False,
                "tunnel_status": "unknown",
                "winrm_status": "unknown",
                "message": e.detail
            }
        except Exception as e:
            logger.exception(f"Error testing WinRM for tunnel {tunnel_id}: {e}")
            return {
                "success": False,
                "tunnel_status": "unknown",
                "winrm_status": "unknown",
                "message": f"Error testing WinRM: {str(e)}"
            }
    
    async def test_ssh(self, tunnel_id: str, hostname: Optional[str] = None, username: Optional[str] = None) -> dict:
        """
        Test SSH connection

        Args:
            tunnel_id: Tunnel ID
            hostname: Optional custom hostname (if not provided, uses default from database)
            username: Optional custom username (if not provided, uses default from database)

        Returns:
            dict with test results
        """
        try:
            # Check tunnel status first
            cf_tunnel = await self.cloudflare_service.get_tunnel(tunnel_id)
            if not cf_tunnel:
                return {
                    "success": False,
                    "tunnel_status": "not_found",
                    "ssh_status": "unknown",
                    "message": f"Tunnel {tunnel_id} not found"
                }

            tunnel_status = cf_tunnel.get("status", "down")
            if tunnel_status != "healthy":
                return {
                    "success": False,
                    "tunnel_status": tunnel_status,
                    "ssh_status": "unknown",
                    "message": f"Client is offline. Tunnel status: {tunnel_status}. Cannot execute command."
                }

            # Use provided hostname, or try to find from Cloudflare config, active route proxy, or database
            if not hostname:
                # First, try to get hostname from Cloudflare config routes (most reliable source)
                # This is the hostname that was used when starting the route proxy
                try:
                    config = await self.cloudflare_service.get_tunnel_config(tunnel_id)
                    if config:
                        ingress = config.get("config", {}).get("ingress", [])
                        for route in ingress:
                            if not route.get("hostname"):
                                continue
                            service = route.get("service", "")
                            # Check if it's an SSH service (ssh://) or TCP service with port 22
                            if service.startswith("ssh://") or (service.startswith("tcp://") and ":22" in service):
                                hostname = route["hostname"]
                                logger.debug(f"Using hostname from Cloudflare config for SSH: {hostname}")
                                break
                except Exception as e:
                    logger.debug(f"Error getting hostname from Cloudflare config: {e}")
                
                # If still no hostname, try to find from active route proxy for SSH (port 22)
                if not hostname:
                    target_port = 22
                    all_proxies = process_manager.get_all_route_proxies()
                    active_proxy = None
                    for key, proxy_info in all_proxies.items():
                        if proxy_info.get("target_port") == target_port:
                            process = proxy_info.get("process")
                            if process and process.poll() is None:  # process is still running
                                active_proxy = proxy_info
                                break
                    
                    if active_proxy:
                        hostname = active_proxy.get("hostname")
                        logger.debug(f"Using hostname from active route proxy for SSH: {hostname}")
                
                # If still no hostname, get from database
                if not hostname:
                    hostname = await self.get_tunnel_hostname(tunnel_id, "ssh")
            
            if not hostname:
                return {
                    "success": False,
                    "tunnel_status": "unknown",
                    "ssh_status": "configuration_error",
                    "message": "Default hostname for SSH connection is not set. Please set it in Tunnel Routes (Config)."
                }

            local_port = self.get_route_proxy_port(hostname, "ssh")
            
            # Use provided username or get from database (key path is fixed: /root/.ssh/id_ed25519)
            if not username:
                tunnel = await self.database.get_tunnel_by_id(tunnel_id)
                username = tunnel.get("ssh_username") if tunnel else None
            
            if not username:
                return {
                    "success": False,
                    "tunnel_status": cf_tunnel.get("status", "unknown"),
                    "ssh_status": "configuration_error",
                    "message": "SSH username is not configured. Please set it in Tunnel Routes (Config)."
                }
            
            # Use SSH Session Manager to test connection
            # This will reuse existing session if available, or create new one if needed
            DEFAULT_KEY_PATH = "/root/.ssh/id_ed25519"
            
            # Get or create session (will reuse if exists)
            socket_path = await self.ssh_session_manager.get_or_create_session(
                tunnel_id=tunnel_id,
                hostname="localhost",
                port=local_port,
                username=username,
                key_path=DEFAULT_KEY_PATH
            )
            
            if not socket_path:
                return {
                    "success": False,
                    "tunnel_status": cf_tunnel.get("status", "unknown"),
                    "ssh_status": "failed",
                    "message": "Failed to create or reuse SSH session. Please check SSH connection settings."
                }
            
            # Test SSH connection using existing session
            test_result = await self.ssh_session_manager.execute_command(
                tunnel_id=tunnel_id,
                command="echo 'SSH connection test successful'",
                use_powershell=False
            )
            
            # Verify session still exists after test
            session_info = await self.ssh_session_manager.get_session_info(tunnel_id)
            logger.debug(f"Session info after test_ssh for tunnel {tunnel_id}: {session_info}")
            
            if test_result["success"]:
                return {
                    "success": True,
                    "tunnel_status": cf_tunnel.get("status", "unknown"),
                    "ssh_status": "working",
                    "cloudflare_port": local_port,
                    "message": "SSH is working correctly",
                    "session_exists": session_info is not None if session_info else False
                }
            else:
                # Debug logging for SSH errors
                logger.error(f"SSH test failed. Result: {test_result}")
                error_msg = test_result.get("error", "SSH test failed")
                logger.error(f"SSH error message: {error_msg}")

                return {
                    "success": False,
                    "tunnel_status": cf_tunnel.get("status", "unknown"),
                    "ssh_status": "failed",
                    "message": error_msg,
                    "debug_info": {
                        "exit_code": test_result.get("exit_code"),
                        "output": test_result.get("output"),
                        "error_raw": test_result.get("error")
                    }
                }
        except TunnelConfigurationError as e:
            return {
                "success": False,
                "tunnel_status": "unknown",
                "ssh_status": "unknown",
                "message": e.detail
            }
        except TunnelNotFoundError as e:
            return {
                "success": False,
                "tunnel_status": "not_found",
                "ssh_status": "unknown",
                "message": e.detail
            }
        except TunnelOfflineError as e:
            return {
                "success": False,
                "tunnel_status": "unknown",
                "ssh_status": "unknown",
                "message": e.detail
            }
        except RouteProxyNotRunningError as e:
            return {
                "success": False,
                "tunnel_status": "unknown",
                "ssh_status": "unknown",
                "message": e.detail
            }
        except Exception as e:
            logger.exception(f"Error testing SSH for tunnel {tunnel_id}: {e}")
            return {
                "success": False,
                "tunnel_status": "unknown",
                "ssh_status": "unknown",
                "message": f"Error testing SSH: {str(e)}"
            }


