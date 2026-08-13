# Spandan Evaluation Profile Application — Context (Revised with Distribution Modes)

This document captures the existing design and flow of the Evaluation Profiles feature in Spandan, and the scope of the Multi-Room Application, Negative Marking, and Manual Weightage Distribution enhancements.

## 1. Existing Design & Flow

### Data Model
- `EvaluationProfile` (`backend/src/models/EvaluationProfile.js`) stores the profile's `name`, `description`, `teacherId`, and `criteria` (an array of `{ key, weight, penalty }` entries).
- There is **no reference** or field on the `Room` schema (`backend/src/models/Room.js`) that associates a profile with a room. All results are calculated on-the-fly.

---

## 2. Multi-Room Application & Parameter-Level Aggregation

- Add `POST /api/evaluation-profiles/:id/preview` and `POST /api/evaluation-profiles/:id/apply` accepting `{ roomIds: [...] }` in the request body.
- Validate that the teacher owns every room, compute scores for each room, perform parameter-level aggregation for each student across the rooms, apply the profile weights to calculate the `Final Average Score`, and return the results including the `aggregated` view in a `results` dictionary.
- If a student is absent/has no data for one of the selected rooms, that room counts as `0` for all evaluation parameters (including attendance/session participation), ensuring absence affects the final score.
- The aggregation logic averages all parameters across the total number of selected rooms (`rooms.length`).

---

## 3. Negative Marking for Incorrect Answers

- The **Incorrect Answers** (`incorrect_responses`) parameter supports an optional negative-marking penalty percentage (e.g. `10%` / `0.10`).
- This penalty is exclusive to the `incorrect_responses` key and is not displayed or configured for any other parameter.
- The penalty is not part of the 100% positive weight allocation. Positive criteria weights must still total exactly 100%.
- For single-room scores:
  `Final Score = Math.max(0, Positive_Weighted_Sum - (v_incorrect * P_penalty))`
- For multi-room scores:
  `Final Score = Math.max(0, Aggregated_Positive_Weighted_Sum - (aggregated_v_incorrect * P_penalty))`
- Validation enforces that only `incorrect_responses` supports a penalty and that the penalty is bounded between `[0, 1]`.

---

## 4. Manual Weightage Distribution

- Teachers can select between two distribution modes when creating/editing an Evaluation Profile:
  - **Distribute Evenly** (default): Positive weightage is divided equally among the active positive parameters. Adding or removing parameters triggers automatic redistribution of weights.
  - **Manual Distribution**: The teacher manually specifies the weightage for each positive parameter.
- When **Manual Distribution** is active:
  - Adding a new parameter does not trigger equal redistribution. The new parameter initializes with `0%` weight, leaving existing manually entered weights unchanged.
  - Removing a parameter does not trigger equal redistribution of remaining weights. Remaining weights are preserved, and the teacher manually adjusts them to total 100%.
- **Incorrect Answers** (`incorrect_responses`) is excluded from positive weightage distribution in both modes if negative marking is enabled (`penalty > 0`).
