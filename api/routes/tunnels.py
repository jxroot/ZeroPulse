from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from api.models.tunnel import Tunnel, TunnelCreate, TunnelResponse, Connection, TunnelLabelUpdate, TunnelUpdate
from api.services.cloudflare import CloudflareService
from api.services.database import Database
from api.dependencies import get_current_user
from api.utils.logger import logger
from api.utils.exceptions import TunnelNotFoundError, TunnelConfigurationError
from api.utils.error_codes import ErrorCode
from api.utils.validation import validate_tunnel_id, validate_hostname, sanitize_url, sanitize_string
from api.utils.env import get_env
import uuid
import asyncio

router = APIRouter(prefix="/api/tunnels", tags=["tunnels"])

# Cloudflare settings - use lazy initialization to read from environment variables
import os
from pathlib import Path

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
db = Database()
# For backward compatibility, create initial instance (will be refreshed on first use)
cloudflare_service = get_cloudflare_service()


@router.get("/", response_model=List[Tunnel])
async def list_tunnels(current_user: dict = Depends(get_current_user)):
    """Get list of Tunnels from Cloudflare API - only non-deleted tunnels (healthy or down)"""
    try:
        # Get list of Tunnels from Cloudflare
        cloudflare_tunnels = await get_cloudflare_service().list_tunnels()
        
        # Convert to Tunnel model format and filter
        tunnels = []
        for cf_tunnel in cloudflare_tunnels:
            # Filter: Only tunnels where deleted_at = null (not deleted)
            deleted_at = cf_tunnel.get("deleted_at")
            if deleted_at is not None:
                continue  # Skip deleted tunnels
            
            # Check database for additional info (hostname, token)
            db_tunnel = await db.get_tunnel_by_id(cf_tunnel.get("id"))
            
            # Convert connections to Connection model
            connections = []
            for conn in cf_tunnel.get("connections", []):
                connections.append(Connection(**conn))
            
            # Determine connection_type from database or ingress routes
            connection_type = None
            if db_tunnel and db_tunnel.get("connection_type"):
                connection_type = db_tunnel.get("connection_type")
            else:
                # Try to determine from ingress routes if not in database
                try:
                    config = await get_cloudflare_service().get_tunnel_config(cf_tunnel.get("id"))
                    if config:
                        config_data = config.get("config") or {}
                        ingress = config_data.get("ingress", []) if isinstance(config_data, dict) else []
                    else:
                        ingress = []
                    for route in ingress:
                        service = route.get("service", "")
                        if service.startswith("ssh://") or (service.startswith("tcp://") and ":22" in service):
                            connection_type = "ssh"
                            break
                        elif service.startswith("tcp://") and ":5986" in service:
                            connection_type = "winrm"
                            break
                    # Default to winrm if not found
                    if not connection_type:
                        connection_type = "winrm"
                except:
                    # If we can't determine, default to winrm
                    connection_type = "winrm"
            
            # Get tunnel name for group matching
            tunnel_name = cf_tunnel.get("name", "")
            
            # Get group information for this tunnel
            group_info = await db.get_tunnel_group_for_name(tunnel_name)
            group_id = group_info.get("group_id") if group_info else None
            group_name = group_info.get("group_name") if group_info else None
            group_color = group_info.get("group_color") if group_info else None
            
            tunnel = {
                "id": cf_tunnel.get("id", ""),
                "account_tag": cf_tunnel.get("account_tag"),
                "created_at": cf_tunnel.get("created_at"),
                "deleted_at": cf_tunnel.get("deleted_at"),
                "name": tunnel_name,
                "connections": connections,
                "conns_active_at": cf_tunnel.get("conns_active_at"),
                "conns_inactive_at": cf_tunnel.get("conns_inactive_at"),
                "tun_type": cf_tunnel.get("tun_type"),
                "metadata": cf_tunnel.get("metadata", {}),
                "status": cf_tunnel.get("status", "down"),
                "remote_config": cf_tunnel.get("remote_config", False),
            # Additional fields from database
            "token": db_tunnel.get("token") if db_tunnel else None,
            "connection_type": connection_type,
            "label": db_tunnel.get("label") if db_tunnel else None,
                # Group fields
                "group_id": group_id,
                "group_name": group_name,
                "group_color": group_color
            }
            tunnels.append(Tunnel(**tunnel))
        
        return tunnels
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting tunnel list: {str(e)}")


