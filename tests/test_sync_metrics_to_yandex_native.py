import importlib.util
import pathlib
import unittest
from unittest import mock


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "sync-metrics-to-yandex-native.py"


def load_sync_module():
    spec = importlib.util.spec_from_file_location("sync_metrics_to_yandex_native", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class SyncMetricsToYandexNativeTest(unittest.TestCase):
    def test_main_treats_empty_prometheus_results_as_skipped_cycle(self):
        module = load_sync_module()

        with mock.patch.object(module, "_query_prometheus", return_value=None):
            with mock.patch.object(module, "_write_to_native") as write_to_native:
                result = module.main()

        self.assertEqual(result, 0)
        write_to_native.assert_not_called()


if __name__ == "__main__":
    unittest.main()
