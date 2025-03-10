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
      documentContent = message.content || documentContent;
      documentTitle = message.title || documentTitle;
      updateDocument();
      updateTitle();
      const currentDocId = document.querySelector('#document-topic')?.textContent
      if (currentDocId) {
        saveDocToLocalStorage(currentDocId, documentTitle, documentContent)
        updateRecentsList()
      }
      updateWordCount();
    } else if (message.type === 'update') {
      documentContent = message.content
      updateDocument()
      updateWordCount()
    } else if (message.type === 'title-update') {
      documentTitle = message.title
      updateTitle()
    const currentDocId = document.querySelector('#document-topic')?.textContent
      if (currentDocId) {
        saveDocToLocalStorage(currentDocId, documentTitle, documentContent)
        updateRecentsList()
      }
    }
    else if (message.type === 'cursor-update') {
      updateRemoteCursor(message.user, message.position)
    }
  })
  
  peer.on('close', () => {
    updatePeerCount()
  })
})

async function createDocument() {
  documentContent = ''; // Reset document content
  documentTitle = 'Untitled Document'; // Reset title
  updateDocument();
  updateTitle();

  const topicBuffer = crypto.randomBytes(32);
  const docId = b4a.toString(topicBuffer, 'hex')

  // Save new doc info locally
  saveDocToLocalStorage(docId, documentTitle, documentContent)
  joinSwarm(topicBuffer);
  updateRecentsList() // Refresh recents 
}


async function joinDocument(e) {
  e.preventDefault()
  const docId = document.querySelector('#join-document-topic').value
  if (!docId) return

  document.querySelector('#document-topic').textContent = docId

  const loadedDoc = loadDocFromLocalStorage(docId)
  if (loadedDoc) {
    documentTitle = loadedDoc.title
    documentContent = loadedDoc.content
    updateDocument()
    updateTitle()
  } else {

  }

  joinSwarm(b4a.from(docId, 'hex'))

  saveDocToLocalStorage(docId, documentTitle, documentContent)
  updateRecentsList()
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
    updateWordCount()

    // Also update local storage
    const docId = document.querySelector('#document-topic').textContent
    if (docId) saveDocToLocalStorage(docId, documentTitle, documentContent)
  }
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
  console.log("Updating title:", documentTitle);
  document.querySelector('#doc-title').value = documentTitle;
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

document.querySelector('#save-txt').addEventListener('click', () => {
  const text = document.querySelector('#document').textContent
  const blob = new Blob([text], { type: 'text/plain' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'MyDocument.txt'
  link.click()
  URL.revokeObjectURL(link.href)
})

// Store a document in localStorage with its ID as the key
function saveDocToLocalStorage(docId, docTitle, docContent) {
  const savedDocs = JSON.parse(localStorage.getItem('savedDocs')) || {}
  savedDocs[docId] = { title: docTitle, content: docContent }
  localStorage.setItem('savedDocs', JSON.stringify(savedDocs))
}

// Retrieve a document from localStorage by its ID
function loadDocFromLocalStorage(docId) {
  const savedDocs = JSON.parse(localStorage.getItem('savedDocs')) || {}
  return savedDocs[docId] || null
}


function updateRecentsList() {
  const savedDocs = JSON.parse(localStorage.getItem('savedDocs')) || {}
  const recentsContainer = document.querySelector('#recent-docs')
  if (!recentsContainer) return
  
  recentsContainer.innerHTML = ''

  // Convert object keys to array, sorted by recency if you like,
  // or just get them as they come. If you track timestamps, you can sort.
  const docIds = Object.keys(savedDocs)
  // Limit to 6 docs (most recent can be the end or the beginning of the array)
  // For example, let's just take the last 6 in the array:
  const recentDocIds = docIds.slice(-6)

  // Display only the last 6 docs in recents
  recentDocIds.forEach(docId => {
    const docTitle = savedDocs[docId].title || 'Untitled Document'
    const button = document.createElement('button')
    button.textContent = docTitle
    button.addEventListener('click', () => {
      // For clarity, just show an alert or copy the doc ID
      alert(`Doc ID: ${docId}`)
    })
    recentsContainer.appendChild(button)
  })

  // Then also populate the "History" modal list
  populateHistoryList(docIds, savedDocs)
}

// Populate the "History" modal with *all* docs
function populateHistoryList(docIds, savedDocs) {
  const historyList = document.querySelector('#history-list')
  if (!historyList) return
  
  historyList.innerHTML = ''

  docIds.forEach(docId => {
    const docTitle = savedDocs[docId].title || 'Untitled Document'
    const historyItem = document.createElement('button')
    historyItem.textContent = docTitle
    historyItem.addEventListener('click', () => {
      // Show doc ID, plus copy button
      alert(`Doc ID: ${docId}`)
      // Alternatively, copy to clipboard:
      // navigator.clipboard.writeText(docId)
    })
    historyList.appendChild(historyItem)
  })
}

// Show/Hide the History modal
const openHistoryBtn = document.querySelector('#open-history')
const closeHistoryBtn = document.querySelector('#close-history-modal')
const historyModal = document.querySelector('#history-modal')

if (openHistoryBtn && historyModal) {
  openHistoryBtn.addEventListener('click', () => {
    historyModal.classList.add('show')
  })
}

if (closeHistoryBtn && historyModal) {
  closeHistoryBtn.addEventListener('click', () => {
    historyModal.classList.remove('show')
  })
}

function copyDocId(docId) {
  navigator.clipboard.writeText(docId)
    .then(() => alert('Doc ID copied!'))
    .catch(() => alert('Failed to copy Doc ID.'))
}

function sendTitleUpdate() {
  documentTitle = document.querySelector('#doc-title').value
  broadcast({ type: 'title-update', title: documentTitle })
  
  const docId = document.querySelector('#document-topic').textContent
  if (docId) {
    saveDocToLocalStorage(docId, documentTitle, documentContent)
    updateRecentsList()
  }
}

document.querySelector('#close-doc-id-modal')?.addEventListener('click', () => {
  const docIdModal = document.querySelector('#doc-id-modal')
  docIdModal?.classList.remove('show')
})

document.querySelector('#copy-doc-id-btn')?.addEventListener('click', () => {
  const docIdText = document.querySelector('#doc-id-display')?.textContent || ''
  copyDocId(docIdText)
})

document.querySelector('#view-storage')?.addEventListener('click', () => {
  alert(JSON.stringify(localStorage, null, 2))
})

document.querySelector('#clear-storage')?.addEventListener('click', () => {
  localStorage.clear()
  alert('Local storage cleared!')
  updateRecentsList() // Refresh the list after clearing
})

document.addEventListener('DOMContentLoaded', () => {
  updateRecentsList()
})