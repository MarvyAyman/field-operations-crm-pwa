import priest from '../assets/priest.png';

// The priest picture; only his eyes move: two skin-coloured eyelids slide down over them now and then (blink).
export default function PriestAvatar({ size = 40 }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} role="img" aria-label="الحساب" className="rounded-full">
      <image href={priest} width="1024" height="1024" />
      <ellipse className="pa-lid" cx="460" cy="336" rx="23" ry="21" fill="#F0C097" />
      <ellipse className="pa-lid" cx="580" cy="336" rx="23" ry="21" fill="#F0C097" />
    </svg>
  );
}
