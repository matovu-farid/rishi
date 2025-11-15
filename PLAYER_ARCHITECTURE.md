# Player Architecture Diagram

```mermaid
classDiagram
    class EventEmitter {
        <<abstract>>
        +on(event, fn)
        +emit(event, ...args)
        +off(event, fn)
    }

    class PlayerControlInterface {
        <<interface>>
        +initialize() Promise~void~
        +on(event, fn)
        +emit(event, ...args)
    }

    class EpubPlayerControl {
        -currentRendition Rendition
        -currentlyHighlightedParagraphIndex string
        +initialize() Promise~void~
        +cleanup() void
        -handleRenditionChange()
        -handleHighlight(index)
        -handlePageNavigation()
    }

    class DefaultPlayerControl {
        +initialize() Promise~void~
    }

    class Player {
        -currentViewParagraphs ParagraphWithIndex[]
        -nextPageParagraphs ParagraphWithIndex[]
        -previousPageParagraphs ParagraphWithIndex[]
        -playingState PlayingState
        -currentParagraphIndex number
        -bookId string
        -audioCache Map~string,string~
        -audioElement HTMLAudioElement
        -direction Direction
        -errors string[]
        -priority number
        +initialize(bookId) Promise~void~
        +play() Promise~void~
        +pause() void
        +resume() void
        +stop() Promise~void~
        +next() Promise~void~
        +prev() Promise~void~
        +getCurrentParagraph() Promise~ParagraphWithIndex~
        +setParagraphIndex(index) Promise~void~
        +requestAudio(paragraph, priority, skipCache) Promise~string~
        -playWithoutRetry(skipCache) Promise~void~
        -handleLocationChanged() Promise~void~
        -handleEnded() Promise~void~
        -handleError(e) Promise~void~
        -prefetchAudio(startIndex, count) Promise~void~
        -moveToNextPage() Promise~void~
        -moveToPreviousPage() Promise~void~
    }

    class EventBus {
        -_logsBugger Array
        +publish(event, ...args) boolean
        +subscribe(event, fn)
        +on(event, fn)
        +emit(event, ...args)
    }

    class HTMLAudioElement {
        +src string
        +currentTime number
        +duration number
        +play() Promise~void~
        +pause() void
        +load() void
        +addEventListener(type, handler)
    }

    class TTSService {
        <<external>>
        +requestTTSAudio(bookId, index, text, priority) Promise~string~
        +getTTSAudioPath(bookId, index) Promise~string~
    }

    EventEmitter <|-- PlayerControlInterface
    EventEmitter <|-- Player
    EventEmitter <|-- EventBus
    PlayerControlInterface <|.. EpubPlayerControl
    PlayerControlInterface <|.. DefaultPlayerControl

    Player --> EventBus : subscribes to events
    Player --> HTMLAudioElement : manages playback
    Player --> TTSService : requests audio
    EpubPlayerControl --> EventBus : publishes events
    EventBus --> Player : notifies of changes
```

## State Flow Diagram

```mermaid
stateDiagram-v2
    [*] --> Stopped: initialize()

    Stopped --> Loading: play()
    Loading --> Playing: audio ready
    Loading --> Stopped: error

    Playing --> Paused: pause()
    Paused --> Playing: resume()

    Playing --> Stopped: stop()
    Paused --> Stopped: stop()

    Playing --> WaitingForNewParagraphs: end of page
    WaitingForNewParagraphs --> Playing: new paragraphs available
    WaitingForNewParagraphs --> Stopped: error

    Playing --> Loading: next()/prev()
    Playing --> Loading: page changed
```

## Event Flow Diagrams

