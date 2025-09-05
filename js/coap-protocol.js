/**
 * CoAP Protocol Implementation
 * Based on actual CT program CoAP frames
 */

class CoAPProtocol {
    constructor() {
        // CoAP constants
        this.VERSION = 1;
        
        // Message types
        this.TYPE_CON = 0; // Confirmable
        this.TYPE_NON = 1; // Non-confirmable
        this.TYPE_ACK = 2; // Acknowledgement
        this.TYPE_RST = 3; // Reset
        
        // Method codes (from CT logs)
        this.CODE_GET = 0x01;    // 0.01
        this.CODE_POST = 0x02;   // 0.02
        this.CODE_PUT = 0x03;    // 0.03
        this.CODE_DELETE = 0x04; // 0.04
        this.CODE_FETCH = 0x05;  // 0.05 (from CT log)
        
        // Response codes
        this.CODE_CONTENT = 0x45; // 2.05
        
        // Option numbers
        this.OPT_URI_PATH = 11;
        this.OPT_CONTENT_FORMAT = 12;
        this.OPT_URI_QUERY = 15;
        this.OPT_ACCEPT = 17;
        this.OPT_BLOCK2 = 23;
        this.OPT_BLOCK1 = 27;
        
        // Content formats (from CT)
        this.FORMAT_CBOR = 60;
        this.FORMAT_YANG_DATA_CBOR = 140;
        this.FORMAT_YANG_IDENTIFIERS_CBOR = 141;
        this.FORMAT_YANG_INSTANCES_CBOR = 142;
        
        this.messageId = Math.floor(Math.random() * 65536);
    }
    
    /**
     * Build CoAP message
     * Based on CT frame: 40 05 00 03 B1 63 11 8D 33 64 3D 61 21 8E 61 04 FF ...
     */
    buildMessage(options = {}) {
        const {
            type = this.TYPE_CON,
            code = this.CODE_GET,
            messageId = this.getNextMessageId(),
            token = new Uint8Array(),
            uriPath = [],
            uriQuery = [],
            contentFormat = null,
            accept = null,
            block1 = null,
            block2 = null,
            payload = null
        } = options;
        
        // Build header (4 bytes)
        const header = new Uint8Array(4);
        header[0] = (this.VERSION << 6) | (type << 4) | (token.length & 0x0F);
        header[1] = code;
        header[2] = (messageId >> 8) & 0xFF;
        header[3] = messageId & 0xFF;
        
        // Build message
        let message = [...header];
        
        // Add token if present
        if (token.length > 0) {
            message.push(...token);
        }
        
        // Add options (must be in ascending order)
        let lastOption = 0;
        
        // URI-Path (option 11)
        for (const path of uriPath) {
            const pathBytes = new TextEncoder().encode(path);
            const optionHeader = this.encodeOption(this.OPT_URI_PATH - lastOption, pathBytes.length);
            message.push(...optionHeader, ...pathBytes);
            lastOption = this.OPT_URI_PATH;
        }
        
        // Content-Format (option 12)
        if (contentFormat !== null) {
            const formatBytes = this.encodeUint(contentFormat);
            const optionHeader = this.encodeOption(this.OPT_CONTENT_FORMAT - lastOption, formatBytes.length);
            message.push(...optionHeader, ...formatBytes);
            lastOption = this.OPT_CONTENT_FORMAT;
        }
        
        // URI-Query (option 15)
        for (const query of uriQuery) {
            const queryBytes = new TextEncoder().encode(query);
            const optionHeader = this.encodeOption(this.OPT_URI_QUERY - lastOption, queryBytes.length);
            message.push(...optionHeader, ...queryBytes);
            lastOption = this.OPT_URI_QUERY;
        }
        
        // Accept (option 17)
        if (accept !== null) {
            const acceptBytes = this.encodeUint(accept);
            const optionHeader = this.encodeOption(this.OPT_ACCEPT - lastOption, acceptBytes.length);
            message.push(...optionHeader, ...acceptBytes);
            lastOption = this.OPT_ACCEPT;
        }
        
        // Block2 (option 23)
        if (block2) {
            const blockBytes = this.encodeBlock(block2.num, block2.more, block2.size);
            const optionHeader = this.encodeOption(this.OPT_BLOCK2 - lastOption, blockBytes.length);
            message.push(...optionHeader, ...blockBytes);
            lastOption = this.OPT_BLOCK2;
        }
        
        // Add payload marker and payload if present
        if (payload && payload.length > 0) {
            message.push(0xFF); // Payload marker
            message.push(...payload);
        }
        
        return new Uint8Array(message);
    }
    
