// YANG Path to SID mappings based on CT program analysis
const YANG_PATHS = {
    // System paths (from CT log: 19 4A 51 = 0x4A51 = 19025)
    '/ietf-system:system-state/platform': 0x4A51,  // 19025 (confirmed from CT)
    '/ietf-system:system/hostname': 19023,
    '/ietf-system:system/location': 19024,  
    '/ietf-system:system/contact': 19022,
    '/ietf-system:system-state/clock/current-datetime': 19051,
    
    // Interface paths
    '/ietf-interfaces:interfaces': 1000,
    '/ietf-interfaces:interfaces/interface': 1001,
    '/ietf-interfaces:interfaces-state': 1020,
    
    // Bridge paths (from ieee802-dot1q-bridge)
    '/ieee802-dot1q-bridge:bridges': 20000,
    '/ieee802-dot1q-bridge:bridges/bridge': 20001,
    '/ieee802-dot1q-bridge:bridges/bridge/component': 20010,
    '/ieee802-dot1q-bridge:bridges/bridge/component/filtering-database': 20020,
    
    // LLDP paths (from ieee802-dot1ab-lldp)
    '/ieee802-dot1ab-lldp:lldp': 21000,
    '/ieee802-dot1ab-lldp:lldp/local-system-data': 21010,
    '/ieee802-dot1ab-lldp:lldp/remote-systems-data': 21020,
    
    // PTP paths (from ieee1588-ptp)
    '/ieee1588-ptp:ptp': 22000,
    '/ieee1588-ptp:ptp/instance-list': 22010,
    
    // Scheduling paths (from ieee802-dot1q-sched)
    '/ieee802-dot1q-sched:scheduling': 23000,
    '/ieee802-dot1q-sched:max-sdu-table': 23010,
    '/ieee802-dot1q-sched:gate-parameters': 23020,
    
    // PSFP paths (from ieee802-dot1q-psfp)
    '/ieee802-dot1q-psfp:psfp': 24000,
    '/ieee802-dot1q-psfp:stream-filters': 24010,
    '/ieee802-dot1q-psfp:stream-gates': 24020,
    '/ieee802-dot1q-psfp:flow-meters': 24030,
    
    // Stream ID paths (from ieee802-dot1cb-stream-identification)
    '/ieee802-dot1cb-stream-identification:stream-identity-table': 25000,
    '/ieee802-dot1cb-stream-identification:stream-identity': 25001,
    
    // Microchip custom paths (from mchp-velocitysp-bridge)
    '/mchp-velocitysp-bridge:fdb-flush': 30001,
    '/mchp-velocitysp-bridge:fdb-learning-disable': 30007,
    '/mchp-velocitysp-bridge:fdb-learning-limit': 30008
};

// Main Application Controller
class VelocityDriveApp {
    constructor() {
        this.serial = null;
        this.mup1 = null;
        this.isConnected = false;
        this.deviceInfo = null;
        
        // Initialize UI
        this.initializeUI();
    }

