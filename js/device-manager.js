// Multi-Device Management System
// Supports simultaneous connections to multiple VelocityDRIVE SP devices

export class DeviceManager extends EventTarget {
    constructor() {
        super();
        this.devices = new Map();
        this.activeDeviceId = null;
        this.discoveryService = new DeviceDiscoveryService();
        this.connectionProfiles = new Map();
        
        // Load saved connection profiles
        this.loadConnectionProfiles();
    }
    
    // Device discovery service
    async startDiscovery() {
        try {
            // Start serial port discovery
            const serialDevices = await this.discoverSerialDevices();
            
            // Start IP-based discovery
            const ipDevices = await this.discoverIPDevices();
            
            const allDevices = [...serialDevices, ...ipDevices];
            
            this.dispatchEvent(new CustomEvent('devicesDiscovered', {
                detail: { devices: allDevices }
            }));
            
            return allDevices;
            
        } catch (error) {
            console.error('Device discovery failed:', error);
            throw error;
        }
    }
    
    // Discover serial devices
    async discoverSerialDevices() {
        if (!('serial' in navigator)) {
            return [];
        }
        
        try {
            const ports = await navigator.serial.getPorts();
            const devices = [];
            
            for (const port of ports) {
                const info = port.getInfo();
                devices.push({
                    id: `serial-${info.usbVendorId}-${info.usbProductId}`,
                    type: 'serial',
                    name: `USB Serial Device`,
                    connectionType: 'MUP1',
                    port: port,
                    info: info,
                    status: 'discovered'
                });
            }
            
            return devices;
            
        } catch (error) {
            console.error('Serial device discovery failed:', error);
            return [];
        }
    }
    
