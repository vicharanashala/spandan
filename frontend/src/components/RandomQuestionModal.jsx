import React from 'react';
import { useSocketStore } from '../stores/socketStore';

export default function RandomQuestionModal() {
  const { randomQuestion, clearRandomQuestion } = useSocketStore();

  if (!randomQuestion) return null;

  const handleClose = () => {
    clearRandomQuestion();
  };

  return (
    <div style={overlayStyle} onClick={handleClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle}>Pop‑Quiz Question</h2>
        <p style={questionStyle}>{randomQuestion}</p>
        <button style={buttonStyle} onClick={handleClose}>Dismiss</button>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle = {
  background: 'var(--bg-card)',
  borderRadius: '16px',
  padding: '32px',
  maxWidth: '480px',
  width: '90%',
  boxShadow: 'var(--card-shadow)',
  border: '1px solid var(--border-color)',
  textAlign: 'center',
};

const titleStyle = { margin: '0 0 16px', fontSize: '22px', color: 'var(--text-primary)' };
const questionStyle = { fontSize: '18px', color: 'var(--text-secondary)', marginBottom: '24px' };
const buttonStyle = { background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' };
