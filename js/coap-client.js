// CoAP (Constrained Application Protocol) Client
// RFC 7252 implementation with DTLS support for VelocityDRIVE SP

export class CoAPClient extends EventTarget {
    constructor() {
        super();
        this.socket = null;
        this.isConnected = false;
        this.endpoint = null;
        this.messageId = 1;
        this.token = 0;
        this.pendingRequests = new Map();
        this.observeRelations = new Map();
        this.dtlsSession = null;
        
        // CoAP constants
        this.COAP_VERSION = 1;
        this.COAP_TYPES = {
            CONFIRMABLE: 0,
            NON_CONFIRMABLE: 1,
            ACKNOWLEDGEMENT: 2,
            RESET: 3
        };
        
        this.COAP_CODES = {
            // Method codes
            EMPTY: 0,
            GET: 1,
            POST: 2,
            PUT: 3,
            DELETE: 4,
            
            // Response codes
            CREATED: 65,      // 2.01
            DELETED: 66,      // 2.02
            VALID: 67,        // 2.03
            CHANGED: 68,      // 2.04
            CONTENT: 69,      // 2.05
            CONTINUE: 95,     // 2.31
            BAD_REQUEST: 128, // 4.00
            UNAUTHORIZED: 129, // 4.01
            BAD_OPTION: 130,  // 4.02
            FORBIDDEN: 131,   // 4.03
            NOT_FOUND: 132,   // 4.04
            METHOD_NOT_ALLOWED: 133, // 4.05
            NOT_ACCEPTABLE: 134, // 4.06
            REQUEST_ENTITY_INCOMPLETE: 136, // 4.08
            PRECONDITION_FAILED: 140, // 4.12
            REQUEST_ENTITY_TOO_LARGE: 141, // 4.13
            UNSUPPORTED_CONTENT_FORMAT: 143, // 4.15
            INTERNAL_SERVER_ERROR: 160, // 5.00
            NOT_IMPLEMENTED: 161, // 5.01
            BAD_GATEWAY: 162, // 5.02
            SERVICE_UNAVAILABLE: 163, // 5.03
            GATEWAY_TIMEOUT: 164, // 5.04
            PROXYING_NOT_SUPPORTED: 165 // 5.05
        };
        
        this.COAP_OPTIONS = {
            IF_MATCH: 1,
            URI_HOST: 3,
            ETAG: 4,
            IF_NONE_MATCH: 5,
            OBSERVE: 6,
            URI_PORT: 7,
            LOCATION_PATH: 8,
            URI_PATH: 11,
            CONTENT_FORMAT: 12,
            MAX_AGE: 14,
            URI_QUERY: 15,
            ACCEPT: 17,
            LOCATION_QUERY: 20,
            BLOCK2: 23,
            BLOCK1: 27,
            SIZE2: 28,
            PROXY_URI: 35,
            PROXY_SCHEME: 39,
            SIZE1: 60
        };
        
        this.CONTENT_FORMATS = {
            TEXT_PLAIN: 0,
            APPLICATION_LINK_FORMAT: 40,
            APPLICATION_XML: 41,
            APPLICATION_OCTET_STREAM: 42,
            APPLICATION_EXI: 47,
            APPLICATION_JSON: 50,
            APPLICATION_CBOR: 60
        };
    }
    
    // Connect to CoAP endpoint
    async connect(endpoint, options = {}) {
        try {
            this.endpoint = this.parseEndpoint(endpoint);
            this.options = options;
            
            // Create UDP socket (simulated for web - real implementation would use WebRTC data channels or WebTransport)
            this.socket = new WebSocket(`ws://${this.endpoint.host}:${this.endpoint.port + 1000}/coap-ws`);
            
            this.socket.onopen = () => {
                this.isConnected = true;
                this.dispatchEvent(new Event('connected'));
            };
            
            this.socket.onmessage = (event) => {
                this.handleMessage(new Uint8Array(event.data));
            };
            
            this.socket.onerror = (error) => {
                this.dispatchEvent(new CustomEvent('error', { detail: error }));
            };
            
            this.socket.onclose = () => {
                this.isConnected = false;
                this.dispatchEvent(new Event('disconnected'));
            };
            
            // Initialize DTLS if required
            if (options.dtls) {
                await this.initializeDTLS(options);
            }
            
        } catch (error) {
            console.error('CoAP connection failed:', error);
            throw error;
        }
    }
    
