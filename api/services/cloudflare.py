import httpx
import asyncio
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime
from cloudflare import Cloudflare

from api.utils.logger import logger
from api.utils.exceptions import CloudflareAPIError
from api.services.cloudflare_dns_helpers import (
    extract_subdomain_name,
    find_existing_dns_records
)


class CloudflareService:
    """Service for interacting with Cloudflare API"""
    
    def __init__(self, api_token: str, account_id: str, domain: str) -> None:
        """
        Initialize CloudflareService
        
        Args:
            api_token: Cloudflare API token
            account_id: Cloudflare account ID
            domain: Domain name (e.g., example.com)
        """
        self.api_token: str = api_token
        self.account_id: str = account_id
        self.domain: str = domain
        self.base_url: str = "https://api.cloudflare.com/client/v4"
        self.headers: Dict[str, str] = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        
        # Initialize Cloudflare SDK client
        self.sdk_client = Cloudflare(api_token=api_token)
        # Create httpx client for async requests
        self.http_client = httpx.AsyncClient(timeout=10.0)
    
    async def __aenter__(self):
        """Async context manager entry"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.http_client.aclose()
    
    async def verify_permissions(self) -> Dict[str, Any]:
        """
        Verify that API token has required permissions for tunnel management
        
        Required permissions:
        - Account: Cloudflare Tunnel: Edit
        - Zone: DNS: Edit
        
        Returns:
            Dict with permission verification results including:
            - success: bool
            - has_required_permissions: bool
            - missing_permissions: list of missing permissions
            - permissions: list of all permissions
            - permission_details: dict with detailed check for each permission
            - errors: list of error messages
        """
        result = {
            "success": False,
            "has_required_permissions": False,
            "missing_permissions": [],
            "permissions": [],
            "permission_details": {},
            "errors": []
        }
        
        required_permissions = [
            "Account: Cloudflare Tunnel: Edit",
            "Zone: DNS: Edit"
        ]
        
        try:
            # Get token permissions from verify endpoint
            verify_url = f"{self.base_url}/user/tokens/verify"
            verify_response = await self.http_client.get(verify_url, headers=self.headers)
            
            if verify_response.status_code == 200:
                verify_data = verify_response.json()
                if verify_data.get("success"):
                    token_info = verify_data.get("result", {})
                    permissions = token_info.get("permissions", [])
                    result["permissions"] = permissions
                    
                    # Check each permission individually
                    permission_details = {}
                    
                    # Process permissions one by one (always process, even if some fail)
                    for required_perm in required_permissions:
                        perm_result = {
                            "found": False,
                            "verified": False,
                            "error": None
                        }
                        
                        # Check in permissions list first
                        found_in_list = False
                        for perm in permissions:
                            if isinstance(perm, dict):
                                perm_str = perm.get("permission", "")
                            else:
                                perm_str = str(perm)
                            
                            # Check if permission matches
                            if required_perm in perm_str:
                                found_in_list = True
                                break
                            # Check for partial matches
                            perm_parts = required_perm.split(": ")
                            if len(perm_parts) >= 2:
                                resource = perm_parts[0]
                                action = perm_parts[-1]
                                if resource in perm_str and action in perm_str:
                                    found_in_list = True
                                    break
                        
                        perm_result["found"] = found_in_list
                        
                        # Special check for "Account: Cloudflare Tunnel: Edit" - test actual access using tunnels.list()
                        if required_perm == "Account: Cloudflare Tunnel: Edit":
                            try:
                                # Try to list tunnels - if we can access tunnels, Tunnel Edit permission exists
                                tunnels_page = await asyncio.to_thread(
                                    self.sdk_client.zero_trust.tunnels.list,
                                    account_id=self.account_id
                                )
                                
                                # If we can call tunnels.list() without exception, Tunnel Edit permission exists
                                # Even if result is empty, the fact that we can call it means permission exists
                                perm_result["verified"] = True
                                perm_result["found"] = True
                                logger.debug(f"Account: Cloudflare Tunnel: Edit permission verified by successful tunnels.list() call")
                            except Exception as tunnel_error:
                                # If exception occurs, check if it's authentication/permission error
                                error_msg = str(tunnel_error)
                                has_auth_error = False
                                error_code = None
                                
                                if hasattr(tunnel_error, 'response'):
                                    try:
                                        response = getattr(tunnel_error, 'response')
                                        if hasattr(response, 'json'):
                                            error_data = response.json()
                                            logger.debug(f"Account: Cloudflare Tunnel: Edit error response: {error_data}")
                                            if error_data.get("errors"):
                                                for err in error_data.get("errors", []):
                                                    if isinstance(err, dict):
                                                        code = err.get("code")
                                                        message = err.get("message", "")
                                                        # Check for code 10000 (Authentication error)
                                                        if code == 10000 or (code and "authentication" in message.lower()):
                                                            has_auth_error = True
                                                            error_code = code
                                                            break
                                    except:
                                        pass
                                
                                # Check error message for 10000 or authentication
                                if not has_auth_error:
                                    if "10000" in error_msg or ("authentication" in error_msg.lower() and "error" in error_msg.lower()):
                                        has_auth_error = True
                                
                                if has_auth_error:
                                    perm_result["verified"] = False
                                    perm_result["found"] = False
                                    perm_result["error"] = f"Authentication error (code: {error_code or '10000'})"
                                    logger.warning(f"Account: Cloudflare Tunnel: Edit permission denied - {error_code or '10000'} error")
                                else:
                                    # Other error - check status code
                                    if hasattr(tunnel_error, 'response'):
                                        try:
                                            response = getattr(tunnel_error, 'response')
                                            if hasattr(response, 'status_code'):
                                                status_code = response.status_code
                                                if status_code == 401 or status_code == 403:
                                                    # 401/403 is authentication/permission error
                                                    perm_result["verified"] = False
                                                    perm_result["found"] = False
                                                    perm_result["error"] = f"Permission denied ({status_code})"
                                                    logger.warning(f"Account: Cloudflare Tunnel: Edit permission denied - {status_code}")
                                                else:
                                                    # Other status code - assume permission exists
                                                    perm_result["verified"] = True
                                                    perm_result["found"] = True
                                                    logger.debug(f"Account: Cloudflare Tunnel: Edit permission verified (HTTP {status_code})")
                                            else:
                                                # No status code - assume permission exists
                                                perm_result["verified"] = True
                                                perm_result["found"] = True
                                                logger.debug(f"Account: Cloudflare Tunnel: Edit permission verified (no status code)")
                                        except:
                                            # Assume permission exists if we can't determine
                                            perm_result["verified"] = True
                                            perm_result["found"] = True
                                            logger.debug(f"Account: Cloudflare Tunnel: Edit permission verified (exception parsing failed)")
                                    else:
                                        # No response attribute - assume permission exists
                                        perm_result["verified"] = True
                                        perm_result["found"] = True
                                        logger.debug(f"Account: Cloudflare Tunnel: Edit permission verified (no response attribute)")
                        
                        # Special check for "Zone: DNS: Edit" - test actual access using zones.list()
                        elif required_perm == "Zone: DNS: Edit":
                            try:
                                # Try to list zones - if we can access zones, DNS permission exists
                                zones_page = await asyncio.to_thread(

                                    self.sdk_client.zones.list,

                                    name=self.domain

                                )
                                
                                # Check if result exists and has zones
                                # If result is empty (no zones), it means permission is missing (like Step 2 logic)
                                if hasattr(zones_page, 'result') and zones_page.result:
                                    # Zones found - permission exists
                                    perm_result["verified"] = True
                                    perm_result["found"] = True
                                    logger.debug(f"Zone: DNS: Edit permission verified - zones found")
                                else:
                                    # Empty result - permission missing (same logic as Step 2)
                                    perm_result["verified"] = False
                                    perm_result["found"] = False
                                    perm_result["error"] = "Permission denied - cannot access zones"
                                    logger.warning(f"Zone: DNS: Edit permission denied - empty result")
                            except Exception as zone_error:
                                # If exception occurs, check if it's permission error
                                error_msg = str(zone_error)
                                has_permission_error = False
                                error_code = None
                                
                                if hasattr(zone_error, 'response'):
                                    try:
                                        response = getattr(zone_error, 'response')
                                        if hasattr(response, 'json'):
                                            error_data = response.json()
                                            logger.debug(f"Zone: DNS: Edit error response: {error_data}")
                                            if error_data.get("errors"):
                                                for err in error_data.get("errors", []):
                                                    if isinstance(err, dict):
                                                        code = err.get("code")
                                                        message = err.get("message", "")
                                                        if code == 9109 or (code and "unauthorized" in message.lower() and "access" in message.lower()):
                                                            has_permission_error = True
                                                            error_code = code
                                                            break
                                    except:
                                        pass
                                
                                # Check error message for 9109 or unauthorized
                                if not has_permission_error:
                                    if "9109" in error_msg or ("unauthorized" in error_msg.lower() and "access" in error_msg.lower() and "requested resource" in error_msg.lower()):
                                        has_permission_error = True
                                
                                if has_permission_error:
                                    perm_result["verified"] = False
                                    perm_result["found"] = False
                                    perm_result["error"] = f"Permission denied (code: {error_code or '9109'})"
                                    logger.warning(f"Zone: DNS: Edit permission denied - {error_code or '9109'} error")
                                else:
                                    # Other error - check status code
                                    if hasattr(zone_error, 'response'):
                                        try:
                                            response = getattr(zone_error, 'response')
                                            if hasattr(response, 'status_code'):
                                                status_code = response.status_code
                                                if status_code == 403:
                                                    # 403 is always permission error
                                                    perm_result["verified"] = False
                                                    perm_result["found"] = False
                                                    perm_result["error"] = "Permission denied (403)"
                                                    logger.warning(f"Zone: DNS: Edit permission denied - 403 Forbidden")
                                                else:
                                                    # Other status code - assume permission exists
                                                    perm_result["verified"] = True
                                                    perm_result["found"] = True
                                                    logger.debug(f"Zone: DNS: Edit permission verified (HTTP {status_code})")
                                            else:
                                                # No status code - assume permission exists
                                                perm_result["verified"] = True
                                                perm_result["found"] = True
                                                logger.debug(f"Zone: DNS: Edit permission verified (no status code)")
                                        except:
                                            # Assume permission exists if we can't determine
                                            perm_result["verified"] = True
                                            perm_result["found"] = True
                                            logger.debug(f"Zone: DNS: Edit permission verified (exception parsing failed)")
                                    else:
                                        # No response attribute - assume permission exists
                                        perm_result["verified"] = True
                                        perm_result["found"] = True
                                        logger.debug(f"Zone: DNS: Edit permission verified (no response attribute)")
                        else:
                            # For other permissions, just check if found in list
                            perm_result["verified"] = found_in_list
                        
                        permission_details[required_perm] = perm_result
                        
                        # Add to missing if not verified
                        if not perm_result["verified"]:
                            result["missing_permissions"].append(required_perm)
                    
                    result["permission_details"] = permission_details
                    
                    # Set success based on all permissions being verified
                    if len(result["missing_permissions"]) == 0:
                        result["has_required_permissions"] = True
                        result["success"] = True
                        logger.info("All required permissions verified successfully")
                    else:
                        # Don't add error here - let frontend handle display based on permission_details
                        result["success"] = False
                        logger.warning(f"Missing permissions: {result['missing_permissions']}")
                else:
                    result["errors"].append("Failed to verify token permissions")
                    logger.error("Token verification failed")
            else:
                result["errors"].append(f"Failed to verify permissions: HTTP {verify_response.status_code}")
                logger.error(f"Permission verification failed with status {verify_response.status_code}")
                
        except Exception as e:
            logger.exception(f"Error verifying permissions: {e}")
            result["errors"].append(f"Error verifying permissions: {str(e)}")
        
        return result
    
    async def verify_credentials(self) -> Dict[str, Any]:
        """
        Verify Cloudflare API token, account ID, and check if domain exists in the account using SDK
        
        Returns:
            Dict with verification results including:
            - success: bool
            - token_valid: bool
            - account_valid: bool
            - domain_valid: bool
            - permissions: list of permissions
            - errors: list of error messages
        """
        result = {
            "success": False,
            "token_valid": False,
            "account_valid": False,
            "domain_valid": False,
            "permissions": [],
            "errors": []
        }
        
        try:
            # Step 1: Verify API token using REST API (SDK doesn't have token verify endpoint)
            # This endpoint is specific and not available in SDK
            verify_url = f"{self.base_url}/user/tokens/verify"
            verify_response = await self.http_client.get(verify_url, headers=self.headers)
            
            if verify_response.status_code == 200:
                verify_data = verify_response.json()
                if verify_data.get("success"):
                    result["token_valid"] = True
                    token_info = verify_data.get("result", {})
                    result["permissions"] = token_info.get("permissions", [])
                    logger.info("Cloudflare API token verified successfully")
                else:
                    result["errors"].append("Invalid API token")
                    logger.error("Cloudflare API token verification failed: Invalid token")
                    return result
            elif verify_response.status_code == 401:
                # 401 Unauthorized - Invalid token
                result["errors"].append("Invalid Cloudflare API token. Please check your token and try again.")
                logger.error("Cloudflare API token verification failed: 401 Unauthorized")
                return result
            elif verify_response.status_code == 403:
                # 403 Forbidden - Token doesn't have required permissions
                error_detail = "Cloudflare API token does not have required permissions"
                try:
                    error_data = verify_response.json()
                    if error_data.get("errors"):
                        error_messages = [err.get("message", "") for err in error_data.get("errors", [])]
                        if error_messages:
                            error_detail = ", ".join(error_messages)
                except:
                    pass
                result["errors"].append(error_detail)
                logger.error(f"Cloudflare API token verification failed: {error_detail}")
                return result
            else:
                error_detail = f"Token verification failed with status {verify_response.status_code}"
                try:
                    error_data = verify_response.json()
                    if error_data.get("errors"):
                        error_messages = [err.get("message", "") for err in error_data.get("errors", [])]
                        if error_messages:
                            # Check for common error messages and translate them
                            translated_messages = []
                            for msg in error_messages:
                                msg_lower = msg.lower()
                                if "invalid request headers" in msg_lower or "invalid token" in msg_lower:
                                    translated_messages.append("Invalid Cloudflare API token. Please check your token and try again.")
                                elif "authentication" in msg_lower or "unauthorized" in msg_lower:
                                    translated_messages.append("Authentication failed. Please verify your Cloudflare API token.")
                                else:
                                    translated_messages.append(msg)
                            error_detail = ", ".join(translated_messages) if translated_messages else ", ".join(error_messages)
                except:
                    pass
                result["errors"].append(error_detail)
                logger.error(f"Cloudflare API token verification failed: {error_detail}")
                return result
            
            # Step 2: Verify domain exists and check Account ID from zone (only if token is valid)
            if result["token_valid"]:
                try:
                    # First, check if token can access zones at all (permission check)
                    # Try to list zones without name filter to check permissions
                    logger.debug(f"Checking if token can access zones (permission check)")
                    all_zones_page = None
                    can_access_zones = False
                    try:
                        all_zones_page = await asyncio.to_thread(
                            self.sdk_client.zones.list
                        )
                        if hasattr(all_zones_page, 'result'):
                            can_access_zones = True
                            logger.debug(f"Token can access zones - found {len(all_zones_page.result) if all_zones_page.result else 0} zone(s)")
                        else:
                            logger.warning("Token cannot access zones - zones.list() returned unexpected structure")
                    except Exception as perm_error:
                        error_code = None
                        if hasattr(perm_error, 'response'):
                            try:
                                response = getattr(perm_error, 'response')
                                if hasattr(response, 'json'):
                                    error_data = response.json()
                                    if error_data.get("errors"):
                                        error_code = error_data["errors"][0].get("code")
                            except:
                                pass
                        
                        # Check for permission-related error codes
                        if error_code in [9109, 10000, 10001] or (hasattr(perm_error, 'response') and getattr(perm_error.response, 'status_code', None) == 403):
                            logger.warning(f"Token cannot access zones - permission denied (error code: {error_code})")
                            can_access_zones = False
                        else:
                            logger.warning(f"Error checking zones access: {perm_error}")
                            can_access_zones = False
                    
                    # If token cannot access zones, it's a permission issue
                    if not can_access_zones:
                        result["domain_valid"] = False
                        result["errors"].append("API token is valid but missing required permissions to access zones. Please proceed to permissions verification step.")
                        result["success"] = False
                        logger.warning("Token valid but cannot access zones - permission issue (Zone: DNS: Edit permission missing)")
                        return result
                    
                    # Token can access zones, now check if domain exists
                    logger.debug(f"Checking if domain '{self.domain}' exists using Cloudflare SDK")
                    zones_page = await asyncio.to_thread(
                        self.sdk_client.zones.list,
                        name=self.domain
                    )
                    
                    # Check result
                    domain_found = False
                    if hasattr(zones_page, 'result') and zones_page.result:
                        logger.debug(f"Found {len(zones_page.result)} zone(s) matching domain name")
                        for zone in zones_page.result:
                            # Convert zone object to dict
                            if hasattr(zone, 'model_dump'):
                                zone_dict = zone.model_dump(mode='json')
                            elif hasattr(zone, 'dict'):
                                zone_dict = zone.dict()
                            else:
                                # If model_dump and dict are not available, get main fields manually
                                zone_dict = {
                                    "id": getattr(zone, 'id', None),
                                    "name": getattr(zone, 'name', None),
                                    "status": getattr(zone, 'status', None),
                                    "account": getattr(zone, 'account', None),
                                    "name_servers": getattr(zone, 'name_servers', None),
                                    "type": getattr(zone, 'type', None),
                                    "created_on": getattr(zone, 'created_on', None),
                                    "modified_on": getattr(zone, 'modified_on', None),
                                }
                            
                            # Log all zone fields for debugging
                            logger.debug(f"Zone object fields: {list(zone_dict.keys())}")
                            
                            zone_name = zone_dict.get("name", "")
                            zone_id = zone_dict.get("id", "")
                            zone_status = zone_dict.get("status", "")
                            
                            logger.debug(f"Checking zone: name='{zone_name}', id='{zone_id}', status='{zone_status}'")
                            
                            if zone_name.lower() == self.domain.lower():
                                domain_found = True
                                
                                # Check Account ID from zone object
                                zone_account = zone_dict.get("account", {})
                                if isinstance(zone_account, dict):
                                    zone_account_id = zone_account.get("id", "")
                                    zone_account_name = zone_account.get("name", "")
                                else:
                                    # If account is an object not a dict
                                    zone_account_id = getattr(zone_account, 'id', None) if zone_account else None
                                    zone_account_name = getattr(zone_account, 'name', None) if zone_account else None
                                
                                logger.debug(f"Zone account ID: '{zone_account_id}', Provided account ID: '{self.account_id}'")
                                
                                if zone_account_id:
                                    if zone_account_id == self.account_id:
                                        result["account_valid"] = True
                                        result["domain_valid"] = True
                                        logger.info(f"Domain '{self.domain}' and Account ID verified successfully (Zone ID: {zone_id}, Account: {zone_account_name})")
                                    else:
                                        result["errors"].append("Invalid Cloudflare Account ID. The provided Account ID does not match the account that owns this domain.")
                                        result["success"] = False
                                        logger.warning(f"Account ID mismatch. Zone account: '{zone_account_id}', Provided: '{self.account_id}'")
                                else:
                                    result["errors"].append("Account ID not found in zone response")
                                    result["success"] = False
                                    logger.error("Account ID not found in zone account object")
                                
                                break
                    
                    if not domain_found:
                    # Token can access zones but domain not found - domain doesn't exist in account
                        result["domain_valid"] = False
                        result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account. Please verify that the domain is added to your Cloudflare account.")
                        result["success"] = False
                        logger.warning(f"Domain '{self.domain}' not found in Cloudflare account (token can access zones)")
                        
                except Exception as e:
                    error_msg = str(e)
                    error_type = type(e).__name__
                    
                    # Check error type and convert to clear message
                    # Check for common Cloudflare API error patterns
                    error_lower = error_msg.lower()
                    
                    # Check for Cloudflare API error structure (9109 Unauthorized)
                    has_permission_error = False
                    error_code = None
                    error_message = ""
                    
                    # Check if exception has response attribute (SDK or requests errors)
                    if hasattr(e, 'response'):
                        try:
                            response = getattr(e, 'response')
                            if hasattr(response, 'json'):
                                try:
                                    error_data = response.json()
                                    logger.debug(f"Error response data: {error_data}")
                                    if error_data.get("errors"):
                                        for err in error_data.get("errors", []):
                                            if isinstance(err, dict):
                                                code = err.get("code")
                                                message = err.get("message", "")
                                                logger.debug(f"Error code: {code}, message: {message}")
                                                if code == 9109 or (code and "unauthorized" in message.lower() and "access" in message.lower()):
                                                    has_permission_error = True
                                                    error_code = code
                                                    error_message = message
                                                    logger.warning(f"Permission error detected: code={code}, message={message}")
                                                    break
                                except Exception as json_err:
                                    logger.debug(f"Error parsing JSON from response: {json_err}")
                        except Exception as resp_err:
                            logger.debug(f"Error accessing response: {resp_err}")
                    
                    # Also check error message string for 9109
                    if not has_permission_error:
                        if "9109" in error_msg or ("unauthorized" in error_lower and "access" in error_lower and "requested resource" in error_lower):
                            has_permission_error = True
                            logger.warning(f"Permission error detected in error message: {error_msg}")
                    
                    # Permission errors (including 9109) - check this FIRST and ALWAYS return permission error if detected
                    if has_permission_error:
                        # If token is valid but permissions are missing, allow to proceed
                        if result["token_valid"]:
                            result["domain_valid"] = False
                            result["errors"].append("API token is valid but missing required permissions to access zones. Please proceed to permissions verification step.")
                            result["success"] = False
                            logger.warning(f"Permission error (code: {error_code}): Token valid but missing permissions to access zones")
                            return result  # Return early to avoid other error handling
                        else:
                            result["errors"].append("Cloudflare API token does not have required permissions to access zones")
                            result["success"] = False
                            return result
                    # Authentication errors
                    elif any(keyword in error_lower for keyword in [
                        "authentication", "unauthorized", "401", 
                        "invalid request headers", "invalid token",
                        "authentication error", "api key", "bearer"
                    ]):
                        result["errors"].append("Invalid Cloudflare API token. Please check your token and try again.")
                    # Not found errors - only if it's really a 404
                    elif any(keyword in error_lower for keyword in [
                        "not found", "404", "does not exist"
                    ]) and not has_permission_error:
                        # Check if it's actually a 404 or permission issue
                        if hasattr(e, 'status_code') and getattr(e, 'status_code') == 404:
                            result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                        elif hasattr(e, 'response'):
                            try:
                                response = getattr(e, 'response')
                                if hasattr(response, 'status_code') and response.status_code == 404:
                                    result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                                else:
                                    # Might be permission issue
                                    if result["token_valid"] and result["account_valid"]:
                                        result["domain_valid"] = False
                                        result["errors"].append("API token is valid but missing required permissions to access zones. Please proceed to permissions verification step.")
                                        result["success"] = False
                                    else:
                                        result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                            except:
                                result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                        else:
                            result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                    # Check if exception has status_code attribute (HTTP errors)
                    elif hasattr(e, 'status_code'):
                        status_code = getattr(e, 'status_code')
                        if status_code == 401:
                            result["errors"].append("Invalid Cloudflare API token. Please check your token and try again.")
                        elif status_code == 403:
                            # 403 is always a permission error
                            if result["token_valid"]:
                                result["domain_valid"] = False
                                result["errors"].append("API token is valid but missing required permissions to access zones. Please proceed to permissions verification step.")
                                result["success"] = False
                                logger.warning(f"403 Forbidden: Token valid but missing permissions")
                                return result
                            else:
                                result["errors"].append("Cloudflare API token does not have required permissions to access zones")
                                result["success"] = False
                                return result
                        elif status_code == 404:
                            result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                        else:
                            result["errors"].append(f"Error verifying domain (HTTP {status_code}): {error_msg}")
                    # Check if exception has response attribute (requests-like errors)
                    elif hasattr(e, 'response'):
                        try:
                            response = getattr(e, 'response')
                            if hasattr(response, 'status_code'):
                                status_code = response.status_code
                                if status_code == 401:
                                    result["errors"].append("Invalid Cloudflare API token. Please check your token and try again.")
                                elif status_code == 403:
                                    # 403 is always a permission error
                                    if result["token_valid"]:
                                        result["domain_valid"] = False
                                        result["errors"].append("API token is valid but missing required permissions to access zones. Please proceed to permissions verification step.")
                                        result["success"] = False
                                        logger.warning(f"403 Forbidden: Token valid but missing permissions")
                                        return result
                                    else:
                                        result["errors"].append("Cloudflare API token does not have required permissions to access zones")
                                        result["success"] = False
                                        return result
                                elif status_code == 404:
                                    result["errors"].append(f"Domain '{self.domain}' not found in your Cloudflare account")
                                else:
                                    result["errors"].append(f"Error verifying domain (HTTP {status_code}): {error_msg}")
                            else:
                                result["errors"].append(f"Error verifying domain: {error_msg}")
                        except:
                            result["errors"].append(f"Error verifying domain: {error_msg}")
                    else:
                        # Unknown error - if token is valid, assume permission issue
                        if result["token_valid"]:
                            result["domain_valid"] = False
                            result["errors"].append("API token is valid but unable to access zones. This may be a permissions issue. Please proceed to permissions verification step.")
                            result["success"] = False
                            logger.warning(f"Unknown error but token is valid - assuming permission issue: {error_msg}")
                        else:
                            result["errors"].append(f"Error verifying domain: {error_msg}")
                    
                    result["success"] = False
                    logger.exception(f"Error verifying domain using SDK: {e} (type: {error_type}, code: {error_code}, message: {error_message})")
            
            # Set success to True only if token, account, and domain are all valid
            if result["token_valid"] and result["account_valid"] and result["domain_valid"]:
                result["success"] = True
            
        except httpx.RequestError as e:
            result["errors"].append(f"Network error: {str(e)}")
            logger.exception(f"Network error verifying Cloudflare token: {e}")
        except Exception as e:
            logger.exception(f"Error verifying Cloudflare credentials: {e}")
            result["errors"].append(f"Unexpected error: {str(e)}")
        
        return result
    
    def _record_to_dict(self, record) -> Dict[str, Any]:
        """
        Convert record object to dictionary
        
        Args:
            record: Record object from SDK
            
        Returns:
            Dict: Record as dictionary
        """
        if hasattr(record, 'model_dump'):
            return record.model_dump(mode='json')
        elif hasattr(record, 'dict'):
            return record.dict()
        else:
            return {
                "id": getattr(record, 'id', None),
                "name": getattr(record, 'name', None),
                "proxied": getattr(record, 'proxied', None),
                "type": getattr(record, 'type', None),
                "content": getattr(record, 'content', None)
            }
    
    def _find_dns_record_in_results(self, records_page, name: str, hostname: str) -> Optional[Tuple[str, Optional[bool]]]:
        """
        Search for DNS record in SDK results
        
        Args:
            records_page: Results from SDK
            name: Subdomain name
            hostname: Full hostname
            
        Returns:
            Tuple of (record_id, existing_proxied) or None
        """
        if not hasattr(records_page, 'result') or not records_page.result:
            return None
        
        name_lower = name.lower()
        hostname_lower = hostname.lower()
        domain_lower = self.domain.lower()
        
        for record in records_page.result:
            record_dict = self._record_to_dict(record)
            record_name = record_dict.get("name", "")
            record_name_lower = record_name.lower()
            
            # Check match - case-insensitive
            if (record_name_lower == name_lower or 
                record_name_lower == hostname_lower or 
                record_name_lower == f"{name_lower}.{domain_lower}"):
                record_id = record_dict.get("id")
                existing_proxied = record_dict.get("proxied")
                return (record_id, existing_proxied)
        
        return None
    
    async def set_tunnel_config(self, tunnel_id: str, hostname: str, port: int = 5986) -> bool:
        """
        Set Tunnel Config to route traffic to localhost:port using official Cloudflare SDK
        
        Args:
            tunnel_id: Tunnel ID
            hostname: Hostname for Tunnel
            port: Destination port (default 5986)
        
        Returns:
            bool: Success or failure
        """
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Setting tunnel config using Cloudflare SDK for tunnel {tunnel_id}, hostname: {hostname}, port: {port}")
            
            # Build config object
            config_dict = {
                "ingress": [
                    {
                        "hostname": hostname,
                        "service": f"tcp://localhost:{port}"
                    },
                    {
                        "service": "http_status:404"
                    }
                ]
            }
            
            # Update config with SDK
            configuration = await asyncio.to_thread(

                self.sdk_client.zero_trust.tunnels.cloudflared.configurations.update,

                
                tunnel_id=tunnel_id,
                account_id=self.account_id,
                config=config_dict
            

            )
            
            # Check success - use same logic as update_tunnel_config
            if hasattr(configuration, 'success') and configuration.success:
                logger.debug(f"Successfully set tunnel config using SDK (success=True)")
                return True
            elif hasattr(configuration, 'result') and configuration.result:
                result = configuration.result
                # Check that result is valid
                if hasattr(result, 'tunnel_id') or hasattr(result, 'config') or (isinstance(result, dict) and (result.get('tunnel_id') or result.get('config'))):
                    logger.debug(f"Successfully set tunnel config using SDK (has valid result)")
                    return True
                logger.debug(f"Successfully set tunnel config using SDK (has result)")
                return True
            else:
                logger.warning("Config update response doesn't indicate success")
                return False
                
        except Exception as e:
            logger.exception(f"Error setting tunnel config with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{tunnel_id}/configurations"
                
                config = {
                    "config": {
                        "ingress": [
                            {
                                "hostname": hostname,
                                "service": f"tcp://localhost:{port}"
                            },
                            {
                                "service": "http_status:404"
                            }
                        ]
                    }
                }
                
                response = await self.http_client.put(url, headers=self.headers, json=config)
                response.raise_for_status()
                data = response.json()
                return data.get("success", False)
            except httpx.HTTPError as req_error:
                logger.exception(f"Error setting tunnel config with REST API: {req_error}")
                return False
    
    async def update_tunnel_config(self, tunnel_id: str, config: Dict[str, Any]) -> bool:
        """
        Update Tunnel Config using official Cloudflare SDK
        
        Args:
            tunnel_id: Tunnel ID
            config: Config object with ingress array (can include "config" key or be directly a config object)
        
        Returns:
            bool: Success or failure
        """
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Updating tunnel config using Cloudflare SDK for tunnel {tunnel_id}")
            
            # Extract config from dict if "config" key exists
            config_data = config.get("config", config) if isinstance(config, dict) and "config" in config else config
            
            # Ensure config_data is a dict
            if not isinstance(config_data, dict):
                raise ValueError(f"config_data must be a dict, got {type(config_data)}")
            
            # Convert warp-routing to warp_routing for SDK (SDK may prefer snake_case)
            if "warp-routing" in config_data:
                warp_routing_value = config_data.pop("warp-routing")
                if warp_routing_value:  # Only add if not None/empty
                    config_data["warp_routing"] = warp_routing_value
                    logger.debug("Converted warp-routing to warp_routing for SDK")
            
            # Clean empty or None fields (but always keep ingress)
            cleaned_config = {}
            for k, v in config_data.items():
                if k == "ingress":
                    cleaned_config[k] = v  # Always keep ingress
                elif v is not None and v != {}:
                    cleaned_config[k] = v
            config_data = cleaned_config
            
            logger.debug(f"Sending config to SDK with keys: {list(config_data.keys())}")
            logger.debug(f"Config ingress count: {len(config_data.get('ingress', []))}")
            
            # Update config with SDK
            configuration = await asyncio.to_thread(

                self.sdk_client.zero_trust.tunnels.cloudflared.configurations.update,

                
                tunnel_id=tunnel_id,
                account_id=self.account_id,
                config=config_data
            

            )
            
            # Check success - ConfigurationUpdateResponse has fields account_id, config, created_at, source, tunnel_id, version
            logger.debug(f"SDK response type: {type(configuration)}")
            
            # Check that response has tunnel_id or config (sign of success)
            if hasattr(configuration, 'tunnel_id') and configuration.tunnel_id:
                logger.info(f"Successfully updated tunnel config using SDK (has tunnel_id: {configuration.tunnel_id})")
                return True
            
            if hasattr(configuration, 'config') and configuration.config:
                logger.info(f"Successfully updated tunnel config using SDK (has config)")
                return True
            
            # Check success flag (if exists)
            if hasattr(configuration, 'success'):
                success_value = configuration.success
                logger.debug(f"SDK response success: {success_value}")
                if success_value:
                    logger.info(f"Successfully updated tunnel config using SDK (success=True)")
                    return True
            
            # Check result (if exists)
            if hasattr(configuration, 'result'):
                result = configuration.result
                logger.debug(f"SDK response has result: {result is not None}")
                if result is not None:
                    # If result exists, check if it has tunnel_id or config
                    if hasattr(result, 'tunnel_id') or hasattr(result, 'config'):
                        logger.info(f"Successfully updated tunnel config using SDK (has valid result)")
                        return True
                    # Or if result is a dict and has tunnel_id or config
                    elif isinstance(result, dict):
                        if result.get('tunnel_id') or result.get('config'):
                            logger.info(f"Successfully updated tunnel config using SDK (result dict has tunnel_id/config)")
                            return True
            
            # Check errors
            if hasattr(configuration, 'errors'):
                errors = configuration.errors
                if errors:
                    error_msg = str(errors) if errors else "Unknown errors"
                    logger.error(f"SDK returned errors: {error_msg}")
                    # If errors exist, fallback to REST API
                    raise Exception(f"SDK returned errors: {error_msg}")
            
            # If response exists but no success indicator, check if at least response object is valid
            if configuration is not None:
                # If response exists, probably successful (SDK may just return object)
                logger.info(f"SDK returned response object (type: {type(configuration).__name__}), assuming success")
                return True
            else:
                logger.error("SDK returned None or empty response")
                return False
                
        except Exception as e:
            logger.exception(f"Error updating tunnel config with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{tunnel_id}/configurations"
                
                # Use original config passed to method (not config_data which was modified)
                # and convert warp_routing to warp-routing for REST API
                rest_config = config.copy() if isinstance(config, dict) else config
                if isinstance(rest_config, dict) and "config" not in rest_config:
                    rest_config = {"config": rest_config}
                
                # If warp_routing was in config_data, must convert to warp-routing
                if isinstance(rest_config, dict) and "config" in rest_config:
                    config_inner = rest_config["config"]
                    if isinstance(config_inner, dict) and "warp_routing" in config_inner:
                        warp_value = config_inner.pop("warp_routing")
                        config_inner["warp-routing"] = warp_value
                
                logger.debug(f"Using REST API with config keys: {list(rest_config.get('config', {}).keys()) if isinstance(rest_config, dict) else 'non-dict'}")
                
                response = await self.http_client.put(url, headers=self.headers, json=rest_config)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success", False):
                    logger.info("Successfully updated tunnel config using REST API fallback")
                    return True
                else:
                    errors = data.get("errors", [])
                    error_msg = str(errors) if errors else "Unknown error"
                    logger.error(f"REST API returned errors: {error_msg}")
                    return False
                    
            except httpx.HTTPError as req_error:
                logger.exception(f"Error updating tunnel config with REST API: {req_error}")
                return False
    
    async def list_tunnels(self) -> List[Dict[str, Any]]:
        """
        Get list of Tunnels using official Cloudflare SDK
        
        Returns:
            List[Dict]: List of Tunnels
        """
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Fetching tunnels list using Cloudflare SDK for account {self.account_id}")
            
            # Get list of Tunnels with SDK
            page = await asyncio.to_thread(

                self.sdk_client.zero_trust.tunnels.list,

                
                account_id=self.account_id
            

            )
            
            # Convert result to list of dictionaries
            tunnels_list = []
            
            # Check if request was successful
            if hasattr(page, 'result') and page.result:
                for tunnel in page.result:
                    # Convert tunnel object to dictionary using model_dump if Pydantic
                    try:
                        # If tunnel is a Pydantic model, use model_dump
                        if hasattr(tunnel, 'model_dump'):
                            tunnel_dict = tunnel.model_dump(mode='json')
                        elif hasattr(tunnel, 'dict'):
                            tunnel_dict = tunnel.dict()
                        else:
                            # Manual conversion to dictionary
                            tunnel_dict = self._tunnel_to_dict(tunnel)
                    except Exception as conv_error:
                        logger.warning(f"Error converting tunnel to dict, using manual conversion: {conv_error}")
                        tunnel_dict = self._tunnel_to_dict(tunnel)
                    
                    tunnels_list.append(tunnel_dict)
            
            logger.debug(f"Successfully fetched {len(tunnels_list)} tunnels using SDK")
            return tunnels_list
            
        except Exception as e:
            logger.exception(f"Error fetching tunnels list with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel"
                response = await self.http_client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success"):
                    return data.get("result", [])
                return []
            except httpx.HTTPError as req_error:
                logger.exception(f"Error fetching tunnels with REST API: {req_error}")
                return []
    
    def _tunnel_to_dict(self, tunnel) -> Dict[str, Any]:
        """
        Convert tunnel object to dictionary (fallback method)
        
        Args:
            tunnel: Tunnel object from SDK
            
        Returns:
            Dict: Tunnel as dictionary
        """
        def format_datetime(dt):
            """Format datetime to ISO string"""
            if dt is None:
                return None
            if hasattr(dt, 'isoformat'):
                return dt.isoformat()
            return str(dt)
        
        def format_connection(conn):
            """Format connection object to dict"""
            if conn is None:
                return None
            return {
                "id": getattr(conn, 'id', None),
                "client_id": getattr(conn, 'client_id', None),
                "client_version": getattr(conn, 'client_version', None),
                "colo_name": getattr(conn, 'colo_name', None),
                "is_pending_reconnect": getattr(conn, 'is_pending_reconnect', False),
                "opened_at": format_datetime(getattr(conn, 'opened_at', None)),
                "origin_ip": getattr(conn, 'origin_ip', None),
                "uuid": getattr(conn, 'uuid', None)
            }
        
        return {
            "id": getattr(tunnel, 'id', None),
            "account_tag": getattr(tunnel, 'account_tag', None),
            "config_src": getattr(tunnel, 'config_src', None),
            "connections": [
                format_connection(conn)
                for conn in (getattr(tunnel, 'connections', None) or [])
            ],
            "conns_active_at": format_datetime(getattr(tunnel, 'conns_active_at', None)),
            "conns_inactive_at": format_datetime(getattr(tunnel, 'conns_inactive_at', None)),
            "created_at": format_datetime(getattr(tunnel, 'created_at', None)),
            "deleted_at": format_datetime(getattr(tunnel, 'deleted_at', None)),
            "metadata": getattr(tunnel, 'metadata', {}) or {},
            "name": getattr(tunnel, 'name', None),
            "remote_config": getattr(tunnel, 'remote_config', False),
            "status": getattr(tunnel, 'status', 'down'),
            "tun_type": getattr(tunnel, 'tun_type', None)
        }
    
    async def get_tunnel(self, tunnel_id: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a Tunnel using official Cloudflare SDK
        
        Args:
            tunnel_id: Tunnel ID
            
        Returns:
            Dict or None
        """
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Fetching tunnel using Cloudflare SDK for tunnel {tunnel_id}")
            
            cloudflare_tunnel = await asyncio.to_thread(

            
                self.sdk_client.zero_trust.tunnels.cloudflared.get,

            
                
                tunnel_id=tunnel_id,
                account_id=self.account_id
            

            
            )
            
            # Convert tunnel object to dictionary
            try:
                # If tunnel is a Pydantic model, use model_dump
                if hasattr(cloudflare_tunnel, 'model_dump'):
                    tunnel_dict = cloudflare_tunnel.model_dump(mode='json')
                elif hasattr(cloudflare_tunnel, 'dict'):
                    tunnel_dict = cloudflare_tunnel.dict()
                elif hasattr(cloudflare_tunnel, 'result'):
                    # If response object
                    result = cloudflare_tunnel.result
                    if hasattr(result, 'model_dump'):
                        tunnel_dict = result.model_dump(mode='json')
                    elif hasattr(result, 'dict'):
                        tunnel_dict = result.dict()
                    else:
                        tunnel_dict = self._tunnel_to_dict(result)
                else:
                    tunnel_dict = self._tunnel_to_dict(cloudflare_tunnel)
                
                logger.debug(f"Successfully fetched tunnel using SDK")
                return tunnel_dict
                
            except Exception as conv_error:
                logger.warning(f"Error converting tunnel to dict, using manual conversion: {conv_error}")
                tunnel_dict = self._tunnel_to_dict(cloudflare_tunnel)
                return tunnel_dict
                
        except Exception as e:
            logger.exception(f"Error fetching tunnel with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{tunnel_id}"
                response = await self.http_client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success"):
                    return data.get("result")
                return None
            except httpx.HTTPError as req_error:
                logger.exception(f"Error fetching tunnel with REST API: {req_error}")
                return None
    
    async def create_tunnel(self, name: str, config_src: str = "cloudflare") -> Optional[Dict[str, Any]]:
        """
        Create a new Tunnel using REST API
        
        Args:
            name: Tunnel name
            config_src: Config source ("cloudflare" or "local")
        
        Returns:
            Dict with tunnel_id and token or None on error
        """
        try:
            url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel"
            body = {
                "name": name,
                "config_src": config_src
            }
            
            response = await self.http_client.post(url, headers=self.headers, json=body)
            response.raise_for_status()
            data = response.json()
            
            if data.get("success"):
                result = data.get("result", {})
                return {
                    "id": result.get("id"),
                    "token": result.get("token"),
                    "name": result.get("name"),
                    "created_at": result.get("created_at")
                }
            
            # Handle duplicate name error (code 1013)
            errors = data.get("errors", [])
            if errors and errors[0].get("code") == 1013:
                # Try with timestamp suffix
                import time
                new_name = f"{name}-{int(time.time())}"
                body["name"] = new_name
                retry_response = await self.http_client.post(url, headers=self.headers, json=body)
                retry_response.raise_for_status()
                retry_data = retry_response.json()
                if retry_data.get("success"):
                    result = retry_data.get("result", {})
                    return {
                        "id": result.get("id"),
                        "token": result.get("token"),
                        "name": result.get("name"),
                        "created_at": result.get("created_at")
                    }
            
            logger.error(f"Failed to create tunnel: {data}")
            return None
            
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 409:
                # Conflict - name already exists, try with timestamp
                import time
                new_name = f"{name}-{int(time.time())}"
                body = {
                    "name": new_name,
                    "config_src": config_src
                }
                try:
                    retry_response = await self.http_client.post(url, headers=self.headers, json=body)
                    retry_response.raise_for_status()
                    retry_data = retry_response.json()
                    if retry_data.get("success"):
                        result = retry_data.get("result", {})
                        return {
                            "id": result.get("id"),
                            "token": result.get("token"),
                            "name": result.get("name"),
                            "created_at": result.get("created_at")
                        }
                except Exception as retry_error:
                    logger.exception(f"Error retrying tunnel creation: {retry_error}")
            logger.exception(f"HTTP error creating tunnel: {e}")
            return None
        except Exception as e:
            logger.exception(f"Error creating tunnel: {e}")
            return None

    async def get_tunnel_config(self, tunnel_id: str) -> Optional[Dict[str, Any]]:
        """
        Get Tunnel Config using official Cloudflare SDK
        
        Args:
            tunnel_id: Tunnel ID
        
        Returns:
            Dict with config or None
        """
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Fetching tunnel config using Cloudflare SDK for tunnel {tunnel_id}")
            
            configuration = await asyncio.to_thread(

            
                self.sdk_client.zero_trust.tunnels.cloudflared.configurations.get,

            
                
                tunnel_id=tunnel_id,
                account_id=self.account_id
            

            
            )
            
            # Convert configuration object to dictionary
            try:
                # If configuration is a Pydantic model, use model_dump
                if hasattr(configuration, 'model_dump'):
                    config_dict = configuration.model_dump(mode='json')
                elif hasattr(configuration, 'dict'):
                    config_dict = configuration.dict()
                elif hasattr(configuration, 'result'):
                    # If response object
                    result = configuration.result
                    if hasattr(result, 'model_dump'):
                        config_dict = result.model_dump(mode='json')
                    elif hasattr(result, 'dict'):
                        config_dict = result.dict()
                    else:
                        config_dict = self._config_to_dict(result)
                else:
                    config_dict = self._config_to_dict(configuration)
                
                logger.debug(f"Successfully fetched tunnel config using SDK")
                return config_dict
                
            except Exception as conv_error:
                logger.warning(f"Error converting config to dict, using manual conversion: {conv_error}")
                config_dict = self._config_to_dict(configuration)
                return config_dict
                
        except Exception as e:
            logger.exception(f"Error fetching tunnel config with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                url = f"{self.base_url}/accounts/{self.account_id}/cfd_tunnel/{tunnel_id}/configurations"
                response = await self.http_client.get(url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success"):
                    return data.get("result")
                return None
            except httpx.HTTPError as req_error:
                logger.exception(f"Error fetching tunnel config with REST API: {req_error}")
                return None
    
    def _config_to_dict(self, config_obj) -> Dict[str, Any]:
        """
        Convert config object to dictionary (fallback method)
        
        Args:
            config_obj: Config object from SDK
            
        Returns:
            Dict: Config as dictionary
        """
        def format_datetime(dt):
            """Format datetime to ISO string"""
            if dt is None:
                return None
            if hasattr(dt, 'isoformat'):
                return dt.isoformat()
            return str(dt)
        
        def format_ingress(ingress):
            """Format ingress object to dict"""
            if ingress is None:
                return None
            ingress_dict = {}
            if hasattr(ingress, 'hostname'):
                ingress_dict['hostname'] = getattr(ingress, 'hostname', None)
            if hasattr(ingress, 'service'):
                ingress_dict['service'] = getattr(ingress, 'service', None)
            if hasattr(ingress, 'path'):
                ingress_dict['path'] = getattr(ingress, 'path', None)
            if hasattr(ingress, 'originRequest'):
                origin_req = getattr(ingress, 'originRequest', None)
                if origin_req:
                    ingress_dict['originRequest'] = self._origin_request_to_dict(origin_req)
            return ingress_dict
        
        def format_warp_routing(warp):
            """Format warp-routing object to dict"""
            if warp is None:
                return None
            return {
                "enabled": getattr(warp, 'enabled', False)
            }
        
        config_dict = {}
        
        # Extract result if exists
        if hasattr(config_obj, 'result'):
            config_obj = config_obj.result
        
        # Account ID
        if hasattr(config_obj, 'account_id'):
            config_dict['account_id'] = getattr(config_obj, 'account_id', None)
        
        # Tunnel ID
        if hasattr(config_obj, 'tunnel_id'):
            config_dict['tunnel_id'] = getattr(config_obj, 'tunnel_id', None)
        
        # Created at
        if hasattr(config_obj, 'created_at'):
            config_dict['created_at'] = format_datetime(getattr(config_obj, 'created_at', None))
        
        # Source
        if hasattr(config_obj, 'source'):
            config_dict['source'] = getattr(config_obj, 'source', None)
        
        # Version
        if hasattr(config_obj, 'version'):
            config_dict['version'] = getattr(config_obj, 'version', None)
        
        # Config
        if hasattr(config_obj, 'config'):
            config = getattr(config_obj, 'config', None)
            if config:
                config_data = {}
                
                # Ingress
                if hasattr(config, 'ingress'):
                    ingress_list = getattr(config, 'ingress', None)
                    if ingress_list:
                        config_data['ingress'] = [
                            format_ingress(ing) if not isinstance(ing, dict) else ing
                            for ing in ingress_list
                        ]
                
                # Origin Request
                if hasattr(config, 'originRequest'):
                    origin_req = getattr(config, 'originRequest', None)
                    if origin_req:
                        config_data['originRequest'] = self._origin_request_to_dict(origin_req)
                
                # Warp Routing
                if hasattr(config, 'warp_routing') or hasattr(config, 'warp-routing'):
                    warp = getattr(config, 'warp_routing', None) or getattr(config, 'warp-routing', None)
                    if warp:
                        config_data['warp-routing'] = format_warp_routing(warp)
                
                config_dict['config'] = config_data
        
        return config_dict
    
    def _origin_request_to_dict(self, origin_req) -> Dict[str, Any]:
        """Convert originRequest object to dict"""
        if origin_req is None:
            return None
        
        result = {}
        
        # Access
        if hasattr(origin_req, 'access'):
            access = getattr(origin_req, 'access', None)
            if access:
                result['access'] = {
                    "audTag": getattr(access, 'audTag', None) or getattr(access, 'aud_tag', None),
                    "teamName": getattr(access, 'teamName', None) or getattr(access, 'team_name', None),
                    "required": getattr(access, 'required', False)
                }
        
        # Other fields
        fields = [
            'caPool', 'ca_pool', 'connectTimeout', 'connect_timeout',
            'disableChunkedEncoding', 'disable_chunked_encoding',
            'http2Origin', 'http2_origin', 'httpHostHeader', 'http_host_header',
            'keepAliveConnections', 'keep_alive_connections',
            'keepAliveTimeout', 'keep_alive_timeout',
            'matchSNItoHost', 'match_sni_to_host',
            'noHappyEyeballs', 'no_happy_eyeballs',
            'noTLSVerify', 'no_tls_verify',
            'originServerName', 'origin_server_name',
            'proxyType', 'proxy_type',
            'tcpKeepAlive', 'tcp_keep_alive',
            'tlsTimeout', 'tls_timeout'
        ]
        
        for field in fields:
            if hasattr(origin_req, field):
                value = getattr(origin_req, field, None)
                if value is not None:
                    # Convert snake_case to camelCase for API compatibility
                    camel_field = field.replace('_', '')
                    if camel_field not in result:
                        result[camel_field] = value
        
        return result if result else None
    
    async def get_zone_id(self) -> Optional[str]:
        """
        Get Zone ID for domain using official Cloudflare SDK
        
        Returns:
            Zone ID or None
        """
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Getting Zone ID for domain: {self.domain} using Cloudflare SDK")
            
            # Get list of zones
            zones_page = await asyncio.to_thread(

                self.sdk_client.zones.list,

                name=self.domain

            )
            
            # Check result
            if hasattr(zones_page, 'result') and zones_page.result:
                for zone in zones_page.result:
                    # Convert zone object to dict
                    if hasattr(zone, 'model_dump'):
                        zone_dict = zone.model_dump(mode='json')
                    elif hasattr(zone, 'dict'):
                        zone_dict = zone.dict()
                    else:
                        zone_dict = {
                            "id": getattr(zone, 'id', None),
                            "name": getattr(zone, 'name', None)
                        }
                    
                    zone_name = zone_dict.get("name", "")
                    # Check domain name match
                    if zone_name == self.domain:
                        zone_id = zone_dict.get("id")
                        logger.debug(f"Zone ID found using SDK: {zone_id}")
                        return zone_id
            
            logger.error(f"Zone not found for domain: {self.domain}")
            return None
            
        except Exception as e:
            logger.exception(f"Error getting Zone ID with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                url = f"{self.base_url}/zones"
                params = {"name": self.domain}
                
                response = await self.http_client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success") and data.get("result"):
                    zones = data["result"]
                    if zones:
                        zone_id = zones[0].get("id")
                        logger.debug(f"Zone ID found: {zone_id}")
                        return zone_id
                logger.error(f"Zone not found for domain: {self.domain}")
                logger.debug(f"Response: {data}")
                return None
            except httpx.HTTPError as req_error:
                logger.exception(f"Error getting Zone ID with REST API: {req_error}")
                if hasattr(req_error, 'response') and req_error.response is not None:
                    try:
                        error_data = req_error.response.json()
                        logger.error(f"Error response: {error_data}")
                    except:
                        logger.error(f"Error response text: {req_error.response.text}")
                return None
    
    async def create_dns_record(self, hostname: str, tunnel_id: str, zone_id: Optional[str] = None, route_type: str = "HTTP", proxied: Optional[bool] = None, comment: Optional[str] = None) -> bool:
        """
        Create new DNS record (CNAME) for hostname using official Cloudflare SDK
        
        Args:
            hostname: Hostname (e.g. app.example.com)
            tunnel_id: Tunnel ID
            zone_id: Zone ID (if None, uses get_zone_id)
            route_type: Type of route (HTTP, HTTPS, TCP, SSH) - determines if proxied
            proxied: Whether record should be proxied (if None, determined based on route_type)
            comment: Comment for DNS record
        
        Returns:
            bool: Success or failure
        """
        logger.info(f"Creating DNS record for hostname: {hostname}, tunnel_id: {tunnel_id}, route_type: {route_type}")
        
        # Get zone_id if not provided
        if not zone_id:
            logger.debug(f"Getting Zone ID for domain: {self.domain}")
            zone_id = await self.get_zone_id()
        
        if not zone_id:
            logger.error(f"Zone ID not found for domain: {self.domain}")
            return False
        
        logger.debug(f"Zone ID: {zone_id}")
        
        # Extract subdomain name
        name = extract_subdomain_name(hostname, self.domain)
        if not name:
            return False
        
        logger.debug(f"DNS record name: {name}")
        
        # Always proxy DNS records (Cloudflare Tunnel requirement)
        if proxied is None:
            proxied = True
            logger.debug(f"Setting proxied=True for DNS record (Cloudflare Tunnel requirement)")
        
        # Create DNS record content
        content = f"{tunnel_id}.cfargotunnel.com"
        
        # Create comment
        if not comment:
            comment = f"Cloudflare Tunnel: {tunnel_id} (Type: {route_type})"
        
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Creating DNS record using Cloudflare SDK: name={name}, content={content}, proxied={proxied}")
            
            record_response = await asyncio.to_thread(

            
                self.sdk_client.dns.records.create,

            
                
                zone_id=zone_id,
                name=name,
                type="CNAME",
                content=content,
                proxied=proxied,
                comment=comment,
                ttl=1  # Automatic TTL
            

            
            )
            
            # Check success
            if hasattr(record_response, 'result') and record_response.result:
                result = record_response.result
                record_id = getattr(result, 'id', None) if hasattr(result, 'id') else None
                if record_id:
                    logger.info(f"DNS record created successfully using SDK: {hostname} -> {content} (ID: {record_id})")
                    return True
            
            logger.info(f"DNS record created successfully using SDK: {hostname} -> {content}")
            return True
            
        except Exception as e:
            logger.exception(f"Error creating DNS record with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                dns_body = {
                    "type": "CNAME",
                    "name": name,
                    "content": content,
                    "proxied": proxied,
                    "comment": comment
                }
                
                url = f"{self.base_url}/zones/{zone_id}/dns_records"
                response = await self.http_client.post(url, headers=self.headers, json=dns_body)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success"):
                    logger.info(f"DNS record created successfully: {hostname} -> {content}")
                    return True
                else:
                    logger.error(f"DNS create response: {data}")
                    return False
            except httpx.HTTPError as req_error:
                logger.exception(f"Error creating DNS record with REST API: {req_error}")
                return False
    
    async def find_dns_record(self, hostname: str, zone_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Find DNS record for hostname using official Cloudflare SDK
        
        Args:
            hostname: Hostname (e.g. app.example.com)
            zone_id: Zone ID (if None, uses get_zone_id)
        
        Returns:
            Dict with record info or None
        """
        if not zone_id:
            zone_id = await self.get_zone_id()
        
        if not zone_id:
            return None
        
        name = extract_subdomain_name(hostname, self.domain)
        if not name:
            return None
        
        try:
            # Search with subdomain name
            records_page = await asyncio.to_thread(

                self.sdk_client.dns.records.list,

                
                zone_id=zone_id,
                name=name,
                type="CNAME"
            

            )
            
            result = self._find_dns_record_in_results(records_page, name, hostname)
            if result:
                record_id, _ = result
                # Find complete record for return
                for record in records_page.result:
                    record_dict = self._record_to_dict(record)
                    if record_dict.get("id") == record_id:
                        logger.debug(f"Found DNS record with subdomain search: {record_dict.get('name')}")
                        return record_dict
            
            # If not found with subdomain, search with full hostname
            logger.debug(f"Record not found with subdomain '{name}', trying with full hostname '{hostname}'")
            records_page_full = await asyncio.to_thread(

                self.sdk_client.dns.records.list,

                
                zone_id=zone_id,
                name=hostname,
                type="CNAME"
            

            )
            
            result = self._find_dns_record_in_results(records_page_full, name, hostname)
            if result:
                record_id, _ = result
                # Find complete record for return
                for record in records_page_full.result:
                    record_dict = self._record_to_dict(record)
                    if record_dict.get("id") == record_id:
                        logger.debug(f"Found DNS record with full hostname search: {record_dict.get('name')}")
                        return record_dict
            
            return None
        except Exception as e:
            logger.exception(f"Error finding DNS record with SDK: {e}")
            return None
    
    async def update_dns_record(self, hostname: str, tunnel_id: str, zone_id: Optional[str] = None, route_type: str = "HTTP", preserve_proxied: bool = False, record_id: Optional[str] = None) -> bool:
        """
        Update existing DNS record (CNAME) for hostname using official Cloudflare SDK
        
        Args:
            hostname: Hostname (e.g. app.example.com)
            tunnel_id: Tunnel ID
            zone_id: Zone ID (if None, uses get_zone_id)
            route_type: Type of route (HTTP, HTTPS, TCP, SSH) - determines if proxied
            preserve_proxied: Whether to preserve existing proxied status
            record_id: DNS record ID (if None, finds the record)
        
        Returns:
            bool: Success or failure
        """
        logger.info(f"Updating DNS record for hostname: {hostname}, tunnel_id: {tunnel_id}, route_type: {route_type}, preserve_proxied: {preserve_proxied}")
        
        # Get zone_id if not provided
        if not zone_id:
            logger.debug(f"Getting Zone ID for domain: {self.domain}")
            zone_id = await self.get_zone_id()
        
        if not zone_id:
            logger.error(f"Zone ID not found for domain: {self.domain}")
            return False
        
        logger.debug(f"Zone ID: {zone_id}")
        
        # Extract subdomain name
        name = extract_subdomain_name(hostname, self.domain)
        if not name:
            return False
        
        logger.debug(f"DNS record name: {name}")
        
        # Initialize existing_proxied to None (will be set if record is found)
        existing_proxied = None
        found_record = False  # Initialize found_record flag
        
        # Find existing record if record_id not provided
        if not record_id:
            try:
                # Use SDK to find record - search with subdomain name
                records_page = await asyncio.to_thread(

                    self.sdk_client.dns.records.list,

                    
                    zone_id=zone_id,
                    name=name,
                    type="CNAME"
                

                )
                
                # Search with subdomain name
                result = self._find_dns_record_in_results(records_page, name, hostname)
                if result:
                    record_id, existing_proxied = result
                    logger.info(f"Found existing DNS record: id={record_id}, proxied={existing_proxied}")
                    found_record = True
                
                # If not found with subdomain, search with full hostname
                if not found_record:
                    logger.debug(f"Record not found with subdomain '{name}', trying with full hostname '{hostname}'")
                    records_page_full = await asyncio.to_thread(

                        self.sdk_client.dns.records.list,

                        
                        zone_id=zone_id,
                        name=hostname,
                        type="CNAME"
                    

                    )
                    result = self._find_dns_record_in_results(records_page_full, name, hostname)
                    if result:
                        record_id, existing_proxied = result
                        logger.info(f"Found existing DNS record with full hostname: id={record_id}, proxied={existing_proxied}")
                        found_record = True
                
                if not found_record:
                    logger.warning(f"DNS record not found with SDK for {hostname} (searched as '{name}' and '{hostname}')")
                    
            except Exception as e:
                logger.warning(f"Error finding record with SDK, using REST API: {e}")
                # Fallback to REST API
                url = f"{self.base_url}/zones/{zone_id}/dns_records"
                existing_record, _ = await find_existing_dns_records(self.http_client, url, self.headers, name, hostname)
                if existing_record:
                    record_id = existing_record.get("id")
                    existing_proxied = existing_record.get("proxied", False)
                    logger.debug(f"Found existing DNS record with REST API, proxied={existing_proxied}")
                else:
                    logger.error(f"DNS record not found for {hostname} (searched as '{name}' and '{hostname}')")
                    return False
        
        if not record_id:
            logger.error(f"DNS record ID not found for {hostname}")
            return False
        
        # Determine proxied status
        # If preserve_proxied is True and we have existing_proxied, use it
        # Otherwise, always proxy DNS records (Cloudflare Tunnel requirement)
        if preserve_proxied and existing_proxied is not None:
            proxied = existing_proxied
            logger.info(f"Preserving proxied status: {proxied}")
        else:
            proxied = True  # Cloudflare Tunnel requirement
            logger.info(f"Setting proxied=True for DNS record (Cloudflare Tunnel requirement)")
        
        # Create DNS record content
        content = f"{tunnel_id}.cfargotunnel.com"
        comment = f"Cloudflare Tunnel: {tunnel_id} (Type: {route_type})"
        
        try:
            # Use official Cloudflare SDK
            logger.debug(f"Updating DNS record using Cloudflare SDK: id={record_id}, name={name}, content={content}, proxied={proxied}")
            
            record_response = await asyncio.to_thread(

            
                self.sdk_client.dns.records.edit,

            
                
                dns_record_id=record_id,
                zone_id=zone_id,
                name=name,
                type="CNAME",
                content=content,
                proxied=proxied,
                comment=comment,
                ttl=1  # Automatic TTL
            

            
            )
            
            # Check success
            if hasattr(record_response, 'result') and record_response.result:
                result = record_response.result
                updated_id = getattr(result, 'id', None) if hasattr(result, 'id') else None
                if updated_id == record_id or updated_id:
                    logger.info(f"DNS record updated successfully using SDK: {hostname} -> {content} (ID: {record_id})")
                    return True
            
            logger.info(f"DNS record updated successfully using SDK: {hostname} -> {content}")
            return True
            
        except Exception as e:
            logger.exception(f"Error updating DNS record with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                dns_body = {
                    "type": "CNAME",
                    "name": name,
                    "content": content,
                    "proxied": proxied,
                    "comment": comment
                }
                
                update_url = f"{self.base_url}/zones/{zone_id}/dns_records/{record_id}"
                response = await self.http_client.put(update_url, headers=self.headers, json=dns_body)
                response.raise_for_status()
                data = response.json()
                
                if data.get("success"):
                    logger.info(f"DNS record updated successfully: {hostname} -> {content}")
                    return True
                else:
                    logger.error(f"DNS update response: {data}")
                    return False
            except httpx.HTTPError as req_error:
                logger.exception(f"Error updating DNS record with REST API: {req_error}")
                return False
    
    
    async def delete_dns_record(self, hostname: str, zone_id: Optional[str] = None, tunnel_id: Optional[str] = None) -> bool:
        """
        Delete DNS record for hostname using official Cloudflare SDK
        
        Args:
            hostname: Hostname (e.g. app.example.com)
            zone_id: Zone ID (if None, uses get_zone_id)
            tunnel_id: Tunnel ID for content verification (optional)
        
        Returns:
            bool: Success or failure
        """
        logger.info(f"Deleting DNS record for hostname: {hostname}")
        
        if not zone_id:
            logger.debug(f"Getting Zone ID for domain: {self.domain}")
            zone_id = await self.get_zone_id()
        
        if not zone_id:
            logger.error(f"Zone ID not found for domain: {self.domain}")
            return False
        
        logger.debug(f"Zone ID: {zone_id}")
        
        # Extract subdomain name
        name = extract_subdomain_name(hostname, self.domain)
        if not name:
            return False
        
        logger.debug(f"DNS record name: {name}")
        
        # Find DNS record using SDK
        record_to_delete: Optional[Dict[str, Any]] = None
        record_id: Optional[str] = None
        
        try:
            # Use SDK to find DNS record
            logger.debug(f"Searching for DNS record using SDK: name={name}, hostname={hostname}")
            
            # Search with subdomain name
            records_page = await asyncio.to_thread(

                self.sdk_client.dns.records.list,

                
                zone_id=zone_id,
                name=name,
                type="CNAME"
            

            )
            
            # Check records using helper method
            if hasattr(records_page, 'result') and records_page.result:
                for record in records_page.result:
                    record_dict = self._record_to_dict(record)
                    record_name = record_dict.get("name", "")
                    record_type = record_dict.get("type", "")
                    record_content = record_dict.get("content", "")
                    
                    # Check name match - case-insensitive
                    record_name_lower = record_name.lower()
                    name_lower = name.lower()
                    hostname_lower = hostname.lower()
                    domain_lower = self.domain.lower()
                    
                    name_matches = (
                        record_name_lower == name_lower or 
                        record_name_lower == hostname_lower or 
                        record_name_lower == f"{name_lower}.{domain_lower}"
                    )
                    
                    # Check CNAME type
                    if name_matches and record_type == "CNAME":
                        # If tunnel_id provided, check content
                        if tunnel_id and record_content:
                            expected_content = f"{tunnel_id}.cfargotunnel.com"
                            if record_content == expected_content:
                                record_to_delete = record_dict
                                record_id = record_dict.get("id")
                                logger.info(f"Found matching CNAME record (content matches): id={record_id}, name={record_name}")
                                break
                        else:
                            record_to_delete = record_dict
                            record_id = record_dict.get("id")
                            logger.info(f"Found CNAME record with matching name: id={record_id}, name={record_name}")
                            break
            
            # If not found with subdomain, search with full hostname
            if not record_to_delete:
                logger.info(f"No results with subdomain '{name}', trying full hostname '{hostname}'")
                records_page_full = await asyncio.to_thread(

                    self.sdk_client.dns.records.list,

                    
                    zone_id=zone_id,
                    name=hostname,
                    type="CNAME"
                

                )
                
                if hasattr(records_page_full, 'result') and records_page_full.result:
                    logger.info(f"Search results with hostname '{hostname}': {records_page_full.model_dump(mode='json') if hasattr(records_page_full, 'model_dump') else 'no model_dump'}")
                    
                    for record in records_page_full.result:
                        record_dict = self._record_to_dict(record)
                        record_name = record_dict.get("name", "")
                        record_type = record_dict.get("type", "")
                        record_content = record_dict.get("content", "")
                        
                        # Check name match - case-insensitive
                        record_name_lower = record_name.lower()
                        name_lower = name.lower()
                        hostname_lower = hostname.lower()
                        
                        name_matches = (
                            record_name_lower == hostname_lower or 
                            record_name_lower == name_lower
                        )
                        
                        # Check CNAME type
                        if name_matches and record_type == "CNAME":
                            # If tunnel_id provided, check content
                            if tunnel_id and record_content:
                                expected_content = f"{tunnel_id}.cfargotunnel.com"
                                if record_content == expected_content:
                                    record_to_delete = record_dict
                                    record_id = record_dict.get("id")
                                    logger.info(f"Found matching CNAME record with full hostname (content matches): id={record_id}, name={record_name}")
                                    break
                            else:
                                record_to_delete = record_dict
                                record_id = record_dict.get("id")
                                logger.info(f"Found CNAME record with full hostname: id={record_id}, name={record_name}")
                                break
            
            # If record not found, search with old method
            if not record_to_delete:
                logger.debug("Record not found with SDK, trying alternative search")
                url = f"{self.base_url}/zones/{zone_id}/dns_records"
                existing_record, _ = await find_existing_dns_records(self.http_client, url, self.headers, name, hostname)
                
                if existing_record:
                    record_content = existing_record.get("content", "")
                    if tunnel_id and record_content:
                        expected_content = f"{tunnel_id}.cfargotunnel.com"
                        if record_content == expected_content:
                            record_to_delete = existing_record
                            record_id = existing_record.get("id")
                    else:
                        record_to_delete = existing_record
                        record_id = existing_record.get("id")
            
            if not record_to_delete or not record_id:
                logger.warning(f"DNS record not found for {hostname}, nothing to delete")
                return True  # Consider it success if record doesn't exist
            
            # Delete the record using SDK
            logger.info(f"Deleting DNS record using SDK: id={record_id}")
            logger.info(f"Record details: name='{record_to_delete.get('name')}', type='{record_to_delete.get('type')}', content='{record_to_delete.get('content', '')}'")
            
            delete_result = await asyncio.to_thread(

            
                self.sdk_client.dns.records.delete,

            
                
                dns_record_id=record_id,
                zone_id=zone_id
            

            
            )
            
            # Check success
            if hasattr(delete_result, 'result') and delete_result.result:
                result_id = getattr(delete_result.result, 'id', None) if hasattr(delete_result.result, 'id') else None
                if result_id == record_id or result_id:
                    logger.info(f"DNS record deleted successfully using SDK: {hostname} (ID: {record_id})")
                    return True
            
            logger.info(f"DNS record deleted successfully using SDK: {hostname} (ID: {record_id})")
            return True
            
        except Exception as e:
            logger.exception(f"Error deleting DNS record with SDK: {e}")
            # Fallback to old method on error
            logger.warning("Falling back to REST API method")
            try:
                # Find DNS record using helper function
                url = f"{self.base_url}/zones/{zone_id}/dns_records"
                existing_record, _ = await find_existing_dns_records(self.http_client, url, self.headers, name, hostname)
                
                # If no record found, try searching all records
                if not existing_record:
                    response = await self.http_client.get(url, headers=self.headers, params={})
                    response.raise_for_status()
                    all_data = response.json()
                    if all_data.get("result"):
                        for record in all_data["result"]:
                            record_name = record.get("name", "")
                            if (record_name == name or record_name == hostname or 
                                record_name.endswith(f".{name}") or name.endswith(f".{record_name}") or
                                hostname.endswith(f".{record_name}") or record_name.endswith(f".{hostname}")):
                                if record.get("type") == "CNAME":
                                    existing_record = record
                                    break
                
                # Check content match if tunnel_id provided
                record_to_delete = None
                if existing_record:
                    record_content = existing_record.get("content", "")
                    if tunnel_id and record_content:
                        expected_content = f"{tunnel_id}.cfargotunnel.com"
                        if record_content == expected_content:
                            record_to_delete = existing_record
                    else:
                        record_to_delete = existing_record
                
                if not record_to_delete:
                    logger.warning(f"DNS record not found for {hostname}, nothing to delete")
                    return True
                
                # Delete the record
                record_id = record_to_delete["id"]
                delete_url = f"{self.base_url}/zones/{zone_id}/dns_records/{record_id}"
                
                response = await self.http_client.delete(delete_url, headers=self.headers)
                response.raise_for_status()
                data = response.json()
                
                success = data.get("success", False)
                if success:
                    logger.info(f"DNS record deleted successfully: {hostname} (ID: {record_id})")
                    return True
                else:
                    logger.error(f"DNS record deletion failed for {hostname}: {data}")
                    return False
            except httpx.HTTPError as req_error:
                logger.exception(f"Error deleting DNS record with REST API: {req_error}")
                return False

