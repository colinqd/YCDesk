const FallbackStrategy = {
  NONE: 'none',
  MANUAL_COPY: 'manual-copy',
  DISABLED: 'disabled',
  LOCAL_CACHE: 'local-cache',
  NOTIFY_ONLY: 'notify-only'
};

const FallbackConfig = {
  clipboard: {
    strategy: FallbackStrategy.MANUAL_COPY,
    userMessage: '剪贴板同步功能暂时不可用，请手动复制',
    severity: 'warning',
    retryable: true,
    autoRetryDelay: 30000
  },
  'file-transfer': {
    strategy: FallbackStrategy.DISABLED,
    userMessage: '文件传输功能暂时不可用',
    severity: 'info',
    retryable: true,
    autoRetryDelay: 60000
  },
  audio: {
    strategy: FallbackStrategy.DISABLED,
    userMessage: '远程音频功能暂时不可用',
    severity: 'info',
    retryable: false,
    autoRetryDelay: 0
  },
  printer: {
    strategy: FallbackStrategy.DISABLED,
    userMessage: '远程打印功能暂时不可用',
    severity: 'info',
    retryable: true,
    autoRetryDelay: 120000
  }
};

class FallbackHandler {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.auxiliaryChannelManager = null;
    this.eventListeners = new Map();
    this.fallbackStatus = new Map();
    this.autoRetryTimers = new Map();
    this.userNotifications = new Map();
  }

  setAuxiliaryChannelManager(manager) {
    this.auxiliaryChannelManager = manager;
    
    manager.on('channel-fallback', (data) => {
      this.handleFallback(data.type, data.error);
    });
    
    manager.on('channel-closed', (data) => {
      this.handleChannelClosed(data.type);
    });
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(callback);
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          this.logger.error('[FallbackHandler] 事件监听器错误:', e);
        }
      });
    }
  }

  handleFallback(channelType, error) {
    const config = FallbackConfig[channelType];
    
    if (!config) {
      this.logger.log(`[FallbackHandler] 未知通道类型: ${channelType}`);
      return;
    }
    
    this.fallbackStatus.set(channelType, {
      strategy: config.strategy,
      error: error,
      timestamp: Date.now(),
      severity: config.severity
    });
    
    this.logger.log(`[FallbackHandler] ${channelType} 执行降级策略: ${config.strategy}`);
    
    this.executeStrategy(channelType, config);
    
    this.notifyUser(channelType, config);
    
    if (config.retryable && config.autoRetryDelay > 0) {
      this.scheduleAutoRetry(channelType, config.autoRetryDelay);
    }
    
    this.emit('fallback-executed', {
      channelType,
      strategy: config.strategy,
      error
    });
  }

  executeStrategy(channelType, config) {
    switch (config.strategy) {
      case FallbackStrategy.MANUAL_COPY:
        this.executeManualCopyStrategy(channelType);
        break;
      case FallbackStrategy.DISABLED:
        this.executeDisabledStrategy(channelType);
        break;
      case FallbackStrategy.LOCAL_CACHE:
        this.executeLocalCacheStrategy(channelType);
        break;
      case FallbackStrategy.NOTIFY_ONLY:
        this.executeNotifyOnlyStrategy(channelType);
        break;
      default:
        this.logger.log(`[FallbackHandler] 无需执行降级策略: ${channelType}`);
    }
  }

  executeManualCopyStrategy(channelType) {
    this.logger.log(`[FallbackHandler] ${channelType} 使用手动复制模式`);
    
    this.emit('manual-mode-enabled', { channelType });
  }

  executeDisabledStrategy(channelType) {
    this.logger.log(`[FallbackHandler] ${channelType} 功能已禁用`);
    
    this.emit('feature-disabled', { channelType });
  }

  executeLocalCacheStrategy(channelType) {
    this.logger.log(`[FallbackHandler] ${channelType} 使用本地缓存模式`);
    
    this.emit('cache-mode-enabled', { channelType });
  }

  executeNotifyOnlyStrategy(channelType) {
    this.logger.log(`[FallbackHandler] ${channelType} 仅通知模式`);
  }

  notifyUser(channelType, config) {
    const notification = {
      id: `${channelType}-${Date.now()}`,
      channelType,
      message: config.userMessage,
      severity: config.severity,
      timestamp: Date.now(),
      dismissible: true
    };
    
    this.userNotifications.set(channelType, notification);
    
    this.emit('user-notification', notification);
  }

  scheduleAutoRetry(channelType, delay) {
    if (this.autoRetryTimers.has(channelType)) {
      clearTimeout(this.autoRetryTimers.get(channelType));
    }
    
    this.logger.log(`[FallbackHandler] ${channelType} 将在 ${delay}ms 后自动重试`);
    
    const timer = setTimeout(() => {
      this.attemptRetry(channelType);
    }, delay);
    
    this.autoRetryTimers.set(channelType, timer);
  }

  async attemptRetry(channelType) {
    if (!this.auxiliaryChannelManager) {
      return;
    }
    
    this.logger.log(`[FallbackHandler] ${channelType} 尝试重新加载`);
    
    this.emit('retry-attempt', { channelType });
    
    try {
      await this.auxiliaryChannelManager.loadChannel(channelType);
      
      this.logger.log(`[FallbackHandler] ${channelType} 重试成功`);
      this.fallbackStatus.delete(channelType);
      this.userNotifications.delete(channelType);
      
      this.emit('retry-success', { channelType });
      
      if (this.autoRetryTimers.has(channelType)) {
        clearTimeout(this.autoRetryTimers.get(channelType));
        this.autoRetryTimers.delete(channelType);
      }
      
    } catch (error) {
      this.logger.log(`[FallbackHandler] ${channelType} 重试失败: ${error.message}`);
      
      const config = FallbackConfig[channelType];
      if (config && config.retryable && config.autoRetryDelay > 0) {
        this.scheduleAutoRetry(channelType, config.autoRetryDelay);
      }
      
      this.emit('retry-failed', { channelType, error });
    }
  }

  handleChannelClosed(channelType) {
    const config = FallbackConfig[channelType];
    
    if (config && config.retryable) {
      this.logger.log(`[FallbackHandler] ${channelType} 通道关闭，准备重连`);
      
      setTimeout(() => {
        this.attemptRetry(channelType);
      }, 5000);
    }
  }

  getFallbackStatus(channelType) {
    return this.fallbackStatus.get(channelType);
  }

  getAllFallbackStatus() {
    const status = {};
    this.fallbackStatus.forEach((value, key) => {
      status[key] = value;
    });
    return status;
  }

  getUserNotifications() {
    return Array.from(this.userNotifications.values());
  }

  dismissNotification(channelType) {
    this.userNotifications.delete(channelType);
    this.emit('notification-dismissed', { channelType });
  }

  cancelAutoRetry(channelType) {
    if (this.autoRetryTimers.has(channelType)) {
      clearTimeout(this.autoRetryTimers.get(channelType));
      this.autoRetryTimers.delete(channelType);
      this.logger.log(`[FallbackHandler] ${channelType} 自动重试已取消`);
    }
  }

  cancelAllAutoRetries() {
    this.autoRetryTimers.forEach((timer, channelType) => {
      clearTimeout(timer);
      this.logger.log(`[FallbackHandler] ${channelType} 自动重试已取消`);
    });
    this.autoRetryTimers.clear();
  }

  reset() {
    this.cancelAllAutoRetries();
    this.fallbackStatus.clear();
    this.userNotifications.clear();
  }

  destroy() {
    this.reset();
    this.eventListeners.clear();
    this.auxiliaryChannelManager = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FallbackHandler,
    FallbackStrategy,
    FallbackConfig
  };
} else {
  window.FallbackHandler = FallbackHandler;
  window.FallbackStrategy = FallbackStrategy;
  window.FallbackConfig = FallbackConfig;
}