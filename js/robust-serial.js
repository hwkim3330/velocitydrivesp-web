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
            // Request port with filters for common Microchip devices
            this.port = await navigator.serial.requestPort({
                filters: [
                    { usbVendorId: 0x04D8 }, // Microchip
                    { usbVendorId: 0x0403 }, // FTDI
                    { usbVendorId: 0x067B }, // Prolific
                    { usbVendorId: 0x10C4 }, // Silicon Labs
                    { usbVendorId: 0x1A86 }  // QinHeng
                ]
            });
            return true;
        } catch (e) {
            if (e.name !== 'NotFoundError') {
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
                    await this.port.close();
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
                retries--;
                
                if (retries > 0) {
                    console.log(`Retrying in 1 second...`);
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    // Try alternative approach - direct binary streams
                    try {
                        console.log('Trying alternative connection method...');
                        await this.connectBinary(baudRate);
                        return true;
                    } catch (altError) {
                        console.error('Alternative method also failed:', altError);
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