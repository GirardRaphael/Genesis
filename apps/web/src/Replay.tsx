import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Clock,
} from "lucide-react";
export function Replay({
  label,
  count,
  index,
  onChange,
  description,
}: {
  label: string;
  count: number;
  index: number;
  onChange: (n: number) => void;
  description: string;
}) {
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing || count < 2) return;
    const id = setInterval(() => {
      if (index >= count - 1) {
        setPlaying(false);
        return;
      }
      onChange(index + 1);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, count, index, speed, onChange]);
  return (
    <div className="replay">
      <div className="replay-title">
        <Clock size={15} />
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="replay-controls">
        <button
          aria-label={"Réinitialiser " + label}
          onClick={() => {
            setPlaying(false);
            onChange(0);
          }}
          disabled={!count}
        >
          <RotateCcw size={15} />
        </button>
        <button
          aria-label={"Événement précédent " + label}
          onClick={() => onChange(Math.max(0, index - 1))}
          disabled={!count || index === 0}
        >
          <SkipBack size={14} />
        </button>
        <button
          className="replay-play"
          aria-label={(playing ? "Pause " : "Lecture ") + label}
          onClick={() => setPlaying(!playing)}
          disabled={count < 2}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          aria-label={"Événement suivant " + label}
          onClick={() => onChange(Math.min(count - 1, index + 1))}
          disabled={!count || index >= count - 1}
        >
          <SkipForward size={14} />
        </button>
        <input
          aria-label={"Position " + label}
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          value={index}
          disabled={!count}
          onChange={(e) => {
            setPlaying(false);
            onChange(Number(e.target.value));
          }}
        />
        <span className="replay-position">
          {count ? index + 1 : 0} / {count}
        </span>
        <select
          aria-label={"Vitesse " + label}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value={0.5}>0,5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </div>
    </div>
  );
}
