import React, { useState, useEffect } from 'react';
import { Users, AlertTriangle, Clock, BarChart2 } from 'lucide-react';
import { motion } from 'framer-motion';
import useAuthStore from '../stores/authStore';
import { API_URL } from '../config';

const TeacherDashboard = ({ roomCode }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hardcoded for demo purposes since we don't have auth context wired here
  const fetchDashboardData = async () => {
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`${API_URL}/dashboard/teacher/${roomCode || 'DEMO12'}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch dashboard data');

      const realData = await res.json();
      setData(realData);
    } catch (e) {
      console.error(e);
      // Fallback empty state
      setData({ sessionData: { roomCode, stats: { totalStudents: 0, totalQuestions: 0, averageAccuracy: 0, averageTTAMs: 0, flaggedTabSwitches: 0 } }, questions: [], leaderboard: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [roomCode]);

  if (loading) return <div className="p-8 text-center">Loading Teacher Dashboard...</div>;
  if (!data) return <div className="p-8 text-center text-red-500">Failed to load data</div>;

  const { sessionData, questions, leaderboard } = data;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="p-8 max-w-7xl mx-auto space-y-8 bg-gray-50 min-h-screen"
    >
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">Session Overview: {sessionData.roomCode}</h1>
          <p className="text-gray-500 mt-2 font-medium">Ended on {new Date(sessionData.endTime).toLocaleDateString()}</p>
        </div>
        <div className="flex gap-4">
          <StatCard icon={<Users />} label="Students" value={sessionData.stats.totalStudents} />
          <StatCard icon={<BarChart2 />} label="Avg Accuracy" value={`${sessionData.stats.averageAccuracy}%`} />
          <StatCard icon={<AlertTriangle className="text-amber-500"/>} label="Tab-Switches" value={sessionData.stats.flaggedTabSwitches} />
        </div>
      </header>

      <div className="grid grid-cols-3 gap-8">
        {/* Left Column: Question Breakdown */}
        <div className="col-span-2 space-y-6">
          <h2 className="text-xl font-semibold border-b pb-2">Per-Question Breakdown</h2>
          {questions.map((q, i) => (
            <motion.div 
              key={q._id} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
            >
              <div className="flex justify-between mb-4">
                <h3 className="font-medium text-lg text-gray-800">{q.text}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${q.stats.correctPercentage < 50 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {q.stats.correctPercentage}% Correct
                </span>
              </div>
              
              <div className="flex gap-8 text-sm text-gray-600 font-medium mb-4">
                <span className="flex items-center gap-1.5"><Clock size={16}/> Avg TTA: {(q.stats.averageTTAMs/1000).toFixed(1)}s</span>
                {q.stats.tabSwitchesDuringQuestion > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-1 rounded"><AlertTriangle size={16}/> {q.stats.tabSwitchesDuringQuestion} Flags</span>
                )}
              </div>
              
              {/* Distribution Bar Chart */}
              <div className="h-10 bg-gray-100 rounded-lg flex overflow-hidden w-full items-center">
                {Object.entries(q.stats.answerDistribution).map(([ans, count], idx) => {
                  const colors = ['bg-indigo-500', 'bg-blue-400', 'bg-teal-400'];
                  const widthPct = (count / sessionData.stats.totalStudents) * 100;
                  return (
                    <div key={ans} className={`${colors[idx % colors.length]} h-full flex items-center justify-center text-xs font-bold text-white whitespace-nowrap overflow-hidden transition-all`} 
                         style={{ width: `${widthPct}%` }} title={`${ans}: ${count}`}>
                      {widthPct > 10 ? ans : ''}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Right Column: Leaderboard & Per-Student Table */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="space-y-6"
        >
          <h2 className="text-xl font-semibold border-b pb-2">Session Leaderboard</h2>
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-4 font-bold text-xs uppercase text-gray-500">Rank</th>
                  <th className="p-4 font-bold text-xs uppercase text-gray-500">Student</th>
                  <th className="p-4 font-bold text-xs uppercase text-gray-500">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaderboard.map((student, idx) => (
                  <tr key={student.studentId} className={idx < 3 ? 'bg-indigo-50/20' : 'hover:bg-gray-50'}>
                    <td className="p-4 font-black text-gray-400">#{idx + 1}</td>
                    <td className="p-4 font-medium text-gray-800">{student.name}</td>
                    <td className="p-4 font-bold text-indigo-600">{student.totalScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

const StatCard = ({ icon, label, value }) => (
  <motion.div 
    whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
    className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-5 shadow-sm min-w-[200px]"
  >
    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">{icon}</div>
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
    </div>
  </motion.div>
);

export default TeacherDashboard;
