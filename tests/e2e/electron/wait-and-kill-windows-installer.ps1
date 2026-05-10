param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerFileName,

  [Parameter(Mandatory = $true)]
  [int]$TimeoutSeconds
)

$ErrorActionPreference = 'Stop'

$installerProcessName = [System.IO.Path]::GetFileNameWithoutExtension($InstallerFileName)
$eventSourceIdentifier = "AivisSpeechUpdaterInstallerStart-$PID"

# 指定された Win32_Process が、E2E で起動待ちしている NSIS インストーラーかどうかを判定する
# 既に起動済みのプロセスを拾う場合は ExecutablePath / CommandLine を使えるが、
# 起動イベント直後は ProcessName だけが確実に取れるため、両方の条件を同じ基準に寄せている
function Test-InstallerProcess {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Process
  )

  $isExecutablePathMatched =
    $null -ne $Process.ExecutablePath -and
    $Process.ExecutablePath.Contains($InstallerFileName)
  $isCommandLineMatched =
    $null -ne $Process.CommandLine -and
    $Process.CommandLine.Contains($InstallerFileName)
  $isProcessNameMatched =
    $null -ne $Process.Name -and
    $Process.Name.Contains($installerProcessName)

  return $isExecutablePathMatched -or $isCommandLineMatched -or $isProcessNameMatched
}

# NSIS インストーラー本体と、そこから起動された子プロセスをまとめて終了する
# CI ではインストーラー UI の操作や実インストール完了までは検証対象にせず、
# 「インストーラー起動まで到達した」ことを確認できた時点で後始末する
function Stop-InstallerProcessTree {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId
  )

  & taskkill /F /T /PID $ProcessId | Out-Null
}

try {
  # 監視開始前に既にインストーラーが起動している場合がある
  # その場合は Win32_ProcessStartTrace を待つと起動イベントを取り逃がすため、
  # まず現在のプロセス一覧を確認してからイベント監視に入る
  $existingProcesses = @(
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.ProcessId -ne $PID -and (Test-InstallerProcess -Process $_)
      }
  )

  if ($existingProcesses.Count -gt 0) {
    $processIds = @($existingProcesses | ForEach-Object { [int]$_.ProcessId })
    foreach ($processId in $processIds) {
      Stop-InstallerProcessTree -ProcessId $processId
    }

    [PSCustomObject]@{
      status = 'detected-existing'
      processIds = $processIds
    } | ConvertTo-Json -Compress
    exit 0
  }

  # プロセス一覧のポーリングだけだと、Windows CI 上で短時間だけ起動して終了したインストーラーを取り逃がす可能性がある
  # Win32_ProcessStartTrace で起動イベントを待つことで、
  # インストーラー UI を操作できない CI でも起動到達を確認する
  Register-CimIndicationEvent `
    -Query "SELECT * FROM Win32_ProcessStartTrace WHERE ProcessName = '$InstallerFileName'" `
    -SourceIdentifier $eventSourceIdentifier |
    Out-Null

  $processStartEvent = Wait-Event `
    -SourceIdentifier $eventSourceIdentifier `
    -Timeout $TimeoutSeconds

  if ($null -eq $processStartEvent) {
    throw "Timed out waiting for installer process start. fileName: $InstallerFileName"
  }

  $startedProcessId = [int]$processStartEvent.SourceEventArgs.NewEvent.ProcessID
  $startedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $startedProcessId" -ErrorAction SilentlyContinue

  # 起動直後にインストーラー側が終了している場合は、起動イベントの検出だけで成功とする
  # まだ生存していれば CI に UI を残さないように終了する
  if ($null -ne $startedProcess) {
    Stop-InstallerProcessTree -ProcessId $startedProcessId
  }

  [PSCustomObject]@{
    status = 'detected-start'
    processIds = @($startedProcessId)
    processName = $processStartEvent.SourceEventArgs.NewEvent.ProcessName
  } | ConvertTo-Json -Compress
} finally {
  # 同じ PowerShell セッション内で後続処理にイベント購読を残さないよう、必ず解除する
  Unregister-Event -SourceIdentifier $eventSourceIdentifier -ErrorAction SilentlyContinue
  Remove-Event -SourceIdentifier $eventSourceIdentifier -ErrorAction SilentlyContinue
}
