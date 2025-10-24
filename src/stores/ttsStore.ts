import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ParagraphWithCFI } from '../../../shared/types'
export enum PlayingState {
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Loading = 'loading'
}
interface TTSState {
  // Playback control
  playingState: PlayingState
  hasApiKey: boolean

  // Navigation state
  currentParagraphIndex: number
  paragraphs: ParagraphWithCFI[]

  // Book context
  currentBookId: string
  currentPage: string // CFI of current page

  // Cache management
  audioCache: Map<string, string>

  // Error handling
  error: string | null

  // Actions with proper error handling
  setPlayingState: (playingState: PlayingState) => void
  setHasApiKey: (hasKey: boolean) => void
  setError: (error: string | null) => void
  setCurrentParagraphIndex: (index: number) => void
  setParagraphs: (paragraphs: ParagraphWithCFI[]) => void
  setCurrentBookId: (bookId: string) => void
  setCurrentPage: (page: string) => void
  addToAudioCache: (cfiRange: string, audioPath: string) => void
  removeFromAudioCache: (cfiRange: string) => void
  reset: () => void // Clear all state
  setToLastParagraphIndex: () => void
  direction: 'forward' | 'backward'
  setDirection: (direction: 'forward' | 'backward') => void
}

export const useTTSStore = create<TTSState>()(
  devtools(
    (set, get) => ({
      // Initial state
      playingState: PlayingState.Stopped,
      hasApiKey: false,
      direction: 'forward',
      currentParagraphIndex: 0,
      paragraphs: [],
      currentBookId: '',
      currentPage: '',
      audioCache: new Map(),
      error: null,
      setDirection: (direction) => set({ direction: direction }),

      // Actions

      setPlayingState: (playingState) => set({ playingState: playingState }),
      setHasApiKey: (hasKey) => set({ hasApiKey: hasKey }),
      setError: (error) => set({ error }),

      // setCurrentParagraphIndex: (index) => {
      //   const state = get()
      //   if (index >= 0 && index < state.paragraphs.length) {
      //     set({ currentParagraphIndex: index })
      //   } else {
      //     console.warn(
      //       `Invalid paragraph index ${index}. Valid range: 0-${state.paragraphs.length - 1}`
      //     )
      //   }
      // },
      // setToLastParagraphIndex: () => {
      //   const state = get()
      //   set({ currentParagraphIndex: state.paragraphs.length - 1 })
      // },

      setCurrentBookId: (bookId) => {
        const state = get()
        if (state.currentBookId !== bookId) {
          // Clear cache when switching books
          set({
            currentBookId: bookId,
            audioCache: new Map(),
            currentParagraphIndex: 0,

            playingState: PlayingState.Stopped,
            error: null
          })
        }
      },

      // setCurrentPage: (page) => {
      //   const state = get()
      //   if (state.currentPage !== page) {
      //     set({ currentPage: page })
      //   }
      // },

      addToAudioCache: (cfiRange, audioPath) => {
        const newCache = new Map(get().audioCache)
        newCache.set(cfiRange, audioPath)

        set({ audioCache: newCache })
      },

      removeFromAudioCache: (cfiRange) => {
        const newCache = new Map(get().audioCache)
        newCache.delete(cfiRange)
        set({ audioCache: newCache })
      },

      reset: () =>
        set({
          playingState: PlayingState.Stopped,
          currentParagraphIndex: 0,
          currentBookId: '',
          currentPage: '',
          audioCache: new Map(),
          error: null
        })
    }),
    {
      name: 'tts-store' // Name for the store in devtools
    }
  )
)
