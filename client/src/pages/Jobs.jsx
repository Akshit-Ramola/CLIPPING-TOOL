import { Link } from "react-router-dom";
import { jobsApi } from "../api/index.js";
import { useAsync } from "../hooks/useAsync.js";
import { useInterval } from "../hooks/useInterval.js";
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge } from "../components/ui.jsx";
import { ACTIVE_JOB_STATUSES, formatDate } from "../utils/format.js";

export default function Jobs() {
  const jobs = useAsync(() => jobsApi.list({ limit: 50 }), []);
  const hasActive = jobs.data?.items?.some((j) => ACTIVE_JOB_STATUSES.has(j.status));
  useInterval(() => jobs.reload({ silent: true }), hasActive ? 4000 : null);

  return (
    <>
      <PageHeader title="Capture jobs" actions={<Link to="/capture/new" className="btn btn-primary">New capture</Link>} />
      <ErrorBanner error={jobs.error} onRetry={() => jobs.reload()} />
      <Card>
        {jobs.loading && !jobs.data ? <Spinner /> : jobs.data?.items?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Source</th><th>Layout</th><th>Chunks</th><th>Clips</th><th>Started</th><th>Status</th></tr>
              </thead>
              <tbody>
                {jobs.data.items.map((job) => (
                  <tr key={job._id}>
                    <td>
                      <Link to={`/jobs/${job._id}`} className="link">{job.source?.title || job.url || job.fileName}</Link>
                      <div className="muted small">{job.source?.streamer || job.sourceType}{job.test ? " · test" : ""}</div>
                    </td>
                    <td>{job.options?.layout}</td>
                    <td>{job.chunksAnalysed}</td>
                    <td>{job.clipCount}</td>
                    <td className="small">{formatDate(job.createdAt)}</td>
                    <td><StatusBadge status={job.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No capture jobs yet" />}
      </Card>
    </>
  );
}
