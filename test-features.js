// Playwright test script for Spandan feature verification
const { chromium } = require('playwright');

const BASE_URL = 'http://[::1]:5175';
const API_URL = 'http://localhost:7001';

async function login(page, email, password, role = 'teacher') {
  // Capture console logs for debugging
  page.on('console', msg => {
    console.log(`BROWSER ${msg.type()}:`, msg.text());
  });
  page.on('pageerror', err => console.log('BROWSER PAGE ERROR:', err.message));
  
  await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Log what's in the DOM
  const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
  console.log('Body HTML:', bodyHTML);
  
  const hasEmailInput = await page.$('input[type="email"]');
  if (!hasEmailInput) {
    console.log('Email input not found, taking screenshot...');
    await page.screenshot({ path: 'test-results/debug-no-email-input.png', fullPage: true });
    throw new Error('Login form did not load');
  }
  
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  
  if (role === 'teacher') {
    await page.waitForURL('**/teacher**', { timeout: 15000 });
  } else {
    await page.waitForURL('**/student**', { timeout: 15000 });
  }
  console.log(`✓ Logged in as ${email}`);
}

async function createRoom(page, roomName) {
  // Create room via API using fetch in browser context (uses Vite proxy)
  const room = await page.evaluate(async (name) => {
    const stored = localStorage.getItem('spandan-auth');
    const { state } = JSON.parse(stored);
    const token = state.token;
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, settings: { mode: 'normal' } })
    });
    return await response.json();
  }, roomName);
  
  console.log(`✓ Created room: ${roomName} (code: ${room.room.code})`);
  return room.room;
}

async function testFeature1_TimerRing(page) {
  console.log('\n=== FEATURE 1: Timer Progress Ring ===');
  
  // Look for the timer ring SVG element
  const timerRing = await page.$('svg circle.timer-ring, svg.timer-ring, .timer-ring, svg circle[class*="ring"], svg[class*="timer"]');
  if (timerRing) {
    console.log('✓ Timer ring SVG element found');
    
    // Check if it has the expected SVG structure
    const strokeDasharray = await timerRing.getAttribute('stroke-dasharray');
    console.log(`  stroke-dasharray: ${strokeDasharray}`);
  } else {
    // Check for any circular progress element
    const circularProgress = await page.$('svg circle, .progress-ring, .circular-progress');
    if (circularProgress) {
      console.log('✓ Circular progress element found');
    } else {
      console.log('✗ No timer ring element found');
    }
  }
  
  // Look for the timer number display
  const timerDisplay = await page.$('.timer, [class*="timer"], [class*="countdown"]');
  if (timerDisplay) {
    console.log('✓ Timer display element found');
    const text = await timerDisplay.textContent();
    console.log(`  Timer text: ${text}`);
  }
}

async function testFeature2_TimesUpFlash(page) {
  console.log('\n=== FEATURE 2: Time\'s Up Flash ===');
  
  // Check if the flash overlay exists in DOM (hidden initially)
  const flashOverlay = await page.$('.timeup-overlay, .times-up, [class*="time-up"], [class*="timesUp"], [class*="flash"]');
  if (flashOverlay) {
    console.log('✓ Time\'s Up overlay element found in DOM');
    
    // Check if it's initially hidden
    const isVisible = await flashOverlay.isVisible();
    console.log(`  Initially visible: ${isVisible} (should be false)`);
    
    // Check for vibration API support
    const hasVibration = await page.evaluate(() => 'vibrate' in navigator);
    console.log(`  Vibration API supported: ${hasVibration}`);
  } else {
    console.log('✗ No time\'s up overlay element found');
  }
}

async function testFeature3_DarkModeAuto(page) {
  console.log('\n=== FEATURE 3: Dark Mode Auto (System) ===');
  
  // Find theme toggle
  const themeToggle = await page.$('[class*="theme"], [class*="toggle"], button:has-text("Theme"), .theme-toggle');
  if (themeToggle) {
    console.log('✓ Theme toggle found');
    await themeToggle.click();
    await page.waitForTimeout(500);
    
    // Check for "System" or "Auto" option
    const systemOption = await page.$('text=System, text=Auto, button:has-text("System"), button:has-text("Auto")');
    if (systemOption) {
      console.log('✓ "System/Auto" theme option found');
    } else {
      console.log('✗ No System/Auto option found');
    }
  } else {
    console.log('✗ Theme toggle not found');
  }
}

