// FRER (Frame Replication and Elimination for Reliability) Manager
// IEEE 802.1CB implementation for automotive network reliability

export class FRERManager extends EventTarget {
    constructor(coreconfClient) {
        super();
        this.coreconf = coreconfClient;
        this.streams = new Map();
        this.sequenceRecovery = new Map();
        this.statistics = new Map();
        this.isEnabled = false;
    }
    
    // Initialize FRER functionality
    async initialize() {
        try {
            // Check if FRER is supported by the device
            const capability = await this.checkFRERCapability();
            if (!capability) {
                throw new Error('FRER not supported by this device');
            }
            
            // Load current FRER configuration
            await this.loadConfiguration();
            
            this.isEnabled = true;
            this.dispatchEvent(new Event('initialized'));
            
        } catch (error) {
            console.error('Failed to initialize FRER:', error);
            throw error;
        }
    }
    
    // Check FRER capability
    async checkFRERCapability() {
        try {
            const capabilities = await this.coreconf.get('/ieee802-dot1cb-stream-identification:capabilities');
            return capabilities && capabilities['frer-supported'];
        } catch (error) {
            console.warn('FRER capability check failed:', error);
            return false;
        }
    }
    
    // Load current FRER configuration
    async loadConfiguration() {
        try {
            // Load stream identification configuration
            const streamConfig = await this.coreconf.get('/ieee802-dot1cb-stream-identification:streams');
            if (streamConfig && streamConfig.stream) {
                streamConfig.stream.forEach(stream => {
                    this.streams.set(stream['stream-handle'], stream);
                });
            }
            
            // Load sequence recovery configuration
            const recoveryConfig = await this.coreconf.get('/ieee802-dot1cb-frer:sequence-recovery');
            if (recoveryConfig && recoveryConfig.function) {
                recoveryConfig.function.forEach(func => {
                    this.sequenceRecovery.set(func['function-index'], func);
                });
            }
            
        } catch (error) {
            console.error('Failed to load FRER configuration:', error);
        }
    }
    
    // Create stream identification
    async createStreamIdentification(config) {
        const streamConfig = {
            'stream-handle': config.streamHandle,
            'stream-identification': {
                'identification-type': config.identificationType, // 'null', 'source-mac-and-vlan', 'destination-mac-and-vlan', etc.
                'parameters': this.buildIdentificationParameters(config)
            },
            'tspec': config.tspec || {
                'interval': config.interval || 125000, // 125μs default
                'max-frames-per-interval': config.maxFrames || 1,
                'max-frame-size': config.maxFrameSize || 1522
            }
        };
        
        try {
            await this.coreconf.set(
                `/ieee802-dot1cb-stream-identification:streams/stream[stream-handle='${config.streamHandle}']`,
                streamConfig
            );
            
            this.streams.set(config.streamHandle, streamConfig);
            
            this.dispatchEvent(new CustomEvent('streamCreated', {
                detail: { streamHandle: config.streamHandle, config: streamConfig }
            }));
            
            return streamConfig;
            
        } catch (error) {
            console.error('Failed to create stream identification:', error);
            throw error;
        }
    }
    
    // Build identification parameters based on type
    buildIdentificationParameters(config) {
        switch (config.identificationType) {
            case 'source-mac-and-vlan':
                return {
                    'source-mac-address': config.sourceMac,
                    'vlan-id': config.vlanId
                };
                
            case 'destination-mac-and-vlan':
                return {
                    'destination-mac-address': config.destinationMac,
                    'vlan-id': config.vlanId
                };
                
            case 'ip-stream-identification':
                return {
                    'source-ip-address': config.sourceIp,
                    'destination-ip-address': config.destinationIp,
                    'protocol-next-header': config.protocol || 17, // UDP
                    'source-port': config.sourcePort,
                    'destination-port': config.destinationPort,
                    'dscp': config.dscp || 0
                };
                
            case 'active-destination-mac-and-vlan':
                return {
                    'destination-mac-address': config.destinationMac,
                    'vlan-id': config.vlanId,
                    'down-destination-mac': config.downDestinationMac,
                    'down-vlan-id': config.downVlanId
                };
                
            default:
                return {};
        }
    }
    
