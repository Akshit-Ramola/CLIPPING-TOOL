import { useState } from "react";
import { rendersApi } from "../api/index.js";
import { useAsync } from "../hooks/useAsync.js";
import { useInterval } from "../hooks/useInterval.js";
import { Card, EmptyState, ErrorBanner, Field, PageHeader, ProgressBar, Spinner, StatusBadge } from "../components/ui.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatBytes, formatRelative } from "../utils/format.js";

const DEFAULTS = { style: "bold", fps: 30, streamerVolume: 1, gameplayVolume: 0.35 };

function RenderRow({ render, onDelete }) {
  const active = render.status === "queued" || render.status === "running";
  return (
    <li className="render-row">
      <div className="render-head">
        <div>
          <strong>{render.facecamName} + {render.gameplayName}</strong>
          <div className="muted small">
            {render.captionsName ? `captions: ${render.captionsName} · ` : "no captions · "}
            {render.options?.style} · {render.options?.fps} fps · {formatRelative(render.createdAt)}
          </div>
        </div>
        <StatusBadge status={render.status} />
      </div>
      {active && (
        <>
          <ProgressBar value={render.progress} />
          <span className="muted small">{render.message}</span>
        </>
      )}
      {render.status === "failed" && <div className="alert alert-bad small">{render.error}</div>}
      {render.status === "completed" && (
        <div className="render-done">
          <video src={render.outputUrl} controls preload="metadata" className="render-video" />
          <div className="stack-sm">
            <span className="muted small">1080×1920 H.264 · {formatBytes(render.outputBytes)}</span>
            <a href={render.outputUrl} className="btn btn-small" download>Download MP4</a>
          </div>
        </div>
      )}
      {!active && <button type="button" className="link small" onClick={() => onDelete(render._id)}>Delete render and its files</button>}
    </li>
  );
}

export default function ManualRender() {
  const toast = useToast();
  const [files, setFiles] = useState({ facecam: null, gameplay: null, captions: null });
  const [options, setOptions] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState(null);
  const renders = useAsync(() => rendersApi.list({ limit: 20 }), []);
  const hasActive = renders.data?.items?.some((r) => r.status === "queued" || r.status === "running");
  useInterval(() => renders.reload({ silent: true }), hasActive ? 1500 : null);

  const setFile = (key) => (e) => setFiles({ ...files, [key]: e.target.files?.[0] || null });
  const setOpt = (key) => (e) => setOptions({ ...options, [key]: e.target.type === "range" || key === "fps" ? Number(e.target.value) : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await rendersApi.create({ ...files, options }, (ev) => setUpload(ev.total ? ev.loaded / ev.total : null));
      toast.success("Render started.");
      renders.reload({ silent: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setUpload(null);
    }
  };

  const remove = async (id) => {
    try {
      await rendersApi.remove(id);
      renders.reload({ silent: true });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Manual render"
        subtitle="Combine a prepared facecam video and gameplay video (plus optional SRT captions) into a 1080×1920 short."
      />
      <div className="grid-2">
        <Card title="Inputs">
          <form className="stack-sm" onSubmit={submit}>
            <Field label="Facecam video" htmlFor="facecam" hint="Top panel (1080×760), centred crop.">
              <input id="facecam" type="file" accept="video/*" required onChange={setFile("facecam")} />
            </Field>
            <Field label="Gameplay video" htmlFor="gameplay" hint="Bottom panel (1080×1160), centred crop.">
              <input id="gameplay" type="file" accept="video/*" required onChange={setFile("gameplay")} />
            </Field>
            <Field label="Captions (.srt, optional)" htmlFor="captions" hint="UTF-8 SRT with times relative to the start of both clips.">
              <input id="captions" type="file" accept=".srt" onChange={setFile("captions")} />
            </Field>
            <div className="grid-2">
              <Field label="Caption style" htmlFor="style">
                <select id="style" value={options.style} onChange={setOpt("style")}>
                  <option value="bold">Bold</option>
                  <option value="clean">Clean</option>
                  <option value="neon">Neon</option>
                </select>
              </Field>
              <Field label="Frame rate" htmlFor="fps">
                <select id="fps" value={options.fps} onChange={setOpt("fps")}>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
              </Field>
            </div>
            <Field label={`Streamer volume: ${options.streamerVolume.toFixed(2)}`} htmlFor="sv">
              <input id="sv" type="range" min="0" max="2" step="0.05" value={options.streamerVolume} onChange={setOpt("streamerVolume")} />
            </Field>
            <Field label={`Gameplay volume: ${options.gameplayVolume.toFixed(2)}`} htmlFor="gv">
              <input id="gv" type="range" min="0" max="2" step="0.05" value={options.gameplayVolume} onChange={setOpt("gameplayVolume")} />
            </Field>
            <p className="muted small">Both videos must start at the same moment. The output ends with the shorter input; nothing is re-synchronised.</p>
            <ErrorBanner error={error} />
            {upload != null && <ProgressBar value={upload} />}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Uploading…" : "Render"}</button>
            </div>
          </form>
        </Card>

        <Card title="Renders">
          <ErrorBanner error={renders.error} />
          {renders.loading && !renders.data ? <Spinner /> : renders.data?.items?.length ? (
            <ul className="render-list">
              {renders.data.items.map((r) => <RenderRow key={r._id} render={r} onDelete={remove} />)}
            </ul>
          ) : <EmptyState title="No renders yet" />}
        </Card>
      </div>
    </>
  );
}
