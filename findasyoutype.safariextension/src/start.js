'use strict'

const FindAsYouTypeStart = (function() {
  return {
    searchString: '',
    nextSearchString: '',
    displaySearchString: '',
    keyupTimeout: null,

    indicator: null,
    indicatorInner: null,
    indicatorTimeout: null,
    indicatorFadeTimeout: null,
    indicatorFlashTimeout: null,

    settings: {
      linksOnly: false,
      blacklist: '' // array version will be in this.blacklist
    },

    blacklist: [],

    setupAlready: false,

    trim(str) {
      return String(str).match(/^\s*(.*?)\s*$/)[1]
    },

    fireEvent(el, eventName) {
      const evt = document.createEvent('HTMLEvents')
      evt.initEvent(eventName, true, true)
      el.dispatchEvent(evt)
    },

    focusedElement() {
      const el = document.activeElement
      const computedStyle = window.getComputedStyle(el)

      return (el.tagName.match(/input|textarea|select|button/i) &&
        (el.getAttribute('type') || '').match(/^|text|search|password$/)) ||
        el.getAttribute('contenteditable') == 'true' ||
        computedStyle['-webkit-user-modify'] != 'read-only'
        ? el
        : false
    },

    mouseoutListener() {
      FindAsYouTypeStart.fireEvent(this, 'mouseout')

      // Make sure we remove ourselves.
      this.removeEventListener('focusout', FindAsYouTypeStart.mouseoutListener)
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
        el.addEventListener('focusout', FindAsYouTypeStart.mouseoutListener)
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
    },

    createIndicator() {
      // Only create one indicator, outside.
      if (
        window !== window.top ||
        !document.getElementsByTagName('body').length
      ) {
        return
      }

      // Create actual indicator.
      this.indicator = document.createElement('fayt_wrapper')
      this.indicator.innerHTML = '<fayt_content></fayt_content>'
      document.getElementsByTagName('body')[0].appendChild(this.indicator)
      this.indicatorInner = document.getElementsByTagName('fayt_content')[0]
    },

    displayInIndicator(str, append, color) {
      clearTimeout(this.indicatorTimeout)
      clearTimeout(this.indicatorFadeTimeout)

      if (this.indicator) {
        this.indicatorInner.setAttribute('color', color || '')
        this.indicatorInner.innerHTML = str + (append || '')
        this.indicator.style['-webkit-transition'] = 'none'
        this.indicator.style.opacity = 1.0
        this.indicator.style.display = 'block'
        this.indicatorTimeout = setTimeout(() => {
          FindAsYouTypeStart.indicator.style['-webkit-transition'] = null
          FindAsYouTypeStart.indicator.style.opacity = 0.0
          FindAsYouTypeStart.indicatorFadeTimeout = setTimeout(() => {
            FindAsYouTypeStart.indicator.style.display = null
          }, 500)
        }, 1000)
      }
    },

    hideIndicator() {
      this.searchString = ''
      this.nextSearchString = ''
      this.displaySearchString = ''
      this.indicator.style.display = 'none'
    },

    flashIndicator() {
      clearTimeout(this.indicatorFlashTimeout)

      if (this.indicator) {
        this.indicatorInner.setAttribute('color', 'red')
        this.indicatorFlashTimeout = setTimeout(() => {
          FindAsYouTypeStart.indicatorInner.removeAttribute('color')
        }, 400)
      }
    },

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
      const ttn_clipboard = this.createHiddenElementWithTagNameAndContents(
        'ttn_clipboard',
        textToCopy
      )
      console.log('Copied:', textToCopy)

      // Select it.
      selection.removeAllRanges()

      const range = document.createRange()
      range.selectNode(document.querySelectorAll('ttn_clipboard')[0])
      selection.addRange(range)

      // Do this stuff immediately after copy operation.
      setTimeout(() => {
        selection.removeAllRanges()
        selection.addRange(currentSelection)
        ttn_clipboard.parentNode.removeChild(ttn_clipboard)
      }, 0)
    },

    handleNonAlphaKeys(e) {
      e.cmdKey = e.metaKey
      e.character = String.fromCharCode(e.keyCode)

      // Handle esc in fields (blur).
      if (e.keyCode == 27) {
        this.displayInIndicator('␛')

        if (
          this.focusedElement() ||
          this.selectedTextEqualsNextSearchString()
        ) {
          document.activeElement.blur()
        } else {
          this.flashIndicator()
        }

        this.hideIndicator()

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
          this.displayInIndicator(this.nextSearchString, ' (⌘G)', color)
          event.preventDefault()
          event.stopPropagation()
        } else if (
          e.character == 'I' &&
          e.cmdKey &&
          !e.ctrlKey &&
          !e.shiftKey
        ) {
          const href = this.mungeHref(
            document.activeElement.getAttribute('href')
          ).join('')

          if (href) {
            safari.self.tab.dispatchMessage('sendToInstapaper', {href: href})
          }

          event.preventDefault()
          event.stopPropagation()
        }
      }
    },

    handleCopy(e) {
      if (
        document.activeElement &&
        document.activeElement.tagName == 'A' &&
        this.selectedTextEqualsNextSearchString()
      ) {
        this.hijackCopyWith(e.srcElement.href)
        this.displayInIndicator('URL copied', ' (⌘C)', 'blue')
      }
    },

    handleAlphaKeys(e) {
      e.cmdKey = e.metaKey && !e.ctrlKey
      e.character = String.fromCharCode(e.keyCode)

      // If it was a typeable character, Cmd key wasn't down, and a field doesn't have focus.
      if (
        e.keyCode &&
        !this.focusedElement() &&
        !e.cmdKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        if (e.keyCode == 13) {
          // Return key but no link; flash.
          this.displayInIndicator(this.nextSearchString, ' ⏎')
          this.flashIndicator()
        } else {
          if (this.searchString == '' && (e.keyCode == 32 || e.keyCode == 8)) {
            // Do nothing, we allow the space bar and delete to fall through to scroll
            // the page if we have no searchstring.
          } else {
            // append char
            this.searchString += e.character
            this.nextSearchString = this.searchString
            this.displaySearchString = this.searchString.replace(/ /g, '␣')

            // Let the first letter fall through, for j/k-style navigation
            // also let it fall through if it's only j's and k's
            // (or possibly other known nav keys unlikely to be words),
            // or a string of idential chars.
            // KeyThinkAI™, idea credit @andyfowler.
            if (
              this.searchString.length > 1 &&
              !this.searchString.match(/^[jk]*$/) &&
              !this.searchString.match(
                new RegExp('^[' + this.searchString[0] + ']+$')
              )
            ) {
              // Clear selection and find again.
              window.getSelection().removeAllRanges()
              this.find(this.searchString, false)

              // Focus the link so return key follows.
              const color = this.focusSelectedLink(this.nextSearchString)
              this.displayInIndicator(this.nextSearchString, '', color)

              // Check for nothing found.
              if (!window.getSelection().rangeCount) this.flashIndicator()

              e.preventDefault()
              e.stopPropagation()
            }
          }
        }

        // Postpone clearing.
        clearTimeout(this.keyupTimeout)
        this.keyupTimeout = setTimeout(() => {
          FindAsYouTypeStart.searchString = ''
        }, 1000)
      }
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

    mungeHref(href) {
      // Figure out what to do.
      if (href.match(/^([a-zA-Z]+:)/)) {
        let prefix = ''
      } else if (href.match(/^\//)) {
        let prefix = location.protocol + '//' + location.host
      } else if (href.match(/^#/)) {
        let prefix = location.href
      } else {
        let prefix = location.href.replace(/\/[^\/]*(\?.*)?$/, '/')
      }

      // Deal with ../ in <a href>.
      let this_href = href

      while (this_href.match(/\.\.\//)) {
        this_href = this_href.replace(/\.\.\//, '')
        prefix = prefix.replace(/[^\/]*\/$/, '')
      }

      return [prefix, this_href]
    },

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
      this.createIndicator()

      // Handle command-g & esc.
      window.addEventListener(
        'keydown',
        e => FindAsYouTypeStart.handleNonAlphaKeys(e),
        true
      )

      // Handle typeable keypresses.
      window.addEventListener(
        'keypress',
        e => FindAsYouTypeStart.handleAlphaKeys(e),
        true
      )

      window.addEventListener(
        'beforecopy',
        e => FindAsYouTypeStart.handleCopy(e),
        true
      )
    }
  }
})()

if (document.readyState == 'complete') {
  FindAsYouTypeStart.init()
} else {
  window.addEventListener('load', () => FindAsYouTypeStart.init())
}
