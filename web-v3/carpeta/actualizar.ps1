# Easy Performance: junta los exports (CSV o Excel) de la carpeta exports en exports\datos.js.
# Así EasyPerformance.html los lee al abrirlo con doble clic, sin elegir ficheros.
# Si existen configuracion\cliente.json, iniciativas\*.json y contexto\*.json, también los incluye.
# Uso: doble clic en actualizar.bat  (o: powershell -ExecutionPolicy Bypass -File actualizar.ps1)
# No necesita permisos de administrador, no se conecta a internet y no modifica los exports.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$exports = Join-Path $raiz 'exports'
$salida = Join-Path $exports 'datos.js'

if (-not (Test-Path $exports)) { New-Item -ItemType Directory -Path $exports | Out-Null }
$ficheros = @(Get-ChildItem -Path $exports -File | Where-Object { $_.Extension -match '^\.(csv|xls|xlsx)$' } | Sort-Object Name)
if ($ficheros.Count -eq 0) {
  Write-Host 'No hay exports en la carpeta exports. Exporta desde Jira con "Todos los campos" (CSV o Excel) y deja el fichero ahí.'
  exit 1
}

$utf8SinBom = New-Object System.Text.UTF8Encoding($false)
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('// Generado por actualizar.ps1 el ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ". No editar a mano.`n")
[void]$sb.Append('window.EASY_PERFORMANCE_EXPORTS = [')
$primero = $true
foreach ($f in $ficheros) {
  # Se guarda en base64: sirve para cualquier tamaño y codificación; la página lo descodifica.
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  if (-not $primero) { [void]$sb.Append(',') }
  $primero = $false
  [void]$sb.Append('{"nombre":' + (ConvertTo-Json -InputObject $f.Name -Compress) + ',"b64":"' + [System.Convert]::ToBase64String($bytes) + '"}')
  Write-Host ('  ' + $f.Name + ' (' + [math]::Round($f.Length / 1KB) + ' KB)')
}
[void]$sb.Append("];`n")

$cfg = Join-Path (Join-Path $raiz 'configuracion') 'cliente.json'
if (Test-Path $cfg) {
  $json = [System.IO.File]::ReadAllText($cfg, [System.Text.Encoding]::UTF8)
  [void]$sb.Append('window.EASY_PERFORMANCE_CONFIG = ' + $json.Trim() + ";`n")
  Write-Host '  configuracion\cliente.json incluido'
}

# Iniciativas: un fichero por iniciativa en la carpeta iniciativas
$dirIni = Join-Path $raiz 'iniciativas'
$inis = @(Get-ChildItem -Path $dirIni -Filter *.json -File -ErrorAction SilentlyContinue | Sort-Object Name)
if ($inis.Count -gt 0) {
  $partes = @($inis | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8).Trim() })
  [void]$sb.Append('window.EASY_PERFORMANCE_INICIATIVAS = [' + ($partes -join ',') + "];`n")
  Write-Host ('  ' + $inis.Count + ' iniciativa(s) incluidas')
}

# Contexto: resúmenes que escribe o aprueba el consultor (contexto\contexto.json)
$ctx = Join-Path (Join-Path $raiz 'contexto') 'contexto.json'
if (Test-Path $ctx) {
  $json = [System.IO.File]::ReadAllText($ctx, [System.Text.Encoding]::UTF8)
  [void]$sb.Append('window.EASY_PERFORMANCE_CONTEXTO = ' + $json.Trim() + ";`n")
  Write-Host '  contexto\contexto.json incluido'
}

[System.IO.File]::WriteAllText($salida, $sb.ToString(), $utf8SinBom)
Write-Host ('Listo: ' + $ficheros.Count + ' fichero(s) en exports\datos.js. Abre EasyPerformance.html (o pulsa Actualizar si ya está abierto).')
