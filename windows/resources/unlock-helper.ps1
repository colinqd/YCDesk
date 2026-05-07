# YCDesk 解锁辅助脚本
# 读取临时密码文件并模拟键盘输入
param(
  [switch]$Elevated
)

Write-Host "[YCDesk] 解锁辅助脚本启动"

# 首先获取当前会话的 ID
$sessionId = $null
try {
  $sessions = query session 2>&1
  foreach ($line in $sessions) {
    if ($line -match 'console') {
      $parts = $line -split '\s+'
      foreach ($p in $parts) {
        if ($p -match '^\d+$') {
          $sessionId = $p
          break
        }
      }
      break
    }
  }
  if (-not $sessionId) {
    $sessionId = "1"
  }
  Write-Host "[YCDesk] 当前会话 ID: $sessionId"
} catch {
  $sessionId = "1"
  Write-Host "[YCDesk] 使用默认会话 ID: $sessionId"
}

# 查找密码文件
$tempFile = "$env:TEMP\ycdesk_unlock_password.dat"
Write-Host "[YCDesk] 查找密码文件: $tempFile"

if (-not (Test-Path $tempFile)) {
  Write-Host "[YCDesk] ❌ 密码文件不存在"
  exit 1
}

# 读取密码
try {
  $password = [System.IO.File]::ReadAllText($tempFile)
  Write-Host "[YCDesk] ✅ 读取密码成功，长度: $($password.Length)"
} catch {
  Write-Host "[YCDesk] ❌ 读取密码失败: $($_.Exception.Message)"
  exit 1
}

# 加载输入帮助类
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class InputHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public KEYBDINPUT ki;
        public uint padding1;
        public uint padding2;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    public const uint INPUT_KEYBOARD = 1;
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const uint KEYEVENTF_UNICODE = 0x0004;

    public static void TapKey(ushort vk) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = vk;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = vk;
        inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void TypeChar(char c) {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wScan = (ushort)c;
        inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wScan = (ushort)c;
        inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@

Write-Host "[YCDesk] ========== 开始解锁 =========="

# Step 1: 唤醒锁屏界面
Write-Host "[YCDesk] 唤醒锁屏界面..."
for ($i = 0; $i -lt 5; $i++) {
    [InputHelper]::TapKey(0x20)  # Space
    Start-Sleep -Milliseconds 200
}
Start-Sleep -Milliseconds 1000

# Step 2: 清除旧输入
Write-Host "[YCDesk] 清除旧输入..."
for ($i = 0; $i -lt 50; $i++) {
    [InputHelper]::TapKey(0x08)  # Backspace
    Start-Sleep -Milliseconds 50
}
Start-Sleep -Milliseconds 500

# Step 3: 输入密码
Write-Host "[YCDesk] 输入密码..."
foreach ($c in $password.ToCharArray()) {
    [InputHelper]::TypeChar($c)
    Start-Sleep -Milliseconds 100
}

# Step 4: 按回车
Start-Sleep -Milliseconds 500
Write-Host "[YCDesk] 按回车确认..."
[InputHelper]::TapKey(0x0D)

# 等待并清理
Start-Sleep -Milliseconds 2000
try {
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    Write-Host "[YCDesk] ✅ 临时密码文件已清理"
} catch {}

Write-Host "[YCDesk] ✅ 解锁辅助完成"
exit 0