### EPUB Flow - Complete Sequence

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant Rendition as EPUB Rendition
    participant Atoms as Jotai Atoms
    participant Control as EpubPlayerControl
    participant EventBus as EventBus
    participant Player as Player
    participant TTS as TTS Service
    participant Audio as HTMLAudioElement

    Note over Rendition,Atoms: EPUB Rendition extracts paragraphs
    Rendition->>Atoms: getCurrentViewParagraphs(rendition)
    Atoms->>Atoms: getEpubCurrentViewParagraphsAtom updates
    Atoms->>Atoms: observe() callback triggers
    Atoms->>EventBus: publish(NEW_PARAGRAPHS_AVAILABLE)

    Note over Control: EpubPlayerControl ALSO subscribes to atoms
    Atoms->>Control: getEpubCurrentViewParagraphsAtom changes
    Control->>Control: emit(NEW_PARAGRAPHS_AVAILABLE) on self
    Note over Control: ⚠️ Control emits on itself, not EventBus

    Note over Player: Player subscribes to EventBus (not Control)
    EventBus->>Player: NEW_PARAGRAPHS_AVAILABLE
    Player->>Player: update currentViewParagraphs
    alt Playing State
        Player->>Player: handleLocationChanged()
        Player->>Player: stop() + resetParagraphs() + play()
    end

    UI->>Player: play()
    Player->>Player: getCurrentParagraph()
    Player->>Player: check audioCache
    alt Cache Miss
        Player->>TTS: requestTTSAudio(paragraph)
        TTS-->>Player: audioPath
        Player->>Player: addToAudioCache()
    else Cache Hit
        Player->>Player: use cached audioPath
    end

    Player->>Audio: src = convertFileSrc(audioPath)
    Player->>Audio: load()
    Audio-->>Player: canplaythrough event
    Player->>Audio: play()
    Audio-->>Player: playing
    Player->>EventBus: publish(PLAYING_AUDIO, paragraph)
    Note over Control: Player doesn't communicate with Control for highlights
    Note over UI: UI component listens to PLAYING_AUDIO

    Note over Player: Prefetch next paragraphs
    Player->>TTS: requestAudio(nextParagraphs, low priority)

    Audio->>Player: ended event
    Player->>Player: handleEnded()
    Player->>EventBus: publish(AUDIO_ENDED, paragraph)
    Player->>Player: next()
    Player->>Player: updateParagraph(index + 1)
    Player->>EventBus: publish(MOVED_TO_NEXT_PARAGRAPH)

    Note over Player: Bounds check at paragraph end
    alt End of current page
        Player->>Player: moveToNextPage()
        Player->>Player: setState(WaitingForNewParagraphs)
        Player->>EventBus: publish(NEXT_PAGE_PARAGRAPHS_EMPTIED)
        Note over UI: EPUB Component subscribes to EventBus
        EventBus->>UI: NEXT_PAGE_PARAGRAPHS_EMPTIED
        UI->>UI: clearAllHighlights()
        UI->>Rendition: rendition.next()
        Rendition->>Rendition: location change triggers
        Rendition->>Atoms: onLocationChange callback
        Atoms->>Atoms: getEpubCurrentViewParagraphsAtom recalculates
        Atoms->>Atoms: observe() callback triggers
        Atoms->>EventBus: publish(NEW_PARAGRAPHS_AVAILABLE)
        UI->>EventBus: publish(PAGE_CHANGED)
        EventBus->>Player: NEW_PARAGRAPHS_AVAILABLE
        Player->>Player: setState(Playing)
        EventBus->>Player: PAGE_CHANGED
        Player->>Player: handleLocationChanged()
        Note over Player: ⚠️ handleLocationChanged called twice:
        Note over Player: 1. From NEW_PARAGRAPHS_AVAILABLE (if Playing)
        Note over Player: 2. From PAGE_CHANGED
        Player->>Player: resetParagraphs()
        Player->>Player: play()
        Note over Control: ⚠️ EpubPlayerControl is NOT used for navigation
        Note over Control: Control listens to MOVE_TO_NEXT_PAGE on itself
        Note over Control: But nothing triggers those events!
    end
