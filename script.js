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
let archiveCountLoading = false;
let cachedLargeArchiveCount = null;
const archiveCountRefreshMs = 2 * 60 * 1000;
const releaseArchiveManifestUrl = "https://raw.githubusercontent.com/ufo-files/data-archive/main/manifest/archive-manifest.json";
const releaseArchiveReleasesUrl = "https://api.github.com/repos/ufo-files/data-archive/releases?per_page=100";
const largeArchiveTreeUrl = "https://api.github.com/repos/ufo-files/data-archive-large-files/git/trees/main?recursive=1";

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
  return new Intl.NumberFormat("en-US").format(value);
}

function formatManifestDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function isArchivedSourcePath(path) {
  if (typeof path !== "string" || !path.startsWith("originals/")) return false;
  const parts = path.split("/");
  if (parts[1] === "National-Archives-UAP-Bulk" && parts.length >= 3) {
    if (!["audio", "documents", "pdfs", "photo", "video"].includes(parts[2])) return false;
  }
  const name = parts.at(-1).toLowerCase();
  if (["checksums.sha256", "manifest.json", "manifest.tsv"].includes(name)) return false;
  if (name.startsWith("failed-downloads") || name.startsWith("stopped-downloads")) return false;
  return true;
}

function isArchivedOriginal(entry) {
  return entry?.type === "blob" && isArchivedSourcePath(entry.path);
}

function isReleaseSourceAsset(asset) {
  return isArchivedSourcePath(asset?.label);
}

async function loadReleaseArchiveManifestCount() {
  const response = await fetch(`${releaseArchiveManifestUrl}?v=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) {
    return { count: 0, generatedDate: "" };
  }
  if (!response.ok) {
    throw new Error(`release archive manifest returned ${response.status}`);
  }
  const manifest = await response.json();
  const count = Number.isFinite(manifest.release_source_file_count)
    ? manifest.release_source_file_count
    : Number.isFinite(manifest.release_asset_count)
      ? manifest.release_asset_count
      : manifest.count;
  if (!Number.isFinite(count) || count < 0) {
    throw new Error("release archive manifest did not include a file count");
  }
  return { count, generatedDate: formatManifestDate(manifest.generated_utc) };
}

async function loadLiveReleaseArchiveCount() {
  let count = 0;
  let latestUpdate = "";
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`${releaseArchiveReleasesUrl}&page=${page}&v=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`release archive inventory returned ${response.status}`);
    }
    const releases = await response.json();
    if (!Array.isArray(releases)) {
      throw new Error("release archive inventory was malformed");
    }
    releases.forEach((release) => {
      if (!Array.isArray(release.assets)) return;
      count += release.assets.filter(isReleaseSourceAsset).length;
      release.assets.forEach((asset) => {
        const updatedAt = asset.updated_at || asset.created_at || "";
        if (updatedAt > latestUpdate) latestUpdate = updatedAt;
      });
    });
    if (releases.length < 100) break;
  }
  return { count, generatedDate: formatManifestDate(latestUpdate) };
}

async function loadReleaseArchiveCount() {
  try {
    return await loadLiveReleaseArchiveCount();
  } catch (error) {
    return loadReleaseArchiveManifestCount();
  }
}

async function loadLargeArchiveCount() {
  if (Number.isFinite(cachedLargeArchiveCount)) return cachedLargeArchiveCount;
  try {
    const response = await fetch(`${largeArchiveTreeUrl}&v=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`large archive tree returned ${response.status}`);
    }
    const archiveTree = await response.json();
    if (archiveTree.truncated || !Array.isArray(archiveTree.tree)) {
      throw new Error("large archive tree was truncated or malformed");
    }
    cachedLargeArchiveCount = archiveTree.tree.filter(isArchivedOriginal).length;
  } catch (error) {
    // A newly recreated or rate-limited large-file repository is a valid zero
    // until a successful tree response gives us a count. Do not take down the
    // independently available Release count.
    cachedLargeArchiveCount = 0;
  }
  return cachedLargeArchiveCount;
}

async function loadArchiveCount() {
  const countElement = document.getElementById("archive-count");
  const statusElement = document.getElementById("archive-count-status");
  if (!countElement || !statusElement || archiveCountLoading) return;

  archiveCountLoading = true;
  try {
    const [releaseArchive, largeArchiveCount] = await Promise.all([
      loadReleaseArchiveCount(),
      loadLargeArchiveCount(),
    ]);
    countElement.textContent = formatNumber(releaseArchive.count + largeArchiveCount);
    const updated = releaseArchive.generatedDate ? ` Updated ${releaseArchive.generatedDate}.` : "";
    statusElement.textContent = `${formatNumber(releaseArchive.count)} Release files + ${formatNumber(largeArchiveCount)} large files.${updated}`;
  } catch (error) {
    countElement.textContent = "Unavailable";
    statusElement.textContent = "Combined archive indexes are temporarily unavailable.";
  } finally {
    archiveCountLoading = false;
  }
}

resize();
loadArchiveCount();
if (!screenshotMode) {
  window.setInterval(loadArchiveCount, archiveCountRefreshMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) loadArchiveCount();
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
