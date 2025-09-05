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
                this.mup1 = new MUP1Protocol(this.serial);
                
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
        
        // Parse MUP1 frames if we have the protocol handler
        if (this.mup1) {
            try {
                const frames = this.mup1.parseFrames(data);
                frames.forEach(frame => this.handleMUP1Frame(frame));
            } catch (error) {
                console.error('Frame parsing error:', error);
            }
        }
    }

    handleMUP1Frame(frame) {
        console.log('MUP1 Frame:', frame);
        
        // Handle different frame types
        switch (frame.type) {
            case 'R': // Response
                this.handleResponse(frame.data);
                break;
            case 'E': // Error
                this.handleError(frame.data);
                break;
            case 'I': // Info
                this.handleInfo(frame.data);
                break;
            default:
                console.log('Unknown frame type:', frame.type);
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
            
            // Send system info request
            if (this.mup1) {
                await this.mup1.sendCommand('GET', '/ietf-system:system-state');
                
                // Also try direct approach
                setTimeout(async () => {
                    if (this.serial && this.serial.isConnected) {
                        // Send a simple command to get version
                        await this.serial.write('>V<\n');
                    }
                }, 500);
            }
            
            // Fallback - show connected status even if no immediate response
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