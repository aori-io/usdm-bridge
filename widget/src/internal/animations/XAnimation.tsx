export default function XAnimation(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 133 133" {...props}>
      <style>{`
        @keyframes aori-x-circle { from { stroke-dashoffset: 343; } to { stroke-dashoffset: 0; } }
        @keyframes aori-x-fill   { from { opacity: 1; }            to { opacity: 0; } }
        @keyframes aori-x-line   { from { stroke-dashoffset: 72; }  to { stroke-dashoffset: 0; } }
        .aori-x-outline   { stroke-dasharray: 343; stroke-dashoffset: 343; animation: aori-x-circle 0.6s ease-in-out forwards; }
        .aori-x-fill-mask { animation: aori-x-fill 0.3s ease-in-out 0.3s forwards; }
        .aori-x-line1     { stroke-dasharray: 72; stroke-dashoffset: 72; animation: aori-x-line 0.4s ease-in-out 0.4s forwards; }
        .aori-x-line2     { stroke-dasharray: 72; stroke-dashoffset: 72; animation: aori-x-line 0.4s ease-in-out 0.55s forwards; }
      `}</style>
      <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <circle fill="var(--widget-status-failed)" cx="66.5" cy="66.5" r="54.5" />
        <circle className="aori-x-fill-mask" fill="var(--widget-background)" cx="66.5" cy="66.5" r="55.5" />
        <circle className="aori-x-outline" stroke="var(--widget-status-failed)" strokeWidth="4" cx="66.5" cy="66.5" r="54.5" fill="none" />
        <path className="aori-x-line1" d="M41,41 L92,92" stroke="var(--widget-background)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path className="aori-x-line2" d="M92,41 L41,92" stroke="var(--widget-background)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
