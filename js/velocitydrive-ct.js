// VelocityDRIVE CT Protocol Implementation
// Based on exact CT CLI log analysis

class VelocityDriveCT {
    constructor() {
        this.serial = null;
        this.isConnected = false;
        this.messageId = 1;
        this.deviceInfo = null;
        this.catalogChecksum = null;
        this.receivedData = new Map();
    }

    async connect(serialPort) {
        this.serial = serialPort;
        this.isConnected = true;
        
        // Start with ping
        await this.sendPing();
    }

    async sendPing() {
        console.log('Sending ping...');
        // Exact format from CT: >p<<8553
        const pingData = '>p<<8553\n';
        await this.sendRaw(pingData);
    }

    async sendRaw(data) {
        if (!this.serial) throw new Error('Not connected');
        
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        await this.serial.writeBytes(bytes);
        console.log('Sent:', data.trim());
    }

    handlePongResponse(data) {
        // Parse: >PVelocitySP-v2025.06-LAN9662-ung8291 14000 300 2<737f
        const match = data.match(/>P(.+?)</);
        if (match) {
            const pongData = match[1];
            const parts = pongData.split(' ');
            
            this.deviceInfo = {
                version: parts[0],
                uptime: parseInt(parts[1]) || 0,
                maxSize: parseInt(parts[2]) || 300,
                mup1Version: parseInt(parts[3]) || 2
            };
            
            console.log('Device info:', this.deviceInfo);
            
            // After pong, request catalog checksum
            setTimeout(() => this.requestCatalog(), 100);
        }
    }

    async requestCatalog() {
        console.log('Requesting catalog checksum...');
        
        // From CT log: First CoAP request
        // Send | CoAP | CON [MID=1], 0.05 (FETCH), c?d=a
        // Binary: 81 19 72 78
        // Send | MUP1 | c
        // Binary: 40 05 00 01 B1 63 11 8D 33 64 3D 61 21 8E FF 81 19 72 78
        
        const coapBytes = new Uint8Array([
            0x40, 0x05, 0x00, 0x01, // CoAP header: CON, FETCH (0.05), MID=1
            0xB1, 0x63,             // Option: URI-Path = "c"
            0x11, 0x8D,             // Option: Content-Format = 141
            0x33, 0x64, 0x3D, 0x61, // Option: URI-Query = "d=a"
            0x21, 0x8E,             // Option: Accept = 142
            0xFF,                   // Payload marker
            0x81, 0x19, 0x72, 0x78  // Payload: catalog checksum request
        ]);
        
        await this.sendMUP1CoAP(coapBytes);
    }

    async requestPlatform() {
        console.log('Requesting platform info...');
        
        // From CT log: Second CoAP request
        // Send | CoAP | CON [MID=2], 0.05 (FETCH), c?d=a, 2:0/0/256
        // Binary: 19 4A 51
        // Send | MUP1 | c
        // Binary: 40 05 00 02 B1 63 11 8D 33 64 3D 61 21 8E 61 04 FF 19 4A 51
        
        const messageId = this.messageId++;
        const coapBytes = new Uint8Array([
            0x40, 0x05,             // CoAP: CON, FETCH (0.05)
            (messageId >> 8) & 0xFF, messageId & 0xFF, // Message ID
            0xB1, 0x63,             // Option: URI-Path = "c"
            0x11, 0x8D,             // Option: Content-Format = 141
            0x33, 0x64, 0x3D, 0x61, // Option: URI-Query = "d=a"
            0x21, 0x8E,             // Option: Accept = 142
            0x61, 0x04,             // Option: Block2 = 2:0/0/256
            0xFF,                   // Payload marker
            0x19, 0x4A, 0x51        // Payload: platform SID (19025)
        ]);
        
        await this.sendMUP1CoAP(coapBytes);
    }

