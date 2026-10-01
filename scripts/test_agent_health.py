import json
import sqlite3
import tempfile
from pathlib import Path
import unittest
from agent_health import update, observe, MAX_AGE

class HealthTests(unittest.TestCase):
    def report(self):
        return {'checked_at':'2026-10-01T12:00:00Z','checks':[
          {'name':'com.ufo-files.ssh-orchestrator.ocr','status':'ok','detail':'Running'},
          {'name':'com.ufo-files.ssh-orchestrator.media','status':'ok','detail':'Scheduled idle; last exit 0'},
          {'name':'com.ufo-files.french-worker','status':'ok','detail':'Running'},
          {'name':'com.ufo-files.italian-worker','status':'ok','detail':'Scheduled idle'},
          {'name':'com.ufo-files.source-recovery','status':'ok','detail':'Running'},
          {'name':'source:private-source','status':'blocked','detail':'secret path /private/token'},
          {'name':'com.ufo-files.machine-data-publisher','status':'error','detail':'Process not running'},
        ]}
    def test_states_and_mixed_workers_preserve_faults_without_exposing_details(self):
        rows=observe(self.report(),1790856060)
        states={r[0]:r[2] for r in rows}
        self.assertEqual(states,{'Translations':'running','Transcriptions':'idle','OCR':'running','Downloaders':'blocked','Publisher':'offline'})
        self.assertNotIn('secret',str(rows));self.assertNotIn('private-source',str(rows))
        downloads=next(r for r in rows if r[0]=='Downloaders')
        self.assertEqual(json.loads(downloads[3]),{'blocked':1,'running':1})
    def test_old_or_future_observations_are_not_fresh(self):
        self.assertEqual(observe(self.report(),1790856000+MAX_AGE+1),[])
        self.assertEqual(observe(self.report(),1790855999),[])
    def test_duplicate_samples_and_missing_monitor_preserve_history(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'health.json';path.write_text(json.dumps(self.report()))
            db=sqlite3.connect(':memory:')
            update(db,path,1790856060);result=update(db,path,1790856060)
            self.assertTrue(all(len(g['observations'])==1 for g in result['groups']))
            path.unlink();result=update(db,path,1790858000)
            self.assertTrue(all(len(g['observations'])==1 for g in result['groups']))

if __name__=='__main__':unittest.main()
