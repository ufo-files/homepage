const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "assets", "entrainment-canvas.svg");
const WIDTH = 1438;
const HEIGHT = 808;
const TAU = Math.PI * 2;
const CARRIER_PAIRS = Object.freeze([
  Object.freeze({ left: 100, right: 104, difference: 4 }),
]);
const SNAPSHOT_TIME = 0.5;
const SCOPE_FRAME_COUNT = 7;
const SCOPE_FRAME_STEP = 1 / 60;
const LIVE_FRAME_TIME = SNAPSHOT_TIME + (SCOPE_FRAME_COUNT - 1) * SCOPE_FRAME_STEP;
const SAMPLE_RATE = 48000;
const PLAYBACK_SECONDS = 2;
const CARRIER_LEVEL = 0.34 / Math.sqrt(CARRIER_PAIRS.length);
const CONTOUR_DEPTH = 0.14;
const PINK_LEVEL = 10 ** (-18 / 20) * 0.34;
const PAN_CYCLE_SECONDS = 24;
const OUTPUT_GAIN = 0.3;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const SCOPE_RADIUS = 170;

function number(value) {
  return Number(value.toFixed(2));
}

function pathData(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${number(point.x)} ${number(point.y)}`)
    .join(" ");
}

function createDeterministicPinkNoise(length, seed = 5213562) {
  const samples = new Float32Array(length);
  let state = seed >>> 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };

  for (let index = 0; index < length; index += 1) {
    const white = random();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    samples[index] = Math.max(-1, Math.min(1, pink * 0.11));
  }
  return samples;
}

function buildPlaybackBuffer() {
  const frameCount = SAMPLE_RATE * PLAYBACK_SECONDS;
  const pink = createDeterministicPinkNoise(frameCount);
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  const lowpassAlpha = 1 - Math.exp((-TAU * 2400) / SAMPLE_RATE);
  let filteredPink = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / SAMPLE_RATE;
    filteredPink += lowpassAlpha * (pink[index] - filteredPink);
    const pan = Math.sin((TAU * time) / PAN_CYCLE_SECONDS) * 0.92;
    const panAngle = ((pan + 1) * Math.PI) / 4;
    const noise = filteredPink * PINK_LEVEL;
    let leftCarrier = 0;
    let rightCarrier = 0;
    for (const pair of CARRIER_PAIRS) {
      const contour = 1 + Math.sin(TAU * pair.difference * time) * CONTOUR_DEPTH;
      leftCarrier += Math.sin(TAU * pair.left * time) * CARRIER_LEVEL * contour;
      rightCarrier += Math.sin(TAU * pair.right * time) * CARRIER_LEVEL * contour;
    }
    left[index] = leftCarrier + noise * Math.cos(panAngle);
    right[index] = rightCarrier + noise * Math.sin(panAngle);
  }
  return { left, right };
}

const PLAYBACK = buildPlaybackBuffer();

function calculateLiveLevels() {
  const start = Math.floor(LIVE_FRAME_TIME * SAMPLE_RATE);
  const length = Math.min(2048, PLAYBACK.left.length - start);
  let leftSquare = 0;
  let rightSquare = 0;
  let differenceSquare = 0;
  let cross = 0;
  for (let index = 0; index < length; index += 1) {
    const left = PLAYBACK.left[start + index];
    const right = PLAYBACK.right[start + index];
    leftSquare += left * left;
    rightSquare += right * right;
    differenceSquare += (left - right) ** 2;
    cross += left * right;
  }
  const dbfs = (square) => 20 * Math.log10(Math.max(1e-9, Math.sqrt(square / length) * OUTPUT_GAIN));
  return Object.freeze({
    left: `${dbfs(leftSquare).toFixed(1)} DBFS`,
    right: `${dbfs(rightSquare).toFixed(1)} DBFS`,
    difference: `${dbfs(differenceSquare).toFixed(1)} DBFS`,
    correlation: (cross / Math.sqrt(leftSquare * rightSquare)).toFixed(2),
  });
}

const LIVE_LEVELS = calculateLiveLevels();

function playbackSample(time, channel) {
  const samples = PLAYBACK[channel];
  const index = Math.max(0, Math.min(samples.length - 1, Math.floor(time * SAMPLE_RATE)));
  return samples[index];
}

function countPlaybackTurns(channel) {
  const windowSeconds = 0.052;
  let turns = 0;
  let previous = playbackSample(LIVE_FRAME_TIME, channel);
  let previousDirection = 0;
  for (let index = 1; index <= 231; index += 1) {
    const sample = playbackSample(LIVE_FRAME_TIME + (index / 231) * windowSeconds, channel);
    const direction = Math.sign(sample - previous);
    if (direction && previousDirection && direction !== previousDirection) turns += 1;
    if (direction) previousDirection = direction;
    previous = sample;
  }
  return turns;
}

function channelPath(startX, endX, channel) {
  const points = [];
  const width = endX - startX;
  const windowSeconds = 0.052;
  let peak = 0;
  for (let x = 0; x <= width; x += 2) {
    const ratio = x / width;
    const envelope = Math.sin(Math.PI * ratio) * 0.2 + 0.8;
    const sample = playbackSample(LIVE_FRAME_TIME + ratio * windowSeconds, channel);
    peak = Math.max(peak, Math.abs(sample));
    points.push({
      x: startX + x,
      sample,
      envelope,
    });
  }
  const gain = peak > 0 ? 25 / peak : 1;
  return pathData(points.map(({ x, sample, envelope }) => ({
    x,
    y: CENTER.y + sample * gain * envelope,
  })));
}

function vectorscopePath(frame) {
  const points = [];
  const samples = 260;
  const windowSeconds = 0.075;
  const frameTime = SNAPSHOT_TIME + frame * SCOPE_FRAME_STEP;
  let peak = 0;

  for (let index = 0; index < samples; index += 1) {
    const time = frameTime + (index / (samples - 1)) * windowSeconds;
    const left = playbackSample(time, "left");
    const right = playbackSample(time, "right");
    const mid = (left + right) / 2;
    const side = (left - right) / 2;
    peak = Math.max(peak, Math.abs(mid), Math.abs(side));
    points.push({ mid, side });
  }

  const gain = peak > 0 ? 0.86 / peak : 1;
  return pathData(points.map(({ mid, side }) => ({
    x: CENTER.x + mid * gain * SCOPE_RADIUS,
    y: CENTER.y - side * gain * SCOPE_RADIUS,
  })));
}

function buildSvg() {
  const gridLines = [127, 220, 313, 406, 499, 592, 685]
    .map((y) => `<line x1="41" y1="${y}" x2="1397" y2="${y}"/>`)
    .join("");
  const scopeHistory = Array.from({ length: SCOPE_FRAME_COUNT }, (_, index) => {
    const recency = (index + 1) / SCOPE_FRAME_COUNT;
    const opacity = number(0.025 + recency * recency * 0.62);
    return `<path d="${vectorscopePath(index)}" opacity="${opacity}"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet" data-state="playing">
  <title>Entrainment reference program playing with live PCM telemetry</title>
  <desc>Deterministic vector snapshot of the active 100 and 104 hertz stereo carriers, differential amplitude contour, filtered pink layer, and fading mid-side vectorscope history.</desc>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f6f5ef"/>
  <g fill="none" stroke="#111" stroke-width="1" stroke-opacity=".075" vector-effect="non-scaling-stroke">${gridLines}</g>
  <g fill="#111" fill-opacity=".58" font-family="SFMono-Regular, SF Mono, ui-monospace, monospace" font-size="10">
    <text x="41" y="130">L  LIVE  ${LIVE_LEVELS.left}</text>
    <text x="1397" y="130" text-anchor="end">R  LIVE  ${LIVE_LEVELS.right}</text>
  </g>
  <g fill="none" stroke="#111" vector-effect="non-scaling-stroke">
    <circle cx="${CENTER.x}" cy="${CENTER.y}" r="${SCOPE_RADIUS}" stroke-opacity=".18"/>
    <path d="M${CENTER.x - SCOPE_RADIUS} ${CENTER.y}H${CENTER.x + SCOPE_RADIUS}M${CENTER.x} ${CENTER.y - SCOPE_RADIUS}V${CENTER.y + SCOPE_RADIUS}" stroke-opacity=".11"/>
    <path d="${channelPath(41, 503, "left")}" stroke-opacity=".76" stroke-width="1.15"/>
    <path d="${channelPath(935, 1397, "right")}" stroke-opacity=".76" stroke-width="1.15"/>
    <g stroke-linejoin="round" stroke-linecap="round" stroke-width="1.05">${scopeHistory}</g>
  </g>
  <g fill="#111" fill-opacity=".46" font-family="SFMono-Regular, SF Mono, ui-monospace, monospace" font-size="9">
    <text x="${CENTER.x + SCOPE_RADIUS + 7}" y="${CENTER.y + 3}">M</text>
    <text x="${CENTER.x}" y="${CENTER.y - SCOPE_RADIUS - 7}" text-anchor="middle">S</text>
    <text x="${CENTER.x}" y="${CENTER.y + SCOPE_RADIUS + 16}" text-anchor="middle">NORMALIZED</text>
    <text x="41" y="${HEIGHT - 36}">DIFF  ${LIVE_LEVELS.difference}</text>
    <text x="1397" y="${HEIGHT - 36}" text-anchor="end">CORR  ${LIVE_LEVELS.correlation}</text>
  </g>
</svg>
`;
}

const svg = buildSvg();
if (/<image\b/i.test(svg)) throw new Error("Entrainment SVG must not contain raster images.");
if (!/<path\b/i.test(svg)) throw new Error("Entrainment SVG contains no signal geometry.");
for (const channel of ["left", "right"]) {
  if (countPlaybackTurns(channel) < 8) throw new Error(`Entrainment ${channel} playback trace is incomplete.`);
}
fs.writeFileSync(OUTPUT_PATH, svg);
console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
