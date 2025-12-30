"""
Local Shell Routes
Handles real-time shell access to the local system via WebSocket
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
from api.services.auth import verify_token
from api.dependencies import get_current_user
from api.utils.logger import logger
from pydantic import BaseModel
from typing import Optional
import subprocess
import asyncio
import os
import pty
import struct
import fcntl
import termios
import json

router = APIRouter(tags=["local-shell"])

security = HTTPBearer()


class LocalCommandRequest(BaseModel):
    command: str
    shell: Optional[str] = None  # Shell to use (default: /bin/bash)


async def get_current_user_ws(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify token for WebSocket connections"""
    token = credentials.credentials
    payload = verify_token(token)
    if payload is None:
        raise ValueError("Invalid or expired token")
    return payload


@router.websocket("/ws/local-shell")
async def websocket_local_shell(websocket: WebSocket):
    """
    WebSocket endpoint for real-time local shell access
    
    This endpoint provides interactive shell access to the local system.
    Client sends commands and receives output in real-time.
    
    Message format:
    - Client -> Server: {"type": "command", "data": "command string"}
    - Server -> Client: {"type": "output", "data": "output string"}
    - Server -> Client: {"type": "error", "data": "error string"}
    - Server -> Client: {"type": "exit", "code": exit_code}
    """
    await websocket.accept()
    
    # Get token from query parameter or header
    token = websocket.query_params.get("token")
    if not token:
        # Try to get from headers
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        await websocket.close(code=1008, reason="Authentication required")
        return
    
    # Verify token
    try:
        payload = verify_token(token)
        if payload is None:
            await websocket.close(code=1008, reason="Invalid or expired token")
            return
    except Exception as e:
        logger.error(f"Error verifying token for WebSocket: {e}")
        await websocket.close(code=1008, reason="Authentication error")
        return
    
    logger.info(f"WebSocket shell connection established for user: {payload.get('username', 'unknown')}")
    
    # Create a pseudo-terminal for interactive shell
    try:
        master_fd, slave_fd = pty.openpty()
        
        # Set terminal size (default: 80x24)
        rows, cols = 24, 80
        try:
            winsize = struct.pack('HHHH', rows, cols, 0, 0)
            fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)
        except Exception as e:
            logger.debug(f"Could not set terminal size: {e}")
        
        # Start shell process
        shell = os.environ.get('SHELL', '/bin/bash')
        process = subprocess.Popen(
            [shell],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            start_new_session=True,
            env=os.environ.copy()
        )
        
        # Close slave_fd in parent process
        os.close(slave_fd)
        
        # Set master_fd to non-blocking
        fcntl.fcntl(master_fd, fcntl.F_SETFL, os.O_NONBLOCK)
        
        async def send_output():
            """Send output from shell to WebSocket"""
            try:
                while True:
                    # Check if process is still running
                    poll_result = process.poll()
                    if poll_result is not None:
                        # Process exited
                        exit_code = poll_result
                        try:
                            await websocket.send_json({
                                "type": "exit",
                                "code": exit_code
                            })
                        except:
                            pass
                        break
                    
                    # Read from master_fd (non-blocking since we set O_NONBLOCK)
                    try:
                        data = os.read(master_fd, 1024)
                        if data:
                            try:
                                await websocket.send_json({
                                    "type": "output",
                                    "data": data.decode('utf-8', errors='replace')
                                })
                            except WebSocketDisconnect:
                                break
                            except Exception as e:
                                logger.debug(f"Error sending output: {e}")
                                break
                            # If we got data, continue immediately to check for more
                            continue
                        else:
                            # No data available, sleep to prevent CPU spinning
                            # Using 0.1 (100ms) to reduce CPU usage significantly
                            await asyncio.sleep(0.1)
                    except OSError as e:
                        # EAGAIN/EWOULDBLOCK means no data available (expected for non-blocking)
                        if e.errno in (11, 35):  # EAGAIN, EWOULDBLOCK
                            # No data available, sleep to prevent CPU spinning
                            await asyncio.sleep(0.1)
                        else:
                            # Other error, log and continue
                            logger.debug(f"Error reading from master_fd: {e}")
                            await asyncio.sleep(0.1)
                    except WebSocketDisconnect:
                        break
                    except Exception as e:
                        logger.debug(f"Unexpected error in send_output: {e}")
                        await asyncio.sleep(0.1)
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected during output reading")
            except Exception as e:
                logger.exception(f"Error in send_output: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "data": f"Error reading output: {str(e)}"
                    })
                except:
                    pass
        
        async def receive_input():
            """Receive input from WebSocket and send to shell"""
            try:
                while True:
                    # Receive message from WebSocket
                    try:
                        message = await websocket.receive_json()
                    except WebSocketDisconnect:
                        break
                    
                    if message.get("type") == "command":
                        command = message.get("data", "")
                        if command:
                            # Write command to shell stdin
                            try:
                                os.write(master_fd, command.encode('utf-8'))
                            except OSError as e:
                                logger.error(f"Error writing to shell: {e}")
                                try:
                                    await websocket.send_json({
                                        "type": "error",
                                        "data": f"Error writing to shell: {str(e)}"
                                    })
                                except:
                                    pass
                    
                    elif message.get("type") == "resize":
                        # Handle terminal resize
                        rows = message.get("rows", 24)
                        cols = message.get("cols", 80)
                        try:
                            # Ensure valid dimensions
                            rows = max(1, min(rows, 1000))
                            cols = max(1, min(cols, 1000))
                            winsize = struct.pack('HHHH', rows, cols, 0, 0)
                            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                            logger.debug(f"Terminal resized to {rows}x{cols}")
                        except Exception as e:
                            logger.debug(f"Could not resize terminal: {e}")
                    
                    elif message.get("type") == "close":
                        # Client requested close
                        break
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected during input reading")
            except Exception as e:
                logger.exception(f"Error in receive_input: {e}")
        
        # Run both tasks concurrently
        try:
            await asyncio.gather(
                send_output(),
                receive_input()
            )
        except Exception as e:
            logger.exception(f"Error in WebSocket shell: {e}")
        finally:
            # Cleanup
            try:
                process.terminate()
                process.wait(timeout=5)
            except:
                try:
                    process.kill()
                except:
                    pass
            
            try:
                os.close(master_fd)
            except:
                pass
            
            logger.info("WebSocket shell connection closed")
    
    except Exception as e:
        logger.exception(f"Error setting up shell: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "data": f"Error setting up shell: {str(e)}"
            })
        except:
            pass
        await websocket.close(code=1011, reason="Internal server error")


