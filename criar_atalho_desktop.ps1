# Cria atalho do sistema na Area de Trabalho
$batPath   = Join-Path $PSScriptRoot "iniciar.bat"
$desktop   = [Environment]::GetFolderPath("Desktop")
$atalho    = Join-Path $desktop "Gulag System.lnk"

$wsh = New-Object -ComObject WScript.Shell
$sc  = $wsh.CreateShortcut($atalho)
$sc.TargetPath       = $batPath
$sc.WorkingDirectory = $PSScriptRoot
$sc.Description      = "Iniciar Gulag System - Gestao da Pelada"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $sc.IconLocation = "$($nodeCmd.Source),0" }
$sc.Save()

Write-Host ""
Write-Host "  Atalho criado na Area de Trabalho:" -ForegroundColor Green
Write-Host "  $atalho" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Clique duplo em 'Gulag System' para iniciar o sistema." -ForegroundColor White
Write-Host ""
pause
