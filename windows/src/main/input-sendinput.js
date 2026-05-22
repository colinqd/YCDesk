/**
 * 基于 PowerShell SendInput 的鼠标/键盘模拟模块
 *
 * 作为 robotjs 的替代/后备方案。
 * 使用 Windows SendInput API，不需要编译本地模块。
 *
 * 性能优化：使用持久化 PowerShell 进程 + stdin 管道通信，
 * 避免每次操作启动新进程的开销。
 */

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

let psProcess = null
let _commandQueue = []
let _processing = false
let _pendingBuffer = ''
let isInitialized = false
let logger = null

const DIAG_LOG_FILE = 'C:\\ProgramData\\YCDesk\\input_sendinput.log'

function diagLog(message) {
  try {
    const flagDir = 'C:\\ProgramData\\YCDesk'
    if (!fs.existsSync(flagDir)) fs.mkdirSync(flagDir, { recursive: true })
    const ts = new Date().toISOString()
    fs.appendFileSync(DIAG_LOG_FILE, `[${ts}] ${message}\n`, 'utf8')
  } catch (e) { /* ignore */ }
  // 同时输出到 console，方便用户查看
  console.error('[SendInput]', message)
}

function log(level, message, data) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](message, data)
  }
}

function setLogger(logInstance) {
  logger = logInstance
}

// C# 脚本（编译为 PowerShell 的内嵌程序集）
// 使用 SendInput API 实现鼠标/键盘操作
// 采用 IntPtr 手动内存布局，避免 struct 布局兼容问题
const CS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class InputHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, IntPtr pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern IntPtr GetMessageExtraInfo();

    // sizeof(INPUT) on 64-bit = 40, on 32-bit = 28
    static readonly int INPUT_SIZE = IntPtr.Size == 8 ? 40 : 28;

    // ---- union offset 0: mi.dx / ki.wVk:wScan (4 bytes) ----
    const int OFF_DX = 8;

    // ---- union offset 4: mi.dy / ki.dwFlags (4 bytes) ----
    const int OFF_DY = 12;

    // ---- union offset 8: mi.mouseData / ki.time (4 bytes) ----
    const int OFF_DATA = 16;

    // ---- union offset 12: mi.dwFlags / ki.padding (4 bytes) ----
    const int OFF_FLAGS = 20;

    // ---- mouse dwExtraInfo at union offset 24 (offset 32 in INPUT) ----
    const int OFF_EXTRAINFO_MOUSE = 32;
    // ---- keyboard dwExtraInfo at union offset 16 (offset 24 in INPUT) ----
    const int OFF_EXTRAINFO_KEYBD = 24;

    const uint INPUT_MOUSE = 0;
    const uint INPUT_KEYBOARD = 1;

    const uint MOUSEEVENTF_MOVE = 0x0001;
    const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    const uint MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
    const uint MOUSEEVENTF_WHEEL = 0x0800;

    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;

    // ---- 分配并初始化 INPUT 内存 ----
    static IntPtr AllocInput(uint type) {
        IntPtr ptr = Marshal.AllocHGlobal(INPUT_SIZE);
        // Zero entire struct (safe for both 32-bit and 64-bit)
        for (int i = 0; i < INPUT_SIZE; i++) {
            Marshal.WriteByte(ptr, i, 0);
        }
        Marshal.WriteInt32(ptr, 0, (int)type);
        return ptr;
    }

    static void FreeAndSend(IntPtr ptr) {
        try { SendInput(1, ptr, INPUT_SIZE); }
        finally { Marshal.FreeHGlobal(ptr); }
    }

    // ---- 鼠标操作 ----
    static void SendMouse(uint flags, int x, int y, uint data) {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_DX, x);
        Marshal.WriteInt32(ptr, OFF_DY, y);
        Marshal.WriteInt32(ptr, OFF_DATA, (int)data);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)flags);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MoveMouse(int x, int y) {
        SendMouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, x, y, 0);
    }

    static void MouseButton(uint downFlag, uint upFlag) {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)downFlag);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
        Thread.Sleep(30);
        ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)upFlag);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseLeftDown() {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_LEFTDOWN);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseLeftUp() {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_LEFTUP);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseLeftClick() {
        MouseButton(MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP);
    }

    public static void MouseRightDown() {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_RIGHTDOWN);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseRightUp() {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_RIGHTUP);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseRightClick() {
        MouseButton(MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP);
    }

    public static void MouseMiddleDown() {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_MIDDLEDOWN);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseMiddleUp() {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_MIDDLEUP);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void MouseMiddleClick() {
        MouseButton(MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP);
    }

    public static void MouseWheel(int delta) {
        IntPtr ptr = AllocInput(INPUT_MOUSE);
        Marshal.WriteInt32(ptr, OFF_DATA, delta);
        Marshal.WriteInt32(ptr, OFF_FLAGS, (int)MOUSEEVENTF_WHEEL);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_MOUSE, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    // ---- 键盘操作 ----
    static void SendKey(ushort vk, uint flags) {
        IntPtr ptr = AllocInput(INPUT_KEYBOARD);
        Marshal.WriteInt16(ptr, OFF_DX, (short)vk);
        Marshal.WriteInt16(ptr, OFF_DX + 2, 0); // wScan
        Marshal.WriteInt32(ptr, OFF_DY, (int)flags);
        Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_KEYBD, GetMessageExtraInfo());
        FreeAndSend(ptr);
    }

    public static void KeyDown(ushort vk) {
        SendKey(vk, 0);
    }

    public static void KeyUp(ushort vk) {
        SendKey(vk, KEYEVENTF_KEYUP);
    }

    public static void KeyTap(ushort vk) {
        KeyDown(vk);
        Thread.Sleep(20);
        KeyUp(vk);
    }

    // ---- Unicode 文本输入 ----
    public static void TypeString(string text) {
        foreach (char c in text) {
            // char down
            IntPtr ptr = AllocInput(INPUT_KEYBOARD);
            Marshal.WriteInt16(ptr, OFF_DX, (short)c);  // wVk as Unicode char
            Marshal.WriteInt16(ptr, OFF_DX + 2, 0);
            Marshal.WriteInt32(ptr, OFF_DY, (int)KEYEVENTF_UNICODE);
            Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_KEYBD, GetMessageExtraInfo());
            FreeAndSend(ptr);
            // char up
            Thread.Sleep(20);
            ptr = AllocInput(INPUT_KEYBOARD);
            Marshal.WriteInt16(ptr, OFF_DX, (short)c);
            Marshal.WriteInt16(ptr, OFF_DX + 2, 0);
            Marshal.WriteInt32(ptr, OFF_DY, (int)(KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
            Marshal.WriteIntPtr(ptr, OFF_EXTRAINFO_KEYBD, GetMessageExtraInfo());
            FreeAndSend(ptr);
            Thread.Sleep(20);
        }
    }
}
"@

