param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path,
    [int]$MinWidth = 100,
    [int]$MinHeight = 100,
    [int]$MinDistinctPixels = 0
)

$ErrorActionPreference = "Stop"
$signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
$files = foreach ($pattern in $Path) {
    Resolve-Path -Path $pattern | Select-Object -ExpandProperty Path
}

if (-not $files) {
    throw "No PNG files matched."
}

foreach ($file in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    function Read-Be32([int]$offset) {
        ([int]$bytes[$offset] * 16777216) +
        ([int]$bytes[$offset + 1] * 65536) +
        ([int]$bytes[$offset + 2] * 256) +
        [int]$bytes[$offset + 3]
    }
    if ($bytes.Length -lt 24) {
        throw "PNG too small: $file"
    }
    for ($i = 0; $i -lt $signature.Length; $i++) {
        if ($bytes[$i] -ne $signature[$i]) {
            throw "Invalid PNG signature: $file"
        }
    }
    $type = [System.Text.Encoding]::ASCII.GetString($bytes, 12, 4)
    if ($type -ne "IHDR") {
        throw "Missing IHDR chunk: $file"
    }
    $width = Read-Be32 16
    $height = Read-Be32 20
    if ($width -lt $MinWidth -or $height -lt $MinHeight) {
        throw "PNG dimensions too small: $file ($width x $height)"
    }
    if ($MinDistinctPixels -gt 0) {
        $python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $python) {
            $python = Get-Command python3 -ErrorAction SilentlyContinue
        }
        if (-not $python) {
            throw "Python is required for PNG pixel validation."
        }
        $env:KEEPDIR_ASSERT_PNG_FILE = $file
        $env:KEEPDIR_ASSERT_PNG_MIN_DISTINCT = "$MinDistinctPixels"
        @'
import os, struct, zlib

path = os.environ["KEEPDIR_ASSERT_PNG_FILE"]
minimum = int(os.environ["KEEPDIR_ASSERT_PNG_MIN_DISTINCT"])
data = open(path, "rb").read()
pos = 8
idat = bytearray()
width = height = bit_depth = color_type = None
samples = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}

while pos + 8 <= len(data):
    length = struct.unpack(">I", data[pos:pos + 4])[0]
    kind = data[pos + 4:pos + 8]
    payload = data[pos + 8:pos + 8 + length]
    pos += 12 + length
    if kind == b"IHDR":
        width, height, bit_depth, color_type = struct.unpack(">IIBB", payload[:10])
    elif kind == b"IDAT":
        idat.extend(payload)
    elif kind == b"IEND":
        break

if bit_depth != 8 or color_type not in samples:
    raise SystemExit(f"unsupported PNG format for pixel validation: {path}")

channels = samples[color_type]
row_bytes = width * channels
bpp = max(1, channels)
raw = zlib.decompress(bytes(idat))
previous = [0] * row_bytes
offset = 0
distinct = set()

def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c

for _ in range(height):
    filter_type = raw[offset]
    offset += 1
    row = list(raw[offset:offset + row_bytes])
    offset += row_bytes
    for i, value in enumerate(row):
        left = row[i - bpp] if i >= bpp else 0
        up = previous[i]
        up_left = previous[i - bpp] if i >= bpp else 0
        if filter_type == 1:
            row[i] = (value + left) & 255
        elif filter_type == 2:
            row[i] = (value + up) & 255
        elif filter_type == 3:
            row[i] = (value + ((left + up) // 2)) & 255
        elif filter_type == 4:
            row[i] = (value + paeth(left, up, up_left)) & 255
        elif filter_type != 0:
            raise SystemExit(f"unsupported PNG filter {filter_type}: {path}")
    for i in range(0, row_bytes, channels):
        distinct.add(tuple(row[i:i + channels]))
        if len(distinct) >= minimum:
            break
    if len(distinct) >= minimum:
        break
    previous = row

if len(distinct) < minimum:
    raise SystemExit(f"PNG appears blank: {path} ({len(distinct)} distinct pixels)")
'@ | & $python.Source -
        if ($LASTEXITCODE -ne 0) {
            throw "PNG pixel validation failed: $file"
        }
    }
    Write-Host "OK $file ($width x $height)"
}
