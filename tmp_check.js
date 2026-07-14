import('./backend/src/index.js').then(m => {
  console.log('Loaded OK');
  console.log('app:', typeof m.app);
  console.log('io:', typeof m.io);
}).catch(e => console.error('FAILED:', e.message));
