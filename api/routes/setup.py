"""
Setup Routes
Routes for initial system setup
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from pathlib import Path
import os
from api.services.database import Database
from api.services.cloudflare import CloudflareService
from api.utils.logger import logger
from api.utils.password import validate_password_strength

db = Database()
router = APIRouter(prefix="/api/setup", tags=["setup"])

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_FILE = PROJECT_ROOT / '.env'


class CloudflareCredentialsRequest(BaseModel):
    """Request model for Cloudflare credentials verification"""
    api_token: str
    account_id: str
    domain: str


class SetupRequest(BaseModel):
    username: str
    password: str
    cloudflare_api_token: Optional[str] = None
    cloudflare_account_id: Optional[str] = None
    cloudflare_domain: Optional[str] = None
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError("Username cannot be empty")
        if len(v) > 100:
            raise ValueError("Username must be less than 100 characters")
        return v.strip()
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if not v or len(v) == 0:
            raise ValueError("Password cannot be empty")
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v


@router.get("/status")
async def get_setup_status():
    """
    Check if system setup is required
    Returns True if setup is needed (no users exist)
    """
    try:
        needs_setup = not await db.has_any_users()
        return {
            "success": True,
            "needs_setup": needs_setup
        }
    except Exception as e:
        logger.exception(f"Error checking setup status: {e}")
        raise HTTPException(status_code=500, detail="Error checking setup status")


@router.post("/verify-cloudflare")
async def verify_cloudflare_credentials(credentials: CloudflareCredentialsRequest):
    """
    Verify Cloudflare API credentials before saving them
    This endpoint is only available during setup (no users exist)
    """
    try:
        # Check if setup is still needed
        if await db.has_any_users():
            raise HTTPException(
                status_code=403,
                detail="System already set up. Cannot verify credentials through setup endpoint."
            )
        
        # Validate inputs
        if not credentials.api_token or not credentials.account_id or not credentials.domain:
            raise HTTPException(
                status_code=400,
                detail="All Cloudflare credentials are required: api_token, account_id, domain"
            )
        
        # Create CloudflareService instance and verify credentials
        cloudflare_service = CloudflareService(
            api_token=credentials.api_token,
            account_id=credentials.account_id,
            domain=credentials.domain
        )
        
        verification_result = await cloudflare_service.verify_credentials()
        
        # Check if it's a permission error (token and account valid but domain check failed)
        token_valid = verification_result.get("token_valid", False)
        account_valid = verification_result.get("account_valid", False)
        domain_valid = verification_result.get("domain_valid", False)
        errors = verification_result.get("errors", [])
        
        # If token and account are valid but domain check failed, it might be a permission issue
        has_permission_issue = False
        if token_valid and account_valid and not domain_valid:
            # Check if error message indicates permission issue
            for err in errors:
                if isinstance(err, str):
                    if "missing required permissions" in err.lower() or "proceed to permissions" in err.lower():
                        has_permission_issue = True
                        break
        
        # Return verification result
        response_data = {
            "success": verification_result["success"],
            "message": "Cloudflare credentials verified successfully" if verification_result["success"] else "Cloudflare credentials verification failed",
            "token_valid": token_valid,
            "account_valid": account_valid,
            "domain_valid": domain_valid,
            "permissions": verification_result.get("permissions", []),
            "has_permission_issue": has_permission_issue
        }
        
        if not verification_result["success"]:
            response_data["errors"] = errors
        
        return response_data
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error verifying Cloudflare credentials: {e}")
        raise HTTPException(status_code=500, detail=f"Error verifying Cloudflare credentials: {str(e)}")


@router.post("/verify-permissions")
async def verify_cloudflare_permissions(credentials: CloudflareCredentialsRequest):
    """
    Verify Cloudflare API token permissions
    This endpoint is only available during setup (no users exist)
    """
    try:
        # Check if setup is still needed
        if await db.has_any_users():
            raise HTTPException(
                status_code=403,
                detail="System already set up. Cannot verify permissions through setup endpoint."
            )
        
        # Validate inputs
        if not credentials.api_token or not credentials.account_id or not credentials.domain:
            raise HTTPException(
                status_code=400,
                detail="All Cloudflare credentials are required: api_token, account_id, domain"
            )
        
        # Create CloudflareService instance and verify permissions
        cloudflare_service = CloudflareService(
            api_token=credentials.api_token,
            account_id=credentials.account_id,
            domain=credentials.domain
        )
        
        permission_result = await cloudflare_service.verify_permissions()
        
        # Return permission verification result
        response_data = {
            "success": permission_result["success"],
            "has_required_permissions": permission_result.get("has_required_permissions", False),
            "missing_permissions": permission_result.get("missing_permissions", []),
            "permissions": permission_result.get("permissions", []),
            "permission_details": permission_result.get("permission_details", {})
        }
        
        if not permission_result["success"]:
            response_data["errors"] = permission_result.get("errors", [])
        
        return response_data
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error verifying Cloudflare permissions: {e}")
        raise HTTPException(status_code=500, detail=f"Error verifying Cloudflare permissions: {str(e)}")


def update_env_file(api_token: str, account_id: str, domain: str):
    """
    Update or create .env file with Cloudflare credentials
    """
    try:
        env_lines = []
        
        # Read existing .env file if it exists
        if ENV_FILE.exists():
            with open(ENV_FILE, 'r', encoding='utf-8') as f:
                env_lines = f.readlines()
        
        # Dictionary to track which variables we need to update/add
        env_vars = {
            "CLOUDFLARE_API_TOKEN": api_token,
            "CLOUDFLARE_ACCOUNT_ID": account_id,
            "CLOUDFLARE_DOMAIN": domain
        }
        
        # Track which variables we've updated
        updated_vars = set()
        
        # Update existing lines or mark for addition
        new_lines = []
        for line in env_lines:
            line_stripped = line.strip()
            if not line_stripped or line_stripped.startswith('#'):
                new_lines.append(line)
                continue
            
            # Check if this line contains one of our variables
            updated = False
            for var_name, var_value in env_vars.items():
                if line_stripped.startswith(f"{var_name}="):
                    new_lines.append(f"{var_name}={var_value}\n")
                    updated_vars.add(var_name)
                    updated = True
                    break
            
            if not updated:
                new_lines.append(line)
        
        # Add any variables that weren't found
        for var_name, var_value in env_vars.items():
            if var_name not in updated_vars:
                new_lines.append(f"{var_name}={var_value}\n")
        
        # Write back to file
        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(ENV_FILE, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        
        # Also update environment variables for current process
        os.environ["CLOUDFLARE_API_TOKEN"] = api_token
        os.environ["CLOUDFLARE_ACCOUNT_ID"] = account_id
        os.environ["CLOUDFLARE_DOMAIN"] = domain
        
        logger.info("Cloudflare credentials saved to .env file")
        
    except Exception as e:
        logger.exception(f"Error updating .env file: {e}")
        raise


@router.post("")
async def setup_system(setup_data: SetupRequest):
    """
    Initial system setup - create first admin user
    This endpoint is only available when no users exist
    """
    try:
        # Check if setup is still needed
        if not await db.has_any_users():
            # Check if username already exists (shouldn't happen, but just in case)
            existing = await db.get_user_by_username(setup_data.username)
            if existing:
                raise HTTPException(status_code=400, detail="Username already exists")
            
            # Create single user (no role needed)
            import uuid
            from datetime import datetime
            
            user_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            # Pass password (not password_hash) - create_user will hash it
            admin_user = {
                "id": user_id,
                "username": setup_data.username,
                "password": setup_data.password,  # Pass plain password, create_user will hash it
                "role_id": None,  # No role needed for single user system
                "is_active": 1,
                "created_at": now,
                "updated_at": now,
                "created_by": None
            }
            
            success = await db.create_user(admin_user)
            
            if not success:
                raise HTTPException(status_code=500, detail="Failed to create admin user")
            
            # Cloudflare credentials are required
            if not setup_data.cloudflare_api_token or not setup_data.cloudflare_account_id or not setup_data.cloudflare_domain:
                raise HTTPException(
                    status_code=400,
                    detail="All Cloudflare credentials are required: cloudflare_api_token, cloudflare_account_id, cloudflare_domain"
                )
            
            # Save credentials to .env file (even if verification fails)
            # Verification is done in previous steps, here we just save the credentials
            try:
                update_env_file(
                    setup_data.cloudflare_api_token,
                    setup_data.cloudflare_account_id,
                    setup_data.cloudflare_domain
                )
                logger.info("Cloudflare credentials saved during setup")
            except Exception as e:
                logger.exception(f"Error saving Cloudflare credentials during setup: {e}")
                # Don't fail setup if saving credentials fails - credentials can be updated later
                logger.warning("Continuing setup despite credential save error")
            
            return {
                "success": True,
                "message": "System setup completed successfully",
                "user_id": user_id
            }
        else:
            raise HTTPException(
                status_code=403,
                detail="System already set up. Cannot create additional admin users through setup endpoint."
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error during system setup: {e}")
        raise HTTPException(status_code=500, detail=f"Error during system setup: {str(e)}")

