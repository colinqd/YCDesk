# YCDesk Linux Version

YCDesk Linux - Remote Desktop Control Application for Linux

## Features

- Remote desktop control
- Signaling server mode support
- Direct connection mode support
- WebRTC based video streaming
- Cross-platform compatibility

## Requirements

- Linux (Ubuntu 18.04+, Debian 10+, Fedora 30+, or compatible)
- Node.js 18+
- npm or yarn

## Dependencies

For input control functionality, install:

```bash
# Ubuntu/Debian
sudo apt-get install libxtst-dev libpng-dev

# Fedora
sudo dnf install libXtst-devel libpng-devel
```

## Installation

```bash
cd linux
npm install
```

## Development

```bash
npm start
```

## Build

```bash
# Build all formats
npm run build

# Build DEB package (Ubuntu/Debian)
npm run build:deb

# Build RPM package (Fedora/CentOS)
npm run build:rpm

# Build AppImage
npm run build:appimage

# Build tar.gz
npm run build:tar.gz
```

## Signaling Server

```bash
cd server
npm install
node server.js
```

The signaling server will run on `http://localhost:3000` by default.

## Usage

1. Start the signaling server
2. Run YCDesk on both devices
3. Connect to the same signaling server
4. Enter the target device ID to establish connection

## License

MIT
