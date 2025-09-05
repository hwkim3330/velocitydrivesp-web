// PSFP (Per-Stream Filtering and Policing) Manager
// IEEE 802.1Qci implementation for stream filtering and policing

export class PSFPManager extends EventTarget {
    constructor(coreconfClient) {
        super();
        this.coreconf = coreconfClient;
        this.streamFilters = new Map();
        this.streamGates = new Map();
        this.flowMeters = new Map();
        this.isEnabled = false;
    }
    
    // Initialize PSFP functionality
    async initialize() {
        try {
            // Check if PSFP is supported by the device
            const capability = await this.checkPSFPCapability();
            if (!capability) {
                throw new Error('PSFP not supported by this device');
            }
            
            // Load current PSFP configuration
            await this.loadConfiguration();
            
            this.isEnabled = true;
            this.dispatchEvent(new Event('initialized'));
            
        } catch (error) {
            console.error('Failed to initialize PSFP:', error);
            throw error;
        }
    }
    
    // Check PSFP capability
    async checkPSFPCapability() {
        try {
            const capabilities = await this.coreconf.get('/ieee802-dot1q-psfp-bridge:capabilities');
            return capabilities && capabilities['psfp-supported'];
        } catch (error) {
            console.warn('PSFP capability check failed:', error);
            return false;
        }
    }
    
    // Load current PSFP configuration
    async loadConfiguration() {
        try {
            // Load stream filter configuration
            const filterConfig = await this.coreconf.get('/ieee802-dot1q-psfp-bridge:stream-filters');
            if (filterConfig && filterConfig['stream-filter-instance']) {
                filterConfig['stream-filter-instance'].forEach(filter => {
                    this.streamFilters.set(filter['stream-filter-instance-id'], filter);
                });
            }
            
            // Load stream gate configuration
            const gateConfig = await this.coreconf.get('/ieee802-dot1q-psfp-bridge:stream-gates');
            if (gateConfig && gateConfig['stream-gate-instance']) {
                gateConfig['stream-gate-instance'].forEach(gate => {
                    this.streamGates.set(gate['stream-gate-instance-id'], gate);
                });
            }
            
            // Load flow meter configuration
            const meterConfig = await this.coreconf.get('/ieee802-dot1q-psfp-bridge:flow-meters');
            if (meterConfig && meterConfig['flow-meter-instance']) {
                meterConfig['flow-meter-instance'].forEach(meter => {
                    this.flowMeters.set(meter['flow-meter-instance-id'], meter);
                });
            }
            
        } catch (error) {
            console.error('Failed to load PSFP configuration:', error);
        }
    }
    
    // Create stream filter
    async createStreamFilter(config) {
        const filterConfig = {
            'stream-filter-instance-id': config.filterId,
            'stream-handle-spec': config.streamHandleSpec || -1, // -1 for wildcard
            'priority-spec': config.prioritySpec || -1, // -1 for wildcard
            'stream-gate-ref': config.streamGateRef,
            'filter-specification': config.filterSpec ? {
                'max-sdu-size': config.filterSpec.maxSduSize,
                'flow-meter-ref': config.filterSpec.flowMeterRef
            } : undefined,
            'blocked-due-to-oversize-frame': config.blockedOversizeFrame || false,
            'marked-due-to-oversize-frame': config.markedOversizeFrame || false
        };
        
        try {
            await this.coreconf.set(
                `/ieee802-dot1q-psfp-bridge:stream-filters/stream-filter-instance[stream-filter-instance-id='${config.filterId}']`,
                filterConfig
            );
            
            this.streamFilters.set(config.filterId, filterConfig);
            
            this.dispatchEvent(new CustomEvent('streamFilterCreated', {
                detail: { filterId: config.filterId, config: filterConfig }
            }));
            
            return filterConfig;
            
        } catch (error) {
            console.error('Failed to create stream filter:', error);
            throw error;
        }
    }
    
