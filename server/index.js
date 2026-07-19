const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { RoomStore } = require("./rooms");

const PORT = process.env.PORT || 4001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, feature: "teach-back-mode" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN },
});

const store = new RoomStore();

io.on("connection", (socket) => {
  // ---- Teacher: create a room ----
  socket.on("teacher:create-room", (_payload, ack) => {
    const room = store.createRoom(socket.id);
    socket.join(room.code);
    socket.data.role = "teacher";
    socket.data.roomCode = room.code;
    ack?.({ ok: true, roomCode: room.code });
  });

  // ---- Student: join a room ----
  socket.on("student:join-room", ({ roomCode, name }, ack) => {
    const code = (roomCode || "").trim().toUpperCase();
    const room = store.getRoom(code);
    if (!room) {
      ack?.({ ok: false, error: "Room not found. Check the code and try again." });
      return;
    }
    const student = store.addStudent(code, socket.id, name);
    socket.join(code);
    socket.data.role = "student";
    socket.data.roomCode = code;

    ack?.({ ok: true, roomCode: code, student, currentPrompt: room.currentPrompt });
    io.to(room.teacherSocketId).emit("teacher:student-joined", {
      student,
      studentCount: room.students.size,
    });
  });

  // ---- Teacher: push a teach-back prompt ----
  socket.on("teacher:start-prompt", ({ text }, ack) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== "teacher") {
      ack?.({ ok: false, error: "Not a teacher in an active room." });
      return;
    }
    const trimmed = (text || "").trim();
    if (!trimmed) {
      ack?.({ ok: false, error: "Prompt text cannot be empty." });
      return;
    }
    const prompt = store.startPrompt(code, trimmed);
    io.to(code).emit("student:new-prompt", prompt);
    ack?.({ ok: true, prompt });
  });

  // ---- Teacher: end the current prompt ----
  socket.on("teacher:end-prompt", (_payload, ack) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== "teacher") {
      ack?.({ ok: false, error: "Not a teacher in an active room." });
      return;
    }
    store.endPrompt(code);
    io.to(code).emit("student:prompt-ended");
    ack?.({ ok: true });
  });

  // ---- Student: submit an explanation ----
  socket.on("student:submit-explanation", ({ promptId, text }, ack) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== "student") {
      ack?.({ ok: false, error: "Not a student in an active room." });
      return;
    }
    if (!text || !text.trim()) {
      ack?.({ ok: false, error: "Explanation cannot be empty." });
      return;
    }
    const room = store.getRoom(code);
    const result = store.addSubmission(code, promptId, socket.id, text);
    if (result.error) {
      ack?.({ ok: false, error: result.error });
      return;
    }
    ack?.({ ok: true, submission: result.submission });
    if (room) {
      io.to(room.teacherSocketId).emit("teacher:new-submission", result.submission);
    }
  });

  // ---- Teacher: mark a submission reviewed ----
  socket.on("teacher:review-submission", ({ submissionId, status }, ack) => {
    const code = socket.data.roomCode;
    if (!code || socket.data.role !== "teacher") {
      ack?.({ ok: false, error: "Not a teacher in an active room." });
      return;
    }
    const room = store.getRoom(code);
    if (!room || !room.currentPrompt) {
      ack?.({ ok: false, error: "No active prompt." });
      return;
    }
    if (!["understood", "needs_review"].includes(status)) {
      ack?.({ ok: false, error: "Invalid status." });
      return;
    }
    const sub = store.reviewSubmission(code, room.currentPrompt.id, submissionId, status);
    if (!sub) {
      ack?.({ ok: false, error: "Submission not found." });
      return;
    }
    ack?.({ ok: true, submission: sub });
    io.to(sub.studentId).emit("student:reviewed", { status });
  });

  // ---- Teacher: fetch current room summary (e.g. after refresh) ----
  socket.on("teacher:get-summary", (_payload, ack) => {
    const code = socket.data.roomCode;
    const summary = code ? store.roomSummary(code) : null;
    ack?.(summary ? { ok: true, summary } : { ok: false, error: "No room." });
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const result = store.removeParticipant(socket.id);
    if (!result) return;
    if (result.role === "teacher") {
      io.to(code).emit("student:room-closed");
      store.deleteRoom(code);
    } else {
      const room = store.getRoom(code);
      if (room) {
        io.to(room.teacherSocketId).emit("teacher:student-left", {
          studentId: socket.id,
          studentCount: room.students.size,
        });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Teach-Back Mode server listening on :${PORT}`);
});
