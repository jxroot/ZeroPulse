"""
VNC Server Check Module
Checks if VNC Server is installed and running on Windows systems via WinRM
"""
from api.services.winrm import WinRMService
from api.services.command_executor import CommandExecutor
from api.utils.logger import logger

winrm_service = WinRMService()


async def check_vnc_server_on_windows(tunnel_id: str, command_executor: CommandExecutor) -> dict:
    """
    Check if VNC Server is installed and running on Windows system
    
    Args:
        tunnel_id: Tunnel ID
        command_executor: CommandExecutor instance
        
    Returns:
        dict with keys: installed, running, error, message, is_windows
    """
    try:
        # Get tunnel hostname for WinRM connection
        hostname, _, _ = await command_executor.validate_tunnel_for_command(tunnel_id)
        local_port = command_executor.get_winrm_route_proxy_port(hostname)
        
        # First, try a simple PowerShell command to check if WinRM is working
        # If it fails, likely Linux system
        test_cmd = 'Write-Output "TEST"'
        test_result = await winrm_service.execute_powershell("localhost", test_cmd, port=local_port, use_ssl=True)
        
        # If WinRM test fails, likely Linux system
        # Check if output is exactly "TEST" (Windows PowerShell should return this)
        output = test_result.get("output", "").strip() if test_result.get("output") else ""
        is_test_successful = test_result.get("success") and output == "TEST"
        
        if not is_test_successful:
            logger.info(f"WinRM test failed for tunnel {tunnel_id}, likely Linux system. Success: {test_result.get('success')}, Output: '{output}', Error: {test_result.get('error')}")
            return {
                "installed": None,  # Unknown - system might be Linux
                "running": False,
                "error": "not_windows",
                "message": "This tunnel appears to be connected to a Linux system. VNC Server check is only available for Windows systems.",
                "is_windows": False
            }
        
        # Check if VNC Server is installed by checking common VNC services and ports
        # Try multiple methods:
        # 1. Check if VNC service is running
        # 2. Check if VNC port (5900) is listening
        # 3. Check if VNC processes are running
        # 4. Check if VNC is installed in Program Files
        
        # Method 1: Check VNC service
        check_service_cmd = '$services = Get-Service | Where-Object {$_.DisplayName -like "*VNC*" -or $_.Name -like "*vnc*" -or $_.DisplayName -like "*TightVNC*" -or $_.DisplayName -like "*RealVNC*" -or $_.DisplayName -like "*UltraVNC*"} | Select-Object -First 1; if ($services) { Write-Output "FOUND" } else { Write-Output "NOT_FOUND" }'
        service_result = await winrm_service.execute_powershell("localhost", check_service_cmd, port=local_port, use_ssl=True)
        
        if service_result.get("success") and service_result.get("output"):
            output = service_result.get("output", "").strip().upper()
            if "FOUND" in output:
                # VNC service found
                logger.info("VNC service found on Windows")
                return {
                    "installed": True,
                    "running": True,
                    "error": None,
                    "message": "VNC Server is installed and running",
                    "is_windows": True
                }
        
        # Method 2: Check if VNC port (5900) is listening
        check_port_cmd = 'Test-NetConnection -ComputerName localhost -Port 5900 -InformationLevel Quiet -WarningAction SilentlyContinue'
        port_result = await winrm_service.execute_powershell("localhost", check_port_cmd, port=local_port, use_ssl=True)
        
        if port_result.get("success") and port_result.get("output"):
            output = port_result.get("output", "").strip().lower()
            if output == "true":
                # Port 5900 is listening - VNC Server is likely running
                logger.info("VNC port 5900 is listening on Windows")
                return {
                    "installed": True,
                    "running": True,
                    "error": None,
                    "message": "VNC Server port is listening",
                    "is_windows": True
                }
        
        # Method 3: Check if VNC processes are running
        check_process_cmd = '$processes = Get-Process | Where-Object {$_.ProcessName -like "*vnc*" -or $_.ProcessName -like "*tightvnc*" -or $_.ProcessName -like "*realvnc*" -or $_.ProcessName -like "*ultravnc*"} | Select-Object -First 1; if ($processes) { Write-Output "FOUND" } else { Write-Output "NOT_FOUND" }'
        process_result = await winrm_service.execute_powershell("localhost", check_process_cmd, port=local_port, use_ssl=True)
        
        if process_result.get("success") and process_result.get("output"):
            output = process_result.get("output", "").strip().upper()
            if "FOUND" in output:
                # VNC process found
                logger.info("VNC process found on Windows")
                return {
                    "installed": True,
                    "running": True,
                    "error": None,
                    "message": "VNC Server process is running",
                    "is_windows": True
                }
        
        # Method 4: Check if VNC is installed in Program Files
        check_installed_cmd = '$paths = @("C:\\Program Files\\TightVNC", "C:\\Program Files\\RealVNC", "C:\\Program Files (x86)\\TightVNC", "C:\\Program Files (x86)\\RealVNC", "C:\\Program Files\\UltraVNC"); $found = $false; foreach ($path in $paths) { if (Test-Path $path -ErrorAction SilentlyContinue) { $found = $true; break } }; if ($found) { Write-Output "True" } else { Write-Output "False" }'
        installed_result = await winrm_service.execute_powershell("localhost", check_installed_cmd, port=local_port, use_ssl=True)
        
        if installed_result.get("success") and installed_result.get("output"):
            output = installed_result.get("output", "").strip().lower()
            # Check if output contains "True"
            if "true" in output:
                # VNC is installed but might not be running
                logger.info("VNC Server is installed on Windows but not running")
                return {
                    "installed": True,
                    "running": False,
                    "error": "vnc_not_running",
                    "message": "VNC Server is installed but not running. Please start VNC Server service.",
                    "is_windows": True
                }
        
        # VNC Server not found
        logger.warning("VNC Server not found on Windows system")
        return {
            "installed": False,
            "running": False,
            "error": "vnc_not_installed",
            "message": "VNC Server is not installed on the Windows system. Please install a VNC Server (TightVNC, RealVNC, or UltraVNC) first.",
            "is_windows": True
        }
        
    except Exception as e:
        # Check if error is related to WinRM connection failure (likely Linux system)
        error_str = str(e).lower()
        if "winrm" in error_str or "connection" in error_str or "route proxy" in error_str:
            logger.info(f"WinRM connection failed for tunnel {tunnel_id}, likely Linux system")
            return {
                "installed": None,  # Unknown - system might be Linux
                "running": False,
                "error": "not_windows",
                "message": "This tunnel appears to be connected to a Linux system. VNC Server check is only available for Windows systems.",
                "is_windows": False
            }
        
        logger.exception(f"Error checking VNC Server on Windows: {e}")
        return {
            "installed": False,
            "running": False,
            "error": "check_failed",
            "message": f"Failed to check VNC Server status: {str(e)}",
            "is_windows": True  # Assume Windows if error is not connection-related
        }

