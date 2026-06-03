param(
  [int]$StartPort = 18080,
  [int]$EndPort = 18179
)

for ($port = $StartPort; $port -le $EndPort; $port++) {
  $listener = $null
  try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
    $listener.Start()
    $listener.Stop()
    Write-Output $port
    exit 0
  } catch {
    if ($listener) {
      try { $listener.Stop() } catch {}
    }
  }
}

exit 1
