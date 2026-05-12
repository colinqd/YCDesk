const DEFAULT_DEVICE_ID_LENGTH = 9;
const MIN_DEVICE_ID_LENGTH = 6;
const MAX_DEVICE_ID_LENGTH = 16;
const STORAGE_KEY = 'ycdesk_device_id';

const ALLOWED_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

class DeviceIdManager {
    constructor(options = {}) {
        this.storage = options.storage || window.localStorage;
        this.logger = options.logger || console;
        this.deviceId = null;
        this.loadDeviceId();
    }

    loadDeviceId() {
        try {
            const stored = this.storage.getItem(STORAGE_KEY);
            if (stored && this.isValidDeviceId(stored)) {
                this.deviceId = stored;
                this.logger.log('[DeviceIdManager] 从存储加载设备ID:', this.deviceId);
            }
        } catch (e) {
            this.logger.error('[DeviceIdManager] 加载设备ID失败:', e);
        }
    }

    getDeviceId() {
        if (!this.deviceId) {
            this.deviceId = this.generateDeviceId(DEFAULT_DEVICE_ID_LENGTH);
            this.saveDeviceId(this.deviceId);
        }
        return this.deviceId;
    }

    setDeviceId(deviceId) {
        if (!this.isValidDeviceId(deviceId)) {
            throw new Error('无效的设备ID');
        }
        this.deviceId = deviceId;
        this.saveDeviceId(deviceId);
        this.logger.log('[DeviceIdManager] 设置设备ID:', deviceId);
    }

    generateDeviceId(length = DEFAULT_DEVICE_ID_LENGTH) {
        const actualLength = Math.min(Math.max(length, MIN_DEVICE_ID_LENGTH), MAX_DEVICE_ID_LENGTH);
        let result = '';
        
        for (let i = 0; i < actualLength; i++) {
            const randomIndex = Math.floor(Math.random() * ALLOWED_CHARS.length);
            result += ALLOWED_CHARS.charAt(randomIndex);
        }
        
        this.logger.log('[DeviceIdManager] 生成设备ID:', result);
        return result;
    }

    isValidDeviceId(deviceId) {
        if (!deviceId || typeof deviceId !== 'string') {
            return false;
        }
        
        if (deviceId.length < MIN_DEVICE_ID_LENGTH || deviceId.length > MAX_DEVICE_ID_LENGTH) {
            return false;
        }
        
        for (let char of deviceId) {
            if (!ALLOWED_CHARS.includes(char)) {
                return false;
            }
        }
        
        return true;
    }

    saveDeviceId(deviceId) {
        try {
            this.storage.setItem(STORAGE_KEY, deviceId);
            this.logger.log('[DeviceIdManager] 设备ID已保存');
        } catch (e) {
            this.logger.error('[DeviceIdManager] 保存设备ID失败:', e);
        }
    }

    resetDeviceId() {
        this.deviceId = null;
        try {
            this.storage.removeItem(STORAGE_KEY);
            this.logger.log('[DeviceIdManager] 设备ID已重置');
        } catch (e) {
            this.logger.error('[DeviceIdManager] 重置设备ID失败:', e);
        }
    }

    hasDeviceId() {
        return !!this.deviceId;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DeviceIdManager };
} else {
    window.DeviceIdManager = DeviceIdManager;
}