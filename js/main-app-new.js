// CT Program Complete Replication - Main Application
// Based on exact CT logs and sequences

// YANG Path to SID mappings from CT analysis
const YANG_PATHS = {
    // System paths (from CT log analysis)
    '/ietf-system:system-state/platform': 0x4A51,  // 19025 (confirmed from CT)
    '/ietf-system:system/hostname': 0x4A4F,        // 19023
    '/ietf-system:system/location': 0x4A50,        // 19024  
    '/ietf-system:system/contact': 0x4A4E,         // 19022
    '/ietf-system:system-state/clock/current-datetime': 0x4A6B, // 19051
    
    // Interface paths
    '/ietf-interfaces:interfaces': 0x03E8,         // 1000
    '/ietf-interfaces:interfaces/interface': 0x03E9, // 1001
    '/ietf-interfaces:interfaces-state': 0x03FC,   // 1020
    
    // Bridge paths
    '/ieee802-dot1q-bridge:bridges': 0x4E20,      // 20000
    '/ieee802-dot1q-bridge:bridges/bridge': 0x4E21, // 20001
    
    // LLDP paths  
    '/ieee802-dot1ab-lldp:lldp': 0x5208,          // 21000
    '/ieee802-dot1ab-lldp:lldp/local-system-data': 0x520A, // 21010
    
    // PTP paths
    '/ieee1588-ptp:ptp': 0x55F0,                  // 22000
    '/ieee1588-ptp:ptp/instance-list': 0x55FA,    // 22010
    
    // TSN Scheduling paths
    '/ieee802-dot1q-sched:scheduling': 0x59D8,    // 23000
    '/ieee802-dot1q-sched:max-sdu-table': 0x59E2, // 23010
    
    // PSFP paths
    '/ieee802-dot1q-psfp:psfp': 0x5DC0,          // 24000
    '/ieee802-dot1q-psfp:stream-filters': 0x5DCA, // 24010
    
    // Stream ID paths
    '/ieee802-dot1cb-stream-identification:stream-identity-table': 0x61A8 // 25000
};

// CT-style Application Controller
class VelocityDriveWebApp {
    constructor() {
        this.serial = null;
        this.isConnected = false;
        this.deviceInfo = null;
        this.messageId = 1;
        this.lastDataType = null;
        this.tabData = new Map(); // Store data for each tab
        this.catalogChecksum = null;
        
        this.initializeUI();
    }

