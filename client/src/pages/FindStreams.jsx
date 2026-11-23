import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { streamsApi } from "../api/index.js";
import { Card, EmptyState, ErrorBanner, PageHeader, Spinner } from "../components/ui.jsx";
import { formatRelative } from "../utils/format.js";

export default function FindStreams() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("GTA 6 gameplay");
  const [max, setMax] = useState(25);
  const [state, setState] = useState({ loading: false, error: null, results: null });

  const search = async (e) => {
    e.preventDefault();
    setState({ loading: true, error: null, results: null });
    try {
      const res = await streamsApi.search(query, max);
      setState({ loading: false, error: null, results: res.streams });
    } catch (error) {
      setState({ loading: false, error, results: null });
    }
  };

  return (
    <>
      <PageHeader
        title="Find live streams"
        subtitle="YouTube search results are candidates, ordered by YouTube's view-count signal, not current live viewers."
      />
      <Card>
        <form className="search-form" onSubmit={search}>
          <input aria-label="Search query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="GTA 6 gameplay" required />
          <select aria-label="Number of results" value={max} onChange={(e) => setMax(Number(e.target.value))}>
            {[10, 25, 50].map((n) => <option key={n} value={n}>{n} results</option>)}
          </select>
          <button type="submit" className="btn btn-primary" disabled={state.loading}>{state.loading ? "Searching…" : "Search"}</button>
        </form>
        <p className="muted small">
          Open each stream and confirm visible GTA gameplay and that the creator/source is permitted by your rights policy before capturing.
        </p>
      </Card>

      <ErrorBanner error={state.error} />
      {state.loading && <Spinner label="Searching live streams…" />}
      {state.results && (state.results.length === 0 ? (
        <EmptyState title="No live results found">Try another search phrase.</EmptyState>
      ) : (
        <div className="stream-list">
          {state.results.map((s, i) => (
            <article key={s.videoId} className="stream-row">
              <span className="stream-rank">#{i + 1}</span>
              {s.thumbnail && <img src={s.thumbnail} alt="" className="stream-thumb" loading="lazy" />}
              <div className="stream-info">
                <strong>{s.title}</strong>
                <span className="muted small">{s.channel} · live since {formatRelative(s.publishedAt)}</span>
                <a href={s.url} target="_blank" rel="noreferrer" className="link small">Open on YouTube ↗</a>
              </div>
              <button type="button" className="btn" onClick={() => navigate(`/capture/new?url=${encodeURIComponent(s.url)}`)}>
                Clip this stream
              </button>
            </article>
          ))}
        </div>
      ))}
    </>
  );
}
