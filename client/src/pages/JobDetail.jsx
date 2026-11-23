import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { jobsApi } from "../api/index.js";
import { useAsync } from "../hooks/useAsync.js";
import { useInterval } from "../hooks/useInterval.js";
import ClipCard from "../components/ClipCard.jsx";
import LogConsole from "../components/LogConsole.jsx";
import { Card, EmptyState, ErrorBanner, KeyValue, PageHeader, Spinner, StatusBadge } from "../components/ui.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { ACTIVE_JOB_STATUSES, formatDate } from "../utils/format.js";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => jobsApi.get(id), [id]);
  const [busy, setBusy] = useState(false);
  const job = data?.job;
  const active = job && ACTIVE_JOB_STATUSES.has(job.status);
  useInterval(() => reload({ silent: true }), active ? 2000 : null);

  const stop = async () => {
    setBusy(true);
    try {
      await jobsApi.stop(id);
      toast.info("Stopping: the current chunk is finished first.");
      reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await jobsApi.remove(id);
      toast.success("Job deleted. Its clips were kept.");
      navigate("/jobs");
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBanner error={error} onRetry={() => reload()} />;
  if (!job) return null;
  const o = job.options || {};

  return (
    <>
      <PageHeader
        title={job.source?.title || job.url || job.fileName || "Capture job"}
        subtitle={<>{job.source?.streamer || job.sourceType} · <StatusBadge status={job.status} /></>}
        actions={active ? (
          <button type="button" className="btn btn-danger" onClick={stop} disabled={busy || job.status === "stopping"}>
            {job.status === "stopping" ? "Stopping…" : "Stop capture"}
          </button>
        ) : (
          <button type="button" className="btn" onClick={remove} disabled={busy}>Delete job</button>
        )}
      />
      {job.error && <div className="alert alert-bad">{job.error}</div>}

      <div className="grid-2">
        <Card title="Details">
          <KeyValue items={[
            ["Source", job.url ? <a href={job.url} target="_blank" rel="noreferrer" className="link">{job.url}</a> : job.fileName],
            ["Mode", job.test ? "test (clips cannot be published)" : "live"],
            ["Layout", o.layout],
            ["Moment source", o.momentSource],
            ["Language", o.spokenLanguage],
            ["Clip length / lead-in", `${o.clipLen}s / ${o.leadIn}s`],
            ["Chunk / max", `${o.chunk}s / ${o.maxSeconds ? `${o.maxSeconds}s` : "until stopped"}`],
            o.facecamRoi?.length === 4 && ["Facecam ROI", o.facecamRoi.join(" ")],
            ["Live chat", `${job.chat?.source} (${job.chat?.status})${job.chat?.fallbackReason ? ` — ${job.chat.fallbackReason}` : ""}`],
            ["Chunks analysed", job.chunksAnalysed],
            ["Clips rendered", job.clipCount],
            ["Started", formatDate(job.startedAt)],
            ["Finished", formatDate(job.finishedAt)],
          ]} />
        </Card>
        <Card title="Log">
          <LogConsole logs={job.logs} />
        </Card>
      </div>

      <Card title={`Clips from this job (${data.clips.length})`}>
        {data.clips.length ? (
          <div className="clip-grid">{data.clips.map((c) => <ClipCard key={c._id} clip={c} />)}</div>
        ) : (
          <EmptyState title={active ? "No clips yet" : "No clips were rendered"}>
            {active ? "Clips appear after each chunk is analysed." : <>Check the log for skipped moments. <Link to="/capture/new" className="link">Try other options</Link>.</>}
          </EmptyState>
        )}
      </Card>
    </>
  );
}