    // Create stream gate
    async createStreamGate(config) {
        const gateConfig = {
            'stream-gate-instance-id': config.gateId,
            'gate-enabled': config.gateEnabled !== false,
            'admin-gate-states': config.adminGateStates || 'open',
            'admin-ipv': config.adminIpv || -1, // -1 for no change
            'admin-control-list': config.adminControlList ? 
                config.adminControlList.map(entry => ({
                    'index': entry.index,
                    'operation-name': entry.operationName, // 'set-gate-states', 'set-and-hold-mac', 'set-and-release-mac'
                    'sgs-params': entry.sgsParams ? {
                        'gate-states-value': entry.sgsParams.gateStatesValue,
                        'ipv-value': entry.sgsParams.ipvValue
                    } : undefined,
                    'shm-params': entry.shmParams ? {
                        'gate-states-value': entry.shmParams.gateStatesValue,
                        'ipv-value': entry.shmParams.ipvValue,
                        'request-status': entry.shmParams.requestStatus
                    } : undefined,
                    'time-interval-value': entry.timeInterval
                })) : [],
            'admin-cycle-time': config.adminCycleTime || {
                'numerator': 1000000, // 1ms default
                'denominator': 1000000000 // nanoseconds
            },
            'admin-cycle-time-extension': config.adminCycleTimeExtension || 0,
            'admin-base-time': config.adminBaseTime || {
                'seconds': 0,
                'nanoseconds': 0
            }
        };
        
        try {
            await this.coreconf.set(
                `/ieee802-dot1q-psfp-bridge:stream-gates/stream-gate-instance[stream-gate-instance-id='${config.gateId}']`,
                gateConfig
            );
            
            this.streamGates.set(config.gateId, gateConfig);
            
            this.dispatchEvent(new CustomEvent('streamGateCreated', {
                detail: { gateId: config.gateId, config: gateConfig }
            }));
            
            return gateConfig;
            
        } catch (error) {
            console.error('Failed to create stream gate:', error);
            throw error;
        }
    }
    
    // Create flow meter
    async createFlowMeter(config) {
        const meterConfig = {
            'flow-meter-instance-id': config.meterId,
            'committed-information-rate': config.cir, // bits per second
            'committed-burst-size': config.cbs, // bits
            'excess-information-rate': config.eir || 0, // bits per second
            'excess-burst-size': config.ebs || 0, // bits
            'coupling-flag': config.couplingFlag || false,
            'color-mode': config.colorMode || 'color-blind', // 'color-blind' or 'color-aware'
            'drop-on-yellow': config.dropOnYellow || false,
            'mark-all-frames-red-enable': config.markAllFramesRed || false
        };
        
        try {
            await this.coreconf.set(
                `/ieee802-dot1q-psfp-bridge:flow-meters/flow-meter-instance[flow-meter-instance-id='${config.meterId}']`,
                meterConfig
            );
            
            this.flowMeters.set(config.meterId, meterConfig);
            
            this.dispatchEvent(new CustomEvent('flowMeterCreated', {
                detail: { meterId: config.meterId, config: meterConfig }
            }));
            
            return meterConfig;
            
        } catch (error) {
            console.error('Failed to create flow meter:', error);
            throw error;
        }
    }
    
