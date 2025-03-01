/** @typedef {import('pear-interface')} */

/* global Pear */
import Hyperswarm from "hyperswarm"
import Hyperdrive from "hyperdrive"
import Corestore from "corestore"
import crypto from "hypercore-crypto"
import b4a from "b4a"
import { nanoid } from "nanoid"

// Import Pear
import Pear from "pear-interface"

// Initialize PEAR components
const { teardown, updates } = Pear
const store = new Corestore(Pear.config.storage)
const swarm = new Hyperswarm()
let drive = null
let documentTopic = null
let documentContent = ""
let documentTitle = "Untitled Document"
const userCursors = {}
const localUser = {
  id: nanoid(8),
  name: `User-${Math.floor(Math.random() * 1000)}`,
  color: getRandomColor(),
  position: { start: 0, end: 0 },
}

// Document state
let documentState = {
  content: "",
  title: "Untitled Document",
  users: {},
  lastModified: Date.now(),
}

// Setup cleanup
teardown(() => swarm.destroy())

// Enable automatic reloading
updates(() => Pear.reload())

// DOM Elements
const setupScreen = document.getElementById("setup")
const loadingScreen = document.getElementById("loading")
const editorScreen = document.getElementById("editor")
const documentElement = document.getElementById("document")
const documentTopicElement = document.getElementById("document-topic")
const peersCountElement = document.getElementById("peers-count")
const docTitleInput = document.getElementById("doc-title")
const wordCountElement = document.getElementById("word-count")
const syncIndicator = document.getElementById("sync-indicator")
const usersList = document.getElementById("users-list")

// Event Listeners
document.getElementById("create-document").addEventListener("click", createDocument)
document.getElementById("join-form").addEventListener("submit", joinDocument)
documentElement.addEventListener("input", handleDocumentChange)
documentElement.addEventListener("keyup", handleCursorChange)
documentElement.addEventListener("mouseup", handleCursorChange)
docTitleInput.addEventListener("input", handleTitleChange)

// Toolbar buttons
document.getElementById("bold").addEventListener("click", () => execFormatCommand("bold"))
document.getElementById("italic").addEventListener("click", () => execFormatCommand("italic"))
document.getElementById("underline").addEventListener("click", () => execFormatCommand("underline"))
document.getElementById("strikethrough").addEventListener("click", () => execFormatCommand("strikeThrough"))
document.getElementById("align-left").addEventListener("click", () => execFormatCommand("justifyLeft"))
document.getElementById("align-center").addEventListener("click", () => execFormatCommand("justifyCenter"))
document.getElementById("align-right").addEventListener("click", () => execFormatCommand("justifyRight"))
document.getElementById("align-justify").addEventListener("click", () => execFormatCommand("justifyFull"))
document.getElementById("bullet-list").addEventListener("click", () => execFormatCommand("insertUnorderedList"))
document.getElementById("numbered-list").addEventListener("click", () => execFormatCommand("insertOrderedList"))
document.getElementById("indent").addEventListener("click", () => execFormatCommand("indent"))
document.getElementById("outdent").addEventListener("click", () => execFormatCommand("outdent"))
document.getElementById("insert-image").addEventListener("click", insertImage)
document.getElementById("insert-link").addEventListener("click", insertLink)

document.getElementById("font-family").addEventListener("change", (e) => {
  execFormatCommand("fontName", e.target.value)
})

document.getElementById("font-size").addEventListener("change", (e) => {
  execFormatCommand("fontSize", e.target.value)
})

document.getElementById("text-color").addEventListener("input", (e) => {
  execFormatCommand("foreColor", e.target.value)
})

document.getElementById("highlight-color").addEventListener("input", (e) => {
  execFormatCommand("hiliteColor", e.target.value)
})

// Add this early in the file to ensure Pear is available
if (typeof Pear === 'undefined') {
  console.error('Pear runtime not detected!');
}