    async sendMUP1CoAP(coapBytes) {
        // MUP1 'c' frame format: just wrap the binary CoAP
        // The MUP1 frame is handled at a lower level
        // We send the CoAP binary directly as the 'c' command data
        
        // Build MUP1 frame: >c[binary]<checksum
        const frame = this.buildMUP1CFrame(coapBytes);
        await this.serial.writeBytes(frame);
        
        console.log('Sent CoAP:', Array.from(coapBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }

    buildMUP1CFrame(coapData) {
        // Build MUP1 'c' frame
        // Format from actual logs: the 'c' command contains raw binary CoAP
        // The device expects: >c[COAP_BINARY]<CHECKSUM\n
        
        const result = [];
        
        // Start marker
        result.push(0x3E); // '>'
        result.push(0x63); // 'c'
        result.push(0x5B); // '['
        
        // Add CoAP binary data
        for (let i = 0; i < coapData.length; i++) {
            result.push(coapData[i]);
        }
        
        // End marker
        result.push(0x5D); // ']'
        result.push(0x3C); // '<'
        
        // Calculate checksum
        let sum = 0;
        for (let i = 0; i < result.length; i++) {
            sum += result[i];
        }
        
        // Add '<' to checksum calculation
        sum += 0x3C; // second '<'
        
        // 16-bit one's complement
        while (sum >> 16) {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        sum = ~sum & 0xFFFF;
        
        // Add checksum as hex string
        const checksumStr = sum.toString(16).toUpperCase().padStart(4, '0');
        result.push(0x3C); // second '<'
        
        // Add checksum characters
        for (let i = 0; i < checksumStr.length; i++) {
            result.push(checksumStr.charCodeAt(i));
        }
        
        // Add newline
        result.push(0x0A); // '\n'
        
        return new Uint8Array(result);
    }

    handleCoAPResponse(data) {
        // Parse CoAP response from MUP1 'C' frame
        console.log('CoAP response received');
        
        // Extract CBOR payload and decode
        // Response format: >C[COAP_RESPONSE]<CHECKSUM
        // The COAP_RESPONSE contains CBOR data after the CoAP headers
        
        try {
            // Find the CBOR data (starts with 0xBF for indefinite map)
            const bfIndex = data.indexOf(0xBF);
            if (bfIndex >= 0) {
                const cbor = data.slice(bfIndex);
                const decoded = this.decodeCBOR(cbor);
                console.log('Decoded CBOR:', decoded);
                
                // Handle different response types
                if (decoded[0x7278]) {
                    // Catalog checksum response
                    this.catalogChecksum = decoded[0x7278];
                    console.log('Catalog checksum:', this.catalogChecksum);
                    
                    // After catalog, request platform
                    setTimeout(() => this.requestPlatform(), 100);
                } else if (decoded[0x4A51]) {
                    // Platform response
                    console.log('Platform info:', decoded[0x4A51]);
                    this.receivedData.set('platform', decoded[0x4A51]);
                } else if (decoded[0x4A50]) {
                    // Other system data
                    console.log('System data:', decoded);
                    this.receivedData.set('system', decoded);
                }
                
                return decoded;
            }
        } catch (error) {
            console.error('Failed to parse CoAP response:', error);
        }
        
        return null;
    }

    decodeCBOR(data) {
        // Basic CBOR decoder for common types
        const result = {};
        let pos = 0;
        
        while (pos < data.length) {
            const byte = data[pos];
            
            if (byte === 0xFF) {
                // End of indefinite map
                pos++;
                break;
            } else if (byte === 0xBF) {
                // Start of indefinite map
                pos++;
                continue;
            }
            
            // Decode key (usually a SID)
            const majorType = (byte >> 5) & 0x07;
            const additionalInfo = byte & 0x1F;
            
            let key;
            if (majorType === 0) { // Unsigned integer
                if (additionalInfo < 24) {
                    key = additionalInfo;
                    pos++;
                } else if (additionalInfo === 24) {
                    key = data[pos + 1];
                    pos += 2;
                } else if (additionalInfo === 25) {
                    key = (data[pos + 1] << 8) | data[pos + 2];
                    pos += 3;
                }
            }
            
            // Decode value
            const valueByte = data[pos];
            const valueMajor = (valueByte >> 5) & 0x07;
            const valueInfo = valueByte & 0x1F;
            
            if (valueMajor === 3) { // Text string
                let length;
                if (valueInfo < 24) {
                    length = valueInfo;
                    pos++;
                } else if (valueInfo === 24) {
                    length = data[pos + 1];
                    pos += 2;
                }
                
                const textBytes = data.slice(pos, pos + length);
                const text = new TextDecoder().decode(textBytes);
                result[key] = text;
                pos += length;
            } else if (valueMajor === 2) { // Byte string
                let length;
                if (valueInfo < 24) {
                    length = valueInfo;
                    pos++;
                } else if (valueInfo === 24) {
                    length = data[pos + 1];
                    pos += 2;
                }
                
                result[key] = data.slice(pos, pos + length);
                pos += length;
            } else {
                // Skip unknown types
                pos++;
            }
        }
        
        return result;
    }

    async fetchYANGData(path) {
        // Convert YANG path to SID and fetch
        const sid = this.pathToSID(path);
        if (!sid) {
            console.error('Unknown YANG path:', path);
            return null;
        }
        
        const messageId = this.messageId++;
        
        // Build CoAP FETCH request
        const sidBytes = this.encodeSID(sid);
        const coapBytes = new Uint8Array([
            0x40, 0x05,             // CoAP: CON, FETCH
            (messageId >> 8) & 0xFF, messageId & 0xFF,
            0xB1, 0x63,             // URI-Path: "c"
            0x11, 0x8D,             // Content-Format: 141
            0x33, 0x64, 0x3D, 0x61, // URI-Query: "d=a"
            0x21, 0x8E,             // Accept: 142
            0x61, 0x04,             // Block2: 2:0/0/256
            0xFF,                   // Payload marker
            ...sidBytes            // SID as payload
        ]);
        
        await this.sendMUP1CoAP(coapBytes);
        
        // Return promise that resolves when response is received
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout'));
            }, 5000);
            
            // Store resolver for when response arrives
            this.pendingRequests = this.pendingRequests || new Map();
            this.pendingRequests.set(sid, { resolve, reject, timeout });
        });
    }

    encodeSID(sid) {
        // CBOR encode SID as unsigned integer
        if (sid < 24) {
            return [sid];
        } else if (sid < 256) {
            return [0x18, sid];
        } else if (sid < 65536) {
            return [0x19, (sid >> 8) & 0xFF, sid & 0xFF];
        } else {
            return [0x1A, (sid >> 24) & 0xFF, (sid >> 16) & 0xFF, (sid >> 8) & 0xFF, sid & 0xFF];
        }
    }

    pathToSID(path) {
        // Map YANG paths to SIDs based on CT analysis
        const pathMap = {
            '/ietf-system:system-state/platform': 0x4A51,
            '/ietf-system:system/hostname': 0x4A4F,
            '/ietf-system:system/location': 0x4A50,
            '/ietf-system:system/contact': 0x4A4E,
            '/ietf-interfaces:interfaces': 0x03E8,
            '/ieee802-dot1q-bridge:bridges': 0x4E20,
            '/ieee802-dot1ab-lldp:lldp': 0x5208,
            '/ieee1588-ptp:ptp': 0x55F0,
            '/ieee802-dot1q-sched:scheduling': 0x59D8,
            '/ieee802-dot1q-psfp:psfp': 0x5DC0,
            '/ieee802-dot1cb-stream-identification:stream-identity-table': 0x61A8
        };
        
        return pathMap[path] || null;
    }
}

// Export for use
window.VelocityDriveCT = VelocityDriveCT;