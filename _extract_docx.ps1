Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-DocxText($path){
  $zip=[System.IO.Compression.ZipFile]::OpenRead($path)
  $entry=$zip.Entries | Where-Object {$_.FullName -eq 'word/document.xml'}
  $sr=New-Object System.IO.StreamReader($entry.Open())
  $xml=$sr.ReadToEnd()
  $sr.Close(); $zip.Dispose()
  $xml=$xml -replace '</w:p>',"`n"
  $xml=$xml -replace '<w:tab[^>]*/>',"`t"
  $xml=$xml -replace '<w:br[^>]*/>',"`n"
  $xml=$xml -replace '<[^>]+>',''
  $xml=$xml -replace '&lt;','<' -replace '&gt;','>' -replace '&amp;','&' -replace '&quot;','"'
  return $xml
}
$base='d:\聊天\记录\xwechat_files\wxid_9h7rrdaau4ya22_4a46\msg\file\2026-09'
$out='e:\jianyu\_docx_txt'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$map=@{ '耗材简版'='doc1.txt'; '系统功能及耗材管理'='doc2.txt'; '办公耗材管理'='doc3.txt' }
foreach($k in $map.Keys){
  $src=Join-Path $base ($k + '.docx')
  $dst=Join-Path $out $map[$k]
  try {
    $t=Get-DocxText $src
    [System.IO.File]::WriteAllText($dst,$t,[System.Text.Encoding]::UTF8)
    Write-Output ("OK " + $k + " -> " + $map[$k] + " chars=" + $t.Length)
  } catch {
    Write-Output ("ERR " + $k + " : " + $_.Exception.Message)
  }
}
