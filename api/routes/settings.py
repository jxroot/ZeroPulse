from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import PlainTextResponse
from api.dependencies import get_current_user
from api.services.database import Database
from api.services.process_manager import process_manager
from api.services.auth import create_access_token
from api.utils.logger import logger, LOG_FILE
from api.utils.exceptions import exception_to_http
from api.utils.env import get_env, get_env_int
from typing import List, Dict, Optional

# Environment variables
WINRM_USERNAME = get_env("WINRM_USERNAME", "WinRMUser")
WINRM_PASSWORD = get_env("WINRM_PASSWORD", "")
from pydantic import BaseModel
import shutil
import subprocess
import os
import uuid
import hashlib
import re
from datetime import datetime, timedelta
from pathlib import Path

router = APIRouter(prefix="/api/settings", tags=["settings"])

db = Database()

# Agent script paths
AGENT_SCRIPT_PATH = Path(__file__).parent.parent.parent / "agent" / "client.ps1"
AGENT_SCRIPT_SSH_PATH = Path(__file__).parent.parent.parent / "agent" / "client-ssh.ps1"


# ==================== Modules ====================

@router.get("/modules")
async def get_modules(current_user: dict = Depends(get_current_user)):
    """Get all PowerShell modules"""
    try:
        # Get current user ID (no permission check needed for single user system)
        
        modules = await db.get_modules()
        return {"success": True, "modules": modules}
    except Exception as e:
        logger.exception(f"Error getting modules: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting modules: {str(e)}")


