import React, { useState } from "react";
import TeacherView from "./TeacherView.jsx";
import StudentView from "./StudentView.jsx";
import "./App.css";

export default function App() {
  const [role, setRole] = useState(null); // null | 'teacher' | 'student'

  if (role === "teacher") return <TeacherView onExit={() => setRole(null)} />;
  if (role === "student") return <StudentView onExit={() => setRole(null)} />;

  return (
    <div className="landing">
      <div className="landing-card">
        <p className="eyebrow">Spandan · Teach-Back Mode</p>
        <h1>
          Ask them to <span className="underline-chalk">explain it back.</span>
        </h1>
        <p className="sub">
          Right answers can hide the gaps. Teach-Back asks students to put a concept
          in their own words, live, so a teacher can see who's actually got it.
        </p>
        <div className="role-buttons">
          <button className="chalk-btn primary" onClick={() => setRole("teacher")}>
            I'm teaching a session
          </button>
          <button className="chalk-btn" onClick={() => setRole("student")}>
            I'm joining with a code
          </button>
        </div>
      </div>
    </div>
  );
}
