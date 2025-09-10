// CoAP Communication Fix
// The issue is that we're sending >c every time before CoAP messages
// We need to:
// 1. Send >c once to enter CoAP mode
// 2. Then send raw CoAP binary data without MUP1 framing

// Fixed CoAP communication pattern:

let coapModeActive = false;

async function enterCoapMode() {
  if (coapModeActive) return;
  
  // Send CoAP init command
  await writer.write(new TextEncoder().encode('>c\n'));
  
  // Wait for device to enter CoAP mode
  await new Promise(resolve => setTimeout(resolve, 100));
  
  coapModeActive = true;
  console.log('CoAP mode activated');
}

async function sendCoapRequest(method, uri, payload = null) {
  // Ensure we're in CoAP mode
  await enterCoapMode();
  
  // Build CoAP message with proper CORECONF structure
  const coap = new CoapProtocol();
  const message = coap.buildMessage(method, uri, payload);
  
  console.log('Sending CoAP message:', message);
  
  // Send raw CoAP binary (no MUP1 framing in CoAP mode)
  await writer.write(message);
  
  // Read response
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('CoAP request timeout'));
    }, 5000);
    
    // Wait for response data
    setTimeout(async () => {
      try {
        const response = await reader.read();
        clearTimeout(timeout);
        
        if (response.value && response.value.length > 0) {
          const data = new Uint8Array(response.value);
          
          // Parse CoAP response
          const parsed = coap.parseMessage(data);
          resolve(parsed);
        } else {
          reject(new Error('No response received'));
        }
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    }, 500);
  });
}

// Example usage:
async function getInterfaceConfig() {
  try {
    const response = await sendCoapRequest('GET', '/ietf-interfaces:interfaces');
    console.log('Interface config:', response);
    return response;
  } catch (error) {
    console.error('Failed to get interface config:', error);
  }
}