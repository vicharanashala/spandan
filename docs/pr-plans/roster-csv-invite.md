# Roster & Bulk Invite (CSV/Email) — Plan

## Goal
Let teachers pre-upload a class roster (CSV of names/emails) before a
session, and bulk-invite students via email with a join code/link.

## Planned changes
- New endpoint: POST /api/rooms/:roomId/roster/upload (CSV parsing)
- New email service integration for bulk invite sending
- Frontend: CSV upload UI in RoomDetailPage

## Status
🚧 Work in progress — implementation coming in follow-up commits.