function Invoke-InputCommand {
    param([string]$Command, [string]$Arg1, [string]$Arg2)
    switch ($Command) {
        "mousemove" {
            $x = [int]$Arg1
            $y = [int]$Arg2
            [InputHelper]::MoveMouse($x, $y)
        }
        "mousedown" {
            $btn = if ($Arg1 -eq "0" -or $Arg1 -eq "left") { "left" } elseif ($Arg1 -eq "2" -or $Arg1 -eq "right") { "right" } elseif ($Arg1 -eq "1" -or $Arg1 -eq "middle") { "middle" } else { "left" }
            switch ($btn) {
                "left" { [InputHelper]::MouseLeftDown() }
                "right" { [InputHelper]::MouseRightDown() }
                "middle" { [InputHelper]::MouseMiddleDown() }
            }
        }
        "mouseup" {
            $btn = if ($Arg1 -eq "0" -or $Arg1 -eq "left") { "left" } elseif ($Arg1 -eq "2" -or $Arg1 -eq "right") { "right" } elseif ($Arg1 -eq "1" -or $Arg1 -eq "middle") { "middle" } else { "left" }
            switch ($btn) {
                "left" { [InputHelper]::MouseLeftUp() }
                "right" { [InputHelper]::MouseRightUp() }
                "middle" { [InputHelper]::MouseMiddleUp() }
            }
        }
        "click" {
            $btn = if ($Arg1 -eq "0" -or $Arg1 -eq "left") { "left" } elseif ($Arg1 -eq "2" -or $Arg1 -eq "right") { "right" } else { "middle" }
            switch ($btn) {
                "left" { [InputHelper]::MouseLeftClick() }
                "right" { [InputHelper]::MouseRightClick() }
                "middle" { [InputHelper]::MouseMiddleClick() }
            }
        }
        "wheel" {
            [InputHelper]::MouseWheel([int]$Arg1)
        }
        "keydown" {
            [InputHelper]::KeyDown([ushort][int]$Arg1)
        }
        "keyup" {
            [InputHelper]::KeyUp([ushort][int]$Arg1)
        }
        "keytap" {
            [InputHelper]::KeyTap([ushort][int]$Arg1)
        }
        "text" {
            [InputHelper]::TypeString($Arg1)
        }
    }
}

