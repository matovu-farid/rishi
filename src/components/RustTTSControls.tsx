import { IconButton } from "./ui/IconButton";
import { Spinner } from "./ui/Spinner";
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RustPlayer, RustPlayerEvent, PlayingState } from "@/models/RustPlayer";

type Props = {
  bookId: string;
  getPageIndex: () => number;
  goNext: () => Promise<void>;
  goPrev: () => Promise<void>;
};

export default function RustTTSControls({
  bookId,
  getPageIndex,
  goNext,
  goPrev,
}: Props) {
  const [player] = useState(
    () =>
      new RustPlayer({
        bookId,
        getPageIndex,
        goNextPage: goNext,
        goPrevPage: goPrev,
      })
  );

  const [state, setState] = useState<PlayingState>(player.getPlayingState());

  useEffect(() => {
    const handler = (s: PlayingState) => setState(s);
    player.on(RustPlayerEvent.PLAYING_STATE_CHANGED, handler);
    return () => {
      player.off(RustPlayerEvent.PLAYING_STATE_CHANGED, handler);
      player.cleanup();
    };
  }, [player]);

  const playOrPause = async () => {
    if (state === PlayingState.Playing) return player.pause();
    if (state === PlayingState.Paused) return player.resume();
    return player.play();
  };

  const stop = async () => player.stop();
  const prev = async () => player.prev();
  const next = async () => player.next();

  const playIcon = useMemo(() => {
    if (state === PlayingState.Loading)
      return <Spinner size="medium" color="currentColor" />;
    if (state === PlayingState.Playing) return <Pause size={24} />;
    return <Play size={24} />;
  }, [state]);

  return (
    <div className="flex items-center gap-4 px-6 py-3 bg-black/80 rounded-3xl backdrop-blur-lg shadow-lg border border-white/10">
      <Volume2
        size={20}
        className={
          state === PlayingState.Playing ? "text-white" : "text-white/70"
        }
      />
      {/* Voice selector */}
      <select
        aria-label="TTS voice"
        onChange={(e) => player.setVoice(e.target.value || undefined)}
        className="bg-transparent text-white/80 text-sm border border-white/20 rounded px-2 py-1"
        defaultValue=""
      >
        <option value="" className="text-black">
          Default Voice
        </option>
        <option value="female" className="text-black">
          Female
        </option>
        <option value="male" className="text-black">
          Male
        </option>
      </select>
      {/* Rate selector */}
      <select
        aria-label="TTS rate"
        onChange={(e) =>
          player.setRate(parseFloat(e.target.value) || undefined)
        }
        className="bg-transparent text-white/80 text-sm border border-white/20 rounded px-2 py-1"
        defaultValue="1"
      >
        <option value="0.9" className="text-black">
          0.9x
        </option>
        <option value="1" className="text-black">
          1.0x
        </option>
        <option value="1.1" className="text-black">
          1.1x
        </option>
      </select>
      <IconButton
        size="large"
        onClick={prev}
        className="text-white hover:bg-white/10"
      >
        <SkipBack size={24} />
      </IconButton>
      <IconButton
        size="large"
        onClick={playOrPause}
        className="text-white hover:bg-white/10"
      >
        {playIcon}
      </IconButton>
      <IconButton
        size="large"
        onClick={next}
        className="text-white hover:bg-white/10"
      >
        <SkipForward size={24} />
      </IconButton>
      <IconButton
        size="large"
        onClick={stop}
        disabled={state !== PlayingState.Playing}
        className="text-white hover:bg-white/10"
      >
        <Square size={24} />
      </IconButton>
    </div>
  );
}
