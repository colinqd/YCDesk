import crypto from 'node:crypto';

/**
 * 生成加密安全的随机十六进制字符串
 * @param {number} length - 输出字符长度（默认 8，实际字节数为 length/2）
 * @returns {string} 十六进制字符串
 */
export function secureId(length = 8) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * 生成加密安全的随机字母数字字符串（大写字母 + 数字）
 * @param {number} length - 输出长度（默认 9）
 * @returns {string} 大写字母数字字符串
 */
export function secureAlphaNum(length = 9) {
  const bytes = crypto.randomBytes(length);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * 生成加密安全的随机设备 ID（带前缀）
 * @param {string} prefix - 设备前缀（如 'WIN', 'AND', 'LNX', 'WEB'）
 * @param {number} suffixLength - 后缀长度（默认 9）
 * @returns {string} 设备 ID，如 'WIN-A3F9K2B1C'
 */
export function secureDeviceId(prefix, suffixLength = 9) {
  return `${prefix}-${secureAlphaNum(suffixLength)}`;
}
