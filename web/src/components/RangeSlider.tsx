"use client";

type Props = {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
};

// One track, two handles. Two native range inputs overlaid so keyboard and
// touch keep working; values are clamped so the handles can't cross.
export function RangeSlider({ min, max, value, onChange }: Props) {
  const [lo, hi] = value;
  const span = Math.max(1, max - min);
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;

  return (
    <div className="range-dual" style={{ width: 150 }}>
      <div className="range-track" />
      <div className="range-fill" style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        value={lo}
        aria-label="from year"
        onChange={(e) => onChange([Math.min(+e.target.value, hi), hi])}
        style={{ zIndex: lo >= hi ? 4 : 3 }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={hi}
        aria-label="to year"
        onChange={(e) => onChange([lo, Math.max(+e.target.value, lo)])}
      />
    </div>
  );
}
