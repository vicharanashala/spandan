async function testEndpoint() {
  try {
    // 1. We need a valid token. Let's get one by logging in as teacher.
    console.log("Logging in...");
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ram@teacher.com', password: 'password123' }) // Assumption
    });
    
    if (!loginRes.ok) {
      console.log("Login failed", await loginRes.text());
      return;
    }
    const loginData = await loginRes.json();
    const token = loginData.token;
    
    const roomId = '6a5cf1abaa01e62b8fa8663d';
    
    console.log("Fetching questions...");
    const qRes = await fetch(`http://localhost:3001/api/questions/room/${roomId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const questions = await qRes.json();
    if (!questions || !questions.questions || questions.questions.length === 0) {
      console.log("No questions found");
      return;
    }
    
    const questionId = questions.questions[0]._id;
    console.log("Using questionId:", questionId);
    
    console.log("Calling generate...");
    const genRes = await fetch('http://localhost:3001/api/notes/generate-for-question', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ roomId, questionId })
    });
    
    console.log("Status:", genRes.status);
    console.log("Response:", await genRes.text());
    
  } catch (err) {
    console.error("Test error:", err);
  }
}
testEndpoint();
