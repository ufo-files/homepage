/* Animate the original artwork, keeping every edge attached to its nodes. */
(async () => {
  const intro = document.querySelector('.intro');
  if (!intro) return;
  try {
    const response = await fetch('assets/intro-graph.svg');
    if (!response.ok) return;
    const documentSVG = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const svg = documentSVG.documentElement;
    if (svg.localName !== 'svg' || documentSVG.querySelector('parsererror')) return;
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const nodes = Array.from(svg.querySelectorAll('circle'), (element, index) => ({
      element,
      x: Number(element.getAttribute('cx')),
      y: Number(element.getAttribute('cy')),
      phase: index * 2.399963,
      amplitude: 7 + (index % 5) * 3,
      speed: .3 + (index % 7) * .035,
    }));
    const positions = new Map(nodes.map(node => [`${node.x},${node.y}`, node]));
    const edges = Array.from(svg.querySelectorAll('line'), element => ({
      element,
      from: positions.get(`${Number(element.getAttribute('x1'))},${Number(element.getAttribute('y1'))}`),
      to: positions.get(`${Number(element.getAttribute('x2'))},${Number(element.getAttribute('y2'))}`),
    }));
    if (!nodes.length || edges.some(edge => !edge.from || !edge.to)) return;

    // A few traveling pulses make connections feel active without competing with the copy.
    const signals = edges.filter((_, index) => index % 31 === 0).map((edge, index) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      element.setAttribute('r', '2.5');
      element.setAttribute('fill', '#111');
      element.setAttribute('class', 'graph-signal');
      svg.append(element);
      return { element, edge, offset: index * .137 };
    });
    const layer = document.createElement('div');
    layer.className = 'intro-graph';
    layer.setAttribute('aria-hidden', 'true');
    layer.append(svg);
    intro.prepend(layer);
    intro.classList.add('graph-ready');

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let frame = null;
    let previous = null;
    let elapsed = 0;

    function draw(time, still = false) {
      for (const node of nodes) {
        node.currentX = node.x + (still ? 0 : Math.sin(time * node.speed + node.phase) * node.amplitude);
        node.currentY = node.y + (still ? 0 : Math.cos(time * node.speed * .83 + node.phase) * node.amplitude);
        node.element.setAttribute('cx', node.currentX);
        node.element.setAttribute('cy', node.currentY);
      }
      for (const { element, from, to } of edges) {
        element.setAttribute('x1', from.currentX);
        element.setAttribute('y1', from.currentY);
        element.setAttribute('x2', to.currentX);
        element.setAttribute('y2', to.currentY);
      }
      for (const { element, edge, offset } of signals) {
        const progress = (time / 7 + offset) % 1;
        element.setAttribute('cx', edge.from.currentX + (edge.to.currentX - edge.from.currentX) * progress);
        element.setAttribute('cy', edge.from.currentY + (edge.to.currentY - edge.from.currentY) * progress);
        element.setAttribute('opacity', still ? 0 : Math.sin(progress * Math.PI) * .6);
      }
    }

    function tick(now) {
      if (previous !== null) elapsed += Math.min(now - previous, 64) / 1000;
      previous = now;
      draw(elapsed);
      frame = requestAnimationFrame(tick);
    }

    function update() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previous = null;
      if (reducedMotion.matches) draw(0, true);
      else if (visible && !document.hidden) frame = requestAnimationFrame(tick);
    }
    draw(0, reducedMotion.matches);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      update();
    }).observe(intro);
    reducedMotion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
  } catch {
    // Keep the CSS background when the artwork cannot be loaded.
  }
})();
