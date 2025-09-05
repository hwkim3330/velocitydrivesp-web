// CORECONF/CoAP Client Implementation
export class CORECONFClient {
    constructor(serial, protocol) {
        this.serial = serial;
        this.protocol = protocol;
        this.pendingRequests = new Map();
        this.requestTimeout = 10000; // 10 seconds
    }
    
    // CORECONF GET operation
    async get(path) {
        if (!this.serial.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const message = this.protocol.createCoreconfGetRequest(path);
            await this.serial.write(message);
            
            // Wait for response
            const response = await this.waitForResponse('CORECONF_GET', path);
            return this.protocol.parseCoreconfResponse(response.data);
        } catch (error) {
            console.error('CORECONF GET error:', error);
            throw error;
        }
    }
    
    // CORECONF SET operation
    async set(path, value) {
        if (!this.serial.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const message = this.protocol.createCoreconfSetRequest(path, value);
            await this.serial.write(message);
            
            // Wait for response
            const response = await this.waitForResponse('CORECONF_SET', path);
            return response.data === 'OK';
        } catch (error) {
            console.error('CORECONF SET error:', error);
            throw error;
        }
    }
    
    // CORECONF DELETE operation
    async delete(path) {
        if (!this.serial.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const message = this.protocol.encode('CORECONF_DEL', path);
            await this.serial.write(message);
            
            // Wait for response
            const response = await this.waitForResponse('CORECONF_DEL', path);
            return response.data === 'OK';
        } catch (error) {
            console.error('CORECONF DELETE error:', error);
            throw error;
        }
    }
    
    // CORECONF ACTION operation
    async action(path, input = null) {
        if (!this.serial.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const data = input ? JSON.stringify({ path, input }) : path;
            const message = this.protocol.encode('CORECONF_ACT', data);
            await this.serial.write(message);
            
            // Wait for response
            const response = await this.waitForResponse('CORECONF_ACT', path);
            return this.protocol.parseCoreconfResponse(response.data);
        } catch (error) {
            console.error('CORECONF ACTION error:', error);
            throw error;
        }
    }
    
    // Get full configuration
    async getFullConfig() {
        try {
            // Get running datastore
            const config = await this.get('/');
            return config;
        } catch (error) {
            console.error('Failed to get full config:', error);
            throw error;
        }
    }
    
    // Apply full configuration
    async applyFullConfig(config) {
        try {
            // Apply configuration in chunks if needed
            for (const [module, data] of Object.entries(config)) {
                await this.set(`/${module}`, data);
            }
            return true;
        } catch (error) {
            console.error('Failed to apply full config:', error);
            throw error;
        }
    }
    
    // Wait for response with timeout
    waitForResponse(type, path) {
        return new Promise((resolve, reject) => {
            const requestId = `${type}:${path}:${Date.now()}`;
            
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout: ${type} ${path}`));
            }, this.requestTimeout);
            
            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    this.pendingRequests.delete(requestId);
                    reject(error);
                },
                type,
                path
            });
        });
    }
    
    // Handle response from device
    handleResponse(message) {
        // Find matching pending request
        for (const [requestId, request] of this.pendingRequests.entries()) {
            if (message.type === `R_${request.type}` || 
                message.type === request.type) {
                request.resolve(message);
                return;
            }
        }
        
        // No matching request found
        console.log('Unhandled response:', message);
    }
    
    // YANG-specific operations
    async getYangModules() {
        try {
            const modules = await this.get('/ietf-yang-library:yang-library/module-set');
            return modules ? modules.module || [] : [];
        } catch (error) {
            console.error('Failed to get YANG modules:', error);
            return [];
        }
    }
    
    async getYangSchema(moduleName) {
        try {
            const schema = await this.get(`/ietf-yang-library:yang-library/schema/${moduleName}`);
            return schema;
        } catch (error) {
            console.error('Failed to get YANG schema:', error);
            return null;
        }
    }
    
    // TSN-specific operations
    async getTSNConfig() {
        const config = {};
        
        try {
            // Get CBS config
            config.cbs = await this.get('/ieee802-dot1q-sched:interfaces/interface/scheduler');
            
            // Get TAS config
            config.tas = await this.get('/ieee802-dot1q-sched:interfaces/interface/gate-parameters');
            
            // Get PTP config
            config.ptp = await this.get('/ieee1588-ptp:ptp/instance');
            
            return config;
        } catch (error) {
            console.error('Failed to get TSN config:', error);
            return config;
        }
    }
    
    async setCBSConfig(interfaceName, config) {
        try {
            const path = `/ieee802-dot1q-sched:interfaces/interface[name='${interfaceName}']/scheduler`;
            return await this.set(path, config);
        } catch (error) {
            console.error('Failed to set CBS config:', error);
            throw error;
        }
    }
    
    async setTASConfig(interfaceName, config) {
        try {
            const path = `/ieee802-dot1q-sched:interfaces/interface[name='${interfaceName}']/gate-parameters`;
            return await this.set(path, config);
        } catch (error) {
            console.error('Failed to set TAS config:', error);
            throw error;
        }
    }
    
    async setPTPConfig(instanceId, config) {
        try {
            const path = `/ieee1588-ptp:ptp/instance[instance-index='${instanceId}']`;
            return await this.set(path, config);
        } catch (error) {
            console.error('Failed to set PTP config:', error);
            throw error;
        }
    }
    
    // Helper method to convert CBOR to JSON (if needed)
    cborToJson(cborData) {
        // Simple CBOR decoder (basic implementation)
        // In production, use a proper CBOR library
        try {
            // For now, assume the device returns JSON
            return JSON.parse(cborData);
        } catch (e) {
            console.warn('Failed to parse as JSON, assuming already decoded');
            return cborData;
        }
    }
    
    // Helper method to convert JSON to CBOR (if needed)
    jsonToCbor(jsonData) {
        // Simple CBOR encoder (basic implementation)
        // In production, use a proper CBOR library
        return JSON.stringify(jsonData);
    }
}