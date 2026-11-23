const MAX_MESSAGES = 50_000;

/** Read-only chat collector base: keeps a bounded, time-ordered buffer of {epoch, user, text}. */
export class LiveChatCollector {
  constructor() {
    this.messages = [];
    this.status = "connecting";
    this.error = null;
    this.stopped = false;
  }

  start() {
    this.runPromise = this.run().catch((error) => {
      this.error = error?.name || "Error";
      this.status = "unavailable";
    });
    return this;
  }

  async stop() {
    this.stopped = true;
    this.onStop?.();
    await Promise.race([this.runPromise, new Promise((r) => setTimeout(r, 2000))]);
  }

  messagesBetween(startEpoch, endEpoch) {
    return this.messages.filter((m) => startEpoch <= m.epoch && m.epoch <= endEpoch).map((m) => ({ ...m }));
  }

  discardBefore(epoch) {
    let i = 0;
    while (i < this.messages.length && this.messages[i].epoch < epoch) i += 1;
    if (i) this.messages.splice(0, i);
  }

  add(epoch, user, text, id = null) {
    this.messages.push({ epoch: Number(epoch), user: String(user || "unknown"), text: String(text ?? "").slice(0, 500), id });
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES);
  }

  // eslint-disable-next-line class-methods-use-this
  async run() {
    throw new Error("not implemented");
  }
}
