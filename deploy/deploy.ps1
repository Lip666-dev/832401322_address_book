# 通讯录静态站点（Windows 上一键上传）
#
#   pwsh -File deploy\deploy.ps1 -Target root@192.144.235.99
#   pwsh -File deploy\deploy.ps1 -Target root@192.144.235.99 -Port 8081 -RemoteDir /var/www/address-book
#
# 依赖 Windows 自带的 OpenSSH 客户端（ssh / scp）。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Target,
    [int]$Port = 8081,
    [string]$RemoteDir = '/var/www/address-book'
)

$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
$hostOnly = ($Target -split '@')[-1]

Write-Host "==> 打包 $src" -ForegroundColor Cyan
$temp = Join-Path $env:TEMP ("address-book-" + [guid]::NewGuid().ToString('N') + ".tar.gz")
Push-Location $src
try {
    tar -czf $temp --exclude=_verification --exclude=tests --exclude=__pycache__ --exclude=.git .
} finally {
    Pop-Location
}
Write-Host ("    包大小 {0:N1} KB" -f ((Get-Item $temp).Length / 1KB))

Write-Host "==> 上传到 ${Target}:$RemoteDir" -ForegroundColor Cyan
ssh $Target "mkdir -p '$RemoteDir'"
scp $temp "${Target}:$RemoteDir/app.tar.gz"
ssh $Target "cd '$RemoteDir' && tar -xzf app.tar.gz && rm app.tar.gz && chmod -R a+rX ."

Write-Host "==> 在服务器上启动" -ForegroundColor Cyan
$remote = @"
if command -v nginx >/dev/null 2>&1 && [ -d /etc/nginx/conf.d ]; then
  cat > /etc/nginx/conf.d/address-book.conf <<'EOF'
server {
    listen $Port;
    server_name _;
    root $RemoteDir;
    index index.html;
    charset utf-8;
    location / { try_files `$uri `$uri/ /index.html; }
}
EOF
  nginx -t && nginx -s reload
else
  pkill -f 'serve.py' || true
  cd $RemoteDir && nohup env PORT=$Port python3 serve.py > /var/log/address-book.log 2>&1 &
fi
"@
ssh $Target $remote

Write-Host "==> 自检" -ForegroundColor Cyan
$url = "http://${hostOnly}:$Port/"
try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    Write-Host "HTTP $($response.StatusCode)  $url" -ForegroundColor Green
    if ($response.Content -match '<title>([^<]+)</title>') {
        Write-Host "页面标题：$($Matches[1])"
    }
} catch {
    Write-Warning "访问失败：$url —— 请检查云服务器安全组与本地防火墙是否放行 $Port"
}

Remove-Item $temp -ErrorAction SilentlyContinue
