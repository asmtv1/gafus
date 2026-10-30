"""Local no-network safety contracts for the optional external readiness probe."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

ROOT = Path('/Users/asmtv1/Desktop/gafus-refactor')
FILE = ROOT / 'scripts/refactor/gallery-external-api-readiness.py'
spec = importlib.util.spec_from_file_location('gallery_external_provider_preflight', FILE)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ExternalProviderSafety(unittest.TestCase):
    def test_beget_only_uses_single_expected_service_read(self):
        mock_response = {'service': {
            'id': mod.BEGET_SERVICE, 'status': 'RUNNING',
            'cdn': {'source_domain': {'domain': 'not-displayed'},
                    'settings': {'caching_time': 86400}},
        }}
        with patch.object(mod, 'env_file', return_value={'BEGET_CDN_API_TOKEN': 'a' * 30}), \
             patch.object(mod, 'fetch_json', return_value=(200, mock_response)) as fetch:
            self.assertTrue(mod.beget_readiness())
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(fetch.call_args.args[0],
                             'https://api.beget.com/v1/cloud/' + mod.BEGET_SERVICE)
            self.assertEqual(fetch.call_args.kwargs['token'], 'a' * 30)

    def test_cloudru_missing_sandbox_fails_without_any_http(self):
        missing = ROOT / '.local-pg-scratch/no-cloudru-creds-for-unit-test.env'
        with patch.object(mod, 'CLOUD_SANDBOX', missing), \
             patch.object(mod, 'fetch_json') as fetch:
            self.assertFalse(mod.cloudru_readiness())
            fetch.assert_not_called()

    def test_cloudru_rejects_unscoped_or_production_job_before_http(self):
        for job in ('gafus-gallery-process', 'gafus-gallery-process-2',
                    'gafus-refactor-gallery-../../prod'):
            with self.subTest(job=job):
                fake_file = MagicMock()
                fake_file.exists.return_value = True
                env = {'GAFUS_REFACTOR_CLOUDRU_SANDBOX': 'true',
                       'CLOUDRU_PROJECT_ID': '12345678-1234-4123-8123-123456789abc',
                       'CLOUDRU_GALLERY_ISOLATED_JOB': job,
                       'CLOUDRU_KEY_ID': 'f' * 20, 'CLOUDRU_KEY_SECRET': 'a' * 32}
                with patch.object(mod, 'CLOUD_SANDBOX', fake_file), \
                     patch.object(mod, 'env_file', return_value=env), \
                     patch.object(mod, 'fetch_json') as fetch:
                    self.assertFalse(mod.cloudru_readiness())
                    fetch.assert_not_called()

    def test_cloudru_valid_sandbox_only_authenticates_never_executes(self):
        fake_file = MagicMock()
        fake_file.exists.return_value = True
        env = {'GAFUS_REFACTOR_CLOUDRU_SANDBOX': 'true',
               'CLOUDRU_PROJECT_ID': '12345678-1234-4123-8123-123456789abc',
               'CLOUDRU_GALLERY_ISOLATED_JOB': 'gafus-refactor-gallery-test-1',
               'CLOUDRU_KEY_ID': 'f' * 20, 'CLOUDRU_KEY_SECRET': 'a' * 32}
        with patch.object(mod, 'CLOUD_SANDBOX', fake_file), \
             patch.object(mod, 'env_file', return_value=env), \
             patch.object(mod, 'fetch_json', return_value=(200, {'access_token': 't' * 80})) as fetch:
            self.assertTrue(mod.cloudru_readiness())
            fetch.assert_called_once()
            self.assertEqual(fetch.call_args.args[0],
                             'https://iam.api.cloud.ru/api/v1/auth/token')
            self.assertNotIn('execute', str(fetch.call_args))

    def test_disallows_arbitrary_external_hosts(self):
        with self.assertRaisesRegex(ValueError, 'REFUSE_UNEXPECTED_PROVIDER_HOST'):
            mod.fetch_json('https://attacker.invalid/anything', token='redacted')


if __name__ == '__main__':
    unittest.main()
