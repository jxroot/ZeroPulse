"""
Commands Router - Main Entry Point
This module aggregates all command-related routes
"""
from fastapi import APIRouter

# Import all sub-routers
from api.routes.command_execution import router as command_execution_router
from api.routes.route_proxy import router as route_proxy_router
from api.routes.novnc import router as novnc_router
from api.routes.ttyd import router as ttyd_router

# Create main router
router = APIRouter(prefix="/api/commands", tags=["commands"])

# Include all sub-routers
router.include_router(command_execution_router)
router.include_router(route_proxy_router)
router.include_router(novnc_router)
router.include_router(ttyd_router)
