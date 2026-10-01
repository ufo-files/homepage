#!/usr/bin/env python3
"""Incremental public activity aggregates; never publish log text or source paths."""
import argparse
import base64
from collections import Counter
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import time

STAMP = re.compile(r'^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00))\s+(.*)')

def database(path):
    db = sqlite3.connect(path)
    db.executescript('''
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, agent TEXT, metric TEXT, day TEXT);
      CREATE TABLE IF NOT EXISTS log_counts (inode TEXT, agent TEXT, day TEXT, total INTEGER, PRIMARY KEY(inode,agent,day));
      CREATE TABLE IF NOT EXISTS log_positions (inode TEXT PRIMARY KEY, offset INTEGER);
      CREATE TABLE IF NOT EXISTS records (path TEXT PRIMARY KEY, mtime INTEGER, size INTEGER);
    ''')
    return db

def day_of(value):
    if isinstance(value, bool):
        raise ValueError('Invalid timestamp')
    if isinstance(value, (int, float)):
        dt = datetime.fromtimestamp(value, timezone.utc)
    else:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None or dt.year < 2000 or dt > datetime.now(timezone.utc):
        raise ValueError('Invalid timestamp')
    return dt.astimezone(timezone.utc).date().isoformat()

def ingest_log(db, path, agent, allowed=None):
    """Incremental daily aggregates, keyed by inode so rotation is not duplicated."""
    stat = path.stat()
    inode = f'{stat.st_dev}:{stat.st_ino}'
    old = db.execute('SELECT offset FROM log_positions WHERE inode=?', (inode,)).fetchone()
    offset = old[0] if old and old[0] <= stat.st_size else 0
    counts = Counter()
    with path.open('rb') as handle:
        handle.seek(offset)
        while True:
            start = handle.tell()
            line = handle.readline()
            if not line or not line.endswith(b'\n'):
                handle.seek(start)
                break
            match = STAMP.match(line.decode('utf-8', errors='replace'))
            if not match:
                continue
            owner = agent
            if agent == 'Source stream':
                source = re.match(r'\[([a-z0-9-]+)\] ', match[2])
                if not source or source[1] not in allowed:
                    continue
                owner = source[1]
            elif agent == 'Source recovery':
                source = re.match(r'(?:starting|finished) ([a-z0-9-]+)$', match[2])
                if not source:
                    continue
                owner = source[1]
            try:
                day = day_of(match[1])
            except (ValueError, OverflowError):
                continue
            counts[(owner, day)] += 1
        offset = handle.tell()
    for (owner, day), total in counts.items():
        db.execute('INSERT INTO log_counts VALUES (?,?,?,?) ON CONFLICT(inode,agent,day) DO UPDATE SET total=total+excluded.total', (inode,owner,day,total))
    db.execute('INSERT OR REPLACE INTO log_positions VALUES (?,?)', (inode,offset))
    db.commit()


