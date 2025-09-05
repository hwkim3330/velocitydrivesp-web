// Microchip UART Protocol #1 (MUP1) Implementation
export class MUP1Protocol {
    constructor() {
        this.buffer = '';
        this.messageId = 0;
        this.pendingResponses = new Map();
        this.timeout = 5000; // 5 second timeout
    }
    
    // Encode message to MUP1 format
    // Format: >TYPE[DATA]<[<]CHECKSUM
    encode(type, data = '') {
        let message = `>${type}`;
        
        if (data) {
            message += `[${data}]`;
        }
        
        message += '<';
        
        // Calculate checksum (XOR of all bytes)
        let checksum = 0;
        for (let i = 0; i < message.length; i++) {
            checksum ^= message.charCodeAt(i);
        }
        
        // Add checksum in hex format
        message += checksum.toString(16).toUpperCase().padStart(2, '0');
        
        return message;
    }
    
    // Decode MUP1 message
    decode(rawData) {
        this.buffer += rawData;
        const messages = [];
        
        while (true) {
            // Look for message start
            const startIdx = this.buffer.indexOf('>');
            if (startIdx === -1) break;
            
            // Look for message end (checksum is 2 hex chars after '<')
            const endMarker = this.buffer.indexOf('<', startIdx);
            if (endMarker === -1) break;
            
            // Check if we have the complete checksum
            if (this.buffer.length < endMarker + 3) break;
            
            // Extract message
            const fullMessage = this.buffer.substring(startIdx, endMarker + 3);
            const messageBody = this.buffer.substring(startIdx + 1, endMarker);
            const receivedChecksum = this.buffer.substring(endMarker + 1, endMarker + 3);
            
            // Verify checksum
            const calculatedChecksum = this.calculateChecksum(
                this.buffer.substring(startIdx, endMarker + 1)
            );
            
            if (calculatedChecksum === receivedChecksum) {
                // Parse message
                const message = this.parseMessage(messageBody);
                if (message) {
                    messages.push(message);
                }
            } else {
                console.warn('Checksum mismatch:', receivedChecksum, 'vs', calculatedChecksum);
            }
            
            // Remove processed message from buffer
            this.buffer = this.buffer.substring(endMarker + 3);
        }
        
        return messages;
    }
    
    parseMessage(messageBody) {
        // Extract type and data
        const dataStart = messageBody.indexOf('[');
        const dataEnd = messageBody.lastIndexOf(']');
        
        let type, data;
        
        if (dataStart !== -1 && dataEnd !== -1 && dataEnd > dataStart) {
            type = messageBody.substring(0, dataStart);
            data = messageBody.substring(dataStart + 1, dataEnd);
        } else {
            type = messageBody;
            data = '';
        }
        
        // Handle response messages
        if (type.startsWith('R_')) {
            const requestType = type.substring(2);
            const messageId = this.extractMessageId(data);
            
            if (messageId && this.pendingResponses.has(messageId)) {
                const resolver = this.pendingResponses.get(messageId);
                this.pendingResponses.delete(messageId);
                resolver.resolve({ type: requestType, data: this.extractData(data) });
                return null; // Don't return response messages to main handler
            }
        }
        
        return {
            type: type,
            data: data,
            timestamp: Date.now()
        };
    }
    
    calculateChecksum(message) {
        let checksum = 0;
        for (let i = 0; i < message.length; i++) {
            checksum ^= message.charCodeAt(i);
        }
        return checksum.toString(16).toUpperCase().padStart(2, '0');
    }
    
    extractMessageId(data) {
        // Extract message ID from data if present
        const match = data.match(/^ID:(\d+),/);
        return match ? parseInt(match[1]) : null;
    }
    
    extractData(data) {
        // Remove message ID if present
        return data.replace(/^ID:\d+,/, '');
    }
    
    // Send request and wait for response
    async sendRequest(type, data = '') {
        const messageId = ++this.messageId;
        const messageData = data ? `ID:${messageId},${data}` : `ID:${messageId}`;
        const message = this.encode(type, messageData);
        
        return new Promise((resolve, reject) => {
            // Set timeout
            const timeoutId = setTimeout(() => {
                this.pendingResponses.delete(messageId);
                reject(new Error(`Request timeout: ${type}`));
            }, this.timeout);
            
            // Store resolver
            this.pendingResponses.set(messageId, {
                resolve: (response) => {
                    clearTimeout(timeoutId);
                    resolve(response);
                },
                reject: reject
            });
            
            // Return encoded message to send
            resolve(message);
        });
    }
    
    // Common MUP1 commands
    commands = {
        // System commands
        GET_SYSTEM_INFO: 'SYS_INFO',
        REBOOT: 'SYS_REBOOT',
        GET_VERSION: 'SYS_VER',
        
        // Configuration commands  
        GET_CONFIG: 'CFG_GET',
        SET_CONFIG: 'CFG_SET',
        SAVE_CONFIG: 'CFG_SAVE',
        LOAD_CONFIG: 'CFG_LOAD',
        
        // CORECONF commands
        CORECONF_GET: 'CORECONF_GET',
        CORECONF_SET: 'CORECONF_SET',
        CORECONF_DELETE: 'CORECONF_DEL',
        CORECONF_ACTION: 'CORECONF_ACT',
        
        // Interface commands
        GET_INTERFACES: 'IF_LIST',
        GET_INTERFACE: 'IF_GET',
        SET_INTERFACE: 'IF_SET',
        
        // TSN commands
        GET_CBS: 'TSN_CBS_GET',
        SET_CBS: 'TSN_CBS_SET',
        GET_TAS: 'TSN_TAS_GET',
        SET_TAS: 'TSN_TAS_SET',
        GET_PTP: 'TSN_PTP_GET',
        SET_PTP: 'TSN_PTP_SET',
        
        // Monitoring commands
        GET_STATS: 'MON_STATS',
        GET_COUNTERS: 'MON_CNT',
        CLEAR_COUNTERS: 'MON_CLR',
        
        // Log commands
        GET_LOGS: 'LOG_GET',
        CLEAR_LOGS: 'LOG_CLR',
        SET_LOG_LEVEL: 'LOG_LVL'
    };
    
    // Helper methods for common operations
    createSystemInfoRequest() {
        return this.encode(this.commands.GET_SYSTEM_INFO);
    }
    
    createConfigGetRequest(path) {
        return this.encode(this.commands.GET_CONFIG, path);
    }
    
    createConfigSetRequest(path, value) {
        const data = JSON.stringify({ path, value });
        return this.encode(this.commands.SET_CONFIG, data);
    }
    
    createCoreconfGetRequest(path) {
        return this.encode(this.commands.CORECONF_GET, path);
    }
    
    createCoreconfSetRequest(path, value) {
        const data = JSON.stringify({ path, value });
        return this.encode(this.commands.CORECONF_SET, data);
    }
    
    // Parse common response types
    parseSystemInfo(data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            // Try key=value format
            const info = {};
            const lines = data.split(',');
            lines.forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) {
                    info[key.trim()] = value.trim();
                }
            });
            return info;
        }
    }
    
    parseCoreconfResponse(data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('Failed to parse CORECONF response:', e);
            return null;
        }
    }
}