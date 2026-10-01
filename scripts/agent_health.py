#!/usr/bin/env python3
"""Publish aggregate worker health observations, without private report details."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import time
from agent_activity import publish

ROLES = ('Translations','Transcriptions','OCR','Downloaders','Publisher')
MAX_AGE = 15 * 60

def classify(row):
    status, detail = row.get('status'), str(row.get('detail','')).lower()
    if status == 'ok':
        if detail.startswith(('scheduled idle','last scheduled check completed')): return 'idle'
        if detail.startswith(('running','active')): return 'running'
    if status == 'deferred': return 'idle'
    if status in ('blocked','degraded','error','failed','warning'):
        if any(word in detail for word in ('not running','not loaded','missing process','no process')): return 'offline'
        return 'blocked'
    return 'unknown'

def observe(report, now):
    at = datetime.fromisoformat(report['checked_at'].replace('Z','+00:00'))
    if at.tzinfo is None: raise ValueError('Missing timezone')
    stamp = at.timestamp()
    if not 0 <= now-stamp <= MAX_AGE: return []
    checks = report['checks']
    rules = {
        'Translations': lambda n: n.startswith('com.ufo-files.') and n.endswith('-worker'),
        'Transcriptions': lambda n: n == 'com.ufo-files.ssh-orchestrator.media',
        'OCR': lambda n: n == 'com.ufo-files.ssh-orchestrator.ocr',
        'Downloaders': lambda n: n == 'com.ufo-files.source-recovery' or n.startswith('source:'),
        'Publisher': lambda n: n == 'com.ufo-files.machine-data-publisher',
    }
    rows = []
    for role in ROLES:
        states = [classify(r) for r in checks if isinstance(r,dict) and rules[role](str(r.get('name','')))]
        counts = {s: states.count(s) for s in set(states)}
        state = next((s for s in ('offline','blocked','unknown','running','idle') if counts.get(s)), 'unknown')
        # Mixed activity remains visible alongside faults, rather than marking all stopped.
        rows.append((role,stamp,state,json.dumps(counts,sort_keys=True)))
    return rows

def update(db, report_path, now=None):
    now = time.time() if now is None else now
    db.execute('CREATE TABLE IF NOT EXISTS observations (role TEXT, at REAL, state TEXT, counts TEXT, PRIMARY KEY(role,at))')
    try:
        report = json.loads(report_path.read_text())
        rows = observe(report,now)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        rows = []
    db.executemany('INSERT OR REPLACE INTO observations VALUES (?,?,?,?)',rows)
    db.commit()
    return {'schemaVersion':2,'generatedAt':datetime.fromtimestamp(now,timezone.utc).isoformat(),
            'validForSeconds':MAX_AGE,'groups':[
                {'name':role,'observations':[[at,state,json.loads(counts)] for at,state,counts in
                  db.execute('SELECT at,state,counts FROM observations WHERE role=? AND at>=? ORDER BY at',(role,now-32*86400))]}
                for role in ROLES]}

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--report',type=Path,default=Path.home()/'Library/Application Support/ufo-files/stack-health/state/status.json')
    parser.add_argument('--watch',action='store_true')
    parser.add_argument('--publish',action='store_true')
    args=parser.parse_args()
    args.state.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(args.state)
    while True:
        try:
            payload=update(db,args.report)
            tmp=args.output.with_suffix('.tmp');tmp.write_text(json.dumps(payload,separators=(',',':'))+'\n');tmp.replace(args.output)
            if args.publish: publish(payload,filename='agent-health.json')
            print(payload['generatedAt']+' health feed updated',flush=True)
        except Exception as error:
            if not args.watch: raise
            print('Health publication failed: '+str(error),flush=True)
        if not args.watch: break
        time.sleep(300)
