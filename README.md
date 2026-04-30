# Sense HAT Crypto Correlation Matrix

This project takes your Observable idea and turns it into a full Raspberry Pi workflow:

1. JavaScript fetches Coinbase candle data.
2. It converts prices into hourly log returns.
3. It computes an 8x8 Pearson correlation matrix for 8 cryptocurrencies.
4. It sends 64 RGB pixels to the Raspberry Pi.
5. The Pi shows the matrix on the Sense HAT and uses the joystick to move a white selection cursor.
6. Pressing the joystick scrolls the selected pair and correlation value as text.

## Why I changed the correlation math

Your notebook was correlating raw price levels. For financial time series, that usually overstates relationships because many assets trend together over time. This version correlates returns instead:

- `return = log(currentClose / previousClose)`
- the matrix is built from overlapping timestamps only
- missing values are skipped pairwise

That gives you a more defensible data visualization project.

## Project layout

- `src/cryptoMatrix.js`: shared matrix math and color mapping
- `src/piClient.js`: HTTP client for the Raspberry Pi bridge
- `src/run-matrix.mjs`: Node app that computes and displays the matrix
- `pi/sensehat_server.py`: lightweight HTTP bridge running on the Raspberry Pi
- `observable-notebook.js`: copy-pasteable Observable cells based on your project

## Setup on the Raspberry Pi

Use Raspberry Pi OS with the Sense HAT enabled.

### 1. Install system packages

```bash
sudo apt update
sudo apt install -y python3-sense-hat nodejs npm
```

If `python3-sense-hat` complains or the LED matrix does not work, also run:

```bash
sudo apt install -y sense-hat
sudo reboot
```

### 2. Copy this folder to the Pi

Copy the `sensehat-crypto-matrix` folder to the Pi, for example into:

```bash
/home/pi/sensehat-crypto-matrix
```

### 3. Start the Sense HAT bridge on the Pi

From the project folder on the Pi:

```bash
python3 pi/sensehat_server.py
```

You should see:

```text
Sense HAT server listening on http://0.0.0.0:3000
```

### 4. Start the matrix app

In a second terminal on the Pi:

```bash
npm run display
```

## What the joystick does

- up/down/left/right: move the white selection square
- short press middle: scroll the selected pair, like `BTC/ETH 0.82`
- long press middle (hold ~1 s): cycle the correlation interval — **1 hour → 1 day → 1 week → 1 hour …** — scrolls the new interval name, then fetches and displays fresh data

## Run modes

### Simulate without hardware

```bash
npm run display:simulate
```

This prints the matrix in the terminal without calling the Pi bridge.

### Run once

```bash
npm run display:once
```

This computes the matrix once, sends it to the display, and exits.

### Refresh interval

By default the matrix refreshes every 15 minutes. You can change that:

```bash
node src/run-matrix.mjs --refresh-minutes 5
```

You can also change the candle size:

```bash
node src/run-matrix.mjs --granularity 3600
```

Common Coinbase granularities are:

- `60` for 1 minute
- `300` for 5 minutes
- `900` for 15 minutes
- `3600` for 1 hour
- `21600` for 6 hours
- `86400` for 1 day

## How to connect this back to Observable

If you want to keep presenting from Observable:

1. Start `python3 pi/sensehat_server.py` on the Pi.
2. In Observable, set `PI = "http://YOUR_PI_IP:3000"`.
3. Paste the cells from `observable-notebook.js` into your notebook.
4. Use `pushToHat(correlation, 0)` to draw the matrix.
5. Use your polling cell to read `/joystick` and call `showLabel(...)`.

## Recommended next project improvements

- Add a legend image or printed key next to the Pi so viewers know red vs blue.
- Cache API responses so the project still works if Coinbase rate-limits you.
- Add a small auto-rotation mode that highlights interesting pairs when nobody is touching the joystick.

## Observable notes

Your original notebook already had the right structure:

- `loadCoinbaseCandles`
- `correlation`
- `rdylbu`
- `pushToHat`
- `showLabel`

The biggest fixes were:

- use return correlations instead of raw prices
- align series by timestamp before computing Pearson correlation
- make the Pi endpoint reusable outside the notebook
- separate hardware control from notebook presentation
