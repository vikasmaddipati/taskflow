# Assemble cPanel Production Deployment Archive
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot + "\.."

Write-Host "Creating staging directory..."
$staging = "$root\deploy_staging"
if (Test-Path $staging) {
    Remove-Item -Recurse -Force $staging
}
New-Item -ItemType Directory -Path $staging | Out-Null
New-Item -ItemType Directory -Path "$staging\public" | Out-Null
New-Item -ItemType Directory -Path "$staging\src" | Out-Null

Write-Host "Copying compiled frontend (client/dist -> public)..."
Copy-Item -Path "$root\client\dist\*" -Destination "$staging\public" -Recurse

$publicHtaccess = @"
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
"@
Set-Content -Path "$staging\public\.htaccess" -Value $publicHtaccess

Write-Host "Copying backend source (server/src -> src)..."
Copy-Item -Path "$root\server\src\*" -Destination "$staging\src" -Recurse

Write-Host "Adding Passenger root entrypoints..."
$appJs = @"
/**
 * TaskFlow - cPanel Phusion Passenger Startup Entrypoint
 */
import './src/server.js';
"@
Set-Content -Path "$staging\app.js" -Value $appJs

$rootHtaccess = @"
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Serve existing static files directly
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Pass API routes to Node.js backend
  RewriteCond %{REQUEST_URI} ^/(api|health)(/.*)?$ [NC]
  RewriteRule ^ - [L]

  # Pass all other requests to index.html for client-side React SPA routing
  RewriteRule ^ index.html [L]
</IfModule>
"@
Set-Content -Path "$staging\.htaccess" -Value $rootHtaccess

Copy-Item -Path "$root\server\package.json" -Destination "$staging\package.json"
Copy-Item -Path "$root\.env.example" -Destination "$staging\.env.example"

Write-Host "Compressing to taskflow_cpanel_deploy.zip..."
$zipPath = "$root\taskflow_cpanel_deploy.zip"
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Keep deploy_staging for FTP deployment
Write-Host "Deployment package created successfully: taskflow_cpanel_deploy.zip ($((Get-Item $zipPath).Length) bytes)"