```

### PDF Flow - Complete Sequence

```mermaid
sequenceDiagram
    participant UI as PDF Component
    participant PDFDoc as PDF Document
    participant PageComp as PageComponent
    participant Atoms as Jotai Atoms
    participant PollHook as useCurrentPageNumber
    participant EventBus as EventBus
    participant Player as Player
    participant TTS as TTS Service
    participant Audio as HTMLAudioElement
    participant Virtualizer as React Virtualizer

    Note over PDFDoc,PageComp: PDF pages render and extract text
    PageComp->>Atoms: setPageNumberToPageData(pageNumber, pageData)
    Atoms->>Atoms: pageNumberToPageDataAtom updated

    Note over PollHook: Polling mechanism (500ms interval)
    loop Every 500ms
        PollHook->>Atoms: get(pageNumberAtom)
        PollHook->>Atoms: get(pageNumberToPageDataAtom)
        PollHook->>PollHook: pageDataToParagraphs(pageNumber, data)
        PollHook->>PollHook: compare with current paragraphs
        alt Paragraphs changed
            PollHook->>Atoms: set(getCurrentViewParagraphsAtom)
            PollHook->>EventBus: publish(NEW_PARAGRAPHS_AVAILABLE)
            EventBus->>Player: NEW_PARAGRAPHS_AVAILABLE
            Player->>Player: update currentViewParagraphs
            Player->>Player: if Playing: handleLocationChanged()
        end
    end

    UI->>Player: play()
    Player->>Player: getCurrentParagraph()
    Player->>Player: check audioCache
    alt Cache Miss
        Player->>TTS: requestTTSAudio(paragraph)
        TTS-->>Player: audioPath
        Player->>Player: addToAudioCache()
    else Cache Hit
        Player->>Player: use cached audioPath
    end

    Player->>Audio: src = convertFileSrc(audioPath)
    Player->>Audio: load()
    Audio-->>Player: canplaythrough event
    Player->>Audio: play()
    Audio-->>Player: playing
    Player->>EventBus: publish(PLAYING_AUDIO, paragraph)
    EventBus->>UI: PLAYING_AUDIO
    UI->>Atoms: setHighlightedParagraphIndex(paragraph.index)

    Note over Player: Prefetch next paragraphs
    Player->>TTS: requestAudio(nextParagraphs, low priority)

    Audio->>Player: ended event
    Player->>Player: handleEnded()
    Player->>EventBus: publish(AUDIO_ENDED, paragraph)
    Player->>Player: next()
    Player->>Player: updateParagraph(index + 1)
    Player->>EventBus: publish(MOVED_TO_NEXT_PARAGRAPH)
    EventBus->>UI: MOVED_TO_NEXT_PARAGRAPH
    UI->>Atoms: setHighlightedParagraphIndex(to.index)

    Note over Player: Bounds check at paragraph end
    alt End of current page
        Player->>Player: moveToNextPage()
        Player->>Player: setState(WaitingForNewParagraphs)
        Player->>EventBus: publish(NEXT_PAGE_PARAGRAPHS_EMPTIED)
        EventBus->>UI: NEXT_PAGE_PARAGRAPHS_EMPTIED
        UI->>UI: clearAllHighlights()
        UI->>Atoms: setPageNumber(currentPageNumber + 1)
        UI->>Virtualizer: scrollToIndex(pageNumber + 1)
        Note over UI: ⚠️ PAGE_CHANGED published immediately
        UI->>EventBus: publish(PAGE_CHANGED)
        Note over PollHook: ⚠️ Polling runs every 500ms (may be delayed)
        Note over PollHook: Polling detects page change
        PollHook->>Atoms: get(pageNumberAtom) - now pageNumber + 1
        PollHook->>Atoms: get(pageNumberToPageDataAtom)
        PollHook->>PollHook: pageDataToParagraphs(newPageNumber, data)
        PollHook->>PollHook: compare with current paragraphs
        alt Paragraphs changed (after up to 500ms delay)
            PollHook->>Atoms: set(getCurrentViewParagraphsAtom)
            PollHook->>EventBus: publish(NEW_PARAGRAPHS_AVAILABLE)
            EventBus->>Player: NEW_PARAGRAPHS_AVAILABLE
            Player->>Player: setState(Playing)
        end
        EventBus->>Player: PAGE_CHANGED (from UI)
        Player->>Player: handleLocationChanged()
        Note over Player: ⚠️ handleLocationChanged may be called:
        Note over Player: 1. From NEW_PARAGRAPHS_AVAILABLE (if Playing, after 500ms delay)
        Note over Player: 2. From PAGE_CHANGED (immediately, but paragraphs not ready)
        Note over Player: This can cause race conditions!
        Player->>Player: resetParagraphs()
        Player->>Player: play()
        Note over Player: ⚠️ If paragraphs not ready, play() may fail
    end
```

### Key Differences and Identified Issues

```mermaid
graph TB
    subgraph "EPUB Flow Characteristics"
        E1[Reactive: Uses observe pattern]
        E2[EpubPlayerControl exists but unused]
        E3[Direct rendition control via UI component]
        E4[Synchronous paragraph updates]
        E5[Highlight via rendition API in UI]
    end

    subgraph "PDF Flow Characteristics"
        P1[Polling: 500ms interval]
        P2[No PlayerControl layer]
        P3[Indirect via virtualizer]
        P4[Delayed paragraph updates up to 500ms]
        P5[Highlight via Jotai atoms in UI]
    end

    subgraph "Identified Issues"
        I1["PDF: Race condition - PAGE_CHANGED fires before paragraphs ready"]
        I2["PDF: 500ms polling delay can cause timing issues"]
        I3["PDF: No structured control layer"]
        I4["EPUB: handleLocationChanged called twice"]
        I5["EPUB: EpubPlayerControl not connected to flow"]
        I6["Both: handleLocationChanged may trigger multiple times"]
        I7["Both: PAGE_CHANGED and NEW_PARAGRAPHS_AVAILABLE can race"]
    end

    E1 -.->|Different approach| P1
    E2 -.->|Unused| P2
    E4 -.->|Can cause delays| P4

    P1 --> I1
    P1 --> I2
    P2 --> I3
    P4 --> I1
    P4 --> I2

    E4 --> I4
    E2 --> I5
    E4 --> I6
    P4 --> I6

    I1 --> I7
    I4 --> I7
