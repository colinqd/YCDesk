if (typeof module !== 'undefined' && module.exports) {
    const { GestureConfig, GestureState, SingleTouchPhase, DualTouchPhase } = require('./gesture-config.js')
    const TouchGestureManager = require('./touch-gesture-manager.js')
    
    module.exports = {
        GestureConfig,
        GestureState,
        SingleTouchPhase,
        DualTouchPhase,
        TouchGestureManager
    }
} else {
    window.GestureModule = {
        GestureConfig: window.GestureConfig,
        GestureState: window.GestureState,
        SingleTouchPhase: window.SingleTouchPhase,
        DualTouchPhase: window.DualTouchPhase,
        TouchGestureManager: window.TouchGestureManager
    }
}
