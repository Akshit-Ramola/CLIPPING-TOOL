// Pre-downloads the optional YOLOX person detector (35 MB) used for player tracking in the "fill" layout.
// Without it, the server downloads it in the background on first use and those first clips use a static crop.
import { downloadPersonModel } from "../src/services/vision/playerTracker.js";
import { PERSON_MODEL } from "../src/config/paths.js";

let last = 0;
try {
  await downloadPersonModel({
    onProgress: (received, total) => {
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      const pct = total ? ` (${((received / total) * 100).toFixed(0)}%)` : "";
      console.log(`  ${(received / 1e6).toFixed(1)} MB${pct}`);
    },
  });
  console.log(`Saved ${PERSON_MODEL}`);
} catch (error) {
  console.error(`Download failed: ${error.message}`);
  process.exitCode = 1;
}
