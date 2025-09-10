# VelocityDRIVE-SP Web Interface

Microchip VelocityDRIVE-SP (LAN9662) Web Control Interface with CoAP/CORECONF protocol implementation.

## Overview

This repository contains the extracted web interface from Microchip VelocityDRIVE CT-UI application (v2025.07.12). It provides browser-based control for the LAN9662 TSN switch via USB serial communication using the MUP1 (Microchip UART Protocol #1) protocol.

## Architecture

### Protocol Stack
```
Application Layer (Browser)
         ↓
    YANG/JSON
         ↓
  CoAP + CBOR (RFC 9254 CORECONF)
         ↓
   MUP1 Protocol
         ↓
  USB Serial (/dev/ttyACM0)
         ↓
  LAN9662 Board
```

### Key RFCs Implemented

#### CoAP Protocol
- **RFC 7252** - The Constrained Application Protocol (CoAP)
- **RFC 8132** - PATCH and FETCH Methods for CoAP (FETCH: 0.05, PATCH: 0.07, iPATCH: 0.08)
- **RFC 9177** - CoAP Content-Formats Registry (application/yang-data+cbor = 60)

#### CBOR/YANG Serialization
- **RFC 8949** - Concise Binary Object Representation (CBOR) - Major Types 0-7
- **RFC 8742** - YANG Schema Item iDentifier (SID) - Numeric ID mapping for YANG nodes
- **RFC 8070** - YANG-CBOR mapping rules

#### Management Protocol
- **RFC 9254** - CORECONF: YANG Data Model for Configuration Access over CoAP

## Protocol Flow

### Request Flow (Client → Board)
1. **YAML/JSON Input** - User provides configuration in human-readable format
2. **SID Mapping** - YANG paths converted to numeric SIDs for efficiency
3. **CBOR Encoding** - Data serialized to binary CBOR format
4. **CoAP Message** - CBOR payload wrapped in CoAP protocol
5. **MUP1 Framing** - CoAP encapsulated in MUP1 format: `>TYPE[DATA]<[<]CHECKSUM`
6. **USB Serial** - Transmitted over /dev/ttyACM0 at 115200 baud

### Response Flow (Board → Client)
1. **MUP1 Parsing** - Extract CoAP message from MUP1 frame
2. **CoAP Processing** - Parse CoAP response code and options
3. **CBOR Decoding** - Extract CBOR payload
4. **SID Resolution** - Convert numeric SIDs back to YANG paths
5. **JSON/YAML Output** - Present human-readable response

## MUP1 Protocol Details

Frame format: `>TYPE[DATA]<[<]CHECKSUM`

- **Start**: `>` (0x3E)
- **Type**: Single byte message type
  - `p` - Ping
  - `P` - Pong (response)
  - `c` - Enter CoAP mode
  - `C` - CoAP mode acknowledgment
  - `t` - Trace message
- **Data**: Variable length payload
- **End**: `<` (0x3C) or `<<` for extended
- **Checksum**: XOR of all bytes

## Directory Structure

```
/app                    - Electron main process
  /api                  - Electron API modules
  main.js              - Main application entry
  package.json         - Node dependencies
/wwwroot               - Angular web application
  /UserGuide           - Documentation
  /keys                - YANG SID mappings
  /downloads           - Downloadable resources
    /coreconf          - YANG modules and SID files
  index.html           - Main web interface
  *.js, *.css          - Application assets
```

## Hardware Requirements

- Microchip LAN9662 VelocityDRIVE board
- USB connection for serial communication
- Network interfaces for TSN testing

## Serial Configuration

- Port: `/dev/ttyACM0` (Linux) or equivalent
- Baud rate: 115200
- Data bits: 8
- Stop bits: 1
- Parity: None
- Flow control: None

## Supported YANG Modules

The application includes complete SID mappings for 40+ YANG modules including:
- IETF standards (interfaces, system, routing, IP, hardware)
- IEEE standards (802.1Q bridge, PTP, LLDP, TSN extensions)
- Microchip proprietary (velocitysp-system, vcap, port extensions)

## Technologies

- **Frontend**: Angular, TypeScript
- **Backend**: Electron, Node.js, Socket.IO
- **Protocols**: CoAP, CBOR, MUP1
- **Standards**: IEEE 802.1 TSN, YANG/NETCONF/CORECONF

## License

See License.txt for details.

## Version

Application Version: 2025.07.12
