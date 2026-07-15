export default function RedoAnimation(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 133 133" {...props}>
      <style>{`
        @keyframes aori-rd-circle { from { stroke-dashoffset: 343; } to { stroke-dashoffset: 0; } }
        @keyframes aori-rd-fill   { from { opacity: 1; }            to { opacity: 0; } }
        @keyframes aori-rd-arc    { from { stroke-dashoffset: 140; } to { stroke-dashoffset: 0; } }
        @keyframes aori-rd-arrow  { from { stroke-dashoffset: 26; }  to { stroke-dashoffset: 0; } }
        .aori-rd-outline   { stroke-dasharray: 343; stroke-dashoffset: 343; animation: aori-rd-circle 0.6s ease-in-out forwards; }
        .aori-rd-fill-mask { animation: aori-rd-fill 0.3s ease-in-out 0.3s forwards; }
        .aori-rd-arc       { stroke-dasharray: 140; stroke-dashoffset: 140; animation: aori-rd-arc 0.5s ease-in-out 0.4s forwards; }
        .aori-rd-arrow     { stroke-dasharray: 26;  stroke-dashoffset: 26;  animation: aori-rd-arrow 0.3s ease-in-out 0.7s forwards; }
      `}</style>
      <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <circle fill="currentColor" cx="66.5" cy="66.5" r="54.5" />
        <circle className="aori-rd-fill-mask" fill="var(--widget-background)" cx="66.5" cy="66.5" r="55.5" />
        <circle className="aori-rd-outline" stroke="currentColor" strokeWidth="4" cx="66.5" cy="66.5" r="54.5" fill="none" />
        <path
          className="aori-rd-arc"
          d="M 93 66.5 C 93 80.5 81.5 92 66.5 92 C 51.5 92 40 80.5 40 66.5 C 40 52.5 51.5 41 66.5 41 C 76 41 84 46 88 53"
          stroke="var(--widget-background)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <polyline
          className="aori-rd-arrow"
          points="93 57 93 70 80 70"
          stroke="var(--widget-background)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  );
}
