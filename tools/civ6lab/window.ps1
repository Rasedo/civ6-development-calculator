# The Civ 6 windows: `window.ps1 grid` / `window.ps1 min` / `window.ps1 restore`.
#   grid     every Civ 6 window, oldest first, tiled left to right then top to
#            bottom from the primary screen's upper-left corner, at its own
#            size; a window that no longer fits wraps back to the top
#   min      minimise them (a minimised game still plays, but measured MORE GPU
#            load than a visible one — keep them visible)
#   restore  restore them
param([ValidateSet("grid", "min", "restore")][string]$Action = "grid")
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace Win -Name User32 -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
[DllImport("user32.dll")] public static extern bool MoveWindow(System.IntPtr hWnd, int X, int Y, int W, int H, bool repaint);
[DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr hWnd, out RECT r);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
"@
$wins = @(Get-Process -Name "CivilizationVI*" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object StartTime)
if ($wins.Count -eq 0) { "no Civ 6 window"; exit 1 }
if ($Action -ne "grid") {
    $cmd = if ($Action -eq "min") { 6 } else { 9 }
    foreach ($p in $wins) { [void][Win.User32]::ShowWindow($p.MainWindowHandle, $cmd); "$Action $($p.Id)" }
    exit 0
}
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$x = $area.Left; $y = $area.Top; $rowH = 0
foreach ($p in $wins) {
    [void][Win.User32]::ShowWindow($p.MainWindowHandle, 9)
    $r = New-Object Win.User32+RECT
    [void][Win.User32]::GetWindowRect($p.MainWindowHandle, [ref]$r)
    $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
    if ($x + $w -gt $area.Right -and $x -gt $area.Left) { $x = $area.Left; $y += $rowH; $rowH = 0 }
    if ($y + $h -gt $area.Bottom) { $y = $area.Top }
    [void][Win.User32]::MoveWindow($p.MainWindowHandle, $x, $y, $w, $h, $true)
    "pid $($p.Id) at $x,$y ($w x $h)"
    $x += $w; if ($h -gt $rowH) { $rowH = $h }
}
