const ConnectionState = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    AUTHENTICATING: 'authenticating',
    NEGOTIATING: 'negotiating',
    CREATING_CHANNEL: 'creating-channel',
    RESOLUTION_NEGOTIATING: 'resolution-negotiating',
    WAITING_VIDEO: 'waiting-video',
    DISPLAYING_FIRST_FRAME: 'displaying-first-frame',
    LOADING_AUXILIARY: 'loading-auxiliary',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    DISCONNECTING: 'disconnecting',
    ERROR: 'error'
}

const StateTransitions = {
    'idle': ['connecting', 'error'],
    'connecting': ['authenticating', 'negotiating', 'error'],
    'authenticating': ['negotiating', 'error'],
    'negotiating': ['creating-channel', 'error'],
    'creating-channel': ['resolution-negotiating', 'error'],
    'resolution-negotiating': ['waiting-video', 'error'],
    'waiting-video': ['displaying-first-frame', 'error'],
    'displaying-first-frame': ['loading-auxiliary', 'connected'],
    'loading-auxiliary': ['connected', 'error'],
    'connected': ['reconnecting', 'disconnecting', 'error'],
    'reconnecting': ['connecting', 'error'],
    'disconnecting': ['idle'],
    'error': ['idle', 'connecting']
}

class ConnectionStateMachine {
    constructor(options = {}) {
        this.state = ConnectionState.IDLE
        this.previousState = null
        this.listeners = new Set()
        this.stateData = {}
        this.logger = options.logger || console
        this.stateTimestamps = new Map()
    }

    getState() {
        return this.state
    }

    getPreviousState() {
        return this.previousState
    }

    getStateData() {
        return { ...this.stateData }
    }

    setStateData(data) {
        this.stateData = { ...this.stateData, ...data }
    }

    canTransitionTo(newState) {
        const allowedTransitions = StateTransitions[this.state] || []
        return allowedTransitions.includes(newState)
    }

    transition(newState, data = null) {
        if (!this.canTransitionTo(newState)) {
            this.logger.error(`[StateMachine] 无效的状态转换: ${this.state} -> ${newState}`)
            return false
        }

        const oldState = this.state
        this.previousState = oldState
        this.state = newState
        this.stateTimestamps.set(newState, Date.now())
        
        if (data) {
            this.stateData = { ...this.stateData, ...data }
        }

        this.logger.log(`[StateMachine] 状态转换: ${oldState} -> ${newState}`)
        
        this.notifyListeners(newState, oldState, data)
        
        return true
    }

    forceTransition(newState, data = null) {
        const oldState = this.state
        this.previousState = oldState
        this.state = newState
        this.stateTimestamps.set(newState, Date.now())
        
        if (data) {
            this.stateData = { ...this.stateData, ...data }
        }

        this.logger.log(`[StateMachine] 强制状态转换: ${oldState} -> ${newState}`)
        this.notifyListeners(newState, oldState, data)
        
        return true
    }

    addListener(callback) {
        this.listeners.add(callback)
        return () => this.listeners.delete(callback)
    }

    removeListener(callback) {
        this.listeners.delete(callback)
    }

    notifyListeners(newState, oldState, data) {
        this.listeners.forEach(callback => {
            try {
                callback(newState, oldState, data)
            } catch (error) {
                this.logger.error('[StateMachine] 监听器错误:', error)
            }
        })
    }

    getStateDuration(state) {
        const timestamp = this.stateTimestamps.get(state)
        if (!timestamp) return null
        return Date.now() - timestamp
    }

    isInState(state) {
        return this.state === state
    }

    isConnected() {
        return this.state === ConnectionState.CONNECTED || 
               this.state === ConnectionState.LOADING_AUXILIARY
    }

    isError() {
        return this.state === ConnectionState.ERROR
    }

    reset() {
        this.stateData = {}
        this.forceTransition(ConnectionState.IDLE)
    }

    toJSON() {
        return {
            state: this.state,
            previousState: this.previousState,
            stateData: this.stateData,
            timestamp: this.stateTimestamps.get(this.state)
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConnectionStateMachine, ConnectionState }
} else {
    window.ConnectionStateMachine = ConnectionStateMachine
    window.ConnectionState = ConnectionState
}
