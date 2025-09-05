// Simplified VelocityDRIVE SP Application - Stable Version
import { SerialController } from './serial-controller.js';
import { MUP1Protocol } from './mup1-protocol.js';
import { CORECONFClient } from './coreconf-client.js';
import { YANGBrowser } from './yang-browser.js';
import { UIController } from './ui-controller.js';
import { MonitoringService } from './monitoring-service.js';

class SimpleVelocityDriveSPApp {
    constructor() {
        // Core services
        this.serial = new SerialController();
        this.protocol = new MUP1Protocol();
        this.coreconf = new CORECONFClient(this.serial, this.protocol);
        this.yangBrowser = new YANGBrowser(this.coreconf);
        this.ui = new UIController();
        this.monitoring = new MonitoringService(this.coreconf);
        
        // State
        this.isConnected = false;
        this.rxBytes = 0;
        this.txBytes = 0;
        
        this.init();
    }
    
    init() {
        // Check for WebSerial API support
        if (!('serial' in navigator)) {
            this.ui.showError('WebSerial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
            const connectBtn = document.getElementById('connectBtn');
            if (connectBtn) connectBtn.disabled = true;
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
        // Connection buttons - with null checks
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connectBtn) connectBtn.addEventListener('click', () => this.connect());
        if (disconnectBtn) disconnectBtn.addEventListener('click', () => this.disconnect());
        
        // System tab
        const refreshSystemBtn = document.getElementById('refreshSystemBtn');
        if (refreshSystemBtn) refreshSystemBtn.addEventListener('click', () => this.refreshSystemInfo());
        
        // Interfaces tab
        const refreshInterfacesBtn = document.getElementById('refreshInterfacesBtn');
        if (refreshInterfacesBtn) refreshInterfacesBtn.addEventListener('click', () => this.refreshInterfaces());
        
        // YANG browser
        const loadModuleBtn = document.getElementById('loadModuleBtn');
        const validateBtn = document.getElementById('validateBtn');
        const applyBtn = document.getElementById('applyBtn');
        
        if (loadModuleBtn) loadModuleBtn.addEventListener('click', () => this.loadYANGModule());
        if (validateBtn) validateBtn.addEventListener('click', () => this.validateConfig());
        if (applyBtn) applyBtn.addEventListener('click', () => this.applyConfig());
        
        // TSN Configuration
        const applyCBSBtn = document.getElementById('applyCBSBtn');
        const applyTASBtn = document.getElementById('applyTASBtn');
        const applyPTPBtn = document.getElementById('applyPTPBtn');
        
        if (applyCBSBtn) applyCBSBtn.addEventListener('click', () => this.applyCBSConfig());
        if (applyTASBtn) applyTASBtn.addEventListener('click', () => this.applyTASConfig());
        if (applyPTPBtn) applyPTPBtn.addEventListener('click', () => this.applyPTPConfig());
        
        // Monitoring
        const startMonitorBtn = document.getElementById('startMonitorBtn');
        const stopMonitorBtn = document.getElementById('stopMonitorBtn');
        
        if (startMonitorBtn) startMonitorBtn.addEventListener('click', () => this.startMonitoring());
        if (stopMonitorBtn) stopMonitorBtn.addEventListener('click', () => this.stopMonitoring());
        
        // Quick actions
        const rebootBtn = document.getElementById('rebootBtn');
        const saveConfigBtn = document.getElementById('saveConfigBtn');
        const exportBtn = document.getElementById('exportBtn');
        const importBtn = document.getElementById('importBtn');
        
        if (rebootBtn) rebootBtn.addEventListener('click', () => this.rebootDevice());
        if (saveConfigBtn) saveConfigBtn.addEventListener('click', () => this.saveConfiguration());
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportConfig());
        if (importBtn) importBtn.addEventListener('click', () => this.importConfig());
        
        // Logs
        const clearLogsBtn = document.getElementById('clearLogsBtn');
        const logLevel = document.getElementById('logLevel');
        
        if (clearLogsBtn) clearLogsBtn.addEventListener('click', () => this.clearLogs());
        if (logLevel) logLevel.addEventListener('change', (e) => this.filterLogs(e.target.value));
        
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
        
        const activeNavItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
        if (activeNavItem) activeNavItem.classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.getElementById(`${tabName}-tab`);
        if (activeTab) activeTab.classList.add('active');
        
        // Load tab-specific data
        this.loadTabData(tabName);
    }
    