    // Create sequence recovery function
    async createSequenceRecovery(config) {
        const recoveryConfig = {
            'function-index': config.functionIndex,
            'algorithm': config.algorithm || 'vector-recovery', // 'vector-recovery' or 'match-recovery'
            'direction': config.direction || 'out-facing',
            'history-length': config.historyLength || 32,
            'reset-timeout': config.resetTimeout || 10000, // 10ms
            'take-no-sequence': config.takeNoSequence || false,
            'individual-recovery': config.individualRecovery || false,
            'latent-error-detection': config.latentErrorDetection || false,
            'packet-reject-policy': config.packetRejectPolicy || 'discard'
        };
        
        try {
            await this.coreconf.set(
                `/ieee802-dot1cb-frer:sequence-recovery/function[function-index='${config.functionIndex}']`,
                recoveryConfig
            );
            
            this.sequenceRecovery.set(config.functionIndex, recoveryConfig);
            
            this.dispatchEvent(new CustomEvent('sequenceRecoveryCreated', {
                detail: { functionIndex: config.functionIndex, config: recoveryConfig }
            }));
            
            return recoveryConfig;
            
        } catch (error) {
            console.error('Failed to create sequence recovery:', error);
            throw error;
        }
    }
    
    // Bind stream to sequence recovery function
    async bindStreamToRecovery(streamHandle, functionIndex, direction = 'out-facing') {
        try {
            const bindingConfig = {
                'stream-handle': streamHandle,
                'function-index': functionIndex,
                'direction': direction
            };
            
            await this.coreconf.set(
                `/ieee802-dot1cb-frer:sequence-recovery/stream-binding`,
                bindingConfig
            );
            
            this.dispatchEvent(new CustomEvent('streamBound', {
                detail: { streamHandle, functionIndex, direction }
            }));
            
        } catch (error) {
            console.error('Failed to bind stream to recovery function:', error);
            throw error;
        }
    }
    
    // Get stream statistics
    async getStreamStatistics(streamHandle) {
        try {
            const stats = await this.coreconf.get(
                `/ieee802-dot1cb-stream-identification:streams/stream[stream-handle='${streamHandle}']/counters`
            );
            
            if (stats) {
                this.statistics.set(streamHandle, {
                    ...stats,
                    timestamp: Date.now()
                });
            }
            
            return stats;
            
        } catch (error) {
            console.error('Failed to get stream statistics:', error);
            return null;
        }
    }
    