    initializeUI() {
        // Set up event listeners
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.toggleConnection());
        }

        // Check WebSerial support
        if (!('serial' in navigator)) {
            this.showError('WebSerial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
            if (connectBtn) connectBtn.disabled = true;
        }

        // Initialize tabs
        this.initializeTabs();
        
        // Initialize YANG module selector
        this.populateYANGModules();
        
        // Initialize action buttons
        this.initializeActionButtons();
    }
    
    populateYANGModules() {
        const selector = document.getElementById('yangModule');
        if (selector) {
            const modules = [
                'ietf-system',
                'ietf-interfaces', 
                'ieee802-dot1q-bridge',
                'ieee802-dot1ab-lldp',
                'ieee1588-ptp',
                'ieee802-dot1q-sched',
                'ieee802-dot1q-psfp',
                'ieee802-dot1cb-stream-identification',
                'mchp-velocitysp-bridge'
            ];
            
            modules.forEach(module => {
                const option = document.createElement('option');
                option.value = module;
                option.textContent = module;
                selector.appendChild(option);
            });
        }
    }
    
    initializeActionButtons() {
        // System tab buttons
        const refreshSystemBtn = document.getElementById('refreshSystemBtn');
        if (refreshSystemBtn) {
            refreshSystemBtn.addEventListener('click', () => this.refreshSystemInfo());
        }
        
        // Interface tab buttons
        const refreshInterfacesBtn = document.getElementById('refreshInterfacesBtn');
        if (refreshInterfacesBtn) {
            refreshInterfacesBtn.addEventListener('click', () => this.refreshInterfaces());
        }
        
        // TSN configuration buttons
        const applyCBSBtn = document.getElementById('applyCBSBtn');
        if (applyCBSBtn) {
            applyCBSBtn.addEventListener('click', () => this.applyCBS());
        }
        
        const applyTASBtn = document.getElementById('applyTASBtn');
        if (applyTASBtn) {
            applyTASBtn.addEventListener('click', () => this.applyTAS());
        }
        
        const applyPTPBtn = document.getElementById('applyPTPBtn');
        if (applyPTPBtn) {
            applyPTPBtn.addEventListener('click', () => this.applyPTP());
        }
    }

    initializeTabs() {
        document.querySelectorAll('.nav-item').forEach(button => {
            button.addEventListener('click', (e) => {
                const btn = e.target.closest('.nav-item');
                if (btn) {
                    const tabId = btn.dataset.tab;
                    this.switchTab(tabId);
                }
            });
        });
    }

    switchTab(tabId) {
        // Update active nav button
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        // Update active content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId + '-tab');
        });
    }

    async toggleConnection() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        try {
            this.showStatus('Connecting...', 'info');
            
            // Create serial controller
            this.serial = new RobustSerialController();
            
            // Override handleData method
            this.serial.handleData = (data) => this.handleSerialData(data);
            
            // Try to connect
            const connected = await this.serial.connect(115200);
            
            if (connected) {
                this.isConnected = true;
                // Initialize protocols
                this.mup1 = new window.MUP1Protocol();
                this.coap = new window.CoAPProtocol();
                
                // Update UI
                document.getElementById('connectBtn').textContent = 'Disconnect';
                document.getElementById('connectBtn').classList.add('connected');
                this.showStatus('Connected', 'success');
                
                // Get device info
                await this.getDeviceInfo();
            } else {
                throw new Error('Failed to establish connection');
            }
        } catch (error) {
            console.error('Connection failed:', error);
            this.showError(`Connection failed: ${error.message}`);
            
            // Clean up
            if (this.serial) {
                await this.serial.disconnect();
                this.serial = null;
            }
        }
    }

    async disconnect() {
        try {
            if (this.serial) {
                await this.serial.disconnect();
                this.serial = null;
            }
            
            this.isConnected = false;
            this.mup1 = null;
            this.deviceInfo = null;
            
            // Update UI
            document.getElementById('connectBtn').textContent = 'Connect';
            document.getElementById('connectBtn').classList.remove('connected');
            this.showStatus('Disconnected', 'info');
            
            // Clear device info
            this.clearDeviceInfo();
        } catch (error) {
            console.error('Disconnect error:', error);
            this.showError(`Disconnect failed: ${error.message}`);
        }
    }

    handleSerialData(data) {
        console.log('Serial data:', data);
        
        // Accumulate data and process MUP1 frames
        if (this.mup1) {
            // Add to MUP1 buffer
            if (!this.mup1.buffer) {
                this.mup1.buffer = '';
            }
            this.mup1.buffer += data;
            
            // Look for complete frames (ending with newline)
            let frameEnd = this.mup1.buffer.indexOf('\n');
            while (frameEnd !== -1) {
                const frameStr = this.mup1.buffer.substring(0, frameEnd);
                this.mup1.buffer = this.mup1.buffer.substring(frameEnd + 1);
                
                // Process complete frame
                if (frameStr.startsWith('>') && frameStr.includes('<')) {
                    const frame = this.parseMUP1Frame(frameStr);
                    if (frame) {
                        this.handleMUP1Frame(frame);
                    }
                }
                
                frameEnd = this.mup1.buffer.indexOf('\n');
            }
        }
    }
    
    parseMUP1Frame(frameStr) {
        try {
            // Extract frame type and data
            const typeChar = frameStr[1];
            const dataStart = frameStr.indexOf('[');
            const dataEnd = frameStr.indexOf(']');
            const checksumStart = frameStr.lastIndexOf('<');
            
            let data = '';
            if (dataStart > 0 && dataEnd > dataStart) {
                data = frameStr.substring(dataStart + 1, dataEnd);
            } else if (checksumStart > 2) {
                // No brackets, data is between type and checksum marker
                data = frameStr.substring(2, checksumStart);
            }
            
            return {
                type: typeChar,
                data: data,
                raw: frameStr
            };
        } catch (error) {
            console.error('Failed to parse MUP1 frame:', error, frameStr);
            return null;
        }
    }
    
    parseMUP1BinaryData(data) {
        // Parse MUP1 binary data (may contain escaped bytes)
        const bytes = [];
        let i = 0;
        
        while (i < data.length) {
            if (data[i] === '\\' && i + 1 < data.length) {
                if (data[i + 1] === 'x' && i + 3 < data.length) {
                    // Hex escape: \xHH
                    const hex = data.substring(i + 2, i + 4);
                    bytes.push(parseInt(hex, 16));
                    i += 4;
                } else {
                    // Character escape: \c
                    const char = data[i + 1];
                    bytes.push(char.charCodeAt(0));
                    i += 2;
                }
            } else {
                // Regular character
                bytes.push(data.charCodeAt(i));
                i++;
            }
        }
        
        return new Uint8Array(bytes);
    }

    handleMUP1Frame(frame) {
        console.log('MUP1 Frame:', frame);
        
        // Handle different frame types (based on CT analysis)
        switch (frame.type) {
            case 'P': // Pong response
                // Format: VelocitySP-v2025.06-LAN9662-ung8291 24913 300 2
                const parts = frame.data.split(' ');
                const pongInfo = {
                    version: parts[0] || 'Unknown',
                    uptime: parseInt(parts[1]) || 0,
                    maxSize: parseInt(parts[2]) || 300,
                    mup1Version: parseInt(parts[3]) || 2
                };
                console.log('PONG received:', pongInfo);
                this.updateSystemInfo({
                    status: 'Connected',
                    version: pongInfo.version,
                    uptime: `${pongInfo.uptime} seconds`,
                    maxDataSize: `${pongInfo.maxSize} bytes`,
                    mup1Version: `v${pongInfo.mup1Version}`
                });
                
                // Update connection status
                const statusIndicator = document.getElementById('statusIndicator');
                if (statusIndicator) {
                    statusIndicator.querySelector('.status-text').textContent = 'Connected';
                    statusIndicator.classList.add('connected');
                }
                break;
            case 'C': // CoAP response
                // CoAP data is binary in the frame
                // Need to convert the escaped data back to binary
                const coapBytes = this.parseMUP1BinaryData(frame.data);
                this.handleCoAPResponse(coapBytes);
                break;
            case 'A': // Announce
                console.log('Device announced:', frame.data);
                break;
            case 'T': // Trace
                console.log('Trace:', frame.data);
                break;
            default:
                console.log('Unknown frame type:', frame.type);
        }
    }
    
    handleCoAPResponse(data) {
        try {
            // Parse raw CoAP data from MUP1 'C' frame
            // Data is already binary from the MUP1 frame
            const bytes = typeof data === 'string' ? 
                new TextEncoder().encode(data) : 
                new Uint8Array(data);
            
            if (bytes.length < 4) {
                console.error('CoAP response too short');
                return;
            }
            
            // Parse CoAP header
            const version = (bytes[0] >> 6) & 0x03;
            const type = (bytes[0] >> 4) & 0x03;
            const tokenLength = bytes[0] & 0x0F;
            const code = bytes[1];
            const messageId = (bytes[2] << 8) | bytes[3];
            
            console.log('CoAP Response: Type:', type, 'Code:', code.toString(16), 'MID:', messageId);
            
            // Find payload (after 0xFF marker)
            let payloadStart = -1;
            for (let i = 4; i < bytes.length; i++) {
                if (bytes[i] === 0xFF) {
                    payloadStart = i + 1;
                    break;
                }
            }
            
            if (payloadStart > 0 && payloadStart < bytes.length) {
                const payload = bytes.slice(payloadStart);
                console.log('CBOR payload:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
                
                // Parse CBOR payload
                const decoded = this.decodeCBOR(payload);
                console.log('Decoded YANG data:', decoded);
                
                // Update UI with received data
                this.updateUIWithYANGData(decoded);
            }
        } catch (error) {
            console.error('CoAP parse error:', error);
        }
    }
    
    decodeCBOR(data) {
        // Simple CBOR decoder for common types
        if (!data || data.length === 0) return null;
        
        const majorType = (data[0] >> 5) & 0x07;
        const additionalInfo = data[0] & 0x1F;
        
        switch (majorType) {
            case 0: // Unsigned integer
                if (additionalInfo < 24) return additionalInfo;
                if (additionalInfo === 24) return data[1];
                if (additionalInfo === 25) return (data[1] << 8) | data[2];
                break;
            case 3: // Text string
                let length = additionalInfo;
                let offset = 1;
                if (additionalInfo === 24) {
                    length = data[1];
                    offset = 2;
                }
                return new TextDecoder().decode(data.slice(offset, offset + length));
            case 5: // Map
                // Parse indefinite map (0xBF)
                if (data[0] === 0xBF) {
                    const result = {};
                    let pos = 1;
                    while (pos < data.length && data[pos] !== 0xFF) {
                        // Parse key (usually SID)
                        const key = this.decodeCBOR(data.slice(pos));
                        pos += this.getCBORLength(data.slice(pos));
                        
                        // Parse value
                        const value = this.decodeCBOR(data.slice(pos));
                        pos += this.getCBORLength(data.slice(pos));
                        
                        result[key] = value;
                    }
                    return result;
                }
                break;
            case 7: // Simple values
                if (additionalInfo === 20) return false;
                if (additionalInfo === 21) return true;
                if (additionalInfo === 22) return null;
                break;
        }
        
        return data; // Return raw data if can't decode
    }
    
    getCBORLength(data) {
        const majorType = (data[0] >> 5) & 0x07;
        const additionalInfo = data[0] & 0x1F;
        
        let headerLength = 1;
        let dataLength = 0;
        
        if (additionalInfo < 24) {
            dataLength = additionalInfo;
        } else if (additionalInfo === 24) {
            headerLength = 2;
            dataLength = data[1];
        } else if (additionalInfo === 25) {
            headerLength = 3;
            dataLength = (data[1] << 8) | data[2];
        }
        
        if (majorType === 3 || majorType === 2) { // Text or byte string
            return headerLength + dataLength;
        }
        
        return headerLength;
    }
    
    updateUIWithYANGData(data) {
        // Update UI based on received YANG data
        if (data && typeof data === 'object') {
            // Check for platform data (SID 19050)
            if (data[19050]) {
                document.getElementById('platform').textContent = data[19050];
            }
            // Check for hostname (SID 19023)
            if (data[19023]) {
                document.getElementById('hostname').textContent = data[19023];
            }
            // Add more mappings as needed
        }
    }

    handleResponse(data) {
        // Update UI with response data
        if (this.currentCommand === 'system-info') {
            this.updateSystemInfo(data);
        }
    }

    handleError(data) {
        this.showError(`Device error: ${data}`);
    }

    handleInfo(data) {
        this.showStatus(`Device: ${data}`, 'info');
    }

    async getDeviceInfo() {
        try {
            this.currentCommand = 'system-info';
            
            // Send MUP1 ping
            if (this.mup1 && this.serial) {
                const pingFrame = this.mup1.buildFrame('p');
                console.log('Sending ping:', new TextDecoder().decode(pingFrame));
                await this.serial.write(new TextDecoder().decode(pingFrame));
            }
            
            // Get system information via CoAP (don't send duplicate requests)
            // await this.getYANGData('/ietf-system:system-state/platform');
            
            // Fallback
            setTimeout(() => {
                if (this.isConnected && !this.deviceInfo) {
                    this.updateSystemInfo({
                        status: 'Connected',
                        port: 'Serial Port',
                        baudRate: '115200'
                    });
                }
            }, 2000);
        } catch (error) {
            console.error('Failed to get device info:', error);
        }
    }
    
    async getYANGData(path) {
        if (!this.isConnected || !this.mup1 || !this.coap || !this.serial) {
            console.error('Not connected');
            return;
        }
        
        try {
            const sid = YANG_PATHS[path] || path; // Allow direct SID if path not found
            
            // Build CoAP FETCH request exactly like CT
            // Format: 40 05 00 03 B1 63 11 8D 33 64 3D 61 21 8E 61 04 FF [CBOR]
            const messageId = this.coap.getNextMessageId();
            
            // Build CoAP header
            const header = new Uint8Array([
                0x40, // Ver=1, Type=CON(0), TKL=0
                0x05, // Code=FETCH (0.05)
                (messageId >> 8) & 0xFF,
                messageId & 0xFF
            ]);
            
            // Build options (from CT: B1 63 11 8D 33 64 3D 61 21 8E 61 04)
            const options = new Uint8Array([
                0xB1, 0x63, // URI-Path: "c"
                0x11, 0x8D, // Content-Format: 141 (yang-identifiers+cbor-seq)
                0x33, 0x64, 0x3D, 0x61, // URI-Query: "d=a"
                0x21, 0x8E, // Accept: 142 (yang-instances+cbor-seq)
                0x61, 0x04  // Block2: 2:0/0/256
            ]);
            
            // Build CBOR payload (just the SID)
            const payload = this.encodeSID(sid);
            
            // Combine all parts
            const coapMessage = new Uint8Array([
                ...header,
                ...options,
                0xFF, // Payload marker
                ...payload
            ]);
            
            // Wrap in MUP1 'c' frame
            const mup1Frame = this.buildMUP1CoAPFrame(coapMessage);
            
            console.log('Sending CoAP FETCH for', path, 'SID:', sid);
            console.log('CoAP bytes:', Array.from(coapMessage).map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            await this.serial.write(mup1Frame);
        } catch (error) {
            console.error('Failed to get YANG data:', error);
        }
    }
    
    encodeSID(sid) {
        // CBOR encoding of SID (major type 0 = unsigned int)
        if (sid < 24) {
            return new Uint8Array([sid]);
        } else if (sid < 256) {
            return new Uint8Array([0x18, sid]);
        } else if (sid < 65536) {
            return new Uint8Array([0x19, (sid >> 8) & 0xFF, sid & 0xFF]);
        } else {
            return new Uint8Array([0x1A, (sid >> 24) & 0xFF, (sid >> 16) & 0xFF, (sid >> 8) & 0xFF, sid & 0xFF]);
        }
    }
    
    buildMUP1CoAPFrame(coapData) {
        // Build MUP1 frame: >c[binary_data]<checksum\n
        let frame = '>c[';
        
        // Add CoAP data as escaped binary
        for (let i = 0; i < coapData.length; i++) {
            const byte = coapData[i];
            // Escape special MUP1 characters
            if (byte === 0x5B || byte === 0x5D || byte === 0x3E || byte === 0x3C || byte === 0x5C) {
                frame += '\\x' + byte.toString(16).padStart(2, '0');
            } else if (byte >= 32 && byte <= 126) {
                frame += String.fromCharCode(byte);
            } else {
                frame += '\\x' + byte.toString(16).padStart(2, '0');
            }
        }
        
        frame += ']<';
        
        // Calculate checksum
        const checksum = this.calculateMUP1Checksum(frame + '<');
        frame += checksum + '\n';
        
        return frame;
    }
    
    calculateMUP1Checksum(data) {
        // 16-bit one's complement checksum
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data.charCodeAt(i);
        }
        
        // Handle overflow
        while (sum >> 16) {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        
        // One's complement
        sum = ~sum & 0xFFFF;
        
        return sum.toString(16).toUpperCase().padStart(4, '0');
    }
    
    async setYANGData(path, value) {
        if (!this.isConnected || !this.mup1 || !this.coap || !this.serial) {
            console.error('Not connected');
            return;
        }
        
        try {
            const sid = YANG_PATHS[path] || path;
            
            // Build CoAP iPATCH request for setting data
            // iPATCH = 0.07 (code 7)
            const messageId = this.coap.getNextMessageId();
            
            // Build CoAP header
            const header = new Uint8Array([
                0x40, // Ver=1, Type=CON(0), TKL=0
                0x07, // Code=iPATCH (0.07)
                (messageId >> 8) & 0xFF,
                messageId & 0xFF
            ]);
            
            // Build options
            const options = new Uint8Array([
                0xB1, 0x63, // URI-Path: "c"
                0x11, 0x8E, // Content-Format: 142 (yang-instances+cbor-seq)
                0x33, 0x64, 0x3D, 0x61 // URI-Query: "d=a"
            ]);
            
            // Build CBOR payload (SID + value)
            const payload = this.encodeSIDValue(sid, value);
            
            // Combine all parts
            const coapMessage = new Uint8Array([
                ...header,
                ...options,
                0xFF, // Payload marker
                ...payload
            ]);
            
            // Wrap in MUP1 'c' frame
            const mup1Frame = this.buildMUP1CoAPFrame(coapMessage);
            
            console.log('Sending CoAP iPATCH for', path, 'SID:', sid, 'Value:', value);
            console.log('CoAP bytes:', Array.from(coapMessage).map(b => b.toString(16).padStart(2, '0')).join(' '));
            
            await this.serial.write(mup1Frame);
        } catch (error) {
            console.error('Failed to set YANG data:', error);
        }
    }
    
    encodeSIDValue(sid, value) {
        // CBOR encoding of {sid: value} as a map
        const result = [];
        
        // Map with 1 item (0xA1 = map of size 1)
        result.push(0xA1);
        
        // Encode SID as key
        if (sid < 24) {
            result.push(sid);
        } else if (sid < 256) {
            result.push(0x18, sid);
        } else if (sid < 65536) {
            result.push(0x19, (sid >> 8) & 0xFF, sid & 0xFF);
        }
        
        // Encode value
        if (typeof value === 'string') {
            const bytes = new TextEncoder().encode(value);
            if (bytes.length < 24) {
                result.push(0x60 | bytes.length); // Text string
            } else if (bytes.length < 256) {
                result.push(0x78, bytes.length);
            }
            result.push(...bytes);
        } else if (typeof value === 'number') {
            if (value < 24) {
                result.push(value);
            } else if (value < 256) {
                result.push(0x18, value);
            } else if (value < 65536) {
                result.push(0x19, (value >> 8) & 0xFF, value & 0xFF);
            }
        } else if (typeof value === 'boolean') {
            result.push(value ? 0xF5 : 0xF4);
        }
        
        return new Uint8Array(result);
    }
    
    // Simple CBOR encoder for basic types
    encodeCBOR(obj) {
        const bytes = [];
        
        // Map (major type 5)
        const keys = Object.keys(obj);
        if (keys.length < 24) {
            bytes.push(0xa0 | keys.length);
        }
        
        keys.forEach(key => {
            // Encode key as string
            const keyBytes = new TextEncoder().encode(key);
            if (keyBytes.length < 24) {
                bytes.push(0x60 | keyBytes.length);
            }
            bytes.push(...keyBytes);
            
            // Encode value
            const value = obj[key];
            if (typeof value === 'number') {
                if (value < 24) {
                    bytes.push(value);
                } else if (value < 256) {
                    bytes.push(0x18, value);
                } else if (value < 65536) {
                    bytes.push(0x19, value >> 8, value & 0xff);
                }
            } else if (typeof value === 'string') {
                const strBytes = new TextEncoder().encode(value);
                if (strBytes.length < 24) {
                    bytes.push(0x60 | strBytes.length);
                }
                bytes.push(...strBytes);
            }
        });
        
        return new Uint8Array(bytes);
    }
    
    async refreshSystemInfo() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        try {
            await this.getYANGData('/ietf-system:system-state/platform');
            await this.getYANGData('/ietf-system:system/hostname');
            await this.getYANGData('/ietf-system:system-state/clock/current-datetime');
            this.showStatus('Refreshing system information...', 'info');
        } catch (error) {
            this.showError('Failed to refresh system info');
        }
    }
    
    async refreshInterfaces() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        try {
            await this.getYANGData('/ietf-interfaces:interfaces');
            this.showStatus('Refreshing interfaces...', 'info');
        } catch (error) {
            this.showError('Failed to refresh interfaces');
        }
    }
    
    async applyCBS() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        const priority6BW = document.getElementById('cbsPriority6BW').value;
        const priority2BW = document.getElementById('cbsPriority2BW').value;
        
        try {
            // Apply CBS configuration via YANG
            await this.setYANGData('/ieee802-dot1q-sched:max-sdu-table/max-sdu[priority=6]/max-sdu-value', priority6BW * 1000000);
            await this.setYANGData('/ieee802-dot1q-sched:max-sdu-table/max-sdu[priority=2]/max-sdu-value', priority2BW * 1000000);
            this.showStatus('CBS configuration applied', 'success');
        } catch (error) {
            this.showError('Failed to apply CBS config');
        }
    }
    
    async applyTAS() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        const cycleTime = document.getElementById('tasCycleTime').value;
        
        try {
            // Apply TAS configuration via YANG
            await this.setYANGData('/ieee802-dot1q-sched:gate-parameters/admin-cycle-time', cycleTime * 1000);
            this.showStatus('TAS configuration applied', 'success');
        } catch (error) {
            this.showError('Failed to apply TAS config');
        }
    }
    
    async applyPTP() {
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        const ptpMode = document.getElementById('ptpMode').value;
        const ptpDomain = document.getElementById('ptpDomain').value;
        
        try {
            // Apply PTP configuration via YANG
            await this.setYANGData('/ieee1588-ptp:ptp/instance-list[instance-number=0]/default-ds/domain-number', ptpDomain);
            this.showStatus('PTP configuration applied', 'success');
        } catch (error) {
            this.showError('Failed to apply PTP config');
        }
    }
    
    // FRER preset configurations
    applyFRERPreset(preset) {
        console.log('Applying FRER preset:', preset);
        // Note: FRER is not available based on YANG module analysis
        this.showStatus('FRER functionality not available in this firmware version', 'warning');
    }
    
    // PSFP preset configurations  
    applyPSFPPreset(preset) {
        console.log('Applying PSFP preset:', preset);
        switch(preset) {
            case 'automotive-ecu':
                // Configure PSFP for automotive ECU protection
                this.configurePSFPAutomotive();
                break;
            case 'industrial-automation':
                // Configure PSFP for industrial automation
                this.configurePSFPIndustrial();
                break;
            case 'avb-streaming':
                // Configure PSFP for AVB streaming
                this.configurePSFPAVB();
                break;
        }
    }
    
    async configurePSFPAutomotive() {
        try {
            // Create stream filters for critical automotive traffic
            await this.setYANGData('/ieee802-dot1q-psfp:stream-filters/stream-filter-instance[filter-id=1]/stream-handle', 100);
            await this.setYANGData('/ieee802-dot1q-psfp:stream-filters/stream-filter-instance[filter-id=1]/priority-spec', 7);
            this.showStatus('Automotive PSFP preset applied', 'success');
        } catch (error) {
            this.showError('Failed to apply automotive PSFP preset');
        }
    }
    
    async configurePSFPIndustrial() {
        try {
            // Create stream filters for industrial control traffic
            await this.setYANGData('/ieee802-dot1q-psfp:stream-filters/stream-filter-instance[filter-id=2]/stream-handle', 200);
            await this.setYANGData('/ieee802-dot1q-psfp:stream-filters/stream-filter-instance[filter-id=2]/priority-spec', 6);
            this.showStatus('Industrial PSFP preset applied', 'success');
        } catch (error) {
            this.showError('Failed to apply industrial PSFP preset');
        }
    }
    
    async configurePSFPAVB() {
        try {
            // Create stream filters for AVB traffic
            await this.setYANGData('/ieee802-dot1q-psfp:stream-filters/stream-filter-instance[filter-id=3]/stream-handle', 300);
            await this.setYANGData('/ieee802-dot1q-psfp:stream-filters/stream-filter-instance[filter-id=3]/priority-spec', 5);
            this.showStatus('AVB PSFP preset applied', 'success');
        } catch (error) {
            this.showError('Failed to apply AVB PSFP preset');
        }
    }

    updateSystemInfo(info) {
        this.deviceInfo = info;
        
        const infoDiv = document.getElementById('device-info');
        if (infoDiv) {
            let html = '<h3>Device Information</h3>';
            
            if (typeof info === 'string') {
                html += `<div class="info-item">${info}</div>`;
            } else {
                for (const [key, value] of Object.entries(info)) {
                    html += `
                        <div class="info-item">
                            <span class="info-label">${key}:</span>
                            <span class="info-value">${value}</span>
                        </div>
                    `;
                }
            }
            
            infoDiv.innerHTML = html;
            infoDiv.style.display = 'block';
        }
        
        // Also update the main system tab
        this.updateSystemTab(info);
    }
    
    updateSystemTab(info) {
        // Update system tab fields if available
        const fields = {
            'platform': info.platform || info.Platform || '--',
            'osName': info.osName || info['OS Name'] || '--', 
            'osVersion': info.osVersion || info['OS Version'] || '--',
            'hostname': info.hostname || info.Hostname || '--',
            'currentTime': new Date().toLocaleString(),
            'bootTime': info.bootTime || info['Boot Time'] || '--'
        };
        
        for (const [id, value] of Object.entries(fields)) {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = value;
        }
    }

    clearDeviceInfo() {
        const infoDiv = document.getElementById('device-info');
        if (infoDiv) {
            infoDiv.innerHTML = '<div class="info-item">Not connected</div>';
            infoDiv.style.display = 'none';
        }
        
        // Clear system tab fields
        const fields = ['platform', 'osName', 'osVersion', 'hostname', 'currentTime', 'bootTime'];
        fields.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = '--';
        });
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.className = `status ${type}`;
            statusDiv.textContent = message;
            
            // Auto-hide after 5 seconds for non-error messages
            if (type !== 'error') {
                setTimeout(() => {
                    if (statusDiv.textContent === message) {
                        statusDiv.textContent = '';
                        statusDiv.className = 'status';
                    }
                }, 5000);
            }
        }
    }

    showError(message) {
        this.showStatus(message, 'error');
    }
}

// Initialize app when DOM is ready
let app = null;

document.addEventListener('DOMContentLoaded', () => {
    app = new VelocityDriveApp();
    window.app = app; // For debugging
    console.log('VelocityDrive Web App initialized');
});