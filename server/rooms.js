const { nanoid } = require("nanoid");

/**
 * In-memory store for Teach-Back Mode rooms.
 *
 * This is intentionally simple (no DB) so the feature can be reviewed
 * and merged independently of Spandan's persistence layer. Swapping
 * this for a real store later just means implementing the same
 * interface against Mongo/Postgres/whatever the rest of the app uses.
 *
 * Shape of a room:
 * {
 *   code: 'ABC123',
 *   teacherSocketId: string,
 *   students: Map<socketId, { id, name }>,
 *   currentPrompt: { id, text, startedAt } | null,
 *   submissions: Map<promptId, Array<{ id, studentId, name, text, status, submittedAt }>>
 * }
 */
class RoomStore {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(teacherSocketId) {
    let code;
    do {
      code = this._generateCode();
    } while (this.rooms.has(code));

    const room = {
      code,
      teacherSocketId,
      students: new Map(),
      currentPrompt: null,
      submissions: new Map(),
    };
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  addStudent(code, socketId, name) {
    const room = this.getRoom(code);
    if (!room) return null;
    const student = { id: socketId, name: name?.trim() || "Anonymous" };
    room.students.set(socketId, student);
    return student;
  }

  removeParticipant(socketId) {
    for (const room of this.rooms.values()) {
      if (room.teacherSocketId === socketId) {
        // Teacher left — room becomes orphaned; caller decides whether to close it.
        return { code: room.code, role: "teacher" };
      }
      if (room.students.has(socketId)) {
        room.students.delete(socketId);
        return { code: room.code, role: "student" };
      }
    }
    return null;
  }

  startPrompt(code, text) {
    const room = this.getRoom(code);
    if (!room) return null;
    const prompt = { id: nanoid(8), text, startedAt: Date.now() };
    room.currentPrompt = prompt;
    room.submissions.set(prompt.id, []);
    return prompt;
  }

  endPrompt(code) {
    const room = this.getRoom(code);
    if (!room) return null;
    room.currentPrompt = null;
    return true;
  }

  addSubmission(code, promptId, studentSocketId, text) {
    const room = this.getRoom(code);
    if (!room || !room.currentPrompt || room.currentPrompt.id !== promptId) {
      return { error: "No active prompt matching this submission." };
    }
    const student = room.students.get(studentSocketId);
    if (!student) return { error: "Student not recognized in this room." };

    const list = room.submissions.get(promptId) || [];
    // One submission per student per prompt — resubmission overwrites.
    const existingIdx = list.findIndex((s) => s.studentId === studentSocketId);
    const submission = {
      id: existingIdx >= 0 ? list[existingIdx].id : nanoid(8),
      studentId: studentSocketId,
      name: student.name,
      text: text.trim(),
      status: "pending", // 'pending' | 'understood' | 'needs_review'
      submittedAt: Date.now(),
    };
    if (existingIdx >= 0) {
      list[existingIdx] = submission;
    } else {
      list.push(submission);
    }
    room.submissions.set(promptId, list);
    return { submission };
  }

  reviewSubmission(code, promptId, submissionId, status) {
    const room = this.getRoom(code);
    if (!room) return null;
    const list = room.submissions.get(promptId) || [];
    const sub = list.find((s) => s.id === submissionId);
    if (!sub) return null;
    sub.status = status;
    return sub;
  }

  roomSummary(code) {
    const room = this.getRoom(code);
    if (!room) return null;
    return {
      code: room.code,
      studentCount: room.students.size,
      currentPrompt: room.currentPrompt,
      submissions: room.currentPrompt
        ? room.submissions.get(room.currentPrompt.id) || []
        : [],
    };
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  _generateCode() {
    // 6-char, easy-to-read room codes (no ambiguous chars like 0/O, 1/I).
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }
}

module.exports = { RoomStore };
