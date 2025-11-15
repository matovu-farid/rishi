# Paragraph Navigation Flow Diagrams

## Flow 1: Next Paragraph (Last Paragraph → Next Page) - WORKING ✅

```mermaid
sequenceDiagram
    participant User
    participant Player as Player
    participant EventBus as EventBus
    participant UI as PDF Component
    participant PollHook as useCurrentPageNumber
    participant Atoms as Jotai Atoms
    participant Virtualizer as React Virtualizer

    Note over User,Player: User is on LAST paragraph (index 4 of 5)
    User->>Player: Click "Next Paragraph" button
    Player->>Player: next() called
    Player->>Player: direction = Direction.Forward
    Player->>Player: nextIndex = currentIndex + 1 = 5
    Player->>Player: updateParagaph(5)
    
    Note over Player: Bounds check: 5 >= 5 (length)
    Player->>Player: moveToNextPage()
    Player->>Player: setState(WaitingForNewParagraphs)
    Player->>Player: currentViewParagraphs = nextPageParagraphs
    Player->>Player: nextPageParagraphs = []
    Player->>EventBus: publish(NEXT_PAGE_PARAGRAPHS_EMPTIED)
    
    EventBus->>UI: NEXT_PAGE_PARAGRAPHS_EMPTIED
    UI->>UI: clearAllHighlights()
    UI->>Atoms: setPageNumber(currentPageNumber + 1)
    UI->>Virtualizer: scrollToIndex(pageNumber + 1)
    UI->>EventBus: publish(PAGE_CHANGED)
    
    Note over PollHook: Polling runs every 500ms
    PollHook->>Atoms: get(pageNumberAtom) - now pageNumber + 1
    PollHook->>Atoms: get(pageNumberToPageDataAtom)
    PollHook->>PollHook: pageDataToParagraphs(newPageNumber, data)
    PollHook->>PollHook: compare with current paragraphs
    alt Paragraphs changed (after up to 500ms delay)
        PollHook->>Atoms: set(getCurrentViewParagraphsAtom)
        PollHook->>EventBus: publish(NEW_PARAGRAPHS_AVAILABLE)
        EventBus->>Player: NEW_PARAGRAPHS_AVAILABLE
        Player->>Player: setState(Playing) [if WaitingForNewParagraphs]
        Player->>Player: update currentViewParagraphs
        alt Playing State
            Player->>Player: handleLocationChanged()
            Player->>Player: stop() + resetParagraphs() + play()
        end
    end
    
    EventBus->>Player: PAGE_CHANGED (from UI)
    Player->>Player: handleLocationChanged()
    Note over Player: handleLocationChanged checks state
    alt State is WaitingForNewParagraphs
        Player->>Player: resetParagraphs()
        Note over Player: Direction is Forward
        Player->>Player: setParagraphIndex(0)
        Note over Player: Returns early - doesn't call play()
        Note over Player: NEW_PARAGRAPHS_AVAILABLE will trigger play
    else State is Playing
        Player->>Player: stop() + resetParagraphs() + play()
    end
    
    Note over Player: ✅ SUCCESS: Plays from first paragraph (index 0) of new page
```

## Flow 2: Previous Paragraph (First Paragraph → Previous Page) - FAILING ❌

