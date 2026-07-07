const fieldCanvas = document.getElementById("field");
const fieldCtx = fieldCanvas.getContext("2d");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let viewportWidth = 0;
let viewportHeight = 0;
let fieldPoints = [];
let pointer = { x: 0, y: 0, active: false };
let animationFrame = 0;

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
  fieldPoints = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: Math.random() * viewportWidth,
      y: Math.random() * viewportHeight,
      vx: Math.cos(angle) * (0.08 + Math.random() * 0.12),
      vy: Math.sin(angle) * (0.08 + Math.random() * 0.12),
      r: 1 + Math.random() * 1.8,
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

resize();
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
