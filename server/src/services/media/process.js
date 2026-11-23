import { spawn } from "node:child_process";

/**
 * Run a command to completion and collect its output (like Python's subprocess.run(capture_output=True)).
 * `binary: true` returns stdout as a Buffer (for raw PCM / raw video frames).
 */
export function run(command, args, { cwd, binary = false, timeoutMs = 0, signal } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, windowsHide: true, signal });
    } catch (error) {
      resolve({ code: -1, stdout: binary ? Buffer.alloc(0) : "", stderr: String(error.message || error) });
      return;
    }
    const out = [];
    const err = [];
    let timer;
    if (timeoutMs > 0) timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => err.push(Buffer.from(String(error.message || error))));
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out);
      resolve({
        code: code ?? -1,
        stdout: binary ? stdout : stdout.toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

export const tail = (text, length = 400) => String(text || "").slice(-length);
