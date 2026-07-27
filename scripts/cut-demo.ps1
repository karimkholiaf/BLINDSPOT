# Cuts the raw capture into the submission video.
#
# Two things happen here. The tail is dropped: the raw take ends with a second
# attempt at the same concept, which only lands if a strong model grades it, and
# on free-tier quota it usually falls through to a weaker one and comes back
# "Thin in places" instead of "Solid". A half-landed beat is worse than no beat.
#
# The two loading stretches are then sped up. Each is roughly 25 seconds of a
# spinner, inflated by requests falling through models that have spent their
# daily quota. They are still shown, just not in real time.
#
# Usage: pwsh scripts/cut-demo.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$bin = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin"
$ffmpeg = Join-Path $bin "ffmpeg.exe"
$ffprobe = Join-Path $bin "ffprobe.exe"

$source = (Get-ChildItem docs\footage -Filter *.webm | Select-Object -First 1).FullName
$out = "docs\blindspot-demo.mp4"

# Segment boundaries in the raw capture, in seconds.
$heroEnd = 13.0   # hero and the scotoma test
$extractEnd = 37.0   # extraction spinner
$typingEnd = 48.0   # map lands, concept picked, explanation typed
$assessEnd = 73.0   # assessment spinner
$finishEnd = 92.0   # diagnosis card read, rail shows the flag
$rush = 5        # speed factor applied to the two spinners

$filter = @"
[0:v]trim=0:$heroEnd,setpts=PTS-STARTPTS[a];
[0:v]trim=$heroEnd`:$extractEnd,setpts=(PTS-STARTPTS)/$rush[b];
[0:v]trim=$extractEnd`:$typingEnd,setpts=PTS-STARTPTS[c];
[0:v]trim=$typingEnd`:$assessEnd,setpts=(PTS-STARTPTS)/$rush[d];
[0:v]trim=$assessEnd`:$finishEnd,setpts=PTS-STARTPTS[e];
[a][b][c][d][e]concat=n=5:v=1:a=0,fps=30[out]
"@
$filterFile = "docs\footage\cut.filter"
$filter -replace "`r`n", "" | Set-Content $filterFile -Encoding ascii -NoNewline

& $ffmpeg -y -v error -i $source -filter_complex_script $filterFile -map "[out]" `
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart $out

$duration = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $out
$size = (Get-Item $out).Length
Write-Host ("{0}  {1:N1}s  {2:N1} MB" -f $out, [double]$duration, ($size / 1MB))
if ([double]$duration -gt 115) { Write-Host "WARNING: over 115s, the 2:00 cap leaves no margin" }
