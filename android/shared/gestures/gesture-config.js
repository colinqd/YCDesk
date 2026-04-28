const GestureConfig = {
    TAP_MAX_DISTANCE: 15,
    TAP_MAX_DURATION: 300,
    DOUBLE_TAP_INTERVAL: 300,
    LONG_PRESS_DURATION: 600,
    LONG_PRESS_MAX_DISTANCE: 10,
    DRAG_START_DISTANCE: 10,
    DRAG_START_DELAY: 100,

    PINCH_THRESHOLD: 30,
    PAN_THRESHOLD: 10,
    SCROLL_THRESHOLD: 10,
    SCROLL_MAX_HORIZONTAL: 20,
    SCALE_MIN: 0.5,
    SCALE_MAX: 3.0,
    SCROLL_SENSITIVITY: 2.0,

    MULTI_TOUCH_FINGER_COUNT: 3,

    VIBRATE_SHORT: 30,
    VIBRATE_LONG: 50,
    VIBRATE_DOUBLE: [30, 50, 30],

    INPUT_THROTTLE_MS: 8
}

const GestureState = {
    IDLE: 'idle',
    SINGLE_TOUCH: 'single_touch',
    DUAL_TOUCH: 'dual_touch',
    MULTI_TOUCH: 'multi_touch'
}

const SingleTouchPhase = {
    IDLE: 'idle',
    TAP_PENDING: 'tap_pending',
    DRAGGING: 'dragging',
    LONG_PRESS: 'long_press'
}

const DualTouchPhase = {
    IDLE: 'idle',
    PINCHING: 'pinching',
    PANNING: 'panning',
    SCROLLING: 'scrolling'
}

export { GestureConfig, GestureState, SingleTouchPhase, DualTouchPhase }

if (typeof window !== 'undefined') {
    window.GestureConfig = GestureConfig
    window.GestureState = GestureState
    window.SingleTouchPhase = SingleTouchPhase
    window.DualTouchPhase = DualTouchPhase
}
