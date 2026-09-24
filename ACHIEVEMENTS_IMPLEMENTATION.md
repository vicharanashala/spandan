# Spandan Achievements v2

Achievements are split into two scopes:

- **Section achievements**: earned once per quiz/room section (room code). Progress resets in a new room.
- **Lifetime achievements**: earned once per student across all rooms and never reset.

## Section achievements

First Step, Getting Started, Knowledge Seeker, On Fire, Speedster, Perfect Start, Unstoppable, Quick Thinker, Sharpshooter, Section Champion.

## Lifetime achievements

Lifetime Starter, Century Club, Dedicated Learner, Spandan Legend, Lifetime Knowledge Seeker, Quiz Master, Mastermind, Grand Master, Hot Streak, Inferno, Unbreakable, Lightning, Flash Mind, Accuracy Ace, Precision Master, Perfect Mind.

## Statistics

`UserRoomStats` stores section counters. `UserLifetimeStats` stores cumulative counters. Fast-answer counters are tracked at 5 and 10 seconds. Lifetime accuracy uses each badge's configured minimum answer count.

## UI

The student Achievements page has two tabs: Lifetime Achievements and Section Achievements. Section achievements include a selector for answered quiz/room sections.
