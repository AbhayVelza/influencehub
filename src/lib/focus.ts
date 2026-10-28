type AutoFocusHandler = ((event: Event) => void) | undefined

// Recently focused elements, newest last.
const history: HTMLElement[] = []
let tracking = false

function trackFocus() {
  if (tracking || typeof document === 'undefined') return
  tracking = true
  document.addEventListener(
    'focusin',
    (event) => {
      if (!(event.target instanceof HTMLElement)) return
      history.push(event.target)
      if (history.length > 30) history.shift()
    },
    true,
  )
}

/**
 * Radix returns focus to a dialog's own <Trigger> on close. Most dialogs here are opened by ordinary
 * buttons or menu items instead, so without this focus would drop to <body>.
 *
 * On close, give focus to the most recently focused element that's outside the closing dialog and still on
 * the page — the button that opened it, or for a menu item, the menu's trigger. (Capturing it on open
 * doesn't work: inputs with autoFocus take focus first, and Radix then skips its open-focus event.)
 */
export function useReturnFocus(onCloseAutoFocus: AutoFocusHandler) {
  trackFocus()
  return {
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      const content = event.target instanceof HTMLElement ? event.target : null
      for (let i = history.length - 1; i >= 0; i--) {
        const element = history[i]!
        if (element.isConnected && element !== document.body && !content?.contains(element)) {
          event.preventDefault()
          element.focus()
          return
        }
      }
    },
  }
}