@router.websocket("/ws/local-shell-simple")
async def websocket_local_shell_simple(websocket: WebSocket):
    """
    Simplified WebSocket endpoint for local shell access
    
    This endpoint executes commands one at a time and returns output.
    More suitable for non-interactive commands.
    
    Message format:
    - Client -> Server: {"command": "command string"}
    - Server -> Client: {"output": "output string", "error": "error string", "exit_code": 0}
    """
    await websocket.accept()
    
    # Get token from query parameter or header
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        await websocket.close(code=1008, reason="Authentication required")
        return
    
    # Verify token
    try:
        payload = verify_token(token)
        if payload is None:
            await websocket.close(code=1008, reason="Invalid or expired token")
            return
    except Exception as e:
        logger.error(f"Error verifying token for WebSocket: {e}")
        await websocket.close(code=1008, reason="Authentication error")
        return
    
    logger.info(f"WebSocket shell (simple) connection established for user: {payload.get('username', 'unknown')}")
    
    try:
        while True:
            # Receive command from client
            message = await websocket.receive_json()
            command = message.get("command", "")
            
            if not command:
                await websocket.send_json({
                    "error": "No command provided",
                    "exit_code": 1
                })
                continue
            
            if command == "exit" or command == "quit":
                await websocket.send_json({
                    "output": "Closing connection...",
                    "exit_code": 0
                })
                break
            
            # Execute command
            try:
                process = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    stdin=asyncio.subprocess.DEVNULL
                )
                
                # Read output in real-time
                stdout_data = b""
                stderr_data = b""
                
                async def read_stream(stream, is_stdout=True):
                    data = b""
                    while True:
                        chunk = await stream.read(1024)
                        if not chunk:
                            break
                        data += chunk
                        # Send partial output
                        try:
                            await websocket.send_json({
                                "type": "output" if is_stdout else "error",
                                "data": chunk.decode('utf-8', errors='replace')
                            })
                        except:
                            pass
                    return data
                
                # Read stdout and stderr concurrently
                stdout_task = asyncio.create_task(read_stream(process.stdout, True))
                stderr_task = asyncio.create_task(read_stream(process.stderr, False))
                
                # Wait for process to complete
                exit_code = await process.wait()
                
                # Get final output
                stdout_data = await stdout_task
                stderr_data = await stderr_task
                
                # Send final result
                await websocket.send_json({
                    "output": stdout_data.decode('utf-8', errors='replace'),
                    "error": stderr_data.decode('utf-8', errors='replace'),
                    "exit_code": exit_code
                })
                
            except Exception as e:
                logger.exception(f"Error executing command: {e}")
                await websocket.send_json({
                    "error": f"Error executing command: {str(e)}",
                    "exit_code": 1
                })
    
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.exception(f"Error in WebSocket shell (simple): {e}")
        try:
            await websocket.send_json({
                "error": f"Connection error: {str(e)}",
                "exit_code": 1
            })
        except:
            pass
    finally:
        logger.info("WebSocket shell (simple) connection closed")


