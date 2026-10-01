#!/usr/bin/env python3
"""Refresh independent archive rows and publish the inventory once daily."""
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


REFRESH_INTERVAL = 24 * 60 * 60


def refresh_delay(checked_at, interval, now=None):
    """Honor saved check times across restarts; old or invalid times are due now."""
    now = now or datetime.now(timezone.utc)
    try:
        checked = datetime.fromisoformat(checked_at)
        age = (now - checked).total_seconds()
    except (TypeError, ValueError):
        return 0
    return max(0, min(interval, interval - age))


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
    now = time.monotonic()
    due = {row['name']: now + refresh_delay(row['checkedAt'], args.interval)
           for row in inventory['sources']}
    totals = {row['name']: row.get('totalFiles') or 0 for row in inventory['sources']}
    running = {}
    publication_state = args.state_dir/'publication.json'
    published_at = (json.loads(publication_state.read_text())['publishedAt']
                    if publication_state.exists() else inventory['generatedAt'])
    dirty = state.exists()
    next_publish = now + refresh_delay(published_at, args.interval)
    retry_at = 0
    print(f'{stamp()} refresh interval: {args.interval}s; '
          f'next source check in {max(0, min(due.values(), default=now) - now):.0f}s; '
          f'next publication eligible in {max(0, next_publish - now):.0f}s', flush=True)
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
            if dirty and now >= next_publish and now >= retry_at:
                try:
                    publish(inventory, args.repository, args.branch)
                    published_at = stamp()
                    temporary = publication_state.with_suffix('.tmp')
                    temporary.write_text(json.dumps({'publishedAt': published_at}) + '\n')
                    temporary.replace(publication_state)
                    next_publish = time.monotonic() + args.interval
                    dirty = False
                except Exception as exc:
                    print(f'{stamp()} publication failed; retrying: {exc}', flush=True)
                retry_at = time.monotonic() + 60
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
    parser.add_argument('--interval', type=int, default=REFRESH_INTERVAL, help='Seconds between source checks and successful publications (default: daily)')
    run(parser.parse_args())
