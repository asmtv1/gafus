#!/usr/bin/env python3
"""Fail closed on the actual native OTA metadata, not JS string occurrences."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import re
import struct
import xml.etree.ElementTree as ET
import zipfile

ANDROID = "http://schemas.android.com/apk/res/android"
PREFIX = "expo.modules.updates."
PROD = "https://gafus.ru/ota/manifest"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def varint(data, i):
    result = 0
    for shift in range(0, 70, 7):
        c = data[i]
        i += 1
        result |= (c & 127) << shift
        if c < 128:
            return result, i
    raise ValueError("invalid protobuf varint")


def fields(data):
    i = 0
    while i < len(data):
        tag, i = varint(data, i)
        require(tag >> 3, "invalid protobuf field")
        wire = tag & 7
        if wire == 0:
            value, i = varint(data, i)
        elif wire == 2:
            size, i = varint(data, i)
            require(i + size <= len(data), "truncated protobuf field")
            value = data[i:i+size]
            i += size
        elif wire in (1, 5):
            size = 8 if wire == 1 else 4
            require(i + size <= len(data), "truncated protobuf field")
            value = data[i:i+size]
            i += size
        else:
            raise ValueError("unsupported protobuf wire type")
        yield tag >> 3, value


def aab_element(node):
    # AAPT2 Resources.proto: XmlNode.element=1; XmlElement.name=3,
    # attribute=4, child=5; XmlAttribute namespace_uri/name/value=1/2/3.
    elements = [v for n, v in fields(node) if n == 1]
    if not elements:
        return None  # whitespace XmlNode.text
    require(len(elements) == 1, "ambiguous AAB XML element")
    parts = list(fields(elements[0]))
    name = next(v.decode() for n, v in parts if n == 3)
    elem = ET.Element(name)
    for n, value in parts:
        if n == 4:
            attr = dict(fields(value))
            key = attr[2].decode()
            if attr.get(1):
                key = "{" + attr[1].decode() + "}" + key
            require(key not in elem.attrib, "duplicate AAB XML attribute")
            elem.set(key, attr.get(3, b"").decode())
        elif n == 5:
            child = aab_element(value)
            if child is not None:
                elem.append(child)
    return elem


def apk_manifest(data):
    # Android binary XML (ResXMLTree). Read the real string pool and start
    # element attributes; no SDK tools or lossy XML rendering needed.
    def u16(i): return struct.unpack_from("<H", data, i)[0]
    def u32(i): return struct.unpack_from("<I", data, i)[0]
    require(u16(0) == 3 and u32(4) == len(data), "invalid APK binary XML")
    strings = []
    stack = []
    root = None
    pos = u16(2)
    while pos < len(data):
        kind, header, size = u16(pos), u16(pos+2), u32(pos+4)
        require(8 <= header <= size and pos+size <= len(data), "invalid APK XML chunk")
        if kind == 1:
            count, flags, start = u32(pos+8), u32(pos+16), u32(pos+20)
            def length8(i):
                n = data[i]
                return (((n & 127) << 8) | data[i+1], i+2) if n & 128 else (n, i+1)
            def length16(i):
                n = u16(i)
                return (((n & 32767) << 16) | u16(i+2), i+4) if n & 32768 else (n, i+2)
            for n in range(count):
                i = pos + start + u32(pos+header+4*n)
                if flags & 256:
                    _, i = length8(i)
                    length, i = length8(i)
                    strings.append(data[i:i+length].decode("utf-8"))
                else:
                    length, i = length16(i)
                    strings.append(data[i:i+2*length].decode("utf-16le"))
        elif kind == 0x102:
            ext = pos + header
            elem = ET.Element(strings[u32(ext+4)])
            start, stride, count = u16(ext+8), u16(ext+10), u16(ext+12)
            require(stride >= 20 and ext+start+stride*count <= pos+size, "invalid APK XML attributes")
            for n in range(count):
                i = ext + start + stride*n
                ns, name, raw = u32(i), u32(i+4), u32(i+8)
                key = strings[name] if ns == 0xffffffff else "{"+strings[ns]+"}"+strings[name]
                value_type, value = data[i+15], u32(i+16)
                if raw != 0xffffffff: text = strings[raw]
                elif value_type == 3: text = strings[value]
                elif value_type == 0x12: text = "true" if value else "false"
                else: text = str(value)
                require(key not in elem.attrib, "duplicate APK XML attribute")
                elem.set(key, text)
            if stack: stack[-1].append(elem)
            else:
                require(root is None, "multiple APK XML roots")
                root = elem
            stack.append(elem)
        elif kind == 0x103:
            require(bool(stack), "unbalanced APK XML")
            stack.pop()
        pos += size
    require(not stack, "unbalanced APK XML")
    return root


def metadata(root):
    require(root is not None and root.tag == "manifest", "missing Android manifest")
    apps = root.findall("application")
    require(len(apps) == 1, "ambiguous Android application")
    result = {}
    for item in apps[0].findall("meta-data"):
        name = item.get("{" + ANDROID + "}name", "")
        if name.startswith(PREFIX):
            key = name[len(PREFIX):]
            require(key not in result, "duplicate OTA metadata " + key)
            result[key] = item.get("{" + ANDROID + "}value")
    return result


def check_endpoint(url, environment):
    if environment == "production":
        require(url == PROD, "production OTA endpoint must be " + PROD + "; got " + str(url))
    else:
        require(isinstance(url, str) and re.fullmatch(r"https://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.gafus\.ru/ota/manifest", url) and
                url not in ("https://api.gafus.ru/ota/manifest", "https://www.gafus.ru/ota/manifest"),
                "preview OTA endpoint must be a GAFUS subdomain; got " + str(url))


def check_native(url, mode, enabled, certificate, signing, headers, environment):
    check_endpoint(url, environment)
    require(mode == "NEVER", "native OTA auto-check must be NEVER")
    require(enabled is True or enabled == "true", "native OTA must be enabled")
    require(isinstance(certificate, str) and "BEGIN CERTIFICATE" in certificate, "native OTA certificate missing")
    require(isinstance(signing, dict) and signing.get("alg") == "rsa-v1_5-sha256" and signing.get("keyid"), "native OTA signing metadata missing")
    require(isinstance(headers, dict) and headers.get("expo-channel-name") == environment and
            re.fullmatch(r"[a-fA-F0-9]{64}", headers.get("x-gafus-native-fingerprint", "")), "native OTA channel/fingerprint missing")


def check_descriptor(d, platform, environment):
    require(isinstance(d, dict) and d.get("appId") == "gafus" and d.get("platform") == platform and
            d.get("bundleId") == "ru.gafus.app" and d.get("environment") == environment and
            d.get("channel") == environment, "registered descriptor scope mismatch")
    require(re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", d.get("appVersion", "")) and
            d.get("runtimeVersion") == d.get("appVersion") and
            re.fullmatch(r"[1-9][0-9]{0,9}", d.get("buildNumber", "")), "registered descriptor version invalid")
    require(re.fullmatch(r"[a-fA-F0-9]{64}", d.get("nativeFingerprint", "")) and d.get("id") and
            d.get("signingKeyId") and isinstance(d.get("certificatePem"), str), "registered descriptor trust invalid")
    require(hashlib.sha256(d["certificatePem"].encode()).hexdigest() == d.get("certificateSha256"),
            "registered descriptor certificate digest mismatch")
    check_endpoint(d.get("updateUrl"), environment)


def check_registered_trust(url, certificate, signing, headers, d):
    require(url == d["updateUrl"] and signing.get("keyid") == d["signingKeyId"] and
            headers.get("expo-channel-name") == d["channel"] and
            headers.get("x-gafus-native-fingerprint") == d["nativeFingerprint"],
            "native registered descriptor trust mismatch")
    # XML/plist encoders may normalize final newlines; PEM contents must match.
    require(certificate.replace("\r\n", "\n").strip() == d["certificatePem"].replace("\r\n", "\n").strip(),
            "native registered descriptor certificate mismatch")


def check_android(root, config, environment, descriptor=None):
    m = metadata(root)
    url = m.get("EXPO_UPDATE_URL")
    # Expo omits EXPO_UPDATES_ENABLED for its enabled-by-default case.
    check_native(url, m.get("EXPO_UPDATES_CHECK_ON_LAUNCH"), m.get("ENABLED", m.get("EXPO_UPDATES_ENABLED", "true")),
                 m.get("CODE_SIGNING_CERTIFICATE"), json.loads(m.get("CODE_SIGNING_METADATA") or "{}"),
                 json.loads(m.get("UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY") or "{}"), environment)
    updates = config.get("updates", {})
    extra = config.get("extra", {})
    require(updates.get("url") == url and updates.get("enabled", True) is True and updates.get("checkAutomatically") == "NEVER", "embedded Android OTA config mismatch")
    require(extra.get("otaTransport") == "self-hosted" and extra.get("otaEnvironment") == environment and
            extra.get("otaChannel") == environment and extra.get("otaNativeReleaseId"), "embedded Android OTA identity missing")
    headers = json.loads(m["UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY"])
    require(extra.get("otaNativeFingerprint") == headers["x-gafus-native-fingerprint"], "embedded Android OTA fingerprint mismatch")
    if descriptor is not None:
        d = descriptor
        check_descriptor(d, "android", environment)
        check_registered_trust(url, m["CODE_SIGNING_CERTIFICATE"], json.loads(m["CODE_SIGNING_METADATA"]), headers, d)
        require(root.get("package") == d["bundleId"] and
                root.get("{" + ANDROID + "}versionName") == d["appVersion"] and
                root.get("{" + ANDROID + "}versionCode") == d["buildNumber"],
                "Android native package/version/build does not match registered descriptor")
        require(config.get("version") == d["appVersion"] and
                str(config.get("android", {}).get("versionCode")) == d["buildNumber"] and
                extra.get("otaNativeReleaseId") == d["id"],
                "Android embedded build identity does not match registered descriptor")
        runtime = config.get("runtimeVersion")
        require(runtime == d["runtimeVersion"] or runtime == {"policy": "appVersion"},
                "Android embedded runtime does not match registered descriptor")
    return url


def check_ios(p, environment, descriptor=None, info=None):
    check_native(p.get("EXUpdatesURL"), p.get("EXUpdatesCheckOnLaunch"), p.get("EXUpdatesEnabled", True),
                 p.get("EXUpdatesCodeSigningCertificate"), p.get("EXUpdatesCodeSigningMetadata"),
                 p.get("EXUpdatesRequestHeaders"), environment)
    if descriptor is not None:
        d = descriptor
        check_descriptor(d, "ios", environment)
        check_registered_trust(p["EXUpdatesURL"], p["EXUpdatesCodeSigningCertificate"],
                               p["EXUpdatesCodeSigningMetadata"], p["EXUpdatesRequestHeaders"], d)
        require(p.get("EXUpdatesRuntimeVersion") == d["runtimeVersion"], "iOS native runtime mismatch")
        if info is not None:
            require(info.get("CFBundleIdentifier") == d["bundleId"] and
                    info.get("CFBundleShortVersionString") == d["appVersion"] and
                    str(info.get("CFBundleVersion")) == d["buildNumber"], "iOS native build identity mismatch")
    return p["EXUpdatesURL"]


def verify(path, environment="production", descriptor=None):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        if path.suffix.lower() in (".aab", ".apk"):
            prefix = "base/" if path.suffix.lower() == ".aab" else ""
            entry = prefix + "assets/app.config"
            require(names.count(entry) == 1, "missing/duplicate embedded Android config")
            if prefix:
                manifest = "base/manifest/AndroidManifest.xml"
                require(names.count(manifest) == 1, "missing/duplicate AAB manifest")
                root = aab_element(z.read(manifest))
            else:
                require(names.count("AndroidManifest.xml") == 1, "missing/duplicate APK manifest")
                root = apk_manifest(z.read("AndroidManifest.xml"))
            # Check native URL first, before reading embedded metadata.
            check_endpoint(metadata(root).get("EXPO_UPDATE_URL"), environment)
            return check_android(root, json.loads(z.read(entry)), environment, descriptor)
        if path.suffix.lower() == ".ipa":
            entries = [n for n in names if re.fullmatch(r"Payload/[^/]+\.app/Expo\.plist", n)]
            require(len(entries) == 1, "missing/duplicate main IPA Expo.plist")
            info = None
            if descriptor is not None:
                info_path = entries[0].replace("Expo.plist", "Info.plist")
                require(names.count(info_path) == 1, "missing/duplicate main IPA Info.plist")
                info = plistlib.loads(z.read(info_path))
            return check_ios(plistlib.loads(z.read(entries[0])), environment, descriptor, info)
        raise ValueError("expected .apk, .aab or .ipa")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--environment", choices=["production", "preview"], default="production")
    parser.add_argument("--descriptor", type=Path, help="verify exact registered native release identity")
    parser.add_argument("--ios-plist", action="store_true", help="verify built main app Expo.plist before packaging")
    args = parser.parse_args()
    try:
        descriptor = json.loads(args.descriptor.read_text()) if args.descriptor else None
        result = check_ios(plistlib.loads(args.artifact.read_bytes()), args.environment, descriptor) if args.ios_plist else verify(args.artifact, args.environment, descriptor)
        print("GAFUS_NATIVE_OTA_ARTIFACT_PASS", result)
    except Exception as error:
        parser.exit(1, "GAFUS_NATIVE_OTA_ARTIFACT_BLOCKED: " + str(error) + "\n")