def ingest_records(db, directory, lane):
    """Only open new/changed completion JSON; no transcript reads or hashing."""
    known = {p: (mtime, size) for p, mtime, size in db.execute('SELECT * FROM records')}
    count = 0
    audit_offset = int(time.time() // 900) * 200
    known_paths = sorted(known)
    audit = {known_paths[(audit_offset+i) % len(known_paths)] for i in range(min(200,len(known_paths)))}
    with os.scandir(directory) as entries:
        for entry in entries:
            if not entry.name.endswith('.json'):
                continue
            if entry.path in known and entry.path not in audit:
                continue
            if not entry.is_file(follow_symlinks=False):
                continue
            st = entry.stat(follow_symlinks=False)
            signature = (st.st_mtime_ns, st.st_size)
            if known.get(entry.path) == signature:
                continue
            try:
                data = json.loads(Path(entry.path).read_text())
                key = f'completion:{lane}:{entry.name}'
                # Each retained claim contributes once, at its latest recorded completion.
                db.execute('DELETE FROM events WHERE id=?', (key,))
                if data.get('outcome') == 'complete':
                    agent = {'ocr': 'OCR', 'media': 'Transcription'}.get(data.get('kind')) if lane == 'main' else lane
                    if agent:
                        db.execute('INSERT INTO events VALUES (?,?,?,?)', (key, agent, 'completions', day_of(data['updated_at'])))
                db.execute('INSERT OR REPLACE INTO records VALUES (?,?,?)', (entry.path, *signature))
            except (OSError, ValueError, KeyError, OverflowError):
                continue  # Retry a partially written record on the next pass.
            count += 1
            if count % 500 == 0:
                db.commit()
                print(f'Indexed {count} new/changed {lane} completion records', flush=True)
    db.commit()

def snapshot(db):
    groups = {}
    for agent, metric, day, count in db.execute("SELECT agent,metric,day,SUM(total) FROM (SELECT agent,metric,day,count(*) AS total FROM events WHERE metric='completions' GROUP BY agent,metric,day UNION ALL SELECT agent,'signals',day,total FROM log_counts) GROUP BY agent,metric,day ORDER BY day"):
        groups.setdefault((agent, metric), []).append([day, count])
    return {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'agents': [{'name': agent, 'metric': metric, 'days': days} for (agent, metric), days in sorted(groups.items())],
            'notes': 'UTC daily totals from retained timestamped logs and latest successful completion records. Missing days are unknown, not zero. Completion records may include adopted existing outputs. Signals include heartbeats, retries and errors; they do not measure output or CPU usage. Undated lines are excluded.'}

def publish(payload):
    endpoint = 'repos/ufo-files/homepage/contents/agent-activity.json'
    result = subprocess.run(['gh','api',endpoint+'?ref=live-inventory'], capture_output=True, text=True, timeout=45)
    body = {'message': 'Refresh recorded agent activity', 'branch':'live-inventory',
            'content':base64.b64encode((json.dumps(payload,separators=(',',':'))+'\n').encode()).decode()}
    if result.returncode == 0:
        body['sha'] = json.loads(result.stdout)['sha']
    elif '404' not in result.stderr:
        raise RuntimeError(result.stderr)
    subprocess.run(['gh','api','--method','PUT',endpoint,'--input','-'], input=json.dumps(body), text=True, check=True, stdout=subprocess.DEVNULL, timeout=60)

def scan(db, archive, logs):
    source_agents = {p.stem for p in (archive/'.state/archivers').glob('*.json')}
    streams = sorted(p for p in (archive/'logs').glob('downloads-live.log*') if not p.name.endswith('.lock'))
    if streams:
        # This timestamped stream wraps source logs, so do not count originals too.
        for path in streams:
            print(f'Indexing retained activity stream {path.name}', flush=True)
            ingest_log(db, path, 'Source stream', source_agents)
    else:
        for path in sorted((archive/'logs').glob('*.log')):
            if path.stem in source_agents and not path.is_symlink():
                ingest_log(db, path, path.stem)
        recovery = logs/'source-recovery.log'
        if recovery.is_file():
            ingest_log(db, recovery, 'Source recovery')
    for name, agent in [('ssh-orchestrator','OCR / transcription orchestrator'), ('french-worker','French worker'), ('portuguese-worker','Portuguese worker')]:
        for path in sorted(logs.glob(name+'.log*')):
            if path.is_file() and not path.is_symlink():
                ingest_log(db, path, agent)
    for folder, lane in [('mac-processor','main'), ('mac-processor-french','French processing'), ('mac-processor-portuguese','Portuguese processing')]:
        directory = archive/'.state'/folder/'completed'
        if directory.is_dir():
            ingest_records(db, directory, lane)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, default=Path('/Volumes/UFO Files Archive 1'))
    parser.add_argument('--logs', type=Path, default=Path.home()/'Library/Logs/ufo-files')
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--watch', action='store_true')
    args = parser.parse_args()
    args.state.parent.mkdir(parents=True, exist_ok=True)
    lock = args.state.with_suffix('.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    db = database(args.state)
    while True:
        try:
            if not (args.archive/'.state').is_dir():
                raise RuntimeError('Archive unavailable; retaining previous feed')
            scan(db, args.archive, args.logs)
            payload = snapshot(db)
            args.output.write_text(json.dumps(payload, indent=2)+'\n')
            if args.publish:
                publish(payload)
            print(f'{payload["generatedAt"]} activity feed: {len(payload["agents"])} series', flush=True)
        except Exception as exc:
            if not args.watch:
                raise
            print(f'Activity refresh failed: {exc}', flush=True)
        if not args.watch:
            break
        time.sleep(900)