```

#### Detailed Issue Analysis

**EPUB Issues:**

1. **Double handleLocationChanged**: Called from both `NEW_PARAGRAPHS_AVAILABLE` (if Playing) and `PAGE_CHANGED`
2. **Unused EpubPlayerControl**: Control layer exists but navigation happens directly in UI component via EventBus
3. **Race condition**: `PAGE_CHANGED` and `NEW_PARAGRAPHS_AVAILABLE` can arrive in different orders

**PDF Issues:**

1. **500ms polling delay**: Paragraphs may not be available when `PAGE_CHANGED` fires
2. **Race condition**: `PAGE_CHANGED` published immediately, but `NEW_PARAGRAPHS_AVAILABLE` delayed up to 500ms
3. **No control layer**: Direct EventBus communication without abstraction
4. **Timing dependency**: Player may try to play before paragraphs are ready

**Common Issues:**

1. **Multiple event triggers**: Both flows can trigger `handleLocationChanged` multiple times
2. **Event ordering**: No guarantee of event order between `PAGE_CHANGED` and `NEW_PARAGRAPHS_AVAILABLE`
3. **State synchronization**: Playing state may not align with paragraph availability

## Data Flow Diagram

```mermaid
flowchart TD
    A[Book Rendition] -->|extracts paragraphs| B[Paragraph Arrays]
    B --> C[Current View Paragraphs]
    B --> D[Next Page Paragraphs]
    B --> E[Previous Page Paragraphs]

    C --> F[Player.currentViewParagraphs]
    D --> G[Player.nextPageParagraphs]
    E --> H[Player.previousPageParagraphs]

    F --> I[Player.getCurrentParagraph]
    I --> J{Has text?}
    J -->|No| K[Skip to next]
    J -->|Yes| L[Check Audio Cache]

    L -->|Cache Hit| M[Use Cached Audio]
    L -->|Cache Miss| N[Request TTS Audio]
    N --> O[TTS Service]
    O -->|Generate Audio| P[Audio File Path]
    P --> Q[Update Cache]
    Q --> M

    M --> R[HTMLAudioElement]
    R -->|Play| S[Audio Playback]
    S -->|Ended| T[Next Paragraph]
    T --> I

    U[Page Change] --> V[EventBus]
    V --> W[Player.handleLocationChanged]
    W --> X[Reset Paragraph Index]
    X --> Y[Restart Playback]
```

## Component Relationships

```mermaid
graph TB
    subgraph "Player Core"
        Player[Player Class]
        PlayerState[Playing State]
        ParagraphIndex[Current Paragraph Index]
        AudioCache[Audio Cache Map]
    end

    subgraph "Player Controls"
        EpubControl[EpubPlayerControl]
        DefaultControl[DefaultPlayerControl]
        ControlInterface[PlayerControlInterface]
    end

    subgraph "Event System"
        EventBus[EventBus]
        PlayerEvents[Player Events]
        ControlEvents[Control Events]
    end

    subgraph "External Services"
        TTSService[TTS Service]
        AudioElement[HTMLAudioElement]
    end

    subgraph "State Management"
        JotaiAtoms[Jotai Atoms]
        EpubAtoms[EPUB Atoms]
    end

    Player --> PlayerState
    Player --> ParagraphIndex
    Player --> AudioCache
    Player --> EventBus
    Player --> TTSService
    Player --> AudioElement

    EpubControl --> ControlInterface
    DefaultControl --> ControlInterface
    EpubControl --> EventBus
    EpubControl --> JotaiAtoms
    EpubControl --> EpubAtoms

    EventBus --> PlayerEvents
    EventBus --> ControlEvents

    PlayerEvents --> Player
    ControlEvents --> Player
```
