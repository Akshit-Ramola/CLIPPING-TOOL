import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { clipsApi } from "../api/index.js";
import { useAsync } from "../hooks/useAsync.js";
import { Card, ErrorBanner, Field, KeyValue, PageHeader, Spinner, StatusBadge } from "../components/ui.jsx";
import { useToast } from "../context/ToastContext.jsx";
import { formatDate, toIsoWithOffset } from "../utils/format.js";

const toForm = (clip) => ({
  title: clip.title || "",
  youtubeDescription: clip.youtubeDescription || "",
  instagramCaption: clip.instagramCaption || "",
  hashtags: (clip.hashtags || []).join(" "),
});

function MetadataForm({ clip, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(toForm(clip));
  const [saving, setSaving] = useState(false);
  const locked = Boolean(clip.zernio?.postId);
  useEffect(() => setForm(toForm(clip)), [clip]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const save = async (extra = {}) => {
    setSaving(true);
    try {
      const body = {
        title: form.title.trim() || null,
        youtubeDescription: form.youtubeDescription.trim() || null,
        instagramCaption: form.instagramCaption.trim() || null,
        hashtags: form.hashtags.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean),
        ...extra,
      };
      const res = await clipsApi.update(clip._id, body);
      onSaved(res.clip);
      toast.success(extra.approved === true ? "Saved and approved." : extra.approved === false ? "Approval removed." : "Metadata saved.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Field label="Title" htmlFor="title" hint={`${form.title.length}/100 used on YouTube`}>
        <input id="title" value={form.title} onChange={set("title")} disabled={locked} maxLength={200} />
      </Field>
      <Field label="YouTube description" htmlFor="ytd">
        <textarea id="ytd" rows={4} value={form.youtubeDescription} onChange={set("youtubeDescription")} disabled={locked} />
      </Field>
      <Field label="Instagram caption" htmlFor="igc">
        <textarea id="igc" rows={4} value={form.instagramCaption} onChange={set("instagramCaption")} disabled={locked} />
      </Field>
      <Field label="Hashtags" htmlFor="tags" hint="Separate with spaces.">
        <input id="tags" value={form.hashtags} onChange={set("hashtags")} disabled={locked} placeholder="#gta6 #gaming" />
      </Field>
      {!locked && (
        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>Save</button>
          {clip.approved ? (
            <button type="button" className="btn" disabled={saving} onClick={() => save({ approved: false })}>Remove approval</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saving || clip.test} onClick={() => save({ approved: true })} title={clip.test ? "Test clips cannot be published" : ""}>
              Save &amp; approve
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function PublishPanel({ clip, onUpdated }) {
  const toast = useToast();
  const [when, setWhen] = useState("");
  const [now, setNow] = useState(false);
  const [unattended, setUnattended] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (clip.zernio?.postId) {
    return (
      <KeyValue items={[
        ["Zernio post", clip.zernio.postId],
        ["Status", clip.zernio.status],
        ["Scheduled for", clip.zernio.scheduledFor],
      ]} />
    );
  }

  const send = async (publish) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = { now, unattended, publish, ...(now ? {} : when ? { scheduledFor: toIsoWithOffset(when) } : {}) };
      const res = await clipsApi.publish(clip._id, body);
      setResult(res);
      if (!res.dryRun) {
        toast.success(res.message);
        onUpdated(res.clip);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="stack-sm">
      <p className="muted small">Always run a dry run first. Publishing uploads the MP4 to Zernio and schedules it on the configured accounts.</p>
      <Field label="Schedule for (your local time)" htmlFor="when">
        <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={now} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={now} onChange={(e) => setNow(e.target.checked)} disabled={unattended} />
        <span>Publish immediately instead of scheduling</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={unattended} onChange={(e) => { setUnattended(e.target.checked); if (e.target.checked) setNow(false); }} />
        <span>Unattended (needs GTA_UNATTENDED_POSTS=1; future schedule only)</span>
      </label>
      <ErrorBanner error={error} />
      {result && <div className={`alert ${result.dryRun ? "alert-info" : "alert-ok"}`}><code>{result.plan}</code><div>{result.message}</div></div>}
      <div className="form-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => send(false)}>Dry run</button>
        {confirming ? (
          <>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => send(true)}>{busy ? "Sending…" : "Confirm: send to Zernio"}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || clip.test || (!now && !when)} onClick={() => setConfirming(true)}>Publish…</button>
        )}
      </div>
    </div>
  );
}

export default function ClipDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => clipsApi.get(id), [id]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const clip = data?.clip;
  const setClip = (next) => setData((d) => ({ ...d, clip: next }));

  const remove = async () => {
    try {
      await clipsApi.remove(id);
      toast.success("Clip deleted.");
      navigate("/clips");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBanner error={error} onRetry={() => reload()} />;
  if (!clip) return null;

  return (
    <>
      <PageHeader
        title={clip.title || clip.name}
        subtitle={<>
          {clip.streamer} · score {clip.score} · {formatDate(clip.createdAt)}{" "}
          {clip.test && <StatusBadge status="test">test</StatusBadge>}{" "}
          <StatusBadge status={clip.approved ? "approved" : "pending"}>{clip.approved ? "approved" : "needs review"}</StatusBadge>
        </>}
        actions={confirmDelete ? (
          <>
            <button type="button" className="btn btn-danger" onClick={remove}>Delete permanently</button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <>
            <a className="btn" href={clip.videoUrl} target="_blank" rel="noreferrer">Open MP4</a>
            <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>Delete</button>
          </>
        )}
      />

      <div className="clip-detail">
        <div className="player-wrap">
          <video className="player" src={clip.videoUrl} controls playsInline preload="metadata" />
        </div>
        <div className="stack-lg">
          <Card title="Publishing metadata"><MetadataForm clip={clip} onSaved={setClip} /></Card>
          <Card title="Schedule with Zernio"><PublishPanel clip={clip} onUpdated={setClip} /></Card>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Transcript">
          <p className="transcript">{clip.transcript || <span className="muted">No timed speech detected.</span>}</p>
          <KeyValue items={[
            ["Spoken language", clip.spokenLanguage],
            ["Caption language", clip.captionLanguage],
            clip.captionFallbackReason && ["Caption note", clip.captionFallbackReason],
            ["Caption position", clip.captionPosition],
          ]} />
        </Card>
        <Card title="Selection & framing">
          <KeyValue items={[
            ["Source", clip.sourceUrl?.startsWith("http") ? <a href={clip.sourceUrl} className="link" target="_blank" rel="noreferrer">{clip.sourceUrl}</a> : clip.sourceUrl],
            ["Stream title", clip.streamTitle],
            ["Credit", clip.credit],
            ["Clip window", `${clip.clipStart?.toFixed?.(2)}s + ${clip.clipLength}s`],
            ["Signals", clip.selectionSignals?.join(", ")],
            ["Moment source", `${clip.momentSourceUsed} (requested ${clip.momentSourceRequested})`],
            ["Live chat", `${clip.liveChatSource} · ${clip.liveChatStatus}${clip.chatFallbackReason ? ` — ${clip.chatFallbackReason}` : ""}`],
            ["Chat activity", `${clip.chatMessageCount} msgs · ${clip.uniqueChatters} chatters · ${clip.reactionChatters} reacting`],
            ["Framing", clip.framing],
            clip.facecamRoi?.length && ["Facecam ROI", clip.facecamRoi.join(" ")],
            clip.gameplayRoi?.length && ["Gameplay ROI", clip.gameplayRoi.join(" ")],
            clip.cropOffset != null && ["Crop offset", clip.cropOffset],
            clip.playerTrack?.length && ["Player track", `${clip.playerTrack.length} keyframes`],
            clip.job && ["Capture job", <Link to={`/jobs/${clip.job}`} className="link">open job</Link>],
          ]} />
        </Card>
      </div>
    </>
  );
}
