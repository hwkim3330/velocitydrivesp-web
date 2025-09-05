class RobustSerialController {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.isConnected = false;
    }

    async requestPort() {
        try {
            // First, check if we already have ports available
            const ports = await navigator.serial.getPorts();
            if (ports.length > 0) {
                console.log(`Found ${ports.length} existing port(s), using first one`);
                this.port = ports[0];
                return true;
            }
            
            // Request new port with filters for common Microchip devices
            console.log('Requesting new serial port from user...');
            this.port = await navigator.serial.requestPort({
                filters: [
                    { usbVendorId: 0x04D8 }, // Microchip
                    { usbVendorId: 0x0403 }, // FTDI
                    { usbVendorId: 0x067B }, // Prolific
                    { usbVendorId: 0x10C4 }, // Silicon Labs
                    { usbVendorId: 0x1A86 }  // QinHeng
                ]
            });
            console.log('Port selected by user');
            return true;
        } catch (e) {
            if (e.name === 'NotFoundError') {
                console.log('No port selected by user');
            } else {
                console.error('Port request failed:', e);
            }
            return false;
        }
    }

    async connect(baudRate = 115200) {
        if (!this.port) {
            const requested = await this.requestPort();
            if (!requested) return false;
        }

        // Close any existing connections first
        await this.disconnect();

        const options = {
            baudRate: baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 4096,
            flowControl: 'none'
        };

        let retries = 3;
        while (retries > 0) {
            try {
                console.log(`Opening serial port (attempt ${4 - retries}/3)...`);
                
                // Ensure port is closed before opening
                if (this.port.readable || this.port.writable) {
                    console.log('Port is already open, closing first...');
                    await this.port.close().catch(e => console.log('Close error (ignored):', e));
                    await new Promise(r => setTimeout(r, 500));
                }

                await this.port.open(options);
                
                // Set up streams
                const textDecoder = new TextDecoderStream();
                const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
                this.reader = textDecoder.readable.getReader();
                
                const textEncoder = new TextEncoderStream();
                const writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
                this.writer = textEncoder.writable.getWriter();
                
                this.readableStreamClosed = readableStreamClosed;
                this.writableStreamClosed = writableStreamClosed;
                
                this.isConnected = true;
                console.log('Serial port opened successfully');
                
                // Start reading
                this.startReading();
                
                return true;
            } catch (error) {
                console.error(`Failed to open port:`, error);
                
                // Check specific error messages
                if (error.message && error.message.includes('Failed to open serial port')) {
                    console.log('Port may be in use by another application.');
                    console.log('Please close any other serial terminal programs and try again.');
                }
                
                retries--;
                
                if (retries > 0) {
                    console.log(`Retrying in 2 seconds...`);
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // Try alternative approach - direct binary streams
                    try {
                        console.log('Trying alternative connection method...');
                        await this.connectBinary(baudRate);
                        return true;
                    } catch (altError) {
                        console.error('Alternative method also failed:', altError);
                        
                        // Provide helpful error message
                        if (altError.message && altError.message.includes('Failed to open serial port')) {
                            throw new Error('Serial port is unavailable. Please ensure:\n' +
                                '1. No other application is using the port\n' +
                                '2. The device is connected\n' +
                                '3. You have granted permission when prompted');
                        }
                        throw error;
                    }
                }
            }
        }
        
        return false;
    }

    async connectBinary(baudRate = 115200) {
        if (!this.port) throw new Error('No port selected');

        // Close if already open
        if (this.port.readable || this.port.writable) {
            await this.port.close();
            await new Promise(r => setTimeout(r, 500));
        }

        const options = {
            baudRate: baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 4096,
            flowControl: 'none'
        };

        await this.port.open(options);
        
        // Use direct binary streams
        this.reader = this.port.readable.getReader();
        this.writer = this.port.writable.getWriter();
        
        this.isConnected = true;
        console.log('Serial port opened in binary mode');
        
        // Start binary reading
        this.startBinaryReading();
    }

    async startReading() {
        while (this.isConnected && this.reader) {
            try {
                const { value, done } = await this.reader.read();
                if (done) {
                    console.log('Reader closed');
                    break;
                }
                if (value) {
                    this.handleData(value);
                }
            } catch (error) {
                console.error('Read error:', error);
                break;
            }
        }
    }

    async startBinaryReading() {
        const decoder = new TextDecoder();
        while (this.isConnected && this.reader) {
            try {
                const { value, done } = await this.reader.read();
                if (done) {
                    console.log('Reader closed');
                    break;
                }
                if (value) {
                    const text = decoder.decode(value);
                    this.handleData(text);
                }
            } catch (error) {
                console.error('Read error:', error);
                break;
            }
        }
    }

    handleData(data) {
        // Override this method in subclass
        console.log('Received:', data);
    }

    async write(data) {
        if (!this.writer) {
            throw new Error('Not connected');
        }
        
        try {
            await this.writer.write(data);
        } catch (error) {
            console.error('Write error:', error);
            throw error;
        }
    }

    async writeBinary(data) {
        if (!this.writer) {
            throw new Error('Not connected');
        }
        
        try {
            const encoder = new TextEncoder();
            const encoded = encoder.encode(data);
            await this.writer.write(encoded);
        } catch (error) {
            console.error('Write error:', error);
            throw error;
        }
    }
    
    async writeBytes(bytes) {
        if (!this.writer) {
            throw new Error('Not connected');
        }
        
        try {
            // Direct binary write
            await this.writer.write(bytes);
            console.log('Sent bytes:', Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
        } catch (error) {
            console.error('Write bytes error:', error);
            throw error;
        }
    }

    async disconnect() {
        this.isConnected = false;
        
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.readableStreamClosed?.catch(() => {});
                this.reader = null;
            }
            
            if (this.writer) {
                await this.writer.close();
                await this.writableStreamClosed?.catch(() => {});
                this.writer = null;
            }
            
            if (this.port && (this.port.readable || this.port.writable)) {
                await this.port.close();
            }
        } catch (error) {
            console.error('Disconnect error:', error);
        }
    }

    async getSignals() {
        if (!this.port) return null;
        try {
            return await this.port.getSignals();
        } catch (error) {
            console.error('Failed to get signals:', error);
            return null;
        }
    }

    async setSignals(signals) {
        if (!this.port) return false;
        try {
            await this.port.setSignals(signals);
            return true;
        } catch (error) {
            console.error('Failed to set signals:', error);
            return false;
        }
    }
}

// Export for use
window.RobustSerialController = RobustSerialController;