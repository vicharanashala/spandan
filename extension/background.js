// background.js

const LOCKDOWN_RULE_ID = 1;

// 1. Lockdown Mode (Internet Block except localhost)
async function setLockdownMode(enabled) {
  console.log(`Setting lockdown mode to: ${enabled}`);
  if (enabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [LOCKDOWN_RULE_ID],
      addRules: [
        {
          id: LOCKDOWN_RULE_ID,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: '*',
            // Allow localhost, the extension itself, and standard dev/local IPs
            excludedRequestDomains: ['localhost', '127.0.0.1'],
            resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
          }
        }
      ]
    });
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [LOCKDOWN_RULE_ID]
    });
  }
}

// 2. Offscreen Document Management (for recording)
let recording = false;

async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({});
  const offscreenDocument = existingContexts.find(
    (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
  );

  if (!offscreenDocument) {
    await chrome.offscreen.createDocument({
      url: path,
      reasons: ['USER_MEDIA'],
      justification: 'Recording teacher session for transcription and playback'
    });
  }
}

async function startRecording(streamId) {
  if (recording) return;
  
  await setupOffscreenDocument('offscreen.html');
  
  // Send message to offscreen doc to start recording with the streamId
  chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    target: 'offscreen',
    streamId: streamId
  });
  
  recording = true;
}

async function stopRecording() {
  if (!recording) return;
  
  chrome.runtime.sendMessage({
    type: 'STOP_RECORDING',
    target: 'offscreen'
  });
  
  recording = false;
  // Let the offscreen doc finish uploading chunks before closing it
}

// 3. Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_LOCKDOWN') {
    setLockdownMode(message.enabled).then(() => {
      sendResponse({ success: true, enabled: message.enabled });
    });
    return true; // async response
  }
  
  if (message.type === 'START_BACKGROUND_RECORDING') {
    startRecording(message.streamId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'STOP_BACKGROUND_RECORDING') {
    stopRecording().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  // 4. Relay tab switch events to backend (if content script detects them)
  if (message.type === 'TAB_SWITCH_FLAG') {
    console.log('Tab switch flagged by student!');
    // In a full implementation, you would emit this via the socket
    // or make a fetch call to the backend API here
    fetch('http://localhost:3001/api/rooms/demo12/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'tab_switched', timestamp: Date.now() })
    }).catch(e => console.error('Failed to notify backend of tab switch', e));
  }
});