// P2P Connection Handling
swarm.on("connection", async (peer) => {
  console.log("New peer connected")
  updatePeersCount()

  // Setup replication for the drive
  if (drive) {
    store.replicate(peer)
  }

  // Send local user info
  sendUserInfo(peer)

  // Listen for updates from peers
  peer.on("data", (data) => {
    try {
      const message = JSON.parse(b4a.toString(data, "utf-8"))

      switch (message.type) {
        case "user-info":
          handleUserInfo(message.user, peer)
          break
        case "cursor-update":
          handleRemoteCursorUpdate(message.user, message.position)
          break
        case "title-update":
          handleRemoteTitleUpdate(message.title)
          break
      }
    } catch (error) {
      console.error("Error processing message:", error)
    }
  })

  peer.on("error", (e) => console.log(`Connection error: ${e}`))
  peer.on("close", () => {
    console.log("Peer disconnected")
    updatePeersCount()
    removeDisconnectedUsers()
  })
})

// When there's updates to the swarm, update the peers count
swarm.on("update", updatePeersCount)

// Create a new document
async function createDocument() {
  showLoadingScreen()

  // Generate a new random topic
  const topicBuffer = crypto.randomBytes(32)
  documentTopic = b4a.toString(topicBuffer, "hex")

  // Initialize the drive
  await initializeDrive(documentTopic, true)

  // Join the swarm with the topic
  await joinSwarm(topicBuffer)

  // Unlock achievement
  unlockAchievement("document-created")
}

// Join an existing document
async function joinDocument(e) {
  e.preventDefault()
  showLoadingScreen()

  const topicStr = document.getElementById("join-document-topic").value
  documentTopic = topicStr

  try {
    const topicBuffer = b4a.from(topicStr, "hex")

    // Initialize the drive
    await initializeDrive(documentTopic, false)

    // Join the swarm with the topic
    await joinSwarm(topicBuffer)

    // Unlock achievement
    unlockAchievement("document-joined")
  } catch (error) {
    console.error("Error joining document:", error)
    showSetupScreen()
    alert("Invalid document ID. Please try again.")
  }
}

async function initializeDrive(key, isNew) {
  try {
    drive = new Hyperdrive(store, isNew ? null : b4a.from(key, "hex"));
    await drive.ready();

    if (isNew) {
      documentState = {
        content: "",
        title: "Untitled Document",
        users: {},
        lastModified: Date.now(),
      };
      await drive.put("/document.json", JSON.stringify(documentState));
    } else {
      // Attempt to load existing document safely
      let data;
      try {
        data = await drive.get("/document.json");
      } catch (error) {
        console.log("No existing document found, initializing new document state.");
      }

      if (data) {
        documentState = JSON.parse(data.toString());
      } else {
        await drive.put("/document.json", JSON.stringify(documentState));
      }
    }

    // Ensure UI updates
    documentElement.innerHTML = documentState.content || "";
    docTitleInput.value = documentState.title || "Untitled Document";

    // Add a retry mechanism in case the watch fails
    try {
      drive.watch("/document.json", () => loadDocumentFromDrive());
    } catch (watchError) {
      console.warn("Drive watch setup failed, retrying in 3 seconds...");
      setTimeout(() => {
        drive.watch("/document.json", () => loadDocumentFromDrive());
      }, 3000);
    }

    return true;
  } catch (error) {
    console.error("Drive initialization failed:", error);
    showSetupScreen();
    return false;
  }
}

// Load document from drive
async function loadDocumentFromDrive() {
  try {
    const data = await drive.get("/document.json")
    if (data) {
      const newState = JSON.parse(data.toString())

      // Only update if the document is newer
      if (newState.lastModified > documentState.lastModified) {
        documentState = newState

        // Update UI without triggering events
        if (documentElement.innerHTML !== documentState.content) {
          documentElement.innerHTML = documentState.content
        }

        if (docTitleInput.value !== documentState.title) {
          docTitleInput.value = documentState.title
        }

        // Update word count
        updateWordCount()
      }
    }
  } catch (error) {
    console.error("Error loading document from drive:", error)
  }
}