@router.post("/local-shell/execute")
async def execute_local_command(
    request: LocalCommandRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute a command on the local system and return output
    
    This is a simple REST endpoint for non-interactive command execution.
    For interactive/real-time access, use WebSocket endpoints.
    """
    command = request.command
    shell = request.shell or os.environ.get('SHELL', '/bin/bash')
    
    if not command:
        raise HTTPException(status_code=400, detail="Command is required")
    
    try:
        # Execute command
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.DEVNULL,
            shell=True,
            executable=shell
        )
        
        # Wait for process to complete
        stdout, stderr = await process.communicate()
        
        return {
            "success": process.returncode == 0,
            "output": stdout.decode('utf-8', errors='replace'),
            "error": stderr.decode('utf-8', errors='replace'),
            "exit_code": process.returncode
        }
    
    except Exception as e:
        logger.exception(f"Error executing local command: {e}")
        raise HTTPException(status_code=500, detail=f"Error executing command: {str(e)}")


@router.post("/local-shell/execute-stream")
async def execute_local_command_stream(
    request: LocalCommandRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Execute a command on the local system and stream output in real-time
    
    Uses Server-Sent Events (SSE) for streaming output.
    """
    command = request.command
    shell = request.shell or os.environ.get('SHELL', '/bin/bash')
    
    if not command:
        raise HTTPException(status_code=400, detail="Command is required")
    
    async def generate():
        """Generator function for streaming output"""
        try:
            # Execute command
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                stdin=asyncio.subprocess.DEVNULL,
                shell=True,
                executable=shell
            )
            
            # Read output in chunks
            while True:
                # Check if process is done
                if process.returncode is not None:
                    break
                
                # Read stdout
                chunk = await process.stdout.read(1024)
                if chunk:
                    output = chunk.decode('utf-8', errors='replace')
                    yield f"data: {json.dumps({'type': 'output', 'data': output})}\n\n"
                else:
                    # Check if process is done
                    if process.returncode is not None:
                        break
                    await asyncio.sleep(0.1)
            
            # Read any remaining stderr
            stderr_data = await process.stderr.read()
            if stderr_data:
                error_output = stderr_data.decode('utf-8', errors='replace')
                yield f"data: {json.dumps({'type': 'error', 'data': error_output})}\n\n"
            
            # Send final status
            yield f"data: {json.dumps({'type': 'exit', 'code': process.returncode})}\n\n"
            
        except Exception as e:
            logger.exception(f"Error in stream generation: {e}")
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable buffering in nginx
        }
    )