    initializeUI() {
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this.toggleConnection());
        }

        if (!('serial' in navigator)) {
            this.showError('WebSerial API is not supported. Please use Chrome, Edge, or Opera.');
            if (connectBtn) connectBtn.disabled = true;
        }

        this.initializeTabs();
        this.initializeActionButtons();
    }

    initializeTabs() {
        const navItems = document.querySelectorAll('.nav-item');
        const tabContents = document.querySelectorAll('.tab-content');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tabName = item.dataset.tab;
                
                // Update nav
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Update content
                tabContents.forEach(content => {
                    content.style.display = content.dataset.tabContent === tabName ? 'block' : 'none';
                });

                // Load tab data if not already loaded
                this.loadTabData(tabName);
            });
        });
    }

    initializeActionButtons() {
        // YANG module selector and actions
        document.getElementById('yangFetch')?.addEventListener('click', () => this.fetchYANGData());
        document.getElementById('yangSet')?.addEventListener('click', () => this.setYANGData());
        document.getElementById('loadModuleBtn')?.addEventListener('click', () => this.loadYANGModule());
        document.getElementById('validateBtn')?.addEventListener('click', () => this.validateConfig());
        document.getElementById('applyBtn')?.addEventListener('click', () => this.applyConfig());
        
        // Populate YANG module selector
        this.populateYANGModules();
    }
    
    populateYANGModules() {
        const selector = document.getElementById('yangModule');
        if (selector) {
            const modules = [
                { name: 'ietf-system', desc: 'System Configuration' },
                { name: 'ietf-interfaces', desc: 'Network Interfaces' },
                { name: 'ieee802-dot1q-bridge', desc: 'Bridge Configuration' },
                { name: 'ieee802-dot1ab-lldp', desc: 'LLDP Configuration' },
                { name: 'ieee1588-ptp', desc: 'PTP Configuration' },
                { name: 'ieee802-dot1q-sched', desc: 'TSN Scheduling' },
                { name: 'ieee802-dot1q-psfp', desc: 'PSFP Configuration' },
                { name: 'ieee802-dot1cb-stream-identification', desc: 'Stream ID Configuration' },
                { name: 'mchp-velocitysp-bridge', desc: 'Microchip Bridge Extensions' }
            ];
            
            // Clear existing options except first
            while (selector.children.length > 1) {
                selector.removeChild(selector.lastChild);
            }
            
            // Add modules
            modules.forEach(module => {
                const option = document.createElement('option');
                option.value = module.name;
                option.textContent = `${module.name} - ${module.desc}`;
                selector.appendChild(option);
            });
        }
    }
    
    async loadYANGModule() {
        const selector = document.getElementById('yangModule');
        if (!selector.value) {
            this.showError('Please select a YANG module');
            return;
        }
        
        const moduleName = selector.value;
        this.showStatusMessage(`Loading YANG module: ${moduleName}`, 'info');
        
        // Display module structure in the tree view
        const treeView = document.getElementById('yangTree');
        if (treeView) {
            treeView.innerHTML = `
                <div class="module-info">
                    <h4>${moduleName}</h4>
                    <p>YANG module loaded. Use the editor below to fetch or modify configuration.</p>
                    <div class="quick-actions">
                        <h5>Quick Access Paths:</h5>
                        <div class="path-buttons">
                            ${this.generatePathButtons(moduleName)}
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    generatePathButtons(moduleName) {
        const pathsForModule = Object.entries(YANG_PATHS)
            .filter(([path, sid]) => path.includes(moduleName))
            .slice(0, 5); // Show first 5 paths
            
        return pathsForModule.map(([path, sid]) => `
            <button class="btn btn-sm btn-outline" onclick="app.loadPath('${path}', ${sid})">
                ${path.split('/').pop() || path}
            </button>
        `).join('');
    }
    
    async loadPath(path, sid) {
        // Auto-fill the path in editor
        const pathInput = document.getElementById('yangPath');
        if (pathInput) {
            pathInput.value = path;
        }
        
        // Fetch the data
        const sidBytes = this.encodeSIDToBytes(sid);
        await this.sendCoAPFetch(sidBytes, 'path-load');
        this.showStatusMessage(`Loading: ${path}`, 'info');
    }
    
    async validateConfig() {
        this.showStatusMessage('Configuration validation not implemented yet', 'warning');
    }
    
    async applyConfig() {
        const pathInput = document.getElementById('yangPath');
        const valueInput = document.getElementById('yangValue');
        
        if (pathInput && valueInput && pathInput.value && valueInput.value) {
            await this.setYANGData();
        } else {
            this.showError('Please enter both path and value to apply configuration');
        }
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
            this.showStatusMessage('Connecting...', 'info');
            
            // Initialize serial connection
            this.serial = new window.RobustSerialController();
            
            // Override handleData to process incoming messages
            this.serial.handleData = (data) => this.handleIncomingData(data);
            
            const connected = await this.serial.connect(115200);
            if (!connected) {
                throw new Error('Failed to establish serial connection');
            }

            this.isConnected = true;
            this.updateConnectionUI(true);
            
            // CT Sequence: Start with ping
            await this.sendPing();
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.showError('Connection failed: ' + error.message);
        }
    }

    async disconnect() {
        try {
            if (this.serial) {
                await this.serial.disconnect();
                this.serial = null;
            }
            this.isConnected = false;
            this.updateConnectionUI(false);
            this.showStatusMessage('Disconnected', 'warning');
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }

    async sendPing() {
        console.log('Sending ping (CT sequence step 1)...');
        // CT exact ping format: >p<<8553
        const pingFrame = new TextEncoder().encode('>p<<8553\\n');
        await this.serial.writeBytes(pingFrame);
    }

    handleIncomingData(data) {
        console.log('Received data:', data);
        
        // Check for pong response
        if (data.includes('>P') && data.includes('VelocitySP')) {
            this.handlePongResponse(data);
        }
        // Check for CoAP response (starts with >C or has MUP1 'C' frame)
        else if (data.includes('>C') || data.includes('C')) {
            this.handleCoAPResponse(data);
        }
    }

    handlePongResponse(data) {
        console.log('Received pong response:', data);
        
        // Parse pong: >PVelocitySP-v2025.06-LAN9662-ung8291 14000 300 2<737f
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
            this.showStatusMessage(`Connected: ${this.deviceInfo.version}`, 'success');
            
            // CT Sequence: After pong, request catalog checksum
            setTimeout(() => this.performCTSequence(), 100);
        }
    }

    async performCTSequence() {
        console.log('Starting CT data loading sequence...');
        
        try {
            // Step 1: Request catalog checksum (like CT does first)
            await this.requestCatalogChecksum();
            await this.sleep(200);
            
            // Step 2: Request platform info (like CT does second)
            await this.requestPlatformInfo(); 
            await this.sleep(200);
            
            // Step 3: Load all tab data automatically
            await this.loadAllTabsData();
            
        } catch (error) {
            console.error('CT sequence failed:', error);
            this.showError('Failed to load device data: ' + error.message);
        }
    }

    async requestCatalogChecksum() {
        console.log('Requesting catalog checksum (CT step 1)...');
        // CT sends: 81 19 72 78 (catalog request)
        const catalogRequest = new Uint8Array([0x81, 0x19, 0x72, 0x78]);
        await this.sendCoAPFetch(catalogRequest, 'catalog');
    }

    async requestPlatformInfo() {
        console.log('Requesting platform info (CT step 2)...');
        // CT sends: 19 4A 51 (platform SID 19025)
        const platformRequest = new Uint8Array([0x19, 0x4A, 0x51]);
        await this.sendCoAPFetch(platformRequest, 'platform');
    }

    async loadAllTabsData() {
        console.log('Loading data for all tabs...');
        
        // Load each tab's data with proper SIDs
        const tabRequests = [
            { name: 'system', sid: [0x19, 0x4A, 0x4F] }, // hostname
            { name: 'interfaces', sid: [0x19, 0x03, 0xE8] }, // interfaces
            { name: 'bridge', sid: [0x19, 0x4E, 0x20] }, // bridge
            { name: 'lldp', sid: [0x19, 0x52, 0x08] }, // LLDP  
            { name: 'ptp', sid: [0x19, 0x55, 0xF0] }, // PTP
            { name: 'tsn', sid: [0x19, 0x59, 0xD8] }, // TSN scheduling
            { name: 'psfp', sid: [0x19, 0x5D, 0xC0] }, // PSFP
            { name: 'stream-id', sid: [0x19, 0x61, 0xA8] } // Stream ID
        ];
        
        for (const req of tabRequests) {
            try {
                const sidBytes = new Uint8Array(req.sid);
                await this.sendCoAPFetch(sidBytes, req.name);
                await this.sleep(100); // Small delay between requests
            } catch (error) {
                console.error(`Failed to load ${req.name} data:`, error);
            }
        }
        
        this.showStatusMessage('All data loaded successfully', 'success');
    }

    async sendCoAPFetch(payload, dataType) {
        this.lastDataType = dataType;
        
        // Build CoAP FETCH message exactly like CT
        const messageId = this.messageId++;
        
        const header = new Uint8Array([
            0x40, // Ver=1, Type=CON(0), TKL=0
            0x05, // Code=FETCH (0.05)
            (messageId >> 8) & 0xFF,
            messageId & 0xFF
        ]);
        
        // CT options: B1 63 11 8D 33 64 3D 61 21 8E 61 04
        const options = new Uint8Array([
            0xB1, 0x63, // URI-Path: "c"
            0x11, 0x8D, // Content-Format: 141 (yang-identifiers+cbor-seq)
            0x33, 0x64, 0x3D, 0x61, // URI-Query: "d=a" 
            0x21, 0x8E, // Accept: 142 (yang-instances+cbor-seq)
            0x61, 0x04  // Block2: 2:0/0/256
        ]);
        
        // Build complete CoAP message
        const coapMessage = new Uint8Array([
            ...header,
            ...options,
            0xFF, // Payload marker
            ...payload
        ]);
        
        // Wrap in MUP1 'c' frame
        const mup1Frame = this.buildMUP1Frame(coapMessage);
        
        console.log(`Sending CoAP FETCH for ${dataType}:`, 
            Array.from(coapMessage).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        await this.serial.writeBytes(mup1Frame);
    }

    buildMUP1Frame(coapData) {
        // Build: >c[BINARY_DATA]<<CHECKSUM\\n
        const frameStart = new TextEncoder().encode('>c[');
        const frameEnd = new TextEncoder().encode(']<<');
        
        // Combine for checksum calculation
        const frameWithoutChecksum = new Uint8Array([
            ...frameStart,
            ...coapData, 
            ...frameEnd
        ]);
        
        // Calculate CT-style checksum
        let sum = 0;
        for (let i = 0; i < frameWithoutChecksum.length; i++) {
            sum += frameWithoutChecksum[i];
        }
        
        while (sum >> 16) {
            sum = (sum & 0xFFFF) + (sum >> 16);
        }
        sum = ~sum & 0xFFFF;
        
        const checksumStr = sum.toString(16).toUpperCase().padStart(4, '0');
        const newline = new TextEncoder().encode('\\n');
        
        // Build complete frame
        return new Uint8Array([
            ...frameStart,
            ...coapData,
            ...frameEnd,
            ...new TextEncoder().encode(checksumStr),
            ...newline
        ]);
    }

    handleCoAPResponse(rawData) {
        console.log('Processing CoAP response for:', this.lastDataType);
        
        try {
            // Extract binary data from MUP1 frame
            // Look for pattern: >C...<<CHECKSUM or raw binary response
            const dataStr = rawData.toString();
            
            // Simple approach: look for CBOR patterns in the data
            if (rawData.includes('BF')) {
                // This looks like CBOR data
                this.parseCBORResponse(rawData);
            } else {
                // Display raw data for debugging
                this.displayRawData(rawData);
            }
            
        } catch (error) {
            console.error('CoAP response processing error:', error);
            this.displayRawData(rawData);
        }
    }

    parseCBORResponse(data) {
        // Simple CBOR parsing - extract text strings and display them
        const result = {};
        const dataStr = data.toString();
        
        // Look for text patterns in the response
        const textMatch = dataStr.match(/([\w\s\-\.]+)/g);
        if (textMatch) {
            result.data = textMatch.filter(text => text.trim().length > 2);
        }
        
        result.rawHex = Array.from(data).map(b => 
            b.toString(16).padStart(2, '0')).join(' ');
        
        this.updateTabContent(result);
    }

    displayRawData(data) {
        const result = {
            type: this.lastDataType,
            rawData: data.toString(),
            hexData: Array.from(data).map(b => 
                b.toString(16).padStart(2, '0')).join(' '),
            timestamp: new Date().toISOString()
        };
        
        this.updateTabContent(result);
    }

    updateTabContent(data) {
        const tabName = this.lastDataType;
        if (!tabName) return;
        
        // Store data for the tab
        this.tabData.set(tabName, data);
        
        // Update UI if this tab is currently active
        const activeTab = document.querySelector('.nav-item.active')?.dataset.tab;
        if (activeTab === tabName) {
            this.renderTabData(tabName, data);
        }
    }

    renderTabData(tabName, data) {
        const content = document.querySelector(`[data-tab-content="${tabName}"]`);
        if (!content || !data) return;
        
        // Create a nice display for the data
        const html = `
            <div class="data-container">
                <h3>${tabName.charAt(0).toUpperCase() + tabName.slice(1)} Data</h3>
                <div class="data-section">
                    <h4>Parsed Data:</h4>
                    <pre class="data-display">${JSON.stringify(data, null, 2)}</pre>
                </div>
                ${data.hexData ? `
                <div class="data-section">
                    <h4>Raw Hex Data:</h4>
                    <pre class="hex-display">${data.hexData}</pre>
                </div>
                ` : ''}
                <div class="data-timestamp">
                    Updated: ${new Date().toLocaleString()}
                </div>
            </div>
        `;
        
        content.innerHTML = html;
    }

    loadTabData(tabName) {
        // Load data for a specific tab if we have it
        const data = this.tabData.get(tabName);
        if (data) {
            this.renderTabData(tabName, data);
        } else {
            // If no data, show loading message
            const content = document.querySelector(`[data-tab-content="${tabName}"]`);
            if (content) {
                content.innerHTML = `
                    <div class="loading-message">
                        <p>Loading ${tabName} data...</p>
                        <p>Connect to device to load data.</p>
                    </div>
                `;
            }
        }
    }

    updateConnectionUI(connected) {
        const connectBtn = document.getElementById('connectBtn');
        const statusIndicator = document.querySelector('.status-indicator');
        
        if (connectBtn) {
            connectBtn.textContent = connected ? 'Disconnect' : 'Connect';
            connectBtn.className = connected ? 'btn btn-danger' : 'btn btn-primary';
        }
        
        if (statusIndicator) {
            statusIndicator.className = `status-indicator ${connected ? 'connected' : 'disconnected'}`;
            statusIndicator.textContent = connected ? 'Connected' : 'Disconnected';
        }
    }

    showStatusMessage(message, type = 'info') {
        const statusEl = document.getElementById('statusMessage');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `status-message ${type}`;
            statusEl.style.display = 'block';
            
            // Auto-hide after 5 seconds for non-error messages
            if (type !== 'error') {
                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 5000);
            }
        }
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    showError(message) {
        this.showStatusMessage(message, 'error');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // YANG Module Actions
    async fetchYANGData() {
        const moduleSelect = document.getElementById('yangModule');
        const pathInput = document.getElementById('yangPath');
        
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        const module = moduleSelect.value;
        const path = pathInput.value.trim();
        
        if (!path) {
            this.showError('Please enter a YANG path');
            return;
        }
        
        try {
            // Try to find SID for path, or use path as direct SID
            const sid = YANG_PATHS[path] || parseInt(path);
            if (isNaN(sid)) {
                this.showError('Invalid YANG path or SID');
                return;
            }
            
            // Convert SID to bytes
            const sidBytes = this.encodeSIDToBytes(sid);
            await this.sendCoAPFetch(sidBytes, 'yang-fetch');
            
            this.showStatusMessage(`Fetching data for: ${path}`, 'info');
            
        } catch (error) {
            console.error('YANG fetch error:', error);
            this.showError('YANG fetch failed: ' + error.message);
        }
    }

    encodeSIDToBytes(sid) {
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

    async setYANGData() {
        const pathInput = document.getElementById('yangPath');
        const valueInput = document.getElementById('yangValue');
        
        if (!this.isConnected) {
            this.showError('Not connected to device');
            return;
        }
        
        const path = pathInput.value.trim();
        const value = valueInput.value.trim();
        
        if (!path || !value) {
            this.showError('Please enter both path and value');
            return;
        }
        
        try {
            // Try to find SID for path, or use path as direct SID
            const sid = YANG_PATHS[path] || parseInt(path);
            if (isNaN(sid)) {
                this.showError('Invalid YANG path or SID');
                return;
            }
            
            // Send CoAP iPATCH (like CLI set command)
            await this.sendCoAPPatch(sid, value, 'yang-set');
            this.showStatusMessage(`Setting ${path} = ${value}`, 'info');
            
        } catch (error) {
            console.error('YANG set error:', error);
            this.showError('YANG set failed: ' + error.message);
        }
    }
    
    async sendCoAPPatch(sid, value, dataType) {
        this.lastDataType = dataType;
        
        // Build CoAP iPATCH message (Code 0.07) like CLI
        const messageId = this.messageId++;
        
        const header = new Uint8Array([
            0x40, // Ver=1, Type=CON(0), TKL=0
            0x07, // Code=iPATCH (0.07) - for SET operations
            (messageId >> 8) & 0xFF,
            messageId & 0xFF
        ]);
        
        // Same options as FETCH but with iPATCH
        const options = new Uint8Array([
            0xB1, 0x63, // URI-Path: "c"
            0x11, 0x8D, // Content-Format: 141 (yang-identifiers+cbor-seq)
            0x33, 0x64, 0x3D, 0x61, // URI-Query: "d=a"
            0x21, 0x8E  // Accept: 142 (yang-instances+cbor-seq)
        ]);
        
        // Build CBOR payload with SID and value
        const payload = this.buildCBORSetPayload(sid, value);
        
        // Build complete CoAP message
        const coapMessage = new Uint8Array([
            ...header,
            ...options,
            0xFF, // Payload marker
            ...payload
        ]);
        
        // Wrap in MUP1 'c' frame
        const mup1Frame = this.buildMUP1Frame(coapMessage);
        
        console.log(`Sending CoAP iPATCH for SID ${sid} = "${value}":`, 
            Array.from(coapMessage).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        await this.serial.writeBytes(mup1Frame);
    }
    
    buildCBORSetPayload(sid, value) {
        // Build CBOR payload: map with SID as key and value as value
        // Format: BF <SID> <VALUE> FF (indefinite map)
        
        const result = [];
        
        // Start indefinite map
        result.push(0xBF);
        
        // Add SID as key
        const sidBytes = this.encodeSIDToBytes(sid);
        result.push(...sidBytes);
        
        // Add value (encode based on type)
        const valueBytes = this.encodeCBORValue(value);
        result.push(...valueBytes);
        
        // End indefinite map
        result.push(0xFF);
        
        return new Uint8Array(result);
    }
    
    encodeCBORValue(value) {
        // Try to detect value type and encode appropriately
        
        // Check if it's a number
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && isFinite(numValue)) {
            // Integer
            if (Number.isInteger(numValue)) {
                if (numValue >= 0) {
                    return this.encodeSIDToBytes(numValue); // Reuse SID encoding for positive integers
                } else {
                    // Negative integer (major type 1)
                    const absValue = Math.abs(numValue) - 1;
                    if (absValue < 24) {
                        return new Uint8Array([0x20 | absValue]);
                    } else if (absValue < 256) {
                        return new Uint8Array([0x38, absValue]);
                    } else if (absValue < 65536) {
                        return new Uint8Array([0x39, (absValue >> 8) & 0xFF, absValue & 0xFF]);
                    }
                }
            }
        }
        
        // Check if it's a boolean
        if (value.toLowerCase() === 'true') {
            return new Uint8Array([0xF5]); // CBOR true
        } else if (value.toLowerCase() === 'false') {
            return new Uint8Array([0xF4]); // CBOR false
        }
        
        // Default: encode as text string (major type 3)
        const textBytes = new TextEncoder().encode(value);
        const length = textBytes.length;
        
        if (length < 24) {
            return new Uint8Array([0x60 | length, ...textBytes]);
        } else if (length < 256) {
            return new Uint8Array([0x78, length, ...textBytes]);
        } else if (length < 65536) {
            return new Uint8Array([0x79, (length >> 8) & 0xFF, length & 0xFF, ...textBytes]);
        } else {
            return new Uint8Array([0x7A, (length >> 24) & 0xFF, (length >> 16) & 0xFF, (length >> 8) & 0xFF, length & 0xFF, ...textBytes]);
        }
    }
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing VelocityDRIVE Web App...');
    window.app = new VelocityDriveWebApp();
});