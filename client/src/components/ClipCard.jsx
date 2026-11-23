import { Link } from "react-router-dom";
import { StatusBadge } from "./ui.jsx";
import { formatRelative } from "../utils/format.js";

export default function ClipCard({ clip }) {
  return (
    <Link to={`/clips/${clip._id}`} className="clip-card">
      <div className="clip-thumb">
        <video src={`${clip.videoUrl}#t=1`} preload="metadata" muted playsInline />
        <span className="clip-score">score {clip.score ?? "—"}</span>
      </div>
      <div className="clip-body">
        <strong className="clip-title">{clip.title || clip.name}</strong>
        <span className="muted small">{clip.streamer || "unknown streamer"} · {formatRelative(clip.createdAt)}</span>
        <div className="badge-row">
          {clip.test && <StatusBadge status="test">test</StatusBadge>}
          {clip.zernio?.postId
            ? <StatusBadge status="scheduled">sent to Zernio</StatusBadge>
            : <StatusBadge status={clip.approved ? "approved" : "pending"}>{clip.approved ? "approved" : "needs review"}</StatusBadge>}
          <span className="badge badge-muted">{clip.framing}</span>
        </div>
      </div>
    </Link>
  );
}
