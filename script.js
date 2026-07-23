const fieldCanvas = document.getElementById("field");
const fieldCtx = fieldCanvas.getContext("2d");
const screenshotMode = new URLSearchParams(window.location.search).has("screenshot");
const prefersReducedMotion = screenshotMode || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let viewportWidth = 0;
let viewportHeight = 0;
let fieldPoints = [];
let pointer = { x: 0, y: 0, active: false };
let animationFrame = 0;
let screenshotSeed = 0;
let corpusMetricsLoading = false;
const corpusMetricsRefreshMs = 60 * 1000;
const graphDataBaseUrl = "https://ufo-files.github.io/relationship-graph/data";
const menuToggle = document.getElementById("menu-toggle");
const siteHeader = document.getElementById("site-header");
const siteNavigation = document.getElementById("site-navigation");
const mobileMenu = window.matchMedia("(max-width: 820px)");
const announcement = document.querySelector(".announcement-banner p");
const announcementMessages = [
  "Open-source infrastructure for research into the UAP record.",
  "Evidence-linked public research infrastructure.",
  "Source-centric, inspectable, and reproducible.",
];

if (announcement) {
  const messageIndex = screenshotMode ? 0 : Math.floor(Math.random() * announcementMessages.length);
  announcement.textContent = announcementMessages[messageIndex];
}

function setMenuState(open = false) {
  if (!menuToggle || !siteHeader || !siteNavigation) return;
  const isMobile = mobileMenu.matches;
  const isOpen = isMobile && open;
  menuToggle.hidden = !isMobile;
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  siteNavigation.hidden = isMobile && !isOpen;
  siteHeader.classList.toggle("menu-open", isOpen);
}

if (menuToggle && siteNavigation) {
  setMenuState(false);
  menuToggle.addEventListener("click", () => {
    setMenuState(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  siteNavigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuState(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setMenuState(false);
      menuToggle.focus();
    }
  });
  mobileMenu.addEventListener("change", () => setMenuState(false));
}

function seededRandom() {
  screenshotSeed = (screenshotSeed * 1664525 + 1013904223) >>> 0;
  return screenshotSeed / 4294967296;
}

function fieldRandom() {
  return screenshotMode ? seededRandom() : Math.random();
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  viewportWidth = window.innerWidth;
  viewportHeight = window.innerHeight;
  fieldCanvas.width = Math.floor(viewportWidth * ratio);
  fieldCanvas.height = Math.floor(viewportHeight * ratio);
  fieldCanvas.style.width = `${viewportWidth}px`;
  fieldCanvas.style.height = `${viewportHeight}px`;
  fieldCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  buildFieldPoints();
  if (prefersReducedMotion) {
    drawField();
  }
}

function buildFieldPoints() {
  const count = Math.max(42, Math.round((viewportWidth * viewportHeight) / 28000));
  screenshotSeed = (viewportWidth * 73856093) ^ (viewportHeight * 19349663) ^ 0x9e3779b9;
  fieldPoints = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: fieldRandom() * viewportWidth,
      y: fieldRandom() * viewportHeight,
      vx: Math.cos(angle) * (0.08 + fieldRandom() * 0.12),
      vy: Math.sin(angle) * (0.08 + fieldRandom() * 0.12),
      r: 1 + fieldRandom() * 1.8,
      ox: 0,
      oy: 0,
      rx: 0,
      ry: 0,
    };
  });
}

function drawField() {
  fieldCtx.clearRect(0, 0, viewportWidth, viewportHeight);
  fieldCtx.fillStyle = "rgba(17, 17, 17, .24)";
  fieldCtx.strokeStyle = "rgba(17, 17, 17, .045)";
  fieldCtx.lineWidth = 1;

  fieldPoints.forEach((point) => {
    if (!prefersReducedMotion) {
      point.x += point.vx;
      point.y += point.vy;
      if (point.x < -20) point.x = viewportWidth + 20;
      if (point.x > viewportWidth + 20) point.x = -20;
      if (point.y < -20) point.y = viewportHeight + 20;
      if (point.y > viewportHeight + 20) point.y = -20;
    }

    let targetOx = 0;
    let targetOy = 0;
    if (pointer.active && !prefersReducedMotion) {
      const dx = point.x - pointer.x;
      const dy = point.y - pointer.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < 220) {
        const influence = (1 - distance / 220) ** 2;
        targetOx = (-dx / distance) * influence * 34;
        targetOy = (-dy / distance) * influence * 34;
      }
    }
    point.ox += (targetOx - point.ox) * 0.08;
    point.oy += (targetOy - point.oy) * 0.08;
    point.rx = point.x + point.ox;
    point.ry = point.y + point.oy;

    fieldCtx.beginPath();
    fieldCtx.arc(point.rx, point.ry, point.r, 0, Math.PI * 2);
    fieldCtx.fill();
  });

  for (let i = 0; i < fieldPoints.length; i += 1) {
    for (let j = i + 1; j < fieldPoints.length; j += 1) {
      const a = fieldPoints[i];
      const b = fieldPoints[j];
      const distance = Math.hypot(a.rx - b.rx, a.ry - b.ry);
      if (distance > 150) continue;
      fieldCtx.globalAlpha = 1 - distance / 150;
      fieldCtx.beginPath();
      fieldCtx.moveTo(a.rx, a.ry);
      fieldCtx.lineTo(b.rx, b.ry);
      fieldCtx.stroke();
    }
  }

  if (pointer.active && !prefersReducedMotion) {
    fieldCtx.strokeStyle = "rgba(17, 17, 17, .07)";
    fieldCtx.lineWidth = 1;
    fieldPoints.forEach((point) => {
      const distance = Math.hypot(point.rx - pointer.x, point.ry - pointer.y);
      if (distance > 132) return;
      fieldCtx.globalAlpha = (1 - distance / 132) * .38;
      fieldCtx.beginPath();
      fieldCtx.moveTo(pointer.x, pointer.y);
      fieldCtx.lineTo(point.rx, point.ry);
      fieldCtx.stroke();
    });
  }
  fieldCtx.globalAlpha = 1;
}

