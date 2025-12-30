from pydantic import BaseModel
from typing import Optional


class CommandResponse(BaseModel):
    success: bool
    output: Optional[str] = None
    error: Optional[str] = None
    exit_code: Optional[int] = None


class CommandByTunnelRequest(BaseModel):
    command: str


class CommandExecuteRequest(BaseModel):
    command: str
    execution_type: Optional[str] = "cmd"  # "cmd" or "powershell"
    hostname: Optional[str] = None  # Optional hostname override

