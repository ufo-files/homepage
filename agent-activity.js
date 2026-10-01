/* Public aggregate telemetry only; absent days are not inferred as zero work. */
(function () {
  const endpoint = 'https://raw.githubusercontent.com/ufo-files/homepage/live-inventory/agent-activity.json';
  const patterns = ['', '10 5', '3 5', '12 4 3 4', '18 6'];
  const colorFor = () => 'currentColor';
  let feed;
  const metric = 'completions';
  const roles = ['Translations', 'Transcriptions', 'OCR', 'Downloaders', 'Publisher'];
  const chart = document.getElementById('activity-chart');
  if (!chart) return;
  const status = document.getElementById('activity-status');
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
  function linePath(points) {
    // Shape-preserving interpolation through daily totals, without averaging.
    const slopes=points.slice(1).map((p,i)=>(p[1]-points[i][1])/(p[0]-points[i][0]));
    const tangents=points.map((p,i)=>{
      if (!i) return slopes[0];
      if (i===points.length-1) return slopes[i-1];
      const a=slopes[i-1],b=slopes[i];
      return a*b<=0 ? 0 : 2*a*b/(a+b);
    });
    let path=`M ${points[0]}`;
    for (let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],dx=(b[0]-a[0])/3;
      path+=` C ${a[0]+dx},${a[1]+tangents[i-1]*dx} ${b[0]-dx},${b[1]-tangents[i]*dx} ${b}`;
    }
    return path;
  }
  function render() {
    const available = seriesFor(feed, metric);
    const series = available;
    chart.replaceChildren();
    const [from,to] = monthWindow();
    const first = Date.parse(from+'T00:00:00Z'), last = Date.parse(to+'T00:00:00Z');
    const span = Math.max(86400000,last-first);
    const peak = Math.max(1, ...series.flatMap(s => s.days.map(d => d[1])));
    const max = Math.max(2000, Math.ceil(peak / 500) * 500);
    const x = d => 75 + (Date.parse(d+'T00:00:00Z')-first)/span*880;
    const y = n => 335 - (n <= 250 ? .5 * n / 250
      : n <= 1500 ? .5 + .4 * (n - 250) / 1250
      : .9 + .1 * (n - 1500) / (max - 1500))*270;
    const svg = svgNode('svg', {viewBox:'0 0 1100 405', role:'group', 'aria-labelledby':'activity-svg-title activity-svg-desc'});
    svg.append(svgNode('title',{id:'activity-svg-title'},'Daily worker completions over the past month'));
    svg.append(svgNode('desc',{id:'activity-svg-desc'},'Each worker group has a distinct line pattern and a direct label. Daily recorded completions. Today is incomplete and its final segment is faded. Missing-history gaps remain visible. ' + series.map(s => s.name + ': ' + (s.days.length ? s.days.reduce((sum,d)=>sum+d[1],0).toLocaleString() + ' recorded ' + (s.unit || 'completions') + ' across ' + s.days.length + ' observed days' : 'no dated records in this period')).join('. ')));
    svg.append(svgNode('rect',{x:75,y:65,width:880,height:27,fill:'currentColor',opacity:'.04',rx:4}));
    svg.append(svgNode('text',{x:14,y:200,transform:'rotate(-90 14 200)','text-anchor':'middle',fill:'currentColor','data-axis-label':'y'},'Daily completions'));
    const levels = [0,100,250,500,1000,1500,max];
    for (const value of levels) {
      svg.append(svgNode('line',{x1:75,x2:955,y1:y(value),y2:y(value),stroke:'currentColor',opacity:'.15'}));
      svg.append(svgNode('text',{x:65,y:y(value)+5,'text-anchor':'end',fill:'currentColor'},Math.round(value).toLocaleString()));
    }
    svg.append(svgNode('text',{x:955,y:390,'text-anchor':'end',fill:'currentColor'},'Today (partial)'));
    const format = n => new Date(n).toISOString().slice(0,10);
    const ticks = Math.min(4, Math.max(1, Math.round((last-first)/86400000)));
    for (let i=0;i<=ticks;i++) svg.append(svgNode('text',{x:75+880*i/ticks,y:365,'text-anchor':i===0?'start':i===ticks?'end':'middle',fill:'currentColor'},format(first+span*i/ticks)));
    const targets=svgNode('g',{'aria-hidden':'true'}), lines=svgNode('g',{'pointer-events':'none'});
    svg.append(targets,lines);
    let hoveredSeries=null, focusedLabel=null;
    const highlight = () => {
      const active=hoveredSeries || focusedLabel;
      lines.querySelectorAll('[data-agent]').forEach(line=>{
        const selected=line.dataset.agent===active;
        line.classList.toggle('is-highlighted',selected);
        line.classList.toggle('is-muted',!!active && !selected);
        if (selected) lines.append(line); // Keep the highlighted line above crossings.
      });
      svg.querySelectorAll('[data-series-label]').forEach(label=>{
        label.classList.toggle('is-highlighted',label.dataset.seriesLabel===active);
      });
    };
    const endLabels = [];
    series.forEach(s => {
      const color = colorFor(available.indexOf(s));
      let previous, points = [];
      const flush = () => {
        if (points.length > 1) {
          const curve=linePath(points);
          const line = svgNode('path',{d:curve,fill:'none',stroke:color,'stroke-width':2.5,'stroke-dasharray':patterns[available.indexOf(s)],'stroke-linecap':'round','stroke-linejoin':'round','data-agent':s.name});
          line.append(svgNode('title',{},s.name+' · '+(s.unit || 'completions')+(points.at(-1)[0]===x(to)?' · today is partial':'')));
          if(points.at(-1)[0]===x(to)) line.setAttribute('opacity','.4');
          lines.append(line);
          const target=svgNode('path',{d:curve,fill:'none',stroke:'transparent','stroke-width':14,'pointer-events':'stroke','data-hover-agent':s.name});
          target.addEventListener('pointerenter',()=>{hoveredSeries=s.name;highlight();});
          target.addEventListener('pointerleave',()=>{hoveredSeries=null;highlight();});
          targets.append(target);
        }
        points = [];
      };
      s.days.forEach(([date,count]) => {
        const at = Date.parse(date+'T00:00:00Z');
        if (previous !== undefined && at-previous!==86400000) flush();
        if(date===to && points.length>1) {const lastPoint=points.at(-1);flush();points=[lastPoint];}
        points.push([x(date),y(count)]);
        previous=at;
      });
      if (points.length) endLabels.push({name:s.name,point:points.at(-1),color});
      flush();
    });
    endLabels.sort((a,b)=>a.point[1]-b.point[1]);
    endLabels.forEach((label,i) => {
      label.y=Math.max(label.point[1],i ? endLabels[i-1].y+18 : 65);
    });
    for (let i=endLabels.length-1;i>=0;i--) {
      const label=endLabels[i];
      label.y=Math.min(label.y,i===endLabels.length-1 ? 335 : endLabels[i+1].y-18);
      svg.append(svgNode('path',{d:`M ${label.point} L 963,${label.y}`,fill:'none',stroke:label.color,'stroke-width':1,opacity:'.65'}));
      const text=svgNode('text',{x:970,y:label.y+4,fill:label.color,'data-series-label':label.name,tabindex:0,'aria-label':label.name+'; focus to highlight line'},label.name);
      text.addEventListener('pointerenter',()=>{hoveredSeries=label.name;highlight();});
      text.addEventListener('pointerleave',()=>{hoveredSeries=null;highlight();});
      text.addEventListener('focus',()=>{focusedLabel=label.name;highlight();});
      text.addEventListener('blur',()=>{focusedLabel=null;highlight();});
      svg.append(text);
    }
    chart.append(svg);
    status.textContent = '';
    status.hidden = true;
  }
  async function refresh() {
    try {
      const response=await fetch(endpoint+'?v=completed-transfers-1&t='+Math.floor(Date.now()/60000),{cache:'no-store'});
      if(!response.ok)throw Error('feed unavailable');
      const next=await response.json();
      if(next.schemaVersion!==1 || !Array.isArray(next.agents))throw Error('invalid feed');
      if (!feed || Date.parse(next.generatedAt)>=Date.parse(feed.generatedAt)) feed=next;
      render();
    } catch(error) {
      if(!feed) {
        try {const r=await fetch('agent-activity.json');if(!r.ok)throw Error();feed=await r.json();render();status.textContent='Showing a saved snapshot; live activity is temporarily unavailable.';status.hidden=false;}
        catch {status.textContent='Activity history is temporarily unavailable.';status.hidden=false;}
      } else { render(); status.textContent='Live refresh unavailable; showing last received records.';status.hidden=false; }
    }
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  // A newly deployed snapshot can be newer than GitHub's cached branch response.
  // Start with it and only move forward in time as the live feed catches up.
  (async()=>{
    try {
      const response=await fetch('agent-activity.json',{cache:'no-store'});
      const saved=await response.json();
      if(response.ok && saved.schemaVersion===1 && Array.isArray(saved.agents)) {feed=saved;render();}
    } catch(error) { /* The live request below can still succeed. */ }
    refresh();
  })();
  setInterval(()=>{if(!document.hidden)refresh();},60000);
})();
