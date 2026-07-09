# Team / Group Battle Mode — Plan

## Goal
Allow teachers to split a room into teams. Individual answers still score
normally, but points also roll up into a live team leaderboard.

## Planned changes
- New `Team` model (roomId, name, memberIds, totalPoints)
- New socket event: `team:score:update`
- Frontend: team selector UI for teacher, team leaderboard panel
## Status
🚧 Work in progress — implementation coming in follow-up commits.
