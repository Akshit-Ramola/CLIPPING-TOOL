import { Link } from "react-router-dom";
import { clipsApi, jobsApi, systemApi } from "../api/index.js";
import { useAsync } from "../hooks/useAsync.js";
import { useInterval } from "../hooks/useInterval.js";
import ClipCard from "../components/ClipCard.jsx";
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge } from "../components/ui.jsx";
import { ACTIVE_JOB_STATUSES, formatRelative } from "../utils/format.js";

function Check({ ok, label, detail }) {
  return (
    <li className="check-row">
      <span className={`dot ${ok ? "dot-ok" : "dot-bad"}`} aria-hidden="true" />
      <span>{label}</span>
      {detail && <span className="muted small">{detail}</span>}
    </li>
  );
}

export default function Dashboard() {
  const status = useAsync(() => systemApi.status(), []);
  const jobs = useAsync(() => jobsApi.list({ limit: 6 }), []);
  const clips = useAsync(() => clipsApi.list({ limit: 6 }), []);
  const hasActive = jobs.data?.items?.some((j) => ACTIVE_JOB_STATUSES.has(j.status));
  useInterval(() => {
    jobs.reload({ silent: true });
    clips.reload({ silent: true });
  }, hasActive ? 4000 : null);

  const s = status.data;
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Find live GTA streams, capture highlight moments and render vertical facecam-over-gameplay clips."
        actions={<Link to="/capture/new" className="btn btn-primary">New capture</Link>}
      />

      <div className="grid-2">
        <Card title="System">
          <ErrorBanner error={status.error} onRetry={() => status.reload()} />
          {status.loading && !s ? <Spinner /> : s && (
            <ul className="checks">
              <Check ok={s.database === "connected"} label="MongoDB" detail={s.database} />
              <Check ok={!!s.tools.ffmpeg} label="FFmpeg" detail={s.tools.ffmpeg ? "ready" : "missing"} />
              <Check ok={!!s.tools.ytdlp} label="yt-dlp" detail={s.tools.ytdlp || "run npm run setup:ytdlp"} />
              <Check ok={s.tools.faceModel} label="Facecam model (YuNet)" />
              <Check ok={s.integrations.youtubeApi} label="YouTube Data API key" detail={s.integrations.youtubeApi ? "set" : "needed for search + chat"} />
              <Check ok={s.integrations.twitchChat} label="Twitch chat" detail={s.integrations.twitchChat ? "set" : "optional"} />
              <Check
                ok={s.integrations.zernio && s.integrations.zernioAccounts.length > 0}
                label="Zernio publishing"
                detail={s.integrations.zernio ? s.integrations.zernioAccounts.join(", ") || "no account IDs" : "optional"}
              />
            </ul>
          )}
        </Card>

        <Card title="Recent capture jobs" actions={<Link to="/jobs" className="link">All jobs →</Link>}>
          <ErrorBanner error={jobs.error} />
          {jobs.loading && !jobs.data ? <Spinner /> : jobs.data?.items?.length ? (
            <ul className="list">
              {jobs.data.items.map((job) => (
                <li key={job._id}>
                  <Link to={`/jobs/${job._id}`} className="list-row">
                    <div>
                      <strong>{job.source?.title || job.url || job.fileName}</strong>
                      <span className="muted small">{job.source?.streamer || job.sourceType} · {formatRelative(job.createdAt)}</span>
                    </div>
                    <div className="row-end">
                      <span className="muted small">{job.clipCount} clip(s)</span>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No captures yet">Start one from a live stream or a local test video.</EmptyState>}
        </Card>
      </div>

      <Card title="Latest clips" actions={<Link to="/clips" className="link">All clips →</Link>}>
        <ErrorBanner error={clips.error} />
        {clips.loading && !clips.data ? <Spinner /> : clips.data?.items?.length ? (
          <div className="clip-grid">{clips.data.items.map((c) => <ClipCard key={c._id} clip={c} />)}</div>
        ) : <EmptyState title="No clips yet">Rendered highlights appear here for review.</EmptyState>}
      </Card>
    </>
  );
}
