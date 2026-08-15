# Component Refactoring Plan for StudentRoomPage.jsx
# Breaking down monolithic 776-line component into focused, reusable components

## 🎯 Refactoring Strategy

### Current Issues
- **Monolithic Component**: 776 lines single component
- **Mixed Responsibilities**: UI, logic, state management combined
- **Hard to Test**: Difficult to write unit tests
- **Hard to Maintain**: Changes affect multiple areas
- **Reusability**: Limited - specific to one page

### Solution
Create focused, single-responsibility components with clear interfaces

## 📋 Component Breakdown

### 1. ConnectionStatus Component
**Purpose**: Display connection status and leave controls
**Responsibilities**:
- Show connection status (Connected/Reconnecting)
- Display leave button with cooldown logic
- Handle connection/disconnection events
- Prevent accidental leave after answering

**Props**:
```javascript
{
  isConnected: boolean,
  hasAnsweredPoll: boolean,
  onLeaveSession: function,
  leaveSessionDisabled: boolean
}
```

### 2. QuestionAnswerSection Component
**Purpose**: Display active question with timer and answer submission
**Responsibilities**:
- Display question text, timer, and answer options
- Handle option selection (MCQ, TF, MSQ)
- Submit answer validation and submission
- Timer countdown and expiration handling
- Sound notifications integration

**Props**:
```javascript
{
  question: object,
  timeLeft: number,
  selectedOptions: array,
  submitted: boolean,
  soundEnabled: boolean,
  anonymousMode: boolean,
  
  onSelectOption: function(index),
  onSubmitAnswer: function,
  onKeyboardShortcut: function(key)
}
```

### 3. PastQuestionsHistory Component
**Purpose**: Display answered/missed questions history with review functionality
**Responsibilities**:
- Render list of past questions
- Show answer status (Answered/Missed)
- Display points and correctness information
- Mark-for-review functionality
- Show all options with correctness indicators

**Props**:
```javascript
{
  pastResponses: array,
  markedForReview: Set,
  onToggleReview: function(index),
  canToggleReview: boolean
}
```

### 4. LeaderboardPanel Component
**Purpose**: Display leaderboard with anonymous mode support
**Responsibilities**:
- Render student leaderboard
- Handle anonymous mode toggle
- Display rankings with visual indicators
- Show total participants count

**Props**:
```javascript
{
  roomId: string,
  token: string,
  socket: object,
  anonymousMode: boolean,
  showLeaderboard: boolean,
  onToggleLeaderboard: function
}
```

### 5. TimerWidget Component
**Purpose**: Display countdown timer with visual indicators
**Responsibilities**:
- Show remaining time
- Handle timer expiration
- Display warning states (5 seconds left)
- Provide timer pause/resume functionality

**Props**:
```javascript
{
  timeLeft: number,
  maxTime: number,
  isActive: boolean,
  onTimerExpire: function,
  warningThreshold: number
}
```

### 6. QuestionReviewPopup Component
**Purpose**: Display marked questions for later review
**Responsibilities**:
- Show list of marked questions
- Display question details in modal/popup
- Allow unmarking questions
- Summarize review items

**Props**:
```javascript
{
  markedQuestions: array,
  onToggleReview: function(index),
  onClose: function
}
```

## 🔄 State Management Refactoring

### Current State Structure (Flattened)
```javascript
const [room, setRoom] = useState(null)
const [isLoading, setIsLoading] = useState(true)
const [error, setError] = useState('')
const [currentQuestion, setCurrentQuestion] = useState(null)
const [selectedOptions, setSelectedOptions] = useState([])
const [submitted, setSubmitted] = useState(false)
const [hasAnsweredPoll, setHasAnsweredPoll] = useState(false)
const [timeLeft, setTimeLeft] = useState(0)
const [results, setResults] = useState(null)
const [pastResponses, setPastResponses] = useState([])
const [soundEnabled, setSoundEnabled] = useState(true)
const [showLeaderboard, setShowLeaderboard] = useState(true)
const [markedForReview, setMarkedForReview] = useState(new Set())
const [anonymousMode, setAnonymousMode] = useState(false)
```

