import React, { useEffect, useState, useCallback } from "react";
import { socket } from "./socket.js";

export default function StudentView({ onExit }) {
  const [joined, setJoined] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const [currentPrompt, setCurrentPrompt] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reviewStatus, setReviewStatus] = useState(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onNewPrompt = (prompt) => {
      setCurrentPrompt(prompt);
      setExplanation("");
      setSubmitted(false);
      setReviewStatus(null);
    };
    const onPromptEnded = () => setCurrentPrompt(null);
    const onReviewed = ({ status }) => setReviewStatus(status);
    const onClosed = () => setClosed(true);

    socket.on("student:new-prompt", onNewPrompt);
    socket.on("student:prompt-ended", onPromptEnded);
    socket.on("student:reviewed", onReviewed);
    socket.on("student:room-closed", onClosed);

    return () => {
      socket.off("student:new-prompt", onNewPrompt);
      socket.off("student:prompt-ended", onPromptEnded);
      socket.off("student:reviewed", onReviewed);
      socket.off("student:room-closed", onClosed);
    };
  }, []);

  const join = useCallback(() => {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setError("Enter the room code your teacher shared.");
      return;
    }
    socket.emit("student:join-room", { roomCode: code, name }, (res) => {
      if (res?.ok) {
        setJoined(true);
        setError("");
        if (res.currentPrompt) setCurrentPrompt(res.currentPrompt);
      } else {
        setError(res?.error || "Could not join that room.");
      }
    });
  }, [roomCode, name]);

  const submit = useCallback(() => {
    if (!currentPrompt || !explanation.trim()) return;
    socket.emit(
      "student:submit-explanation",
      { promptId: currentPrompt.id, text: explanation },
      (res) => {
        if (res?.ok) {
          setSubmitted(true);
          setError("");
        } else {
          setError(res?.error || "Could not submit. Try again.");
        }
      }
    );
  }, [currentPrompt, explanation]);

  if (closed) {
    return (
      <div className="panel-wrap">
        <div className="panel card">
          <h2>Session ended</h2>
          <p className="empty-state">Your teacher closed this room. Thanks for participating.</p>
          <button className="chalk-btn" onClick={onExit}>
            Back to start
          </button>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="panel-wrap">
        <div className="panel">
          <div className="panel-header">
            <button className="back-link" onClick={onExit}>
              ← Back
            </button>
          </div>
          <div className="card">
            <h2>Join a Teach-Back session</h2>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className="chalk-input"
                placeholder="Room code (e.g. K7P4QM)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
                maxLength={6}
              />
              <input
                className="chalk-input"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <button className="chalk-btn primary" onClick={join}>
                Join room
              </button>
            </div>
            {error && <p className="error-text">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-wrap">
      <div className="panel">
        <div className="panel-header">
          <button className="back-link" onClick={onExit}>
            ← Leave
          </button>
          <span className="room-code">ROOM {roomCode.toUpperCase()}</span>
        </div>

        {!currentPrompt ? (
          <div className="card">
            <p className="empty-state">
              <span className="waiting-pulse" />
              Waiting for your teacher to send a prompt…
            </p>
          </div>
        ) : (
          <div className="card">
            <h2>Explain it back</h2>
            <p className="prompt-banner">{currentPrompt.text}</p>

            {submitted ? (
              <div style={{ marginTop: 16 }}>
                <p className="submission-text">
                  Submitted. {reviewStatus === "understood" && "Your teacher marked this understood ✓"}
                  {reviewStatus === "needs_review" && "Your teacher flagged this for a follow-up — that's OK, it's how you learn."}
                  {!reviewStatus && "Your teacher is reviewing responses now."}
                </p>
                <button
                  className="chalk-btn"
                  style={{ marginTop: 10 }}
                  onClick={() => setSubmitted(false)}
                >
                  Edit my answer
                </button>
              </div>
            ) : (
              <>
                <textarea
                  className="chalk-input"
                  style={{ marginTop: 12 }}
                  placeholder="Type it in your own words…"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
                <div style={{ marginTop: 12 }}>
                  <button className="chalk-btn primary" onClick={submit}>
                    Submit explanation
                  </button>
                </div>
                {error && <p className="error-text">{error}</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
