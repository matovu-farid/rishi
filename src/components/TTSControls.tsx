import { IconButton } from "./ui/IconButton";
import { Spinner } from "./ui/Spinner";
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
} from "lucide-react";
import { toast } from "react-toastify";
import { useEffect, useState } from "react";
import { PlayingState } from "@/stores/ttsStore";
import { Player, PlayerEvent } from "@/models/Player";
import { useDebug } from "@/hooks/useDebug";
import { PlayerControlInterface } from "@/models/player_control";
interface TTSControlsProps {
  bookId: string;
  playerControl: PlayerControlInterface;
  disabled?: boolean;
}

export function TTSControls({
  bookId,
  playerControl,
  disabled = false,
}: TTSControlsProps) {
  const [showError, setShowError] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [hasShownError, setHasShownError] = useState(false);

  const error = errors.join("\n");
  const [player] = useState<Player>(new Player(playerControl, bookId));
  const [playingState, setPlayingState] = useState<PlayingState>(
    player.getPlayingState()
  );
  const { setIsDebugging, shouldDebug } = useDebug(player);

  useEffect(() => {
    player.on(PlayerEvent.PLAYING_STATE_CHANGED, setPlayingState);
    return () => {
      player.off(PlayerEvent.PLAYING_STATE_CHANGED, setPlayingState);
      player.cleanup();
    };
  }, [player]);

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

  const handlePrev = async () => {
    await player.prev();
  };

  const handleNext = async () => {
    await player.next();
  };

  const handleShowErrorDetails = async () => {
    const detailedInfo = await player.getDetailedErrorInfo();

    // Create a formatted error message
    const errorInfo = JSON.stringify(detailedInfo, null, 2);

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
      return <Spinner size="medium" color="currentColor" />;
    }
    if (playingState === PlayingState.Playing) {
      return <Pause size={24} />;
    }
    return <Play size={24} />;
  };

  return (
    <>
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
