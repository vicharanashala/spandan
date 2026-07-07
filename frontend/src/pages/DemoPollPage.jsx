import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import StudentPoll from '../components/StudentPoll';

const BACKEND_URL = 'http://localhost:3001';
const ROOM_CODE = 'DEMO12';

export default function DemoPollPage() {
  const [teacherSocket, setTeacherSocket] = useState(null);
  const [studentSocket, setStudentSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting sockets...');

  // Student Poll State
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [remainingTime, setRemainingTime] = useState(undefined);
  const [studentAnswer, setStudentAnswer] = useState(null);

  useEffect(() => {
    let ts, ss;

    // 1. Fetch Teacher Token and Connect
    fetch(`${BACKEND_URL}/api/auth/demo-token?role=teacher`)
      .then(res => res.json())
      .then(teacherData => {
        ts = io(BACKEND_URL, { auth: { token: teacherData.token } });
        ts.on('connect', () => {
          ts.emit('room:join', { roomCode: ROOM_CODE });
          setTeacherSocket(ts);
        });

        // Listen for answers coming back to teacher (simulated broadcast)
        ts.on('response:new', (data) => {
           // We just capture the answer locally for the demo UI
           console.log("Teacher received response:", data);
        });
      })
      .catch(err => setConnectionStatus('Backend offline. Run `npm run dev` in backend folder.'));

    // 2. Fetch Student Token and Connect
    fetch(`${BACKEND_URL}/api/auth/demo-token?role=student`)
      .then(res => res.json())
      .then(studentData => {
        ss = io(BACKEND_URL, { auth: { token: studentData.token } });
        ss.on('connect', () => {
          ss.emit('room:join', { roomCode: ROOM_CODE });
          setStudentSocket(ss);
          setConnectionStatus('Sockets Connected! Ready to push question.');
        });

        // Listen for new questions
        ss.on('question_push', (data) => {
          setStudentAnswer(null); // reset local answer state
          // The data includes serverStartTime and duration
          setActiveQuestion(data);
          setRemainingTime(data.duration);
        });

        // Listen for timer tick
        ss.on('timer_tick', (data) => {
          setRemainingTime(data.remainingTimeMs);
        });
      });

    return () => {
      if (ts) ts.disconnect();
      if (ss) ss.disconnect();
    };
  }, []);

  const pushQuestion = (type) => {
    if (!teacherSocket) return;
    
    let qPayload;
    if (type === 'tf') {
      qPayload = { questionId: 'q1', text: 'Spandan uses WebSockets for real-time polling.', type: 'tf', category: 'recall', duration: 15000 };
    } else if (type === 'mcq') {
      qPayload = { questionId: 'q2', text: 'Which architecture are we using?', type: 'mcq', options: ['REST Polling', 'WebSockets', 'GraphQL Subscriptions'], category: 'analysis', duration: 30000 };
    } else {
      qPayload = { questionId: 'q3', text: 'What does TTA stand for?', type: 'short', category: 'calculation', duration: 45000 };
    }
    
    // reset student answer on teacher side for demo
    setStudentAnswer(null);
    teacherSocket.emit('question_push', { roomCode: ROOM_CODE, ...qPayload });
  };

  const handleAnswerLocked = (answer) => {
    setStudentAnswer(answer);
    if (studentSocket && activeQuestion) {
      studentSocket.emit('submit_answer', {
        roomCode: ROOM_CODE,
        questionId: activeQuestion.questionId,
        answer
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 flex flex-col gap-8">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-gray-900">Spandan E2E Socket Demo</h1>
        <p className="text-gray-500 mt-2 font-medium">{connectionStatus}</p>
      </header>

      <div className="flex gap-8 max-w-7xl mx-auto w-full flex-col lg:flex-row">
        {/* Left: Teacher Control Panel */}
        <div className="flex-1 bg-white p-6 rounded-xl shadow border border-gray-200">
          <h2 className="text-2xl font-bold border-b pb-4 mb-4 text-indigo-900">Teacher Panel (Sender)</h2>
          <p className="text-gray-600 mb-6">Click a button to emit a <code className="bg-gray-100 px-1 rounded">question_push</code> event to the Room namespace via the Teacher Socket.</p>
          
          <div className="flex flex-col gap-4">
            <button 
              onClick={() => pushQuestion('tf')} 
              disabled={!teacherSocket} 
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-4 rounded-lg font-bold transition-colors shadow-sm"
            >
              Push True/False (15s)
            </button>
            <button 
              onClick={() => pushQuestion('mcq')} 
              disabled={!teacherSocket} 
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-4 rounded-lg font-bold transition-colors shadow-sm"
            >
              Push MCQ (30s)
            </button>
            <button 
              onClick={() => pushQuestion('short')} 
              disabled={!teacherSocket} 
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white p-4 rounded-lg font-bold transition-colors shadow-sm"
            >
              Push Short Answer (45s)
            </button>
          </div>

          {studentAnswer && (
            <div className="mt-8 p-5 bg-green-50 border-2 border-green-200 rounded-xl shadow-inner animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="font-bold text-green-800 flex items-center gap-2">
                Student Submitted Answer:
              </h3>
              <p className="text-green-700 text-3xl font-black mt-2 tracking-tight">"{studentAnswer}"</p>
            </div>
          )}
        </div>

        {/* Right: Student View */}
        <div className="flex-[1.5] bg-gray-100 p-6 rounded-xl shadow-inner border border-gray-200 flex flex-col items-center">
          <h2 className="text-2xl font-bold mb-8 w-full text-left text-gray-700">Student Device (Receiver)</h2>
          
          <div className="w-full relative">
            {activeQuestion ? (
              <StudentPoll 
                question={activeQuestion}
                serverRemainingTimeMs={remainingTime}
                onAnswerLocked={handleAnswerLocked}
                onTabSwitchDetected={(questionId) => {
                  alert('Warning: Tab switch detected! (Flagged on Teacher Dashboard and sent to Extension)');
                  // Send event to the Chrome Extension content script
                  window.dispatchEvent(new CustomEvent('spandan_tab_switch', { 
                    detail: { questionId } 
                  }));
                }}
                // Silent dummy audio URI to prevent 404 in demo environment if actual file missing
                audioCueUrl="data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" 
              />
            ) : (
              <div className="text-center p-16 bg-white rounded-xl border-4 border-dashed border-gray-300 text-gray-500 font-medium text-lg shadow-sm">
                Waiting for teacher to push a live poll...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