# Main loop: read commands from stdin, execute, write "OK" to stdout
$reader = [System.IO.StreamReader]::new([System.Console]::OpenStandardInput())
[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()
while (($line = $reader.ReadLine()) -ne "EXIT") {
    if ([string]::IsNullOrEmpty($line)) { continue }
    try {
        $parts = $line.Split("|")
        if ($parts.Length -ge 1) {
            Invoke-InputCommand -Command $parts[0] -Arg1 $($parts[1] -replace '^"|"$','') -Arg2 $($parts[2] -replace '^"|"$','')
        }
        [Console]::Out.WriteLine("OK")
        [Console]::Out.Flush()
    } catch {
        [Console]::Error.WriteLine("ERR:" + $_.Exception.Message)
        [Console]::Out.WriteLine("OK")
        [Console]::Out.Flush()
    }
}
`

let psScriptLoaded = false

function ensureProcess() {
  if (psProcess && !psProcess.killed) return true

  return new Promise((resolve, reject) => {
    try {
      const powershellPath = process.env.SYSTEMROOT
        ? `${process.env.SYSTEMROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
        : 'powershell.exe'

      psProcess = spawn(powershellPath, [
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile',
        '-NonInteractive',
        '-Command', '-'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      })

      let startupBuffer = ''
      let startupDone = false

      psProcess.stdout.on('data', (data) => {
        const text = data.toString('utf8')
        // pendingBuffer accumulation moved to FIFO queue section

        if (!startupDone) {
          startupBuffer += text
          if (startupBuffer.includes('READY') || startupBuffer.includes('OK') || startupBuffer.includes('ready')) {
            startupDone = true
            isInitialized = true
            resolve(true)
          }
        }

        // FIFO command queue: resolve current pending on OK response
        // PowerShell [Console]::Out.WriteLine("OK") outputs "OK\r\n" (Windows CRLF).
        // We split on '\n' and check the line content to handle both "OK\r\n" and "OK\n".
        _pendingBuffer += text
        var newlineIdx
        while ((newlineIdx = _pendingBuffer.indexOf('\n')) !== -1) {
          var line = _pendingBuffer.substring(0, newlineIdx)
          // Strip trailing \r for Windows line endings
          if (line.charAt(line.length - 1) === '\r') line = line.slice(0, -1)
          _pendingBuffer = _pendingBuffer.slice(newlineIdx + 1)
          if (line === 'OK') {
            _dequeueAndProcessNext()
          }
        }
      })

      psProcess.stderr.on('data', (data) => {
        const text = data.toString('utf8')
        if (!text.includes('ERR:')) {
          diagLog('[SendInput] stderr: ' + text.trim())
        }
      })

      psProcess.on('error', (err) => {
        diagLog('[SendInput] process error: ' + err.message)
        isInitialized = false
        initPromise = null
        if (!startupDone) reject(err)
      })

      psProcess.on('exit', (code) => {
        diagLog('[SendInput] process exited: ' + code)
        isInitialized = false
        psProcess = null
        initPromise = null
        // 重置客户端工厂状态，允许重新初始化
        _clientRef = null
        _clientInitStarted = false
        if (_clientRetryTimer) {
          clearTimeout(_clientRetryTimer)
          _clientRetryTimer = null
        }
        _rejectAll('Process exited')
      })

      // Load and execute the C# script
      psProcess.stdin.write(CS_SCRIPT + '\r\n')
      psProcess.stdin.write('Write-Host "ready"\r\n')

      // Timeout for startup
      setTimeout(() => {
        if (!startupDone) {
          startupDone = true
          // 只在进程仍然存活时标记为初始化完成
          if (psProcess && !psProcess.killed) {
            isInitialized = true
          }
          resolve(true) // Continue anyway
        }
      }, 5000)
    } catch (err) {
      diagLog('[SendInput] init error: ' + err.message)
      reject(err)
    }
  })
}

function sendCommand(command, arg1, arg2) {
  if (!psProcess || psProcess.killed) {
    return init().then(function () { return sendCommand(command, arg1, arg2) })
  }

  return new Promise(function (resolve, reject) {
    _commandQueue.push({ command: command, arg1: arg1, arg2: arg2, resolve: resolve, reject: reject })
    _processQueue()
  })
}



// ---- FIFO command queue ----

function _processQueue() {
  if (_processing || _commandQueue.length === 0) return
  var entry = _commandQueue[0]
  if (!entry) return

  _processing = true

  try {
    var line = entry.command + '|' + (entry.arg1 !== undefined ? entry.arg1 : '') + '|' + (entry.arg2 !== undefined ? entry.arg2 : '')
    psProcess.stdin.write(line + '\r\n')
    // Note: pipe streams don't have flush(); write() sends data asynchronously
  } catch (err) {
    _commandQueue.shift()
    _processing = false
    entry.reject(err)
    _processQueue()
    return
  }

  entry._timer = setTimeout(function () {
    _commandQueue.shift()
    _processing = false
    entry.resolve(true)
    _processQueue()
  }, 5000)
}

