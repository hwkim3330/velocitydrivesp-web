// Main Application Module
import { SerialController } from './serial-controller.js';
import { MUP1Protocol } from './mup1-protocol.js';
import { CORECONFClient } from './coreconf-client.js';
import { YANGBrowser } from './yang-browser.js';
import { UIController } from './ui-controller.js';
import { MonitoringService } from './monitoring-service.js';

class VelocityDriveSPApp {
    constructor() {
        this.serial = new SerialController();
        this.protocol = new MUP1Protocol();
        this.coreconf = new CORECONFClient(this.serial, this.protocol);
        this.yangBrowser = new YANGBrowser(this.coreconf);
        this.ui = new UIController();
        this.monitoring = new MonitoringService(this.coreconf);
        
        this.isConnected = false;
        this.rxBytes = 0;
        this.txBytes = 0;
        
        this.init();
    }
    
    init() {
        // Check for WebSerial API support
        if (!('serial' in navigator)) {
            this.ui.showError('WebSerial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
            document.getElementById('connectBtn').disabled = true;
            return;
        }
        
        this.setupEventListeners();
        this.ui.updateStatus('Ready', 'info');
        
        // Initialize tabs
        this.setupTabs();
        
        // Load saved configurations
        this.loadSavedConfigs();
    }
    
    setupEventListeners() {
        // Connection buttons
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());
        
        // System tab
        document.getElementById('refreshSystemBtn').addEventListener('click', () => this.refreshSystemInfo());
        
        // Interfaces tab
        document.getElementById('refreshInterfacesBtn').addEventListener('click', () => this.refreshInterfaces());
        
        // YANG browser
        document.getElementById('loadModuleBtn').addEventListener('click', () => this.loadYANGModule());
        document.getElementById('validateBtn').addEventListener('click', () => this.validateConfig());
        document.getElementById('applyBtn').addEventListener('click', () => this.applyConfig());
        
        // TSN Configuration
        document.getElementById('applyCBSBtn').addEventListener('click', () => this.applyCBSConfig());
        document.getElementById('applyTASBtn').addEventListener('click', () => this.applyTASConfig());
        document.getElementById('applyPTPBtn').addEventListener('click', () => this.applyPTPConfig());
        
        // Monitoring
        document.getElementById('startMonitorBtn').addEventListener('click', () => this.startMonitoring());
        document.getElementById('stopMonitorBtn').addEventListener('click', () => this.stopMonitoring());
        
        // Quick actions
        document.getElementById('rebootBtn').addEventListener('click', () => this.rebootDevice());
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfiguration());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportConfig());
        document.getElementById('importBtn').addEventListener('click', () => this.importConfig());
        
        // Logs
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
        document.getElementById('logLevel').addEventListener('change', (e) => this.filterLogs(e.target.value));
        
        // Serial event handlers
        this.serial.on('data', (data) => this.handleSerialData(data));
        this.serial.on('connected', () => this.onConnected());
        this.serial.on('disconnected', () => this.onDisconnected());
        this.serial.on('error', (error) => this.onError(error));
    }
    
    setupTabs() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const tabName = item.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }
    
    switchTab(tabName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.nav-item[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        // Load tab-specific data
        this.loadTabData(tabName);
    }
    
    async loadTabData(tabName) {
        if (!this.isConnected) return;
        
        switch(tabName) {
            case 'system':
                await this.refreshSystemInfo();
                break;
            case 'interfaces':
                await this.refreshInterfaces();
                break;
            case 'yang':
                await this.loadYANGModules();
                break;
            case 'tsn':
                await this.loadTSNConfig();
                break;
        }
    }
    
    async connect() {
        try {
            this.ui.updateStatus('Connecting...', 'info');
            
            // Request serial port
            const port = await navigator.serial.requestPort();
            
            // Connect with default settings
            await this.serial.connect(port, {
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.ui.showError('Failed to connect: ' + error.message);
        }
    }
    
    async disconnect() {
        try {
            await this.serial.disconnect();
        } catch (error) {
            console.error('Disconnect failed:', error);
        }
    }
    
    onConnected() {
        this.isConnected = true;
        document.getElementById('connectBtn').style.display = 'none';
        document.getElementById('disconnectBtn').style.display = 'block';
        
        // Update UI
        const statusIndicator = document.getElementById('statusIndicator');
        statusIndicator.classList.add('connected');
        statusIndicator.querySelector('.status-text').textContent = 'Connected';
        
        document.getElementById('portInfo').style.display = 'flex';
        document.getElementById('portName').textContent = this.serial.getPortInfo();
        
        this.ui.updateStatus('Connected to device', 'success');
        this.addLog('Connected to VelocityDRIVE SP device', 'info');
        
        // Load initial data
        this.refreshSystemInfo();
    }
    
    onDisconnected() {
        this.isConnected = false;
        document.getElementById('connectBtn').style.display = 'block';
        document.getElementById('disconnectBtn').style.display = 'none';
        
        // Update UI
        const statusIndicator = document.getElementById('statusIndicator');
        statusIndicator.classList.remove('connected');
        statusIndicator.querySelector('.status-text').textContent = 'Disconnected';
        
        document.getElementById('portInfo').style.display = 'none';
        
        this.ui.updateStatus('Disconnected', 'info');
        this.addLog('Disconnected from device', 'info');
        
        // Stop monitoring if active
        this.stopMonitoring();
    }
    
    onError(error) {
        console.error('Serial error:', error);
        this.ui.showError('Serial error: ' + error.message);
        this.addLog('Serial error: ' + error.message, 'error');
    }
    
    handleSerialData(data) {
        // Update byte counters
        this.rxBytes += data.length;
        document.getElementById('rxBytes').textContent = `RX: ${this.formatBytes(this.rxBytes)}`;
        
        // Process data with MUP1 protocol
        try {
            const message = this.protocol.decode(data);
            if (message) {
                this.handleMessage(message);
            }
        } catch (error) {
            console.error('Protocol error:', error);
            this.addLog('Protocol error: ' + error.message, 'error');
        }
    }
    
    handleMessage(message) {
        // Handle different message types
        switch(message.type) {
            case 'CORECONF':
                this.coreconf.handleResponse(message);
                break;
            case 'LOG':
                this.addLog(message.data, message.level || 'info');
                break;
            case 'STATUS':
                this.updateDeviceStatus(message.data);
                break;
            default:
                console.log('Unhandled message type:', message.type);
        }
    }
    
    async refreshSystemInfo() {
        if (!this.isConnected) return;
        
        try {
            this.ui.updateStatus('Fetching system info...', 'info');
            
            // Get system state
            const systemState = await this.coreconf.get('/ietf-system:system-state');
            
            if (systemState) {
                document.getElementById('platform').textContent = systemState.platform || '--';
                document.getElementById('osName').textContent = systemState['os-name'] || '--';
                document.getElementById('osVersion').textContent = systemState['os-version'] || '--';
                document.getElementById('hostname').textContent = systemState.hostname || '--';
                document.getElementById('currentTime').textContent = 
                    systemState['current-datetime'] ? new Date(systemState['current-datetime']).toLocaleString() : '--';
                document.getElementById('bootTime').textContent = 
                    systemState['boot-datetime'] ? new Date(systemState['boot-datetime']).toLocaleString() : '--';
                
                // Calculate uptime
                if (systemState['boot-datetime'] && systemState['current-datetime']) {
                    const bootTime = new Date(systemState['boot-datetime']);
                    const currentTime = new Date(systemState['current-datetime']);
                    const uptime = Math.floor((currentTime - bootTime) / 1000);
                    document.getElementById('uptime').textContent = `Uptime: ${this.formatUptime(uptime)}`;
                }
            }
            
            this.ui.updateStatus('System info updated', 'success');
        } catch (error) {
            console.error('Failed to get system info:', error);
            this.ui.showError('Failed to get system info');
        }
    }
    
    async refreshInterfaces() {
        if (!this.isConnected) return;
        
        try {
            this.ui.updateStatus('Fetching interfaces...', 'info');
            
            // Get interfaces
            const interfaces = await this.coreconf.get('/ietf-interfaces:interfaces');
            
            const container = document.getElementById('interfacesContainer');
            container.innerHTML = '';
            
            if (interfaces && interfaces.interface) {
                interfaces.interface.forEach(iface => {
                    const card = this.createInterfaceCard(iface);
                    container.appendChild(card);
                });
            }
            
            this.ui.updateStatus('Interfaces updated', 'success');
        } catch (error) {
            console.error('Failed to get interfaces:', error);
            this.ui.showError('Failed to get interfaces');
        }
    }
    
    createInterfaceCard(iface) {
        const card = document.createElement('div');
        card.className = 'interface-card';
        
        const status = iface['oper-status'] === 'up' ? 'up' : 'down';
        
        card.innerHTML = `
            <div class="interface-header">
                <div class="interface-name">
                    <span class="material-icons">lan</span>
                    ${iface.name}
                </div>
                <span class="interface-status ${status}">${status.toUpperCase()}</span>
            </div>
            <div class="info-grid">
                <div class="info-item">
                    <label>Type:</label>
                    <span>${iface.type || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <label>MAC Address:</label>
                    <span>${iface['phys-address'] || '--'}</span>
                </div>
                <div class="info-item">
                    <label>Speed:</label>
                    <span>${iface.speed ? `${iface.speed / 1000000} Mbps` : '--'}</span>
                </div>
                <div class="info-item">
                    <label>MTU:</label>
                    <span>${iface.mtu || '--'}</span>
                </div>
            </div>
        `;
        
        return card;
    }
    
    async loadYANGModules() {
        try {
            const modules = await this.yangBrowser.getModules();
            const select = document.getElementById('yangModule');
            
            select.innerHTML = '<option value="">Select Module...</option>';
            modules.forEach(module => {
                const option = document.createElement('option');
                option.value = module.name;
                option.textContent = `${module.name} (${module.revision})`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to load YANG modules:', error);
        }
    }
    
    async loadYANGModule() {
        const moduleName = document.getElementById('yangModule').value;
        if (!moduleName) return;
        
        try {
            const tree = await this.yangBrowser.loadModule(moduleName);
            document.getElementById('yangTree').innerHTML = tree;
        } catch (error) {
            console.error('Failed to load module:', error);
            this.ui.showError('Failed to load YANG module');
        }
    }
    
    validateConfig() {
        const config = document.getElementById('yangEditor').value;
        if (!config) {
            this.ui.showError('No configuration to validate');
            return;
        }
        
        try {
            JSON.parse(config);
            this.ui.updateStatus('Configuration is valid', 'success');
        } catch (error) {
            this.ui.showError('Invalid JSON configuration');
        }
    }
    
    async applyConfig() {
        const config = document.getElementById('yangEditor').value;
        if (!config) {
            this.ui.showError('No configuration to apply');
            return;
        }
        
        try {
            const data = JSON.parse(config);
            await this.coreconf.set(data.path, data.value);
            this.ui.updateStatus('Configuration applied', 'success');
            this.addLog('Configuration applied successfully', 'info');
        } catch (error) {
            console.error('Failed to apply config:', error);
            this.ui.showError('Failed to apply configuration');
        }
    }
    
    async loadTSNConfig() {
        // Initialize TAS queue schedule UI
        const queueSchedule = document.getElementById('queueSchedule');
        queueSchedule.innerHTML = '';
        
        for (let i = 0; i < 8; i++) {
            const item = document.createElement('div');
            item.className = 'queue-item';
            item.innerHTML = `
                <label>TC${i}</label>
                <input type="number" id="tc${i}Time" value="${i === 0 ? 50 : i === 1 ? 30 : 20}" min="0">
                <span>ms</span>
            `;
            queueSchedule.appendChild(item);
        }
    }
    
    async applyCBSConfig() {
        if (!this.isConnected) return;
        
        const priority6BW = document.getElementById('cbsPriority6BW').value;
        const priority2BW = document.getElementById('cbsPriority2BW').value;
        
        try {
            // Apply CBS configuration
            await this.coreconf.set('/tsn/cbs', {
                'priority-mapping': [
                    { 'pcp-range': '0-3', 'priority': 6, 'bandwidth': priority6BW * 1000000 },
                    { 'pcp-range': '4-7', 'priority': 2, 'bandwidth': priority2BW * 1000000 }
                ]
            });
            
            this.ui.updateStatus('CBS configuration applied', 'success');
            this.addLog('CBS configuration applied', 'info');
        } catch (error) {
            console.error('Failed to apply CBS config:', error);
            this.ui.showError('Failed to apply CBS configuration');
        }
    }
    
    async applyTASConfig() {
        if (!this.isConnected) return;
        
        const cycleTime = document.getElementById('tasCycleTime').value;
        const schedule = [];
        
        for (let i = 0; i < 8; i++) {
            const time = document.getElementById(`tc${i}Time`).value;
            schedule.push({
                'traffic-class': i,
                'time-slot': parseInt(time)
            });
        }
        
        try {
            // Apply TAS configuration
            await this.coreconf.set('/tsn/tas', {
                'cycle-time': parseInt(cycleTime),
                'schedule': schedule
            });
            
            this.ui.updateStatus('TAS configuration applied', 'success');
            this.addLog('TAS configuration applied', 'info');
        } catch (error) {
            console.error('Failed to apply TAS config:', error);
            this.ui.showError('Failed to apply TAS configuration');
        }
    }
    
    async applyPTPConfig() {
        if (!this.isConnected) return;
        
        const mode = document.getElementById('ptpMode').value;
        const domain = document.getElementById('ptpDomain').value;
        
        try {
            // Apply PTP configuration
            await this.coreconf.set('/tsn/ptp', {
                'mode': mode,
                'domain': parseInt(domain)
            });
            
            this.ui.updateStatus('PTP configuration applied', 'success');
            this.addLog('PTP configuration applied', 'info');
        } catch (error) {
            console.error('Failed to apply PTP config:', error);
            this.ui.showError('Failed to apply PTP configuration');
        }
    }
    
    async startMonitoring() {
        if (!this.isConnected) return;
        
        document.getElementById('startMonitorBtn').style.display = 'none';
        document.getElementById('stopMonitorBtn').style.display = 'block';
        
        await this.monitoring.start();
        this.monitoring.on('data', (data) => this.updateMonitoringData(data));
        
        this.ui.updateStatus('Monitoring started', 'success');
        this.addLog('Real-time monitoring started', 'info');
    }
    
    stopMonitoring() {
        document.getElementById('startMonitorBtn').style.display = 'block';
        document.getElementById('stopMonitorBtn').style.display = 'none';
        
        this.monitoring.stop();
        
        this.ui.updateStatus('Monitoring stopped', 'info');
        this.addLog('Real-time monitoring stopped', 'info');
    }
    
    updateMonitoringData(data) {
        // Update port statistics
        const portStats = document.getElementById('portStats');
        portStats.innerHTML = '';
        
        if (data.ports) {
            data.ports.forEach(port => {
                const row = document.createElement('div');
                row.className = 'stat-row';
                row.innerHTML = `
                    <span>${port.name}</span>
                    <span>RX: ${this.formatBytes(port.rxBytes)} | TX: ${this.formatBytes(port.txBytes)}</span>
                `;
                portStats.appendChild(row);
            });
        }
        
        // Update chart if needed
        if (this.monitoring.chart) {
            this.monitoring.chart.update();
        }
    }
    
    async rebootDevice() {
        if (!this.isConnected) return;
        
        if (confirm('Are you sure you want to reboot the device?')) {
            try {
                await this.coreconf.action('/ietf-system:system/restart');
                this.ui.updateStatus('Device reboot initiated', 'warning');
                this.addLog('Device reboot initiated', 'warning');
            } catch (error) {
                console.error('Failed to reboot device:', error);
                this.ui.showError('Failed to reboot device');
            }
        }
    }
    
    async saveConfiguration() {
        if (!this.isConnected) return;
        
        try {
            await this.coreconf.action('/save-config');
            this.ui.updateStatus('Configuration saved', 'success');
            this.addLog('Configuration saved to device', 'info');
        } catch (error) {
            console.error('Failed to save config:', error);
            this.ui.showError('Failed to save configuration');
        }
    }
    
    async exportConfig() {
        if (!this.isConnected) return;
        
        try {
            const config = await this.coreconf.getFullConfig();
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `velocitysp-config-${Date.now()}.json`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.ui.updateStatus('Configuration exported', 'success');
        } catch (error) {
            console.error('Failed to export config:', error);
            this.ui.showError('Failed to export configuration');
        }
    }
    
    importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const config = JSON.parse(text);
                
                // Apply configuration
                await this.coreconf.applyFullConfig(config);
                
                this.ui.updateStatus('Configuration imported', 'success');
                this.addLog('Configuration imported successfully', 'info');
            } catch (error) {
                console.error('Failed to import config:', error);
                this.ui.showError('Failed to import configuration');
            }
        };
        
        input.click();
    }
    
    clearLogs() {
        document.getElementById('logViewer').innerHTML = '';
        this.ui.updateStatus('Logs cleared', 'info');
    }
    
    filterLogs(level) {
        const entries = document.querySelectorAll('.log-entry');
        entries.forEach(entry => {
            if (level === 'all' || entry.classList.contains(level)) {
                entry.style.display = 'block';
            } else {
                entry.style.display = 'none';
            }
        });
    }
    
    addLog(message, level = 'info') {
        const logViewer = document.getElementById('logViewer');
        const entry = document.createElement('div');
        entry.className = `log-entry ${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${message}`;
        
        logViewer.appendChild(entry);
        logViewer.scrollTop = logViewer.scrollHeight;
    }
    
    updateDeviceStatus(status) {
        // Update various UI elements based on device status
        if (status.uptime) {
            document.getElementById('uptime').textContent = `Uptime: ${this.formatUptime(status.uptime)}`;
        }
    }
    
    loadSavedConfigs() {
        // Load saved configurations from localStorage
        const savedConfigs = localStorage.getItem('velocitysp-configs');
        if (savedConfigs) {
            try {
                const configs = JSON.parse(savedConfigs);
                console.log('Loaded saved configurations:', configs);
            } catch (error) {
                console.error('Failed to load saved configs:', error);
            }
        }
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VelocityDriveSPApp();
});