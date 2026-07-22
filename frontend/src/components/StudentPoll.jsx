import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * StudentPoll component
 * Displays a live poll question to a student, handling different question types,
 * strict answer locking, server-authoritative timers, and tab-switch cheating detection.
 */
const StudentPoll = ({ 
  question, 
  // Config map editable by the teacher per session
  categoryTimeConfig = { recall: 15, analysis: 45, calculation: 60 },
  // Exact remaining time broadcasted continuously by the server via socket
  serverRemainingTimeMs,
  // Callback when student selects an answer
  onAnswerLocked,
  // Callback when student switches tabs
  onTabSwitchDetected,
  // Audio file URL for the pre-poll alert
  audioCueUrl = '/chime.mp3'
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isPreparing, setIsPreparing] = useState(true);
  const audioRef = useRef(null);
  
  // 7. Tab-switch detection using Page Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      // If the tab becomes hidden while the poll is active and they haven't answered yet
      if (document.visibilityState === 'hidden' && !isPreparing && selectedAnswer === null) {
        if (onTabSwitchDetected) {
          onTabSwitchDetected(question?.id);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPreparing, selectedAnswer, question?.id, onTabSwitchDetected]);

  // 6. Pre-poll audio cue & prep state
  useEffect(() => {
    if (question) {
      setSelectedAnswer(null);
      setIsPreparing(true);
      
      // Attempt to play the chime audio
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.warn('Audio play failed, requires user interaction first', e));
      }
      
      // Show question after a 1.5 second alert period
      const timer = setTimeout(() => {
        setIsPreparing(false);
      }, 1500); 
      
      return () => clearTimeout(timer);
    }
  }, [question?.id]);

  // 3. No submit button, instant lock-in
  const handleSelect = (answer) => {
    if (selectedAnswer !== null || isPreparing) return;
    
    setSelectedAnswer(answer);
    if (onAnswerLocked) {
      onAnswerLocked(answer);
    }
  };

  const handleShortAnswerKeyPress = (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== '') {
      handleSelect(e.target.value.trim());
    }
  };

  if (!question) return null;

  // 5. Question categorization -> time mapping
  // Fallback to the category config if server sync hasn't arrived yet
  const totalDurationSeconds = categoryTimeConfig[question.category] || 30; 
  
  // 4. Timer driven by server-authoritative time
  const remainingSeconds = serverRemainingTimeMs !== undefined 
    ? Math.max(0, Math.ceil(serverRemainingTimeMs / 1000))
    : totalDurationSeconds;
    
  const isTimeUp = remainingSeconds <= 0 && !isPreparing;

  if (isPreparing) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-2xl mx-auto min-h-[300px]"
      >
        {/* Hidden audio element for the chime */}
        <audio ref={audioRef} src={audioCueUrl} preload="auto" />
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex flex-col items-center"
        >
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-4"></div>
          <h2 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">Incoming Poll!</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium text-lg">Get ready...</p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-2xl mx-auto transition-all"
    >
      {/* Header: Question Text and Server-Authoritative Timer directly beside it */}
      <div className="flex justify-between items-start mb-6 gap-6 border-b border-gray-100 dark:border-gray-700 pb-5">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex-1 leading-snug">
          {question.text}
        </h2>
        
        {/* Timer UI directly beside question text */}
        <motion.div 
          key={remainingSeconds}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className={`flex flex-col items-center justify-center shrink-0 w-20 h-20 rounded-full border-4 shadow-sm transition-colors duration-300 ${
            remainingSeconds <= 5 
              ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-900/30 animate-pulse' 
              : 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30'
          }`}
        >
          <span className="text-2xl font-black">{remainingSeconds}</span>
          <span className="text-xs font-bold uppercase tracking-wider">Sec</span>
        </motion.div>
      </div>

      {/* Warning if time is up */}
      {isTimeUp && selectedAnswer === null && (
        <div className="mb-5 p-4 bg-red-100 text-red-800 rounded-lg flex items-center gap-3 font-medium border border-red-200">
          <AlertCircle size={24} className="text-red-600" />
          <span>Time is up! You did not submit an answer in time.</span>
        </div>
      )}

      {/* 1. Question Body Types */}
      <div className="flex flex-col gap-4">
        {/* 2. True/False Type rendered as large color-coded cards */}
        {question.type === 'tf' && (
          <div className="grid grid-cols-2 gap-6">
            <button
              onClick={() => handleSelect('True')}
              disabled={selectedAnswer !== null || isTimeUp}
              className={`p-8 rounded-xl border-2 text-3xl font-extrabold tracking-wide transition-all relative overflow-hidden flex justify-center items-center h-48 shadow-sm
                ${selectedAnswer === 'True' 
                  ? 'border-green-600 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 ring-4 ring-green-500/50 scale-[1.02]' 
                  : selectedAnswer !== null || isTimeUp
                    ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60 grayscale'
                    : 'border-green-500 bg-green-50 text-green-600 hover:bg-green-100 hover:border-green-600 hover:scale-[1.03] active:scale-95'
                }`}
            >
              TRUE
              {selectedAnswer === 'True' && (
                <CheckCircle className="absolute top-4 right-4 text-green-600 dark:text-green-400" size={32} />
              )}
            </button>
            <button
              onClick={() => handleSelect('False')}
              disabled={selectedAnswer !== null || isTimeUp}
              className={`p-8 rounded-xl border-2 text-3xl font-extrabold tracking-wide transition-all relative overflow-hidden flex justify-center items-center h-48 shadow-sm
                ${selectedAnswer === 'False' 
                  ? 'border-red-600 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 ring-4 ring-red-500/50 scale-[1.02]' 
                  : selectedAnswer !== null || isTimeUp
                    ? 'border-gray-200 bg-gray-50 text-gray-400 opacity-60 grayscale'
                    : 'border-red-500 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-600 hover:scale-[1.03] active:scale-95'
                }`}
            >
              FALSE
              {selectedAnswer === 'False' && (
                <CheckCircle className="absolute top-4 right-4 text-red-600 dark:text-red-400" size={32} />
              )}
            </button>
          </div>
        )}

        {/* MCQ Type */}
        {question.type === 'mcq' && (
          <div className="flex flex-col gap-3">
            {question.options?.map((opt, idx) => {
              const isSelected = selectedAnswer === opt;
              const isDisabled = selectedAnswer !== null || isTimeUp;
              
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(opt)}
                  disabled={isDisabled}
                  className={`p-5 text-left rounded-xl border-2 transition-all relative flex items-center justify-between shadow-sm
                    ${isSelected 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-100 ring-2 ring-indigo-500/30' 
                      : isDisabled
                        ? 'border-gray-100 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-500 opacity-70'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 hover:shadow-md hover:-translate-y-0.5'
                    }`}
                >
                  <span className="font-semibold text-lg">{opt}</span>
                  {isSelected && <CheckCircle className="text-indigo-600 dark:text-indigo-400" size={24} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Short Answer Type */}
        {question.type === 'short' && (
          <div className="flex flex-col gap-3 relative mt-2">
            {selectedAnswer !== null ? (
              <div className="p-5 border-2 border-indigo-600 bg-indigo-50 rounded-xl flex items-center justify-between dark:bg-indigo-900/60 dark:border-indigo-400 shadow-sm">
                <span className="text-xl font-semibold text-indigo-900 dark:text-indigo-100">
                  {selectedAnswer}
                </span>
                <CheckCircle className="text-indigo-600 dark:text-indigo-400 shrink-0" size={28} />
              </div>
            ) : (
              <div className="flex flex-col">
                <input
                  type="text"
                  placeholder="Type your answer and press Enter to lock..."
                  disabled={isTimeUp}
                  className="w-full p-5 text-xl font-medium border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 disabled:bg-gray-100 disabled:opacity-60 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:focus:border-indigo-400 transition-all shadow-sm"
                  onKeyDown={handleShortAnswerKeyPress}
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-3 ml-2 text-sm text-gray-500 dark:text-gray-400 font-medium">
                  <span className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-xs font-bold text-gray-700 dark:text-gray-300">ENTER</span>
                  <span>Press enter to instantly lock in your answer. No take-backs!</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Footer Info */}
      <div className="mt-8 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
        <span className="flex items-center gap-2">
          Category: 
          <span className="font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs text-gray-700 dark:text-gray-300">
            {question.category || 'Standard'}
          </span>
        </span>
        
        {selectedAnswer !== null && (
          <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider">
            <CheckCircle size={14} strokeWidth={3} /> Answer Locked
          </span>
        )}
      </div>
    </motion.div>
  );
};

export default StudentPoll;
