import { IconButton } from "./ui/IconButton";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  AlertTriangle,
  Bug,
  Info,
  Loader2,
  Mic,
  MicOff,
  CircleX,
} from "lucide-react";
import { toast } from "react-toastify";
import { useEffect, useState, useRef, useCallback } from "react";
import player from "@/models/Player";
import { useDebug } from "@/hooks/useDebug";
import { load } from "@tauri-apps/plugin-store";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { EventBusEvent, PlayingState } from "@/utils/bus";
import { eventBus } from "@/utils/bus";
import {
  isChattingAtom,
  realtimeSessionAtom,
  stopConversationAtom,
} from "@/stores/chat_atoms";

interface TTSControlsProps {
  bookId: string;
  disabled?: boolean;
}

const STORE_PATH = "tts-controls-position.json";
const POSITION_KEY = "position";

// Get default position (center-bottom of screen)
const getDefaultPosition = (): { x: number; y: number } => {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  const defaultX = window.innerWidth / 2 - 150; // Approximate center, adjusted for component width
  const defaultY = window.innerHeight - 128; // 8rem (32px) from bottom + some offset

  return { x: defaultX, y: defaultY };
};

const playerAtom = atom(player);
playerAtom.debugLabel = "playerAtom";

export default function TTSControls({
  bookId,
  disabled = false,
}: TTSControlsProps) {
  const [showError, setShowError] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [hasShownError, setHasShownError] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const player = useAtomValue(playerAtom);
  const stopConversation = useSetAtom(stopConversationAtom);
  const error = errors.join("\n");
  const [isChatting, setIsChatting] = useAtom(isChattingAtom);

  useEffect(() => {
    void (async () => {
      await player.initialize(bookId);
    })();
  }, [bookId, player]);

  const [playingState, setPlayingState] = useState<PlayingState>(
    PlayingState.Stopped
  );
  const { setIsDebugging, shouldDebug } = useDebug();

  // Constrain position within viewport bounds
  const constrainPosition = useCallback((x: number, y: number) => {
    if (typeof window === "undefined") {
      return { x: 0, y: 0 };
    }

    const componentWidth = 300; // Approximate component width
    const componentHeight = 60; // Approximate component height

    const minX = 0;
    const minY = 0;
    const maxX = window.innerWidth - componentWidth;
    const maxY = window.innerHeight - componentHeight;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  // Load saved position from Tauri Store on mount, and calculate default position after mount
  useEffect(() => {
    const loadPosition = async () => {
      try {
        const store = await load(STORE_PATH, { defaults: {}, autoSave: false });
        const savedPosition = await store.get<{ x: number; y: number }>(
          POSITION_KEY
        );

        if (
          savedPosition &&
          typeof savedPosition.x === "number" &&
          typeof savedPosition.y === "number"
        ) {
          // Validate saved position is within viewport
          const constrained = constrainPosition(
            savedPosition.x,
            savedPosition.y
          );
          setPosition(constrained);
        } else {
          // No saved position, use default
          setPosition(getDefaultPosition());
        }
      } catch (error) {
        console.error(
          "Failed to load TTS controls position from store:",
          error
        );
        // Use default position if loading fails
        setPosition(getDefaultPosition());
      }
    };

    void loadPosition();
  }, [constrainPosition]);

  useEffect(() => {
    eventBus.on(EventBusEvent.PLAYING_STATE_CHANGED, setPlayingState);
    return () => {
      player.cleanup();
    };
  }, []);

  // Check for errors using setTimeout to avoid cascading renders
  useEffect(() => {
    const checkForErrors = () => {
      const currentErrors = player.getErrors();
      if (currentErrors.length !== 0 && !hasShownError) {
        setShowError(true);
        setErrors(currentErrors);
        setHasShownError(true);
      } else if (currentErrors.length === 0 && hasShownError) {
        setHasShownError(false);
      }
    };

    // Use setTimeout to defer the state update
    const timeoutId = setTimeout(checkForErrors, 0);
    return () => clearTimeout(timeoutId);
  }, [player, hasShownError]);

  // Show error snackbar when error occurs
  const handleErrorClose = () => {
    setShowError(false);
    // Clear error from store
    if (player) {
      player.cleanup();
    }
  };

  const handlePlay = () => {
    if (playingState === PlayingState.Playing) {
      player.pause();
      return;
    }
    if (playingState === PlayingState.Paused) {
      player.resume();
      return;
    }
    return player.play();
  };

  const handleStop = async () => {
    await player.stop();
  };
  const toggleChat = async () => {
    setIsChatting((isChatting) => !isChatting);
  };

  const handleChat = async () => {
    void toggleChat();
  };
  const stopChat = async () => {
    void toggleChat();
    void stopConversation();
  };

  const handlePrev = async () => {
    await player.prev();
  };

  const handleNext = async () => {
    await player.next();
  };

  const handleShowErrorDetails = async () => {
    const detailedInfo = await player.getDetailedErrorInfo();

    // Show a toast with the basic info
    toast.info(
      `Check console for detailed error information. Errors: ${detailedInfo.errors.length}`,
      {
        position: "top-center",
        autoClose: 5000,
      }
    );
  };

  const getPlayIcon = () => {
    if (playingState === PlayingState.Loading) {
      return <Loader2 size={24} className="animate-spin" />;
    }
    if (playingState === PlayingState.Playing) {
      return <Pause size={24} />;
    }
    return <Play size={24} />;
  };

  // Save position to Tauri Store
  const savePosition = useCallback((x: number, y: number) => {
    void (async () => {
      try {
        const store = await load(STORE_PATH, { defaults: {}, autoSave: false });
        await store.set(POSITION_KEY, { x, y });
        await store.save();
      } catch (error) {
        console.error("Failed to save TTS controls position to store:", error);
      }
    })();
  }, []);

  // Handle drag start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!position) return;

      // Prevent dragging if clicking on buttons or interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("[role='button']") ||
        target.tagName === "BUTTON"
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation(); // Prevent event from bubbling to underlying elements
      setIsDragging(true);
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      dragOffset.current = { x: position.x, y: position.y };
    },
    [position]
  );

  // Handle drag move
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !dragStartPos.current) return;

      e.preventDefault();
      e.stopPropagation(); // Prevent event from bubbling to underlying elements

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;

      const newX = dragOffset.current.x + deltaX;
      const newY = dragOffset.current.y + deltaY;

      const constrained = constrainPosition(newX, newY);
      setPosition(constrained);
    },
    [isDragging, constrainPosition]
  );

  // Handle drag end
  const handleMouseUp = useCallback(
    (e?: MouseEvent) => {
      if (isDragging && position) {
        if (e) {
          e.preventDefault();
          e.stopPropagation(); // Prevent event from bubbling to underlying elements
        }
        setIsDragging(false);
        dragStartPos.current = null;
        savePosition(position.x, position.y);
      }
    },
    [isDragging, position, savePosition]
  );

  // Set up global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const mouseMoveHandler = (e: MouseEvent) => handleMouseMove(e);
      const mouseUpHandler = (e: MouseEvent) => handleMouseUp(e);

      window.addEventListener("mousemove", mouseMoveHandler, {
        passive: false,
      });
      window.addEventListener("mouseup", mouseUpHandler, { passive: false });
      document.body.style.userSelect = "none"; // Prevent text selection while dragging

      return () => {
        window.removeEventListener("mousemove", mouseMoveHandler);
        window.removeEventListener("mouseup", mouseUpHandler);
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Constrain position when window is resized
  useEffect(() => {
    if (!position) return;

    const handleResize = () => {
      const constrained = constrainPosition(position.x, position.y);
      if (constrained.x !== position.x || constrained.y !== position.y) {
        setPosition(constrained);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [position, constrainPosition]);

  // Don't render until position is calculated
  if (position === null) {
    return null;
  }

  return (
    <>
      {isChatting && (
        <div className="fixed rounded-full  top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="absolute -top-2 -right-2 ">
            <CircleX
              className="cursor-pointer"
              onClick={stopChat}
              color="red"
              size={24}
            />
          </div>
          <div>
            <img
              width={100}
              height={100}
              src="https://rishi-tauri.s3.us-east-1.amazonaws.com/ai.gif"
              alt="AI"
            />
          </div>
        </div>
      )}
      <div
        ref={dragRef}
        className="fixed z-50 tts-controls-drag-handle"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={(e) => {
          // Prevent touch events from bubbling to underlying swipe handlers
          e.stopPropagation();
        }}
        onTouchMove={(e) => {
          // Prevent touch events from bubbling to underlying swipe handlers
          e.stopPropagation();
        }}
        onTouchEnd={(e) => {
          // Prevent touch events from bubbling to underlying swipe handlers
          e.stopPropagation();
        }}
      >
        <div className="flex items-center gap-4 px-6 py-3 bg-black/80 rounded-3xl backdrop-blur-lg shadow-lg border border-white/10">
          {/* Volume Icon */}
          <Volume2
            size={20}
            className={
              playingState === PlayingState.Playing
                ? "text-white"
                : "text-white/70"
            }
          />

          {/* Previous Button */}
          <IconButton
            size="large"
            onClick={handlePrev}
            disabled={disabled || playingState === PlayingState.Loading}
            className="text-white hover:bg-white/10 disabled:text-white/30"
          >
            <SkipBack size={24} />
          </IconButton>

          {/* Play/Pause Button */}
          <IconButton
            size="large"
            onClick={handlePlay}
            disabled={disabled}
            className={`text-white hover:bg-white/10 disabled:text-white/30 ${
              playingState === PlayingState.Playing
                ? "text-white"
                : "text-white/80"
            }`}
          >
            {getPlayIcon()}
          </IconButton>

          {/* Next Button */}
          <IconButton
            size="large"
            onClick={handleNext}
            disabled={disabled || playingState === PlayingState.Loading}
            className="text-white hover:bg-white/10 disabled:text-white/30"
          >
            <SkipForward size={24} />
          </IconButton>

          {/* Stop Button */}
          <IconButton
            size="large"
            onClick={handleStop}
            disabled={disabled || playingState !== PlayingState.Playing}
            className="text-white hover:bg-white/10 disabled:text-white/30"
          >
            <Square size={24} />
          </IconButton>
          {/* Chat Button */}
          {!isChatting && (
            <IconButton
              size="large"
              onClick={handleChat}
              disabled={false}
              className="text-white hover:bg-white/10 disabled:text-white/30"
            >
              <Mic size={24} />
            </IconButton>
          )}
          {isChatting && (
            <IconButton
              size="large"
              onClick={stopChat}
              disabled={false}
              className="text-white hover:bg-white/10 disabled:text-white/30"
            >
              <MicOff size={24} />
            </IconButton>
          )}
          {/* Debug Button */}
          {shouldDebug && (
            <IconButton
              size="large"
              onClick={() => setIsDebugging((isDebugging) => !isDebugging)}
              disabled={disabled || playingState !== PlayingState.Playing}
              className="text-white hover:bg-white/10 disabled:text-white/30"
            >
              <Bug size={24} />
            </IconButton>
          )}

          {/* Error Icon with detailed info button (if there's an error) */}
          {errors.length > 0 && (
            <>
              <AlertTriangle size={20} className="text-red-500" />
              <IconButton
                size="small"
                onClick={handleShowErrorDetails}
                className="text-red-500 hover:bg-red-500/10"
                title="Show detailed error information"
              >
                <Info size={16} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      {/* Error Toast */}
      {showError && !!error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          {toast.error(error, {
            position: "top-center",
            autoClose: 6000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            onClose: handleErrorClose,
          })}
        </div>
      )}
    </>
  );
}
