/* Public aggregate telemetry only; absent days are not inferred as zero work. */
(function () {
  const endpoint = 'https://raw.githubusercontent.com/ufo-files/homepage/live-inventory/agent-activity.json';
  const colorFor = i => `hsl(${(i * 137.508) % 360} 58% 38%)`;
  let feed, selected = new Set(), metric = 'completions';
  const chart = document.getElementById('activity-chart');
  if (!chart) return;
  const status = document.getElementById('activity-status');
  const legend = document.getElementById('activity-agents');
  const NS = 'http://www.w3.org/2000/svg';
  function svgNode(tag, attrs, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function seriesFor(data, type) {
    return data.agents.filter(s => s.metric === type && Array.isArray(s.days) && s.days.length);
  }
  function render() {
    const available = seriesFor(feed, metric);
    const series = available.filter(s => selected.has(s.name));
    chart.replaceChildren();
    const dates = available.flatMap(s => s.days.map(d => Date.parse(d[0]+'T00:00:00Z')));
    if (!dates.length) { status.textContent = 'No timestamped records available for this measure.'; return; }
    const first = Math.min(...dates), last = Math.max(...dates), span = Math.max(86400000, last-first);
    const max = Math.ceil(Math.max(1, ...series.flatMap(s => s.days.map(d => d[1]))) / 4) * 4;
    const x = d => 75 + (Date.parse(d+'T00:00:00Z')-first)/span*880;
    const y = n => 335 - n/max*270;
    const svg = svgNode('svg', {viewBox:'0 0 1000 405', role:'img', 'aria-labelledby':'activity-svg-title activity-svg-desc'});
    svg.append(svgNode('title',{id:'activity-svg-title'},'Daily agent activity across all retained history'));
    svg.append(svgNode('desc',{id:'activity-svg-desc'},'One color per agent. Lines join consecutive recorded days only. Gaps mean no dated records. Exact daily counts are in the table below.'));
    for (let i=0;i<=4;i++) {
      const value=max*i/4;
      svg.append(svgNode('line',{x1:75,x2:955,y1:y(value),y2:y(value),stroke:'currentColor',opacity:'.15'}));
      svg.append(svgNode('text',{x:65,y:y(value)+5,'text-anchor':'end',fill:'currentColor'},Math.round(value).toLocaleString()));
    }
    const format = n => new Date(n).toISOString().slice(0,10);
    const ticks = Math.min(4, Math.max(1, Math.round((last-first)/86400000)));
    for (let i=0;i<=ticks;i++) svg.append(svgNode('text',{x:75+880*i/ticks,y:365,'text-anchor':i===0?'start':i===ticks?'end':'middle',fill:'currentColor'},format(first+span*i/ticks)));
    svg.append(svgNode('text',{x:75,y:30,fill:'currentColor'},metric==='completions'?'Recorded completions / day':'Timestamped log entries / day'));
    const body = document.getElementById('activity-rows'); body.replaceChildren();
    series.forEach(s => {
      const color = colorFor(available.indexOf(s));
      let previous;
      s.days.forEach(([date,count]) => {
        const at = Date.parse(date+'T00:00:00Z');
        if (previous && at-previous.at===86400000) svg.append(svgNode('line',{x1:previous.x,y1:previous.y,x2:x(date),y2:y(count),stroke:color,'stroke-width':2}));
        const dot=svgNode('circle',{cx:x(date),cy:y(count),r:3.5,fill:color});
        dot.append(svgNode('title',{},`${s.name}: ${count.toLocaleString()} on ${date} UTC`)); svg.append(dot);
        previous={at,x:x(date),y:y(count)};
        const tr=document.createElement('tr');
        [date,s.name,count.toLocaleString()].forEach(value => {const td=document.createElement('td');td.textContent=value;tr.append(td);});body.append(tr);
      });
    });
    chart.append(svg);
    status.textContent = `${format(first)}–${format(last)} UTC · Updated ${new Date(feed.generatedAt).toLocaleString()} · ${series.length} agents shown`;
  }
  function controls(reset) {
    const available=seriesFor(feed, metric);
    if(reset) selected=new Set(available.map(s=>s.name));
    legend.replaceChildren();
    available.forEach((s,i)=>{
      const label=document.createElement('label'), input=document.createElement('input'), swatch=document.createElement('span');
      input.type='checkbox';input.checked=selected.has(s.name);
      input.addEventListener('change',()=>{input.checked?selected.add(s.name):selected.delete(s.name);render();});
      swatch.className='activity-swatch';swatch.style.backgroundColor=colorFor(i);
      label.append(input,swatch,document.createTextNode(s.name));legend.append(label);
    }); render();
  }
  document.getElementById('activity-metric').addEventListener('change', e=>{metric=e.target.value;if(feed)controls(true);});
  document.getElementById('activity-all').addEventListener('click',()=>{if(feed)controls(true);});
  document.getElementById('activity-none').addEventListener('click',()=>{selected.clear();if(feed)controls(false);});
  async function refresh() {
    try {
      const response=await fetch(endpoint+'?t='+Math.floor(Date.now()/60000),{cache:'no-store'});
      if(!response.ok)throw Error('feed unavailable');
      const next=await response.json();
      if(next.schemaVersion!==1 || !Array.isArray(next.agents))throw Error('invalid feed');
      const initial=!feed;feed=next;controls(initial);
    } catch(error) {
      if(!feed) {
        try {const r=await fetch('agent-activity.json');if(!r.ok)throw Error();feed=await r.json();controls(true);status.textContent+=' · Saved snapshot';}
        catch {status.textContent='Activity history is temporarily unavailable.';}
      } else status.textContent+=' · Live refresh unavailable; showing last received records';
    }
  }
  refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);
})();