    // Discover IP-based devices
    async discoverIPDevices() {
        const devices = [];
        
        // Common VelocityDRIVE SP IP addresses
        const commonIPs = [
            '192.168.1.100',
            '192.168.0.100',
            '10.0.0.100',
            '172.16.0.100'
        ];
        
        const discoveryPromises = commonIPs.map(ip => this.probeIPDevice(ip));
        const results = await Promise.allSettled(discoveryPromises);
        
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                devices.push({
                    id: `ip-${commonIPs[index]}`,
                    type: 'ip',
                    name: `VelocityDRIVE SP (${commonIPs[index]})`,
                    connectionType: 'CoAP',
                    ipAddress: commonIPs[index],
                    port: 5683, // Default CoAP port
                    info: result.value,
                    status: 'discovered'
                });
            }
        });
        
        return devices;
    }
    
    // Probe IP device using CoAP discovery
    async probeIPDevice(ipAddress) {
        try {
            // Send CoAP GET request to /.well-known/core
            const response = await this.sendCoapDiscovery(ipAddress);
            
            if (response && response.includes('velocitysp')) {
                return {
                    deviceType: 'VelocityDRIVE SP',
                    ipAddress: ipAddress,
                    coapEndpoint: `coap://${ipAddress}:5683`,
                    discoveredAt: Date.now()
                };
            }
            
            return null;
            
        } catch (error) {
            // Device not reachable or not a VelocityDRIVE SP
            return null;
        }
    }
    
    // Send CoAP discovery request
    async sendCoapDiscovery(ipAddress) {
        // Implement CoAP over UDP discovery
        // This is a simplified implementation
        try {
            const coapClient = new CoAPClient();
            const response = await coapClient.get(`coap://${ipAddress}:5683/.well-known/core`);
            return response;
        } catch (error) {
            return null;
        }
    }
    
    // Connect to device
    async connectDevice(deviceId, options = {}) {
        const deviceInfo = await this.getDeviceInfo(deviceId);
        if (!deviceInfo) {
            throw new Error(`Device ${deviceId} not found`);
        }
        
        let device;
        
        if (deviceInfo.type === 'serial') {
            device = await this.connectSerialDevice(deviceId, deviceInfo, options);
        } else if (deviceInfo.type === 'ip') {
            device = await this.connectIPDevice(deviceId, deviceInfo, options);
        } else {
            throw new Error(`Unsupported device type: ${deviceInfo.type}`);
        }
        
        // Store device connection
        this.devices.set(deviceId, device);
        
        // Set as active device if no active device exists
        if (!this.activeDeviceId) {
            this.activeDeviceId = deviceId;
        }
        
        // Start device monitoring
        this.startDeviceMonitoring(deviceId);
        
        this.dispatchEvent(new CustomEvent('deviceConnected', {
            detail: { deviceId, device }
        }));
        
        return device;
    }
    
    // Connect serial device
    async connectSerialDevice(deviceId, deviceInfo, options) {
        const { SerialController } = await import('./serial-controller.js');
        const { MUP1Protocol } = await import('./mup1-protocol.js');
        const { CORECONFClient } = await import('./coreconf-client.js');
        
        const serial = new SerialController();
        const protocol = new MUP1Protocol();
        const coreconf = new CORECONFClient(serial, protocol);
        
        // Connect to serial port
        await serial.connect(deviceInfo.port, {
            baudRate: options.baudRate || 115200,
            dataBits: options.dataBits || 8,
            stopBits: options.stopBits || 1,
            parity: options.parity || 'none'
        });
        
        // Get device information
        const systemInfo = await coreconf.get('/ietf-system:system-state');
        
        const device = {
            id: deviceId,
            type: 'serial',
            name: systemInfo?.hostname || deviceInfo.name,
            connectionType: 'MUP1',
            serial: serial,
            protocol: protocol,
            coreconf: coreconf,
            systemInfo: systemInfo,
            status: 'connected',
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            statistics: {
                rxBytes: 0,
                txBytes: 0,
                rxMessages: 0,
                txMessages: 0,
                errors: 0
            }
        };
        
        // Setup event handlers
        serial.on('data', (data) => this.handleDeviceData(deviceId, data));
        serial.on('error', (error) => this.handleDeviceError(deviceId, error));
        serial.on('disconnected', () => this.handleDeviceDisconnected(deviceId));
        
        return device;
    }
    
    // Connect IP device
    async connectIPDevice(deviceId, deviceInfo, options) {
        const { CoAPClient } = await import('./coap-client.js');
        const { CORECONFClient } = await import('./coreconf-client.js');
        
        const coap = new CoAPClient();
        const coreconf = new CORECONFClient(coap, null);
        
        // Connect to CoAP endpoint
        await coap.connect(`coap://${deviceInfo.ipAddress}:${deviceInfo.port || 5683}`, {
            dtls: options.dtls || false,
            psk: options.psk,
            identity: options.identity
        });
        
        // Get device information
        const systemInfo = await coreconf.get('/ietf-system:system-state');
        
        const device = {
            id: deviceId,
            type: 'ip',
            name: systemInfo?.hostname || deviceInfo.name,
            connectionType: 'CoAP',
            coap: coap,
            coreconf: coreconf,
            systemInfo: systemInfo,
            status: 'connected',
            connectedAt: Date.now(),
            lastActivity: Date.now(),
            statistics: {
                rxBytes: 0,
                txBytes: 0,
                rxMessages: 0,
                txMessages: 0,
                errors: 0
            }
        };
        
        // Setup event handlers
        coap.on('message', (message) => this.handleDeviceData(deviceId, message));
        coap.on('error', (error) => this.handleDeviceError(deviceId, error));
        coap.on('disconnected', () => this.handleDeviceDisconnected(deviceId));
        
        return device;
    }
    
    // Disconnect device
    async disconnectDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        
        try {
            // Stop monitoring
            this.stopDeviceMonitoring(deviceId);
            
            // Disconnect based on type
            if (device.type === 'serial') {
                await device.serial.disconnect();
            } else if (device.type === 'ip') {
                await device.coap.disconnect();
            }
            
            // Update device status
            device.status = 'disconnected';
            device.disconnectedAt = Date.now();
            
            // Remove from active devices
            this.devices.delete(deviceId);
            
            // Switch active device if this was active
            if (this.activeDeviceId === deviceId) {
                this.activeDeviceId = this.devices.size > 0 ? this.devices.keys().next().value : null;
            }
            
            this.dispatchEvent(new CustomEvent('deviceDisconnected', {
                detail: { deviceId, device }
            }));
            
        } catch (error) {
            console.error(`Failed to disconnect device ${deviceId}:`, error);
            throw error;
        }
    }
    
    // Switch active device
    switchActiveDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }
        
        if (device.status !== 'connected') {
            throw new Error(`Device ${deviceId} is not connected`);
        }
        
        const previousDeviceId = this.activeDeviceId;
        this.activeDeviceId = deviceId;
        
        this.dispatchEvent(new CustomEvent('activeDeviceChanged', {
            detail: { 
                previousDeviceId, 
                activeDeviceId: deviceId,
                device 
            }
        }));
    }
    
    // Get active device
    getActiveDevice() {
        if (!this.activeDeviceId) {
            return null;
        }
        
        return this.devices.get(this.activeDeviceId);
    }
    
    // Get all connected devices
    getConnectedDevices() {
        return Array.from(this.devices.values()).filter(device => device.status === 'connected');
    }
    
    // Get device by ID
    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }
    
    // Handle device data
    handleDeviceData(deviceId, data) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.lastActivity = Date.now();
            device.statistics.rxBytes += data.length;
            device.statistics.rxMessages++;
            
            this.dispatchEvent(new CustomEvent('deviceData', {
                detail: { deviceId, device, data }
            }));
        }
    }
    
    // Handle device error
    handleDeviceError(deviceId, error) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.statistics.errors++;
            
            this.dispatchEvent(new CustomEvent('deviceError', {
                detail: { deviceId, device, error }
            }));
        }
    }
    
    // Handle device disconnection
    handleDeviceDisconnected(deviceId) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.status = 'disconnected';
            device.disconnectedAt = Date.now();
            
            this.dispatchEvent(new CustomEvent('deviceDisconnected', {
                detail: { deviceId, device }
            }));
        }
    }
    
    // Start device monitoring
    startDeviceMonitoring(deviceId) {
        const monitoringTimer = setInterval(async () => {
            const device = this.devices.get(deviceId);
            if (!device || device.status !== 'connected') {
                clearInterval(monitoringTimer);
                return;
            }
            
            try {
                // Check device health
                const healthCheck = await device.coreconf.get('/ietf-system:system-state/current-datetime');
                
                if (healthCheck) {
                    device.lastActivity = Date.now();
                    
                    this.dispatchEvent(new CustomEvent('deviceHealthCheck', {
                        detail: { deviceId, device, healthy: true }
                    }));
                }
                
            } catch (error) {
                this.dispatchEvent(new CustomEvent('deviceHealthCheck', {
                    detail: { deviceId, device, healthy: false, error }
                }));
            }
        }, 5000); // 5 second health check
        
        // Store monitoring timer
        const device = this.devices.get(deviceId);
        if (device) {
            device.monitoringTimer = monitoringTimer;
        }
    }
    
    // Stop device monitoring
    stopDeviceMonitoring(deviceId) {
        const device = this.devices.get(deviceId);
        if (device && device.monitoringTimer) {
            clearInterval(device.monitoringTimer);
            delete device.monitoringTimer;
        }
    }
    
    // Save connection profile
    saveConnectionProfile(profileName, config) {
        const profile = {
            name: profileName,
            deviceType: config.deviceType,
            connectionType: config.connectionType,
            settings: config.settings,
            createdAt: Date.now()
        };
        
        this.connectionProfiles.set(profileName, profile);
        
        // Persist to localStorage
        localStorage.setItem('velocitysp-connection-profiles', 
            JSON.stringify(Array.from(this.connectionProfiles.entries()))
        );
        
        this.dispatchEvent(new CustomEvent('connectionProfileSaved', {
            detail: { profileName, profile }
        }));
    }
    
    // Load connection profiles
    loadConnectionProfiles() {
        try {
            const saved = localStorage.getItem('velocitysp-connection-profiles');
            if (saved) {
                const profiles = JSON.parse(saved);
                this.connectionProfiles = new Map(profiles);
            }
        } catch (error) {
            console.error('Failed to load connection profiles:', error);
        }
    }
    
    // Get connection profiles
    getConnectionProfiles() {
        return Array.from(this.connectionProfiles.values());
    }
    
    // Delete connection profile
    deleteConnectionProfile(profileName) {
        this.connectionProfiles.delete(profileName);
        
        // Persist to localStorage
        localStorage.setItem('velocitysp-connection-profiles', 
            JSON.stringify(Array.from(this.connectionProfiles.entries()))
        );
        
        this.dispatchEvent(new CustomEvent('connectionProfileDeleted', {
            detail: { profileName }
        }));
    }
    
    // Export device configuration
    async exportDeviceConfiguration(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device || device.status !== 'connected') {
            throw new Error(`Device ${deviceId} is not connected`);
        }
        
        try {
            const config = await device.coreconf.getFullConfig();
            
            return {
                deviceId,
                deviceName: device.name,
                deviceType: device.type,
                configuration: config,
                exportedAt: Date.now(),
                systemInfo: device.systemInfo
            };
            
        } catch (error) {
            console.error(`Failed to export configuration for device ${deviceId}:`, error);
            throw error;
        }
    }
    
    // Import device configuration
    async importDeviceConfiguration(deviceId, configData) {
        const device = this.devices.get(deviceId);
        if (!device || device.status !== 'connected') {
            throw new Error(`Device ${deviceId} is not connected`);
        }
        
        try {
            await device.coreconf.applyFullConfig(configData.configuration);
            
            this.dispatchEvent(new CustomEvent('deviceConfigurationImported', {
                detail: { deviceId, device, configData }
            }));
            
        } catch (error) {
            console.error(`Failed to import configuration for device ${deviceId}:`, error);
            throw error;
        }
    }
    
    // Get device statistics summary
    getDeviceStatistics() {
        const stats = {
            totalDevices: this.devices.size,
            connectedDevices: 0,
            serialDevices: 0,
            ipDevices: 0,
            totalRxBytes: 0,
            totalTxBytes: 0,
            totalErrors: 0
        };
        
        for (const device of this.devices.values()) {
            if (device.status === 'connected') {
                stats.connectedDevices++;
            }
            
            if (device.type === 'serial') {
                stats.serialDevices++;
            } else if (device.type === 'ip') {
                stats.ipDevices++;
            }
            
            stats.totalRxBytes += device.statistics.rxBytes;
            stats.totalTxBytes += device.statistics.txBytes;
            stats.totalErrors += device.statistics.errors;
        }
        
        return stats;
    }
    
    // Cleanup
    async cleanup() {
        // Disconnect all devices
        const disconnectPromises = Array.from(this.devices.keys()).map(deviceId => 
            this.disconnectDevice(deviceId).catch(error => 
                console.error(`Failed to disconnect device ${deviceId}:`, error)
            )
        );
        
        await Promise.allSettled(disconnectPromises);
        
        // Clear devices
        this.devices.clear();
        this.activeDeviceId = null;
    }
}

