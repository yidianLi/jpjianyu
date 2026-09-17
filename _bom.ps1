$p = 'e:\jianyu\_extract_docx.ps1'
$b = [IO.File]::ReadAllBytes($p)
if (-not ($b[0] -eq 0xEF)) {
  $bom = [byte[]](0xEF,0xBB,0xBF)
  [IO.File]::WriteAllBytes($p, $bom + $b)
  Write-Output 'BOM added'
} else {
  Write-Output 'BOM exists'
}