function draw() {
  drawField();
  if (!prefersReducedMotion) {
    animationFrame = requestAnimationFrame(draw);
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${Math.round(value * 100)}%`;
}

function formatArchiveDate(value) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

async function fetchJson(path) {
  const response = await fetch(`${graphDataBaseUrl}/${path}?v=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

function readCount(manifest, keys) {
  for (const key of keys) {
    const value = key.split(".").reduce((record, part) => record?.[part], manifest);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function deriveMetrics(manifest, decisions = {}) {
  const counts = manifest.counts || manifest;
  const sources = readCount(counts, ["sources", "source_records", "sourceCount"]);
  const entities = readCount(counts, ["entities", "entity_count", "entityCount"]);
  const relationships = readCount(counts, ["relationships", "relationship_count", "relationshipCount"]);
  const mentions = readCount(counts, ["mentions", "entity_mentions", "mentionCount"]);
  const reviewed = readCount(decisions, ["summary.reviewed_entities", "reviewed_entities", "reviewed"]);
  const accepted = readCount(decisions, ["summary.accepted_entities", "accepted_entities", "accepted"]);
  const needsReview = readCount(counts, ["needs_review", "needsReview", "review_flags"])
    || readCount(decisions, ["summary.needs_review", "needs_review", "flagged_review"]);
  const invalidReferences = readCount(decisions, ["summary.invalid_references", "invalid_references"])
    || readCount(manifest, ["invalid_references"]);
  const provenanceCovered = readCount(counts, ["provenance_records", "relationships_with_evidence"])
    || (relationships > 0 ? relationships - invalidReferences : 0);
  const provenanceCoverage = relationships > 0 ? Math.max(0, Math.min(1, provenanceCovered / relationships)) : 0;
  const generatedAt = manifest.generated_utc || manifest.generated_at || manifest.build_utc || manifest.created_utc;

  return { sources, entities, relationships, mentions, reviewed, accepted, needsReview, invalidReferences, provenanceCoverage, generatedAt };
}

async function loadCorpusMetrics() {
  if (corpusMetricsLoading) return;
  corpusMetricsLoading = true;
  try {
    const [manifest, decisions] = await Promise.all([
      fetchJson("manifest.json"),
      fetchJson("classification-decisions.json").catch(() => ({})),
    ]);
    const metrics = deriveMetrics(manifest, decisions);
    setText("metric-sources", formatNumber(metrics.sources));
    setText("metric-entities", formatNumber(metrics.entities));
    setText("metric-relationships", formatNumber(metrics.relationships));
    setText("metric-mentions", formatNumber(metrics.mentions));
    setText("metric-needs-review", formatNumber(metrics.needsReview));
    setText("metric-last-build", formatArchiveDate(metrics.generatedAt));
    setText("health-reviewed", formatNumber(metrics.reviewed));
    setText("health-accepted", formatNumber(metrics.accepted));
    setText("health-needs-review", formatNumber(metrics.needsReview));
    setText("health-provenance", formatPercent(metrics.provenanceCoverage));
    setText("health-invalid", formatNumber(metrics.invalidReferences));
    setText("corpus-status", "Loaded from generated relationship graph metadata.");
  } catch (error) {
    ["metric-sources", "metric-entities", "metric-relationships", "metric-mentions", "metric-needs-review", "metric-last-build", "health-reviewed", "health-accepted", "health-needs-review", "health-provenance", "health-invalid"].forEach((id) => setText(id, "Unavailable"));
    setText("corpus-status", "Generated corpus metadata is temporarily unavailable.");
  } finally {
    corpusMetricsLoading = false;
  }
}

const searchForm = document.getElementById("corpus-search-form");
if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    const input = document.getElementById("corpus-search");
    if (!input || !input.value.trim()) return;
    event.preventDefault();
    const query = encodeURIComponent(input.value.trim());
    window.location.href = `https://ufo-files.github.io/relationship-graph/?q=${query}`;
  });
}

resize();
loadCorpusMetrics();
if (!screenshotMode) {
  window.setInterval(loadCorpusMetrics, corpusMetricsRefreshMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadCorpusMetrics();
  });
}
if (!prefersReducedMotion && !animationFrame) {
  animationFrame = requestAnimationFrame(draw);
}
window.addEventListener("resize", resize);
window.addEventListener("pointermove", (event) => {
  pointer = { x: event.clientX, y: event.clientY, active: true };
});
window.addEventListener("pointerleave", () => {
  pointer.active = false;
});
