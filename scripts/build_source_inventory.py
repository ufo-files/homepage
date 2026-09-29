"""Count archived source files and verify corresponding machine-readable outputs.

Run on the archive host: python3 scripts/build_source_inventory.py ARCHIVE_ROOT
The output is a dated snapshot, not a count of unique documents or pages.
"""
import collections
import datetime
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import unquote

CONTENT_SUFFIXES = set('pdf jpg jpeg png tif tiff gif jp2 bmp webp djvu mp4 m4v mov avi mkv webm mpg mpeg wmv mxf mts m2ts vob 3gp mp3 wav m4a aac flac ogg wma aiff txt html htm doc docx rtf odt epub eml csv xls xlsx ppt pptx'.split())
IGNORED_DIRS = {'metadata', 'discovery', 'zips', 'thumbnails', 'previews', '__MACOSX'}


def source_file(path):
    if any(part.startswith('.') or part in IGNORED_DIRS for part in path.parts):
        return False
    suffix = path.suffix.lower().lstrip('.')
    if 'database' in path.parts and suffix in {'gz', 'sql', 'tsv', 'csv', 'db', 'sqlite', 'sqlite3'}:
        return True
    return suffix in CONTENT_SUFFIXES or (suffix == 'json' and 'documents' in path.parts)


def files_under(root):
    if not root.is_dir():
        return
    pending = [root]
    while pending:
        with os.scandir(pending.pop()) as entries:
            for entry in entries:
                if entry.name.startswith('.') or entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    pending.append(Path(entry.path))
                elif entry.is_file(follow_symlinks=False):
                    yield Path(entry.path)


def output_sources(root, collection):
    verified = {}
    errors = 0
    for path in files_under(root / collection):
        try:
            if path.name == 'document.json':
                data = json.loads(path.read_text())
                if data.get('processing_status') != 'complete':
                    continue
                canonical = path.parent / data.get('canonical_path', 'canonical.json')
                translation = path.parent / data.get('translation_path', 'en/translation.json')
                if not canonical.is_file() or not translation.is_file():
                    continue
                source = data.get('source', {})
                name = source.get('archived_original_path')
                size = source.get('bytes')
            elif path.name.endswith('.source.json'):
                data = json.loads(path.read_text())
                output = path.with_name(path.name.removesuffix('.source.json') + '.tsv')
                if not output.is_file() or output.stat().st_size == 0:
                    continue
                name = data.get('source_file') or data.get('source_rel')
                size = data.get('source_bytes')
            elif path.suffix == '.txt':
                with path.open() as handle:
                    line = handle.readline(65536)
                    if not line.startswith('{'):
                        continue
                    data = json.loads(line)
                    if not handle.read(4096).strip():
                        continue
                name = data.get('source_file')
                size = data.get('source_bytes')
            else:
                continue
            if name and isinstance(size, int):
                if '/originals/' in name:
                    name = name.split('/originals/', 1)[1]
                name = name.removeprefix('originals/')
                if name.startswith(collection + '/'):
                    verified[name] = size
        except (ValueError, OSError, UnicodeError):
            errors += 1
    return verified, errors


def build(archive, names):
    rows = []
    for name in names:
        originals = archive / 'originals' / name
        if not originals.is_dir():
            rows.append({'name': name, 'totalFiles': None, 'processingComplete': False, 'reason': 'Archive unavailable'})
            continue
        counts = collections.Counter()
        source_paths = []
        processed = 0
        for path in files_under(originals):
            relative = path.relative_to(archive / 'originals')
            if not source_file(relative):
                continue
            counts[path.suffix.lower()] += 1
            source_paths.append((path, relative.as_posix()))
        total = sum(counts.values())
        output_count = sum(1 for path in files_under(archive / 'transcripts' / name)
                           if path.suffix in {'.txt', '.tsv'} or path.name == 'document.json')
        print(f'{name}: counted {total:,} source files and {output_count:,} output files', flush=True)
        errors = 0
        if output_count >= total:
            outputs, errors = output_sources(archive / 'transcripts', name)
            processed = sum(outputs.get(relative) == path.stat().st_size for path, relative in source_paths)
        else:
            processed = None
        rows.append({'name': name, 'totalFiles': total, 'verifiedProcessedFiles': processed,
                     'outputFiles': output_count,
                     'processingComplete': total > 0 and processed == total and errors == 0,
                     'outputReadErrors': errors, 'extensions': dict(sorted(counts.items()))})
        print(f'{name}: complete={rows[-1]["processingComplete"]}', flush=True)
    return {'schema': 'ufo-files-source-inventory/v1',
            'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'definition': 'Archived content files, including scans and alternate formats; excludes metadata, logs, ZIP bundles, and partial downloads.',
            'completionRule': 'Every archived content file has a nonempty machine-readable output with matching source path and byte size. This is processing coverage, not a content accuracy certification.',
            'sources': rows}


def update_fallback(path, inventory):
    """Keep the saved table useful without JavaScript or a successful fetch."""
    sources = {row['name']: row for row in inventory['sources']}
    def replace_row(match):
        heading, body, end = match.groups()
        source = sources.get(unquote(re.search(r'/main/([^"/]+)', heading).group(1)))
        cells = re.findall(r'<td\b.*?</td>', body)
        if len(cells) == 6:
            cells = cells[1:4] + cells[5:]
        if len(cells) != 4:
            raise ValueError('Unexpected source table structure')
        total = f'{source["totalFiles"]:,}' if source and source['totalFiles'] is not None else 'Unavailable'
        complete = source and source['processingComplete']
        status = 'Processing complete' if complete else 'Processing in progress'
        indicator = '✅' if complete else 'In progress'
        cells.insert(0, f'<td class="numeric">{total}</td>')
        cells.insert(4, f'<td class="processing-status" aria-label="{status}">{indicator}</td>')
        return heading + ''.join(cells) + end
    html = path.read_text()
    html = re.sub(r'(<tr><th scope="row">.*?</th>)(.*?)(</tr>)', replace_row, html)
    html = re.sub(r'(<p id="sources-status"[^>]*>).*?(</p>)',
                  lambda m: m[1] + 'Saved catalog snapshot. Archive inventory checked ' + inventory['generatedAt'] + '. Live updates require JavaScript.' + m[2], html)
    path.write_text(html)


if __name__ == '__main__':
    repo = Path(__file__).resolve().parents[1]
    names = json.loads((repo / 'source-inventory.json').read_text())['sources']
    selected = sys.argv[2:]
    result = build(Path(sys.argv[1]), selected or [row['name'] for row in names])
    if selected:
        updated = {row['name']: row for row in result['sources']}
        result['sources'] = [updated.get(row['name'], row) for row in names]
    (repo / 'source-inventory.json').write_text(json.dumps(result, indent=2) + '\n')
    update_fallback(repo / 'index.html', result)
