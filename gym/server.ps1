# ==============================================================================
# APEX TITAN FITNESS - NATIVE POWERSHELL LOCAL HTTP SERVER
# Serves the gym website at http://localhost:8080
# ==============================================================================

param(
    [int]$Port = 8080,
    [string]$RootPath = $PSScriptRoot
)

if (-not $RootPath) {
    $RootPath = (Get-Location).Path
}

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
}

$Listener = New-Object System.Net.HttpListener
$Prefix = "http://localhost:$Port/"
$Listener.Prefixes.Add($Prefix)

try {
    $Listener.Start()
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  APEX TITAN GYM - LOCAL HOST SERVER STARTED" -ForegroundColor Cyan
    Write-Host "  URL: $Prefix" -ForegroundColor Yellow
    Write-Host "  Root Directory: $RootPath" -ForegroundColor Gray
    Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Green
} catch {
    Write-Host "Failed to start listener on port $Port : $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response

        $RawPath = $Request.Url.LocalPath
        if ($RawPath -eq "/" -or [string]::IsNullOrWhiteSpace($RawPath)) {
            $RawPath = "/index.html"
        }

        # Clean path to prevent directory traversal
        $RelativePath = $RawPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $FilePath = [System.IO.Path]::Combine($RootPath, $RelativePath)

        if ([System.IO.File]::Exists($FilePath)) {
            $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
            $ContentType = $MimeTypes[$Ext]
            if (-not $ContentType) {
                $ContentType = "application/octet-stream"
            }

            try {
                $Bytes = [System.IO.File]::ReadAllBytes($FilePath)
                $Response.ContentType = $ContentType
                $Response.ContentLength64 = $Bytes.Length
                $Response.StatusCode = 200
                $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
                Write-Host "[$($Response.StatusCode)] $($Request.HttpMethod) $RawPath ($ContentType)" -ForegroundColor Green
            } catch {
                $Response.StatusCode = 500
                Write-Host "[500] Internal Server Error: $($_.Exception.Message)" -ForegroundColor Red
            }
        } else {
            $NotFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("<html><head><title>404 Not Found</title></head><body style='background:#07090E;color:#FFF;font-family:sans-serif;padding:40px;'><h1>404 - File Not Found</h1><p>The requested URL $RawPath was not found on this Apex Titan server.</p><a href='/' style='color:#D4FF00;'>Back to Home</a></body></html>")
            $Response.StatusCode = 404
            $Response.ContentType = "text/html; charset=utf-8"
            $Response.ContentLength64 = $NotFoundMsg.Length
            $Response.OutputStream.Write($NotFoundMsg, 0, $NotFoundMsg.Length)
            Write-Host "[$($Response.StatusCode)] Not Found: $RawPath" -ForegroundColor Yellow
        }

        $Response.OutputStream.Close()
    }
} finally {
    $Listener.Stop()
    $Listener.Close()
}
