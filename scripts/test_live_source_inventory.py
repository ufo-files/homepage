import unittest
from datetime import datetime, timezone
from live_source_inventory import merge_row, refresh_delay, REFRESH_INTERVAL

class LiveInventoryTests(unittest.TestCase):
    def test_independent_update_preserves_other_source_age(self):
        original = dict(generatedAt='old',sources=[dict(name='AA',checkedAt='old',totalFiles=141),dict(name='AFU',checkedAt='older',totalFiles=100)])
        result=merge_row(original,dict(name='AA',totalFiles=142),'new')
        self.assertEqual(result['sources'][0]['checkedAt'],'new')
        self.assertEqual(result['sources'][1]['checkedAt'],'older')
        self.assertEqual(original['sources'][0]['totalFiles'],141)

    def test_daily_schedule_survives_restart(self):
        now = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
        self.assertEqual(REFRESH_INTERVAL, 86400)
        self.assertEqual(refresh_delay('2026-10-01T11:00:00+00:00', REFRESH_INTERVAL, now), 23 * 3600)
        self.assertEqual(refresh_delay('2026-09-30T12:00:00+00:00', REFRESH_INTERVAL, now), 0)
        self.assertEqual(refresh_delay('2026-09-29T12:00:00+00:00', REFRESH_INTERVAL, now), 0)

    def test_invalid_or_future_check_time_does_not_stall_scheduler(self):
        now = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
        for value in (None, 'invalid', '2026-10-01T11:00:00'):
            self.assertEqual(refresh_delay(value, REFRESH_INTERVAL, now), 0)
        self.assertEqual(refresh_delay('2026-10-03T12:00:00+00:00', REFRESH_INTERVAL, now), REFRESH_INTERVAL)
