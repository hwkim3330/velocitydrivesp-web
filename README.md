# VelocityDRIVE SP Web Configuration Tool

A modern web-based configuration tool for Microchip VelocityDRIVE SP Automotive Ethernet switches using WebSerial API.

## 🚀 Features

- **WebSerial Communication**: Direct browser-to-device communication without server requirements
- **TSN Configuration**: Complete Time-Sensitive Networking configuration including CBS, TAS, and PTP
- **YANG Browser**: Interactive YANG model browser with real-time configuration editing
- **Real-time Monitoring**: Live network statistics and traffic visualization
- **Modern UI**: Clean, responsive Material Design interface
- **GitHub Pages Ready**: Static deployment with no backend dependencies

## 🌐 Live Demo

Visit the live application: **https://hwkim3330.github.io/velocitydrivesp-web/**

## 🔧 Technologies

- **Frontend**: Vanilla JavaScript ES6 modules, CSS3, HTML5
- **Communication**: WebSerial API, MUP1 Protocol, CORECONF/CoAP
- **Standards**: YANG models, IEEE TSN standards (802.1Qav, 802.1Qbv, 1588 PTP)
- **Visualization**: Chart.js for real-time traffic monitoring
- **UI Framework**: Material Design icons and principles

## 🚀 Quick Start

### Prerequisites

- Modern Chrome/Edge/Opera browser with WebSerial API support
- VelocityDRIVE SP device connected via USB serial

### Usage

1. Open the application in your browser
2. Click "Connect Serial" to establish connection with your device
3. Select the appropriate serial port (typically ttyACM0)
4. Navigate through different tabs to configure and monitor your device

### Browser Compatibility

| Browser | WebSerial Support | Status |
|---------|------------------|--------|
| Chrome 89+ | ✅ Full | Supported |
| Edge 89+ | ✅ Full | Supported |
| Opera 76+ | ✅ Full | Supported |
| Firefox | ❌ No | Not supported |
| Safari | ❌ No | Not supported |

## 📁 Project Structure

```
velocitydrivesp-web/
├── index.html              # Main application
├── css/
│   └── styles.css          # Application styles
├── js/
│   ├── app.js              # Main application controller
│   ├── serial-controller.js # WebSerial API wrapper
│   ├── mup1-protocol.js    # Microchip UART Protocol #1
│   ├── coreconf-client.js  # CORECONF/CoAP client
│   ├── yang-browser.js     # YANG model browser
│   ├── ui-controller.js    # UI management
│   └── monitoring-service.js # Real-time monitoring
└── README.md
```

## 🔗 Protocol Implementation

### MUP1 (Microchip UART Protocol #1)

Frame format: `>TYPE[DATA]<[<]CHECKSUM`

- Frame start: `>`
- Message type: Command identifier
- Data section: `[data]` (optional)
- Frame end: `<`
- Checksum: XOR of all frame bytes in hex

### CORECONF over CoAP

- Uses YANG models for device configuration
- CBOR encoding for efficient data transfer
- SID-based addressing for compact representation

## 🛠️ Development

### Local Development

1. Clone the repository
2. Serve the files using any HTTP server (e.g., `python -m http.server`)
3. Open `http://localhost:8000` in a supported browser

### Building for Production

The application is designed as a static web app - no build process required. Simply deploy the files to any web server or GitHub Pages.

## 🌟 Key Features Detail

### TSN Configuration

- **CBS (Credit-Based Shaper)**: Priority mapping with bandwidth allocation
- **TAS (Time-Aware Shaper)**: 8-queue scheduling with configurable cycle times
- **PTP (Precision Time Protocol)**: Master/slave/boundary clock configuration

### YANG Browser

- Interactive tree view of YANG models
- Real-time configuration editing
- Validation and error checking
- Export/import functionality

### Real-time Monitoring

- Live port statistics
- Traffic rate calculations
- Historical data visualization
- Performance metrics export

## 📊 Supported YANG Models

- `ietf-system`: System management
- `ietf-interfaces`: Interface configuration
- `ieee802-dot1q-sched`: TSN scheduling
- `ieee1588-ptp`: PTP configuration

## 🔒 Security

- All communication is client-side only
- No data sent to external servers
- WebSerial API provides secure device access
- Configuration validation before applying changes

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with actual hardware
5. Submit a pull request

## 📝 License

This project is open source and available under the MIT License.

## 🐛 Known Issues

- WebSerial API is not supported in Firefox or Safari
- Some advanced YANG features may not be fully implemented
- Device-specific extensions may require additional development

## 📞 Support

For issues and questions:
- Open an issue on GitHub
- Check browser compatibility
- Ensure device is properly connected

## 🔄 Version History

- **v1.0.0**: Initial release with basic functionality
- **v1.1.0**: Added TSN configuration support
- **v1.2.0**: YANG browser implementation
- **v1.3.0**: Real-time monitoring and visualization

---

**Made with ❤️ for the Automotive Ethernet community**
