Add-Type -AssemblyName System.Drawing

function New-Sidebar {
  param(
    [string]$Path,
    [string]$Title,
    [string]$Subtitle
  )

  $width = 164
  $height = 314
  $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
  # "云朵舞者" (slate-light) 主色系：#e8e6e2 -> #f0efec + 暖灰蓝点缀
  $top = [System.Drawing.Color]::FromArgb(255, 232, 230, 226)
  $mid = [System.Drawing.Color]::FromArgb(255, 240, 239, 236)
  $bottom = [System.Drawing.Color]::FromArgb(255, 199, 191, 183)

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $top, $bottom, 90)
  $blend = New-Object System.Drawing.Drawing2D.ColorBlend
  $blend.Colors = @($top, $mid, $bottom)
  $blend.Positions = @(0.0, 0.55, 1.0)
  $bgBrush.InterpolationColors = $blend
  $g.FillRectangle($bgBrush, $rect)

  for ($i = 0; $i -lt 4; $i++) {
    $alpha = 40 - ($i * 8)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($alpha, 124, 140, 154), 2)
    $y = 70 + ($i * 38)
    $g.DrawBezier($pen, -20, $y, 35, ($y - 28), 120, ($y + 26), 190, ($y - 5))
    $pen.Dispose()
  }

  $titleFont = New-Object System.Drawing.Font("Segoe UI Semibold", 18, [System.Drawing.FontStyle]::Bold)
  $subFont = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
  $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(246, 73, 68, 61))
  $titleShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 255, 255, 255))
  $subtitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 98, 92, 84))

  $g.DrawString($Title, $titleFont, $titleShadowBrush, 15, 24)
  $g.DrawString($Title, $titleFont, $titleBrush, 14, 22)
  $g.DrawString($Subtitle, $subFont, $subtitleBrush, 16, 282)

  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)

  $subtitleBrush.Dispose()
  $titleShadowBrush.Dispose()
  $titleBrush.Dispose()
  $subFont.Dispose()
  $titleFont.Dispose()
  $bgBrush.Dispose()
  $g.Dispose()
  $bmp.Dispose()
}

New-Sidebar -Path ".\assets\installer-sidebar.bmp" -Title "TAgent" -Subtitle "Cloud Dancer Installer"
New-Sidebar -Path ".\assets\uninstaller-sidebar.bmp" -Title "TAgent" -Subtitle "Cloud Dancer Uninstaller"
