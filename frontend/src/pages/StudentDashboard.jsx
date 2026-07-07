import React, { useState, useEffect } from 'react';
import { Target, Zap, Award, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import useAuthStore from '../stores/authStore';
import { API_URL } from '../config';

const StudentDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStudentData = async () => {
    try {
      const { token } = useAuthStore.getState();
      const res = await fetch(`${API_URL}/dashboard/student`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Backend down');

      const realData = await res.json();
      setData(realData);
    } catch (e) {
      console.error(e);
      // Fallback to empty real data so the page doesn't crash entirely if no data exists yet
      setData({ studentStats: { lifetimeScore: 0, questionsAnswered: 0, correctCount: 0, weeklyRollup: [] } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, []);

  if (loading) return <div className="p-8 text-center font-medium">Loading Student Dashboard...</div>;
  if (!data) return <div className="p-8 text-center text-red-500">Failed to load data</div>;

  const { studentStats } = data;
  const overallAccuracy = ((studentStats.correctCount / studentStats.questionsAnswered) * 100) || 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="p-8 max-w-6xl mx-auto space-y-10 min-h-screen"
    >
      <header>
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">My Performance</h1>
        <p className="text-gray-500 mt-2 font-medium text-lg">Lifetime analytics and weekly trends</p>
      </header>

      {/* Lifetime Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<Award size={32} />} label="Lifetime Score" value={studentStats.lifetimeScore.toLocaleString()} />
        <StatCard icon={<Target size={32} />} label="Total Answered" value={studentStats.questionsAnswered} />
        <StatCard icon={<Zap size={32} />} label="Overall Accuracy" value={`${overallAccuracy.toFixed(1)}%`} />
      </div>

      {/* Weekly Rollup Trend */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mt-12"
      >
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
            <TrendingUp className="text-indigo-600" /> Weekly Rollup
          </h2>
        </div>
        
        <table className="w-full text-left">
          <thead className="bg-white border-b border-gray-100">
            <tr>
              <th className="p-6 font-bold text-xs uppercase tracking-wider text-gray-500">Week Of</th>
              <th className="p-6 font-bold text-xs uppercase tracking-wider text-gray-500">Questions</th>
              <th className="p-6 font-bold text-xs uppercase tracking-wider text-gray-500">Accuracy</th>
              <th className="p-6 font-bold text-xs uppercase tracking-wider text-gray-500">Avg TTA (Time to Answer)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {studentStats.weeklyRollup.map((week, i) => (
              <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                <td className="p-6 font-bold text-gray-800">
                  {new Date(week.weekStartDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td className="p-6 text-gray-600 font-medium">{week.questionsAnswered}</td>
                <td className="p-6">
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-gray-700 w-12 text-right">{week.accuracyPercentage}%</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full max-w-[120px] overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${week.accuracyPercentage >= 80 ? 'bg-green-500' : week.accuracyPercentage > 50 ? 'bg-indigo-500' : 'bg-amber-500'}`}
                        style={{ width: `${week.accuracyPercentage}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="p-6 text-gray-600 font-medium">{(week.averageTTAMs / 1000).toFixed(1)} sec</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.section>
    </motion.div>
  );
};

const StatCard = ({ icon, label, value }) => (
  <motion.div 
    whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
    className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col gap-2 shadow-sm relative overflow-hidden group"
  >
    <div className="absolute -right-6 -top-6 text-indigo-50 opacity-40 transform scale-150 group-hover:scale-110 transition-transform duration-500">
      {icon}
    </div>
    <div className="text-indigo-600 z-10">{icon}</div>
    <p className="text-sm font-bold uppercase tracking-wider text-gray-500 z-10 mt-4">{label}</p>
    <p className="text-5xl font-black text-gray-900 z-10 tracking-tight">{value}</p>
  </motion.div>
);

export default StudentDashboard;