// Save document to drive
async function saveDocumentToDrive() {
  try {
    // Update timestamp
    documentState.lastModified = Date.now()

    // Save to drive
    await drive.put("/document.json", JSON.stringify(documentState))

    // Update sync status
    syncIndicator.textContent = "Synced"
    syncIndicator.className = "synced"
  } catch (error) {
    console.error("Error saving document to drive:", error)

    // Update sync status
    syncIndicator.textContent = "Error syncing"
    syncIndicator.className = "error"
  }
}

async function joinSwarm(topicBuffer) {
  try {
    const discovery = swarm.join(topicBuffer, { client: true, server: true });
    await discovery.flushed(); // Ensures the swarm has joined before proceeding

    documentTopicElement.innerText = documentTopic;
    showEditorScreen();

    documentElement.innerHTML = documentState.content;
    docTitleInput.value = documentState.title;
    updateWordCount();
  } catch (error) {
    console.error("Error joining swarm:", error);
    showSetupScreen();
    alert("Failed to join the document. Please check the document ID.");
  }
}


// UI State Management
function showLoadingScreen() {
  setupScreen.classList.add("hidden")
  loadingScreen.classList.remove("hidden")
  editorScreen.classList.add("hidden")
}

function showEditorScreen() {
  setupScreen.classList.add("hidden")
  loadingScreen.classList.add("hidden")
  editorScreen.classList.remove("hidden")
}

function showSetupScreen() {
  setupScreen.classList.remove("hidden")
  loadingScreen.classList.add("hidden")
  editorScreen.classList.add("hidden")
}

// Document Editing Functions
function handleDocumentChange() {
  // Update sync status
  syncIndicator.textContent = "Syncing..."
  syncIndicator.className = "syncing"

  // Update document state
  documentState.content = documentElement.innerHTML

  // Save to drive
  saveDocumentToDrive()

  // Update word count
  updateWordCount()

  // Unlock achievement if first edit
  unlockAchievement("first-edit")
}

function handleTitleChange() {
  // Update document state
  documentState.title = docTitleInput.value

  // Save to drive
  saveDocumentToDrive()

  // Broadcast title change
  broadcastTitleUpdate(docTitleInput.value)
}

function handleCursorChange() {
  const selection = window.getSelection()
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0)

    // Update local user position
    localUser.position = {
      start: getTextNodeOffset(range.startContainer, range.startOffset),
      end: getTextNodeOffset(range.endContainer, range.endOffset),
    }

    // Broadcast cursor position
    broadcastCursorPosition(localUser, localUser.position)
  }
}

// Format commands
function execFormatCommand(command, value = null) {
  document.execCommand(command, false, value)
  documentElement.focus()
  handleDocumentChange()
}

// Insert image
function insertImage() {
  const url = prompt("Enter image URL:")
  if (url) {
    document.execCommand("insertImage", false, url)
    handleDocumentChange()
  }
}

// Insert link
function insertLink() {
  const url = prompt("Enter URL:")
  if (url) {
    document.execCommand("createLink", false, url)
    handleDocumentChange()
  }
}

// User and Cursor Management
function sendUserInfo(peer) {
  peer.write(
    b4a.from(
      JSON.stringify({
        type: "user-info",
        user: localUser,
      }),
      "utf-8",
    ),
  )
}

function handleUserInfo(user, peer) {
  // Add user to document state if not exists
  if (!documentState.users[user.id]) {
    documentState.users[user.id] = user

    // Update users list
    updateUsersList()
  }

  // Store peer connection
  userCursors[user.id] = {
    user,
    peer,
    element: null,
  }
}

