# Ekya - Real-Time Collaborative Document Editor

Ekya is a decentralized, real-time collaborative document editor built using [Pear](https://github.com/holepunchto/pear) the P2P framework by Holepunch. It enables multiple users to edit documents simultaneously by sharing a document ID - no central servers required.

## Features
- **Real-time collaboration** using peer-to-peer networking
- **Decentralized architecture** with no single point of failure
- **Automatic synchronization** between all connected peers
- **Document version history** (coming soon)
- **Rich text formatting support** (coming soon)

## Installation

1. Clone the repository:
```sh
git clone https://github.com/FlareMozZ/Ekya.git
cd Ekya
```

2. Install dependencies:
```sh
npm install
```

Dependencies used are as follows:
"b4a": "^1.6.7",
"hypercore-crypto": "^3.5.0",
"hyperswarm": "^4.8.4",
"quill": "^2.0.3"

## Setup

Initialize Pear runtime:
```sh
npm i -g pear
```

```sh
pear
```
(Make sure to add the path to local environment variables.)


```sh
pear run pear://runtime
```
## Usage

Start the editor:
```sh
cd Ekya
pear run .
```

(Make sure you are in the correct directory and dependencies are properly installed.)

### Creating a New Document
1. Launch Ekya - it will show a "Create Document button", clicking it will automatically generate a new **Document ID**
2. Share this ID with collaborators

### Joining Existing Document
1. Keep first Ekya instance running
2. Open new terminal and start another instance:
```sh
pear run .
```
3. Enter the Document ID from the first instance when prompted
4. Both instances will sync automatically, i.e both peers are connected
5. Multiple peers can be connected in the same way!!

## Development Roadmap
- [ ] Add text formatting toolbar
- [ ] Implement document version history
- [ ] Add peer cursor presence indicators
- [ ] Support for multiple documents

## Contributing
Contributions welcome! This project is under active development. Open an issue first to discuss major changes.

## License
MIT