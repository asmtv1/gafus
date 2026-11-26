"""Native artifact regression cases; no Android SDK or real signing keys needed."""
import importlib.util
import json
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("ota_guard", Path(__file__).with_name("verify-native-ota-artifact.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
FINGERPRINT = "a" * 64
HEADERS = {"expo-channel-name": "production", "x-gafus-native-fingerprint": FINGERPRINT}
SIGNING = {"alg": "rsa-v1_5-sha256", "keyid": "test"}
CERT = "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----"
URL = guard.PROD


def varint(n):
    out = bytearray()
    while n > 127:
        out.append((n & 127) | 128)
        n >>= 7
    out.append(n)
    return bytes(out)


def field(n, value):
    if isinstance(value, str):
        value = value.encode()
    return varint(n << 3 | 2) + varint(len(value)) + value


def element(name, attrs=(), children=()):
    contents = field(3, name)
    for namespace, key, value in attrs:
        contents += field(4, field(1, namespace) + field(2, key) + field(3, value))
    for child in children:
        contents += field(5, child)
    return field(1, contents)


def manifest(url=URL, **overrides):
    values = {"EXPO_UPDATE_URL": url, "EXPO_UPDATES_CHECK_ON_LAUNCH": "NEVER",
              "ENABLED": "true", "CODE_SIGNING_CERTIFICATE": CERT,
              "CODE_SIGNING_METADATA": json.dumps(SIGNING),
              "UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY": json.dumps(HEADERS)}
    values.update(overrides)
    children = [element("meta-data", [(guard.ANDROID, "name", guard.PREFIX + k), (guard.ANDROID, "value", v)])
                for k, v in values.items()]
    return element("manifest", children=[element("application", children=children)])


def config(url=URL):
    return {"updates": {"url": url, "enabled": True, "checkAutomatically": "NEVER"},
            "extra": {"otaTransport": "self-hosted", "otaEnvironment": "production", "otaChannel": "production",
                      "otaNativeReleaseId": "native-test", "otaNativeFingerprint": FINGERPRINT}}


def ios(url=URL, **overrides):
    return dict(EXUpdatesURL=url, EXUpdatesEnabled=True, EXUpdatesCheckOnLaunch="NEVER",
                EXUpdatesCodeSigningCertificate=CERT, EXUpdatesCodeSigningMetadata=SIGNING,
                EXUpdatesRequestHeaders=HEADERS, **overrides)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def make_aab(self, native, embedded):
        path = Path(self.tmp.name) / "test.aab"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("base/manifest/AndroidManifest.xml", native)
            z.writestr("base/assets/app.config", json.dumps(embedded))
        return path

    def make_ipa(self, plist):
        path = Path(self.tmp.name) / "test.ipa"
        with zipfile.ZipFile(path, "w") as z:
            z.writestr("Payload/Gafus.app/Expo.plist", plistlib.dumps(plist, fmt=plistlib.FMT_BINARY))
        return path

    def test_good_aab_and_ipa(self):
        self.assertEqual(guard.verify(self.make_aab(manifest(), config())), URL)
        self.assertEqual(guard.verify(self.make_ipa(ios())), URL)

    def test_legacy_native_endpoint_even_when_js_has_correct_url(self):
        legacy = "https://u.expo.dev/project"
        with self.assertRaisesRegex(ValueError, "production OTA endpoint"):
            guard.verify(self.make_aab(manifest(legacy), config()))
        with self.assertRaisesRegex(ValueError, "production OTA endpoint"):
            guard.verify(self.make_ipa(ios(legacy)))

    def test_legacy_embedded_config_even_when_native_correct(self):
        with self.assertRaisesRegex(ValueError, "embedded Android OTA config mismatch"):
            guard.verify(self.make_aab(manifest(), config("https://u.expo.dev/project")))

    def test_missing_signing_and_disabled_updates(self):
        for patch in [{"CODE_SIGNING_CERTIFICATE": ""}, {"ENABLED": "false"},
                      {"EXPO_UPDATES_CHECK_ON_LAUNCH": "ALWAYS"}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                guard.verify(self.make_aab(manifest(**patch), config()))
        for key, value in [("EXUpdatesCodeSigningCertificate", ""), ("EXUpdatesEnabled", False), ("EXUpdatesCheckOnLaunch", "ALWAYS")]:
            plist = ios()
            plist[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                guard.verify(self.make_ipa(plist))

    def test_environment_isolation(self):
        for url in ["https://u.expo.dev/ota/manifest", "https://gafus.ru.evil.test/ota/manifest",
                    "https://gafus.ru/ota/manifest", "https://api.gafus.ru/ota/manifest",
                    "https://www.gafus.ru/ota/manifest", "https://qa.gafus.ru:8443/ota/manifest"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                guard.check_endpoint(url, "preview")
        guard.check_endpoint("https://qa.gafus.ru/ota/manifest", "preview")

    def test_duplicate_metadata(self):
        root = guard.aab_element(manifest())
        root.find("application").append(root.find("application/meta-data"))
        with self.assertRaisesRegex(ValueError, "duplicate OTA metadata"):
            guard.metadata(root)

    def test_truncated_or_missing_manifest(self):
        with self.assertRaises(Exception):
            guard.verify(self.make_aab(b"\x0a\xff", config()))
        with self.assertRaises(ValueError):
            guard.verify(self.make_ipa({}))


if __name__ == "__main__":
    unittest.main()
