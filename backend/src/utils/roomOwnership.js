// Shared room-ownership guard for teacher-write routes.
//
// Several routes take a roomId from the request and must ensure the caller is the
// room's OWNING teacher before writing to it. Centralised here so the check is
// consistent and unit-testable. `room.teacher` may be a raw ObjectId or a populated
// doc; both sides are string-compared.
//
// Returns { ok: true } or { ok: false, status, error }.
export function checkRoomOwnership(room, userId) {
  if (!room) return { ok: false, status: 404, error: 'Room not found' }
  const teacherId = String(room.teacher?._id ?? room.teacher)
  if (teacherId !== String(userId)) {
    return { ok: false, status: 403, error: 'Not authorized for this room' }
  }
  return { ok: true, status: 200 }
}
