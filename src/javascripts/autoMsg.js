import eEmit from './libs/eEmit'

export default {
  items: [],
  chatCreated: false,
  init () {
    eEmit.subscribe('track.after', ({post, response}) => {
      if (!response.auto_message) return

      this.items.push(response.auto_message)
      if (this.chatCreated) this.emitChat()
    })
    eEmit.subscribe('plugin.chat.created', this.emitChat.bind(this))
    eEmit.subscribe('plugin.chat.updated', this.emitChat.bind(this))
    eEmit.subscribe('plugin.chat.destroy', () => {
      this.chatCreated = false
    })
  },
  emitChat () {
    this.chatCreated = true
    if (this.items.length === 0) return

    eEmit.emit('plugin.chat.auto_messages', this.items)
    this.items = []
  }
}
