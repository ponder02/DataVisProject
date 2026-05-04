import { scaleSequential } from "d3-scale";
import { interpolateRainbow } from "d3-scale-chromatic";
import { rgb } from "d3-color";

export const DEFAULT_PRODUCTS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "XRP-USD",
  "ADA-USD",
  "DOGE-USD",
  "AVAX-USD",
  "LINK-USD"
];

export const SHORT_LABELS = Object.fromEntries(
  DEFAULT_PRODUCTS.map((product) => [product, product.split("-")[0]])
);

export const WEEK_GRANULARITY = "week";

function resampleToWeekly(candles) {
  const weekMap = new Map();
  for (const candle of candles) {
    const date = new Date(candle.timestamp);
    const daysToMonday = (date.getUTCDay() + 6) % 7;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - daysToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    weekMap.set(monday.toISOString(), candle.close);
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([timestamp, close]) => ({ product: candles[0]?.product, timestamp, close }));
}

export async function loadCoinbaseCandles(product, granularity = 3600) {
  const url = new URL(`https://api.exchange.coinbase.com/products/${product}/candles`);
  url.searchParams.set("granularity", String(granularity));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Coinbase request failed for ${product}: ${response.status} ${response.statusText}`);
  }

  const raw = await response.json();
  return raw
    .map((row) => ({
      product,
      timestamp: new Date(row[0] * 1000).toISOString(),
      close: Number(row[4])
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function seriesToReturns(candles) {
  const returns = [];

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];

    if (!Number.isFinite(previous.close) || !Number.isFinite(current.close) || previous.close <= 0) {
      continue;
    }

    returns.push({
      timestamp: current.timestamp,
      value: Math.log(current.close / previous.close)
    });
  }

  return returns;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominatorX = 0;
  let denominatorY = 0;

  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    numerator += dx * dy;
    denominatorX += dx * dx;
    denominatorY += dy * dy;
  }

  if (denominatorX === 0 || denominatorY === 0) return 0;
  return numerator / Math.sqrt(denominatorX * denominatorY);
}

function pairwiseCorrelation(seriesA, seriesB) {
  const mapB = new Map(seriesB.map((entry) => [entry.timestamp, entry.value]));
  const xs = [];
  const ys = [];

  for (const entry of seriesA) {
    const valueB = mapB.get(entry.timestamp);
    if (!Number.isFinite(entry.value) || !Number.isFinite(valueB)) continue;
    xs.push(entry.value);
    ys.push(valueB);
  }

  return pearson(xs, ys);
}

export async function computeCorrelationMatrix({
  products = DEFAULT_PRODUCTS,
  granularity = 3600
} = {}) {
  const fetchGranularity = granularity === WEEK_GRANULARITY ? 86400 : granularity;
  const candlesByProduct = await Promise.all(
    products.map((product) => loadCoinbaseCandles(product, fetchGranularity))
  );

  const processedByProduct =
    granularity === WEEK_GRANULARITY
      ? candlesByProduct.map(resampleToWeekly)
      : candlesByProduct;

  const returnsByProduct = new Map(
    processedByProduct.map((candles) => [candles[0]?.product, seriesToReturns(candles)])
  );

  const matrix = [];
  for (const rowProduct of products) {
    for (const columnProduct of products) {
      matrix.push({
        a: rowProduct,
        b: columnProduct,
        correlation: pairwiseCorrelation(
          returnsByProduct.get(rowProduct) ?? [],
          returnsByProduct.get(columnProduct) ?? []
        )
      });
    }
  }

  return matrix;
}

import { scaleLinear } from "d3-scale";


const redGreenScale = scaleLinear()
  .domain([0.7, 0.85, 0.99])
  .range(["#ff0000", "#ffff00", "#00ff00"])
  .clamp(true);


export function rdylbu(value) {
  const safeValue = Number.isFinite(value) ? value : 0.85;

  if (safeValue >= 1) {
    return [0, 0, 0];
  }

  const color = rgb(redGreenScale(safeValue));
  return [color.r, color.g, color.b];
}



export function matrixToPixels(matrix, selectedIndex = null) {
  return matrix.map(({ correlation }, index) => {
    if (selectedIndex !== null && index === selectedIndex) {
      return [255, 255, 255];
    }
    return rdylbu(correlation);
  });
}

export function buildSelectionLabel(matrix, index, products = DEFAULT_PRODUCTS) {
  const row = Math.floor(index / 8);
  const column = index % 8;
  const item = matrix[index];

  if (!item) {
    return "No selection";
  }

  const rowLabel = SHORT_LABELS[products[row]] ?? products[row] ?? item.a;
  const columnLabel = SHORT_LABELS[products[column]] ?? products[column] ?? item.b;
  return `${rowLabel}/${columnLabel} ${item.correlation.toFixed(2)}`;
}

export function matrixToConsoleTable(matrix) {
  const rows = [];
  for (let row = 0; row < 8; row += 1) {
    const entry = {};
    for (let column = 0; column < 8; column += 1) {
      const cell = matrix[row * 8 + column];
      entry[SHORT_LABELS[cell.b] ?? cell.b] = Number(cell.correlation.toFixed(3));
    }
    entry.asset = SHORT_LABELS[matrix[row * 8].a] ?? matrix[row * 8].a;
    rows.push(entry);
  }
  return rows;
}