function handleRemoteCursorUpdate(user, position) {
  if (userCursors[user.id]) {
    userCursors[user.id].user.position = position
    updateRemoteCursor(user.id)
  }
}

function handleRemoteTitleUpdate(title) {
  if (docTitleInput.value !== title) {
    docTitleInput.value = title
    documentState.title = title
  }
}

function broadcastCursorPosition(user, position) {
  const peers = [...swarm.connections]
  for (const peer of peers) {
    peer.write(
      b4a.from(
        JSON.stringify({
          type: "cursor-update",
          user: {
            id: user.id,
            name: user.name,
            color: user.color,
          },
          position,
        }),
        "utf-8",
      ),
    )
  }
}

function broadcastTitleUpdate(title) {
  const peers = [...swarm.connections]
  for (const peer of peers) {
    peer.write(
      b4a.from(
        JSON.stringify({
          type: "title-update",
          title,
        }),
        "utf-8",
      ),
    )
  }
}

function updateRemoteCursor(userId) {
  const cursorInfo = userCursors[userId]
  if (!cursorInfo) return

  // Remove existing cursor element
  if (cursorInfo.element) {
    cursorInfo.element.remove()
  }

  // Create new cursor element
  const template = document.getElementById("user-cursor-template")
  const cursorElement = template.cloneNode(true)
  cursorElement.id = `cursor-${userId}`
  cursorElement.classList.remove("hidden")

  // Set cursor name and color
  const nameElement = cursorElement.querySelector(".cursor-name")
  nameElement.textContent = cursorInfo.user.name

  const caretElement = cursorElement.querySelector(".cursor-caret")
  caretElement.style.backgroundColor = cursorInfo.user.color
  nameElement.style.backgroundColor = cursorInfo.user.color

  // Position cursor
  const position = getPositionFromOffset(cursorInfo.user.position.start)
  if (position) {
    cursorElement.style.left = `${position.left}px`
    cursorElement.style.top = `${position.top}px`

    // Add to document
    documentElement.appendChild(cursorElement)

    // Store element reference
    cursorInfo.element = cursorElement
  }
}

function removeDisconnectedUsers() {
  // Remove users whose peers are no longer connected
  const connectedPeers = new Set(swarm.connections)

  for (const userId in userCursors) {
    if (!connectedPeers.has(userCursors[userId].peer)) {
      // Remove cursor element
      if (userCursors[userId].element) {
        userCursors[userId].element.remove()
      }

      // Remove from cursors
      delete userCursors[userId]

      // Remove from document state
      delete documentState.users[userId]
    }
  }

  // Update users list
  updateUsersList()
}

// Utility Functions
function updatePeersCount() {
  peersCountElement.textContent = swarm.connections.size
}

function updateWordCount() {
  const text = documentElement.innerText || ""
  const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length
  wordCountElement.textContent = wordCount
}

function updateUsersList() {
  // Clear current list
  usersList.innerHTML = ""

  // Add local user
  const localUserItem = document.createElement("li")
  localUserItem.innerHTML = `
    <div class="user-avatar" style="background-color: ${localUser.color}"></div>
    <span>${localUser.name} (You)</span>
  `
  usersList.appendChild(localUserItem)

  // Add remote users
  for (const userId in documentState.users) {
    if (userId !== localUser.id) {
      const user = documentState.users[userId]
      const userItem = document.createElement("li")
      userItem.innerHTML = `
        <div class="user-avatar" style="background-color: ${user.color}"></div>
        <span>${user.name}</span>
      `
      usersList.appendChild(userItem)
    }
  }
}

