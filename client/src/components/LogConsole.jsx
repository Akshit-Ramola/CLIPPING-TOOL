import { useEffect, useRef } from "react";

export default function LogConsole({ logs = [] }) {
  const ref = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const onScroll = () => {
    const el = ref.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className="console" ref={ref} onScroll={onScroll}>
      {logs.length === 0 && <div className="muted">Waiting for output…</div>}
      {logs.map((line, i) => (
        <div key={i} className={`console-line console-${line.level}`}>
          <span className="console-time">{new Date(line.at).toLocaleTimeString()}</span>
          <span>{line.message}</span>
        </div>
      ))}
    </div>
  );
}
