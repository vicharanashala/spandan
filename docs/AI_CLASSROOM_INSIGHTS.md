# AI Classroom Insights & Engagement

Spandan now turns completed classroom responses into two teacher-facing views: **AI Classroom Insights** and **Class Engagement**.

## AI Classroom Insights

The `/api/responses/insights/:roomId` endpoint analyzes approved questions and student responses to calculate:

- Overall class accuracy / mastery
- Average response time
- Strongest and weakest questions
- Misconception patterns when a wrong option is selected by a significant share of respondents
- A concise classroom summary
- Adaptive teaching recommendation
- Weak concepts to revisit

The analysis is computed from existing Spandan response data, so no new student data collection is required.

## Class Engagement

The same endpoint returns an aggregate engagement indicator based on:

- Participation rate
- Response completion rate
- Class accuracy signal
- Average response time
- Question coverage

The score is displayed as an **activity signal**, not a judgement or ranking of individual students.

## Teacher UI

`RoomResultsPage.jsx` displays:

- AI Classroom Insight Engine
- Class mastery and participation cards
- Misconception Radar
- Adaptive Teaching Coach
- AI classroom summary
- Weak concepts to revisit
- Class Engagement score
- Participation / completion / accuracy / response-time indicators
- Engagement interpretation

## API

`GET /api/responses/insights/:roomId`

The endpoint is restricted to the teacher who owns the room.

## Demo flow

1. Create a room and launch several questions.
2. Have multiple students answer, including at least one question with a common wrong option.
3. Open the room results as the teacher.
4. Show the **AI Classroom Insight Engine** first.
5. Show **Class Engagement** next and explain that the score is derived from aggregate classroom activity.
6. Use the weakest question and adaptive recommendation as the teaching-action story in the demo.
