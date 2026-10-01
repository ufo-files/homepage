#!/usr/bin/env python3
"""Continuously refresh independent archive rows and publish a small live feed."""
import argparse
import base64
import concurrent.futures
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import subprocess
import time
from build_source_inventory import build


def stamp():
    return datetime.now(timezone.utc).isoformat()


def merge_row(inventory, row, checked_at):
    rows = [dict(value) for value in inventory['sources']]
    row = {**row, 'checkedAt': checked_at}
    for index, existing in enumerate(rows):
        if existing['name'] == row['name']:
            rows[index] = row
            break
    else:
        rows.append(row)
    return {**inventory, 'generatedAt': checked_at, 'sources': rows}


def publish(inventory, repository, branch):
    endpoint = f'repos/{repository}/contents/source-inventory.json'
    current = json.loads(subprocess.check_output(['gh', 'api', endpoint + '?ref=' + branch], text=True, timeout=45))
    payload = dict(message='Refresh live archive inventory', branch=branch, sha=current['sha'],
                   content=base64.b64encode((json.dumps(inventory, indent=2)+'\n').encode()).decode())
    subprocess.run(['gh','api','--method','PUT',endpoint,'--input','-'],
                   input=json.dumps(payload), text=True, stdout=subprocess.DEVNULL,
                   check=True, timeout=60)
    print(f'{stamp()} published live inventory', flush=True)


def run(args):
    args.state_dir.mkdir(parents=True, exist_ok=True)
    lock = (args.state_dir/'worker.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return
    state = args.state_dir/'inventory.json'
    inventory = json.loads((state if state.exists() else args.seed).read_text())
    # Old rows retain their original age when another source refreshes.
    for row in inventory['sources']:
        row.setdefault('checkedAt', inventory['generatedAt'])
    due = {row['name']: 0 for row in inventory['sources']}
    totals = {row['name']: row.get('totalFiles') or 0 for row in inventory['sources']}
    running = {}
    dirty = False
    last_publish = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        while True:
            now = time.monotonic()
            for future, name in list(running.items()):
                if not future.done():
                    continue
                del running[future]
                due[name] = now + args.interval
                try:
                    row = future.result()['sources'][0]
                    if row['totalFiles'] is None:
                        raise RuntimeError('Source unavailable; retaining last successful check')
                    inventory = merge_row(inventory, row, stamp())
                    temporary = state.with_suffix('.tmp')
                    temporary.write_text(json.dumps(inventory, indent=2)+'\n')
                    temporary.replace(state)
                    dirty = True
                    print(f'{stamp()} checked {name}: {row["totalFiles"]} files', flush=True)
                except Exception as exc:
                    print(f'{stamp()} inventory check failed for {name}: {exc}', flush=True)
            if dirty and now - last_publish >= 60:
                try:
                    publish(inventory, args.repository, args.branch)
                    dirty = False
                except Exception as exc:
                    print(f'{stamp()} publication failed; retrying: {exc}', flush=True)
                last_publish = now
            if (args.archive/'originals').is_dir() and (args.archive/'transcripts').is_dir():
                active = set(running.values())
                available = sorted((name for name, at in due.items() if at <= now and name not in active),
                                   key=lambda name: (due[name], name != 'American-Alchemy', totals[name], name))
                for name in available[:2-len(running)]:
                    print(f'{stamp()} checking {name}', flush=True)
                    running[pool.submit(build, args.archive, [name])] = name
            time.sleep(5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--seed', type=Path, required=True)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--repository', default='ufo-files/homepage')
    parser.add_argument('--branch', default='live-inventory')
    parser.add_argument('--interval', type=int, default=900)
    run(parser.parse_args())
