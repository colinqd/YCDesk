/**
 * 按键名称到 Windows 虚拟键码 (VK) 的映射
 *
 * 为 SendInput 回退方案提供 robotjs 风格按键名 → VK 码的转换。
 * 仅当 robotjs 不可用时使用。
 */

const ROBOTJS_TO_VK = {
  'backspace': 0x08,
  'tab': 0x09,
  'enter': 0x0D,
  'shift': 0x10,
  'control': 0x11,
  'alt': 0x12,
  'pause': 0x13,
  'caps_lock': 0x14,
  'escape': 0x1B,
  'space': 0x20,
  'pageup': 0x21,
  'pagedown': 0x22,
  'end': 0x23,
  'home': 0x24,
  'left': 0x25,
  'up': 0x26,
  'right': 0x27,
  'down': 0x28,
  'print': 0x2A,
  'insert': 0x2D,
  'delete': 0x2E,
  'command': 0x5B,  // VK_LWIN
  'numpad_0': 0x60, 'numpad_1': 0x61, 'numpad_2': 0x62, 'numpad_3': 0x63,
  'numpad_4': 0x64, 'numpad_5': 0x65, 'numpad_6': 0x66, 'numpad_7': 0x67,
  'numpad_8': 0x68, 'numpad_9': 0x69,
  'numpad_multiply': 0x6A,
  'numpad_add': 0x6B,
  'numpad_subtract': 0x6D,
  'numpad_decimal': 0x6E,
  'numpad_divide': 0x6F,
  'f1': 0x70, 'f2': 0x71, 'f3': 0x72, 'f4': 0x73,
  'f5': 0x74, 'f6': 0x75, 'f7': 0x76, 'f8': 0x77,
  'f9': 0x78, 'f10': 0x79, 'f11': 0x7A, 'f12': 0x7B,
  'num_lock': 0x90,
  'scroll_lock': 0x91,
  ';': 0xBA,
  '=': 0xBB,
  ',': 0xBC,
  '-': 0xBD,
  '.': 0xBE,
  '/': 0xBF,
  '`': 0xC0,
  '[': 0xDB,
  '\\': 0xDC,
  ']': 0xDD,
  "'": 0xDE
}

/**
 * 将 robotjs 风格的按键名转换为 Windows 虚拟键码 (VK)
 * @param {string} keyName robotjs 按键名（如 'enter', 'control', 'a'）
 * @returns {number} VK 码，0 表示未找到
 */
function getVkCode(keyName) {
  if (!keyName || typeof keyName !== 'string') return 0
  const lowerKey = keyName.toLowerCase()

  // 查表
  if (ROBOTJS_TO_VK[lowerKey] !== undefined) return ROBOTJS_TO_VK[lowerKey]

  // 单个字符：字母 A-Z (0x41-0x5A)，数字 0-9 (0x30-0x39)
  if (lowerKey.length === 1) {
    const code = lowerKey.charCodeAt(0)
    if (code >= 97 && code <= 122) return code - 32  // a-z → VK_A-VK_Z
    if (code >= 48 && code <= 57) return code         // 0-9 → VK_0-VK_9
  }

  return 0
}

module.exports = { getVkCode, ROBOTJS_TO_VK }