    // Get stream filter statistics
    async getStreamFilterStatistics(filterId) {
        try {
            const stats = await this.coreconf.get(
                `/ieee802-dot1q-psfp-bridge:stream-filters/stream-filter-instance[stream-filter-instance-id='${filterId}']/statistics`
            );
            
            if (stats) {
                return {
                    filterId,
                    matchingFrames: stats['matching-frames-count'] || 0,
                    passingFrames: stats['passing-frames-count'] || 0,
                    notPassingFrames: stats['not-passing-frames-count'] || 0,
                    passingSDU: stats['passing-sdu-count'] || 0,
                    notPassingSDU: stats['not-passing-sdu-count'] || 0,
                    redFrames: stats['red-frames-count'] || 0,
                    timestamp: Date.now()
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('Failed to get stream filter statistics:', error);
            return null;
        }
    }
    
    // Get stream gate statistics
    async getStreamGateStatistics(gateId) {
        try {
            const stats = await this.coreconf.get(
                `/ieee802-dot1q-psfp-bridge:stream-gates/stream-gate-instance[stream-gate-instance-id='${gateId}']/statistics`
            );
            
            if (stats) {
                return {
                    gateId,
                    passingFrames: stats['passing-frames-count'] || 0,
                    discardedFrames: stats['discarded-frames-count'] || 0,
                    currentTime: stats['current-time'] || { seconds: 0, nanoseconds: 0 },
                    configChange: stats['config-change'] || false,
                    configChangeTime: stats['config-change-time'] || { seconds: 0, nanoseconds: 0 },
                    tickGranularity: stats['tick-granularity'] || 1,
                    timestamp: Date.now()
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('Failed to get stream gate statistics:', error);
            return null;
        }
    }
    
    // Get flow meter statistics
    async getFlowMeterStatistics(meterId) {
        try {
            const stats = await this.coreconf.get(
                `/ieee802-dot1q-psfp-bridge:flow-meters/flow-meter-instance[flow-meter-instance-id='${meterId}']/statistics`
            );
            
            if (stats) {
                return {
                    meterId,
                    greenFrames: stats['green-frames-count'] || 0,
                    yellowFrames: stats['yellow-frames-count'] || 0,
                    redFrames: stats['red-frames-count'] || 0,
                    discardedFrames: stats['discarded-frames-count'] || 0,
                    timestamp: Date.now()
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('Failed to get flow meter statistics:', error);
            return null;
        }
    }
    
    // Update stream gate control list
    async updateStreamGateControlList(gateId, controlList) {
        try {
            const adminControlList = controlList.map(entry => ({
                'index': entry.index,
                'operation-name': entry.operationName,
                'sgs-params': entry.sgsParams ? {
                    'gate-states-value': entry.sgsParams.gateStatesValue,
                    'ipv-value': entry.sgsParams.ipvValue
                } : undefined,
                'time-interval-value': entry.timeInterval
            }));
            
            await this.coreconf.set(
                `/ieee802-dot1q-psfp-bridge:stream-gates/stream-gate-instance[stream-gate-instance-id='${gateId}']/admin-control-list`,
                adminControlList
            );
            
            // Update local cache
            const gate = this.streamGates.get(gateId);
            if (gate) {
                gate['admin-control-list'] = adminControlList;
            }
            
            this.dispatchEvent(new CustomEvent('streamGateUpdated', {
                detail: { gateId, controlList: adminControlList }
            }));
            
        } catch (error) {
            console.error('Failed to update stream gate control list:', error);
            throw error;
        }
    }
    
    // Delete stream filter
    async deleteStreamFilter(filterId) {
        try {
            await this.coreconf.delete(
                `/ieee802-dot1q-psfp-bridge:stream-filters/stream-filter-instance[stream-filter-instance-id='${filterId}']`
            );
            
            this.streamFilters.delete(filterId);
            
            this.dispatchEvent(new CustomEvent('streamFilterDeleted', {
                detail: { filterId }
            }));
            
        } catch (error) {
            console.error('Failed to delete stream filter:', error);
            throw error;
        }
    }
    
    // Delete stream gate
    async deleteStreamGate(gateId) {
        try {
            await this.coreconf.delete(
                `/ieee802-dot1q-psfp-bridge:stream-gates/stream-gate-instance[stream-gate-instance-id='${gateId}']`
            );
            
            this.streamGates.delete(gateId);
            
            this.dispatchEvent(new CustomEvent('streamGateDeleted', {
                detail: { gateId }
            }));
            
        } catch (error) {
            console.error('Failed to delete stream gate:', error);
            throw error;
        }
    }
    
    // Delete flow meter
    async deleteFlowMeter(meterId) {
        try {
            await this.coreconf.delete(
                `/ieee802-dot1q-psfp-bridge:flow-meters/flow-meter-instance[flow-meter-instance-id='${meterId}']`
            );
            
            this.flowMeters.delete(meterId);
            
            this.dispatchEvent(new CustomEvent('flowMeterDeleted', {
                detail: { meterId }
            }));
            
        } catch (error) {
            console.error('Failed to delete flow meter:', error);
            throw error;
        }
    }
    
    // Get all configured stream filters
    getStreamFilters() {
        return Array.from(this.streamFilters.values());
    }
    
    // Get all configured stream gates
    getStreamGates() {
        return Array.from(this.streamGates.values());
    }
    
    // Get all configured flow meters
    getFlowMeters() {
        return Array.from(this.flowMeters.values());
    }
    
    // Create preset configurations
    createPresetConfiguration(preset) {
        const presets = {
            // Automotive ECU protection
            'automotive-ecu': {
                filters: [{
                    filterId: 1,
                    streamHandleSpec: -1, // wildcard
                    streamGateRef: 1,
                    filterSpec: {
                        maxSduSize: 1522,
                        flowMeterRef: 1
                    }
                }],
                gates: [{
                    gateId: 1,
                    gateEnabled: true,
                    adminGateStates: 'open',
                    adminControlList: [{
                        index: 0,
                        operationName: 'set-gate-states',
                        sgsParams: {
                            gateStatesValue: 'open',
                            ipvValue: 7 // High priority
                        },
                        timeInterval: 1000000 // 1ms
                    }],
                    adminCycleTime: {
                        numerator: 1000000,
                        denominator: 1000000000
                    }
                }],
                meters: [{
                    meterId: 1,
                    cir: 100000000, // 100 Mbps
                    cbs: 125000,    // 125 KB
                    colorMode: 'color-blind',
                    dropOnYellow: false
                }]
            },
            
            // Industrial automation
            'industrial-automation': {
                filters: [{
                    filterId: 2,
                    streamHandleSpec: -1,
                    streamGateRef: 2,
                    filterSpec: {
                        maxSduSize: 1518,
                        flowMeterRef: 2
                    }
                }],
                gates: [{
                    gateId: 2,
                    gateEnabled: true,
                    adminGateStates: 'open',
                    adminControlList: [{
                        index: 0,
                        operationName: 'set-gate-states',
                        sgsParams: {
                            gateStatesValue: 'open',
                            ipvValue: 6
                        },
                        timeInterval: 250000 // 250μs
                    }],
                    adminCycleTime: {
                        numerator: 250000,
                        denominator: 1000000000
                    }
                }],
                meters: [{
                    meterId: 2,
                    cir: 50000000, // 50 Mbps
                    cbs: 62500,    // 62.5 KB
                    colorMode: 'color-aware',
                    dropOnYellow: true
                }]
            }
        };
        
        return presets[preset] || null;
    }
    
    // Apply preset configuration
    async applyPresetConfiguration(presetName) {
        const preset = this.createPresetConfiguration(presetName);
        if (!preset) {
            throw new Error(`Preset '${presetName}' not found`);
        }
        
        try {
            // Apply flow meters first
            for (const meter of preset.meters) {
                await this.createFlowMeter(meter);
            }
            
            // Apply stream gates
            for (const gate of preset.gates) {
                await this.createStreamGate(gate);
            }
            
            // Apply stream filters
            for (const filter of preset.filters) {
                await this.createStreamFilter(filter);
            }
            
            this.dispatchEvent(new CustomEvent('presetApplied', {
                detail: { presetName, preset }
            }));
            
        } catch (error) {
            console.error('Failed to apply preset configuration:', error);
            throw error;
        }
    }
    
    // Export PSFP configuration
    exportConfiguration() {
        return {
            streamFilters: Array.from(this.streamFilters.entries()),
            streamGates: Array.from(this.streamGates.entries()),
            flowMeters: Array.from(this.flowMeters.entries()),
            timestamp: Date.now(),
            version: '1.0'
        };
    }
    
    // Import PSFP configuration
    async importConfiguration(config) {
        try {
            // Clear existing configuration
            this.streamFilters.clear();
            this.streamGates.clear();
            this.flowMeters.clear();
            
            // Import flow meters first
            if (config.flowMeters) {
                for (const [meterId, meterConfig] of config.flowMeters) {
                    await this.createFlowMeter({
                        meterId,
                        ...meterConfig
                    });
                }
            }
            
            // Import stream gates
            if (config.streamGates) {
                for (const [gateId, gateConfig] of config.streamGates) {
                    await this.createStreamGate({
                        gateId,
                        ...gateConfig
                    });
                }
            }
            
            // Import stream filters
            if (config.streamFilters) {
                for (const [filterId, filterConfig] of config.streamFilters) {
                    await this.createStreamFilter({
                        filterId,
                        ...filterConfig
                    });
                }
            }
            
            this.dispatchEvent(new Event('configurationImported'));
            
        } catch (error) {
            console.error('Failed to import PSFP configuration:', error);
            throw error;
        }
    }
    
    // Start monitoring PSFP statistics
    startMonitoring(interval = 1000) {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
        }
        
        this.monitoringTimer = setInterval(async () => {
            try {
                // Collect stream filter statistics
                for (const filterId of this.streamFilters.keys()) {
                    const stats = await this.getStreamFilterStatistics(filterId);
                    if (stats) {
                        this.dispatchEvent(new CustomEvent('statisticsUpdated', {
                            detail: { type: 'stream-filter', data: stats }
                        }));
                    }
                }
                
                // Collect stream gate statistics
                for (const gateId of this.streamGates.keys()) {
                    const stats = await this.getStreamGateStatistics(gateId);
                    if (stats) {
                        this.dispatchEvent(new CustomEvent('statisticsUpdated', {
                            detail: { type: 'stream-gate', data: stats }
                        }));
                    }
                }
                
                // Collect flow meter statistics
                for (const meterId of this.flowMeters.keys()) {
                    const stats = await this.getFlowMeterStatistics(meterId);
                    if (stats) {
                        this.dispatchEvent(new CustomEvent('statisticsUpdated', {
                            detail: { type: 'flow-meter', data: stats }
                        }));
                    }
                }
                
            } catch (error) {
                console.error('PSFP monitoring error:', error);
            }
        }, interval);
    }
    
    // Stop monitoring
    stopMonitoring() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
    }
}