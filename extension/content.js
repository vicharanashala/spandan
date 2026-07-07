// content.js
// This script is injected into the Spandan web application (*://localhost/* or prod domain)

// Listen for the custom event dispatched by the React frontend (e.g. StudentPoll.jsx)
window.addEventListener('spandan_tab_switch', (e) => {
  console.log('[Spandan Extension] Detected tab switch flag from web app:', e.detail);
  
  // Relay it to the background script
  chrome.runtime.sendMessage({
    type: 'TAB_SWITCH_FLAG',
    questionId: e.detail?.questionId,
    timestamp: Date.now()
  });
});
