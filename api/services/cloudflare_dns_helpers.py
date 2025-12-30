"""
Helper functions for DNS record operations in CloudflareService
These functions are extracted from CloudflareService to improve code organization
"""

from typing import Optional, Dict, List, Tuple, Any
from api.utils.logger import logger
import httpx


def extract_subdomain_name(hostname: str, domain: str) -> Optional[str]:
    """
    Extract subdomain name from full hostname
    
    Args:
        hostname: Full hostname (e.g., app.example.com)
        domain: Domain name (e.g., example.com)
        
    Returns:
        Subdomain name (e.g., "app") or "@" for root domain, None if invalid
    """
    if hostname.endswith(f".{domain}"):
        return hostname[:-len(f".{domain}")]
    elif hostname == domain:
        return "@"
    else:
        logger.error(f"Hostname {hostname} does not match domain {domain}")
        return None


async def find_existing_dns_records(
    http_client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    name: str,
    hostname: str
) -> Tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Find existing DNS records for a given name/hostname
    
    Args:
        http_client: httpx async client
        url: Cloudflare API URL for DNS records
        headers: Request headers
        name: Subdomain name
        hostname: Full hostname
        
    Returns:
        Tuple of (existing_cname_record, conflicting_records)
    """
    existing_record: Optional[Dict[str, Any]] = None
    conflicting_records: List[Dict[str, Any]] = []
    
    # Try searching with subdomain first
    params = {"name": name}
    try:
        response = await http_client.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        # If no results, try searching with full hostname
        if not data.get("result") or len(data.get("result", [])) == 0:
            logger.info(f"No results with subdomain '{name}', trying full hostname '{hostname}'")
            params = {"name": hostname}
            response = await http_client.get(url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            logger.info(f"Search results with hostname '{hostname}': {data}")
        
        if data.get("success") and data.get("result"):
            records = data["result"]
            for record in records:
                record_name = record.get("name", "")
                record_type = record.get("type", "")
                
                # Check for exact match or partial match
                name_matches = (
                    record_name == name or 
                    record_name == hostname or
                    record_name.endswith(f".{name}") or
                    name.endswith(f".{record_name}") or
                    hostname.endswith(f".{record_name}") or
                    record_name.endswith(f".{hostname}")
                )
                
                if name_matches:
                    if record_type == "CNAME":
                        existing_record = record
                        logger.info(f"Found existing CNAME record: {existing_record.get('id')}, name: {existing_record.get('name')}, proxied: {existing_record.get('proxied')}")
                    elif record_type in ["A", "AAAA"]:
                        conflicting_records.append(record)
                        logger.warning(f"Found conflicting {record_type} record: {record.get('id')}, name: {record_name}")
                    else:
                        conflicting_records.append(record)
                        logger.warning(f"Found potentially conflicting {record_type} record: {record.get('id')}, name: {record_name}")
    except httpx.RequestError as e:
        logger.error(f"Error searching for DNS records: {e}")
    
    return existing_record, conflicting_records


async def delete_conflicting_records(
    http_client: httpx.AsyncClient,
    conflicting_records: List[Dict[str, Any]],
    zone_id: str,
    base_url: str,
    headers: Dict[str, str]
) -> None:
    """
    Delete conflicting DNS records (A, AAAA, etc.)
    
    Args:
        http_client: httpx async client
        conflicting_records: List of conflicting records to delete
        zone_id: Cloudflare zone ID
        base_url: Cloudflare API base URL
        headers: Request headers
    """
    for conflicting_record in conflicting_records:
        record_id = conflicting_record["id"]
        record_type = conflicting_record.get("type", "UNKNOWN")
        delete_url = f"{base_url}/zones/{zone_id}/dns_records/{record_id}"
        logger.info(f"Deleting conflicting {record_type} record: {delete_url}")
        try:
            delete_response = await http_client.delete(delete_url, headers=headers)
            delete_response.raise_for_status()
            delete_data = delete_response.json()
            if delete_data.get("success"):
                logger.info(f"Successfully deleted conflicting {record_type} record: {record_id}")
            else:
                logger.error(f"Failed to delete conflicting {record_type} record: {delete_data}")
        except Exception as e:
            logger.error(f"Error deleting conflicting {record_type} record {record_id}: {e}")


def determine_proxied_status(
    route_type: str,
    preserve_proxied: bool,
    existing_record: Optional[Dict[str, Any]]
) -> bool:
    """
    Determine if DNS record should be proxied based on route type
    
    Args:
        route_type: Type of route (HTTP, HTTPS, TCP, SSH)
        preserve_proxied: Whether to preserve existing proxied status
        existing_record: Existing DNS record (if any)
        
    Returns:
        True if record should be proxied, False otherwise
    """
    route_type_upper = str(route_type).upper().strip() if route_type else "HTTP"
    
    # If preserve_proxied is True and record exists, keep current proxied status
    if preserve_proxied and existing_record:
        proxied = existing_record.get("proxied", False)
        logger.info(f"Preserving proxied status: {proxied} (route type unchanged)")
        return proxied
    
    # HTTP and HTTPS routes should be proxied
    # TCP, SSH routes should not be proxied
    proxied = route_type_upper in ["HTTP", "HTTPS"]
    logger.debug(f"Route type: {route_type} (normalized: {route_type_upper}), Proxied: {proxied}")
    return proxied


def create_dns_record_body(
    name: str,
    tunnel_id: str,
    route_type: str,
    proxied: bool
) -> Dict[str, Any]:
    """
    Create DNS record body for Cloudflare API
    
    Args:
        name: DNS record name (subdomain)
        tunnel_id: Tunnel ID
        route_type: Route type
        proxied: Whether record should be proxied
        
    Returns:
        DNS record body dictionary
    """
    content = f"{tunnel_id}.cfargotunnel.com"
    return {
        "type": "CNAME",
        "name": name,
        "content": content,
        "proxied": proxied,
        "comment": f"Cloudflare Tunnel: {tunnel_id} (Type: {route_type})"
    }


async def update_existing_dns_record(
    http_client: httpx.AsyncClient,
    existing_record: Dict[str, Any],
    dns_body: Dict[str, Any],
    zone_id: str,
    base_url: str,
    headers: Dict[str, str],
    hostname: str
) -> bool:
    """
    Update an existing DNS record
    
    Args:
        http_client: httpx async client
        existing_record: Existing DNS record
        dns_body: DNS record body to update
        zone_id: Cloudflare zone ID
        base_url: Cloudflare API base URL
        headers: Request headers
        hostname: Hostname for logging
        
    Returns:
        True if update successful, False otherwise
    """
    record_id = existing_record["id"]
    current_proxied = existing_record.get("proxied", False)
    proxied = dns_body.get("proxied", False)
    
    # Only update proxied status if it's actually changing
    if current_proxied == proxied:
        logger.info(f"DNS record proxied status unchanged ({proxied}), skipping update")
        return True
    
    update_url = f"{base_url}/zones/{zone_id}/dns_records/{record_id}"
    logger.info(f"Updating DNS record: {update_url}")
    logger.info(f"Current record proxied status: {current_proxied}, New proxied status: {proxied}")
    
    try:
        response = await http_client.put(update_url, headers=headers, json=dns_body)
        response.raise_for_status()
        data = response.json()
        logger.info(f"DNS record updated: {hostname} -> {dns_body.get('content')}, proxied: {proxied}")
        
        if not data.get("success"):
            logger.error(f"DNS update response: {data}")
            if data.get("errors"):
                logger.error(f"DNS update errors: {data['errors']}")
            return False
        
        return True
    except httpx.RequestError as e:
        logger.exception(f"Error updating DNS record: {e}")
        return False


async def create_new_dns_record(
    http_client: httpx.AsyncClient,
    dns_body: Dict[str, Any],
    url: str,
    headers: Dict[str, str],
    name: str,
    hostname: str,
    base_url: str,
    zone_id: str
) -> bool:
    """
    Create a new DNS record with fallback to update if record already exists
    
    Args:
        http_client: httpx async client
        dns_body: DNS record body
        url: Cloudflare API URL for DNS records
        headers: Request headers
        name: Subdomain name
        hostname: Full hostname
        base_url: Cloudflare API base URL
        zone_id: Cloudflare zone ID
        
    Returns:
        True if create/update successful, False otherwise
    """
    logger.info(f"Creating new DNS record: {url}")
    
    try:
        response = await http_client.post(url, headers=headers, json=dns_body)
        response.raise_for_status()
        data = response.json()
        logger.info(f"DNS record created: {hostname} -> {dns_body.get('content')}, proxied: {dns_body.get('proxied')}")
        
        if not data.get("success"):
            logger.error(f"DNS create response: {data}")
            if data.get("errors"):
                for error in data["errors"]:
                    logger.error(f"DNS create error: {error}")
                
                # If error is about existing record, try to find and update it instead
                if any("already exists" in str(error.get("message", "")).lower() for error in data.get("errors", [])):
                    return await _handle_already_exists_error(http_client, url, headers, name, hostname, dns_body, base_url, zone_id)
            
            return False
        
        return True
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            return await _handle_http_400_error(http_client, e, url, headers, name, hostname, dns_body, base_url, zone_id)
        logger.exception(f"HTTP error creating DNS record: {e}")
        return False
    except httpx.RequestError as e:
        logger.exception(f"Error creating DNS record: {e}")
        return False


async def _handle_already_exists_error(
    http_client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    name: str,
    hostname: str,
    dns_body: Dict[str, Any],
    base_url: str,
    zone_id: str
) -> bool:
    """Handle 'already exists' error by finding and updating existing record"""
    logger.info("Record already exists, attempting to find and update it...")
    check_response = await http_client.get(url, headers=headers, params={"name": name})
    check_response.raise_for_status()
    check_data = check_response.json()
    
    if check_data.get("success") and check_data.get("result"):
        for record in check_data["result"]:
            if (record.get("name") == name or record.get("name") == hostname) and record.get("type") == "CNAME":
                record_id = record["id"]
                update_url = f"{base_url}/zones/{zone_id}/dns_records/{record_id}"
                logger.info(f"Updating existing CNAME record instead: {update_url}")
                update_response = await http_client.put(update_url, headers=headers, json=dns_body)
                update_response.raise_for_status()
                update_data = update_response.json()
                if update_data.get("success"):
                    logger.info(f"Successfully updated existing CNAME record: {hostname}")
                    return True
                else:
                    logger.error(f"Failed to update existing record: {update_data}")
                    return False
    
    return False


async def _handle_http_400_error(
    http_client: httpx.AsyncClient,
    e: httpx.HTTPStatusError,
    url: str,
    headers: Dict[str, str],
    name: str,
    hostname: str,
    dns_body: Dict[str, Any],
    base_url: str,
    zone_id: str
) -> bool:
    """Handle HTTP 400 error (usually 'already exists')"""
    error_data = e.response.json()
    logger.error(f"HTTP 400 error when creating DNS record: {error_data}")
    
    if error_data.get("errors"):
        for error in error_data["errors"]:
            error_msg = str(error.get("message", "")).lower()
            logger.error(f"Error message: {error_msg}")
            if "already exists" in error_msg:
                return await _handle_already_exists_error(http_client, url, headers, name, hostname, dns_body, base_url, zone_id)
    
    return False