async function testFeature4_KeyboardShortcuts(page) {
  console.log('\n=== FEATURE 4: Keyboard Shortcuts ===');
  
  // Check for keyboard shortcut hint chip in header
  const hintChip = await page.$('[class*="hint"], [class*="shortcut"], [class*="chip"]');
  if (hintChip) {
    const text = await hintChip.textContent();
    console.log(`✓ Keyboard shortcut hint chip found: "${text}"`);
  } else {
    console.log('No hint chip found (may be hidden until hover)');
  }
  
  // Test keyboard shortcuts
  console.log('Testing Space key (should launch next question if available)...');
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  
  console.log('Testing Arrow keys...');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  
  console.log('Testing R key (toggle recording)...');
  await page.keyboard.press('r');
  await page.waitForTimeout(500);
  
  console.log('Testing Q key (open question creator)...');
  await page.keyboard.press('q');
  await page.waitForTimeout(500);
  
  console.log('✓ Keyboard shortcuts tested (visual verification needed)');
}

async function testFeature5_PreviewButton(page) {
  console.log('\n=== FEATURE 5: Question Preview Button ===');
  
  // Try to open question approval popup (if questions are pending)
  const pendingQuestions = await page.$('[class*="pending"], [class*="approval"]');
  if (pendingQuestions) {
    console.log('✓ Pending questions section found');
    
    // Look for preview button
    const previewButton = await page.$('button:has-text("Preview"), [class*="preview"]');
    if (previewButton) {
      console.log('✓ Preview button found');
      await previewButton.click();
      await page.waitForTimeout(1000);
      
      // Check for preview modal/overlay
      const previewModal = await page.$('[class*="preview-modal"], [class*="preview-overlay"], [class*="modal"]');
      if (previewModal) {
        console.log('✓ Preview modal opened');
        const isVisible = await previewModal.isVisible();
        console.log(`  Modal visible: ${isVisible}`);
      }
    } else {
      console.log('✗ Preview button not found');
    }
  } else {
    console.log('No pending questions to preview (need to generate questions first)');
  }
}

async function runTests() {
  console.log('🚀 Starting Spandan Feature Verification Tests\n');
  
  const browser = await chromium.launch({ 
    headless: false,  // Set to true for headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    // Create two browser contexts (teacher + student)
    const teacherContext = await browser.newContext();
    const studentContext = await browser.newContext();
    
    const teacherPage = await teacherContext.newPage();
    const studentPage = await studentContext.newPage();
    
    // Login as teacher
    await login(teacherPage, 'teacher@test.com', 'Test123!');
    await teacherPage.screenshot({ path: 'test-results/teacher-logged-in.png' });
    
    // Login as student
    await login(studentPage, 'student@test.com', 'Test123!', 'student');
    await studentPage.screenshot({ path: 'test-results/student-logged-in.png' });
    
    // Create room as teacher
    const newRoom = await createRoom(teacherPage, 'Test Room Features');
    await teacherPage.screenshot({ path: 'test-results/teacher-room-created.png' });
    
    // Navigate teacher to room detail
    await teacherPage.goto(`${BASE_URL}/teacher/room/${newRoom._id}`);
    await teacherPage.waitForTimeout(2000);
    
    // Join room as student
    await studentPage.goto(`${BASE_URL}/student/join-room`);
    await studentPage.waitForSelector('input[type="text"]', { timeout: 5000 });
    await studentPage.fill('input[type="text"]', newRoom.code);
    await studentPage.screenshot({ path: 'test-results/debug-student-join-room.png' });
    
    // Click and wait for navigation
    await studentPage.click('button:has-text("Join Room")');
    
    // Wait for navigation or error
    await studentPage.waitForTimeout(3000);
    
    // Check current URL
    const currentUrl = studentPage.url();
    console.log(`Current URL after join: ${currentUrl}`);
    
    // Check for error message
    const errorText = await studentPage.$eval('[class*="error"], .error-message, [class*="error-message"]', el => el.textContent).catch(() => null);
    if (errorText) {
      console.log(`Error message: ${errorText}`);
    }
    
    await studentPage.screenshot({ path: 'test-results/debug-after-join-room.png' });
    
    // If still on join room page, try navigating directly
    if (currentUrl.includes('join-room')) {
      console.log('Navigation did not happen, trying direct navigation...');
      await studentPage.goto(`${BASE_URL}/student/session/${newRoom.code}`);
    }
    
    await studentPage.waitForTimeout(2000);
    await studentPage.screenshot({ path: 'test-results/student-joined-room.png' });
    
    // Run feature tests
    await testFeature1_TimerRing(studentPage);
    await testFeature2_TimesUpFlash(studentPage);
    await testFeature3_DarkModeAuto(teacherPage);
    await testFeature4_KeyboardShortcuts(teacherPage);
    await testFeature5_PreviewButton(teacherPage);
    
    console.log('\n✅ All feature tests completed!');
    console.log('📸 Screenshots saved to test-results/');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

runTests();
