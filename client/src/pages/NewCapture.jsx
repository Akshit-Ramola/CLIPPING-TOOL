import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { jobsApi } from "../api/index.js";
import CaptureOptions, { DEFAULT_OPTIONS, toApiOptions } from "../components/CaptureOptions.jsx";
import { Card, ErrorBanner, Field, PageHeader, ProgressBar } from "../components/ui.jsx";
import { useToast } from "../context/ToastContext.jsx";

export default function NewCapture() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState(params.get("url") || "");
  const [file, setFile] = useState(null);
  const [testUrl, setTestUrl] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setError] = useState(null);

  const isTest = mode === "file" || testUrl;
  const needsConfirmation = mode === "url" && !testUrl;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = toApiOptions(options, confirmed);
      const { job } = mode === "url"
        ? await jobsApi.createFromUrl({ url, test: testUrl, options: payload })
        : await jobsApi.createFromFile(file, payload, (ev) => setUploadProgress(ev.total ? ev.loaded / ev.total : null));
      toast.success("Capture started.");
      navigate(`/jobs/${job._id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  return (
    <>
      <PageHeader title="New capture" subtitle="Record a source in chunks, score highlight moments and render the best ones as 1080×1920 clips." />
      <form onSubmit={submit} className="stack-lg">
        <Card title="Source">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "url"} className={`tab${mode === "url" ? " active" : ""}`} onClick={() => setMode("url")}>
              Live stream URL
            </button>
            <button type="button" role="tab" aria-selected={mode === "file"} className={`tab${mode === "file" ? " active" : ""}`} onClick={() => setMode("file")}>
              Local test video
            </button>
          </div>

          {mode === "url" ? (
            <div className="stack-sm">
              <Field label="Stream URL" htmlFor="url" hint="YouTube or Twitch live stream.">
                <input id="url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=VIDEO_ID" />
              </Field>
              <label className="check">
                <input type="checkbox" checked={testUrl} onChange={(e) => setTestUrl(e.target.checked)} />
                <span>Test mode: allow a non-live video, write clips to the test folder (test clips can never be published)</span>
              </label>
            </div>
          ) : (
            <Field label="Video file" htmlFor="file" hint="Always processed in test mode. No live chat is available for files.">
              <input id="file" type="file" accept="video/*,.ts,.mkv" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Field>
          )}
        </Card>

        <Card title="Options">
          <CaptureOptions value={options} onChange={setOptions} isTest={isTest} />
        </Card>

        {needsConfirmation && (
          <Card className="card-warn">
            <label className="check">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                <strong>I opened this stream and confirmed actual GTA gameplay is visible</strong>, and the source is allowed by my rights
                policy. A GTA title, thumbnail or facecam alone is not gameplay.
              </span>
            </label>
          </Card>
        )}

        <ErrorBanner error={error} />
        {uploadProgress != null && <ProgressBar value={uploadProgress} />}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || (needsConfirmation && !confirmed) || (mode === "file" && !file)}>
            {busy ? (mode === "file" ? "Uploading…" : "Starting…") : "Start capture"}
          </button>
        </div>
      </form>
    </>
  );
}
