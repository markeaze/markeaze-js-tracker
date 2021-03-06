import eEmit from './libs/eEmit'
import toSnakeCase from './libs/toSnakeCase'
import log from './libs/log'
import Request from './libs/request'
import robotDetection from './libs/robot_detection'
import store from './store'
import AssetsLoader from './assetsLoader'
import helpers from './helpers'

const assetsLoader = new AssetsLoader()

export default {
  send (eventName, properties, visitor = null) {
    return new Promise((resolve, reject) => {
      if (robotDetection.is_bot() || !store.appKey) {
        log.push('tracker', 'abort')
        return resolve()
      }

      // Basic data
      const data = {}
      data.app_key = store.appKey
      data.type = toSnakeCase.convert( eventName.replace(/^track/gi, '') )
      data.tracker_ver = store.version
      data.tracker_name = store.trackerName
      data.performed_at = Math.floor(Date.now() / 1000)
      if (store.assets) data.assets_version = store.assets.version

      // Visitor info
      data.visitor = helpers.fromEntries(helpers.entries({ ...store.visitor, ...(visitor || {}) }).filter((i) => i[1] !== ''))
      data.visitor.device_uid = store.uid
      if (data.visitor.client_id) data.visitor.client_id = String(data.visitor.client_id)
      else delete data.visitor.client_id

      // Event properties
      if (properties) data.properties = properties

      eEmit.emit('track.before', data)
      log.push('tracker', data);

      if (store.trackEnabled) {
        (new Request).send(
          store.trackerUrl || `https://${store.trackerEndpoint}/event`,
          data,
          (response) => {
            this.assets(data, response)
            eEmit.emit('track.after', {post: data, response})
            resolve({post: data, response})
          },
          (xhr) => {
            if (xhr.status === 403) {
              robotDetection.detect()
              log.push('tracker', 'robot detected')
            } else {
              log.push('tracker', 'fail', xhr)
              reject(xhr)
            }
          }
        )
      }

    })

  },
  assets (data, response) {
    // Should run when assets is first loaded or updated
    if (!assetsLoader.parse(response.assets)) return
    eEmit.emit('assets', store.assets)
  }
}
