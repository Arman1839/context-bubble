const bubbles = [
  ["🐼", "ambient-bubble--1"],
  ["🦊", "ambient-bubble--2"],
  ["🐸", "ambient-bubble--3"],
  ["🐱", "ambient-bubble--4"],
  ["🦉", "ambient-bubble--5"],
  ["🐧", "ambient-bubble--6"],
  ["🐶", "ambient-bubble--7"],
  ["🦄", "ambient-bubble--8"],
  ["🐨", "ambient-bubble--9"],
  ["🐰", "ambient-bubble--10"],
] as const;

export function AmbientBubbles() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {bubbles.map(([animal, style]) => <span key={style} className={`ambient-bubble ${style}`}>{animal}</span>)}
    </div>
  );
}
