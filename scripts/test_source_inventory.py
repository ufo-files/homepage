import json
from pathlib import Path
import tempfile
import unittest

from build_source_inventory import build, source_file


class SourceInventoryTests(unittest.TestCase):
    def test_counts_pages_and_alternate_formats_but_not_packaging(self):
        for name in ['NARA/documents/page.jpg', 'NARA/documents/page.jp2', 'NARA/documents/report.pdf', 'UPDB-MUFON/extracted/documents/report.json', 'UPDB-BAASS/database/reports.tsv.gz']:
            self.assertTrue(source_file(Path(name)), name)
        for name in ['NARA/manifest.json', 'NARA/metadata/export.json', 'NARA/zips/bundle.zip', 'NARA/report.pdf.part', 'NARA/.extracted/report.pdf']:
            self.assertFalse(source_file(Path(name)), name)

    def test_requires_matching_outputs_for_every_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = root / 'originals/Test'
            output = root / 'transcripts/Test'
            original.mkdir(parents=True)
            output.mkdir(parents=True)
            (original / 'a.pdf').write_bytes(b'original')
            (original / 'b.jpg').write_bytes(b'scan')
            def transcript(name, size):
                (output / (name + '.txt')).write_text(json.dumps({'source_file': 'Test/' + name, 'source_bytes': size}) + '\nExtracted text')
            transcript('a.pdf', 8)
            row = build(root, ['Test'])['sources'][0]
            self.assertEqual((row['totalFiles'], row['outputFiles'], row['processingComplete']), (2, 1, False))
            transcript('b.jpg', 4)
            self.assertTrue(build(root, ['Test'])['sources'][0]['processingComplete'])
            (original / 'b.jpg').write_bytes(b'changed source')
            self.assertFalse(build(root, ['Test'])['sources'][0]['processingComplete'])

    def test_missing_archive_is_not_zero_or_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            row = build(Path(directory), ['Missing'])['sources'][0]
            self.assertIsNone(row['totalFiles'])
            self.assertFalse(row['processingComplete'])


if __name__ == '__main__':
    unittest.main()
