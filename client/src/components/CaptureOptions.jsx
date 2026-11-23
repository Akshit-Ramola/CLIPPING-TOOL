import { Field } from "./ui.jsx";

export const DEFAULT_OPTIONS = {
  layout: "stack",
  momentSource: "combined",
  spokenLanguage: "auto",
  clipLen: 30,
  leadIn: 6,
  top: 1,
  chunk: 90,
  maxSeconds: 0,
  minScore: 2.5,
  keepMinutes: 30,
  useFacecamRoi: false,
  facecamRoi: [0, 288, 260, 148],
};

const LAYOUTS = {
  stack: "Facecam above gameplay (detects a stable edge webcam; skips the clip if none is found)",
  fill: "Gameplay-only 9:16 crop that follows the player",
  fit: "Full source over a blurred background (legacy look)",
};

/** Form controls for every capture option of the original `live` command. */
export default function CaptureOptions({ value, onChange, isTest }) {
  const set = (key) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.type === "number" ? e.target.valueAsNumber : e.target.value;
    onChange({ ...value, [key]: v });
  };
  const setRoi = (index) => (e) => {
    const roi = [...value.facecamRoi];
    roi[index] = e.target.valueAsNumber;
    onChange({ ...value, facecamRoi: roi });
  };

  return (
    <div className="stack-lg">
      <Field label="Layout" htmlFor="layout" hint={LAYOUTS[value.layout]}>
        <select id="layout" value={value.layout} onChange={set("layout")}>
          <option value="stack">Stack (default)</option>
          <option value="fill">Fill</option>
          <option value="fit">Fit</option>
        </select>
      </Field>

      <div className="grid-3">
        <Field label="Moment source" htmlFor="momentSource" hint={isTest ? "Test inputs have no chat; audio/speech is used." : "Chat falls back to audio/speech when quiet."}>
          <select id="momentSource" value={value.momentSource} onChange={set("momentSource")}>
            <option value="combined">Combined (chat + audio)</option>
            <option value="chat">Chat reactions</option>
            <option value="audio">Audio / speech only</option>
          </select>
        </Field>
        <Field label="Spoken language" htmlFor="spokenLanguage" hint="Hindi becomes romanized Hinglish captions.">
          <select id="spokenLanguage" value={value.spokenLanguage} onChange={set("spokenLanguage")}>
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </Field>
        <Field label="Clips per chunk" htmlFor="top">
          <input id="top" type="number" min="1" max="10" value={value.top} onChange={set("top")} />
        </Field>
      </div>

      <div className="grid-3">
        <Field label="Clip length (s)" htmlFor="clipLen">
          <input id="clipLen" type="number" min="1" max="600" value={value.clipLen} onChange={set("clipLen")} />
        </Field>
        <Field label="Lead-in (s)" htmlFor="leadIn" hint="Seconds before the detected moment.">
          <input id="leadIn" type="number" min="0" max="120" step="0.5" value={value.leadIn} onChange={set("leadIn")} />
        </Field>
        <Field label="Minimum score" htmlFor="minScore">
          <input id="minScore" type="number" step="0.1" value={value.minScore} onChange={set("minScore")} />
        </Field>
      </div>

      <details className="advanced">
        <summary>Advanced</summary>
        <div className="grid-3">
          <Field label="Chunk length (s)" htmlFor="chunk">
            <input id="chunk" type="number" min="10" max="3600" value={value.chunk} onChange={set("chunk")} />
          </Field>
          <Field label="Max capture (s)" htmlFor="maxSeconds" hint="0 = until you stop it.">
            <input id="maxSeconds" type="number" min="0" value={value.maxSeconds} onChange={set("maxSeconds")} />
          </Field>
          <Field label="Keep chunks (min)" htmlFor="keepMinutes">
            <input id="keepMinutes" type="number" min="1" value={value.keepMinutes} onChange={set("keepMinutes")} />
          </Field>
        </div>

        {value.layout === "stack" && (
          <div className="stack-sm">
            <label className="check">
              <input type="checkbox" checked={value.useFacecamRoi} onChange={set("useFacecamRoi")} />
              <span>Use a measured webcam rectangle instead of auto-detection</span>
            </label>
            {value.useFacecamRoi && (
              <>
                <div className="grid-4">
                  {["X", "Y", "Width", "Height"].map((label, i) => (
                    <Field key={label} label={label} htmlFor={`roi-${i}`}>
                      <input id={`roi-${i}`} type="number" min={i < 2 ? 0 : 2} step="2" value={value.facecamRoi[i]} onChange={setRoi(i)} />
                    </Field>
                  ))}
                </div>
                <small className="muted">Source pixels, even values. Example: 0 288 260 148 is a webcam on the left side of a 1280×720 frame.</small>
              </>
            )}
          </div>
        )}
      </details>
    </div>
  );
}

/** Convert form state into the API's options payload. */
export function toApiOptions(form, gameplayConfirmed) {
  const { useFacecamRoi, facecamRoi, ...rest } = form;
  return {
    ...rest,
    facecamRoi: useFacecamRoi && form.layout === "stack" ? facecamRoi : null,
    gameplayConfirmed,
  };
}
