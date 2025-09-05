// WebSerial API Controller
export class SerialController extends EventTarget {
    constructor() {
        super();
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.readableStreamClosed = null;
        this.writableStreamClosed = null;
        this.isConnected = false;
    }
    
    async connect(port, options = {}) {
        try {
            this.port = port;
            
            // Default serial port options
            const defaultOptions = {
                baudRate: 115200,
                dataBits: 8,
                stopBits: 1,
                parity: 'none',
                flowControl: 'none'
            };
            
            // Open port with merged options
            await this.port.open({ ...defaultOptions, ...options });
            
            // Setup streams
            const textDecoder = new TextDecoderStream();
            const textEncoder = new TextEncoderStream();
            
            this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
            this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
            
            this.reader = textDecoder.readable.getReader();
            this.writer = textEncoder.writable.getWriter();
            
            this.isConnected = true;
            
            // Start reading
            this.readLoop();
            
            // Emit connected event
            this.dispatchEvent(new Event('connected'));
            
            return true;
        } catch (error) {
            console.error('Failed to connect:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
            throw error;
        }
    }
    
    async disconnect() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                await this.readableStreamClosed.catch(() => {}); // Ignore errors
            }
            
            if (this.writer) {
                await this.writer.close();
                await this.writableStreamClosed;
            }
            
            if (this.port) {
                await this.port.close();
            }
            
            this.isConnected = false;
            this.port = null;
            this.reader = null;
            this.writer = null;
            
            // Emit disconnected event
            this.dispatchEvent(new Event('disconnected'));
            
        } catch (error) {
            console.error('Error during disconnect:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
        }
    }
    
    async readLoop() {
        try {
            while (true) {
                const { value, done } = await this.reader.read();
                
                if (done) {
                    // Reader has been cancelled
                    break;
                }
                
                if (value) {
                    // Emit data event
                    this.dispatchEvent(new CustomEvent('data', { detail: value }));
                }
            }
        } catch (error) {
            console.error('Read error:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
            
            // Auto disconnect on read error
            await this.disconnect();
        }
    }
    
    async write(data) {
        if (!this.isConnected || !this.writer) {
            throw new Error('Not connected');
        }
        
        try {
            await this.writer.write(data);
            return true;
        } catch (error) {
            console.error('Write error:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
            throw error;
        }
    }
    
    async writeBytes(bytes) {
        if (!this.isConnected || !this.port) {
            throw new Error('Not connected');
        }
        
        try {
            const writer = this.port.writable.getWriter();
            await writer.write(bytes);
            writer.releaseLock();
            return true;
        } catch (error) {
            console.error('Write bytes error:', error);
            this.dispatchEvent(new CustomEvent('error', { detail: error }));
            throw error;
        }
    }
    
    getPortInfo() {
        if (!this.port) return 'No port';
        
        const info = this.port.getInfo();
        if (info.usbVendorId && info.usbProductId) {
            return `USB ${info.usbVendorId.toString(16)}:${info.usbProductId.toString(16)}`;
        }
        return 'Serial Port';
    }
    
    // Helper method to list available ports (if permissions granted)
    static async getPorts() {
        try {
            const ports = await navigator.serial.getPorts();
            return ports;
        } catch (error) {
            console.error('Failed to get ports:', error);
            return [];
        }
    }
    
    // Event handler helpers
    on(event, handler) {
        this.addEventListener(event, handler);
    }
    
    off(event, handler) {
        this.removeEventListener(event, handler);
    }
}