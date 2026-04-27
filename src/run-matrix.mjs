import {
  DEFAULT_PRODUCTS,
  buildSelectionLabel,
  computeCorrelationMatrix,
  matrixToConsoleTable,
  matrixToPixels
} from "./cryptoMatrix.js";
import { getJoystickEvent, postPixels, showMessage } from "./piClient.js";

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
  const piUrl = readOption("--pi-url", process.env.PI_URL ?? "http://raspberrypi.local:3000");
  const granularity = Number(readOption("--granularity", process.env.GRANULARITY ?? 3600));
  const refreshMinutes = Number(readOption("--refresh-minutes", process.env.REFRESH_MINUTES ?? 15));
  const pollMilliseconds = Number(readOption("--poll-ms", process.env.POLL_MS ?? 120));
  const simulate = readFlag("--simulate");
  const once = readFlag("--once");

  let matrix = await computeCorrelationMatrix({
    products: DEFAULT_PRODUCTS,
    granularity
  });

  let selectedIndex = 0;
  let nextRefreshAt = Date.now() + refreshMinutes * 60_000;

  console.table(matrixToConsoleTable(matrix));

  if (simulate) {
    console.log("Simulation mode enabled. No pixels will be sent to a Raspberry Pi.");
  } else {
    await postPixels(piUrl, matrixToPixels(matrix, selectedIndex));
    await showMessage(piUrl, "Crypto matrix ready");
  }

  if (once) {
    return;
  }

  while (true) {
    if (Date.now() >= nextRefreshAt) {
      matrix = await computeCorrelationMatrix({
        products: DEFAULT_PRODUCTS,
        granularity
      });
      nextRefreshAt = Date.now() + refreshMinutes * 60_000;

      console.log(`Refreshed matrix at ${new Date().toISOString()}`);
      console.table(matrixToConsoleTable(matrix));

      if (!simulate) {
        await postPixels(piUrl, matrixToPixels(matrix, selectedIndex));
      }
    }

    if (!simulate) {
      const event = await getJoystickEvent(piUrl);
      if (event?.action === "released") {
        await sleep(pollMilliseconds);
        continue;
      }

      const row = Math.floor(selectedIndex / 8);
      const column = selectedIndex % 8;

      if (event?.direction === "up" && row > 0) selectedIndex -= 8;
      if (event?.direction === "down" && row < 7) selectedIndex += 8;
      if (event?.direction === "left" && column > 0) selectedIndex -= 1;
      if (event?.direction === "right" && column < 7) selectedIndex += 1;

      if (event?.direction === "middle") {
        await showMessage(piUrl, buildSelectionLabel(matrix, selectedIndex));
      }

      await postPixels(piUrl, matrixToPixels(matrix, selectedIndex));
    }

    await sleep(pollMilliseconds);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
