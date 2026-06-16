const AuxiliaryChannelType = {
    CLIPBOARD: 'clipboard',
    FILE_TRANSFER: 'file-transfer',
    AUDIO: 'audio',
    PRINTER: 'printer'
}

const AuxiliaryChannelPriority = {
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low'
}

const AuxiliaryChannelConfig = {
    [AuxiliaryChannelType.CLIPBOARD]: {
        priority: AuxiliaryChannelPriority.MEDIUM,
        ordered: true,
        maxRetries: 3,
        retryDelay: 5000,
        timeout: 10000,
        critical: false
    },
    [AuxiliaryChannelType.FILE_TRANSFER]: {
        priority: AuxiliaryChannelPriority.LOW,
        ordered: true,
        maxRetries: 2,
        retryDelay: 10000,
        timeout: 15000,
        critical: false
    },
    [AuxiliaryChannelType.AUDIO]: {
        priority: AuxiliaryChannelPriority.HIGH,
        ordered: false,
        maxRetries: 3,
        retryDelay: 3000,
        timeout: 10000,
        critical: false
    },
    [AuxiliaryChannelType.PRINTER]: {
        priority: AuxiliaryChannelPriority.LOW,
        ordered: true,
        maxRetries: 1,
        retryDelay: 15000,
        timeout: 20000,
        critical: false
    }
}

class AuxiliaryChannelManager {
    constructor(options = {}) {
        this.peerConnection = null
        this.channels = new Map()
        this.dataChannelManager = null
        this.logger = options.logger || console
        this.eventListeners = new Map()
        this.loadStatus = new Map()
        this.retryCount = new Map()
        this._loadingChannels = new Set()
    }

    setPeerConnection(pc) {
        this.peerConnection = pc
    }