function _dequeueAndProcessNext() {
  if (_commandQueue.length > 0) {
    var entry = _commandQueue.shift()
    if (entry._timer) clearTimeout(entry._timer)
    entry.resolve(true)
  }
  _processing = false
  _processQueue()
}

function _rejectAll(errMsg) {
  while (_commandQueue.length > 0) {
    var entry = _commandQueue.shift()
    if (entry._timer) clearTimeout(entry._timer)
    entry.reject(new Error(errMsg))
  }
  _processing = false
}

let initPromise = null

function init() {
  if (isInitialized && psProcess && !psProcess.killed) return Promise.resolve(true)
  if (initPromise) return initPromise
  initPromise = ensureProcess().catch(err => {
    initPromise = null
    throw err
  })
  return initPromise
}

function close() {
  _rejectAll('Closing')
  if (psProcess && !psProcess.killed) {
    try {
      psProcess.stdin.write('EXIT\r\n')
    } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (psProcess && !psProcess.killed) psProcess.kill()
    }, 1000)
  }
  isInitialized = false
  psProcess = null
  initPromise = null
  _clientRef = null
  _clientInitStarted = false
  if (_clientRetryTimer) {
    clearTimeout(_clientRetryTimer)
    _clientRetryTimer = null
  }
}

// ---- 公开 API ----

function moveMouse(x, y) {
  return sendCommand('mousemove', x, y)
}

function mouseDown(button) {
  return sendCommand('mousedown', button)
}

function mouseUp(button) {
  return sendCommand('mouseup', button)
}

function mouseClick(button) {
  return sendCommand('click', button)
}

function mouseWheel(delta) {
  return sendCommand('wheel', delta)
}

function keyDown(vk) {
  return sendCommand('keydown', vk)
}

function keyUp(vk) {
  return sendCommand('keyup', vk)
}

function keyTap(vk) {
  return sendCommand('keytap', vk)
}

function typeString(text) {
  return sendCommand('text', text)
}

module.exports = {
  init,
  close,
  setLogger,
  moveMouse,
  mouseDown,
  mouseUp,
  mouseClick,
  mouseWheel,
  keyDown,
  keyUp,
  keyTap,
  typeString,
  get isAvailable() { return isInitialized },
  createClient
}

// ---- 共享客户端工厂 ----

let _clientRef = null
let _clientInitStarted = false
let _clientRetryTimer = null
let _lastDiagState = '' // 避免重复日志

/**
 * 创建/获取 SendInput 客户端单例。
 * 供 input-handler.js 和 mouse-normalizer.js 共享使用，
 * 消除两处的重复 _getSendInput() 惰性初始化模式。
 *
 * @param {object} [logInstance] 可选日志实例
 * @returns {object|null} SendInput API 对象，不可用时返回 null
 */
function createClient(logInstance) {
  // 如果之前初始化失败，10秒后自动重试
  if (_clientRef === false && !_clientRetryTimer) {
    _clientRetryTimer = setTimeout(() => {
      _clientRef = null
      _clientInitStarted = false
      _clientRetryTimer = null
      diagLog('[SendInput] 重试计时器触发，重置 _clientRef=null 重新尝试初始化')
    }, 10000)
  }

  if (_clientRef === null && !_clientInitStarted) {
    _clientInitStarted = true
    try {
      if (logInstance) setLogger(logInstance)
      init().catch(() => {
        _clientRef = false
        log('error', '[SendInput] init 失败，将在10秒后重试')
        diagLog('[SendInput] init 失败，_clientRef = false')
      })
      _clientRef = module.exports
    } catch (e) {
      _clientRef = false
      diagLog('[SendInput] createClient 同步异常: ' + e.message)
    }
  }

  if (_clientRef && _clientRef.isAvailable) return _clientRef

  // 每个状态只记录一次诊断日志，避免高频输入时刷盘
  const stateKey = _clientRef === false ? 'false' : (!_clientRef ? 'null' : 'pending')
  if (_lastDiagState !== stateKey) {
    _lastDiagState = stateKey
    if (_clientRef === false) {
      diagLog('[SendInput] createClient 返回 null: 之前初始化失败（10秒后重试）')
    } else if (!_clientRef) {
      diagLog('[SendInput] createClient 返回 null: 未初始化（等待首次调用）')
    } else {
      diagLog('[SendInput] createClient 返回 null: 初始化进行中（等待 READY 信号）')
    }
  }

  return null
}
