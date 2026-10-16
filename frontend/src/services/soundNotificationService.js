class SoundNotificationService {
  constructor() {
    this.audioContext = null;
    this.originalTitle = document.title;
    this.flashInterval = null;
    this.isFlashing = false;
    
    // Load preferences from localStorage (default to false if not set)
    this.muted = localStorage.getItem('spandan_sound_muted') === 'true';
    this.volume = parseFloat(localStorage.getItem('spandan_sound_volume')) || 0.5;
  }

  // Initialize the audio context (must be called after a user interaction)
  initAudio() {
    if (!this.audioContext) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
      } catch (e) {
        console.warn('Web Audio API not supported', e);
      }
    }
    // If context is suspended (due to autoplay policy), resume it
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('spandan_sound_muted', this.muted);
    return this.muted;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('spandan_sound_volume', this.volume);
  }

  // Synthesize a pleasant 2-tone chime using Web Audio API
  playChime() {
    if (this.muted) return;
    
    this.initAudio();
    if (!this.audioContext) return;

    try {
      const now = this.audioContext.currentTime;
      
      // First tone (D5)
      const osc1 = this.audioContext.createOscillator();
      const gain1 = this.audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(this.volume, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      osc1.connect(gain1);
      gain1.connect(this.audioContext.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Second tone (A5)
      const osc2 = this.audioContext.createOscillator();
      const gain2 = this.audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, now + 0.15); // A5
      
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(this.volume, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc2.connect(gain2);
      gain2.connect(this.audioContext.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.8);
      
    } catch (e) {
      console.warn('Error playing chime', e);
    }
  }

  // Trigger mobile device vibration
  vibrate() {
    if (!this.muted && navigator.vibrate) {
      // Vibrate for 200ms, pause 100ms, vibrate 200ms
      navigator.vibrate([200, 100, 200]);
    }
  }

  // Start flashing the tab title
  startTitleFlash(timeLeft = 30) {
    if (this.isFlashing) return;
    
    this.originalTitle = document.title;
    this.isFlashing = true;
    
    let isRed = true;
    
    const updateTitle = () => {
      if (!this.isFlashing) return;
      if (isRed) {
        document.title = `🔴 Question Live!`;
      } else {
        document.title = `⚡ Spandan: Answer Now!`;
      }
      isRed = !isRed;
    };

    updateTitle();
    this.flashInterval = setInterval(updateTitle, 1000);
  }
  
  updateTitleTime(timeLeft) {
      if (!this.isFlashing) return;
      // Wait for the next tick to update text, or immediately update if we want
      // For simplicity, we just use the flash interval which flips the text.
  }

  // Stop flashing and restore original title
  stopTitleFlash() {
    if (!this.isFlashing) return;
    
    clearInterval(this.flashInterval);
    this.flashInterval = null;
    this.isFlashing = false;
    document.title = this.originalTitle;
  }
}

export const soundNotificationService = new SoundNotificationService();
