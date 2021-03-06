import eEmit from '../libs/eEmit'
import ImagesPreloader from '../libs/imagesPreloader'
import VisitorLossDetection from '../libs/visitorLossDetection'
import WebForm from './webForm'
import notifier from '../libs/notifier'
import Wrapper from './wrapper'
import {default as store, commit as storeCommit} from '../store'
import helpers from '../helpers'

export default {
  webForms: {},
  sessionListName: 'mkz_hidden_web_forms',
  wrapper: null,

  init () {
    this.wrapper = new Wrapper()

    eEmit.subscribe('assets', notifier.wrap(this.assetsHandler.bind(this)))

    // View webForms
    eEmit.subscribe('track.after', notifier.wrap(this.afterTrackHandler.bind(this)))

    // The list of webForms should always be up to date
    eEmit.subscribe('WebForm.before_destroy', notifier.wrap(this.beforeDestroyHandler.bind(this)))

    // Blocking the display of two webForms of the same type.
    // The first is hiding.
    eEmit.subscribe('WebForm.after_show', notifier.wrap(this.afterShowHandler.bind(this)))
    eEmit.subscribe('WebForm.after_close', notifier.wrap(this.afterCloseHandler.bind(this)))
  },
  async afterTrackHandler (data) {
    if (data.post.type !== 'page_view') return false

    // Support Single Page Application web sites
    this.destroyWebForms()

    if (data.response.web_forms) for (const options of data.response.web_forms) {
      await this.preloadImages(options.body_html)
      this.add(options)
    }
    // Restoration of wefForms from the session is performed after receiving a list of new wefForms.
    // This is necessary to maintain priority of displaying more important wefForms.
    this.restoreHiddenList()
    this.archiveHiddenList()

    await this.wrapper.renderRibbons(this.webForms)
  },
  assetsHandler (data) {
    this.wrapper.render()
  },
  async beforeDestroyHandler (data) {
    const wefForm = this.webForms[data.uid]
    if (wefForm?.lossDetection) wefForm.lossDetection.abort()
    delete this.webForms[data.uid]
    this.archiveHiddenList()

    this.wrapper.renderRibbons(this.webForms)
  },
  async afterShowHandler (data) {
    const webFormCurrent = this.webForms[data.uid]
    for (const uid in this.webForms) {
      const webForm = this.webForms[uid]
      if (
        webForm.uid !== webFormCurrent.uid &&
        !webForm.api.isHidden
      ) webForm.api.hide()
    }

    this.wrapper.renderRibbons(this.webForms)
  },
  async afterCloseHandler (data) {
    this.wrapper.renderRibbons(this.webForms)
  },
  preview (webFormUid) {
    storeCommit('trackEnabled', false)
    const xhr = new XMLHttpRequest()
    const url = typeof store.webFormPreview === 'function' ? store.webFormPreview.apply(this, [webFormUid]) : store.webFormPreview

    xhr.open('GET', url || `https://${store.trackerEndpoint}/preview?web_form_uid=${webFormUid}`, true)
    xhr.onload = async () => {
      if (xhr.readyState === 4 && xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText)

          this.destroyWebForms()

          await this.wrapper.render(response)

          for (const options of response.web_forms) this.add(options)
        } catch (e) {
          console.log(e)
        }
      }
    }
    xhr.send(null)
  },
  destroyWebForms () {
    for (const uid in this.webForms) {
      const webForm = this.webForms[uid]
      if (webForm.lossDetection) webForm.lossDetection.abort()
      if (webForm.api) webForm.api.destroy()
    }
    this.webForms = {}
  },
  add (options) {
    if (this.webForms[options.uid]) return false

    if (this.exist(options)) {
      if (options.can_be_hidden) options.is_hidden = true
      else {
        notifier.notify(new Error(`Error! Invalid webForm display script with uid=${options.uid}`))
        return false
      }
    }
    this.webForms[options.uid] = options

    this.timeoutCallback(
        options.show_timeout,
        () => {
          if (this.webForms[options.uid]) this.viewWithLossDetection(options)
        },
        () => {
          this.viewWithLossDetection(options)
        }
      )
  },
  archiveHiddenList () {
    const webFormsHidden = {}
    for (const uid in this.webForms) {
      const webForm = Object.assign({}, this.webForms[uid])
      if (webForm.can_be_hidden) {
        webForm.is_hidden = true
        webForm.session_loss_desktop = false
        webForm.session_loss_mobile = 0
        webForm.show_timeout = 0
        webForm.close_timeout = 0
        delete webForm.api
        delete webForm.lossDetection

        webFormsHidden[uid] = webForm
      }
    }
    window.sessionStorage.setItem(this.sessionListName, JSON.stringify(webFormsHidden))
  },
  restoreHiddenList () {
    const str = window.sessionStorage.getItem(this.sessionListName)
    if (!str) return false

    try {
      const webFormsHidden = JSON.parse(str)
      for (const uid in webFormsHidden) this.add(webFormsHidden[uid])
    } catch (e) {
      console.log(e)
    }
  },
  viewWithLossDetection (options) {
    const view = () => {
      if (this.webForms[options.uid]) this.view(options)
    }

    if (helpers.isMobile()) {

      this.timeoutCallback(
          options.session_loss_mobile,
          () => view(),
          () => view()
        )

    } else {

      if (options.session_loss_desktop) {
        options.lossDetection = new VisitorLossDetection({
          detect: () => view()
        })
      } else view()

    }
  },
  view (options) {
    this.webForms[options.uid].api = new WebForm(options, this.wrapper.elWebForms)

    this.timeoutCallback(
        options.close_timeout,
        () => {
          if (this.webForms[options.uid]?.api) this.webForms[options.uid].api.close(true)
        },
        () => {}
      )
  },
  exist (options) {
    for (const uid in this.webForms) {
      const webForm = this.webForms[uid]
      if (webForm.uid !== options.uid) return true
    }
    return false
  },
  preloadImages (html) {
    new Promise((resolve, reject) => {
      (new ImagesPreloader()).load(html, resolve)
    })
  },
  // Example:
  // timeoutString = "0" / "5..25" / "5" / 5 / 0
  timeoutCallback (timeoutString, callbackWithTimer, callbackWithoutTimer) {
    let timeout = parseInt(timeoutString)
    const delimeter = '..'
    if (typeof timeoutString === 'string') {
      if (timeoutString.indexOf(delimeter) > -1) {
        const interval = timeoutString.split(delimeter)
        const min = parseInt(interval[0])
        const max = parseInt(interval[1])
        timeout = Math.round(Math.random() * (max - min) + min)
      } else timeout = parseInt(timeoutString)
    }

    if (timeout > 0) setTimeout(callbackWithTimer, timeout * 1000)
    else callbackWithoutTimer()
  }
}
