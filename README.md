# 🚀 VelocityDRIVE-SP Web Control Interface

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Web Serial API](https://img.shields.io/badge/Web%20Serial%20API-Required-orange)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![Chrome 89+](https://img.shields.io/badge/Chrome-89%2B-green)](https://www.google.com/chrome/)
[![Edge 89+](https://img.shields.io/badge/Edge-89%2B-green)](https://www.microsoft.com/edge)

A modern web-based control interface for the Microchip LAN9662 VelocityDRIVE-SP platform using CORECONF/CoAP over MUP1 protocol.

## ✨ Features

- **Pure Web Implementation**: No server or backend required
- **Web Serial API**: Direct USB serial communication from browser
- **Complete Protocol Stack**: MUP1/CoAP/CBOR/CORECONF implementation
- **YANG Data Models**: Full SID mapping for all modules
- **Real-time Monitoring**: Live communication logs and packet analysis
- **Configuration Management**: Read/Write device settings via YANG models
- **GitHub Pages Ready**: Single HTML file, instantly deployable

## 🚀 Quick Start

### Option 1: Use GitHub Pages (Recommended)
Visit: https://hwkim3330.github.io/velocitydrivesp-web/

### Option 2: Local Hosting
```bash
git clone https://github.com/hwkim3330/velocitydrivesp-web.git
cd velocitydrivesp-web
python3 -m http.server 8080
# Open http://localhost:8080 in Chrome/Edge
```

### Option 3: Direct File
Simply open `index.html` in Chrome or Edge browser.

## 📋 Requirements

- **Browser**: Chrome 89+ or Edge 89+ (Web Serial API support)
- **Device**: Microchip LAN9662 VelocityDRIVE-SP board
- **Connection**: USB CDC (appears as /dev/ttyACM0 on Linux)

## 🔧 Usage

### Connecting to Device
1. Open the interface in Chrome/Edge
2. Click "Connect Device"
3. Select the Microchip device from the serial port list
4. Device information will appear after successful ping

### Reading Configuration
1. Select a YANG path from the sidebar tree
2. Go to "Configuration" tab
3. Click "Get Configuration"
4. Current values will be displayed in JSON format

### Writing Configuration
1. Select a YANG path from the sidebar tree
2. Enter new values in JSON format
3. Click "Set Configuration"
4. Changes are applied immediately to device

### Raw CoAP Messages
1. Go to "Raw CoAP" tab
2. Select method (GET/PUT/POST/DELETE)
3. Enter URI path (e.g., `/coreconf/data`)
4. Optionally add CBOR payload in hex format
5. Click "Send CoAP Message"

## 🏗️ Architecture

```
┌─────────────────────────────┐
│     Web UI (HTML/CSS)       │
├─────────────────────────────┤
│   JavaScript Application    │
│  ├── MUP1 Protocol Handler  │
│  ├── CoAP Message Builder   │
│  ├── CBOR Encoder/Decoder   │
│  ├── YANG SID Mapper        │
│  └── Web Serial API         │
├─────────────────────────────┤
│      Browser APIs           │
└─────────────────────────────┘
         ↓ USB Serial
┌─────────────────────────────┐
│   LAN9662 VelocityDRIVE-SP  │
│  ├── MUP1 Framing           │
│  ├── CoAP Server            │
│  ├── CORECONF Handler       │
│  └── YANG Datastore         │
└─────────────────────────────┘
```

## 📡 Protocol Stack

### MUP1 (Microchip UART Protocol #1)
- Frame format: `>TYPE[DATA]<<CHECKSUM\r\n`
- Supported messages:
  - Ping: `>p<<8553`
  - CoAP: `>c` (followed by binary CoAP data)
  - Trace: `>t[payload]<<checksum`

### CoAP (RFC 7252)
- Methods: GET, POST, PUT, DELETE
- Content-Format: `application/yang-data+cbor`
- Options: Uri-Path, Content-Format

### CBOR (RFC 8949)
- Full Major Types 0-7 support
- Optimized for YANG data encoding

### CORECONF (RFC 9254)
- YANG-based configuration management
- SID (Schema Item Identifier) mapping
- 1737+ pre-loaded SID mappings

## 📊 Supported YANG Modules

- **ietf-interfaces**: Network interface management
- **ietf-system**: System configuration
- **ieee1588-ptp**: Precision Time Protocol
- **ieee802-dot1q-bridge**: Bridge configuration
- **mchp-velocitysp-system**: Microchip specific settings
- And 40+ more modules with complete SID mappings

## 🔍 Troubleshooting

### "Web Serial API not supported"
- Use Chrome 89+ or Edge 89+
- Firefox and Safari do not support Web Serial API

### "Failed to connect"
- Ensure device is connected via USB
- Check device appears as serial port (e.g., /dev/ttyACM0)
- Try disconnecting other serial terminal programs

### "No response from device"
- Verify baud rate is 115200
- Check MUP1 protocol is enabled on device
- Try sending a ping command first

## 📚 Technical Documentation

See [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md) for detailed protocol analysis and implementation notes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Microchip Technology Inc. for VelocityDRIVE-SP platform
- IETF for CoAP, CBOR, and CORECONF standards
- Web Serial API contributors

## 📞 Support

For issues and questions:
- GitHub Issues: [https://github.com/hwkim3330/velocitydrivesp-web/issues](https://github.com/hwkim3330/velocitydrivesp-web/issues)

---

*Developed with ❤️ for the embedded systems community*