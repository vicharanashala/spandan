// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  const startBtn = document.getElementById('startRecBtn');
  const stopBtn = document.getElementById('stopRecBtn');
  const recStatus = document.getElementById('recStatus');
  const lockdownToggle = document.getElementById('lockdownToggle');

  // Check current lockdown status from storage
  chrome.storage.local.get(['lockdownEnabled', 'isRecording'], (result) => {
    if (result.lockdownEnabled) {
      lockdownToggle.checked = true;
    }
    if (result.isRecording) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      recStatus.textContent = 'Recording in progress...';
      recStatus.style.color = '#ef4444';
    }
  });

  startBtn.addEventListener('click', () => {
    // We use desktopCapture to pick the tab/screen/audio to record
    chrome.desktopCapture.chooseDesktopMedia(
      ['screen', 'window', 'tab', 'audio'],
      (streamId) => {
        if (!streamId) {
          recStatus.textContent = 'Capture cancelled.';
          return;
        }

        // Pass the streamId to the background script to start offscreen recording
        chrome.runtime.sendMessage({
          type: 'START_BACKGROUND_RECORDING',
          streamId: streamId
        }, (response) => {
          if (response && response.success) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'block';
            recStatus.textContent = 'Recording in progress...';
            recStatus.style.color = '#ef4444';
            chrome.storage.local.set({ isRecording: true });
          }
        });
      }
    );
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'STOP_BACKGROUND_RECORDING'
    }, (response) => {
      if (response && response.success) {
        stopBtn.style.display = 'none';
        startBtn.style.display = 'block';
        recStatus.textContent = 'Recording saved & uploaded.';
        recStatus.style.color = '#10b981';
        chrome.storage.local.set({ isRecording: false });
      }
    });
  });

  lockdownToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    
    chrome.runtime.sendMessage({
      type: 'SET_LOCKDOWN',
      enabled: enabled
    }, (response) => {
      if (response && response.success) {
        chrome.storage.local.set({ lockdownEnabled: enabled });
      }
    });
  });
});