// Fix cursor position calculation
function getTextNodeOffset(node, offset) {
  let absoluteOffset = offset;
  const walker = document.createTreeWalker(
    documentElement,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let currentNode = walker.nextNode();
  while (currentNode && currentNode !== node) {
    absoluteOffset += currentNode.length;
    currentNode = walker.nextNode();
  }
  return absoluteOffset;
}

function getPositionFromOffset(offset) {
  // Find the text node and relative offset
  let remainingOffset = offset
  let targetNode = null
  let relativeOffset = 0

  const walker = document.createTreeWalker(documentElement, NodeFilter.SHOW_TEXT, null, false)

  let currentNode = walker.nextNode()
  while (currentNode) {
    if (remainingOffset <= currentNode.length) {
      targetNode = currentNode
      relativeOffset = remainingOffset
      break
    }

    remainingOffset -= currentNode.length
    currentNode = walker.nextNode()
  }

  if (!targetNode) return null

  // Create a range to get position
  const range = document.createRange()
  range.setStart(targetNode, relativeOffset)
  range.collapse(true)

  const rect = range.getBoundingClientRect()
  const editorRect = documentElement.getBoundingClientRect()

  return {
    left: rect.left - editorRect.left,
    top: rect.top - editorRect.top,
  }
}

function getRandomColor() {
  const colors = ["#00b894", "#00cec9", "#0984e3", "#6c5ce7", "#fdcb6e", "#e17055", "#d63031", "#e84393"]
  return colors[Math.floor(Math.random() * colors.length)]
}

function unlockAchievement(id) {
  const achievements = {
    "first-edit": 0,
    "document-created": 1,
    "document-joined": 1,
    "hour-collaboration": 3,
  }

  if (achievements[id] !== undefined) {
    const achievementElements = document.querySelectorAll(".achievement")
    const element = achievementElements[achievements[id]]
    if (element && !element.classList.contains("unlocked")) {
      element.classList.add("unlocked")

      // Show notification
      showAchievementNotification(element.getAttribute("title"))
    }
  }
}

function showAchievementNotification(title) {
  // Create notification element
  const notification = document.createElement("div")
  notification.className = "achievement-notification"
  notification.innerHTML = `
    <div class="achievement-icon">🏆</div>
    <div class="achievement-text">
      <div class="achievement-title">Achievement Unlocked!</div>
      <div class="achievement-name">${title}</div>
    </div>
  `

  // Add to document
  document.body.appendChild(notification)

  // Remove after animation
  setTimeout(() => {
    notification.classList.add("show")
    setTimeout(() => {
      notification.classList.remove("show")
      setTimeout(() => notification.remove(), 500)
    }, 3000)
  }, 100)
}

// Add styles for achievement notification
const notificationStyle = document.createElement("style")
notificationStyle.textContent = `
  .achievement-notification {
    position: fixed;
    bottom: -100px;
    right: 20px;
    background-color: var(--secondary);
    border: 2px solid var(--primary);
    border-radius: 8px;
    padding: 15px;
    display: flex;
    align-items: center;
    gap: 15px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    transition: transform 0.5s ease;
    transform: translateY(0);
  }
  
  .achievement-notification.show {
    transform: translateY(-120px);
  }
  
  .achievement-notification .achievement-icon {
    font-size: 24px;
  }
  
  .achievement-notification .achievement-title {
    font-weight: bold;
    color: var(--primary);
    margin-bottom: 5px;
  }
  
  .achievement-notification .achievement-name {
    color: var(--text);
  }
`
document.head.appendChild(notificationStyle)

// Create assets folder and logo
function createAssets() {
  const logoSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="logo">
    <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke="#00ffcc"/>
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" stroke="#00ffcc"/>
    <path d="M9 9h1" stroke="#00e676"/>
    <path d="M9 13h6" stroke="#00e676"/>
    <path d="M9 17h6" stroke="#00e676"/>
  </svg>
  `

  // Create assets directory if it doesn't exist
  try {
    Pear.fs.mkdirSync("assets", { recursive: true })
    Pear.fs.writeFileSync("assets/logo.svg", logoSvg)
  } catch (error) {
    console.error("Error creating assets:", error)
  }
}

// Initialize the app
createAssets()