@router.post("/modules")
async def create_module(module_data: dict, current_user: dict = Depends(get_current_user)):
    """Create a new PowerShell module"""
    try:
        # Get current user ID (no permission check needed for single user system)
        
        if not module_data.get("name") or not module_data.get("script"):
            raise HTTPException(status_code=400, detail="name and script are required")
        
        # Check if module with same name exists
        if await db.get_module_by_name(module_data["name"]):
            raise HTTPException(status_code=400, detail=f"Module with name '{module_data['name']}' already exists")
        
        new_module = {
            "id": str(uuid.uuid4()),
            "name": module_data["name"],
            "description": module_data.get("description", ""),
            "script": module_data["script"],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        if await db.add_module(new_module):
            logger.info(f"Module '{new_module['name']}' created successfully")
            return {"success": True, "module": new_module}
        else:
            raise HTTPException(status_code=500, detail="Failed to create module")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating module: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating module: {str(e)}")


@router.put("/modules/{module_id}")
async def update_module(module_id: str, module_data: dict, current_user: dict = Depends(get_current_user)):
    """Update a PowerShell module"""
    try:
        # Get current user ID (no permission check needed for single user system)
        
        module = await db.get_module_by_id(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        
        # Check if name is being changed and conflicts with another module
        if module_data.get("name") and module_data["name"] != module["name"]:
            existing = await db.get_module_by_name(module_data["name"])
            if existing and existing["id"] != module_id:
                raise HTTPException(status_code=400, detail=f"Module with name '{module_data['name']}' already exists")
        
        # Update module
        updates = {}
        if "name" in module_data:
            updates["name"] = module_data["name"]
        if "description" in module_data:
            updates["description"] = module_data.get("description", "")
        if "script" in module_data:
            updates["script"] = module_data["script"]
        
        if await db.update_module(module_id, updates):
            updated_module = await db.get_module_by_id(module_id)
            logger.info(f"Module '{updated_module['name']}' updated successfully")
            return {"success": True, "module": updated_module}
        else:
            raise HTTPException(status_code=500, detail="Failed to update module")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating module: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating module: {str(e)}")


@router.delete("/modules/{module_id}")
async def delete_module(module_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a PowerShell module"""
    try:
        # Get current user ID (no permission check needed for single user system)
        
        module = await db.get_module_by_id(module_id)
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        
        if await db.delete_module(module_id):
            logger.info(f"Module '{module['name']}' deleted successfully")
            return {"success": True, "message": f"Module '{module['name']}' deleted"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete module")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting module: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting module: {str(e)}")


@router.post("/modules/{module_id}/execute")
async def execute_module(module_id: str, request_data: dict, current_user: dict = Depends(get_current_user)):
    """Execute a PowerShell module on a tunnel"""
    try:
        # Check permission
        current_user_id = current_user.get("user_id")
        if not current_user_id:
            from api.services.database import Database
            db_instance = Database()
            user = db_instance.get_user_by_username(current_user.get("username"))
            current_user_id = user.get("id") if user else None
        
        # No permission check needed for single user system
        
        tunnel_id = request_data.get("tunnel_id")
        if not tunnel_id:
            raise HTTPException(status_code=400, detail="tunnel_id is required")
        
        # Get module
        data = db._read_db()
        modules = data.get("modules", [])
        module = next((m for m in modules if m.get("id") == module_id), None)
        
        if not module:
            raise HTTPException(status_code=404, detail="Module not found")
        
        # Import command executor
        from api.services.command_executor import CommandExecutor
        from api.services.winrm import WinRMService
        from api.services.ssh import SSHService
        from api.services.cloudflare import CloudflareService
        import os
        from pathlib import Path
        
        # Get CloudflareService with fresh credentials from environment
        try:
            from dotenv import load_dotenv
            env_path = Path(__file__).parent.parent.parent / '.env'
            if env_path.exists():
                load_dotenv(env_path, override=True)
        except ImportError:
            pass
        
        api_token = get_env("CLOUDFLARE_API_TOKEN", "")
        account_id = get_env("CLOUDFLARE_ACCOUNT_ID", "")
        domain = get_env("CLOUDFLARE_DOMAIN", "")
        
        winrm_service = WinRMService()
        ssh_service = SSHService()
        cloudflare_service = CloudflareService(api_token, account_id, domain)
        # Import shared SSH session manager from command_execution module
        from api.routes.command_execution import ssh_session_manager
        command_executor = CommandExecutor(winrm_service, ssh_service, cloudflare_service, db, ssh_session_manager)
        
        # Get script (use custom script if provided, otherwise use module script)
        script = request_data.get("script", module["script"])
        
        # Get use_powershell flag (default to True for PowerShell modules)
        use_powershell = request_data.get("use_powershell", True)
        
        # Execute module script
        result = await command_executor.execute_command(tunnel_id, script, use_powershell=use_powershell)
        
        # Save command to history
        command_data_dict = {
            "id": str(uuid.uuid4()),
            "tunnel_id": tunnel_id,
            "agent_id": None,
            "command": f"[Module: {module['name']}]\n{script}",
            "output": result.output or "",
            "error": result.error or "",
            "success": result.success,
            "exit_code": result.exit_code,
            "timestamp": datetime.now().isoformat()
        }
        await db.add_command(command_data_dict)
        
        logger.info(f"Module '{module['name']}' executed on tunnel {tunnel_id}")
        return {
            "success": result.success,
            "output": result.output,
            "error": result.error,
            "exit_code": result.exit_code
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error executing module: {e}")
        raise HTTPException(status_code=500, detail=f"Error executing module: {str(e)}")


# ==================== Dependencies ====================

def check_cloudflared() -> Dict:
    """Check if cloudflared is installed"""
    try:
        path = process_manager.find_cloudflared_path()
        # Try to get version
        try:
            result = subprocess.run(
                [path, "version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            version = result.stdout.strip() if result.stdout else "Unknown"
        except:
            version = "Installed"
        
        return {
            "name": "cloudflared",
            "description": "Cloudflare Tunnel daemon for creating secure connections",
            "installed": True,
            "version": version,
            "path": path
        }
    except Exception as e:
        return {
            "name": "cloudflared",
            "description": "Cloudflare Tunnel daemon for creating secure connections",
            "installed": False,
            "install_command": "Visit https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/",
            "error": str(e)
        }


def check_novnc() -> Dict:
    """Check if novnc is installed"""
    try:
        # First check if it's installed via snap
        try:
            result = subprocess.run(
                ["snap", "list", "novnc"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout:
                # Parse output to get version
                # Format: Name   Version  Rev  Tracking       Publisher  Notes
                #         novnc  1.6.0    141  latest/stable  ossman     -
                lines = result.stdout.strip().split('\n')
                if len(lines) >= 2:
                    # Skip header line, get data line
                    data_line = lines[1].strip()
                    # Split by whitespace and get version (second column)
                    parts = data_line.split()
                    if len(parts) >= 2:
                        version = parts[1]  # Version is the second column
                        return {
                            "name": "novnc",
                            "description": "noVNC - VNC client",
                            "installed": True,
                            "version": version,
                            "path": "/snap/bin/novnc",
                            "install_method": "snap"
                        }
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
            pass
        
        # Fallback: check if binary exists
        path = shutil.which("novnc")
        if not path:
            # Try common paths
            common_paths = [
                "/snap/bin/novnc",
                "/usr/bin/novnc",
                "/usr/local/bin/novnc"
            ]
            for p in common_paths:
                if os.path.exists(p):
                    path = p
                    break
        
        if path:
            # If found via path but not snap, version is unknown
            return {
                "name": "novnc",
                "description": "noVNC - HTML5 VNC client",
                "installed": True,
                "version": "Installed",
                "path": path
            }
        else:
            return {
                "name": "novnc",
                "description": "noVNC - HTML5 VNC client",
                "installed": False,
                "install_command": "sudo snap install novnc"
            }
    except Exception as e:
        return {
            "name": "novnc",
            "description": "noVNC - HTML5 VNC client",
            "installed": False,
            "install_command": "sudo snap install novnc",
            "error": str(e)
        }


def check_ttyd() -> Dict:
    """Check if ttyd is installed"""
    try:
        # Check if binary exists
        path = shutil.which("ttyd")
        if not path:
            # Try common paths
            common_paths = [
                "/usr/local/bin/ttyd",
                "/usr/bin/ttyd"
            ]
            for p in common_paths:
                if os.path.exists(p):
                    path = p
                    break
        
        if path:
            # Try to get version
            try:
                result = subprocess.run(
                    [path, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0 and result.stdout:
                    version = result.stdout.strip()
                    # Extract version number if possible
                    version_match = re.search(r'(\d+\.\d+\.\d+)', version)
                    if version_match:
                        version = version_match.group(1)
                else:
                    version = "Installed"
            except:
                version = "Installed"
            
            return {
                "name": "ttyd",
                "description": "ttyd - Share your terminal over the web",
                "installed": True,
                "version": version,
                "path": path
            }
        else:
            return {
                "name": "ttyd",
                "description": "ttyd - Share your terminal over the web",
                "installed": False,
                "install_command": "sudo apt-get install ttyd"
            }
    except Exception as e:
        return {
            "name": "ttyd",
            "description": "ttyd - Share your terminal over the web",
            "installed": False,
            "install_command": "sudo apt-get install ttyd",
            "error": str(e)
        }


def check_evilwinrm() -> Dict:
    """Check if evil-winrm is installed"""
    try:
        # First check if Ruby is installed
        ruby_path = shutil.which("ruby")
        if not ruby_path:
            # Try common paths
            common_ruby_paths = [
                "/usr/bin/ruby",
                "/usr/local/bin/ruby",
                "/snap/bin/ruby"
            ]
            for p in common_ruby_paths:
                if os.path.exists(p):
                    ruby_path = p
                    break
        
        if not ruby_path:
            return {
                "name": "evil-winrm",
                "description": "evil-winrm - WinRM shell for pentesting",
                "installed": False,
                "install_command": "sudo snap install ruby --classic && gem install evil-winrm",
                "error": "Ruby is not installed"
            }
        
        # First, try to find executable in PATH
        executable_path = shutil.which("evil-winrm")
        
        # If not in PATH, try to find it in gem bindir
        if not executable_path:
            try:
                bindir_result = subprocess.run(
                    ["ruby", "-e", "print Gem.bindir"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if bindir_result.returncode == 0 and bindir_result.stdout:
                    gem_bindir = bindir_result.stdout.strip()
                    potential_path = os.path.join(gem_bindir, "evil-winrm")
                    if os.path.exists(potential_path) and os.access(potential_path, os.X_OK):
                        executable_path = potential_path
            except Exception:
                pass
        
        # If executable found, test if it actually works
        if executable_path:
            try:
                # Test if executable actually works by running --version or -h
                test_result = subprocess.run(
                    [executable_path, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                # If command executed successfully (even if it shows help/version), it's installed
                if test_result.returncode == 0 or test_result.stdout or test_result.stderr:
                    # Try to extract version from output
                    version = "Installed"
                    if test_result.stdout:
                        version_match = re.search(r'(\d+\.\d+(?:\.\d+)?)', test_result.stdout)
                        if version_match:
                            version = version_match.group(1)
                    elif test_result.stderr:
                        version_match = re.search(r'(\d+\.\d+(?:\.\d+)?)', test_result.stderr)
                        if version_match:
                            version = version_match.group(1)
                    
                    return {
                        "name": "evil-winrm",
                        "description": "evil-winrm - WinRM shell for pentesting",
                        "installed": True,
                        "version": version,
                        "path": executable_path
                    }
            except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
                # Executable exists but doesn't work, consider it not installed
                pass
        
        # If we reach here, executable is not found or doesn't work
        # Check if gem is installed to provide better error message
        try:
            gem_result = subprocess.run(
                ["gem", "list", "evil-winrm"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if gem_result.returncode == 0 and gem_result.stdout and "evil-winrm" in gem_result.stdout:
                # Gem is installed but executable doesn't work
                return {
                    "name": "evil-winrm",
                    "description": "evil-winrm - WinRM shell for pentesting",
                    "installed": False,
                    "install_command": "gem install evil-winrm",
                    "error": "Gem is installed but executable is not accessible. Check PATH or reinstall."
                }
        except Exception:
            pass
        
        return {
            "name": "evil-winrm",
            "description": "evil-winrm - WinRM shell for pentesting",
            "installed": False,
            "install_command": "sudo snap install ruby --classic && gem install evil-winrm",
            "error": "evil-winrm is not installed or not accessible"
        }
    except Exception as e:
        return {
            "name": "evil-winrm",
            "description": "evil-winrm - WinRM shell for pentesting",
            "installed": False,
            "install_command": "sudo snap install ruby --classic && gem install evil-winrm",
            "error": str(e)
        }


@router.get("/dependencies")
async def get_dependencies(current_user: dict = Depends(get_current_user)):
    """Check system dependencies"""
    try:
        dependencies = []
        
        # Check cloudflared
        dependencies.append(check_cloudflared())
        
        # Check novnc
        dependencies.append(check_novnc())
        
        # Check ttyd
        dependencies.append(check_ttyd())
        
        # Check evil-winrm
        dependencies.append(check_evilwinrm())
        
        return {
            "success": True,
            "dependencies": dependencies
        }
    except Exception as e:
        logger.exception(f"Error checking dependencies: {e}")
        raise HTTPException(status_code=500, detail=f"Error checking dependencies: {str(e)}")


@router.post("/dependencies/{dependency_name}/uninstall")
async def uninstall_dependency(dependency_name: str, current_user: dict = Depends(get_current_user)):
    """Uninstall a dependency"""
    try:
        if dependency_name == "cloudflared":
            # Try to uninstall cloudflared
            # On Linux, it might be installed via snap, apt, or manually
            uninstall_commands = []
            
            # Check if it's a snap package
            try:
                result = subprocess.run(
                    ["snap", "list", "cloudflared"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    uninstall_commands.append("sudo snap remove cloudflared")
            except:
                pass
            
            # Check if it's installed via apt
            try:
                result = subprocess.run(
                    ["dpkg", "-l", "cloudflared"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    uninstall_commands.append("sudo apt remove cloudflared")
            except:
                pass
            
            if uninstall_commands:
                return {
                    "success": True,
                    "message": f"To uninstall cloudflared, run: {uninstall_commands[0]}",
                    "command": uninstall_commands[0],
                    "note": "Please run this command manually in your terminal"
                }
            else:
                return {
                    "success": False,
                    "message": "cloudflared installation method not detected. Please uninstall manually.",
                    "note": "If installed manually, delete the cloudflared binary from your system PATH"
                }
        
        elif dependency_name == "novnc":
            # Try to uninstall novnc
            # Usually installed via snap
            try:
                result = subprocess.run(
                    ["snap", "list", "novnc"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return {
                        "success": True,
                        "message": "To uninstall novnc, run: sudo snap remove novnc",
                        "command": "sudo snap remove novnc",
                        "note": "Please run this command manually in your terminal"
                    }
            except:
                pass
            
            return {
                "success": False,
                "message": "novnc installation method not detected. Please uninstall manually.",
                "note": "If installed via snap: sudo snap remove novnc"
            }
        elif dependency_name == "ttyd":
            # Try to uninstall ttyd
            # Check if installed via apt
            try:
                result = subprocess.run(
                    ["dpkg", "-l", "ttyd"],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0 and "ttyd" in result.stdout:
                    return {
                        "success": True,
                        "message": "To uninstall ttyd, run: sudo apt-get remove -y ttyd",
                        "command": "sudo apt-get remove -y ttyd",
                        "note": "Please run this command manually in your terminal"
                    }
            except:
                pass
            
            return {
                "success": False,
                "message": "ttyd installation method not detected. Please uninstall manually.",
                "note": "If installed via apt: sudo apt-get remove -y ttyd"
            }
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown dependency: {dependency_name}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting uninstall info for {dependency_name}: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting uninstall info: {str(e)}")


# ==================== System Log ====================

@router.get("/system_log")
async def get_system_log(current_user: dict = Depends(get_current_user)):
    """Get system log content"""
    try:
        if not LOG_FILE.exists():
            return {
                "success": True,
                "log": "",
                "message": "Log file not found"
            }
        
        # Read last 10000 lines to avoid loading too much data
        try:
            with open(LOG_FILE, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
                # Get last 10000 lines
                if len(lines) > 10000:
                    lines = lines[-10000:]
                content = ''.join(lines)
        except Exception as e:
            logger.exception(f"Error reading log file: {e}")
            return {
                "success": False,
                "log": "",
                "message": f"Error reading log file: {str(e)}"
            }
        
        return {
            "success": True,
            "log": content,
            "lines": len(lines)
        }
    except Exception as e:
        logger.exception(f"Error getting system log: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting system log: {str(e)}")


@router.delete("/system_log")
async def clear_system_log(current_user: dict = Depends(get_current_user)):
    """Clear system log content"""
    try:
        if not LOG_FILE.exists():
            return {
                "success": True,
                "message": "Log file not found"
            }
        
        # Clear log file by opening in write mode and truncating
        with open(LOG_FILE, 'w', encoding='utf-8') as f:
            f.write('')
        
        logger.info(f"System log cleared by {current_user.get('username')}")
        
        return {
            "success": True,
            "message": "System log cleared successfully"
        }
    except Exception as e:
        logger.exception(f"Error clearing system log: {e}")
        raise HTTPException(status_code=500, detail=f"Error clearing system log: {str(e)}")


# ==================== API Documentation ====================

@router.get("/api_endpoints")
async def get_api_endpoints(current_user: dict = Depends(get_current_user)):
    """Get list of all API endpoints with their parameters"""
    try:
        # Import here to avoid circular import
        from api.main import app
        
        endpoints = []
        
        # Get OpenAPI schema
        openapi_schema = app.openapi()
        paths = openapi_schema.get('paths', {})
        
        for path, methods in paths.items():
            # Skip static files and docs
            if path.startswith('/static') or path.startswith('/assets') or path.startswith('/docs') or path.startswith('/redoc') or path.startswith('/openapi.json'):
                continue
            
            for method, details in methods.items():
                if method.upper() in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']:
                    # Get parameters
                    params = []
                    if 'parameters' in details:
                        for param in details['parameters']:
                            param_info = {
                                "name": param.get('name', ''),
                                "type": param.get('schema', {}).get('type', 'string'),
                                "required": param.get('required', False),
                                "location": param.get('in', 'query'),
                                "description": param.get('description', '')
                            }
                            params.append(param_info)
                    
                    # Get request body
                    body_info = None
                    if 'requestBody' in details:
                        content = details['requestBody'].get('content', {})
                        if content:
                            # Get first content type
                            content_type = list(content.keys())[0]
                            schema = content[content_type].get('schema', {})
                            body_info = {
                                "content_type": content_type,
                                "type": schema.get('type', 'object'),
                                "required": details['requestBody'].get('required', False)
                            }
                    
                    # Get description
                    description = details.get('summary', '') or details.get('description', '')
                    
                    # Check if requires auth (not auth endpoints)
                    requires_auth = not path.startswith('/api/auth/')
                    
                    endpoints.append({
                        "method": method.upper(),
                        "path": path,
                        "description": description,
                        "parameters": params,
                        "body": body_info,
                        "requires_auth": requires_auth,
                        "tags": details.get('tags', [])
                    })
        
        # Remove duplicate endpoints (same path + method)
        # If duplicates exist, keep the one with the longer/more descriptive description
        endpoints_dict = {}
        duplicate_count = 0
        for endpoint in endpoints:
            # Create a unique key from path and method
            endpoint_key = (endpoint['path'], endpoint['method'])
            if endpoint_key not in endpoints_dict:
                endpoints_dict[endpoint_key] = endpoint
            else:
                # If duplicate found, keep the one with longer description
                duplicate_count += 1
                existing = endpoints_dict[endpoint_key]
                existing_desc = existing.get('description', '') or ''
                new_desc = endpoint.get('description', '') or ''
                if len(new_desc) > len(existing_desc):
                    endpoints_dict[endpoint_key] = endpoint
                    logger.warning(f"Duplicate endpoint removed: {endpoint['method']} {endpoint['path']} (kept version with longer description)")
                else:
                    logger.warning(f"Duplicate endpoint removed: {endpoint['method']} {endpoint['path']} (kept existing version)")
        
        if duplicate_count > 0:
            logger.info(f"Removed {duplicate_count} duplicate endpoint(s) from API documentation")
        
        unique_endpoints = list(endpoints_dict.values())
        
        # Sort endpoints by path and method
        unique_endpoints.sort(key=lambda x: (x['path'], x['method']))
        
        # Group by tag
        endpoints_by_tag = {}
        for endpoint in unique_endpoints:
            tags = endpoint.get('tags', ['Other'])
            tag = tags[0] if tags else 'Other'
            if tag not in endpoints_by_tag:
                endpoints_by_tag[tag] = []
            endpoints_by_tag[tag].append(endpoint)
        
        return {
            "success": True,
            "endpoints": unique_endpoints,
            "endpoints_by_tag": endpoints_by_tag
        }
    except Exception as e:
        logger.exception(f"Error getting API endpoints: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting API endpoints: {str(e)}")


# ==================== Agent Script ====================

class AgentScriptUpdate(BaseModel):
    content: str


@router.get("/agent")
async def get_agent_script(script_type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """
    Get agent script content
    
    Args:
        script_type: Type of script - 'winrm', 'ssh', or None for both
    """
    try:
        # Determine which script file to use
        if script_type == 'ssh':
            script_path = AGENT_SCRIPT_SSH_PATH
        else:
            script_path = AGENT_SCRIPT_PATH
        
        if not script_path.exists():
            raise HTTPException(status_code=404, detail=f"Agent script file not found: {script_path}")
        
        with open(script_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        result = {
            "success": True,
            "content": content,
            "path": str(script_path)
        }
        
        # Get SSH public key if SSH script is requested
        if script_type == 'ssh' or script_type is None:
            ssh_public_key_path = Path("/root/.ssh/id_ed25519.pub")
            if ssh_public_key_path.exists():
                try:
                    with open(ssh_public_key_path, 'r', encoding='utf-8') as f:
                        ssh_public_key = f.read().strip()
                        result["ssh_public_key"] = ssh_public_key
                        
                        # Replace SSH_PUBLIC_KEY_PLACEHOLDER with actual public key in SSH script
                        if script_type == 'ssh':
                            content = content.replace("SSH_PUBLIC_KEY_PLACEHOLDER", ssh_public_key)
                            result["content"] = content
                except Exception as e:
                    logger.warning(f"Could not read SSH public key: {e}")
        
        # Get WinRM credentials if WinRM script is requested
        if script_type == 'winrm' or script_type is None:
            result["winrm_username"] = WINRM_USERNAME
            result["winrm_password"] = WINRM_PASSWORD
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting agent script: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting agent script: {str(e)}")


@router.put("/agent")
async def update_agent_script(script_data: AgentScriptUpdate, current_user: dict = Depends(get_current_user)):
    """Update agent script content"""
    try:
        # Determine which script file to update
        script_type = script_data.script_type
        if script_type == 'ssh':
            script_path = AGENT_SCRIPT_SSH_PATH
        else:
            script_path = AGENT_SCRIPT_PATH
        
        # Ensure directory exists
        script_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write content to file
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(script_data.content)
        
        logger.info(f"Agent script ({script_type or 'winrm'}) updated by {current_user.get('username')}")
        
        return {
            "success": True,
            "message": f"Agent script ({script_type or 'winrm'}) updated successfully"
        }
    except Exception as e:
        logger.exception(f"Error updating agent script: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating agent script: {str(e)}")


# ==================== API Token Management ====================

class CreateTokenRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    expiration_type: str  # "30days", "3months", "1year", "never"
    permissions: List[str] = []  # List of permission strings like ["tunnels:read", "commands:execute"]


class UpdateTokenRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


@router.post("/api_tokens")
async def create_api_token(token_data: CreateTokenRequest, current_user: dict = Depends(get_current_user)):
    """Create a new API token with custom expiration and permissions"""
    try:
        # Validate permissions
        if not token_data.permissions or len(token_data.permissions) == 0:
            raise HTTPException(status_code=400, detail="At least one permission must be selected")
        
        # Calculate expiration
        expires_at = None
        never_expires = False
        
        if token_data.expiration_type == "30days":
            expires_at = datetime.now() + timedelta(days=30)
        elif token_data.expiration_type == "3months":
            expires_at = datetime.now() + timedelta(days=90)
        elif token_data.expiration_type == "1year":
            expires_at = datetime.now() + timedelta(days=365)
        elif token_data.expiration_type == "never":
            never_expires = True
        else:
            raise HTTPException(status_code=400, detail="Invalid expiration type")
        
        # Create token with permissions
        token_payload = {
            "sub": current_user.get("username"),
            "username": current_user.get("username"),
            "type": "api_token",
            "permissions": token_data.permissions
        }
        
        # Generate token
        if never_expires:
            # For never expire, we need to create token without exp
            # We'll use a very long expiration (100 years)
            expires_delta = timedelta(days=36500)
            token = create_access_token(
                data=token_payload,
                expires_delta=expires_delta
            )
        else:
            expires_delta = expires_at - datetime.now()
            token_payload["exp"] = int(expires_at.timestamp())
            token = create_access_token(
                data=token_payload,
                expires_delta=expires_delta
            )
        
        # Create token hash for storage
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Store token in database
        token_id = str(uuid.uuid4())
        token_record = {
            "id": token_id,
            "name": token_data.name,
            "description": token_data.description or "",
            "token": token,  # Store full token (only shown once)
            "token_hash": token_hash,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "never_expires": never_expires,
            "permissions": token_data.permissions,
            "created_by": current_user.get("username"),
            "created_at": datetime.now().isoformat(),
            "is_active": True
        }
        
        success = await db.add_api_token(token_record)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save token")
        
        logger.info(f"API token '{token_data.name}' created by {current_user.get('username')}")
        
        return {
            "success": True,
            "token": token,  # Return full token only once
            "token_id": token_id,
            "name": token_data.name,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "never_expires": never_expires,
            "permissions": token_data.permissions,
            "message": "Token created successfully. Save this token now, as it won't be shown again."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating API token: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating API token: {str(e)}")


@router.get("/api_tokens")
async def get_api_tokens(current_user: dict = Depends(get_current_user)):
    """Get list of all API tokens"""
    try:
        tokens = await db.get_api_tokens(include_inactive=True)
        return {
            "success": True,
            "tokens": tokens,
            "total": len(tokens)
        }
    except Exception as e:
        logger.exception(f"Error getting API tokens: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting API tokens: {str(e)}")


@router.delete("/api_tokens/{token_id}")
async def delete_api_token(token_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an API token"""
    try:
        success = await db.delete_api_token(token_id)
        if success:
            logger.info(f"API token {token_id} deleted by {current_user.get('username')}")
            return {
                "success": True,
                "message": "Token deleted successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Token not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting API token: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting API token: {str(e)}")


@router.put("/api_tokens/{token_id}")
async def update_api_token(token_id: str, token_data: UpdateTokenRequest, current_user: dict = Depends(get_current_user)):
    """Update an API token (name, description, permissions)"""
    try:
        # Build update dict
        updates = {}
        if token_data.name is not None:
            updates["name"] = token_data.name
        if token_data.description is not None:
            updates["description"] = token_data.description
        if token_data.permissions is not None:
            # Validate permissions
            if len(token_data.permissions) == 0:
                raise HTTPException(status_code=400, detail="At least one permission must be selected")
            updates["permissions"] = token_data.permissions
        
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        success = await db.update_api_token(token_id, updates)
        if success:
            logger.info(f"API token {token_id} updated by {current_user.get('username')}")
            return {
                "success": True,
                "message": "Token updated successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Token not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating API token: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating API token: {str(e)}")


@router.get("/api_tokens/{token_id}")
async def get_api_token(token_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific API token by ID"""
    try:
        token = await db.get_api_token_by_id(token_id)
        if token:
            return {
                "success": True,
                "token": token
            }
        else:
            raise HTTPException(status_code=404, detail="Token not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting API token: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting API token: {str(e)}")


@router.post("/api_tokens/{token_id}/deactivate")
async def deactivate_api_token(token_id: str, current_user: dict = Depends(get_current_user)):
    """Deactivate an API token"""
    try:
        success = db.deactivate_api_token(token_id)
        if success:
            logger.info(f"API token {token_id} deactivated by {current_user.get('username')}")
            return {
                "success": True,
                "message": "Token deactivated successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Token not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deactivating API token: {e}")
        raise HTTPException(status_code=500, detail=f"Error deactivating API token: {str(e)}")


# ==================== Cloudflare Account ====================

class CloudflareCredentialsUpdate(BaseModel):
    """Request model for updating Cloudflare credentials"""
    api_token: str
    account_id: str
    domain: str


@router.get("/cloudflare")
async def get_cloudflare_credentials(current_user: dict = Depends(get_current_user)):
    """Get current Cloudflare credentials (masked for security)"""
    try:
        # Check permission
        current_user_id = current_user.get("user_id")
        if not current_user_id:
            user = await db.get_user_by_username(current_user.get("username"))
            current_user_id = user.get("id") if user else None
        
        # No permission check needed for single user system
        
        # Read from environment variables
        api_token = get_env("CLOUDFLARE_API_TOKEN", "")
        account_id = get_env("CLOUDFLARE_ACCOUNT_ID", "")
        domain = get_env("CLOUDFLARE_DOMAIN", "")
        
        # Mask API token for display (show first 8 and last 4 characters)
        masked_token = ""
        if api_token:
            if len(api_token) > 12:
                masked_token = f"{api_token[:8]}...{api_token[-4:]}"
            else:
                masked_token = "***" + ("*" * (len(api_token) - 3)) if len(api_token) > 3 else "***"
        
        return {
            "success": True,
            "api_token": "",  # Always return empty for input field - user must enter new token to update
            "api_token_masked": masked_token,  # Masked token for display
            "account_id": account_id,
            "domain": domain,
            "has_credentials": bool(api_token and account_id and domain)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting Cloudflare credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting Cloudflare credentials: {str(e)}")


@router.put("/cloudflare")
async def update_cloudflare_credentials(
    credentials: CloudflareCredentialsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update Cloudflare credentials"""
    try:
        # Check permission
        current_user_id = current_user.get("user_id")
        if not current_user_id:
            user = await db.get_user_by_username(current_user.get("username"))
            current_user_id = user.get("id") if user else None
        
        # No permission check needed for single user system
        
        # Validate inputs
        if not credentials.account_id or not credentials.domain:
            raise HTTPException(
                status_code=400,
                detail="Account ID and Domain are required"
            )
        
        # If api_token is empty, use existing token from environment
        api_token = credentials.api_token
        if not api_token or api_token.strip() == "":
            existing_token = get_env("CLOUDFLARE_API_TOKEN", "")
            if not existing_token:
                raise HTTPException(
                    status_code=400,
                    detail="API Token is required. Please enter your Cloudflare API Token."
                )
            api_token = existing_token
        
        # Import update_env_file from setup.py
        from api.routes.setup import update_env_file
        
        # Update .env file
        update_env_file(
            api_token,
            credentials.account_id,
            credentials.domain
        )
        
        logger.info(f"Cloudflare credentials updated by {current_user.get('username')}")
        
        return {
            "success": True,
            "message": "Cloudflare credentials updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating Cloudflare credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating Cloudflare credentials: {str(e)}")


@router.post("/cloudflare/verify")
async def verify_cloudflare_credentials(
    credentials: CloudflareCredentialsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Verify Cloudflare credentials"""
    try:
        # Check permission
        current_user_id = current_user.get("user_id")
        if not current_user_id:
            user = await db.get_user_by_username(current_user.get("username"))
            current_user_id = user.get("id") if user else None
        
        # No permission check needed for single user system
        
        # Validate inputs
        if not credentials.account_id or not credentials.domain:
            raise HTTPException(
                status_code=400,
                detail="Account ID and Domain are required"
            )
        
        # If api_token is empty, use existing token from environment
        api_token = credentials.api_token
        if not api_token or api_token.strip() == "":
            existing_token = get_env("CLOUDFLARE_API_TOKEN", "")
            if not existing_token:
                raise HTTPException(
                    status_code=400,
                    detail="API Token is required. Please enter your Cloudflare API Token."
                )
            api_token = existing_token
        
        # Import CloudflareService
        from api.services.cloudflare import CloudflareService
        
        # Create CloudflareService instance and verify credentials
        cloudflare_service = CloudflareService(
            api_token=api_token,
            account_id=credentials.account_id,
            domain=credentials.domain
        )
        
        verification_result = await cloudflare_service.verify_credentials()
        
        # Return verification result
        response_data = {
            "success": verification_result["success"],
            "message": "Cloudflare credentials verified successfully" if verification_result["success"] else "Cloudflare credentials verification failed",
            "token_valid": verification_result.get("token_valid", False),
            "account_valid": verification_result.get("account_valid", False),
            "domain_valid": verification_result.get("domain_valid", False)
        }
        
        if not verification_result["success"]:
            response_data["errors"] = verification_result.get("errors", [])
        
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error verifying Cloudflare credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Error verifying Cloudflare credentials: {str(e)}")