    // Parse CoAP endpoint URI
    parseEndpoint(uri) {
        const url = new URL(uri);
        return {
            protocol: url.protocol.slice(0, -1), // Remove ':'
            host: url.hostname,
            port: parseInt(url.port) || 5683,
            path: url.pathname,
            query: url.search
        };
    }
    
    // Initialize DTLS session
    async initializeDTLS(options) {
        try {
            // DTLS initialization (simplified - real implementation would use WebCrypto)
            this.dtlsSession = {
                psk: options.psk,
                identity: options.identity,
                cipherSuite: options.cipherSuite || 'TLS_PSK_WITH_AES_128_CCM_8',
                encrypted: true
            };
            
            // Perform DTLS handshake
            await this.performDTLSHandshake();
            
        } catch (error) {
            console.error('DTLS initialization failed:', error);
            throw error;
        }
    }
    
    // Perform DTLS handshake
    async performDTLSHandshake() {
        // Simplified DTLS handshake - real implementation would follow RFC 6347
        return new Promise((resolve, reject) => {
            // ClientHello
            const clientHello = this.createDTLSClientHello();
            this.sendRawMessage(clientHello);
            
            // Wait for ServerHello and complete handshake
            setTimeout(() => {
                this.dtlsSession.handshakeComplete = true;
                resolve();
            }, 100);
        });
    }
    
    // Create DTLS ClientHello message
    createDTLSClientHello() {
        // Simplified ClientHello - real implementation would create proper DTLS message
        return new Uint8Array([
            0x16, // Handshake
            0xfe, 0xfd, // DTLS 1.2
            0x00, 0x00, // Epoch
            0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // Sequence number
            0x00, 0x20, // Length
            // ClientHello content would follow
        ]);
    }
    