    /**
     * Parse CoAP message
     */
    parseMessage(data) {
        if (data.length < 4) {
            throw new Error('CoAP message too short');
        }
        
        let pos = 0;
        
        // Parse header
        const byte0 = data[pos++];
        const version = (byte0 >> 6) & 0x03;
        const type = (byte0 >> 4) & 0x03;
        const tokenLength = byte0 & 0x0F;
        
        const code = data[pos++];
        const messageId = (data[pos++] << 8) | data[pos++];
        
        // Parse token
        const token = data.slice(pos, pos + tokenLength);
        pos += tokenLength;
        
        // Parse options
        const options = {
            uriPath: [],
            uriQuery: [],
            contentFormat: null,
            accept: null,
            block1: null,
            block2: null
        };
        
        let lastOption = 0;
        while (pos < data.length && data[pos] !== 0xFF) {
            const optionByte = data[pos++];
            if (optionByte === 0xFF) break;
            
            let delta = (optionByte >> 4) & 0x0F;
            let length = optionByte & 0x0F;
            
            // Extended delta
            if (delta === 13) {
                delta = 13 + data[pos++];
            } else if (delta === 14) {
                delta = 269 + (data[pos++] << 8) + data[pos++];
            }
            
            // Extended length
            if (length === 13) {
                length = 13 + data[pos++];
            } else if (length === 14) {
                length = 269 + (data[pos++] << 8) + data[pos++];
            }
            
            const optionNumber = lastOption + delta;
            const optionValue = data.slice(pos, pos + length);
            pos += length;
            
            // Store option based on number
            switch (optionNumber) {
                case this.OPT_URI_PATH:
                    options.uriPath.push(new TextDecoder().decode(optionValue));
                    break;
                case this.OPT_URI_QUERY:
                    options.uriQuery.push(new TextDecoder().decode(optionValue));
                    break;
                case this.OPT_CONTENT_FORMAT:
                    options.contentFormat = this.decodeUint(optionValue);
                    break;
                case this.OPT_ACCEPT:
                    options.accept = this.decodeUint(optionValue);
                    break;
                case this.OPT_BLOCK2:
                    options.block2 = this.decodeBlock(optionValue);
                    break;
                case this.OPT_BLOCK1:
                    options.block1 = this.decodeBlock(optionValue);
                    break;
            }
            
            lastOption = optionNumber;
        }
        
        // Parse payload
        let payload = null;
        if (pos < data.length && data[pos] === 0xFF) {
            pos++; // Skip payload marker
            payload = data.slice(pos);
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
    
    /**
     * Encode option header
     */
    encodeOption(delta, length) {
        const header = [];
        let deltaByte, lengthByte;
        
        // Encode delta
        if (delta < 13) {
            deltaByte = delta;
        } else if (delta < 269) {
            deltaByte = 13;
            header.push(delta - 13);
        } else {
            deltaByte = 14;
            header.push((delta - 269) >> 8, (delta - 269) & 0xFF);
        }
        
        // Encode length
        if (length < 13) {
            lengthByte = length;
        } else if (length < 269) {
            lengthByte = 13;
            header.push(length - 13);
        } else {
            lengthByte = 14;
            header.push((length - 269) >> 8, (length - 269) & 0xFF);
        }
        
        // First byte combines delta and length
        header.unshift((deltaByte << 4) | lengthByte);
        
        return header;
    }
    
    /**
     * Encode unsigned integer for CoAP options
     */
    encodeUint(value) {
        if (value === 0) return new Uint8Array([]);
        if (value < 256) return new Uint8Array([value]);
        if (value < 65536) return new Uint8Array([value >> 8, value & 0xFF]);
        if (value < 16777216) return new Uint8Array([value >> 16, (value >> 8) & 0xFF, value & 0xFF]);
        return new Uint8Array([value >> 24, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);
    }
    
    /**
     * Decode unsigned integer
     */
    decodeUint(bytes) {
        let value = 0;
        for (const byte of bytes) {
            value = (value << 8) | byte;
        }
        return value;
    }
    
    /**
     * Encode block option
     */
    encodeBlock(num, more, size) {
        const szx = Math.log2(size / 16);
        const value = (num << 4) | (more ? 0x08 : 0) | szx;
        return this.encodeUint(value);
    }
    
    /**
     * Decode block option
     */
    decodeBlock(bytes) {
        const value = this.decodeUint(bytes);
        const num = value >> 4;
        const more = (value & 0x08) !== 0;
        const szx = value & 0x07;
        const size = 16 * Math.pow(2, szx);
        return { num, more, size };
    }
    
    /**
     * Get next message ID
     */
    getNextMessageId() {
        this.messageId = (this.messageId + 1) & 0xFFFF;
        return this.messageId;
    }
}

// Export for use
window.CoAPProtocol = CoAPProtocol;