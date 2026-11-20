"""The retired Yandex Monitoring exporter must not regain a live entrypoint."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class RetiredYandexExporterTest(unittest.TestCase):
    def test_deleted_native_exporter_cannot_be_scheduled_or_invoked(self):
        legacy = "sync-metrics-to-yandex-native.py"
        self.assertFalse((ROOT / "scripts" / legacy).exists())
        active_files = (
            ROOT / ".github/workflows/ci-cd.yml",
            ROOT / ".github/workflows/deploy-only.yml",
            ROOT / ".github/workflows/gafus-self-hosted-ota-production.yml",
            ROOT / "ci-cd/docker/docker-compose.prod.yml",
            ROOT / "package.json",
        )
        for file in active_files:
            with self.subTest(source=file.name):
                self.assertTrue(file.exists(), f"expected active release source: {file}")
                self.assertNotIn(legacy, file.read_text())
        # Live sender and retired-provider contracts remain enforced by Node QA.
        guard = ROOT / "scripts/observability/retired-legacy-monitoring.test.mjs"
        self.assertTrue(guard.exists())
        self.assertIn("monitoring", guard.read_text().lower())


if __name__ == "__main__":
    unittest.main()