    // Get sequence recovery statistics
    async getSequenceRecoveryStatistics(functionIndex) {
        try {
            const stats = await this.coreconf.get(
                `/ieee802-dot1cb-frer:sequence-recovery/function[function-index='${functionIndex}']/counters`
            );
            
            if (stats) {
                return {
                    functionIndex,
                    outOfOrderPackets: stats['out-of-order-packets'] || 0,
                    duplicatePackets: stats['duplicate-packets'] || 0,
                    lostPackets: stats['lost-packets'] || 0,
                    taglessPackets: stats['tagless-packets'] || 0,
                    resetTimeouts: stats['reset-timeouts'] || 0,
                    passedPackets: stats['passed-packets'] || 0,
                    discardedPackets: stats['discarded-packets'] || 0,
                    timestamp: Date.now()
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('Failed to get sequence recovery statistics:', error);
            return null;
        }
    }
    
    // Create compound stream (for redundant paths)
    async createCompoundStream(config) {
        const compoundConfig = {
            'stream-handle': config.streamHandle,
            'member-streams': config.memberStreams.map(member => ({
                'stream-handle': member.streamHandle,
                'port': member.port,
                'active': member.active !== false
            }))
        };
        
        try {
            await this.coreconf.set(
                `/ieee802-dot1cb-stream-identification:compound-streams/compound-stream[stream-handle='${config.streamHandle}']`,
                compoundConfig
            );
            
            this.dispatchEvent(new CustomEvent('compoundStreamCreated', {
                detail: { streamHandle: config.streamHandle, config: compoundConfig }
            }));
            
            return compoundConfig;
            
        } catch (error) {
            console.error('Failed to create compound stream:', error);
            throw error;
        }
    }
    
    // Delete stream identification
    async deleteStreamIdentification(streamHandle) {
        try {
            await this.coreconf.delete(
                `/ieee802-dot1cb-stream-identification:streams/stream[stream-handle='${streamHandle}']`
            );
            
            this.streams.delete(streamHandle);
            
            this.dispatchEvent(new CustomEvent('streamDeleted', {
                detail: { streamHandle }
            }));
            
        } catch (error) {
            console.error('Failed to delete stream identification:', error);
            throw error;
        }
    }
    
    // Delete sequence recovery function
    async deleteSequenceRecovery(functionIndex) {
        try {
            await this.coreconf.delete(
                `/ieee802-dot1cb-frer:sequence-recovery/function[function-index='${functionIndex}']`
            );
            
            this.sequenceRecovery.delete(functionIndex);
            
            this.dispatchEvent(new CustomEvent('sequenceRecoveryDeleted', {
                detail: { functionIndex }
            }));
            
        } catch (error) {
            console.error('Failed to delete sequence recovery function:', error);
            throw error;
        }
    }
    
    // Reset sequence recovery function
    async resetSequenceRecovery(functionIndex) {
        try {
            await this.coreconf.action(
                `/ieee802-dot1cb-frer:sequence-recovery/function[function-index='${functionIndex}']/reset`
            );
            
            this.dispatchEvent(new CustomEvent('sequenceRecoveryReset', {
                detail: { functionIndex }
            }));
            
        } catch (error) {
            console.error('Failed to reset sequence recovery function:', error);
            throw error;
        }
    }
    
    // Get all configured streams
    getStreams() {
        return Array.from(this.streams.values());
    }
    
    // Get all sequence recovery functions
    getSequenceRecoveryFunctions() {
        return Array.from(this.sequenceRecovery.values());
    }
    
    // Export FRER configuration
    exportConfiguration() {
        return {
            streams: Array.from(this.streams.entries()),
            sequenceRecovery: Array.from(this.sequenceRecovery.entries()),
            timestamp: Date.now(),
            version: '1.0'
        };
    }
    
    // Import FRER configuration
    async importConfiguration(config) {
        try {
            // Clear existing configuration
            this.streams.clear();
            this.sequenceRecovery.clear();
            
            // Import streams
            if (config.streams) {
                for (const [handle, streamConfig] of config.streams) {
                    await this.createStreamIdentification({
                        streamHandle: handle,
                        ...streamConfig['stream-identification'],
                        tspec: streamConfig.tspec
                    });
                }
            }
            
            // Import sequence recovery functions
            if (config.sequenceRecovery) {
                for (const [index, recoveryConfig] of config.sequenceRecovery) {
                    await this.createSequenceRecovery({
                        functionIndex: index,
                        ...recoveryConfig
                    });
                }
            }
            
            this.dispatchEvent(new Event('configurationImported'));
            
        } catch (error) {
            console.error('Failed to import FRER configuration:', error);
            throw error;
        }
    }
    
    // Start monitoring FRER statistics
    startMonitoring(interval = 1000) {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
        }
        
        this.monitoringTimer = setInterval(async () => {
            try {
                // Collect stream statistics
                for (const streamHandle of this.streams.keys()) {
                    await this.getStreamStatistics(streamHandle);
                }
                
                // Collect sequence recovery statistics
                for (const functionIndex of this.sequenceRecovery.keys()) {
                    const stats = await this.getSequenceRecoveryStatistics(functionIndex);
                    if (stats) {
                        this.dispatchEvent(new CustomEvent('statisticsUpdated', {
                            detail: { type: 'sequence-recovery', data: stats }
                        }));
                    }
                }
                
            } catch (error) {
                console.error('FRER monitoring error:', error);
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