import tls from "node:tls";
import { LiveChatCollector } from "./LiveChatCollector.js";

const HOST = "irc.chat.twitch.tv";
const PORT = 6697;

export class TwitchChatCollector extends LiveChatCollector {
  constructor(channel, username, oauthToken) {
    super();
    this.channel = channel.toLowerCase();
    this.username = username.toLowerCase();
    this.oauthToken = oauthToken.replace(/^oauth:/, "").trim();
  }

  run() {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host: HOST, port: PORT, servername: HOST, timeout: 20_000 });
      let buffer = "";
      this.onStop = () => socket.end();
      socket.once("secureConnect", () => {
        socket.setTimeout(0);
        socket.write(`PASS oauth:${this.oauthToken}\r\n`);
        socket.write(`NICK ${this.username}\r\n`);
        socket.write("CAP REQ :twitch.tv/tags\r\n");
        socket.write(`JOIN #${this.channel}\r\n`);
        this.status = "connected";
      });
      socket.on("timeout", () => socket.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
      socket.on("data", (data) => {
        buffer += data.toString("utf8");
        let index;
        while ((index = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (line.startsWith("PING ")) {
            socket.write(`PONG ${line.slice(5)}\r\n`);
            continue;
          }
          this.parseLine(line);
        }
      });
      socket.on("error", reject);
      socket.on("close", () => {
        if (!this.stopped) {
          this.status = "unavailable";
          this.error = "Twitch chat disconnected";
        }
        resolve();
      });
    });
  }

  parseLine(input) {
    let line = input;
    let tags = {};
    if (line.startsWith("@")) {
      const space = line.indexOf(" ");
      const rawTags = line.slice(1, space);
      line = line.slice(space + 1);
      tags = Object.fromEntries(rawTags.split(";").map((part) => {
        const eq = part.indexOf("=");
        return eq >= 0 ? [part.slice(0, eq), part.slice(eq + 1)] : [part, ""];
      }));
    }
    const marker = " PRIVMSG ";
    const at = line.indexOf(marker);
    if (at < 0) return;
    const user = line.slice(0, at).replace(/^:/, "").split("!")[0];
    const rest = line.slice(at + marker.length);
    const colon = rest.indexOf(" :");
    const text = colon >= 0 ? rest.slice(colon + 2) : "";
    const sent = Number.parseFloat(tags["tmi-sent-ts"]);
    const epoch = Number.isFinite(sent) ? sent / 1000 : Date.now() / 1000;
    this.add(epoch, tags["user-id"] || user, text, tags.id || null);
  }
}
