import {
  DEFAULT_PRODUCTS,
  WEEK_GRANULARITY,
  buildSelectionLabel,
  computeCorrelationMatrix,
  matrixToConsoleTable,
  matrixToPixels
} from "./cryptoMatrix.js";
import { getJoystickEvent, postPixels, showMessage } from "./piClient.js";

async function drainJoystickQueue(piUrl) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const event = await getJoystickEvent(piUrl);
    if (event === null) break;
  }
}

const GRANULARITY_MODES = [
  { granularity: 3600, label: "1 hour" },
  { granularity: 86400, label: "1 day" },
  { granularity: WEEK_GRANULARITY, label: "1 week" }
];

const LONG_PRESS_MS = 500;

function readFlag(name) {
  return process.argv.includes(name);
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

async function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const piUrl = readOption("--pi-url", process.env.PI_URL ?? "http://127.0.0.1:3000");
  const granularityArg = readOption("--granularity", process.env.GRANULARITY ?? null);
  const refreshMinutes = Number(readOption("--refresh-minutes", process.env.REFRESH_MINUTES ?? 15));
  const pollMilliseconds = Number(readOption("--poll-ms", process.env.POLL_MS ?? 120));
  const simulate = readFlag("--simulate");
  const once = readFlag("--once");

  let modeIndex = 0;
  if (granularityArg !== null) {
    const found = GRANULARITY_MODES.findIndex((m) => String(m.granularity) === granularityArg);
    if (found !== -1) modeIndex = found;
  }
  let currentMode = GRANULARITY_MODES[modeIndex];

  let matrix = await computeCorrelationMatrix({
    products: DEFAULT_PRODUCTS,
    granularity: currentMode.granularity
  });

  let selectedIndex = 0;
  let nextRefreshAt = Date.now() + refreshMinutes * 60_000;
  let middlePressedAt = null;
  let dirty = false;

  console.table(matrixToConsoleTable(matrix));
  console.log(`Interval: ${currentMode.label}`);

  if (simulate) {
    console.log("Simulation mode enabled. No pixels will be sent to a Raspberry Pi.");
  } else {
    await postPixels(piUrl, matrixToPixels(matrix, selectedIndex));
    await showMessage(piUrl, "Crypto correlation matrix");
    await showMessage(piUrl, currentMode.label);
    await drainJoystickQueue(piUrl);
    await postPixels(piUrl, matrixToPixels(matrix, selectedIndex));
  }

  if (once) {
    return;
  }

  while (true) {
    if (Date.now() >= nextRefreshAt) {
      matrix = await computeCorrelationMatrix({
        products: DEFAULT_PRODUCTS,
        granularity: currentMode.granularity
      });
      nextRefreshAt = Date.now() + refreshMinutes * 60_000;

      console.log(`Refreshed matrix at ${new Date().toISOString()} (${currentMode.label})`);
      console.table(matrixToConsoleTable(matrix));
      dirty = true;
    }

    if (!simulate) {
      const event = await getJoystickEvent(piUrl);

      if (event?.direction === "middle") {
        if (event.action === "pressed") {
          middlePressedAt = event.timestamp;
        } else if (event.action === "held" && middlePressedAt !== null) {
          const elapsed = (event.timestamp - middlePressedAt) * 1000;
          if (elapsed >= LONG_PRESS_MS) {
            middlePressedAt = null;
            modeIndex = (modeIndex + 1) % GRANULARITY_MODES.length;
            currentMode = GRANULARITY_MODES[modeIndex];
            console.log(`Switched to interval: ${currentMode.label}`);
            await showMessage(piUrl, currentMode.label);
            await drainJoystickQueue(piUrl);
            matrix = await computeCorrelationMatrix({
              products: DEFAULT_PRODUCTS,
              granularity: currentMode.granularity
            });
            await drainJoystickQueue(piUrl);
            nextRefreshAt = Date.now() + refreshMinutes * 60_000;
            console.table(matrixToConsoleTable(matrix));
            dirty = true;
          }
        } else if (event.action === "released") {
          if (middlePressedAt !== null) {
            middlePressedAt = null;
            await showMessage(piUrl, buildSelectionLabel(matrix, selectedIndex));
            await drainJoystickQueue(piUrl);
            dirty = true;
          }
          // if middlePressedAt is null, long-press already fired — ignore release
        }
      } else if (event && event.action !== "released") {
        const row = Math.floor(selectedIndex / 8);
        const column = selectedIndex % 8;

        if (event.direction === "up" && row > 0) { selectedIndex -= 8; dirty = true; }
        if (event.direction === "down" && row < 7) { selectedIndex += 8; dirty = true; }
        if (event.direction === "left" && column > 0) { selectedIndex -= 1; dirty = true; }
        if (event.direction === "right" && column < 7) { selectedIndex += 1; dirty = true; }
      }

      if (dirty) {
        await postPixels(piUrl, matrixToPixels(matrix, selectedIndex));
        dirty = false;
      }
    }

    await sleep(pollMilliseconds);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
