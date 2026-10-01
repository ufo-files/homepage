/* Public aggregate telemetry only; absent days are not inferred as zero work. */
(function () {
  const endpoint = 'https://raw.githubusercontent.com/ufo-files/homepage/live-inventory/agent-activity.json';
  const colorFor = i => `hsl(${(i * 137.508) % 360} 58% 38%)`;
  let feed;
  const metric = 'completions';
  const roles = ['Translations', 'Transcriptions', 'OCR', 'Downloaders', 'Publisher'];
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
  function monthWindow() {
    const end = new Date();
    end.setUTCHours(0,0,0,0);
    const start = new Date(end);
    const day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth()-1);
    const lastDay = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
    start.setUTCDate(Math.min(day,lastDay));
    return [start.toISOString().slice(0,10),end.toISOString().slice(0,10)];
  }
  function seriesFor(data, type) {
    // Accept the previous feed during rollout, preserving all existing history.
    const [from,to] = monthWindow();
    const totals = new Map(roles.map(name => [name, new Map()]));
    const units = new Map();
    for (const series of data.agents) {
      if (series.metric !== type || !Array.isArray(series.days)) continue;
      let name = series.name;
      if (name === 'Transcription') name = 'Transcriptions';
      if (name === 'Translation' || name.endsWith(' processing')) name = 'Translations';
      if (!totals.has(name)) continue;
      units.set(name, series.unit);
      for (const [day,count] of series.days) {
        if (day >= from && day <= to) totals.get(name).set(day,(totals.get(name).get(day)||0)+count);
      }
    }
    return roles.map(name => ({name,metric:type,unit:units.get(name),days:[...totals.get(name)].sort((a,b)=>a[0].localeCompare(b[0]))}));
  }
  function movingAverage(days) {
    let window = [], previous;
    return days.map(([day,count]) => {
      const at=Date.parse(day+'T00:00:00Z');
      if (previous !== undefined && at-previous !== 86400000) window=[];
      window.push(count);
      if (window.length>3) window.shift();
      previous=at;
      return [day,window.reduce((sum,value)=>sum+value,0)/window.length];
    });
  }
  function smoothPath(points) {
    // Shape-preserving cubic interpolation: passes through each observation,
    // flattens at turning points, and never overshoots a segment's values.
    const slopes = points.slice(1).map((p, i) => (p[1]-points[i][1])/(p[0]-points[i][0]));
    const tangents = points.map((p, i) => {
      if (!i) return slopes[0];
      if (i === points.length-1) return slopes[i-1];
      const a=slopes[i-1], b=slopes[i];
      return a*b <= 0 ? 0 : 2*a*b/(a+b);
    });
    let d = `M ${points[0][0]},${points[0][1]}`;
    for (let i=1; i<points.length; i++) {
      const a=points[i-1], b=points[i], dx=(b[0]-a[0])*.48;
      d += ` C ${a[0]+dx},${a[1]+tangents[i-1]*dx} ${b[0]-dx},${b[1]-tangents[i]*dx} ${b[0]},${b[1]}`;
    }
    return d;
  }
  function render() {
    const available = seriesFor(feed, metric);
    const series = available;
    chart.replaceChildren();
    const [from,to] = monthWindow();
    const first = Date.parse(from+'T00:00:00Z'), last = Date.parse(to+'T00:00:00Z');
    const span = Math.max(86400000,last-first);
    const peak = Math.max(1, ...series.flatMap(s => movingAverage(s.days).map(d => d[1])));
    const max = Math.max(2000, Math.ceil(peak / 500) * 500);
    const x = d => 75 + (Date.parse(d+'T00:00:00Z')-first)/span*880;
    const y = n => 335 - (n <= 1500 ? .9 * n / 1500 : .9 + .1 * (n - 1500) / (max - 1500))*270;
    const svg = svgNode('svg', {viewBox:'0 0 1000 405', role:'img', 'aria-labelledby':'activity-svg-title activity-svg-desc'});
    svg.append(svgNode('title',{id:'activity-svg-title'},'Three-day average worker activity over the past month'));
    svg.append(svgNode('desc',{id:'activity-svg-desc'},'One color per worker group. Lines show trailing averages of up to three consecutive recorded days and never cross gaps. Gaps mean no dated records.'));
    svg.append(svgNode('rect',{x:75,y:65,width:880,height:27,fill:'currentColor',opacity:'.04',rx:4}));
    const levels = [0,500,1000,1500,max];
    for (const value of levels) {
      svg.append(svgNode('line',{x1:75,x2:955,y1:y(value),y2:y(value),stroke:'currentColor',opacity:'.15'}));
      svg.append(svgNode('text',{x:65,y:y(value)+5,'text-anchor':'end',fill:'currentColor'},Math.round(value).toLocaleString()));
    }
    const format = n => new Date(n).toISOString().slice(0,10);
    const ticks = Math.min(4, Math.max(1, Math.round((last-first)/86400000)));
    for (let i=0;i<=ticks;i++) svg.append(svgNode('text',{x:75+880*i/ticks,y:365,'text-anchor':i===0?'start':i===ticks?'end':'middle',fill:'currentColor'},format(first+span*i/ticks)));
    svg.append(svgNode('text',{x:75,y:30,fill:'currentColor'},'3-day average activity · above 1,500 compressed into top 10%'));
    series.forEach(s => {
      const color = colorFor(available.indexOf(s));
      let previous, points = [];
      const flush = () => {
        if (points.length > 1) {
          const line = svgNode('path',{d:smoothPath(points),fill:'none',stroke:color,'stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','data-agent':s.name});
          line.append(svgNode('title',{},s.name));
          svg.append(line);
        }
        points = [];
      };
      movingAverage(s.days).forEach(([date,count]) => {
        const at = Date.parse(date+'T00:00:00Z');
        if (previous !== undefined && at-previous!==86400000) flush();
        points.push([x(date),y(count)]);
        previous=at;
      });
      flush();

    });
    chart.append(svg);
    status.textContent = `${format(first)}–${format(last)} UTC · Updated ${new Date(feed.generatedAt).toLocaleString()} · ${series.length} worker groups shown${feed.backfillInProgress ? ' · Historical import in progress' : ''}`;
  }
  function updateChart() {
    const available=seriesFor(feed, metric);
    legend.replaceChildren();
    available.forEach((s,i)=>{
      const item=document.createElement('span'), swatch=document.createElement('span');
      item.className='activity-legend-item';
      swatch.className='activity-swatch';swatch.style.backgroundColor=colorFor(i);
      item.title = s.unit || s.name;
      item.append(swatch,document.createTextNode(s.name));legend.append(item);
    });
    render();
  }
  async function refresh() {
    try {
      const response=await fetch(endpoint+'?t='+Math.floor(Date.now()/60000),{cache:'no-store'});
      if(!response.ok)throw Error('feed unavailable');
      const next=await response.json();
      if(next.schemaVersion!==1 || !Array.isArray(next.agents))throw Error('invalid feed');
      feed=next;updateChart();
    } catch(error) {
      if(!feed) {
        try {const r=await fetch('agent-activity.json');if(!r.ok)throw Error();feed=await r.json();updateChart();status.textContent+=' · Saved snapshot';}
        catch {status.textContent='Activity history is temporarily unavailable.';}
      } else { render(); status.textContent+=' · Live refresh unavailable; showing last received records'; }
    }
  }
  refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);
})();
