const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

async function start() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/MONGODB_URI=.*/, 'MONGODB_URI=' + uri);
  fs.writeFileSync(envPath, envContent);
  
  console.log('MONGODB_URI=' + uri);
  console.log('MongoDB in-memory server started. Press Ctrl+C to stop.');

  process.on('SIGTERM', async () => { await mongod.stop(); process.exit(0); });
  process.on('SIGINT', async () => { await mongod.stop(); process.exit(0); });
  
  await new Promise(() => {});
}
start().catch(console.error);
