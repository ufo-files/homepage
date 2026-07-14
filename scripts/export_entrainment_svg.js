const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "assets", "entrainment-canvas.svg");
const WIDTH = 1438;
const HEIGHT = 808;
const TAU = Math.PI * 2;
const LEFT_FREQUENCY = 100;
const RIGHT_FREQUENCY = 104;
const SNAPSHOT_TIME = 0.66;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const SCOPE_RADIUS = 170;
const LIVE_LEVELS = Object.freeze({
  left: "-22.9 DBFS",
  right: "-23.0 DBFS",
  difference: "-21.0 DBFS",
  correlation: "0.23",
});

function number(value) {
  return Number(value.toFixed(2));
}

function pathData(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${number(point.x)} ${number(point.y)}`)
    .join(" ");
}

function channelPath(startX, endX, frequency, phaseOffset = 0) {
  const points = [];
  const width = endX - startX;
  const windowSeconds = 0.052;
  for (let x = 0; x <= width; x += 2) {
    const ratio = x / width;
    const envelope = Math.sin(Math.PI * ratio) * 0.2 + 0.8;
    const time = SNAPSHOT_TIME + ratio * windowSeconds;
    points.push({
      x: startX + x,
      y: CENTER.y + Math.sin(TAU * frequency * time + phaseOffset) * 25 * envelope,
    });
  }
  return pathData(points);
}

function vectorscopePath(frame) {
  const points = [];
  const samples = 260;
  const windowSeconds = 0.075;
  const frameTime = SNAPSHOT_TIME + frame * 0.0055;
  let peak = 0;

  for (let index = 0; index < samples; index += 1) {
    const time = frameTime + (index / (samples - 1)) * windowSeconds;
    const left = Math.sin(TAU * LEFT_FREQUENCY * time) * 0.34;
    const right = Math.sin(TAU * RIGHT_FREQUENCY * time) * 0.34;
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
  const scopeFrameCount = 18;
  const scopeHistory = Array.from({ length: scopeFrameCount }, (_, index) => {
    const recency = (index + 1) / scopeFrameCount;
    const opacity = number(0.025 + recency * recency * 0.62);
    return `<path d="${vectorscopePath(index)}" opacity="${opacity}"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet" data-state="playing">
  <title>Entrainment reference signal playing with live PCM telemetry</title>
  <desc>Deterministic vector snapshot of the active 100 and 104 hertz stereo signal and its fading mid-side vectorscope history.</desc>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f6f5ef"/>
  <g fill="none" stroke="#111" stroke-width="1" stroke-opacity=".075" vector-effect="non-scaling-stroke">${gridLines}</g>
  <g fill="#111" fill-opacity=".58" font-family="SFMono-Regular, SF Mono, ui-monospace, monospace" font-size="10">
    <text x="41" y="130">L  LIVE  ${LIVE_LEVELS.left}</text>
    <text x="1397" y="130" text-anchor="end">R  LIVE  ${LIVE_LEVELS.right}</text>
  </g>
  <g fill="none" stroke="#111" vector-effect="non-scaling-stroke">
    <circle cx="${CENTER.x}" cy="${CENTER.y}" r="${SCOPE_RADIUS}" stroke-opacity=".18"/>
    <path d="M${CENTER.x - SCOPE_RADIUS} ${CENTER.y}H${CENTER.x + SCOPE_RADIUS}M${CENTER.x} ${CENTER.y - SCOPE_RADIUS}V${CENTER.y + SCOPE_RADIUS}" stroke-opacity=".11"/>
    <path d="${channelPath(41, 503, LEFT_FREQUENCY)}" stroke-opacity=".76" stroke-width="1.15"/>
    <path d="${channelPath(935, 1397, RIGHT_FREQUENCY)}" stroke-opacity=".76" stroke-width="1.15"/>
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
fs.writeFileSync(OUTPUT_PATH, svg);
console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
