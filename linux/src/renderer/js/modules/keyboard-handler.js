(function () {
  var COMPLETELY_BLOCKED_SHORTCUTS = new Set([
    'alt+f4',
    'ctrl+alt+delete',
    'ctrl+alt+end',
    'ctrl+shift+escape',
    'meta+f4'
  ])

  var LOCAL_ONLY_SHORTCUTS = new Set([
    'meta+d',
    'meta+tab',
    'alt+tab'
  ])

  function getShortcutKey(e) {
    var shortcut = ''
    if (e.ctrlKey) shortcut += 'Ctrl+'
    if (e.altKey) shortcut += 'Alt+'
    if (e.shiftKey) shortcut += 'Shift+'
    if (e.metaKey) shortcut += 'Meta+'
    shortcut += e.key
    return shortcut.toLowerCase()
  }

  function isBlocked(e) {
    return COMPLETELY_BLOCKED_SHORTCUTS.has(getShortcutKey(e))
  }

  function isLocalOnly(e) {
    return LOCAL_ONLY_SHORTCUTS.has(getShortcutKey(e))
  }

  window.KeyboardHandler = {
    setup: function (element, getConnectionManager) {
      if (!element) return

      element.addEventListener('keydown', function (e) {
        if (isBlocked(e)) { e.preventDefault(); return }
        if (isLocalOnly(e)) { e.preventDefault(); return }

        e.preventDefault()

        var cm = typeof getConnectionManager === 'function' ? getConnectionManager() : getConnectionManager
        if (!cm) return

        var inputCommand = window.createInputCommand(window.INPUT_TYPES.KEY_DOWN, {
          key: e.key,
          code: e.code,
          keyCode: e.keyCode,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey
        })
        cm.sendInput(inputCommand)
      })

      element.addEventListener('keyup', function (e) {
        if (isBlocked(e)) { e.preventDefault(); return }
        if (isLocalOnly(e)) { e.preventDefault(); return }

        e.preventDefault()

        var cm = typeof getConnectionManager === 'function' ? getConnectionManager() : getConnectionManager
        if (!cm) return

        var inputCommand = window.createInputCommand(window.INPUT_TYPES.KEY_UP, {
          key: e.key,
          code: e.code,
          keyCode: e.keyCode,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey
        })
        cm.sendInput(inputCommand)
      })
    }
  }
})()
