import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import b4a from 'b4a'
const { teardown, updates } = Pear

const swarm = new Hyperswarm()
let documentContent = '' // Store the full document state
let documentTitle = 'Untitled Document'

const localUser = {
  id: crypto.randomBytes(4).toString('hex'),
  name: `User-${Math.floor(Math.random() * 1000)}`,
  color: getRandomColor(),
}

const users = {}
const userCursors = {}

teardown(() => swarm.destroy())
updates(() => Pear.reload())

document.querySelector('#create-document').addEventListener('click', createDocument)
document.querySelector('#join-form').addEventListener('submit', joinDocument)
document.querySelector('#document').addEventListener('input', sendDocumentUpdate)
document.querySelector('#doc-title').addEventListener('input', sendTitleUpdate)
document.addEventListener('selectionchange', sendCursorUpdate)

swarm.on('connection', (peer) => {
  console.log('New peer connected')
  peer.write(b4a.from(JSON.stringify({ type: 'full', content: documentContent, title: documentTitle }), 'utf-8'))

  peer.on('data', (data) => {
    const message = JSON.parse(b4a.toString(data, 'utf-8'))
    if (message.type === 'full') {
      if (!documentContent) {
        documentContent = message.content
        documentTitle = message.title
        updateDocument()
      }
    } else if (message.type === 'update') {
      documentContent = message.content
      updateDocument()
    } else if (message.type === 'title-update') {
      documentTitle = message.title
      updateTitle()
    } else if (message.type === 'cursor-update') {
      updateRemoteCursor(message.user, message.position)
    }
  })
})

async function createDocument() {
  const topicBuffer = crypto.randomBytes(32)
  joinSwarm(topicBuffer)
}

async function joinDocument(e) {
  e.preventDefault()
  const topicStr = document.querySelector('#join-document-topic').value
  joinSwarm(b4a.from(topicStr, 'hex'))
}

async function joinSwarm(topicBuffer) {
  document.querySelector('#setup').classList.add('hidden')
  document.querySelector('#loading').classList.remove('hidden')
  await swarm.join(topicBuffer, { client: true, server: true }).flushed()
  document.querySelector('#document-topic').innerText = b4a.toString(topicBuffer, 'hex')
  document.querySelector('#loading').classList.add('hidden')
  document.querySelector('#editor').classList.remove('hidden')
}

function sendDocumentUpdate() {
  const newContent = document.querySelector('#document').innerHTML
  if (newContent !== documentContent) {
    documentContent = newContent
    broadcast({ type: 'update', content: newContent })
  }
}

function sendTitleUpdate() {
  documentTitle = document.querySelector('#doc-title').value
  broadcast({ type: 'title-update', title: documentTitle })
}

function sendCursorUpdate() {
  const selection = window.getSelection()
  if (!selection.rangeCount) return
  const range = selection.getRangeAt(0)
  const position = {
    start: range.startOffset,
    end: range.endOffset,
  }
  broadcast({ type: 'cursor-update', user: localUser, position })
}

function updateDocument() {
  document.querySelector('#document').innerHTML = documentContent
}

function updateTitle() {
  document.querySelector('#doc-title').value = documentTitle
}

function updateRemoteCursor(user, position) {
  userCursors[user.id] = { user, position }
}

function broadcast(message) {
  swarm.connections.forEach(peer => peer.write(b4a.from(JSON.stringify(message), 'utf-8')))
}

function getRandomColor() {
  const colors = ['#00b894', '#00cec9', '#0984e3', '#6c5ce7', '#fdcb6e']
  return colors[Math.floor(Math.random() * colors.length)]
}
