/** @typedef {import('pear-interface')} */

/* global Pear */
import Hyperswarm from 'hyperswarm'   // Module for P2P networking and connecting peers
import crypto from 'hypercore-crypto' // Cryptographic functions for generating the key in app
import b4a from 'b4a'                 // Module for buffer-to-string and vice-versa conversions
const { teardown, updates } = Pear    // Functions for cleanup and updates

const swarm = new Hyperswarm()
let documentContent = '' // Store the full document state

// Unannounce the public key before exiting the process
teardown(() => swarm.destroy())

// Enable automatic reloading for the app
updates(() => Pear.reload())

// When there's a new connection, sync the full document state
swarm.on('connection', (peer) => {
  console.log('New peer connected')

  // Send the full document state to the new peer
  peer.write(b4a.from(JSON.stringify({ type: 'full', content: documentContent }), 'utf-8'))

  // Listen for updates from the peer
  peer.on('data', (data) => {
    const message = JSON.parse(b4a.toString(data, 'utf-8'))
    if (message.type === 'full') {
      // If a peer sends a full document, update the local document ONLY if it's empty
      if (!documentContent && message.content) {
        documentContent = message.content
        updateDocument(documentContent)
      }
    } else if (message.type === 'update') {
      // Apply incremental updates
      if (message.content !== documentContent) {
        documentContent = message.content
        updateDocument(documentContent)
      }
    }
  })

  peer.on('error', e => console.log(`Connection error: ${e}`))
})

// When there's updates to the swarm, update the peers count
swarm.on('update', () => {
  document.querySelector('#peers-count').textContent = swarm.connections.size
})

document.querySelector('#create-document').addEventListener('click', createDocument)
document.querySelector('#join-form').addEventListener('submit', joinDocument)
document.querySelector('#document').addEventListener('input', sendDocumentUpdate)

async function createDocument() {
  // Generate a new random topic (32 byte string)
  const topicBuffer = crypto.randomBytes(32)
  joinSwarm(topicBuffer)
}

async function joinDocument(e) {
  e.preventDefault()
  const topicStr = document.querySelector('#join-document-topic').value
  const topicBuffer = b4a.from(topicStr, 'hex')
  joinSwarm(topicBuffer)
}

async function joinSwarm(topicBuffer) {
  document.querySelector('#setup').classList.add('hidden')
  document.querySelector('#loading').classList.remove('hidden')

  // Join the swarm with the topic
  const discovery = swarm.join(topicBuffer, { client: true, server: true })
  await discovery.flushed()

  const topic = b4a.toString(topicBuffer, 'hex')
  document.querySelector('#document-topic').innerText = topic
  document.querySelector('#loading').classList.add('hidden')
  document.querySelector('#editor').classList.remove('hidden')
}

function sendDocumentUpdate() {
  const newContent = document.querySelector('#document').innerText
  if (newContent !== documentContent) {
    documentContent = newContent

    // Broadcast the update to all peers
    const peers = [...swarm.connections]
    for (const peer of peers) {
      peer.write(b4a.from(JSON.stringify({ type: 'update', content: newContent }), 'utf-8'))
    }
  }
}

function updateDocument(content) {
  if (document.querySelector('#document').innerText !== content) {
    document.querySelector('#document').innerText = content
  }
}