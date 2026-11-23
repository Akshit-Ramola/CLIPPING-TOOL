import { useState } from "react";
import { clipsApi } from "../api/index.js";
import { useAsync } from "../hooks/useAsync.js";
import ClipCard from "../components/ClipCard.jsx";
import { EmptyState, ErrorBanner, PageHeader, Spinner } from "../components/ui.jsx";

const FILTERS = {
  all: {},
  review: { approved: "false", test: "false" },
  approved: { approved: "true" },
  test: { test: "true" },
};
const LIMIT = 24;

export default function Clips() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => clipsApi.list({ ...FILTERS[filter], page, limit: LIMIT }), [filter, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <>
      <PageHeader title="Clips" subtitle="Review every clip's opening, middle and end before approving it for publishing." />
      <div className="tabs" role="tablist">
        {[["all", "All"], ["review", "Needs review"], ["approved", "Approved"], ["test", "Test"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`tab${filter === key ? " active" : ""}`}
            onClick={() => { setFilter(key); setPage(1); }}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorBanner error={error} onRetry={() => reload()} />
      {loading && !data ? <Spinner /> : data?.items?.length ? (
        <>
          <div className="clip-grid">{data.items.map((c) => <ClipCard key={c._id} clip={c} />)}</div>
          {pages > 1 && (
            <div className="pager">
              <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="muted">Page {page} of {pages}</span>
              <button type="button" className="btn btn-small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      ) : <EmptyState title="No clips here" />}
    </>
  );
}
