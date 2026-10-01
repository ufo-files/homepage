import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from agent_activity import database, ingest_log, ingest_records, snapshot, scan, ingest_download_runs, ingest_publications, ingest_completed_downloads

class ActivityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.db=database(':memory:')
    def tearDown(self):
        self.db.close();self.tmp.cleanup()
    def test_incremental_logs_preserve_gaps_and_ignore_undated_lines(self):
        log=self.root/'worker.log'
        log.write_text('undated success\n2026-08-01T12:00:00Z heartbeat\n2026-08-03T12:00:00Z retry\n')
        ingest_log(self.db,log,'OCR');ingest_log(self.db,log,'OCR')
        self.assertEqual(snapshot(self.db)['agents'][0]['days'],[['2026-08-01',1],['2026-08-03',1]])
        with log.open('a') as h:h.write('2026-08-03T13:00:00Z success\n')
        ingest_log(self.db,log,'OCR')
        self.assertEqual(snapshot(self.db)['agents'][0]['days'][-1],['2026-08-03',2])
    def test_stream_attribution_and_renamed_log_are_not_duplicated(self):
        log=self.root/'downloads-live.log'
        log.write_text('2026-08-01T12:00:00Z [american-alchemy] downloaded\n2026-08-01T12:00:00Z [status] heartbeat\n')
        ingest_log(self.db,log,'Source stream',{'american-alchemy'})
        rotated=log.with_suffix('.log.old');log.rename(rotated)
        ingest_log(self.db,rotated,'Source stream',{'american-alchemy'})
        series=snapshot(self.db)['agents']
        self.assertEqual(len(series),1);self.assertEqual(series[0]['days'],[['2026-08-01',1]])
    def test_completion_uses_outcome_not_candidate_complete_flag(self):
        record=self.root/'claim.json'
        record.write_text(json.dumps({'outcome':'complete','complete':False,'kind':'media','updated_at':1786324553}))
        ingest_records(self.db,self.root,'main');ingest_records(self.db,self.root,'main')
        series=snapshot(self.db)['agents'][0]
        self.assertEqual(series['name'],'Transcriptions');self.assertEqual(series['days'],[['2026-08-10',1]])
        record.write_text(json.dumps({'outcome':'error','kind':'media','updated_at':1786324553}))
        ingest_records(self.db,self.root,'main');self.assertEqual(snapshot(self.db)['agents'],[])
    def test_all_language_workers_share_daily_translation_totals(self):
        for language in ('french','portuguese','spanish','italian','japanese'):
            directory=self.root/'.state'/('mac-processor-'+language)/'completed'
            directory.mkdir(parents=True)
            (directory/'claim.json').write_text(json.dumps({'outcome':'complete','updated_at':1786324553}))
        main=self.root/'.state/mac-processor/completed';main.mkdir(parents=True)
        (main/'ocr.json').write_text(json.dumps({'outcome':'complete','kind':'ocr','updated_at':1786324553}))
        scan(self.db,self.root,self.root/'logs');scan(self.db,self.root,self.root/'logs')
        series=snapshot(self.db)['agents']
        self.assertEqual([s['name'] for s in series],['OCR','Translations'])
        self.assertEqual(series[1]['days'],[['2026-08-10',5]])
        self.assertEqual(series[0]['days'],[['2026-08-10',1]])
    def test_download_run_counts_exclude_progress_and_deduplicate_mirrors(self):
        log=self.root/'runs.log'
        log.write_text('2026-08-01T12:00:01Z [recovery-supervisor] 2026-08-01T12:00:00Z finished american-alchemy\n2026-08-01T12:00:00Z finished american-alchemy\n2026-08-01T12:00:00Z starting afu\n')
        ingest_download_runs(self.db,log);ingest_download_runs(self.db,log)
        self.assertEqual(snapshot(self.db)['agents'],[]) # Run success is not a completed file.
    def test_transfers_count_redownloads_and_deduplicate_log_echoes(self):
        log=self.root/'downloads.log'
        digest='a'*64
        log.write_text(
            f'2026-08-02T12:00:00Z [afu] [download-engine] transport=http bytes=42 sha256={digest} target=/old/originals/AFU/a.pdf\n'
            f'2026-08-02T12:00:00Z [afu] [download-engine] transport=http bytes=42 sha256={digest} target=/new/originals/AFU/a.pdf\n'
            f'2026-08-03T12:00:00Z [afu] [download-engine] transport=http bytes=42 sha256={digest} target=/new/originals/AFU/a.pdf\n'
            f'2026-08-03T12:00:00Z [afu] [download-engine] transport=http bytes=42 sha256={digest} target=/new/originals/AFU/other/a.pdf\n'
            f'2026-08-02T12:00:00Z [american-alchemy] [download-engine] transport=yt-dlp bytes=42 sha256={digest} target=/new/originals/AA/video.mp4\n'
            '2026-08-02T12:00:00Z [american-alchemy] downloaded: video.mp4 (42 bytes)\n'
            '2026-08-02T12:00:00Z [afu] [download-engine] progress bytes=42 target=a.part\n'
            '2026-08-02T12:00:00Z [afu] downloaded 500, skipped 1\n'
            'undated downloaded: unknown.mp4 (42 bytes)\n'
            '\x00non-text log fragment\n')
        ingest_completed_downloads(self.db,log);ingest_completed_downloads(self.db,log)
        series=snapshot(self.db)['agents'][0]
        self.assertEqual(series['name'],'Downloaders')
        self.assertEqual(series['days'],[['2026-08-02',2],['2026-08-03',2]])
        log.rename(self.root/'rotated.log')
        ingest_completed_downloads(self.db,self.root/'rotated.log')
        log.write_text(f'2026-08-01T12:00:00Z [afu] [download-engine] transport=http bytes=42 sha256={digest} target=/old/originals/AFU/a.pdf')
        ingest_completed_downloads(self.db,log)
        self.assertEqual(snapshot(self.db)['agents'][0]['days'],series['days'])
        with log.open('a') as f:f.write('\n')
        ingest_completed_downloads(self.db,log)
        self.assertEqual(snapshot(self.db)['agents'][0]['days'],[['2026-08-01',1],['2026-08-02',2],['2026-08-03',2]])
        self.assertNotIn('/originals/',json.dumps(snapshot(self.db)))

    def test_fast_inputs_publish_before_record_scan_and_scan_reports_progress(self):
        directory=self.root/'.state/mac-processor/completed';directory.mkdir(parents=True)
        (directory/'job.json').write_text(json.dumps({'outcome':'complete','kind':'ocr','updated_at':1786324553}))
        seen=[]
        def progress(force=False):
            seen.append((force,self.db.execute("SELECT count(*) FROM events").fetchone()[0]))
        scan(self.db,self.root,self.root/'logs',progress=progress)
        self.assertEqual(seen[0],(True,0))
        self.assertTrue(any(not forced for forced,count in seen))
        self.assertEqual(snapshot(self.db)['agents'][0]['days'],[['2026-08-10',1]])

    def test_publications_count_only_published_update_commits_once(self):
        output='abc\t2026-08-01T23:00:00-07:00\tUpdate transcript machine data (200 files)\nxyz\t2026-08-01T12:00:00Z\tEdit README\n'
        with mock.patch('agent_activity.subprocess.run',return_value=mock.Mock(stdout=output)) as run:
            ingest_publications(self.db,self.root);ingest_publications(self.db,self.root)
        self.assertTrue(any('sha=main' in arg for arg in run.call_args.args[0]))
        series=snapshot(self.db)['agents']
        self.assertEqual(series[0]['name'],'Publisher');self.assertEqual(series[0]['days'],[['2026-08-02',1]])
    def test_shared_log_requires_explicit_source_identity(self):
        log=self.root/'recovery.log';log.write_text('2026-08-01T12:00:00Z starting american-alchemy\n2026-08-01T12:00:00Z secret path\n')
        ingest_log(self.db,log,'Source recovery');data=snapshot(self.db)
        self.assertEqual(data['agents'][0]['name'],'american-alchemy');self.assertNotIn('secret',json.dumps(data))
    def test_partial_line_retried_and_rotated_history_retained(self):
        log=self.root/'worker.log';log.write_text('2026-08-01T12:00:00Z hello')
        ingest_log(self.db,log,'OCR');self.assertEqual(snapshot(self.db)['agents'],[])
        with log.open('a') as h:h.write('\n')
        ingest_log(self.db,log,'OCR');log.rename(self.root/'old.log');log.write_text('2026-08-02T12:00:00Z hello\n')
        ingest_log(self.db,log,'OCR');self.assertEqual(len(snapshot(self.db)['agents'][0]['days']),2)

if __name__=='__main__':unittest.main()
