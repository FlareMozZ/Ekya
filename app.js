import Hyperswarm from 'hyperswarm'
import crypto from 'hypercore-crypto'
import b4a from 'b4a'
const { teardown, updates } = Pear

const swarm = new Hyperswarm()
let documentContent = '' // Store the full document state
let documentTitle = 'Untitled Document'

// Local user info
const localUser = {
  id: crypto.randomBytes(4).toString('hex'),
  name: `User-${Math.floor(Math.random() * 1000)}`,
  color: getRandomColor(),
}

const users = {}
const userCursors = {}

teardown(() => swarm.destroy())
updates(() => Pear.reload())

// DOM Listeners for document actions
document.querySelector('#create-document').addEventListener('click', createDocument)
document.querySelector('#join-form').addEventListener('submit', joinDocument)
document.querySelector('#document').addEventListener('input', sendDocumentUpdate)
document.querySelector('#doc-title').addEventListener('input', sendTitleUpdate)
document.addEventListener('selectionchange', () => {
  sendCursorUpdate()
  updateToolbarState()
})

// Toolbar formatting commands with toggle support
document.querySelector('#bold').addEventListener('click', (e) => {
  document.execCommand('bold')
  // If no selection, toggle active state manually
  if (window.getSelection().isCollapsed) {
    e.currentTarget.classList.toggle('active')
  }
  updateToolbarState()
})
document.querySelector('#italic').addEventListener('click', (e) => {
  document.execCommand('italic')
  if (window.getSelection().isCollapsed) {
    e.currentTarget.classList.toggle('active')
  }
  updateToolbarState()
})
document.querySelector('#underline').addEventListener('click', (e) => {
  document.execCommand('underline')
  if (window.getSelection().isCollapsed) {
    e.currentTarget.classList.toggle('active')
  }
  updateToolbarState()
})
document.querySelector('#strikethrough').addEventListener('click', (e) => {
  document.execCommand('strikeThrough')
  if (window.getSelection().isCollapsed) {
    e.currentTarget.classList.toggle('active')
  }
  updateToolbarState()
})
document.querySelector('#align-left').addEventListener('click', () => {
  document.execCommand('justifyLeft')
})
document.querySelector('#align-center').addEventListener('click', () => {
  document.execCommand('justifyCenter')
})
document.querySelector('#align-right').addEventListener('click', () => {
  document.execCommand('justifyRight')
})
document.querySelector('#align-justify').addEventListener('click', () => {
  document.execCommand('justifyFull')
})
document.querySelector('#bullet-list').addEventListener('click', () => {
  document.execCommand('insertUnorderedList')
})
document.querySelector('#numbered-list').addEventListener('click', () => {
  document.execCommand('insertOrderedList')
})
document.querySelector('#indent').addEventListener('click', () => {
  document.execCommand('indent')
})
document.querySelector('#outdent').addEventListener('click', () => {
  document.execCommand('outdent')
})

// Font family and size via toolbar
document.querySelector('#font-family').addEventListener('change', (e) => {
  document.execCommand('fontName', false, e.target.value)
})
document.querySelector('#font-size').addEventListener('change', (e) => {
  // execCommand fontSize accepts values 1-7.
  document.execCommand('fontSize', false, e.target.value)
  // Replace generated <font> tags with <span> tags with inline style.
  const fontElements = document.querySelectorAll(`font[size="${e.target.value}"]`)
  const sizeMap = { '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt' }
  fontElements.forEach(el => {
    const span = document.createElement('span')
    span.style.fontSize = sizeMap[e.target.value] || '12pt'
    span.innerHTML = el.innerHTML
    el.parentNode.replaceChild(span, el)
  })
})

// Copy Document ID functionality
document.querySelector('#copy-id').addEventListener('click', () => {
  const docId = document.querySelector('#document-topic').innerText
  navigator.clipboard.writeText(docId)
    .then(() => alert('Document ID Copied!'))
    .catch((err) => alert('Failed to copy Document ID'))
})

// Update the peer count in the UI
function updatePeerCount() {
  const peerCountElem = document.querySelector('#peers-count')
  if (peerCountElem) {
    peerCountElem.textContent = swarm.connections.length
  }
}

// Periodically refresh peer count every second
setInterval(updatePeerCount, 1000)

// Update active formatting button state based on cursor context
function updateToolbarState() {
  const commands = [
    { id: 'bold', command: 'bold' },
    { id: 'italic', command: 'italic' },
    { id: 'underline', command: 'underline' },
    { id: 'strikethrough', command: 'strikeThrough' },
  ]
  commands.forEach(({ id, command }) => {
    const btn = document.querySelector(`#${id}`)
    if (document.queryCommandState(command)) {
      btn.classList.add('active')
    } else {
      btn.classList.remove('active')
    }
  })
}

// Word count update function
function updateWordCount() {
  const docElem = document.querySelector('#document')
  const wordCountElem = document.querySelector('#word-count')
  if (docElem && wordCountElem) {
    const text = docElem.textContent || ""
    const words = text.trim().split(/\s+/).filter(Boolean)
    wordCountElem.textContent = words.length
  }
}

swarm.on('connection', (peer) => {
  console.log('New peer connected')
  updatePeerCount()
  
  peer.write(b4a.from(JSON.stringify({
    type: 'full',
    content: documentContent,
    title: documentTitle,
  }), 'utf-8'))
  
  peer.on('data', (data) => {
    const message = JSON.parse(b4a.toString(data, 'utf-8'))
    if (message.type === 'full') {
      if (!documentContent) {
        documentContent = message.content
        documentTitle = message.title
        updateDocument()
        updateTitle()
        updateWordCount()
      }
    } else if (message.type === 'update') {
      documentContent = message.content
      updateDocument()
      updateWordCount()
    } else if (message.type === 'title-update') {
      documentTitle = message.title
      updateTitle()
    } else if (message.type === 'cursor-update') {
      updateRemoteCursor(message.user, message.position)
    }
  })
  
  peer.on('close', () => {
    updatePeerCount()
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
    updateWordCount() // update the word count whenever content changes
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
  updateWordCount()
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