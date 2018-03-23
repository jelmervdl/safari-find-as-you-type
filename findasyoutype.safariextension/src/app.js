'use strict'

const FindAsYouTypeApp = (function() {
  return {
    init() {
      safari.application.addEventListener(
        'message',
        msg => FindAsYouTypeApp[msg.name](msg.message, msg.target),
        false
      )

      safari.extension.settings.addEventListener(
        'change',
        this.getSettings,
        false
      )
      safari.extension.settings.addEventListener(
        'change',
        this.saveSettingsToLocalStorage,
        false
      )
      safari.extension.secureSettings.addEventListener(
        'change',
        this.saveSettingsToLocalStorage,
        false
      )

      this.retrieveSettingsFromLocalStorage()
    },

    retrieveSettingsFromLocalStorage() {
      const keys = FindAsYouTypeApp.persistentSettingsKeys

      for (x in keys.secure) {
        if (!safari.extension.secureSettings[keys.secure[x]])
          safari.extension.secureSettings.setItem(
            keys.secure[x],
            localStorage.getItem(keys.secure[x])
          )
      }

      for (x in keys.unsecure) {
        if (!safari.extension.settings.getItem(keys.unsecure[x]))
          safari.extension.settings.setItem(
            keys.unsecure[x],
            localStorage.getItem(keys.unsecure[x])
          )
      }
    },

    saveSettingsToLocalStorage(e) {
      const keys = FindAsYouTypeApp.persistentSettingsKeys

      for (const x in keys.secure) {
        localStorage.setItem(
          keys.secure[x],
          safari.extension.secureSettings.getItem(keys.secure[x])
        )
      }

      for (const x in keys.unsecure) {
        localStorage.setItem(
          keys.unsecure[x],
          safari.extension.settings.getItem(keys.unsecure[x])
        )
      }
    },

    getSettings(data, target) {
      const settings = {
        blacklist: safari.extension.settings.getItem('blacklist'),
        linksOnly: safari.extension.settings.getItem('linksOnly')
      }

      if (target && target.page) {
        // If the page asked, it's easy (because each page asks on load).
        target.page.dispatchMessage('getSettingsCallback', settings)
      } else {
        // If a setting changed, we have to push it to all open tabs.
        const windows = safari.application.browserWindows
        for (const w in windows) {
          for (const t in windows[w].tabs) {
            windows[w].tabs[t].page.dispatchMessage(
              'getSettingsCallback',
              settings
            )
          }
        }
      }
    }
  }
})()

FindAsYouTypeApp.init()
