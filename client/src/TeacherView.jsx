import React, { useEffect, useState, useCallback } from "react";
import { socket } from "./socket.js";

export default function TeacherView({ onExit }) {
  const [roomCode, setRoomCode] = useState(null);
  const [studentCount, setStudentCount] = useState(0);
  const [promptText, setPromptText] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    socket.emit("teacher:create-room", {}, (res) => {
      if (res?.ok) setRoomCode(res.roomCode);
      else setError("Could not create a room. Try refreshing.");
    });

    const onStudentJoined = ({ studentCount }) => setStudentCount(studentCount);
    const onStudentLeft = ({ studentCount }) => setStudentCount(studentCount);
    const onNewSubmission = (submission) => {
      setSubmissions((prev) => {
        const idx = prev.findIndex((s) => s.id === submission.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = submission;
          return copy;
        }
        return [...prev, submission];
      });
    };

    socket.on("teacher:student-joined", onStudentJoined);
    socket.on("teacher:student-left", onStudentLeft);
    socket.on("teacher:new-submission", onNewSubmission);

    return () => {
      socket.off("teacher:student-joined", onStudentJoined);
      socket.off("teacher:student-left", onStudentLeft);
      socket.off("teacher:new-submission", onNewSubmission);
    };
  }, []);

  const startPrompt = useCallback(() => {
    const text = promptText.trim();
    if (!text) return;
    socket.emit("teacher:start-prompt", { text }, (res) => {
      if (res?.ok) {
        setCurrentPrompt(res.prompt);
        setSubmissions([]);
        setPromptText("");
        setError("");
      } else {
        setError(res?.error || "Could not start prompt.");
      }
    });
  }, [promptText]);

  const endPrompt = useCallback(() => {
    socket.emit("teacher:end-prompt", {}, (res) => {
      if (res?.ok) setCurrentPrompt(null);
    });
  }, []);

  const review = useCallback((submissionId, status) => {
    socket.emit("teacher:review-submission", { submissionId, status }, (res) => {
      if (res?.ok) {
        setSubmissions((prev) =>
          prev.map((s) => (s.id === submissionId ? { ...s, status } : s))
        );
      }
    });
  }, []);

  const understoodCount = submissions.filter((s) => s.status === "understood").length;
  const reviewCount = submissions.filter((s) => s.status === "needs_review").length;

  return (
    <div className="panel-wrap">
      <div className="panel">
        <div className="panel-header">
          <button className="back-link" onClick={onExit}>
            ← Leave session
          </button>
          {roomCode && <span className="room-code">ROOM {roomCode}</span>}
        </div>

        <div className="card">
          <h2>Share this code with students</h2>
          <p className="stat-row">
            {roomCode ? (
              <>
                <strong>{studentCount}</strong>&nbsp;joined
              </>
            ) : (
              "Setting up room…"
            )}
          </p>
        </div>

        {!currentPrompt ? (
          <div className="card">
            <h2>Send a teach-back prompt</h2>
            <div className="field-row" style={{ marginTop: 10 }}>
              <textarea
                className="chalk-input"
                placeholder='e.g. "Explain photosynthesis in your own words."'
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="chalk-btn primary" onClick={startPrompt}>
                Send to class
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        ) : (
          <div className="card">
            <h2>Live prompt</h2>
            <p className="prompt-banner">{currentPrompt.text}</p>
            <div className="stat-row">
              <span>
                <strong>{submissions.length}</strong> responses
              </span>
              <span>
                <strong>{understoodCount}</strong> understood
              </span>
              <span>
                <strong>{reviewCount}</strong> need review
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="chalk-btn" onClick={endPrompt}>
                End this prompt
              </button>
            </div>
          </div>
        )}

        <div className="card">
          <h2>Explanations coming in</h2>
          {submissions.length === 0 ? (
            <p className="empty-state">
              <span className="waiting-pulse" />
              Waiting for students to respond…
            </p>
          ) : (
            <div className="submission-list">
              {submissions
                .slice()
                .sort((a, b) => a.submittedAt - b.submittedAt)
                .map((s) => (
                  <div className="submission" key={s.id}>
                    <div className="submission-top">
                      <span className="submission-name">{s.name}</span>
                      <span className={`status-pill ${s.status}`}>
                        {s.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="submission-text">{s.text}</p>
                    <div className="review-buttons">
                      <button
                        className="review-btn understood-btn"
                        onClick={() => review(s.id, "understood")}
                      >
                        ✓ Got it
                      </button>
                      <button
                        className="review-btn review-btn-flag"
                        onClick={() => review(s.id, "needs_review")}
                      >
                        ⚑ Needs review
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
