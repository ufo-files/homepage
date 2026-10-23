import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class HomepageBuildTests(unittest.TestCase):
    def run_build(self, outcome):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            counter = root / 'calls'
            helper = root / 'gh'
            helper.write_text('''#!/usr/bin/env python3
import json, os
from pathlib import Path
p = Path(os.environ['TEST_CALLS'])
n = int(p.read_text()) + 1 if p.exists() else 1
p.write_text(str(n))
old = 'https://api.github.com/repos/ufo-files/homepage/pages/builds/1'
new = 'https://api.github.com/repos/ufo-files/homepage/pages/builds/2'
if n == 1: print(old)
elif n == 2: print(json.dumps({'url': old.rsplit('/', 1)[0] + '/latest', 'status': 'queued'}))
elif n == 3: print(json.dumps({'url': old, 'status': 'built'}))
elif n == 4: print(json.dumps({'url': new, 'status': 'building'}))
else: print(json.dumps({'url': new, 'status': os.environ['TEST_OUTCOME'], 'error': {'message': 'example failure'}}))
''')
            helper.chmod(0o755)
            sleeper = root / 'sleep'
            sleeper.write_text('#!/bin/sh\nexit 0\n')
            sleeper.chmod(0o755)
            environment = dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'],
                GITHUB_REPOSITORY='ufo-files/homepage', GITHUB_STEP_SUMMARY=str(root / 'summary'),
                TEST_CALLS=str(counter), TEST_OUTCOME=outcome)
            result = subprocess.run(['bash', str(Path(__file__).with_name('rebuild_after_graph.sh'))],
                cwd=root, env=environment, capture_output=True, text=True)
            return result, int(counter.read_text())

    def test_waits_for_new_build_instead_of_accepting_previous_success(self):
        result, calls = self.run_build('built')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, 5)

    def test_reports_new_build_failure(self):
        result, calls = self.run_build('errored')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(calls, 5)
        self.assertIn('example failure', result.stderr)