```mermaid
sequenceDiagram
    participant User
    participant Player as Player
    participant EventBus as EventBus
    participant UI as PDF Component
    participant PollHook as useCurrentPageNumber
    participant Atoms as Jotai Atoms
    participant Virtualizer as React Virtualizer

    Note over User,Player: User is on FIRST paragraph (index 0)
    User->>Player: Click "Prev Paragraph" button
    Player->>Player: prev() called
    Player->>Player: direction = Direction.Backward
    Player->>Player: prevIndex = currentIndex - 1 = -1
    Player->>Player: updateParagaph(-1)
    
    Note over Player: Bounds check: -1 < 0
    Player->>Player: moveToPreviousPage()
    Player->>Player: setState(WaitingForNewParagraphs)
    Player->>Player: currentViewParagraphs = previousPageParagraphs
    Note over Player: ⚠️ previousPageParagraphs were REVERSED when stored (line 187)
    Player->>Player: previousPageParagraphs = []
    Player->>EventBus: publish(PREVIOUS_PAGE_PARAGRAPHS_EMPTIED)
    
    Note over Player: ⚠️ BUG: updateParagaph() returns early, but prev() continues
    Player->>Player: getCurrentParagraph() [called from prev() after updateParagaph returns]
    Note over Player: ⚠️ currentViewParagraphs was just swapped, but may be empty or wrong
    Player->>EventBus: publish(MOVED_TO_PREV_PARAGRAPH, {from, to})
    Note over Player: ⚠️ 'to' paragraph may be incorrect here!
    
    EventBus->>UI: PREVIOUS_PAGE_PARAGRAPHS_EMPTIED
    UI->>UI: clearAllHighlights()
    UI->>Atoms: setPageNumber(currentPageNumber - 1)
    UI->>Virtualizer: scrollToIndex(pageNumber - 1)
    UI->>EventBus: publish(PAGE_CHANGED)
    
    Note over PollHook: Polling runs every 500ms
    PollHook->>Atoms: get(pageNumberAtom) - now pageNumber - 1
    PollHook->>Atoms: get(pageNumberToPageDataAtom)
    PollHook->>PollHook: pageDataToParagraphs(newPageNumber, data)
    PollHook->>PollHook: compare with current paragraphs
    alt Paragraphs changed (after up to 500ms delay)
        PollHook->>Atoms: set(getCurrentViewParagraphsAtom)
        PollHook->>EventBus: publish(NEW_PARAGRAPHS_AVAILABLE)
        EventBus->>Player: NEW_PARAGRAPHS_AVAILABLE
        Player->>Player: setState(Playing) [if WaitingForNewParagraphs]
        Player->>Player: update currentViewParagraphs
        Note over Player: ⚠️ This OVERWRITES the swapped previousPageParagraphs!
        Note over Player: ⚠️ The reversed order is lost!
        alt Playing State
            Player->>Player: handleLocationChanged()
            Player->>Player: stop() + resetParagraphs() + play()
        end
    end
    
    EventBus->>Player: PAGE_CHANGED (from UI)
    Player->>Player: handleLocationChanged()
    Note over Player: handleLocationChanged checks state
    alt State is WaitingForNewParagraphs
        Player->>Player: resetParagraphs()
        Note over Player: Direction is Backward
        Player->>Player: setParagraphIndex(length - 1)
        Note over Player: ⚠️ But currentViewParagraphs was just overwritten by NEW_PARAGRAPHS_AVAILABLE
        Note over Player: ⚠️ The paragraphs are now in normal order (not reversed)
        Note over Player: ⚠️ So length - 1 is the LAST paragraph, not the FIRST!
        Note over Player: Returns early - doesn't call play()
        Note over Player: NEW_PARAGRAPHS_AVAILABLE will trigger play
    else State is Playing
        Player->>Player: stop() + resetParagraphs() + play()
    end
    
    Note over Player: ❌ FAILURE: Plays from wrong paragraph (last instead of first)
```

## Key Differences

### 1. Direction Setting
- **Next Flow**: `direction = Direction.Forward` → `resetParagraphs()` sets index to `0` ✅
- **Prev Flow**: `direction = Direction.Backward` → `resetParagraphs()` sets index to `length - 1` ❌

### 2. Paragraph Array Handling
- **Next Flow**: `nextPageParagraphs` are stored in normal order → swapped correctly ✅
- **Prev Flow**: `previousPageParagraphs` are **reversed** when stored (line 187) → but then **overwritten** by `NEW_PARAGRAPHS_AVAILABLE` which provides normal order ❌

### 3. Timing Issue
- **Next Flow**: When `NEW_PARAGRAPHS_AVAILABLE` arrives, `currentViewParagraphs` already has the swapped `nextPageParagraphs` in correct order ✅
- **Prev Flow**: When `NEW_PARAGRAPHS_AVAILABLE` arrives, it **overwrites** the swapped `previousPageParagraphs` (which were reversed), losing the reverse order ❌

### 4. Index Calculation
- **Next Flow**: `resetParagraphs()` with Forward direction → index = 0 (first paragraph of new page) ✅
- **Prev Flow**: `resetParagraphs()` with Backward direction → index = length - 1, but paragraphs are now in normal order, so this is the **last** paragraph, not the first ❌

## Root Cause

The issue is that `previousPageParagraphs` are reversed when stored (to account for backward navigation), but when `moveToPreviousPage()` swaps them into `currentViewParagraphs`, the subsequent `NEW_PARAGRAPHS_AVAILABLE` event **overwrites** them with paragraphs in normal order, losing the reverse order that was needed for correct backward navigation.

## Potential Fixes

1. **Don't reverse previousPageParagraphs**: Store them in normal order and adjust the index calculation in `resetParagraphs()` for backward direction
2. **Preserve reverse order**: When `NEW_PARAGRAPHS_AVAILABLE` arrives after `moveToPreviousPage()`, check if direction is Backward and reverse the paragraphs
3. **Different reset logic**: For backward direction, set index to 0 instead of length - 1, but reverse the paragraphs array first
4. **Delay NEW_PARAGRAPHS_AVAILABLE handling**: When in `WaitingForNewParagraphs` state after `moveToPreviousPage()`, don't overwrite `currentViewParagraphs` if direction is Backward

