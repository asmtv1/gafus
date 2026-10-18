import hashlib
import importlib.util
import io
import json
import tarfile
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('uploader', Path(__file__).with_name('upload-cloudru-oci.py'))
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


class Response:
    def __init__(self, status=202, headers=None):
        self.status = status
        self.headers = headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class UploadTests(unittest.TestCase):
    def fixture(self):
        data = b'a' * (2 * 1024 * 1024 + 7)
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        descriptor = {'digest': digest, 'size': len(data)}
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w') as archive:
            entry = tarfile.TarInfo('blobs/sha256/' + digest[7:])
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        output.seek(0)
        return tarfile.open(fileobj=output), descriptor

    def registry(self):
        r = u.Registry.__new__(u.Registry)
        r.repo = 'gafus-feed-worker'
        return r

    def test_chunk_size_digest_commit_and_content_range(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        sizes = []
        received = bytearray()

        def call(path, method='GET', data=None, extra_headers=None, **kwargs):
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(headers={'Location': '/upload?state=0'})
            if method == 'PATCH':
                start = len(received)
                self.assertEqual(extra_headers['Content-Range'], f'{start}-{start + len(data) - 1}')
                received.extend(data)
                sizes.append(len(data))
                return Response(headers={'Location': '/upload?state=' + str(len(received)),
                                         'Range': '0-' + str(len(received) - 1)})
            if method == 'PUT':
                self.assertIn('&digest=sha256%3A', path)
                self.assertEqual(bytes(received), b'a' * descriptor['size'])
                return Response(201, {'Docker-Content-Digest': descriptor['digest']})
            self.fail('Unexpected request ' + method)

        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertEqual(sizes, [1048576, 1048576, 7])

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_retry_after_rejected_chunk_shrinks_without_duplicate_bytes(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        received = bytearray()
        patch_sizes = []
        attempts = 0

        def call(path, method='GET', data=None, extra_headers=None, **kwargs):
            nonlocal attempts
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(headers={'Location': '/upload'})
            if method == 'GET':
                return Response(204, {'Location': '/upload', 'Range': '0-' + str(max(0, len(received) - 1))})
            if method == 'PATCH':
                patch_sizes.append(len(data))
                attempts += 1
                if attempts == 1:
                    raise urllib.error.URLError(TimeoutError('network timeout'))
                start = len(received)
                self.assertEqual(extra_headers['Content-Range'], f'{start}-{start + len(data) - 1}')
                received.extend(data)
                return Response(202, {'Range': '0-' + str(len(received) - 1)})
            if method == 'PUT':
                self.assertEqual(bytes(received), b'a' * descriptor['size'])
                return Response(201, {'Docker-Content-Digest': descriptor['digest']})
            self.fail(method)

        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertEqual(patch_sizes[:2], [1048576, 524288])
        self.assertEqual(bytes(received), b'a' * descriptor['size'])

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_partially_accepted_chunk_resumes_from_verified_byte_offset(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        received = bytearray()
        ranges = []

        def call(path, method='GET', data=None, extra_headers=None, **kwargs):
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(202, {'Location': '/upload'})
            if method == 'GET':
                return Response(204, {'Range': '0-' + str(len(received) - 1)})
            if method == 'PATCH':
                start = len(received)
                ranges.append(extra_headers['Content-Range'])
                if start == 0:
                    received.extend(data[:262144])
                    raise urllib.error.URLError(TimeoutError('partial send'))
                received.extend(data)
                return Response(202, {'Range': '0-' + str(len(received) - 1)})
            if method == 'PUT':
                self.assertEqual(len(received), descriptor['size'])
                return Response(201, {'Docker-Content-Digest': descriptor['digest']})
            self.fail(method)

        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertEqual(ranges[:2], ['0-1048575', '262144-1310719'])
        self.assertEqual(len(received), descriptor['size'])

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_lost_patch_response_recovers_accepted_range_without_reupload(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        received = bytearray()
        starts = []

        def call(path, method='GET', data=None, extra_headers=None, **kwargs):
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(headers={'Location': '/upload'})
            if method == 'GET':
                return Response(204, {'Location': '/upload', 'Range': '0-' + str(len(received) - 1)})
            if method == 'PATCH':
                start = len(received)
                starts.append(start)
                self.assertEqual(extra_headers['Content-Range'], f'{start}-{start + len(data) - 1}')
                received.extend(data)
                if start == 0:
                    raise urllib.error.URLError(TimeoutError('response lost after commit'))
                return Response(202, {'Range': '0-' + str(len(received) - 1)})
            if method == 'PUT':
                return Response(201, {'Docker-Content-Digest': descriptor['digest']})
            self.fail(method)

        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertEqual(starts, [0, 1048576, 2097152])
        self.assertEqual(len(received), descriptor['size'])

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_uncertain_offset_must_fail_closed_and_delete_upload(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        methods = []

        def call(path, method='GET', **kwargs):
            methods.append(method)
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(headers={'Location': '/upload'})
            if method == 'PATCH':
                raise urllib.error.URLError(TimeoutError('unknown'))
            if method == 'GET':
                return Response(204, {'Range': '0-2000000', 'Location': '/upload'})
            if method == 'DELETE':
                return Response(204)
            self.fail(method)

        registry.call = call
        with archive, self.assertRaisesRegex(ValueError, 'offset outside'):
            registry.blob(archive, descriptor)
        self.assertNotIn('PUT', methods)
        self.assertEqual(methods[-1], 'DELETE')

    def test_does_not_retry_invalid_tls_or_authorization(self):
        for error in [urllib.error.HTTPError('/upload', 401, '', {}, None),
                      urllib.error.HTTPError('/upload', 403, '', {}, None),
                      ValueError('bad digest')]:
            self.assertFalse(u.Registry.transient(error))

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_lost_blob_commit_ack_verified_by_digest_head(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        received = bytearray()
        committed = False
        methods = []

        def call(path, method='GET', data=None, **kwargs):
            nonlocal committed
            methods.append(method)
            if method == 'HEAD':
                if committed:
                    return Response(200, {'Docker-Content-Digest': descriptor['digest']})
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(headers={'Location': '/upload'})
            if method == 'PATCH':
                received.extend(data)
                return Response(202, {'Range': '0-' + str(len(received) - 1)})
            if method == 'PUT':
                self.assertEqual(len(received), descriptor['size'])
                committed = True
                raise urllib.error.URLError(TimeoutError('commit response lost'))
            self.fail(method)

        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertTrue(committed)
        self.assertEqual(methods.count('PUT'), 1)
        self.assertNotIn('DELETE', methods)

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_manifest_lost_response_detects_committed_digest(self):
        registry = self.registry()
        data = b'{"schemaVersion":2}'
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        events = []

        def call(path, method='GET', data=None, **kwargs):
            events.append(method)
            if method == 'PUT':
                raise urllib.error.URLError(TimeoutError('manifest response lost'))
            if method == 'HEAD':
                return Response(200, {'Docker-Content-Digest': digest})
            self.fail(method)

        registry.call = call
        registry.manifest('sha256:' + 'b' * 64, data, 'application/vnd.oci.image.manifest.v1+json')
        self.assertEqual(events, ['PUT', 'HEAD'])

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_manifest_transient_retry_requires_correct_final_digest(self):
        registry = self.registry()
        data = b'{"schemaVersion":2}'
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        methods = []

        def call(path, method='GET', **kwargs):
            methods.append(method)
            if method == 'PUT' and methods.count('PUT') == 1:
                raise urllib.error.HTTPError(path, 503, '', {}, None)
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'PUT':
                return Response(201, {'Docker-Content-Digest': digest})
            self.fail(method)

        registry.call = call
        registry.manifest('sha256:' + 'b' * 64, data, 'application/vnd.oci.image.manifest.v1+json')
        self.assertEqual(methods, ['PUT', 'HEAD', 'PUT'])

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_upload_status_retries_transient_get_but_rejects_wrong_bytes(self):
        registry = self.registry()
        attempts = []

        def call(path, method='GET', **kwargs):
            attempts.append(method)
            if len(attempts) < 3:
                raise urllib.error.URLError(TimeoutError('temporary'))
            return Response(204, {'Location': '/upload?state=ok', 'Range': 'bytes=0-1048575'})

        registry.call = call
        self.assertEqual(registry.upload_status('/upload', 0, 1048576), ('/upload?state=ok', 1048576))
        self.assertEqual(len(attempts), 3)

    @patch.object(u.time, 'sleep', lambda _: None)
    def test_initial_head_and_session_creation_retry_safe(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        received = bytearray()
        count = {'HEAD': 0, 'POST': 0}

        def call(path, method='GET', data=None, **kwargs):
            if method == 'HEAD':
                count['HEAD'] += 1
                if count['HEAD'] == 1:
                    raise urllib.error.URLError(TimeoutError('head request lost'))
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                count['POST'] += 1
                if count['POST'] == 1:
                    raise urllib.error.URLError(TimeoutError('post request lost'))
                return Response(202, {'Location': '/upload', 'OCI-Chunk-Min-Length': '262144'})
            if method == 'PATCH':
                received.extend(data)
                return Response(202, {'Range': '0-' + str(len(received) - 1)})
            if method == 'PUT':
                return Response(201, {'Docker-Content-Digest': descriptor['digest']})
            self.fail(method)

        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertEqual(count, {'HEAD': 2, 'POST': 2})
        self.assertEqual(len(received), descriptor['size'])

    def test_registry_minimum_rejects_large_unsafe_chunk_requirement(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        requests = []

        def call(path, method='GET', **kwargs):
            requests.append(method)
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(202, {'Location': '/upload', 'OCI-Chunk-Min-Length': '16777216'})
            if method == 'DELETE':
                return Response(204)
            self.fail('Unsafe request ' + method)

        registry.call = call
        with archive, self.assertRaisesRegex(ValueError, 'unsafe large chunks'):
            registry.blob(archive, descriptor)
        self.assertNotIn('PATCH', requests)
        self.assertEqual(requests[-1], 'DELETE')

    def test_unexpected_patch_range_never_issues_commit(self):
        archive, descriptor = self.fixture()
        registry = self.registry()
        methods = []

        def call(path, method='GET', **kwargs):
            methods.append(method)
            if method == 'HEAD':
                raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST':
                return Response(202, {'Location': '/upload'})
            if method == 'PATCH':
                return Response(202, {'Range': '0-16'})
            if method == 'DELETE':
                return Response(204)
            self.fail(method)

        registry.call = call
        with archive, self.assertRaisesRegex(ValueError, 'Unexpected acknowledged range'):
            registry.blob(archive, descriptor)
        self.assertNotIn('PUT', methods)
        self.assertEqual(methods[-1], 'DELETE')

    def test_complete_oci_index_keeps_platform_and_provenance_manifests(self):
        registry = self.registry()
        image_ref = 'gafus.cr.cloud.ru/gafus-feed-worker:' + 'a' * 40
        registry.tag = 'a' * 40
        blobs = {}

        def entry(value, media_type):
            data = (value if isinstance(value, bytes) else json.dumps(value, separators=(',', ':')).encode())
            digest = 'sha256:' + hashlib.sha256(data).hexdigest()
            descriptor = {'mediaType': media_type, 'digest': digest, 'size': len(data)}
            blobs['blobs/sha256/' + digest[7:]] = data
            return descriptor

        layer = entry(b'layer-bytes', 'application/vnd.oci.image.layer.v1.tar+gzip')
        config = entry(b'{}', 'application/vnd.oci.image.config.v1+json')
        image = entry({'schemaVersion': 2, 'config': config, 'layers': [layer]},
                      'application/vnd.oci.image.manifest.v1+json')
        provenance = entry({'schemaVersion': 2, 'config': config, 'layers': [layer],
                            'annotations': {'vnd.docker.reference.type': 'attestation-manifest'}},
                           'application/vnd.oci.image.manifest.v1+json')
        root = entry({'schemaVersion': 2, 'manifests': [image, provenance]},
                     'application/vnd.oci.image.index.v1+json')
        blobs['index.json'] = json.dumps({'schemaVersion': 2, 'manifests': [root]}).encode()
        written_manifests = []
        written_blobs = []
        registry.blob = lambda archive, descriptor: written_blobs.append(descriptor['digest'])
        registry.manifest = lambda ref, data, media: written_manifests.append((ref, data, media))

        with tempfile.TemporaryDirectory(dir=str(Path(__file__).parent)) as folder:
            path = Path(folder) / 'image.tar'
            with tarfile.open(path, 'w') as tar:
                for name, data in blobs.items():
                    metadata = tarfile.TarInfo(name)
                    metadata.size = len(data)
                    tar.addfile(metadata, io.BytesIO(data))
            with patch.object(u, 'Registry', return_value=registry):
                u.publish(str(path), image_ref)

        self.assertEqual(len(written_blobs), 4)
        self.assertEqual([item[0] for item in written_manifests],
                         [image['digest'], provenance['digest'], root['digest'], registry.tag])
        self.assertEqual(written_manifests[-1][1], blobs['blobs/sha256/' + root['digest'][7:]])

    def test_registry_image_scope_only_allows_feed_worker(self):
        image = 'gafus.cr.cloud.ru/gafus-feed-worker:' + 'a' * 40
        with patch.object(u.Registry, 'call', side_effect=urllib.error.HTTPError(
                '/v2/', 401, '', {'WWW-Authenticate':
                    'Bearer realm="https://id.cloud.ru/token",service="gafus.cr.cloud.ru"'}, None)):
            client = u.Registry(image)
        self.assertEqual(client.repo, 'gafus-feed-worker')
        self.assertEqual(client.tag, 'a' * 40)
        for name in ('gafus-feed-origin', 'gafus-gallery-origin',
                     'gafus-gallery-worker', 'gafus-questions-worker'):
            with self.assertRaises(ValueError):
                u.Registry('gafus.cr.cloud.ru/' + name + ':' + 'a' * 40)

    def test_rejects_corrupt_oci_before_network(self):
        archive, descriptor = self.fixture()
        descriptor['size'] += 1
        with archive, self.assertRaises(ValueError):
            u.checked_member(archive, descriptor)


if __name__ == '__main__':
    unittest.main()
