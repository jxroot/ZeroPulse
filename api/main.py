from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from contextlib import asynccontextmanager
from api.routes import tunnels, commands, auth, settings, history, ssh_sessions, module_control, users, setup, local_shell
from api.services.auth import verify_token
from api.services.database import Database
from api.utils.logger import setup_logger
from api.utils.exceptions import C2SystemException
from api.utils.error_handler import (
    c2_system_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler
)
from api.middleware.rate_limit import limiter, rate_limit_exceeded_handler, RateLimitExceeded
import os

# Setup logging
logger = setup_logger("c2_system", log_to_file=True, log_to_console=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup: Initialize database
    logger.info("Initializing database...")
    db = Database()
    try:
        await db._init_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.exception(f"Error initializing database: {e}")
        # Continue anyway - database might already be initialized
    
    # Run migrations
    try:
        from api.utils.migrations import migration_manager
        applied_count = await migration_manager.migrate()
        if applied_count > 0:
            logger.info(f"Applied {applied_count} database migration(s)")
        else:
            logger.info("Database is up to date, no migrations needed")
    except Exception as e:
        logger.exception(f"Error running migrations: {e}")
        # Continue anyway - migrations might have already been applied
    
    # Initialize session manager
    from api.services.session_manager import session_manager
    try:
        await session_manager.initialize()
        logger.info("Session manager initialized successfully")
    except Exception as e:
        logger.exception(f"Error initializing session manager: {e}")
    
    yield
    
    # Shutdown: Cleanup if needed
    logger.info("Shutting down...")

app = FastAPI(
    lifespan=lifespan,
    title="ZeroPulse C2 Server",
    description="""
    ## ZeroPulse C2 Server API Documentation
    
    Command and Control System with Cloudflare Tunnel Management.
    
    ### Features:
    - **Tunnel Management**: Create, manage, and monitor Cloudflare Tunnels
    - **Command Execution**: Execute commands on remote systems via WinRM and SSH
    - **Module Control**: Dynamic module system for PowerShell scripts
    - **User Management**: Single user system with profile management
    - **History Tracking**: Command execution history and audit logs
    - **SSH Sessions**: Interactive SSH session management
    - **API Tokens**: Secure API token management with permissions
    - **Local Shell**: Interactive local shell access via WebSocket with real-time terminal
    - **Performance**: Optimized with non-blocking I/O and memory leak prevention
    
    ### Authentication:
    Most endpoints require authentication via Bearer token in the Authorization header.
    You can obtain a token by logging in via `/api/auth/login` endpoint.
    
    ### Interactive Documentation:
    - **Swagger UI**: Available at `/docs` - Interactive API testing interface
    - **ReDoc**: Available at `/redoc` - Beautiful API documentation
    
    Both documentation interfaces support token-based authentication via query parameter: `?token=YOUR_TOKEN`
    """,
    version="1.0.0",
    terms_of_service="https://github.com/your-repo/terms",
    contact={
        "name": "ZeroPulse C2 Support",
        "url": "https://github.com/your-repo/issues",
    },
    license_info={
        "name": "MIT",
    },
    openapi_tags=[
        {
            "name": "setup",
            "description": "Initial system setup endpoints. These endpoints are public and used for first-time configuration.",
        },
        {
            "name": "auth",
            "description": "Authentication endpoints. Login, logout, and token verification.",
        },
        {
            "name": "tunnels",
            "description": "Cloudflare Tunnel management. Create, list, update, and delete tunnels.",
        },
        {
            "name": "commands",
            "description": "Command execution endpoints. Execute commands on remote systems via WinRM, SSH, and other protocols.",
        },
        {
            "name": "settings",
            "description": "System settings and configuration. Modules, dependencies, system logs, API tokens, and agent scripts.",
        },
        {
            "name": "history",
            "description": "Command execution history and audit logs. View and manage past command executions.",
        },
        {
            "name": "ssh-sessions",
            "description": "SSH session management. Create, manage, and interact with SSH sessions.",
        },
        {
            "name": "Module Control",
            "description": "Dynamic module control panel. Manage module categories, sections, and items.",
        },
        {
            "name": "users",
            "description": "User profile management. Single user system for managing user profile.",
        },
    ]
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add rate limiter to app
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Register global exception handlers
app.add_exception_handler(C2SystemException, c2_system_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

# Register routes
app.include_router(setup.router)  # Setup routes (public, for initial setup)
app.include_router(auth.router)  # Auth routes (public)
app.include_router(tunnels.router)  # Protected routes
app.include_router(commands.router)  # Protected routes
app.include_router(settings.router)  # Protected routes
app.include_router(history.router)  # Protected routes
app.include_router(ssh_sessions.router, prefix="/api/ssh-sessions")  # SSH Sessions routes (protected)
app.include_router(module_control.router)  # Module Control Panel routes (protected)
app.include_router(users.router)  # User profile routes (protected)
app.include_router(local_shell.router, prefix="/api")  # Local shell WebSocket routes (protected)


# Serve static files (React build - frontend)
frontend_dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")

# Serve React/Vue build assets if exists
if os.path.exists(frontend_dist):
    # Serve React/Vue build assets
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    # Serve React/Vue build root (for index.html and other files)
    app.mount("/static", StaticFiles(directory=frontend_dist), name="static")
elif os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# Public paths that don't require authentication
PUBLIC_PATHS = [
    "/",
    "/login",
    "/login.html",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/verify",
    "/static",
    "/assets"  # Vue build assets
]


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Middleware برای بررسی authentication
    تمام API endpoints به جز public paths نیاز به authentication دارند
    """
    path = request.url.path
    
    # بررسی authentication برای /docs، /redoc و /openapi.json
    if path.startswith("/docs") or path.startswith("/redoc") or path == "/openapi.json":
        token = None
        query_token = request.query_params.get("token")
        cookie_token = request.cookies.get("auth_token")
        
        # بررسی token در Authorization header (برای API calls)
        authorization = request.headers.get("Authorization")
        if authorization:
            try:
                scheme, token = authorization.split()
                if scheme.lower() != "bearer":
                    token = None
            except ValueError:
                token = None
        
        # بررسی token در query parameter (برای browser access)
        if query_token and not token:
            token = query_token
        
        # بررسی token در cookie (برای browser access)
        if cookie_token and not token:
            token = cookie_token
        
        # اگر token وجود دارد، بررسی اعتبار آن
        if token:
            payload = verify_token(token)
            if payload is None:
                # Token نامعتبر - برای /openapi.json باید JSON error برگردانیم، برای /docs و /redoc redirect
                if path == "/openapi.json":
                    return JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "Not authenticated"}
                    )
                return RedirectResponse(url="/login", status_code=302)
            
            # Token معتبر است - ادامه request
            # اگر token از query parameter آمده و هنوز در cookie نیست، آن را به cookie اضافه می‌کنیم
            # این کار باعث می‌شود که Swagger UI و ReDoc بتوانند از /openapi.json استفاده کنند
            response = await call_next(request)
            
            # اگر token از query parameter آمده و هنوز در cookie نیست، آن را به cookie اضافه می‌کنیم
            if query_token and not cookie_token and not isinstance(response, RedirectResponse):
                response.set_cookie(
                    key="auth_token",
                    value=token,
                    max_age=86400,  # 24 hours
                    httponly=True,
                    samesite="lax"
                )
            
            return response
        else:
            # Token وجود ندارد - برای /openapi.json باید JSON error برگردانیم، برای /docs و /redoc redirect
            if path == "/openapi.json":
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Not authenticated"}
                )
            return RedirectResponse(url="/login", status_code=302)
    
    # SPA fallback: serve index.html for non-API routes
    if not path.startswith("/api") and not path.startswith("/static") and not path.startswith("/assets") and not path.startswith("/docs") and not path.startswith("/redoc") and path != "/openapi.json":
        # Try frontend (React) first
        react_index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist", "index.html")
        if os.path.exists(react_index_path):
            return FileResponse(react_index_path)
    
    # بررسی اینکه path public است یا نه
    is_public = any(path.startswith(public_path) for public_path in PUBLIC_PATHS)
    
    if is_public:
        response = await call_next(request)
        return response
    
    # برای API endpoints، بررسی token
    if path.startswith("/api/"):
        # استثنا برای auth endpoints
        if path.startswith("/api/auth/"):
            response = await call_next(request)
            return response
        
        # بررسی Authorization header
        authorization = request.headers.get("Authorization")
        if not authorization:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Not authenticated"}
            )
        
        # استخراج token
        try:
            scheme, token = authorization.split()
            if scheme.lower() != "bearer":
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid authentication scheme"}
                )
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid authorization header"}
            )
        
        # بررسی اعتبار token
        payload = verify_token(token)
        if payload is None:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid or expired token"}
            )
    
    response = await call_next(request)
    return response


@app.get("/")
async def root():
    """Main UI page - React SPA (frontend)"""
    # Try React build (frontend)
    react_index = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist", "index.html")
    if os.path.exists(react_index):
        return FileResponse(react_index)
    
    # Fallback to old static files
    static_file = os.path.join(static_dir, "index.html")
    if os.path.exists(static_file):
        return FileResponse(static_file)
    
    return {
        "message": "ZeroPulse C2 Server API",
        "version": "1.0.0",
        "description": "Command and Control System with Cloudflare Tunnel Management",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_json": "/openapi.json"
        },
        "endpoints": {
            "setup": "/api/setup",
            "auth": "/api/auth",
            "tunnels": "/api/tunnels",
            "commands": "/api/commands",
            "settings": "/api/settings",
            "history": "/api/history",
            "ssh_sessions": "/api/ssh-sessions",
            "module_control": "/api/module-control",
            "users": "/api/users",
            "local_shell_ws": "/api/ws/local-shell"
        },
        "authentication": {
            "type": "Bearer Token",
            "header": "Authorization: Bearer <token>",
            "login_endpoint": "/api/auth/login"
        }
    }


@app.get("/login.html")
async def login_page():
    """Login page - React SPA (frontend)"""
    # React router handles /login, but for backward compatibility
    # Try React build (frontend)
    react_index = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist", "index.html")
    if os.path.exists(react_index):
        return FileResponse(react_index)
    
    # Fallback to old static files
    login_file = os.path.join(static_dir, "login.html")
    if os.path.exists(login_file):
        return FileResponse(login_file)
    raise HTTPException(status_code=404, detail="Login page not found")