### Proposed State Structure (Hierarchical)
```javascript
// Main component state (controller)
const [appState, setAppState] = useState({
  room: null,
  isLoading: true,
  error: '',
  connectionStatus: 'disconnected'
})

// Question state (child component)
const [questionState, setQuestionState] = useState({
  currentQuestion: null,
  timeLeft: 0,
  selectedOptions: [],
  submitted: false,
  isActive: false
})

// Review state (utility component)
const [reviewState, setReviewState] = useState({
  markedForReview: new Set(),
  showReviewPopup: false
})
```

## 🛠️ Implementation Steps

### Step 1: Create New Component Files
```bash
frontend/src/components/
├── QuestionAnswerSection.jsx
├── PastQuestionsHistory.jsx
├── LeaderboardPanel.jsx
├── TimerWidget.jsx
├── QuestionReviewPopup.jsx
├── ConnectionStatus.jsx
└── _component.styles.css        # Separate CSS files
```

### Step 2: Refactor StudentRoomPage.jsx
Remove long sections and replace with imported components:

```javascript
// BEFORE - Monolithic
function StudentRoomPage() {
  // 776 lines of mixed logic
}

// AFTER - Focused component
function StudentRoomPage() {
  // Controller component - only coordinates child components
  // Small, readable, testable
  return (
    <div>Container</div>
  )
}
```

### Step 3: Update State Management
- Split state into focused state groups
- Use custom hooks for component-specific state
- Reduce prop drilling

### Step 4: Update Keyboard Shortcuts
- Move keyboard handlers to dedicated hook
- Share across multiple components
- Better separation of concerns

### Step 5: Update Sound Integration
- Create sound context/provider
- Share across all components
- Better control and management

## 🧪 Testing Strategy

### Unit Tests
```bash
frontend/src/components/
├── __tests__/
│   ├── QuestionAnswerSection.test.jsx
│   ├── PastQuestionsHistory.test.jsx
│   ├── LeaderboardPanel.test.jsx
│   ├── TimerWidget.test.jsx
│   └── ConnectionStatus.test.jsx
```

### Integration Tests
- Socket event handling
- API integration
- State transitions

## 📊 Benefits of Refactoring

### Maintainability
- Each component has single responsibility
- Easier to understand and modify
- Reduced cognitive load

### Testability
- Component-level testing
- Isolated unit tests
- Better mocking strategies

### Reusability
- Components can be reused
- Share across different pages
- Easier to compound functionality

### Performance
- Better state management
- Reduced unnecessary re-renders
- Improved code organization

## 🔧 Migration Plan

### Week 1: Infrastructure
1. Create component skeleton files
2. Split state management
3. Setup testing infrastructure
4. Basic structure establishment

### Week 2: Core Components
1. Implement ConnectionStatus
2. Implement TimerWidget
3. Implement QuestionAnswerSection
4. Update main component to use new structure

### Week 3: Advanced Components
1. Implement PastQuestionsHistory
2. Implement LeaderboardPanel
3. Implement QuestionReviewPopup
4. Update keyboard shortcuts and sound integration

### Week 4: Refinement
1. Add comprehensive tests
2. Improve component styling
3. Optimize performance
4. Documentation and code reviews

## 📋 Code Quality Improvements

### Before
- Cyclomatic complexity: High (776 lines)
- Cohesion: Low (mixed responsibilities)
- Coupling: High (interdependent logic)
- Test coverage: Limited

### After
- Cyclomatic complexity: Low (each component < 100 lines)
- Cohesion: High (single responsibility)
- Coupling: Low (clear interfaces)
- Test coverage: Comprehensive

## 🎯 Success Metrics

### Technical Metrics
- **Component Size**: Each component ≤ 150 lines
- **Test Coverage**: > 80% for all components
- **Lines of Code**: Reduced by 50%
- **Cyclomatic Complexity**: Significantly reduced

### Business Metrics
- **Development Speed**: 30% faster feature development
- **Bug Fix Time**: 40% reduction in debugging time
- **Code Review**: 50% faster reviews
- **Onboarding**: New developers understand codebase faster

This comprehensive refactoring plan transforms a monolithic, difficult-to-maintain component into a set of focused, reusable, and testable components while maintaining all existing functionality.