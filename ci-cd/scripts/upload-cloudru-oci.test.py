import hashlib
import importlib.util
import io
import tarfile
import unittest
import urllib.error
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('uploader', Path(__file__).with_name('upload-cloudru-oci.py'))
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class Response:
    def __init__(self, status=202, headers=None):
        self.status = status
        self.headers = headers or {}
    def __enter__(self): return self
    def __exit__(self, *args): pass

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

    def test_chunk_size_and_digest_commit(self):
        archive, descriptor = self.fixture()
        registry = u.Registry.__new__(u.Registry)
        registry.repo = 'gafus-feed-worker'
        calls = []
        def call(path, method='GET', data=None, **kwargs):
            calls.append((method, path, data))
            if method == 'HEAD': raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST': return Response(headers={'Location': '/upload?state=0'})
            if method == 'PATCH': return Response(headers={'Location': '/upload?state=' + str(len(calls))})
            if method == 'PUT': return Response(201, {'Docker-Content-Digest': descriptor['digest']})
        registry.call = call
        with archive:
            registry.blob(archive, descriptor)
        self.assertEqual([len(data) for method, _, data in calls if method == 'PATCH'], [1048576, 1048576, 7])
        self.assertIn('&digest=sha256%3A', calls[-1][1])
        self.assertFalse(any(method == 'DELETE' for method, _, _ in calls))

    def test_failed_chunk_never_commits_and_aborts(self):
        archive, descriptor = self.fixture()
        registry = u.Registry.__new__(u.Registry)
        registry.repo = 'gafus-feed-worker'
        methods = []
        def call(path, method='GET', **kwargs):
            methods.append(method)
            if method == 'HEAD': raise urllib.error.HTTPError(path, 404, '', {}, None)
            if method == 'POST': return Response(headers={'Location': '/upload'})
            if method == 'PATCH': raise TimeoutError()
            return Response(204)
        registry.call = call
        with archive, self.assertRaises(TimeoutError): registry.blob(archive, descriptor)
        self.assertNotIn('PUT', methods)
        self.assertEqual(methods[-1], 'DELETE')

    def test_rejects_corrupt_oci_before_network(self):
        archive, descriptor = self.fixture()
        descriptor['size'] += 1
        with archive, self.assertRaises(ValueError): u.checked_member(archive, descriptor)

if __name__ == '__main__': unittest.main()
