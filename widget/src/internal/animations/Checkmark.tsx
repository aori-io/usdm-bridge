export default function Checkmark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 133 133" {...props}>
      <style>{`
        @keyframes aori-cm-circle { from { stroke-dashoffset: 343; } to { stroke-dashoffset: 0; } }
        @keyframes aori-cm-check  { from { stroke-dashoffset: 73; }  to { stroke-dashoffset: 0; } }
        @keyframes aori-cm-fill   { from { opacity: 1; }            to { opacity: 0; } }
        .aori-cm-outline   { stroke-dasharray: 343; stroke-dashoffset: 343; animation: aori-cm-circle 0.6s ease-in-out forwards; }
        .aori-cm-check     { stroke-dasharray: 73;  stroke-dashoffset: 73;  animation: aori-cm-check 0.4s ease-in-out 0.4s forwards; }
        .aori-cm-fill-mask { animation: aori-cm-fill 0.3s ease-in-out 0.3s forwards; }
      `}</style>
      <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <circle fill="var(--widget-status-completed)" cx="66.5" cy="66.5" r="54.5" />
        <circle className="aori-cm-fill-mask" fill="var(--widget-background)" cx="66.5" cy="66.5" r="55.5" />
        <circle className="aori-cm-outline" stroke="var(--widget-status-completed)" strokeWidth="4" cx="66.5" cy="66.5" r="54.5" fill="none" />
        <polyline className="aori-cm-check" stroke="var(--widget-background)" strokeWidth="6" fill="none" points="41 70 56 85 92 49" />
      </g>
    </svg>
  );
}
