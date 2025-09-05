// Load protocol modules
if (!window.MUP1Protocol) {
    const script1 = document.createElement('script');
    script1.src = 'js/mup1-protocol.js';
    document.head.appendChild(script1);
}
if (!window.CoAPProtocol) {
    const script2 = document.createElement('script');
    script2.src = 'js/coap-protocol.js';
    document.head.appendChild(script2);
}

// YANG Path to SID mappings based on CT program analysis
const YANG_PATHS = {
    // System paths
    '/ietf-system:system-state/platform': 19050,
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
        
        // Process each byte through MUP1 state machine
        if (this.mup1) {
            const bytes = new TextEncoder().encode(data);
            for (const byte of bytes) {
                const frame = this.mup1.processByte(byte);
                if (frame) {
                    this.handleMUP1Frame(frame);
                }
            }
        }
    }

    handleMUP1Frame(frame) {
        console.log('MUP1 Frame:', frame);
        
        // Handle different frame types (based on CT analysis)
        switch (frame.type) {
            case 'P': // Pong response
                const pongInfo = this.mup1.parsePong(frame.data);
                console.log('PONG received:', pongInfo);
                this.updateSystemInfo({
                    status: 'Connected',
                    version: pongInfo.version,
                    uptime: `${pongInfo.uptime} seconds`,
                    maxDataSize: `${pongInfo.maxSize} bytes`,
                    mup1Version: pongInfo.mup1Version
                });
                break;
            case 'C': // CoAP response
                this.handleCoAPResponse(frame.data);
                break;
            case 'A': // Announce
                console.log('Device announced:', new TextDecoder().decode(frame.data));
                break;
            case 'T': // Trace
                console.log('Trace:', new TextDecoder().decode(frame.data));
                break;
            default:
                console.log('Unknown frame type:', frame.type);
        }
    }
    
    handleCoAPResponse(data) {
        try {
            const coap = this.coap.parseMessage(data);
            console.log('CoAP response:', coap);
            
            if (coap.payload) {
                // TODO: Parse CBOR payload
                console.log('Payload (hex):', Array.from(coap.payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
            }
        } catch (error) {
            console.error('CoAP parse error:', error);
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
            
            // Get system information via CoAP
            await this.getYANGData('/ietf-system:system-state/platform');
            
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
        if (!this.isConnected || !this.mup1 || !this.coap) {
            console.error('Not connected');
            return;
        }
        
        try {
            const sid = YANG_PATHS[path];
            if (!sid) {
                console.error('Unknown YANG path:', path);
                return;
            }
            
            // Build CoAP FETCH request with SID
            const coapMessage = this.coap.buildMessage({
                type: this.coap.TYPE_CON,
                code: this.coap.CODE_FETCH,
                messageId: this.coap.getNextMessageId(),
                contentFormat: this.coap.FORMAT_YANG_IDENTIFIERS_CBOR,
                accept: this.coap.FORMAT_YANG_INSTANCES_CBOR,
                payload: this.encodeCBOR({sid: sid})
            });
            
            // Wrap in MUP1 frame
            const mup1Frame = this.mup1.buildFrame('c', coapMessage);
            
            console.log('Sending YANG GET for', path, 'SID:', sid);
            await this.serial.write(new TextDecoder().decode(mup1Frame));
        } catch (error) {
            console.error('Failed to get YANG data:', error);
        }
    }
    
    async setYANGData(path, value) {
        if (!this.isConnected || !this.mup1 || !this.coap) {
            console.error('Not connected');
            return;
        }
        
        try {
            const sid = YANG_PATHS[path];
            if (!sid) {
                console.error('Unknown YANG path:', path);
                return;
            }
            
            // Build CoAP PUT request with SID and value
            const coapMessage = this.coap.buildMessage({
                type: this.coap.TYPE_CON,
                code: this.coap.CODE_PUT,
                messageId: this.coap.getNextMessageId(),
                contentFormat: this.coap.FORMAT_YANG_INSTANCES_CBOR,
                payload: this.encodeCBOR({sid: sid, value: value})
            });
            
            // Wrap in MUP1 frame
            const mup1Frame = this.mup1.buildFrame('c', coapMessage);
            
            console.log('Sending YANG SET for', path, 'SID:', sid, 'Value:', value);
            await this.serial.write(new TextDecoder().decode(mup1Frame));
        } catch (error) {
            console.error('Failed to set YANG data:', error);
        }
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

// MUP1 Protocol Handler
class MUP1Protocol {
    constructor(serial) {
        this.serial = serial;
        this.buffer = '';
    }

    async sendCommand(type, data = '') {
        const frame = this.createFrame(type, data);
        console.log('Sending MUP1 frame:', frame);
        await this.serial.write(frame);
    }

    createFrame(type, data) {
        let frame = `>${type}`;
        if (data) {
            frame += `[${data}]`;
        }
        frame += '<';
        
        // Calculate checksum
        const checksum = this.calculateChecksum(frame);
        frame += checksum;
        
        return frame + '\n';
    }

    calculateChecksum(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data.charCodeAt(i);
        }
        return (sum & 0xFF).toString(16).toUpperCase().padStart(2, '0');
    }

    parseFrames(data) {
        this.buffer += data;
        const frames = [];
        
        // Look for complete frames
        let startIdx = this.buffer.indexOf('>');
        while (startIdx !== -1) {
            const endIdx = this.buffer.indexOf('\n', startIdx);
            if (endIdx !== -1) {
                const frameStr = this.buffer.substring(startIdx, endIdx);
                const frame = this.parseFrame(frameStr);
                if (frame) {
                    frames.push(frame);
                }
                this.buffer = this.buffer.substring(endIdx + 1);
                startIdx = this.buffer.indexOf('>');
            } else {
                break;
            }
        }
        
        return frames;
    }

    parseFrame(frameStr) {
        try {
            // Basic frame parsing
            const match = frameStr.match(/^>([A-Z])(?:\[([^\]]*)\])?<([0-9A-F]{2})?$/);
            if (match) {
                return {
                    type: match[1],
                    data: match[2] || '',
                    checksum: match[3] || ''
                };
            }
            
            // Try simpler format
            if (frameStr.startsWith('>') && frameStr.includes('<')) {
                const type = frameStr[1];
                const dataStart = frameStr.indexOf('[');
                const dataEnd = frameStr.indexOf(']');
                let data = '';
                
                if (dataStart > 0 && dataEnd > dataStart) {
                    data = frameStr.substring(dataStart + 1, dataEnd);
                }
                
                return {
                    type: type,
                    data: data,
                    checksum: ''
                };
            }
        } catch (error) {
            console.error('Frame parse error:', error);
        }
        
        return null;
    }
}

// Initialize app when DOM is ready
let app = null;

document.addEventListener('DOMContentLoaded', () => {
    app = new VelocityDriveApp();
    window.app = app; // For debugging
    console.log('VelocityDrive Web App initialized');
});