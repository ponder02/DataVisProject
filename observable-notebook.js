// Paste these cells into Observable if you want to keep working there.

products = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD", "ADA-USD", "DOGE-USD", "AVAX-USD", "LINK-USD"]

shortLabels = Object.fromEntries(products.map((product) => [product, product.split("-")[0]]))

PI = "http://raspberrypi.local:3000"

loadCoinbaseCandles = async function loadCoinbaseCandles(product, granularity = 3600) {
  const url = new URL(`https://api.exchange.coinbase.com/products/${product}/candles`);
  url.searchParams.set("granularity", String(granularity));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Coinbase request failed for ${product}`);

  const raw = await response.json();
  return raw
    .map((row) => ({
      product,
      timestamp: new Date(row[0] * 1000).toISOString(),
      close: Number(row[4])
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

toReturns = function toReturns(candles) {
  const returns = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    if (!Number.isFinite(previous.close) || !Number.isFinite(current.close) || previous.close <= 0) continue;
    returns.push({
      timestamp: current.timestamp,
      value: Math.log(current.close / previous.close)
    });
  }
  return returns;
}

pearson = function pearson(xs, ys) {
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

  return denominatorX === 0 || denominatorY === 0 ? 0 : numerator / Math.sqrt(denominatorX * denominatorY);
}

correlation = {
  const allCandles = await Promise.all(products.map((product) => loadCoinbaseCandles(product)));
  const returnsByProduct = new Map(allCandles.map((candles) => [candles[0]?.product, toReturns(candles)]));

  const pairwiseCorrelation = (seriesA, seriesB) => {
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
  };

  const matrix = [];
  for (const a of products) {
    for (const b of products) {
      matrix.push({
        a,
        b,
        correlation: pairwiseCorrelation(returnsByProduct.get(a) ?? [], returnsByProduct.get(b) ?? [])
      });
    }
  }
  return matrix;
}

rdylbu = function rdylbu(value) {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  const t = (clamped + 1) / 2;
  const stops = [
    [0.0, [215, 48, 39]],
    [0.25, [252, 141, 89]],
    [0.4, [254, 224, 144]],
    [0.5, [255, 255, 191]],
    [0.6, [224, 243, 248]],
    [0.75, [145, 191, 219]],
    [1.0, [69, 117, 180]]
  ];

  for (let index = 1; index < stops.length; index += 1) {
    const [t0, c0] = stops[index - 1];
    const [t1, c1] = stops[index];
    if (t <= t1) {
      const fraction = (t - t0) / (t1 - t0);
      return c0.map((channel, channelIndex) => Math.round(channel + (c1[channelIndex] - channel) * fraction));
    }
  }

  return stops[stops.length - 1][1];
}

pushToHat = async function pushToHat(correlations, selected = null) {
  const pixels = correlations.map(({ correlation }, index) => {
    if (selected !== null && index === selected) return [255, 255, 255];
    return rdylbu(correlation);
  });

  await fetch(`${PI}/pixels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pixels })
  });
}

showLabel = async function showLabel(correlations, index) {
  const row = Math.floor(index / 8);
  const column = index % 8;
  const item = correlations[index];
  const text = `${shortLabels[products[row]]}/${shortLabels[products[column]]} ${item.correlation.toFixed(2)}`;

  await fetch(`${PI}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, colour: [100, 200, 255] })
  });
}
