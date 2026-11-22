import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('provision',
    Path(__file__).with_name('provision-api-metrics-key.py'))
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


class ProvisionTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.root = Path(self.dir.name)
        self.target = self.root / 'next.env'
        self.prev = self.root / 'previous.env'
        self.target.write_text('EXISTING=unchanged\n')

    def test_first_deploy_generates_unique_key(self):
        self.assertEqual(mod.provision(self.target, self.prev), 'generated')
        a = mod.read_key(self.target)
        self.assertEqual(len(a), 64)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(mod.provision(self.target, self.prev), 'existing-release')
        self.assertEqual(mod.read_key(self.target), a)

    def test_existing_key_survives_full_release(self):
        key = 'a' * 64
        self.prev.write_text('API_METRICS_KEY=' + key + '\n')
        self.assertEqual(mod.provision(self.target, self.prev), 'preserved')
        self.assertEqual(mod.read_key(self.target), key)
        self.assertIn('EXISTING=unchanged', self.target.read_text())

    def test_explicit_rotation_wins(self):
        self.prev.write_text('API_METRICS_KEY=' + 'b' * 64 + '\n')
        self.target.write_text('API_METRICS_KEY=' + 'c' * 64 + '\n')
        self.assertEqual(mod.provision(self.target, self.prev), 'existing-release')
        self.assertEqual(mod.read_key(self.target), 'c' * 64)

    def test_bad_or_duplicate_keys_fail_closed(self):
        self.prev.write_text('API_METRICS_KEY=too-short\n')
        with self.assertRaises(ValueError):
            mod.provision(self.target, self.prev)
        self.prev.write_text('API_METRICS_KEY=' + 'x' * 64 + '\nAPI_METRICS_KEY=' + 'y' * 64 + '\n')
        with self.assertRaises(ValueError):
            mod.provision(self.target, self.prev)


if __name__ == '__main__':
    unittest.main()
