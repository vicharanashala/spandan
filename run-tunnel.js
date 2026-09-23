const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const cloudflaredPath = 'C:/Users/Asus/Downloads/cloudflared-windows-amd64.exe';
const targetUrl = 'http://localhost:5173';
const linkFilePath = path.join(__dirname, 'tunnel-link.txt');

console.log(`[tunnel] Starting cloudflared tunnel to ${targetUrl}...`);

// Clean up old link file if it exists
if (fs.existsSync(linkFilePath)) {
  try {
    fs.unlinkSync(linkFilePath);
  } catch (err) {
    // Ignore
  }
}

// Spawn the cloudflared process
const child = spawn(cloudflaredPath, ['tunnel', '--url', targetUrl], {
  stdio: ['inherit', 'pipe', 'pipe']
});

let linkFound = false;
let buffer = '';

function handleData(data) {
  const text = data.toString();
  buffer += text;
  
  // Forward all logs to stderr/stdout so standard visibility is preserved
  process.stderr.write(data);

  if (!linkFound) {
    // Look for the quick tunnel URL pattern
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      linkFound = true;
      const url = match[0];
      const separator = '='.repeat(80);
      const message = `\n${separator}\n\n   🎉 CLOUDFLARE TUNNEL IS READY!\n   🔗 URL: ${url}\n   📁 Saved to: ${linkFilePath}\n\n${separator}\n`;
      console.log(message);
      
      try {
        fs.writeFileSync(linkFilePath, url, 'utf8');
      } catch (err) {
        console.error('[tunnel] Failed to write link file:', err.message);
      }
    }
  }
}

child.stdout.on('data', handleData);
child.stderr.on('data', handleData);

// Handle termination signals to clean up the link file
const cleanUpAndExit = () => {
  if (fs.existsSync(linkFilePath)) {
    try {
      fs.unlinkSync(linkFilePath);
    } catch (err) {
      // Ignore
    }
  }
  process.exit();
};

process.on('SIGINT', cleanUpAndExit);
process.on('SIGTERM', cleanUpAndExit);
process.on('exit', () => {
  if (fs.existsSync(linkFilePath)) {
    try {
      fs.unlinkSync(linkFilePath);
    } catch (err) {
      // Ignore
    }
  }
});

child.on('close', (code) => {
  console.log(`[tunnel] cloudflared process exited with code ${code}`);
  cleanUpAndExit();
});
