export const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });

/** A promise-based mutex so heavy CPU work (Whisper, ONNX) runs one job at a time. */
export class Mutex {
  #tail = Promise.resolve();

  run(task) {
    const result = this.#tail.then(task, task);
    this.#tail = result.catch(() => {});
    return result;
  }
}

export const analysisLock = new Mutex();