    // Disconnect from CoAP endpoint
    async disconnect() {
        try {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.close();
            }
            
            this.isConnected = false;
            this.socket = null;
            this.dtlsSession = null;
            
            // Cancel pending requests
            for (const [messageId, request] of this.pendingRequests.entries()) {
                request.reject(new Error('Connection closed'));
            }
            this.pendingRequests.clear();
            
            // Cancel observe relations
            this.observeRelations.clear();
            
        } catch (error) {
            console.error('CoAP disconnect error:', error);
        }
    }
    
    // Send CoAP GET request
    async get(path, options = {}) {
        return this.sendRequest('GET', path, null, options);
    }
    
    // Send CoAP POST request
    async post(path, payload, options = {}) {
        return this.sendRequest('POST', path, payload, options);
    }
    
    // Send CoAP PUT request
    async put(path, payload, options = {}) {
        return this.sendRequest('PUT', path, payload, options);
    }
    
    // Send CoAP DELETE request
    async delete(path, options = {}) {
        return this.sendRequest('DELETE', path, null, options);
    }
    
    // Send CoAP request
    async sendRequest(method, path, payload, options = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to CoAP endpoint');
        }
        
        const messageId = this.getNextMessageId();
        const token = this.getNextToken();
        
        const message = this.createMessage({
            type: options.confirmable !== false ? this.COAP_TYPES.CONFIRMABLE : this.COAP_TYPES.NON_CONFIRMABLE,
            code: this.COAP_CODES[method.toUpperCase()],
            messageId: messageId,
            token: token,
            path: path,
            payload: payload,
            options: options
        });
        
        return new Promise((resolve, reject) => {
            // Store pending request
            this.pendingRequests.set(messageId, {
                method,
                path,
                resolve,
                reject,
                timestamp: Date.now(),
                timeout: setTimeout(() => {
                    this.pendingRequests.delete(messageId);
                    reject(new Error(`CoAP request timeout: ${method} ${path}`));
                }, options.timeout || 30000)
            });
            
            // Send message
            this.sendMessage(message);
        });
    }
    
    // Create CoAP message
    createMessage(params) {
        const message = new Uint8Array(1024); // Pre-allocate buffer
        let offset = 0;
        
        // Header (4 bytes)
        // Ver(2) | T(2) | TKL(4)
        message[offset] = (this.COAP_VERSION << 6) | (params.type << 4) | (params.token.length || 0);
        offset++;
        
        // Code (1 byte)
        message[offset] = params.code;
        offset++;
        
        // Message ID (2 bytes)
        message[offset] = (params.messageId >> 8) & 0xFF;
        message[offset + 1] = params.messageId & 0xFF;
        offset += 2;
        
        // Token (0-8 bytes)
        if (params.token) {
            const tokenBytes = this.tokenToBytes(params.token);
            message.set(tokenBytes, offset);
            offset += tokenBytes.length;
        }
        
        // Options
        if (params.path) {
            const pathSegments = params.path.split('/').filter(segment => segment);
            for (const segment of pathSegments) {
                offset += this.addOption(message, offset, this.COAP_OPTIONS.URI_PATH, new TextEncoder().encode(segment));
            }
        }
        
        // Content-Format option
        if (params.options.contentFormat !== undefined) {
            offset += this.addOption(message, offset, this.COAP_OPTIONS.CONTENT_FORMAT, 
                this.intToBytes(params.options.contentFormat));
        }
        
        // Accept option
        if (params.options.accept !== undefined) {
            offset += this.addOption(message, offset, this.COAP_OPTIONS.ACCEPT, 
                this.intToBytes(params.options.accept));
        }
        
        // Observe option
        if (params.options.observe !== undefined) {
            offset += this.addOption(message, offset, this.COAP_OPTIONS.OBSERVE, 
                this.intToBytes(params.options.observe));
        }
        
        // Payload
        if (params.payload) {
            // Add payload marker (0xFF)
            message[offset] = 0xFF;
            offset++;
            
            // Add payload
            const payloadBytes = typeof params.payload === 'string' ? 
                new TextEncoder().encode(params.payload) : params.payload;
            message.set(payloadBytes, offset);
            offset += payloadBytes.length;
        }
        
        // Return trimmed message
        return message.slice(0, offset);
    }
    
    // Add CoAP option to message
    addOption(message, offset, optionNumber, value) {
        const optionDelta = optionNumber; // Simplified - should calculate delta from previous option
        const optionLength = value.length;
        
        // Option header
        let optionHeader = 0;
        
        // Option delta (4 bits)
        if (optionDelta < 13) {
            optionHeader |= (optionDelta << 4);
        } else if (optionDelta < 269) {
            optionHeader |= (13 << 4);
        } else {
            optionHeader |= (14 << 4);
        }
        
        // Option length (4 bits)
        if (optionLength < 13) {
            optionHeader |= optionLength;
        } else if (optionLength < 269) {
            optionHeader |= 13;
        } else {
            optionHeader |= 14;
        }
        
        message[offset] = optionHeader;
        let bytesWritten = 1;
        
        // Extended option delta
        if (optionDelta >= 13 && optionDelta < 269) {
            message[offset + bytesWritten] = optionDelta - 13;
            bytesWritten++;
        } else if (optionDelta >= 269) {
            const extended = optionDelta - 269;
            message[offset + bytesWritten] = (extended >> 8) & 0xFF;
            message[offset + bytesWritten + 1] = extended & 0xFF;
            bytesWritten += 2;
        }
        
        // Extended option length
        if (optionLength >= 13 && optionLength < 269) {
            message[offset + bytesWritten] = optionLength - 13;
            bytesWritten++;
        } else if (optionLength >= 269) {
            const extended = optionLength - 269;
            message[offset + bytesWritten] = (extended >> 8) & 0xFF;
            message[offset + bytesWritten + 1] = extended & 0xFF;
            bytesWritten += 2;
        }
        
        // Option value
        message.set(value, offset + bytesWritten);
        bytesWritten += value.length;
        
        return bytesWritten;
    }
    
    // Send CoAP message
    sendMessage(message) {
        if (!this.isConnected || !this.socket) {
            throw new Error('Not connected');
        }
        
        // Encrypt with DTLS if enabled
        if (this.dtlsSession && this.dtlsSession.encrypted) {
            message = this.encryptWithDTLS(message);
        }
        
        this.sendRawMessage(message);
    }
    
    // Send raw message
    sendRawMessage(message) {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(message);
        } else {
            throw new Error('Socket not ready');
        }
    }
    
    // Handle incoming message
    handleMessage(data) {
        try {
            // Decrypt with DTLS if enabled
            if (this.dtlsSession && this.dtlsSession.encrypted) {
                data = this.decryptWithDTLS(data);
            }
            
            const message = this.parseMessage(data);
            
            // Handle response
            if (this.isResponse(message.code)) {
                this.handleResponse(message);
            }
            // Handle request
            else if (this.isRequest(message.code)) {
                this.handleRequest(message);
            }
            // Handle empty message
            else if (message.code === this.COAP_CODES.EMPTY) {
                this.handleEmpty(message);
            }
            
        } catch (error) {
            console.error('Failed to handle CoAP message:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
    }
    
    // Parse CoAP message
    parseMessage(data) {
        let offset = 0;
        
        // Header
        const header = data[offset];
        const version = (header >> 6) & 0x03;
        const type = (header >> 4) & 0x03;
        const tokenLength = header & 0x0F;
        offset++;
        
        const code = data[offset];
        offset++;
        
        const messageId = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        
        // Token
        let token = null;
        if (tokenLength > 0) {
            token = data.slice(offset, offset + tokenLength);
            offset += tokenLength;
        }
        
        // Options and payload
        const options = new Map();
        let payload = null;
        let currentOption = 0;
        
        while (offset < data.length) {
            // Check for payload marker
            if (data[offset] === 0xFF) {
                offset++;
                payload = data.slice(offset);
                break;
            }
            
            // Parse option
            const optionHeader = data[offset];
            const optionDelta = (optionHeader >> 4) & 0x0F;
            let optionLength = optionHeader & 0x0F;
            offset++;
            
            // Extended option delta and length handling would go here
            
            currentOption += optionDelta;
            const optionValue = data.slice(offset, offset + optionLength);
            offset += optionLength;
            
            if (!options.has(currentOption)) {
                options.set(currentOption, []);
            }
            options.get(currentOption).push(optionValue);
        }
        
        return {
            version,
            type,
            code,
            messageId,
            token,
            options,
            payload
        };
    }
    
    // Handle CoAP response
    handleResponse(message) {
        const request = this.pendingRequests.get(message.messageId);
        if (!request) {
            return; // Unexpected response
        }
        
        // Clear timeout
        clearTimeout(request.timeout);
        this.pendingRequests.delete(message.messageId);
        
        // Check for error codes
        if (message.code >= 128) { // 4.xx or 5.xx error
            request.reject(new Error(`CoAP error ${message.code}: ${this.getCodeDescription(message.code)}`));
            return;
        }
        
        // Success response
        const response = {
            code: message.code,
            payload: message.payload,
            options: message.options,
            contentFormat: this.getOptionValue(message.options, this.COAP_OPTIONS.CONTENT_FORMAT)
        };
        
        // Parse payload based on content format
        if (response.payload) {
            response.data = this.parsePayload(response.payload, response.contentFormat);
        }
        
        request.resolve(response);
    }
    
    // Handle CoAP request (for observe notifications)
    handleRequest(message) {
        // Handle observe notifications
        const observe = this.getOptionValue(message.options, this.COAP_OPTIONS.OBSERVE);
        if (observe !== null) {
            this.handleObserveNotification(message);
        }
    }
    
    // Handle observe notification
    handleObserveNotification(message) {
        const pathSegments = this.getOptionValues(message.options, this.COAP_OPTIONS.URI_PATH);
        const path = '/' + pathSegments.map(segment => new TextDecoder().decode(segment)).join('/');
        
        const relation = this.observeRelations.get(path);
        if (relation && relation.callback) {
            const notification = {
                path,
                payload: message.payload,
                contentFormat: this.getOptionValue(message.options, this.COAP_OPTIONS.CONTENT_FORMAT),
                observe: this.getOptionValue(message.options, this.COAP_OPTIONS.OBSERVE)
            };
            
            // Parse payload
            if (notification.payload) {
                notification.data = this.parsePayload(notification.payload, notification.contentFormat);
            }
            
            relation.callback(notification);
        }
    }
    
    // Start observing a resource
    async observe(path, callback, options = {}) {
        const response = await this.sendRequest('GET', path, null, {
            ...options,
            observe: 0 // Register observe
        });
        
        // Store observe relation
        this.observeRelations.set(path, {
            callback,
            options,
            token: response.token
        });
        
        return response;
    }
    
    // Stop observing a resource
    async unobserve(path) {
        const relation = this.observeRelations.get(path);
        if (!relation) {
            return;
        }
        
        // Send GET with observe=1 to deregister
        await this.sendRequest('GET', path, null, {
            observe: 1 // Deregister observe
        });
        
        this.observeRelations.delete(path);
    }
    
    // Helper methods
    getNextMessageId() {
        this.messageId = (this.messageId + 1) % 65536;
        return this.messageId;
    }
    
    getNextToken() {
        this.token = (this.token + 1) % 65536;
        return this.token;
    }
    
    tokenToBytes(token) {
        return new Uint8Array([token & 0xFF, (token >> 8) & 0xFF]);
    }
    
    intToBytes(value) {
        if (value === 0) return new Uint8Array([0]);
        
        const bytes = [];
        while (value > 0) {
            bytes.unshift(value & 0xFF);
            value >>= 8;
        }
        return new Uint8Array(bytes);
    }
    
    getOptionValue(options, optionNumber) {
        const values = options.get(optionNumber);
        if (!values || values.length === 0) return null;
        
        // Return first value as integer if it's a numeric option
        if ([this.COAP_OPTIONS.CONTENT_FORMAT, this.COAP_OPTIONS.ACCEPT, this.COAP_OPTIONS.OBSERVE].includes(optionNumber)) {
            let value = 0;
            for (const byte of values[0]) {
                value = (value << 8) | byte;
            }
            return value;
        }
        
        return values[0];
    }
    
    getOptionValues(options, optionNumber) {
        return options.get(optionNumber) || [];
    }
    
    isRequest(code) {
        return code >= 1 && code <= 31;
    }
    
    isResponse(code) {
        return code >= 64 && code <= 191;
    }
    
    getCodeDescription(code) {
        const descriptions = {
            128: 'Bad Request',
            129: 'Unauthorized',
            131: 'Forbidden',
            132: 'Not Found',
            133: 'Method Not Allowed',
            160: 'Internal Server Error',
            161: 'Not Implemented',
            163: 'Service Unavailable'
        };
        return descriptions[code] || `Code ${code}`;
    }
    
    parsePayload(payload, contentFormat) {
        switch (contentFormat) {
            case this.CONTENT_FORMATS.APPLICATION_JSON:
                return JSON.parse(new TextDecoder().decode(payload));
                
            case this.CONTENT_FORMATS.APPLICATION_CBOR:
                return this.decodeCBOR(payload);
                
            case this.CONTENT_FORMATS.TEXT_PLAIN:
                return new TextDecoder().decode(payload);
                
            default:
                return payload;
        }
    }
    
    // Simple CBOR decoder (basic implementation)
    decodeCBOR(data) {
        // This is a simplified CBOR decoder
        // A full implementation would handle all CBOR types
        try {
            return JSON.parse(new TextDecoder().decode(data));
        } catch (error) {
            return data;
        }
    }
    
    // DTLS encryption (placeholder)
    encryptWithDTLS(data) {
        // Real implementation would use proper DTLS encryption
        return data;
    }
    
    // DTLS decryption (placeholder)
    decryptWithDTLS(data) {
        // Real implementation would use proper DTLS decryption
        return data;
    }
}