    setDataChannelManager(dcm) {
        this.dataChannelManager = dcm
    }

    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set())
        }
        this.eventListeners.get(event).add(callback)
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback)
        }
    }

    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data)
                } catch (e) {
                    this.logger.error('事件监听器错误:', e)
                }
            })
        }
    }

    async loadAllParallel(enabledChannels = null) {
        const channelsToLoad = enabledChannels || [
            AuxiliaryChannelType.CLIPBOARD
        ]
        
        // 去重：跳过已就绪或正在加载中的通道
        const uniqueChannels = channelsToLoad.filter(channelType => {
            const status = this.loadStatus.get(channelType)
            if (status === 'ready') {
                this.logger.log(`[AuxiliaryChannel] ${channelType} 已就绪，跳过加载`)
                return false
            }
            if (this._loadingChannels.has(channelType)) {
                this.logger.log(`[AuxiliaryChannel] ${channelType} 正在加载中，跳过重复请求`)
                return false
            }
            return true
        })
        
        if (uniqueChannels.length === 0) {
            this.logger.log('[AuxiliaryChannel] 所有通道已就绪或正在加载，无需重复加载')
            return { success: channelsToLoad.length, failed: 0 }
        }
        
        this.logger.log(`[AuxiliaryChannel] 开始并行加载 ${uniqueChannels.length} 个通道`)
        
        const loadPromises = uniqueChannels.map(channelType => 
            this.loadChannel(channelType)
        )
        
        const results = await Promise.allSettled(loadPromises)
        
        results.forEach((result, index) => {
            const channelType = uniqueChannels[index]
            
            if (result.status === 'fulfilled') {
                this.logger.log(`[AuxiliaryChannel] ${channelType} 加载成功`)
                this.loadStatus.set(channelType, 'ready')
            } else {
                this.logger.log(`[AuxiliaryChannel] ${channelType} 加载失败: ${result.reason?.message}`)
                this.loadStatus.set(channelType, 'failed')
                this.handleChannelFailure(channelType, result.reason)
            }
        })
        
        return {
            success: results.filter(r => r.status === 'fulfilled').length,
            failed: results.filter(r => r.status === 'rejected').length
        }
    }

    async loadChannel(channelType) {
        const config = AuxiliaryChannelConfig[channelType]
        
        if (!config) {
            throw new Error(`未知的通道类型: ${channelType}`)
        }
        
        if (!this.peerConnection) {
            throw new Error('PeerConnection 未设置')
        }
        
        this.loadStatus.set(channelType, 'loading')
        this._loadingChannels.add(channelType)
        
        const channelName = `aux-${channelType}`
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this._loadingChannels.delete(channelType)
                reject(new Error(`通道 ${channelType} 建立超时`))
            }, config.timeout)
            
            try {
                const channel = this.peerConnection.createDataChannel(channelName, {
                    ordered: config.ordered
                })
                
                channel.onopen = () => {
                    clearTimeout(timeout)
                    this._loadingChannels.delete(channelType)
                    this.channels.set(channelType, {
                        channel,
                        config,
                        status: 'open'
                    })
                    this.retryCount.set(channelType, 0)
                    this.setupChannelHandlers(channelType, channel)
                    this.emit('channel-ready', { type: channelType, channel })
                    resolve(channel)
                }
                
                channel.onerror = (error) => {
                    clearTimeout(timeout)
                    this._loadingChannels.delete(channelType)
                    this.loadStatus.set(channelType, 'error')
                    reject(error)
                }
                
                channel.onclose = () => {
                    this.handleChannelClose(channelType)
                }
                
            } catch (error) {
                clearTimeout(timeout)
                reject(error)
            }
        })
    }

    setupChannelHandlers(channelType, channel) {
        channel.onmessage = (event) => {
            this.handleChannelMessage(channelType, event)
        }
        
        channel.onclose = () => {
            this.handleChannelClose(channelType)
        }
    }

    handleChannelMessage(channelType, event) {
        try {
            const data = JSON.parse(event.data)
            this.emit('channel-message', { type: channelType, data })
            
            switch (channelType) {
                case AuxiliaryChannelType.CLIPBOARD:
                    this.handleClipboardMessage(data)
                    break
                case AuxiliaryChannelType.FILE_TRANSFER:
                    this.handleFileTransferMessage(data)
                    break
                case AuxiliaryChannelType.AUDIO:
                    this.handleAudioMessage(data)
                    break
            }
        } catch (e) {
            this.logger.error(`[AuxiliaryChannel] ${channelType} 消息解析错误:`, e)
        }
    }

    handleClipboardMessage(data) {
        switch (data.action) {
            case 'sync':
                this.emit('clipboard-sync', data.content)
                break
            case 'request':
                this.emit('clipboard-request')
                break
        }
    }

    handleFileTransferMessage(data) {
        this.emit('file-transfer', data)
    }

    handleAudioMessage(data) {
        this.emit('audio-data', data)
    }

    handleChannelClose(channelType) {
        this.logger.log(`[AuxiliaryChannel] ${channelType} 已关闭`)
        this.loadStatus.set(channelType, 'closed')
        
        const channelInfo = this.channels.get(channelType)
        if (channelInfo) {
            channelInfo.status = 'closed'
        }
        
        this.emit('channel-closed', { type: channelType })
    }

    handleChannelFailure(channelType, error) {
        const config = AuxiliaryChannelConfig[channelType]
        const currentRetry = this.retryCount.get(channelType) || 0
        
        if (currentRetry < config.maxRetries) {
            this.retryCount.set(channelType, currentRetry + 1)
            this.logger.log(`[AuxiliaryChannel] ${channelType} 准备重试 (${currentRetry + 1}/${config.maxRetries})`)
            
            setTimeout(() => {
                this.loadChannel(channelType)
                    .then(() => {
                        this.logger.log(`[AuxiliaryChannel] ${channelType} 重试成功`)
                    })
                    .catch((err) => {
                        this.handleChannelFailure(channelType, err)
                    })
            }, config.retryDelay)
        } else {
            this.logger.log(`[AuxiliaryChannel] ${channelType} 重试次数用尽，执行降级`)
            this.executeFallback(channelType, error)
        }
    }

    executeFallback(channelType, error) {
        this.loadStatus.set(channelType, 'fallback')
        
        this.emit('channel-fallback', {
            type: channelType,
            error: error?.message,
            fallback: this.getFallbackStrategy(channelType)
        })
        
        switch (channelType) {
            case AuxiliaryChannelType.CLIPBOARD:
                this.logger.log('[AuxiliaryChannel] 剪贴板同步不可用，请手动复制')
                break
            case AuxiliaryChannelType.FILE_TRANSFER:
                this.logger.log('[AuxiliaryChannel] 文件传输不可用')
                break
            case AuxiliaryChannelType.AUDIO:
                this.logger.log('[AuxiliaryChannel] 远程音频不可用')
                break
            case AuxiliaryChannelType.PRINTER:
                this.logger.log('[AuxiliaryChannel] 远程打印不可用')
                break
        }
    }

    getFallbackStrategy(channelType) {
        const strategies = {
            [AuxiliaryChannelType.CLIPBOARD]: 'manual-copy',
            [AuxiliaryChannelType.FILE_TRANSFER]: 'disabled',
            [AuxiliaryChannelType.AUDIO]: 'disabled',
            [AuxiliaryChannelType.PRINTER]: 'disabled'
        }
        return strategies[channelType] || 'disabled'
    }

    send(channelType, data) {
        const channelInfo = this.channels.get(channelType)
        
        if (!channelInfo || !channelInfo.channel || channelInfo.channel.readyState !== 'open') {
            this.logger.log(`[AuxiliaryChannel] ${channelType} 通道不可用 (readyState=${channelInfo?.channel?.readyState || 'none'})`)
            return false
        }
        
        try {
            channelInfo.channel.send(JSON.stringify(data))
            return true
        } catch (e) {
            this.logger.error(`[AuxiliaryChannel] ${channelType} 发送失败:`, e)
            return false
        }
    }

    sendClipboard(content) {
        return this.send(AuxiliaryChannelType.CLIPBOARD, {
            action: 'sync',
            content,
            timestamp: Date.now()
        })
    }

    requestClipboard() {
        return this.send(AuxiliaryChannelType.CLIPBOARD, {
            action: 'request',
            timestamp: Date.now()
        })
    }

    getChannelStatus(channelType) {
        return this.loadStatus.get(channelType) || 'unknown'
    }

    isChannelReady(channelType) {
        return this.loadStatus.get(channelType) === 'ready'
    }

    getAllStatus() {
        const status = {}
        this.loadStatus.forEach((value, key) => {
            status[key] = value
        })
        return status
    }

    close(channelType) {
        const channelInfo = this.channels.get(channelType)
        
        if (channelInfo && channelInfo.channel) {
            try {
                channelInfo.channel.close()
            } catch (e) {
                this.logger.error(`[AuxiliaryChannel] 关闭 ${channelType} 失败:`, e)
            }
        }
        
        this.channels.delete(channelType)
        this.loadStatus.delete(channelType)
    }

    closeAll() {
        this.channels.forEach((_, channelType) => {
            this.close(channelType)
        })
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AuxiliaryChannelManager,
        AuxiliaryChannelType,
        AuxiliaryChannelPriority,
        AuxiliaryChannelConfig
    }
} else {
    window.AuxiliaryChannelManager = AuxiliaryChannelManager
    window.AuxiliaryChannelType = AuxiliaryChannelType
    window.AuxiliaryChannelPriority = AuxiliaryChannelPriority
    window.AuxiliaryChannelConfig = AuxiliaryChannelConfig
}
