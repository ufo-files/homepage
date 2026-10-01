import unittest
from live_source_inventory import merge_row

class LiveInventoryTests(unittest.TestCase):
    def test_independent_update_preserves_other_source_age(self):
        original = dict(generatedAt='old',sources=[dict(name='AA',checkedAt='old',totalFiles=141),dict(name='AFU',checkedAt='older',totalFiles=100)])
        result=merge_row(original,dict(name='AA',totalFiles=142),'new')
        self.assertEqual(result['sources'][0]['checkedAt'],'new')
        self.assertEqual(result['sources'][1]['checkedAt'],'older')
        self.assertEqual(original['sources'][0]['totalFiles'],141)
