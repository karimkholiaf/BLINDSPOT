# Muxes a recorded voiceover onto the cut demo.
#
# Usage: record docs/voiceover.wav (or .mp3), then: pwsh scripts/add-voiceover.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$bin = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin"
$ffmpeg = Join-Path $bin "ffmpeg.exe"
$ffprobe = Join-Path $bin "ffprobe.exe"

$video = "docs\blindspot-demo.mp4"
$audio = Get-ChildItem docs -Include voiceover.wav, voiceover.mp3 -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
$out = "docs\blindspot-demo-final.mp4"

if (-not $audio) {
    Write-Host "No docs/voiceover.wav or docs/voiceover.mp3 found."
    Write-Host "The silent cut at $video is still submittable."
    exit 1
}

# -shortest so a slightly long take is trimmed rather than leaving the video
# frozen on its last frame while narration continues.
& $ffmpeg -y -v error -i $video -i $audio.FullName `
    -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $out

$duration = [double](& $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $out)
Write-Host ("{0}  {1:N1}s" -f $out, $duration)
if ($duration -gt 120) {
    Write-Host "STOP: over the 2:00 cap. Judges will not watch it. Shorten the narration."
} else {
    Write-Host ("Under the 2:00 cap with {0:N0}s to spare." -f (120 - $duration))
}
