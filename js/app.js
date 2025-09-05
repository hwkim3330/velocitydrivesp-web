// Main Application Module - Enhanced VelocityDRIVE SP Configuration Tool
import { SerialController } from './serial-controller.js';
import { MUP1Protocol } from './mup1-protocol.js';
import { CORECONFClient } from './coreconf-client.js';
import { YANGBrowser } from './yang-browser.js';
import { UIController } from './ui-controller.js';
import { MonitoringService } from './monitoring-service.js';
import { DeviceManager } from './device-manager.js';
import { FRERManager } from './frer-manager.js';
import { PSFPManager } from './psfp-manager.js';
import { CoAPClient } from './coap-client.js';

class VelocityDriveSPApp {
    constructor() {
        // Core services
        this.ui = new UIController();
        this.deviceManager = new DeviceManager();
        
        // Current device services (will be set when device is connected)
        this.coreconf = null;
        this.yangBrowser = null;
        this.monitoring = null;
        this.frermgr = null;
        this.psfpmgr = null;
        
        // Application state
        this.isConnected = false;
        this.currentDevice = null;
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
        
        // Device manager event handlers (will be set up after device connection)
        if (this.deviceManager) {
            this.deviceManager.on('deviceConnected', (event) => {
                this.onDeviceConnected(event.detail);
            });
            
            this.deviceManager.on('deviceDisconnected', (event) => {
                this.onDeviceDisconnected(event.detail);
            });
            
            this.deviceManager.on('deviceError', (event) => {
                this.onDeviceError(event.detail);
            });
        }
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
            this.ui.updateStatus('Discovering devices...', 'info');
            
            // Show device selection dialog
            const devices = await this.deviceManager.startDiscovery();
            const selectedDevice = await this.showDeviceSelectionDialog(devices);
            
            if (!selectedDevice) {
                this.ui.updateStatus('Connection cancelled', 'warning');
                return;
            }
            
            this.ui.updateStatus('Connecting to device...', 'info');
            
            // Connect to selected device
            const device = await this.deviceManager.connectDevice(selectedDevice, {
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            });
            
            // Setup device services
            await this.setupDeviceServices(device);
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.ui.showError('Failed to connect: ' + error.message);
        }
    }
    
    // Show device selection dialog
    async showDeviceSelectionDialog(devices) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');
            const modalConfirm = document.getElementById('modalConfirm');
            const modalCancel = document.getElementById('modalCancel');
            
            modalTitle.textContent = 'Select Device';
            modalConfirm.textContent = 'Connect';
            modalCancel.style.display = 'inline-block';
            
            let selectedDevice = null;
            
            // Create device list
            const deviceList = document.createElement('div');
            deviceList.className = 'device-list';
            
            if (devices.length === 0) {
                deviceList.innerHTML = '<p>No devices found. Please connect a VelocityDRIVE SP device.</p>';
                modalConfirm.disabled = true;
            } else {
                devices.forEach((device, index) => {
                    const deviceItem = document.createElement('div');
                    deviceItem.className = 'device-item';
                    deviceItem.innerHTML = `
                        <input type="radio" name="device" id="device${index}" value="${device.id}">
                        <label for="device${index}">
                            <div class="device-info">
                                <div class="device-name">${device.name}</div>
                                <div class="device-type">${device.connectionType} (${device.type})</div>
                                <div class="device-details">${device.type === 'serial' ? 'USB Serial' : device.ipAddress}</div>
                            </div>
                        </label>
                    `;
                    
                    const radio = deviceItem.querySelector('input[type="radio"]');
                    radio.addEventListener('change', () => {
                        if (radio.checked) {
                            selectedDevice = device;
                            modalConfirm.disabled = false;
                        }
                    });
                    
                    deviceList.appendChild(deviceItem);
                });
            }
            
            modalBody.innerHTML = '';
            modalBody.appendChild(deviceList);
            
            // Add "Request New Serial Port" button for manual selection
            const requestButton = document.createElement('button');
            requestButton.className = 'btn btn-secondary';
            requestButton.textContent = 'Request New Serial Port';
            requestButton.onclick = async () => {
                try {
                    const port = await navigator.serial.requestPort();
                    const info = port.getInfo();
                    selectedDevice = {
                        id: `manual-${Date.now()}`,
                        type: 'serial',
                        name: 'Manual Serial Device',
                        connectionType: 'MUP1',
                        port: port,
                        info: info,
                        status: 'discovered'
                    };
                    modalConfirm.disabled = false;
                } catch (error) {
                    console.error('Failed to request serial port:', error);
                }
            };
            modalBody.appendChild(requestButton);
            
            modal.style.display = 'flex';
            
            const handleConfirm = () => {
                modal.style.display = 'none';
                modalConfirm.removeEventListener('click', handleConfirm);
                modalCancel.removeEventListener('click', handleCancel);
                resolve(selectedDevice);
            };
            
            const handleCancel = () => {
                modal.style.display = 'none';
                modalConfirm.removeEventListener('click', handleConfirm);
                modalCancel.removeEventListener('click', handleCancel);
                resolve(null);
            };
            
            modalConfirm.addEventListener('click', handleConfirm);
            modalCancel.addEventListener('click', handleCancel);
        });
    }
    
    // Setup device services after connection
    async setupDeviceServices(device) {
        this.currentDevice = device;
        this.coreconf = device.coreconf;
        
        // Initialize YANG browser
        this.yangBrowser = new YANGBrowser(this.coreconf);
        
        // Initialize monitoring service
        this.monitoring = new MonitoringService(this.coreconf);
        
        // Initialize FRER manager
        this.frermgr = new FRERManager(this.coreconf);
        await this.frermgr.initialize().catch(error => 
            console.warn('FRER initialization failed:', error)
        );
        
        // Initialize PSFP manager
        this.psfpmgr = new PSFPManager(this.coreconf);
        await this.psfpmgr.initialize().catch(error => 
            console.warn('PSFP initialization failed:', error)
        );
        
        // Setup event handlers
        this.setupDeviceEventHandlers(device);
        
        // Mark as connected
        this.isConnected = true;
        
        this.ui.updateStatus(`Connected to ${device.name}`, 'success');
    }
    
    // Setup device event handlers
    setupDeviceEventHandlers(device) {
        // Device manager events
        this.deviceManager.on('deviceData', (event) => {
            if (event.detail.deviceId === device.id) {
                this.handleDeviceData(event.detail.data);
            }
        });
        
        this.deviceManager.on('deviceError', (event) => {
            if (event.detail.deviceId === device.id) {
                this.handleDeviceError(event.detail.error);
            }
        });
        
        this.deviceManager.on('deviceDisconnected', (event) => {
            if (event.detail.deviceId === device.id) {
                this.handleDeviceDisconnected();
            }
        });
        
        // FRER events
        if (this.frermgr) {
            this.frermgr.on('statisticsUpdated', (event) => {
                this.updateFRERStatistics(event.detail);
            });
        }
        
        // PSFP events
        if (this.psfpmgr) {
            this.psfpmgr.on('statisticsUpdated', (event) => {
                this.updatePSFPStatistics(event.detail);
            });
        }
    }
    
    // Handle device data
    handleDeviceData(data) {
        this.rxBytes += data.length;
        document.getElementById('rxBytes').textContent = `RX: ${this.formatBytes(this.rxBytes)}`;
    }
    
    // Handle device error
    handleDeviceError(error) {
        console.error('Device error:', error);
        this.ui.showError('Device error: ' + error.message);
        this.addLog('Device error: ' + error.message, 'error');
    }
    
    // Handle device disconnection
    handleDeviceDisconnected() {
        this.isConnected = false;
        this.currentDevice = null;
        this.coreconf = null;
        
        // Update UI
        document.getElementById('connectBtn').style.display = 'block';
        document.getElementById('disconnectBtn').style.display = 'none';
        
        const statusIndicator = document.getElementById('statusIndicator');
        statusIndicator.classList.remove('connected');
        statusIndicator.querySelector('.status-text').textContent = 'Disconnected';
        
        document.getElementById('portInfo').style.display = 'none';
        
        this.ui.updateStatus('Device disconnected', 'warning');
        this.addLog('Device disconnected', 'warning');
        
        // Stop monitoring
        if (this.monitoring) {
            this.monitoring.stop();
        }
        if (this.frermgr) {
            this.frermgr.stopMonitoring();
        }
        if (this.psfpmgr) {
            this.psfpmgr.stopMonitoring();
        }
    }
    
    async disconnect() {
        try {
            if (this.currentDevice) {
                await this.deviceManager.disconnectDevice(this.currentDevice.id);
            }
        } catch (error) {
            console.error('Disconnect failed:', error);
            this.ui.showError('Failed to disconnect: ' + error.message);
        }
    }
    
    // Device connection event handlers
    onDeviceConnected(deviceData) {
        const { deviceId, device } = deviceData;
        this.isConnected = true;
        this.currentDevice = device;
        
        // Update UI
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'block';
        
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.classList.add('connected');
            const statusText = statusIndicator.querySelector('.status-text');
            if (statusText) statusText.textContent = 'Connected';
        }
        
        const portInfo = document.getElementById('portInfo');
        const portName = document.getElementById('portName');
        
        if (portInfo && portName) {
            portInfo.style.display = 'flex';
            portName.textContent = device.name || device.id;
        }
        
        this.ui.updateStatus(`Connected to ${device.name}`, 'success');
        this.addLog(`Connected to ${device.name}`, 'info');
        
        // Load initial data
        this.refreshSystemInfo();
    }
    
    onDeviceDisconnected(deviceData) {
        this.handleDeviceDisconnected();
    }
    
    onDeviceError(deviceData) {
        const { error } = deviceData;
        this.handleDeviceError(error);
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