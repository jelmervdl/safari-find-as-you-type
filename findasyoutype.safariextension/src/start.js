'use strict'

// -------------------------------------------------------------
// Constants.
// -------------------------------------------------------------

const ESCAPE_KEY_CODE = 27
const ENTER_KEY_CODE = 13
const SPACE_KEY_CODE = 32
const DELETE_KEY_CODE = 8

const AUTO_HIDE_DELAY = 1500

// -------------------------------------------------------------
// Script.
// -------------------------------------------------------------

const FindAsYouTypeStart = (function() {
  return {
    // -------------------------------------------------------------
    // Members.
    // -------------------------------------------------------------

    searchString: '',
    nextSearchString: '',
    displaySearchString: '',

    indicator: null,
    indicatorInner: null,

    indicatorOpacityTimeout: null,
    indicatorDisplayTimeout: null,
    indicatorFlashTimeout: null,

    keyupTimeout: null,

    settings: {
      linksOnly: false,
      blacklist: '' // array version will be in this.blacklist
    },

    blacklist: [],

    setupAlready: false,

    // -------------------------------------------------------------
    // Methods.
    // -------------------------------------------------------------

    init() {
      // Only apply to top page.
      if (window !== window.top) return

      // Bind message listener.
      safari.self.addEventListener(
        'message',
        msg => FindAsYouTypeStart[msg.name](msg.message),
        false
      )

      // Fetch settings (inc. blacklist).
      safari.self.tab.dispatchMessage('getSettings')
    },

    create() {
      // Only create one indicator, outside.
      if (
        window !== window.top ||
        !document.getElementsByTagName('body').length
      ) {
        return
      }

      var outer = document.createElement('fayt_wrapper')
      var inner = document.createElement('fayt_content')

      outer.appendChild(inner)
      document.body.appendChild(outer)

      this.indicator = outer
      this.indicatorInner = inner
    },

    show(str, append, color) {
      if (this.indicator) {
        this.indicatorInner.setAttribute('color', color || '')
        this.indicatorInner.innerHTML = str + (append || '')
        this.indicator.style.opacity = 1.0
        this.indicator.style.display = 'block'
      }
    },

    hide() {
      clearTimeout(this.indicatorOpacityTimeout)
      clearTimeout(this.indicatorDisplayTimeout)

      this.searchString = ''
      this.nextSearchString = ''
      this.displaySearchString = ''

      this.indicatorOpacityTimeout = setTimeout(() => {
        FindAsYouTypeStart.indicator.style.opacity = 0.0

        this.indicatorDisplayTimeout = setTimeout(() => {
          this.indicator.style.display = 'none'
          this.indicatorInner.removeAttribute('color')
        }, 500)
      }, 50)
    },

    flash() {
      clearTimeout(this.indicatorFlashTimeout)

      if (this.indicator) {
        this.indicatorInner.setAttribute('color', 'red')
        this.indicatorFlashTimeout = setTimeout(() => {
          FindAsYouTypeStart.indicatorInner.removeAttribute('color')
        }, 400)
      }
    },

    handleActionKeys(e) {
      e.cmdKey = e.metaKey
      e.character = String.fromCharCode(e.keyCode)

      // Escape? Blur and stop search.
      if (e.keyCode == ESCAPE_KEY_CODE) {
        this.blurFocusedElement()
        this.hide()
        return
      }

      // Enter? Stop search.
      if (e.keyCode == ENTER_KEY_CODE) {
        this.hide()
        return
      }

      // If cmd-g, we have to go to next occurrence.
      const selection = window.getSelection()
      if (this.selectedTextEqualsNextSearchString()) {
        if (e.character == 'G' && e.cmdKey) {
          this.find(this.nextSearchString, e.shiftKey)

          // Find again if we're now IN indicator div, or selected something invisible
          // or selected something not in viewport (FIXME - NOT YET).
          if (
            (this.indicator &&
              this.trim(selection.anchorNode.parentNode.tagName) ==
                this.trim(this.indicatorInner.tagName)) ||
            !selection.anchorNode.parentNode.offsetHeight
          ) {
            this.find(this.nextSearchString, e.shiftKey)
          }

          const color = this.focusSelectedLink(this.nextSearchString)
          this.show(this.nextSearchString, ' (⌘G)', color)
          event.preventDefault()
          event.stopPropagation()
        }
      }
    },

    handleTypingKeys(e) {
      e.cmdKey = e.metaKey && !e.ctrlKey
      e.character = String.fromCharCode(e.keyCode)

      // If it was a typeable character, Cmd key wasn't down, and a field doesn't have focus.
      if (
        e.keyCode &&
        !this.getFocusedElement() &&
        !e.cmdKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        if (this.searchString == '' && e.keyCode === SPACE_KEY_CODE) {
          // Do nothing, we allow the space bar and delete to fall through to scroll
          // the page if we have no searchstring.
        } else {
          if (e.keyCode === DELETE_KEY_CODE) {
            // Remove last.
            this.blurFocusedElement()
            this.searchString = this.searchString.slice(0, -1)

            if (this.searchString.length === 0) {
              this.hide()
              return
            }
          } else {
            // Append char.
            this.searchString += e.character
          }

          this.nextSearchString = this.searchString
          this.displaySearchString = this.searchString.replace(/ /g, '␣')

          // Let the first letter fall through.
          if (this.searchString.length > 1) {
            // Clear selection and find again.
            window.getSelection().removeAllRanges()
            this.find(this.searchString, false)

            // Focus the link so return key follows.
            const color = this.focusSelectedLink(this.nextSearchString)
            this.show(this.nextSearchString, '', color)

            // Check for nothing found.
            if (!window.getSelection().rangeCount) this.flash()

            e.preventDefault()
            e.stopPropagation()
          }
        }

        // Auto-clear after a certain delay.
        clearTimeout(this.keyupTimeout)
        this.keyupTimeout = setTimeout(() => this.hide(), AUTO_HIDE_DELAY)
      }
    },

    handleCopy(e) {
      if (
        document.activeElement &&
        document.activeElement.tagName == 'A' &&
        this.selectedTextEqualsNextSearchString()
      ) {
        this.hijackCopyWith(e.srcElement.href)
        this.show('URL copied', ' (⌘C)', 'blue')
      }
    },

    handleMouseOut() {
      FindAsYouTypeStart.fireEvent(this, 'mouseout')

      // Make sure we remove ourselves.
      this.removeEventListener('focusout', FindAsYouTypeStart.handleMouseOut)
    },

    find(searchString, backwards) {
      const scrollPosition = {
        top: document.body.scrollTop,
        left: document.body.scrollPosition
      }

      // Skip until we get something in our viewport (and a link if linksOnly == true).
      let validResult = false
      let failSafe = 0

      while (!validResult && failSafe < 500) {
        failSafe++

        if (failSafe == 500) console.log('bailed')

        window.find(
          searchString,
          searchString.match(/[A-Z]/) ? true : false,
          backwards,
          true,
          false,
          true,
          false
        )

        const selection = window.getSelection()
        const el =
          (selection &&
            selection.anchorNode &&
            selection.anchorNode.parentNode) ||
          false

        // Start out assuming it's good.
        validResult = true

        // DENIED if we only want links and it's not one.
        if (this.settings.linksOnly && el && el.tagName != 'A') {
          validResult = false
        }
      }
    },

    getSettingsCallback(settings) {
      this.settings = settings
      this.blacklist = settings.blacklist.split(',')

      if (this.setupAlready) return

      // Bail if we match anything in the blacklist.
      for (const href in this.blacklist) {
        // Trim blacklist entry.
        this.blacklist[href] = this.blacklist[href].replace(/^\s|\s$/, '')

        // Match either host or host + url.
        if (
          location.host.match(
            new RegExp('^' + this.blacklist[href].replace(/\*/g, '.*') + '$')
          ) ||
          (location.host + location.pathname).match(
            new RegExp('^' + this.blacklist[href].replace(/\*/g, '.*') + '$')
          )
        ) {
          console.warn(
            'find-as-you-type: not started because current website is blacklisted.'
          )
          return
        }
      }

      // Ok go ahead and do stuff.
      this.setUpEventsAndElements.apply(this)

      this.setupAlready = true
    },

    setUpEventsAndElements() {
      // Add indicator div to page.
      this.create()

      // Handle command-g & esc.
      window.addEventListener(
        'keydown',
        e => FindAsYouTypeStart.handleActionKeys(e),
        true
      )

      // Handle typeable keypresses.
      window.addEventListener(
        'keypress',
        e => FindAsYouTypeStart.handleTypingKeys(e),
        true
      )

      window.addEventListener(
        'beforecopy',
        e => FindAsYouTypeStart.handleCopy(e),
        true
      )
    },

    // -------------------------------------------------------------
    // Helpers.
    // -------------------------------------------------------------

    selectedTextEqualsNextSearchString() {
      const selection = window.getSelection()

      return (
        selection.rangeCount &&
        this.trim(String(selection).toLowerCase()) ==
          this.trim(this.nextSearchString.toLowerCase())
      )
    },

    hijackCopyWith(textToCopy) {
      // Get current selection.
      const selection = window.getSelection()
      const currentSelection = selection.getRangeAt(0)

      // Create element.
      const clipboardElement = this.createHiddenElementWithTagNameAndContents(
        'fayt_clipboard',
        textToCopy
      )
      console.log('Copied:', textToCopy)

      // Select it.
      selection.removeAllRanges()

      const range = document.createRange()
      range.selectNode(document.querySelectorAll('fayt_clipboard')[0])
      selection.addRange(range)

      // Do this stuff immediately after copy operation.
      setTimeout(() => {
        selection.removeAllRanges()
        selection.addRange(currentSelection)
        clipboardElement.parentNode.removeChild(clipboardElement)
      }, 0)
    },

    trim(str) {
      return String(str).match(/^\s*(.*?)\s*$/)[1]
    },

    fireEvent(el, eventName) {
      const evt = document.createEvent('HTMLEvents')
      evt.initEvent(eventName, true, true)
      el.dispatchEvent(evt)
    },

    getFocusedElement() {
      const el = document.activeElement
      const computedStyle = window.getComputedStyle(el)

      return (el.tagName.match(/input|textarea|select|button/i) &&
        (el.getAttribute('type') || '').match(/^|text|search|password$/)) ||
        el.getAttribute('contenteditable') == 'true' ||
        computedStyle['-webkit-user-modify'] != 'read-only'
        ? el
        : false
    },

    blurFocusedElement() {
      if (
        this.getFocusedElement() ||
        this.selectedTextEqualsNextSearchString()
      ) {
        document.activeElement.blur()
      }
    },

    focusSelectedLink(str) {
      const selection = window.getSelection()
      let color = ''
      let el = selection.anchorNode || false

      while (el && el.tagName != 'A') el = el.parentNode

      if (el && el.tagName == 'A') {
        color = 'green'
        el.focus()
        // Send mouseover event to new element.
        FindAsYouTypeStart.fireEvent(el, 'mouseover')
        // Send mouseout event when it loses focus.
        el.addEventListener('focusout', FindAsYouTypeStart.handleMouseOut)
      } else if (selection.rangeCount) {
        // Get selection.
        const range = document.createRange()
        range.setStart(selection.anchorNode, selection.anchorOffset)
        range.setEnd(selection.extentNode, selection.extentOffset)
        // Defocus (side-effect: deselects).
        document.activeElement.blur()
        // Reselect selection.
        selection.addRange(range)
      } else {
        document.activeElement.blur()
      }

      return color
    },

    createHiddenElementWithTagNameAndContents(tagName, contents) {
      const hiddenEl = document.createElement(tagName)
      hiddenEl.style.position = 'absolute'
      hiddenEl.style.top = '-1000px'

      if (contents) hiddenEl.innerHTML = contents

      document.getElementsByTagName('body')[0].appendChild(hiddenEl)

      return hiddenEl
    }
  }
})()

if (document.readyState == 'complete') {
  FindAsYouTypeStart.init()
} else {
  window.addEventListener('load', () => FindAsYouTypeStart.init())
}
