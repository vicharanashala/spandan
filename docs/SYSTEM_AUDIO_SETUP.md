# System & Classroom Audio Setup Guide for Spandan

This guide explains how to configure classroom and system audio capture in Spandan so that **all voices** (teachers, students in the classroom, online participants, and videos) are included in the live transcript used for AI question generation.

---

## Why Is System Audio Capture Needed?

By default, web applications can only capture the host's primary microphone via `getUserMedia()`. If a student speaks across the classroom or a video/call is playing on the host computer, that audio is not captured by the microphone.

Spandan solves this with two provider-agnostic audio capture mechanisms:

1. **Dual-Device Audio Mixing (Universal — Works on all browsers)**: Captures your primary microphone and a secondary virtual audio device (VB-Cable / BlackHole) simultaneously using the Web Audio API.
2. **Native System Audio Capture (Chrome / Edge)**: Uses Chrome's native screen/tab audio capture with one click.

---

## Method 1: Virtual Audio Cable Setup (Firefox, Safari, Chrome, Edge)

### Windows (VB-Audio Virtual Cable)

1. **Download**: Visit [https://vb-audio.com/Cable/](https://vb-audio.com/Cable/) and download `VBCable_Driver_Pack.zip`.
2. **Install**:
   - Extract the ZIP file.
   - Right-click `VBCABLE_Setup_x64.exe` and select **Run as Administrator**.
   - Click **Install Driver**.
3. **Reboot**: Restart your computer if prompted by Windows.
4. **Configure Windows Audio**:
   - Open **Windows Sound Settings**.
   - Set Output device to **CABLE Input (VB-Audio Virtual Cable)**.
5. **Configure Spandan**:
   - In Spandan, open your Room.
   - Under **Secondary Source (Classroom Audio)**, select **CABLE Output**.
   - Spandan will now mix your physical microphone and CABLE Output together.

---

### macOS (BlackHole 2ch)

1. **Download**: Visit [https://existential.audio/blackhole/](https://existential.audio/blackhole/) and download **BlackHole 2ch**.
2. **Install**: Open the downloaded `.pkg` installer and complete the setup wizard.
3. **Configure Multi-Output Device**:
   - Open the **Audio MIDI Setup** app (in Applications → Utilities).
   - Click the **+** icon at the bottom-left and select **Create Multi-Output Device**.
   - Check both **Built-in Output** (or headphones) AND **BlackHole 2ch**.
   - Set **Multi-Output Device** as your Mac's Sound Output device.
4. **Configure Spandan**:
   - In Spandan, open your Room.
   - Under **Secondary Source (Classroom Audio)**, select **BlackHole 2ch**.
   - Spandan will now mix your Mac microphone and BlackHole audio together.

---

## Method 2: Native Chrome & Edge System Audio Capture

If you are using **Google Chrome** or **Microsoft Edge**:

1. Open your Spandan Room.
2. On the Microphone card, toggle the switch from **🎙️ Mic Only** to **🎙️🔊 Mic + System Audio**.
3. Click **Start Recording**.
4. In the browser dialog that appears:
   - Select the screen or tab you want to capture.
   - Ensure the **"Share system audio"** (or "Share tab audio") checkbox is **CHECKED**.
   - Click **Share**.
5. Spandan will automatically capture and mix your microphone and system audio.

---

## Frequently Asked Questions (FAQ)

### Does this work with Sarvam AI and Whisper?
Yes. Audio mixing happens at the browser capture level before any audio is sent to the server. Both Whisper and Sarvam AI receive the exact same high-quality WAV stream.

### What happens if I unplug my microphone during a session?
Spandan automatically handles device changes and falls back gracefully to your default system microphone.

### Why is there no sound from my computer speakers when using VB-Cable?
If you select VB-Cable as your sole default output, Windows sends sound to the virtual cable instead of your speakers. To hear sound through speakers AND send it to Spandan, use a virtual audio router like **VoiceMeeter** (Windows) or a **Multi-Output Device** (macOS).
