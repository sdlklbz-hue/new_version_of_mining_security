$base = "HKLM:\SYSTEM\CurrentControlSet\Services\Winsock2\Parameters\Protocol_Catalog9\Catalog_Entries64"
for ($i = 1; $i -le 14; $i++) {
    $key = "{0:D3}" -f $i
    $path = "$base\$key"
    try {
        $bytes = (Get-ItemProperty $path -ErrorAction SilentlyContinue).PackedCatalogItem
        if ($bytes) {
            $text = [System.Text.Encoding]::Unicode.GetString($bytes)
            $match = [regex]::Match($text, '([A-Z]:\\[^\x00]+\.dll)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            if ($match.Success) {
                Write-Host "$key : $($match.Groups[1].Value)"
            }
        }
    } catch {}
}