@router.post("/", response_model=TunnelResponse)
async def create_tunnel(tunnel_data: Optional[TunnelCreate] = None, current_user: dict = Depends(get_current_user)):
    """Create new Tunnel"""
    try:
        db = Database()
        cloudflare_service = get_cloudflare_service()
        
        # Generate tunnel name if not provided
        tunnel_name = tunnel_data.name if tunnel_data and tunnel_data.name else f"tunnel-{uuid.uuid4()}"
        
        # Create tunnel in Cloudflare
        result = await cloudflare_service.create_tunnel(tunnel_name, config_src="cloudflare")
        
        if not result or not result.get("id"):
            raise HTTPException(status_code=500, detail="Failed to create tunnel")
        
        tunnel_id = result.get("id")
        token = result.get("token")
        tunnel_name = result.get("name", tunnel_name)
        
        # Save tunnel info to database
        await db.save_tunnel_info(tunnel_id, token=token)
        
        return TunnelResponse(
            success=True,
            tunnel_id=tunnel_id,
            token=token,
            name=result.get("name", tunnel_name)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating tunnel: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating tunnel: {str(e)}")


@router.get("/{tunnel_id}", response_model=Tunnel)
async def get_tunnel(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """Get Tunnel info from Cloudflare API"""
    try:
        # Get from Cloudflare
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise HTTPException(status_code=404, detail="Tunnel not found")
        
        # Get additional info from database (hostname, token)
        db_tunnel = await db.get_tunnel_by_id(tunnel_id)
        
        # Convert connections to Connection model
        connections = []
        for conn in cf_tunnel.get("connections", []):
            connections.append(Connection(**conn))
        
        tunnel = {
            "id": cf_tunnel.get("id", ""),
            "account_tag": cf_tunnel.get("account_tag"),
            "created_at": cf_tunnel.get("created_at"),
            "deleted_at": cf_tunnel.get("deleted_at"),
            "name": cf_tunnel.get("name", ""),
            "connections": connections,
            "conns_active_at": cf_tunnel.get("conns_active_at"),
            "conns_inactive_at": cf_tunnel.get("conns_inactive_at"),
            "tun_type": cf_tunnel.get("tun_type"),
            "metadata": cf_tunnel.get("metadata", {}),
            "status": cf_tunnel.get("status", "down"),
            "remote_config": cf_tunnel.get("remote_config", False),
            # Additional fields from database
            "token": db_tunnel.get("token") if db_tunnel else None,
            "label": db_tunnel.get("label") if db_tunnel else None
        }
        
        return Tunnel(**tunnel)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting tunnel: {str(e)}")


@router.get("/{tunnel_id}/routes")
async def get_tunnel_routes(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """Get Tunnel Config Routes (ingress) and default hostname"""
    try:
        # Validate tunnel exists
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise TunnelNotFoundError(
                tunnel_id=tunnel_id,
                detail=f"Tunnel '{tunnel_id}' not found in Cloudflare"
            )
        
        config = await get_cloudflare_service().get_tunnel_config(tunnel_id)
        if not config:
            raise TunnelConfigurationError(
                message=f"Tunnel configuration not found for tunnel: {tunnel_id}",
                detail=f"Could not retrieve configuration for tunnel '{tunnel_id}'",
                context={"tunnel_id": tunnel_id}
            )
        
        config_data = config.get("config") or {}
        ingress = config_data.get("ingress", []) if isinstance(config_data, dict) else []
        
        # Infer type from service for each route (Cloudflare API doesn't return type)
        for route in ingress:
            if "type" not in route or not route.get("type"):
                service = route.get("service", "")
                if service == "http_status:404":
                    continue  # Skip catch-all
                elif service.startswith("http://"):
                    route["type"] = "HTTP"
                elif service.startswith("https://"):
                    route["type"] = "HTTPS"
                elif service.startswith("tcp://"):
                    route["type"] = "TCP"
                elif service.startswith("ssh://"):
                    route["type"] = "SSH"
                else:
                    route["type"] = "HTTP"  # Default
        
        # Get default_hostname, winrm credentials, ssh_hostname and SSH config from database
        # Note: ssh_key_path is fixed to /root/.ssh/id_ed25519, not returned
        tunnel = await db.get_tunnel_by_id(tunnel_id)
        default_hostname = tunnel.get("default_hostname", "") if tunnel else ""
        winrm_username = tunnel.get("winrm_username", "") if tunnel else ""
        winrm_password = tunnel.get("winrm_password", "") if tunnel else ""
        winrm_ntlm_hash = tunnel.get("winrm_ntlm_hash", "") if tunnel else ""
        ssh_hostname = tunnel.get("ssh_hostname", "") if tunnel else ""
        ssh_username = tunnel.get("ssh_username", "") if tunnel else ""
        ssh_password = tunnel.get("ssh_password", "") if tunnel else ""
        
        # Get domain for frontend validation
        domain = get_env("CLOUDFLARE_DOMAIN", "")
        
        return {
            "success": True,
            "ingress": ingress,
            "default_hostname": default_hostname,
            "winrm_username": winrm_username,
            "winrm_password": winrm_password,
            "winrm_ntlm_hash": winrm_ntlm_hash,
            "ssh_hostname": ssh_hostname,
            "ssh_username": ssh_username,
            "ssh_password": ssh_password,
            "domain": domain  # Include domain for frontend validation
        }
    except (TunnelNotFoundError, TunnelConfigurationError):
        # These will be handled by the global exception handler
        raise
    except Exception as e:
        logger.exception(f"Unexpected error getting tunnel routes for {tunnel_id}")
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": ErrorCode.INTERNAL_ERROR.value,
                "message": "Error getting tunnel routes",
                "detail": f"An unexpected error occurred: {str(e)}",
                "context": {"tunnel_id": tunnel_id}
            }
        )


@router.put("/{tunnel_id}/routes")
async def update_tunnel_routes(tunnel_id: str, routes_data: dict, current_user: dict = Depends(get_current_user)):
    """
    Update Tunnel Config Routes (ingress) and default hostname
    
    Validates and sanitizes:
    - Tunnel ID (UUID format)
    - Hostnames (RFC 1123 format)
    - Service URLs (http://, https://, tcp://, ssh://)
    """
    try:
        # Validate tunnel_id format (UUID)
        try:
            tunnel_id = validate_tunnel_id(tunnel_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Validate tunnel exists
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise HTTPException(status_code=404, detail="Tunnel not found")
        
        # Get current ingress to compare with new one
        current_config = await get_cloudflare_service().get_tunnel_config(tunnel_id)
        if current_config:
            config_data = current_config.get("config") or {}
            current_ingress = config_data.get("ingress", []) if isinstance(config_data, dict) else []
        else:
            current_ingress = []
        current_hostnames = {route.get("hostname") for route in current_ingress if route.get("hostname")}
        # Create a map of current routes by hostname for comparison
        current_routes_map = {route.get("hostname"): route for route in current_ingress if route.get("hostname")}
        
        # Normalize current ingress for comparison (remove catch-all, sort by hostname)
        current_routes_normalized = [
            route for route in current_ingress 
            if route.get("hostname") and route.get("service") != "http_status:404"
        ]
        current_routes_normalized.sort(key=lambda x: x.get("hostname", ""))
        
        # Validate ingress array
        ingress = routes_data.get("ingress", [])
        if not isinstance(ingress, list):
            raise HTTPException(status_code=400, detail="ingress must be an array")
        
        logger.info(f"Received {len(ingress)} routes in request")
        for idx, route in enumerate(ingress):
            logger.debug(f"Received route #{idx}: hostname={route.get('hostname')}, type={route.get('type')}, service={route.get('service')}")
        
        # Check if ingress has meaningful routes (routes with hostnames, not just catch-all)
        meaningful_routes = [r for r in ingress if r.get("hostname") and r.get("service") != "http_status:404"]
        has_meaningful_routes = len(meaningful_routes) > 0
        logger.info(f"Found {len(meaningful_routes)} meaningful routes (with hostname)")
        
        # If ingress is empty or only has catch-all, and there are existing routes, preserve current ingress
        # This prevents accidentally clearing routes when only updating hostnames
        if not has_meaningful_routes and len(current_routes_normalized) > 0:
            logger.info("Ingress array is empty or only contains catch-all, preserving current ingress routes")
            # Use current ingress instead of the provided one
            ingress = current_ingress.copy()
        
        # Validate routes before processing
        for i, route in enumerate(ingress):
            service = route.get("service", "")
            hostname = route.get("hostname", "")
            route_type = route.get("type", "")
            
            # Skip catch-all route validation
            if service == "http_status:404":
                continue
            
            # Validate and sanitize service URL
            if service:
                try:
                    service = sanitize_url(service)
                    route["service"] = service
                except ValueError as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid service URL in route #{i+1}: {str(e)}"
                    )
            
            # Validate hostname is required for TCP and SSH
            if service.startswith("tcp://") or service.startswith("ssh://") or route_type in ["TCP", "SSH"]:
                if not hostname or not hostname.strip():
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Hostname is required for TCP/SSH routes (route #{i+1})"
                    )
                
                # Validate and sanitize hostname
                try:
                    # Get domain from environment for validation
                    domain = get_env("CLOUDFLARE_DOMAIN", "")
                    hostname = validate_hostname(hostname, domain=domain if domain else None)
                    route["hostname"] = hostname
                except ValueError as e:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid hostname in route #{i+1}: {str(e)}"
                    )
        
        # Ensure last route is catch-all (http_status:404)
        if ingress and ingress[-1].get("service") != "http_status:404":
            ingress.append({"service": "http_status:404"})
        
        logger.info(f"After validation: {len(ingress)} routes (including catch-all)")
        for idx, route in enumerate(ingress):
            logger.debug(f"Validated route #{idx}: hostname={route.get('hostname')}, type={route.get('type')}, service={route.get('service')}")
        
        # Preserve originRequest from existing routes and add originRequest to routes that need it (TCP services)
        processed_ingress = []
        for route in ingress:
            processed_route = route.copy()
            route_hostname = processed_route.get("hostname")
            
            # If this route exists in current config, preserve its originRequest if not provided
            if route_hostname and route_hostname in current_routes_map:
                existing_route = current_routes_map[route_hostname]
                if "originRequest" not in processed_route and "originRequest" in existing_route:
                    processed_route["originRequest"] = existing_route["originRequest"]
            
            # If service is TCP and doesn't have originRequest, add it
            if processed_route.get("service", "").startswith("tcp://") and "originRequest" not in processed_route:
                processed_route["originRequest"] = {}
            
            processed_ingress.append(processed_route)
        
        # Get new hostnames (excluding catch-all route)
        new_hostnames = {route.get("hostname") for route in processed_ingress if route.get("hostname")}
        
        # Normalize new routes for comparison (remove catch-all, sort by hostname)
        new_routes_normalized = [
            route for route in processed_ingress 
            if route.get("hostname") and route.get("service") != "http_status:404"
        ]
        new_routes_normalized.sort(key=lambda x: x.get("hostname", ""))
        
        # Normalize routes for proper comparison (ignore order and extra fields)
        def normalize_route_for_comparison(route):
            """Normalize route for comparison by extracting key fields"""
            return {
                "hostname": route.get("hostname", "").strip().lower(),
                "path": route.get("path", "").strip() if route.get("path") else "",
                "service": route.get("service", "").strip().lower(),
                "type": route.get("type", "").strip().upper() if route.get("type") else ""
            }
        
        # Normalize both lists for comparison
        current_normalized = sorted(
            [normalize_route_for_comparison(r) for r in current_routes_normalized],
            key=lambda x: x["hostname"]
        )
        new_normalized = sorted(
            [normalize_route_for_comparison(r) for r in new_routes_normalized],
            key=lambda x: x["hostname"]
        )
        
        # Check if routes actually changed by comparing normalized routes
        routes_changed = current_normalized != new_normalized
        
        # Find hostnames that were removed
        removed_hostnames = current_hostnames - new_hostnames
        
        # Only delete DNS records if routes actually changed AND there are removed hostnames
        # This prevents accidental deletion when routes are the same but request is sent again
        if not routes_changed:
            logger.info("Routes unchanged, skipping DNS record deletion")
            removed_hostnames = set()
        elif removed_hostnames:
            # Some routes were removed - proceed with deletion
            if removed_hostnames == current_hostnames and current_hostnames and not new_hostnames:
                logger.info(f"All routes removed (all DNS records will be deleted). Removed hostnames: {removed_hostnames}")
            else:
                logger.info(f"Some routes removed. Removed hostnames: {removed_hostnames}")
        
        # Get current config to preserve other fields (originRequest, warp-routing, etc.)
        if not current_config:
            raise HTTPException(status_code=500, detail="Could not retrieve current tunnel config")
        
        current_config_data = current_config.get("config") or {}
        if not isinstance(current_config_data, dict):
            current_config_data = {}
        
        # Merge new ingress with existing config, preserving other fields
        updated_config = {
            "config": {
                "ingress": processed_ingress
            }
        }
        
        # Preserve originRequest if it exists in current config (only if it's not empty)
        if "originRequest" in current_config_data:
            origin_req = current_config_data["originRequest"]
            if origin_req and isinstance(origin_req, dict) and origin_req:
                updated_config["config"]["originRequest"] = origin_req
                logger.debug(f"Preserving originRequest: {origin_req}")
        
        # Preserve warp-routing if it exists in current config (SDK expects warp_routing in snake_case)
        warp_routing = None
        if "warp-routing" in current_config_data:
            warp_routing = current_config_data["warp-routing"]
        elif "warp_routing" in current_config_data:
            warp_routing = current_config_data["warp_routing"]
        
        if warp_routing:
            # Ensure warp-routing has enabled field
            if isinstance(warp_routing, dict):
                if "enabled" in warp_routing:
                    updated_config["config"]["warp-routing"] = {"enabled": warp_routing["enabled"]}
                    logger.debug(f"Preserving warp-routing: {warp_routing}")
            elif isinstance(warp_routing, bool):
                updated_config["config"]["warp-routing"] = {"enabled": warp_routing}
            else:
                # Try to extract enabled from object
                enabled = getattr(warp_routing, 'enabled', False) if hasattr(warp_routing, 'enabled') else False
                updated_config["config"]["warp-routing"] = {"enabled": enabled}
        
        logger.debug(f"Updating tunnel config with preserved fields: {list(updated_config['config'].keys())}")
        logger.debug(f"Updated config structure (ingress count: {len(processed_ingress)}): {updated_config}")
        
        try:
            success = await get_cloudflare_service().update_tunnel_config(tunnel_id, updated_config)
            if not success:
                logger.error(f"update_tunnel_config returned False for tunnel {tunnel_id}")
                raise HTTPException(status_code=500, detail="Error updating tunnel routes")
        except Exception as e:
            logger.exception(f"Exception in update_tunnel_config for tunnel {tunnel_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Error updating tunnel routes: {str(e)}")
        
        # Delete DNS records for removed hostnames
        dns_results = []
        for hostname in removed_hostnames:
            logger.info(f"Deleting DNS record for removed hostname: {hostname}")
            # Get tunnel_id to help identify the correct DNS record
            dns_deleted = await get_cloudflare_service().delete_dns_record(hostname, tunnel_id=tunnel_id)
            dns_results.append({
                "hostname": hostname,
                "dns_deleted": dns_deleted,
                "action": "deleted"
            })
            if not dns_deleted:
                logger.warning(f"Failed to delete DNS record for {hostname}")
        
        # Create/update DNS records for all hostnames in ingress
        logger.info(f"Processing {len(processed_ingress)} routes for DNS records")
        for idx, route in enumerate(processed_ingress):
            logger.debug(f"Route #{idx}: {route}")
            hostname = route.get("hostname")
            if not hostname or not hostname.strip():
                logger.debug(f"Skipping route #{idx} without hostname: service={route.get('service')}, type={route.get('type')}")
                continue
            
            logger.info(f"Processing DNS record for hostname: {hostname} (route #{idx})")
            # Get type from route
            route_type = route.get("type")
            
            # If type is not specified, check current route first, then infer from service
            if not route_type or not route_type.strip():
                    # Check if this route existed before
                    current_route = current_routes_map.get(hostname)
                    if current_route and current_route.get("type"):
                        # Use existing type if available
                        route_type = current_route.get("type")
                    else:
                        # Infer from service
                        service = route.get("service", "")
                        if service.startswith("http://"):
                            route_type = "HTTP"
                        elif service.startswith("https://"):
                            route_type = "HTTPS"
                        elif service.startswith("tcp://"):
                            route_type = "TCP"
                        elif service.startswith("ssh://"):
                            route_type = "SSH"
                        else:
                            # Default to HTTP for web services
                            route_type = "HTTP"
                
            route_type = route_type.strip() if isinstance(route_type, str) else "HTTP"
            
            # Check if this is an update
            current_route = current_routes_map.get(hostname)
            is_update = hostname in current_hostnames
            
            # Always preserve proxied status for existing routes (unless type explicitly changed)
            preserve_proxied = False
            if is_update and current_route:
                current_type = current_route.get("type", "").strip() if current_route.get("type") else ""
                new_type = route_type.strip() if route_type else ""
                
                # If type is not explicitly provided in new route, preserve proxied status
                if not route.get("type") or not route.get("type").strip():
                    preserve_proxied = True
                    logger.info(f"Route type not specified for {hostname}, preserving proxied status")
                elif current_type and current_type == new_type:
                    # Type hasn't changed, preserve proxied status
                    preserve_proxied = True
                    logger.info(f"Route type unchanged for {hostname}, preserving proxied status")
                else:
                    logger.info(f"Route type changed for {hostname} ({current_type} -> {new_type}), proxied will be recalculated")
            
                # Check if DNS record actually exists
                existing_dns_record = await get_cloudflare_service().find_dns_record(hostname)
                dns_record_exists = existing_dns_record is not None
                
                # Simpler logic: if DNS record exists, update it, otherwise create it
                if dns_record_exists:
                    # DNS record exists - always update
                    dns_success = await get_cloudflare_service().update_dns_record(
                        hostname=hostname,
                        tunnel_id=tunnel_id,
                        route_type=route_type,
                        preserve_proxied=preserve_proxied if is_update else False
                    )
                    action = "updated"
                else:
                    # DNS record does not exist - create
                    dns_success = await get_cloudflare_service().create_dns_record(
                        hostname=hostname,
                        tunnel_id=tunnel_id,
                        route_type=route_type
                    )
                    action = "created"
                
                dns_results.append({
                    "hostname": hostname,
                    "dns_created": dns_success,
                    "action": action,
                    "route_type": route_type
                })
                if not dns_success:
                    logger.warning(f"Failed to {action} DNS record for {hostname}")
        
        # Determine connection type based on routes
        # Priority: WinRM first, then SSH (if both exist, prioritize WinRM)
        connection_type = None
        has_winrm_route = False
        has_ssh_route = False
        
        for route in processed_ingress:
            service = route.get("service", "")
            if service.startswith("tcp://") and ":5986" in service:
                has_winrm_route = True
            elif service.startswith("ssh://") or (service.startswith("tcp://") and ":22" in service):
                has_ssh_route = True
        
        # Prioritize WinRM if both exist
        if has_winrm_route:
            connection_type = "winrm"
        elif has_ssh_route:
            connection_type = "ssh"
        else:
            # If no explicit connection type found, default to winrm for backward compatibility
            connection_type = "winrm"
        
        # Save default_hostname, winrm credentials, ssh_hostname and SSH config to database
        # Note: ssh_key_path is fixed to /root/.ssh/id_ed25519, not stored in database
        default_hostname = routes_data.get("default_hostname", "").strip()
        winrm_username = routes_data.get("winrm_username", "").strip()
        winrm_password = routes_data.get("winrm_password", "").strip()
        winrm_ntlm_hash = routes_data.get("winrm_ntlm_hash", "").strip()
        ssh_hostname = routes_data.get("ssh_hostname", "").strip()
        ssh_username = routes_data.get("ssh_username", "").strip()
        ssh_password = routes_data.get("ssh_password", "").strip()
        
        # Validate and sanitize hostnames
        domain = get_env("CLOUDFLARE_DOMAIN", "")
        if default_hostname:
            try:
                default_hostname = validate_hostname(default_hostname, domain=domain if domain else None)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid default_hostname: {str(e)}")
        
        if ssh_hostname:
            try:
                ssh_hostname = validate_hostname(ssh_hostname, domain=domain if domain else None)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=f"Invalid ssh_hostname: {str(e)}")
        
        # Sanitize usernames (basic sanitization)
        if winrm_username:
            winrm_username = sanitize_string(winrm_username, max_length=100, allow_empty=False)
            if not winrm_username:
                winrm_username = None
        
        if ssh_username:
            ssh_username = sanitize_string(ssh_username, max_length=100, allow_empty=False)
            if not ssh_username:
                ssh_username = None
        
        # Prepare update data
        update_data = {}
        if default_hostname:
            update_data["default_hostname"] = default_hostname
        if winrm_username:
            update_data["winrm_username"] = winrm_username
        if winrm_password:
            update_data["winrm_password"] = winrm_password
        if winrm_ntlm_hash:
            update_data["winrm_ntlm_hash"] = winrm_ntlm_hash
        if ssh_hostname:
            update_data["ssh_hostname"] = ssh_hostname
        if ssh_username:
            update_data["ssh_username"] = ssh_username
        if ssh_password:
            update_data["ssh_password"] = ssh_password
        # Always update connection_type based on routes (determined above)
        if connection_type:
            update_data["connection_type"] = connection_type
        
        if update_data:
            # Update or create tunnel in database
            tunnel = await db.get_tunnel_by_id(tunnel_id)
            if tunnel:
                await db.update_tunnel(tunnel_id, update_data)
            else:
                # Create tunnel entry if doesn't exist
                tunnel_data = {
                    "id": tunnel_id,
                    **update_data
                }
                await db.add_tunnel(tunnel_data)
        
        return {
            "success": True,
            "message": "Routes updated successfully",
            "ingress": processed_ingress,
            "default_hostname": default_hostname,
            "winrm_username": winrm_username,
            "winrm_password": winrm_password,
            "winrm_ntlm_hash": winrm_ntlm_hash,
            "ssh_password": ssh_password,
            "dns_records": dns_results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating tunnel routes: {str(e)}")


@router.patch("/{tunnel_id}/label")
async def update_tunnel_label(
    tunnel_id: str, 
    label_data: TunnelLabelUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """
    Update Tunnel Label
    
    Validates and sanitizes label:
    - Maximum 20 characters
    - Removes dangerous characters (SQL injection, XSS)
    - Strips whitespace
    """
    try:
        # Validate tunnel_id format (UUID)
        try:
            tunnel_id = validate_tunnel_id(tunnel_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Validate tunnel exists
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise HTTPException(status_code=404, detail="Tunnel not found")
        
        # Get validated and sanitized label from Pydantic model
        label = label_data.label
        
        # Update label in database
        update_data = {"label": label}
        tunnel = await db.get_tunnel_by_id(tunnel_id)
        if tunnel:
            await db.update_tunnel(tunnel_id, update_data)
        else:
            # Create tunnel entry if doesn't exist
            tunnel_data = {
                "id": tunnel_id,
                "label": label
            }
            await db.add_tunnel(tunnel_data)
        
        logger.info(f"Tunnel label updated for {tunnel_id} by {current_user.get('username')}: {label}")
        
        return {
            "success": True,
            "message": "Tunnel label updated successfully",
            "tunnel_id": tunnel_id,
            "label": label
        }
    except HTTPException:
        raise
    except ValueError as e:
        # Pydantic validation errors
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Error updating tunnel label for {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating tunnel label: {str(e)}")


@router.put("/{tunnel_id}")
async def update_tunnel(
    tunnel_id: str,
    tunnel_data: TunnelUpdate,
    current_user: dict = Depends(get_current_user)
):
    """
    Update Tunnel info (name, hostname)
    
    Uses Cloudflare SDK to update tunnel name in Cloudflare.
    """
    try:
        # Validate tunnel_id format (UUID)
        try:
            tunnel_id = validate_tunnel_id(tunnel_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Validate tunnel exists
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise HTTPException(status_code=404, detail="Tunnel not found")
        
        cloudflare_service = get_cloudflare_service()
        
        # Prepare update data for Cloudflare
        cloudflare_update_data = {}
        if tunnel_data.name is not None:
            cloudflare_update_data["name"] = tunnel_data.name
        
        # Update tunnel name in Cloudflare using SDK
        if cloudflare_update_data:
            try:
                updated_tunnel = await asyncio.to_thread(
                    cloudflare_service.sdk_client.zero_trust.tunnels.cloudflared.edit,
                    tunnel_id=tunnel_id,
                    account_id=cloudflare_service.account_id,
                    **cloudflare_update_data
                )
                logger.info(f"Tunnel name updated in Cloudflare for {tunnel_id} by {current_user.get('username')}")
            except Exception as e:
                logger.exception(f"Error updating tunnel name in Cloudflare: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to update tunnel name in Cloudflare: {str(e)}")
        
        # No database update needed - name is stored in Cloudflare only
        
        logger.info(f"Tunnel updated for {tunnel_id} by {current_user.get('username')}")
        
        return {
            "success": True,
            "message": "Tunnel updated successfully",
            "tunnel_id": tunnel_id
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Error updating tunnel for {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating tunnel: {str(e)}")


@router.post("/{tunnel_id}/refresh-token")
async def refresh_tunnel_token(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """
    Refresh Tunnel Token
    
    Generates a new token for the tunnel. The old token will be invalidated.
    Note: This will prevent new connections made with the old token, but won't close existing connections.
    
    Uses Cloudflare SDK to get a new token. Getting a new token automatically invalidates the old one.
    """
    try:
        # Validate tunnel_id format (UUID)
        try:
            tunnel_id = validate_tunnel_id(tunnel_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Validate tunnel exists
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise HTTPException(status_code=404, detail="Tunnel not found")
        
        cloudflare_service = get_cloudflare_service()
        
        # Get new token using Cloudflare SDK
        # client.zero_trust.tunnels.cloudflared.token.get() gets/refreshes the token
        try:
            token_response = await asyncio.to_thread(
                cloudflare_service.sdk_client.zero_trust.tunnels.cloudflared.token.get,
                tunnel_id=tunnel_id,
                account_id=cloudflare_service.account_id
            )
            
            # Extract token from response
            # TokenGetResponse should have the token as a string or in a result field
            if hasattr(token_response, 'token'):
                new_token = token_response.token
            elif hasattr(token_response, 'result'):
                new_token = token_response.result
            elif isinstance(token_response, str):
                new_token = token_response
            elif hasattr(token_response, 'model_dump'):
                token_dict = token_response.model_dump(mode='json')
                new_token = token_dict.get('token') or token_dict.get('result')
            elif hasattr(token_response, 'dict'):
                token_dict = token_response.dict()
                new_token = token_dict.get('token') or token_dict.get('result')
            else:
                # Try to get as string directly
                new_token = str(token_response)
            
            if not new_token:
                logger.error(f"Token not found in response: {token_response}")
                raise HTTPException(status_code=500, detail="Token not found in response")
            
            # Update token in database
            db = Database()
            await db.update_tunnel(tunnel_id, {"token": new_token})
            
            logger.info(f"Token refreshed for tunnel {tunnel_id} by {current_user.get('username')}")
            
            return {
                "success": True,
                "message": "Token refreshed successfully",
                "token": new_token,
                "tunnel_id": tunnel_id
            }
        except Exception as e:
            logger.exception(f"Error refreshing token using SDK: {e}")
            # Check if it's a 404 or 403 error
            error_str = str(e).lower()
            if "404" in error_str or "not found" in error_str:
                raise HTTPException(status_code=404, detail="Tunnel not found")
            elif "403" in error_str or "permission" in error_str or "forbidden" in error_str:
                raise HTTPException(status_code=403, detail="Permission denied")
            else:
                raise HTTPException(status_code=500, detail=f"Failed to refresh token: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error refreshing token for {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error refreshing token: {str(e)}")


@router.delete("/{tunnel_id}")
async def delete_tunnel(tunnel_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete Tunnel from Cloudflare and database
    
    Process:
    1. Get tunnel config and extract ingress rules
    2. Delete all DNS records associated with ingress hostnames
    3. Clear ingress rules (set to empty with catch-all)
    4. Delete tunnel from Cloudflare
    5. Delete tunnel from database
    """
    try:
        # Validate tunnel_id format (UUID)
        try:
            tunnel_id = validate_tunnel_id(tunnel_id)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Validate tunnel exists
        cf_tunnel = await get_cloudflare_service().get_tunnel(tunnel_id)
        if not cf_tunnel:
            raise HTTPException(status_code=404, detail="Tunnel not found")
        
        cloudflare_service = get_cloudflare_service()
        dns_deleted_count = 0
        dns_failed_count = 0
        
        # Step 1: Get tunnel config and extract ingress rules
        logger.info(f"Step 1: Getting tunnel config for {tunnel_id}")
        config = await cloudflare_service.get_tunnel_config(tunnel_id)
        hostnames_to_delete = set()
        
        if config:
            config_data = config.get("config") or {}
            ingress = config_data.get("ingress", []) if isinstance(config_data, dict) else []
            
            # Extract all hostnames from ingress rules (excluding catch-all)
            for route in ingress:
                hostname = route.get("hostname")
                if hostname and route.get("service") != "http_status:404":
                    hostnames_to_delete.add(hostname)
            
            logger.info(f"Found {len(hostnames_to_delete)} hostnames in ingress rules: {hostnames_to_delete}")
            
            # Step 2: Delete all DNS records associated with these hostnames
            if hostnames_to_delete:
                logger.info(f"Step 2: Deleting DNS records for {len(hostnames_to_delete)} hostnames")
                for hostname in hostnames_to_delete:
                    try:
                        dns_deleted = await cloudflare_service.delete_dns_record(hostname, tunnel_id=tunnel_id)
                        if dns_deleted:
                            dns_deleted_count += 1
                            logger.info(f"DNS record deleted for hostname: {hostname}")
                        else:
                            dns_failed_count += 1
                            logger.warning(f"Failed to delete DNS record for hostname: {hostname}")
                    except Exception as dns_error:
                        dns_failed_count += 1
                        logger.exception(f"Error deleting DNS record for {hostname}: {dns_error}")
                        # Continue with other hostnames even if one fails
                
                logger.info(f"DNS deletion complete: {dns_deleted_count} deleted, {dns_failed_count} failed")
            
            # Step 3: Clear ingress rules (set to empty with only catch-all)
            logger.info(f"Step 3: Clearing ingress rules for tunnel {tunnel_id}")
            try:
                # Set ingress to empty with only catch-all route
                empty_ingress = [{"service": "http_status:404"}]
                
                # Get current config to preserve other fields
                current_config_data = config_data.copy()
                current_config_data["ingress"] = empty_ingress
                
                # Update tunnel config with empty ingress
                update_config = {"config": current_config_data}
                success = await cloudflare_service.update_tunnel_config(tunnel_id, update_config)
                
                if success:
                    logger.info(f"Ingress rules cleared for tunnel {tunnel_id}")
                else:
                    logger.warning(f"Failed to clear ingress rules for tunnel {tunnel_id}, continuing with deletion")
            except Exception as ingress_error:
                logger.exception(f"Error clearing ingress rules: {ingress_error}")
                # Continue with tunnel deletion even if ingress clearing fails
        else:
            logger.warning(f"No config found for tunnel {tunnel_id}, skipping ingress/DNS cleanup")
        
        # Step 4: Delete tunnel from Cloudflare
        logger.info(f"Step 4: Deleting tunnel {tunnel_id} from Cloudflare")
        try:
            await asyncio.to_thread(
                cloudflare_service.sdk_client.cloudflare_tunnels.delete,
                account_id=cloudflare_service.account_id,
                tunnel_id=tunnel_id
            )
            logger.info(f"Tunnel {tunnel_id} deleted from Cloudflare")
        except Exception as e:
            logger.exception(f"Error deleting tunnel from Cloudflare: {e}")
            # Try REST API as fallback
            try:
                delete_url = f"{cloudflare_service.base_url}/accounts/{cloudflare_service.account_id}/cfd_tunnel/{tunnel_id}"
                response = await cloudflare_service.http_client.delete(delete_url, headers=cloudflare_service.headers)
                if response.status_code not in [200, 204]:
                    logger.warning(f"Failed to delete tunnel from Cloudflare: {response.status_code}")
                    raise HTTPException(status_code=500, detail=f"Failed to delete tunnel from Cloudflare: {response.status_code}")
                logger.info(f"Tunnel {tunnel_id} deleted from Cloudflare via REST API")
            except Exception as rest_error:
                logger.exception(f"Error deleting tunnel via REST API: {rest_error}")
                raise HTTPException(status_code=500, detail=f"Failed to delete tunnel from Cloudflare: {str(e)}")
        
        # Step 5: Delete from database
        logger.info(f"Step 5: Deleting tunnel {tunnel_id} from database")
        await db.delete_tunnel(tunnel_id)
        
        logger.info(f"Tunnel {tunnel_id} deleted successfully by {current_user.get('username')}. DNS records: {dns_deleted_count} deleted, {dns_failed_count} failed")
        
        return {
            "success": True,
            "message": "Tunnel deleted successfully",
            "tunnel_id": tunnel_id,
            "dns_records_deleted": dns_deleted_count,
            "dns_records_failed": dns_failed_count
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting tunnel {tunnel_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting tunnel: {str(e)}")

