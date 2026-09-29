# My Ideas for Spandan

---
# 🌟 Spandan Project: Core Vision & Ideas

## 📖 What is Spandan?
**Spandan** is an innovative platform aimed at revolutionizing student engagement during live lectures and stand-ups. By generating real-time, context-aware polls based on the teacher's live speech, Spandan keeps students active and tracks their responses dynamically.

---

## 🎯 Core Concept
1. **Teacher Setup**: The teacher creates a room, sets parameters (difficulty, interval), and turns on the Spandan microphone.
2. **AI Generation**: The system auto-generates context-relevant questions (True/False, MCQ, MSQ) using an AI engine processing the live transcription.
3. **Teacher Review**: The teacher quickly reviews and approves the question.
4. **Student Engagement**: The question is seamlessly pushed to the students.
5. **Gamification**: Responses are tracked and integrated with the **Spurti points** system.

---

## 🚀 Key Features & Discussion Points

### ⏱️ Timing & Delivery
- **Random vs. Fixed Timing**: Random polling is preferred to prevent students from "gaming" the system (showing up only when a timer hits).
- **Delivery Sync**: Spandan must not break the teacher's flow. Polls should land at the exact right moment, matching the room's mood.
- **Anticipation Chime**: Smooth, pleasant music (like gentle Raagas) plays just before a poll drops to set a positive, engaging mood rather than inducing anxiety.

### 🏗️ Architecture: App vs. Plugin
- **In-House Application**: Gives full control, avoids third-party browser restrictions, and provides a richer visual representation.
- **Plugin Approach (Zoom/Meet)**: Highly scalable but carries risks of browser traffic blocks and platform restrictions.
- **Open-Source Goal**: Strongly favored so any coaching institute globally can clone and use the platform freely.

### 🧠 Advanced AI Capabilities
- **Mood/Tone Settings**: The ability to set the AI's question tone (e.g., Technical, Sarcastic, Casual).
- **Live Transcription Integration**: Potentially utilizing YouTube Live streams to transcribe teacher speech directly into Spandan.
- **Pre-assessment Tools**: Using Spandan to assign pre-work, helping teachers understand a cohort's baseline knowledge before the topic begins.

### 🙋‍♂️ Real-Time Feedback & Advanced Doubt Scaling System
- **Teacher Dashboard & View Modes**: Teachers receive instant, real-time feedback on classroom comprehension with toggleable **List View** and **Topic Clustering (`🗂️ Group by Topic`)** modes.
- **Topic Clustering & Bulk Resolution**: In large crowds (300+ students), similar questions are clustered under topics (`#LearningRate`, `#Concept`, `#Formula`, etc.). Teachers can select entire clusters and **Bulk Resolve (`⚡ Resolve Selected at Once`)** with a shared explanation note. Single-student topics dynamically hide bulk selection controls and offer direct individual reply boxes.
- **Peer Upvoting (`👍 I have this doubt too`)**: Students see a live peer feed of classroom doubts and can upvote existing questions instead of raising duplicate doubts, helping teachers prioritize what most students are confused about (`👥 N students (👍 upvotes)`).
- **Per-Student Safety Valve & Exact Percentage Tracking**: When a doubt is answered, students independently confirm understanding (`👍 Got it, thanks!`) or re-open (`🙋 Re-Open`). The teacher dashboard dynamically tracks and displays exact student confirmation percentages (`⏳ X/N Students Acknowledged (Y%)` transitions to `✅ All N Students Acknowledged (100%)`).
- **Re-Open Safety Valve (`🙋 Re-Open`)**: If a teacher bulk-resolves a topic but misses a student's specific nuance, the student can click **Re-Open**. Re-opened doubts jump straight to the top of the teacher's dashboard with a vibrant orange priority badge (`🔄 Re-Opened`), ensuring unique student blockers are never accidentally lost.
- **TA Escalation**: Similar to NPTEL, these doubt flags can also be routed to Teaching Assistants (TAs) for review without disrupting the live lecture flow.