// Device Discovery Service
class DeviceDiscoveryService {
    constructor() {
        this.isDiscovering = false;
        this.discoveryTimer = null;
    }
    
    // Start continuous discovery
    startContinuousDiscovery(interval = 30000) {
        if (this.isDiscovering) {
            return;
        }
        
        this.isDiscovering = true;
        
        this.discoveryTimer = setInterval(async () => {
            try {
                // Perform discovery
                // This would trigger device manager discovery
            } catch (error) {
                console.error('Continuous discovery error:', error);
            }
        }, interval);
    }
    
    // Stop continuous discovery
    stopContinuousDiscovery() {
        if (this.discoveryTimer) {
            clearInterval(this.discoveryTimer);
            this.discoveryTimer = null;
        }
        
        this.isDiscovering = false;
    }
}

// Simple CoAP Client (placeholder - would need full implementation)
class CoAPClient extends EventTarget {
    constructor() {
        super();
        this.isConnected = false;
    }
    
    async connect(endpoint, options = {}) {
        // Implementation would create UDP socket and handle CoAP protocol
        this.endpoint = endpoint;
        this.options = options;
        this.isConnected = true;
        
        this.dispatchEvent(new Event('connected'));
    }
    
    async disconnect() {
        this.isConnected = false;
        this.dispatchEvent(new Event('disconnected'));
    }
    
    async get(path) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        
        // CoAP GET implementation
        // This is a placeholder - real implementation would handle CoAP protocol
        return null;
    }
}