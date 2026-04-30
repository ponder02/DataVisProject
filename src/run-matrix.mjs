import { createRequire } from "module";
import {
  DEFAULT_PRODUCTS,
  WEEK_GRANULARITY,
  buildSelectionLabel,
  computeCorrelationMatrix,
  matrixToConsoleTable,
  matrixToPixels
} from "./cryptoMatrix.js";

const GRANULARITY_MODES = [
  { granularity: 3600, label: "1 hour" },
  { granularity: 86400, label: "1 day" },
  { granularity: WEEK_GRANULARITY, label: "1 week" }
];

const LONG_PRESS_MS = 500;
const SCROLL_SPEED = 0.05;
const MESSAGE_COLOR = [100, 200, 255];

function readFlag(name) {
  return process.argv.includes(name);
}

function readOption(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  return process.argv[index + 1];
}

async function main() {
  const granularityArg = readOption("--granularity", process.env.GRANULARITY ?? null);
  const refreshMinutes = Number(readOption("--refresh-minutes", process.env.REFRESH_MINUTES ?? 15));
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

  console.table(matrixToConsoleTable(matrix));
  console.log(`Interval: ${currentMode.label}`);

  if (simulate) {
    console.log("Simulation mode: no hardware calls will be made.");
    if (!once) {
      setInterval(async () => {
        matrix = await computeCorrelationMatrix({
          products: DEFAULT_PRODUCTS,
          granularity: currentMode.granularity
        });
        console.log(`Refreshed at ${new Date().toISOString()} (${currentMode.label})`);
        console.table(matrixToConsoleTable(matrix));
      }, refreshMinutes * 60_000);
    }
    return;
  }

  const require = createRequire(import.meta.url);
  const sense = require("sense-hat-led").sync;
  const Joystick = require("./joystick.cjs");

  let selectedIndex = 0;

  function redraw() {
    sense.setPixels(matrixToPixels(matrix, selectedIndex));
  }

  // Initial display
  redraw();
  sense.showMessage("Crypto correlation matrix", SCROLL_SPEED, MESSAGE_COLOR);
  sense.showMessage(currentMode.label, SCROLL_SPEED, MESSAGE_COLOR);
  redraw();

  if (once) return;

  // Periodic matrix refresh
  setInterval(async () => {
    matrix = await computeCorrelationMatrix({
      products: DEFAULT_PRODUCTS,
      granularity: currentMode.granularity
    });
    console.log(`Refreshed at ${new Date().toISOString()} (${currentMode.label})`);
    console.table(matrixToConsoleTable(matrix));
    redraw();
  }, refreshMinutes * 60_000);

  const joystick = new Joystick();

  // Directional cursor movement
  joystick.on("up", () => {
    if (Math.floor(selectedIndex / 8) > 0) { selectedIndex -= 8; redraw(); }
  });
  joystick.on("down", () => {
    if (Math.floor(selectedIndex / 8) < 7) { selectedIndex += 8; redraw(); }
  });
  joystick.on("left", () => {
    if (selectedIndex % 8 > 0) { selectedIndex -= 1; redraw(); }
  });
  joystick.on("right", () => {
    if (selectedIndex % 8 < 7) { selectedIndex += 1; redraw(); }
  });

  // Enter: short press (release < 500 ms) = show label
  //        long press  (no release within 500 ms) = cycle interval, fetch new data
  let enterPressedAt = null;
  let longPressTimer = null;

  joystick.on("enter", () => {
    enterPressedAt = Date.now();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      enterPressedAt = null;

      modeIndex = (modeIndex + 1) % GRANULARITY_MODES.length;
      currentMode = GRANULARITY_MODES[modeIndex];
      console.log(`Switched to interval: ${currentMode.label}`);
      sense.showMessage(currentMode.label, SCROLL_SPEED, MESSAGE_COLOR);

      computeCorrelationMatrix({ products: DEFAULT_PRODUCTS, granularity: currentMode.granularity })
        .then((m) => {
          matrix = m;
          console.table(matrixToConsoleTable(matrix));
          redraw();
        })
        .catch(console.error);
    }, LONG_PRESS_MS);
  });

  joystick.on("enter-release", () => {
    if (enterPressedAt === null) return; // long press already fired — ignore release
    clearTimeout(longPressTimer);
    longPressTimer = null;
    enterPressedAt = null;
    sense.showMessage(buildSelectionLabel(matrix, selectedIndex), SCROLL_SPEED, MESSAGE_COLOR);
    redraw();
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

