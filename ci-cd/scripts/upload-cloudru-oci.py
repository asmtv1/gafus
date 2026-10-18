"""Publish a complete OCI index with bounded 1 MiB registry PATCH requests."""
import base64
import hashlib
import json
import os
import re
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request


class Registry:
    def __init__(self, image):
        match = re.fullmatch(r'gafus\.cr\.cloud\.ru/(gafus-feed-worker):([0-9a-f]{40})', image)
        if not match:
            raise ValueError('Unapproved immutable image')
        self.repo, self.tag = match.groups()
        self.base = 'https://gafus.cr.cloud.ru'
        self.token = None
        self.deadline = 0
        try:
            self.call('/v2/', auth=False)
            raise ValueError('Missing registry challenge')
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise
            params = dict(re.findall(r'(\w+)="([^"]+)"', error.headers.get('WWW-Authenticate', '')))
        self.realm = params['realm']
        if urllib.parse.urlsplit(self.realm).hostname != 'id.cloud.ru':
            raise ValueError('Unexpected auth endpoint')
        self.service = params['service']

    def authenticate(self):
        if self.token and time.monotonic() < self.deadline:
            return
        # Read the existing Docker login; never pass credentials in command arguments.
        config = os.path.join(os.environ.get('DOCKER_CONFIG', os.path.expanduser('~/.docker')), 'config.json')
        with open(config) as source:
            entry = json.load(source)['auths']['gafus.cr.cloud.ru']
        basic = entry['auth']
        # Validate the shape without exposing its contents.
        if b':' not in base64.b64decode(basic, validate=True):
            raise ValueError('Invalid registry login')
        query = urllib.parse.urlencode({'service': self.service,
                                       'scope': 'repository:' + self.repo + ':pull,push'})
        req = urllib.request.Request(self.realm + '?' + query, headers={'Authorization': 'Basic ' + basic})
        with urllib.request.urlopen(req, timeout=20) as response:
            data = json.load(response)
        self.token = data.get('token') or data.get('access_token')
        self.deadline = time.monotonic() + min(20, max(1, data.get('expires_in', 30) - 10))

    def call(self, path, method='GET', data=None, content_type=None, auth=True):
        url = urllib.parse.urljoin(self.base, path)
        if urllib.parse.urlsplit(url).hostname != 'gafus.cr.cloud.ru':
            raise ValueError('Unexpected registry host')
        headers = {}
        if auth:
            self.authenticate()
            headers['Authorization'] = 'Bearer ' + self.token
        if content_type:
            headers['Content-Type'] = content_type
        return urllib.request.urlopen(urllib.request.Request(url, method=method, data=data, headers=headers), timeout=30)

    def blob(self, archive, descriptor):
        digest = descriptor['digest']
        member = checked_member(archive, descriptor)
        endpoint = '/v2/' + self.repo + '/blobs/' + digest
        try:
            with self.call(endpoint, method='HEAD') as response:
                if response.status != 200:
                    raise ValueError('Unexpected blob HEAD')
            return
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
        upload = None
        complete = False
        try:
            with self.call('/v2/' + self.repo + '/blobs/uploads/', method='POST', data=b'') as response:
                upload = response.headers['Location']
            sent = 0
            started = time.monotonic()
            with archive.extractfile(member) as stream:
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    with self.call(upload, method='PATCH', data=chunk, content_type='application/octet-stream') as response:
                        if response.status != 202:
                            raise ValueError('Unexpected chunk status')
                        upload = response.headers.get('Location', upload)
                    sent += len(chunk)
                    if sent % (8 * 1024 * 1024) == 0:
                        print('LAYER_PROGRESS', digest[:19], sent, '/', member.size, 'SECONDS', round(time.monotonic() - started), flush=True)
            joiner = '&' if '?' in upload else '?'
            with self.call(upload + joiner + urllib.parse.urlencode({'digest': digest}), method='PUT', data=b'') as response:
                if response.status != 201 or response.headers.get('Docker-Content-Digest') != digest:
                    raise ValueError('Blob commit not confirmed')
            complete = True
            print('LAYER_COMMITTED', digest[:19], member.size, flush=True)
        finally:
            if upload and not complete:
                try:
                    with self.call(upload, method='DELETE'):
                        pass
                except Exception:
                    print('INCOMPLETE_UPLOAD_CLEANUP_UNCONFIRMED', flush=True)

    def manifest(self, reference, data, media_type):
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        with self.call('/v2/' + self.repo + '/manifests/' + reference, method='PUT', data=data, content_type=media_type) as response:
            if response.status != 201 or response.headers.get('Docker-Content-Digest') != digest:
                raise ValueError('Manifest commit not confirmed')


def checked_member(archive, descriptor):
    digest = descriptor['digest']
    if not re.fullmatch(r'sha256:[0-9a-f]{64}', digest):
        raise ValueError('Invalid OCI digest')
    member = archive.getmember('blobs/sha256/' + digest[7:])
    if not member.isfile() or member.size != descriptor['size']:
        raise ValueError('OCI size mismatch')
    h = hashlib.sha256()
    with archive.extractfile(member) as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    if h.hexdigest() != digest[7:]:
        raise ValueError('OCI hash mismatch')
    return member


def publish(path, image):
    registry = Registry(image)
    with tarfile.open(path) as archive:
        root = json.load(archive.extractfile('index.json'))
        if len(root['manifests']) != 1:
            raise ValueError('Expected one tagged OCI root')
        seen = set()
        def walk(descriptor):
            if descriptor['digest'] in seen:
                return
            member = checked_member(archive, descriptor)
            with archive.extractfile(member) as stream:
                data = stream.read()
            document = json.loads(data)
            for child in document.get('manifests', []):
                walk(child)
            for child in document.get('layers', []) + ([document['config']] if 'config' in document else []):
                registry.blob(archive, child)
            registry.manifest(descriptor['digest'], data, descriptor['mediaType'])
            seen.add(descriptor['digest'])
        descriptor = root['manifests'][0]
        walk(descriptor)
        with archive.extractfile(checked_member(archive, descriptor)) as stream:
            registry.manifest(registry.tag, stream.read(), descriptor['mediaType'])
        print('OCI_INDEX_PUBLISHED', descriptor['digest'], flush=True)


if __name__ == '__main__':
    try:
        publish(*sys.argv[1:])
    except urllib.error.HTTPError as error:
        print('REGISTRY_HTTP_ERROR', error.code, file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print('REGISTRY_UPLOAD_ERROR', type(error).__name__, file=sys.stderr)
        sys.exit(1)
