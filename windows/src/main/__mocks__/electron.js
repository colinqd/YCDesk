/**
 * Manual mock for electron module in vitest environment.
 * electron's main process APIs (powerMonitor, ipcMain, screen, etc.)
 * are not available in plain Node.js, so we mock them here.
 */

const mockPowerMonitor = {
  on: () => {},
}

const mockIpcMain = {
  handle: () => {},
}

const mockScreen = {
  getPrimaryDisplay: () => ({
    size: { width: 1920, height: 1080 },
  }),
}

const mockSafeStorage = {
  isEncryptionAvailable: () => false,
  encryptString: () => Buffer.from(''),
  decryptString: () => '',
}

const mockApp = {
  isReady: () => false,
  getPath: () => '',
}

module.exports = {
  powerMonitor: mockPowerMonitor,
  ipcMain: mockIpcMain,
  screen: mockScreen,
  safeStorage: mockSafeStorage,
  app: mockApp,
}