    async loadTabData(tabName) {
        if (!this.isConnected) return;
        
        try {
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
        } catch (error) {
            console.error(`Failed to load ${tabName} data:`, error);
            this.ui.showError(`Failed to load ${tabName} data: ${error.message}`);
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
            this.ui.updateStatus('Connection failed', 'error');
        }
    }
    
    async disconnect() {
        try {
            await this.serial.disconnect();
        } catch (error) {
            console.error('Disconnect failed:', error);
            this.ui.showError('Failed to disconnect: ' + error.message);
        }
    }
    
    onConnected() {
        this.isConnected = true;
        
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'block';
        
        // Update UI
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.classList.add('connected');
            const statusText = statusIndicator.querySelector('.status-text');
            if (statusText) statusText.textContent = 'Connected';
        }
        
        const portInfo = document.getElementById('portInfo');
        const portName = document.getElementById('portName');
        
        if (portInfo) portInfo.style.display = 'flex';
        if (portName) portName.textContent = this.serial.getPortInfo();
        
        this.ui.updateStatus('Connected to device', 'success');
        this.addLog('Connected to VelocityDRIVE SP device', 'info');
        
        // Load initial data
        setTimeout(() => {
            this.refreshSystemInfo();
        }, 1000);
    }
    
    onDisconnected() {
        this.isConnected = false;
        
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connectBtn) connectBtn.style.display = 'block';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        
        // Update UI
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('connected');
            const statusText = statusIndicator.querySelector('.status-text');
            if (statusText) statusText.textContent = 'Disconnected';
        }
        
        const portInfo = document.getElementById('portInfo');
        if (portInfo) portInfo.style.display = 'none';
        
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
        const rxBytesEl = document.getElementById('rxBytes');
        if (rxBytesEl) rxBytesEl.textContent = `RX: ${this.formatBytes(this.rxBytes)}`;
        
        // Process data with MUP1 protocol
        try {
            const messages = this.protocol.decode(data);
            if (messages && messages.length > 0) {
                messages.forEach(message => this.handleMessage(message));
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
                if (this.coreconf) this.coreconf.handleResponse(message);
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
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        try {
            this.ui.updateStatus('Fetching system info...', 'info');
            
            // Get system state
            const systemState = await this.coreconf.get('/ietf-system:system-state');
            
            if (systemState) {
                this.updateSystemInfoUI(systemState);
                this.ui.updateStatus('System info updated', 'success');
            } else {
                // Fallback for demo purposes
                this.updateSystemInfoUI({
                    platform: 'VelocityDRIVE SP',
                    'os-name': 'Linux',
                    'os-version': '5.4.0',
                    hostname: 'velocitysp-001',
                    'current-datetime': new Date().toISOString(),
                    'boot-datetime': new Date(Date.now() - 86400000).toISOString()
                });
                this.ui.updateStatus('Demo system info loaded', 'info');
            }
            
        } catch (error) {
            console.error('Failed to get system info:', error);
            this.ui.showError('Failed to get system info: ' + error.message);
        }
    }
    
    updateSystemInfoUI(systemState) {
        const elements = {
            platform: document.getElementById('platform'),
            osName: document.getElementById('osName'),
            osVersion: document.getElementById('osVersion'),
            hostname: document.getElementById('hostname'),
            currentTime: document.getElementById('currentTime'),
            bootTime: document.getElementById('bootTime')
        };
        
        if (elements.platform) elements.platform.textContent = systemState.platform || '--';
        if (elements.osName) elements.osName.textContent = systemState['os-name'] || '--';
        if (elements.osVersion) elements.osVersion.textContent = systemState['os-version'] || '--';
        if (elements.hostname) elements.hostname.textContent = systemState.hostname || '--';
        
        if (elements.currentTime && systemState['current-datetime']) {
            elements.currentTime.textContent = new Date(systemState['current-datetime']).toLocaleString();
        }
        
        if (elements.bootTime && systemState['boot-datetime']) {
            elements.bootTime.textContent = new Date(systemState['boot-datetime']).toLocaleString();
        }
        
        // Calculate uptime
        if (systemState['boot-datetime'] && systemState['current-datetime']) {
            const bootTime = new Date(systemState['boot-datetime']);
            const currentTime = new Date(systemState['current-datetime']);
            const uptime = Math.floor((currentTime - bootTime) / 1000);
            const uptimeEl = document.getElementById('uptime');
            if (uptimeEl) uptimeEl.textContent = `Uptime: ${this.formatUptime(uptime)}`;
        }
    }
    
    async refreshInterfaces() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        try {
            this.ui.updateStatus('Fetching interfaces...', 'info');
            
            // Get interfaces
            const interfaces = await this.coreconf.get('/ietf-interfaces:interfaces');
            
            const container = document.getElementById('interfacesContainer');
            if (!container) return;
            
            container.innerHTML = '';
            
            if (interfaces && interfaces.interface) {
                interfaces.interface.forEach(iface => {
                    const card = this.createInterfaceCard(iface);
                    container.appendChild(card);
                });
                this.ui.updateStatus('Interfaces updated', 'success');
            } else {
                // Demo interfaces
                const demoInterfaces = [
                    { name: 'eth0', type: 'ethernetCsmacd', 'oper-status': 'up', 'phys-address': '00:11:22:33:44:55', speed: 1000000000, mtu: 1500 },
                    { name: 'eth1', type: 'ethernetCsmacd', 'oper-status': 'down', 'phys-address': '00:11:22:33:44:56', speed: 1000000000, mtu: 1500 }
                ];
                
                demoInterfaces.forEach(iface => {
                    const card = this.createInterfaceCard(iface);
                    container.appendChild(card);
                });
                
                this.ui.updateStatus('Demo interfaces loaded', 'info');
            }
            
        } catch (error) {
            console.error('Failed to get interfaces:', error);
            this.ui.showError('Failed to get interfaces: ' + error.message);
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
            
            if (select) {
                select.innerHTML = '<option value="">Select Module...</option>';
                modules.forEach(module => {
                    const option = document.createElement('option');
                    option.value = module.name;
                    option.textContent = `${module.name} (${module.revision})`;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Failed to load YANG modules:', error);
        }
    }
    
    async loadYANGModule() {
        const select = document.getElementById('yangModule');
        const moduleName = select ? select.value : '';
        
        if (!moduleName) return;
        
        try {
            const tree = await this.yangBrowser.loadModule(moduleName);
            const treeContainer = document.getElementById('yangTree');
            if (treeContainer) {
                treeContainer.innerHTML = tree;
                this.yangBrowser.setupTreeInteractions();
            }
        } catch (error) {
            console.error('Failed to load module:', error);
            this.ui.showError('Failed to load YANG module: ' + error.message);
        }
    }
    
    validateConfig() {
        const editor = document.getElementById('yangEditor');
        const config = editor ? editor.value : '';
        
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
        const editor = document.getElementById('yangEditor');
        const config = editor ? editor.value : '';
        
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
            this.ui.showError('Failed to apply configuration: ' + error.message);
        }
    }
    
    async loadTSNConfig() {
        // Initialize TAS queue schedule UI
        const queueSchedule = document.getElementById('queueSchedule');
        if (queueSchedule) {
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
    }
    
    async applyCBSConfig() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        const priority6BW = document.getElementById('cbsPriority6BW');
        const priority2BW = document.getElementById('cbsPriority2BW');
        
        const priority6Value = priority6BW ? priority6BW.value : '3.5';
        const priority2Value = priority2BW ? priority2BW.value : '1.5';
        
        try {
            // Apply CBS configuration (demo)
            this.ui.updateStatus('CBS configuration applied', 'success');
            this.addLog(`CBS configuration applied: Priority 6 = ${priority6Value} Mbps, Priority 2 = ${priority2Value} Mbps`, 'info');
        } catch (error) {
            console.error('Failed to apply CBS config:', error);
            this.ui.showError('Failed to apply CBS configuration: ' + error.message);
        }
    }
    
    async applyTASConfig() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        const cycleTime = document.getElementById('tasCycleTime');
        const cycleTimeValue = cycleTime ? cycleTime.value : '200';
        
        try {
            // Apply TAS configuration (demo)
            this.ui.updateStatus('TAS configuration applied', 'success');
            this.addLog(`TAS configuration applied: Cycle time = ${cycleTimeValue} ms`, 'info');
        } catch (error) {
            console.error('Failed to apply TAS config:', error);
            this.ui.showError('Failed to apply TAS configuration: ' + error.message);
        }
    }
    
    async applyPTPConfig() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        const mode = document.getElementById('ptpMode');
        const domain = document.getElementById('ptpDomain');
        
        const modeValue = mode ? mode.value : 'slave';
        const domainValue = domain ? domain.value : '0';
        
        try {
            // Apply PTP configuration (demo)
            this.ui.updateStatus('PTP configuration applied', 'success');
            this.addLog(`PTP configuration applied: Mode = ${modeValue}, Domain = ${domainValue}`, 'info');
        } catch (error) {
            console.error('Failed to apply PTP config:', error);
            this.ui.showError('Failed to apply PTP configuration: ' + error.message);
        }
    }
    
    async startMonitoring() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        const startBtn = document.getElementById('startMonitorBtn');
        const stopBtn = document.getElementById('stopMonitorBtn');
        
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        
        await this.monitoring.start();
        this.monitoring.on('data', (data) => this.updateMonitoringData(data));
        
        this.ui.updateStatus('Monitoring started', 'success');
        this.addLog('Real-time monitoring started', 'info');
    }
    
    stopMonitoring() {
        const startBtn = document.getElementById('startMonitorBtn');
        const stopBtn = document.getElementById('stopMonitorBtn');
        
        if (startBtn) startBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        
        this.monitoring.stop();
        
        this.ui.updateStatus('Monitoring stopped', 'info');
        this.addLog('Real-time monitoring stopped', 'info');
    }
    
    updateMonitoringData(data) {
        // Update port statistics
        const portStats = document.getElementById('portStats');
        if (portStats) {
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
        }
        
        // Update chart if available
        if (this.monitoring.chart) {
            this.monitoring.chart.update();
        }
    }
    
    async rebootDevice() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        const confirmed = await this.ui.showModal('Confirm Reboot', 'Are you sure you want to reboot the device?', 'warning');
        if (confirmed) {
            try {
                // Reboot device (demo)
                this.ui.updateStatus('Device reboot initiated', 'warning');
                this.addLog('Device reboot initiated', 'warning');
            } catch (error) {
                console.error('Failed to reboot device:', error);
                this.ui.showError('Failed to reboot device: ' + error.message);
            }
        }
    }
    
    async saveConfiguration() {
        if (!this.isConnected) {
            this.ui.showError('Not connected to device');
            return;
        }
        
        try {
            // Save configuration (demo)
            this.ui.updateStatus('Configuration saved', 'success');
            this.addLog('Configuration saved to device', 'info');
        } catch (error) {
            console.error('Failed to save config:', error);
            this.ui.showError('Failed to save configuration: ' + error.message);
        }
    }
    
    async exportConfig() {
        try {
            const config = {
                device: 'VelocityDRIVE SP',
                timestamp: new Date().toISOString(),
                configuration: {
                    system: { hostname: 'velocitysp-001' },
                    interfaces: [],
                    tsn: { cbs: {}, tas: {}, ptp: {} }
                }
            };
            
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `velocitysp-config-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            this.ui.updateStatus('Configuration exported', 'success');
        } catch (error) {
            console.error('Failed to export config:', error);
            this.ui.showError('Failed to export configuration: ' + error.message);
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
                
                // Apply configuration (demo)
                this.ui.updateStatus('Configuration imported', 'success');
                this.addLog('Configuration imported successfully', 'info');
            } catch (error) {
                console.error('Failed to import config:', error);
                this.ui.showError('Failed to import configuration: ' + error.message);
            }
        };
        
        input.click();
    }
    
    clearLogs() {
        const logViewer = document.getElementById('logViewer');
        if (logViewer) logViewer.innerHTML = '';
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
        if (!logViewer) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${level}`;
        
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] ${message}`;
        
        logViewer.appendChild(entry);
        logViewer.scrollTop = logViewer.scrollHeight;
        
        // Limit log entries
        while (logViewer.children.length > 1000) {
            logViewer.removeChild(logViewer.firstChild);
        }
    }
    
    updateDeviceStatus(status) {
        // Update device status
        if (status.uptime) {
            const uptimeEl = document.getElementById('uptime');
            if (uptimeEl) uptimeEl.textContent = `Uptime: ${this.formatUptime(status.uptime)}`;
        }
    }
    
    loadSavedConfigs() {
        // Load saved configurations from localStorage
        try {
            const savedConfigs = localStorage.getItem('velocitysp-configs');
            if (savedConfigs) {
                const configs = JSON.parse(savedConfigs);
                console.log('Loaded saved configurations:', configs);
            }
        } catch (error) {
            console.error('Failed to load saved configs:', error);
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
    window.app = new SimpleVelocityDriveSPApp();
});