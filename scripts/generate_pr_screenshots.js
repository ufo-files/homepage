const fs = require("fs");
const path = require("path");

const OUT = path.resolve(__dirname, "../docs/pr-screenshots");
fs.mkdirSync(OUT, { recursive: true });

const themes = {
  desktop: { w: 1440, h: 1120, cols: 3, title: "Desktop / 1440px" },
  tablet: { w: 900, h: 1420, cols: 2, title: "Tablet / 900px" },
  mobile: { w: 390, h: 1900, cols: 1, title: "Mobile / 390px" },
};

function esc(value) {
  return String(value).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function textLines(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function label(x, y, text, size = 18, color = "#111", maxChars = 50) {
  const lines = textLines(text, maxChars);
  return lines.map((line, index) => `<text x="${x}" y="${y + index * size * 1.35}" fill="${color}" font-size="${size}" font-family="SF Mono, IBM Plex Mono, monospace">${esc(line)}</text>`).join("\n");
}

function metricCards(w, x, y, cols) {
  const metrics = ["Sources", "Entities", "Relationships", "Mentions", "Needs Review", "Last corpus build"];
  const gap = 14;
  const cardW = (w - x * 2 - gap * (cols - 1)) / cols;
  const cardH = 112;
  return metrics.map((metric, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    return `<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#fffef8" stroke="#6f6b5f"/>\n${label(cx + 18, cy + 34, metric, 14, "#555", 22)}\n${label(cx + 18, cy + 82, index === 5 ? "Jul 2026" : "Live", 30, "#111", 12)}`;
  }).join("\n");
}

function cards(w, x, y, cols) {
  const names = ["Institutional History", "The Public Record", "Information & Myth", "Area 51", "UFOs & Consciousness", "Roswell"];
  const gap = 14;
  const cardW = (w - x * 2 - gap * (cols - 1)) / cols;
  const cardH = cols === 1 ? 86 : 132;
  return names.map((name, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    return `<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#fffef8" stroke="#6f6b5f"/>\n${label(cx + 16, cy + 34, name, cols === 1 ? 16 : 20, "#111", cols === 1 ? 30 : 22)}\n${label(cx + 16, cy + cardH - 28, "curated graph entry", 12, "#555", 22)}`;
  }).join("\n");
}

function render(kind) {
  const { w, h, cols, title } = themes[kind];
  const margin = kind === "mobile" ? 22 : 54;
  const heroTitleSize = kind === "mobile" ? 34 : kind === "tablet" ? 54 : 78;
  const cardCols = cols;
  const metricsY = kind === "desktop" ? 420 : kind === "tablet" ? 450 : 410;
  const pathsY = metricsY + (Math.ceil(6 / cols) * 126) + 82;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#f6f5ef"/>
  <defs>
    <pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#111" stroke-opacity=".06"/></pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <rect x="0" y="0" width="${w}" height="32" fill="#111"/>
  ${label(margin, 22, "Open-source infrastructure for research into the UAP record.", 12, "#f6f5ef", kind === "mobile" ? 38 : 90)}
  ${label(margin, 78, "UFO FILES", 18, "#111", 20)}
  <line x1="${margin}" y1="104" x2="${w - margin}" y2="104" stroke="#111" stroke-opacity=".28"/>
  ${label(margin, 160, "Public research infrastructure", 14, "#555", 40)}
  ${label(margin, kind === "mobile" ? 220 : 235, "An open research index of the UAP record", heroTitleSize, "#111", kind === "mobile" ? 16 : kind === "tablet" ? 22 : 30)}
  ${label(margin, kind === "mobile" ? 325 : 330, "Explore the documents, people, institutions, events, claims, and ideas that have shaped the UAP subject. Every result links back to its source.", kind === "mobile" ? 15 : 20, "#30302c", kind === "mobile" ? 38 : kind === "tablet" ? 58 : 78)}
  <rect x="${margin}" y="${kind === "mobile" ? 374 : 370}" width="${kind === "mobile" ? 220 : 300}" height="46" fill="#111"/>
  ${label(margin + 16, kind === "mobile" ? 404 : 400, "Explore Relationship Graph", 14, "#f6f5ef", 28)}
  ${label(margin, metricsY - 34, "Corpus metrics", 14, "#555", 40)}
  ${metricCards(w, margin, metricsY, cardCols)}
  ${label(margin, pathsY - 34, "Research paths", 14, "#555", 40)}
  ${cards(w, margin, pathsY, cardCols)}
  <line x1="${margin}" y1="${h - 110}" x2="${w - margin}" y2="${h - 110}" stroke="#111" stroke-opacity=".28"/>
  ${label(margin, h - 72, "Relationship semantics • Provenance • Data Health • Contribution", kind === "mobile" ? 12 : 16, "#30302c", kind === "mobile" ? 40 : 80)}
  ${label(margin, h - 36, title, 12, "#555", 40)}
</svg>`;
}

for (const kind of Object.keys(themes)) {
  const file = path.join(OUT, `homepage-redesign-${kind}.svg`);
  fs.writeFileSync(file, render(kind));
  console.log(`Wrote ${path.relative(path.resolve(__dirname, ".."), file)}`);
}
