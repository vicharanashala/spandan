# Lecture Segment Difficulty Heatmap

> **Research question:** Which part of the lecture did students understand the least?

Spandan records each lecture in time-ordered chunks called **segments**. Both the `Transcript` and `Question` models carry a `segmentIndex`, so every student response can be traced back to the exact moment of the lecture it tested. This script exploits that link to produce colour-coded heatmaps showing where students struggled.

---

## Outputs

| File | What it shows |
|---|---|
| `output/heatmap_<RoomName>.png` | Per-session timeline — one bar per segment, green → red by accuracy |
| `output/cross_session_heatmap.png` | Averaged accuracy by segment position across all sessions |
| `output/segment_difficulty.csv` | Per-segment table: accuracy, word count, keywords, transcript snippet |
| `output/session_summary.csv` | One row per session: hardest segment, overall accuracy |

---

## Setup

```bash
cd analysis
pip install -r requirements.txt
```

`scikit-learn` is optional — if not installed, keyword extraction falls back to simple word-frequency. Everything else still works.

---

## Usage

### Single session (most common)

```bash
python segment_heatmap.py --key YOUR_KEY --room-id <mongoId>
```

### All ended sessions (bulk)

```bash
python segment_heatmap.py --key YOUR_KEY
```

### Offline mode (no server needed)

```bash
# Dump once
curl -H "X-Research-Key: YOUR_KEY" \
  "https://samagama.in/spandan/api/research/segment-difficulty?roomId=<id>" \
  -o session.json

# Then run offline
python segment_heatmap.py --json session.json
```

### Local dev

```bash
python segment_heatmap.py --key YOUR_KEY --room-id <id> \
       --api-url http://localhost:3001/api
```

### Skip keyword extraction (faster)

```bash
python segment_heatmap.py --key YOUR_KEY --no-keywords
```

---

## How it works

```
Transcript.segmentIndex  ==  Question.segmentIndex
```

1. Every lecture segment has a transcript chunk (Whisper-transcribed audio).
2. Every AI-generated question carries the `segmentIndex` of the segment it came from.
3. Every student `Response` links to a `Question` → links to a `segmentIndex`.
4. The backend endpoint joins all three collections and computes accuracy per segment.
5. The Python script visualises this as a colour-coded timeline:
   - 🟢 Green (≥ 65%) — students understood this part
   - 🟡 Yellow (50–65%) — borderline
   - 🔴 Red (< 50%) — students were lost here
   - ⬜ Grey — not tested (no questions from this segment)

---

## Colour thresholds

| Colour | Accuracy | Meaning |
|---|---|---|
| 🟢 Green | ≥ 65% | Good comprehension |
| 🟡 Yellow | 50–65% | Borderline — worth revisiting |
| 🔴 Red | < 50% | Students were struggling |
| ⬜ Grey | — | No questions generated from this segment |

---

## Backend change

A new endpoint was added to `backend/src/routes/research.js`:

```
GET /api/research/segment-difficulty
  ?roomId=<id>            single-room mode
  ?since=<ISO>&limit=<n>  bulk paginated mode
```

Auth: same `X-Research-Key` header as the existing `/sessions` endpoint.

---

## API Key

The `RESEARCH_API_KEY` is in `backend/.env`:

```env
RESEARCH_API_KEY=spandan-research-2026
```

Pass this value as `--key` when running the script.
