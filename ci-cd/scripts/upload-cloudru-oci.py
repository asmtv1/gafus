"""Publish a complete OCI index with bounded 1 MiB registry PATCH requests."""
import base64
import hashlib
import json
import os
import re
import ssl
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

    def call(self, path, method='GET', data=None, content_type=None, auth=True, extra_headers=None):
        url = urllib.parse.urljoin(self.base, path)
        if urllib.parse.urlsplit(url).hostname != 'gafus.cr.cloud.ru':
            raise ValueError('Unexpected registry host')
        headers = {}
        if auth:
            self.authenticate()
            headers['Authorization'] = 'Bearer ' + self.token
        if content_type:
            headers['Content-Type'] = content_type
        if extra_headers:
            headers.update(extra_headers)
        return urllib.request.urlopen(urllib.request.Request(url, method=method, data=data, headers=headers), timeout=30)

    @staticmethod
    def transient(error):
        # Authentication rejection, OCI checksum failure and untrusted TLS
        # certificate are permanent failures. Do not retry or conceal them.
        if isinstance(error, urllib.error.HTTPError):
            return error.code in (408, 416, 429, 500, 502, 503, 504)
        reason = error.reason if isinstance(error, urllib.error.URLError) else error
        if isinstance(reason, ssl.SSLCertVerificationError):
            return False
        return isinstance(error, (urllib.error.URLError, TimeoutError, ConnectionError, OSError))

    def upload_status(self, url, sent, length):
        """Recover uncertain PATCH using registry-confirmed offset only."""
        for attempt in range(4):
            try:
                with self.call(url, method='GET') as response:
                    if response.status != 204:
                        raise ValueError('Unexpected upload status code')
                    location = response.headers.get('Location', url)
                    match = re.fullmatch(r'(?:bytes=)?0-(\d+)', response.headers.get('Range', ''))
                    if not match:
                        raise ValueError('Missing upload offset')
                    offset = int(match.group(1)) + 1
                    # OCI implementations commonly return 0-0 for empty uploads.
                    if sent == 0 and offset == 1:
                        offset = 0
                    if not sent <= offset <= sent + length:
                        raise ValueError('Upload offset outside attempted chunk')
                    return location, offset
            except Exception as error:
                if not self.transient(error) or attempt == 3:
                    raise
                print('UPLOAD_STATUS_RETRY', attempt + 1, type(error).__name__, flush=True)
                time.sleep(min(2 ** attempt, 4))
        raise RuntimeError('Upload status retries exhausted')

    def blob(self, archive, descriptor):
        digest = descriptor['digest']
        member = checked_member(archive, descriptor)
        endpoint = '/v2/' + self.repo + '/blobs/' + digest
        for attempt in range(4):
            try:
                with self.call(endpoint, method='HEAD') as response:
                    if response.status != 200:
                        raise ValueError('Unexpected blob HEAD')
                    header_digest = response.headers.get('Docker-Content-Digest', digest)
                    if header_digest != digest:
                        raise ValueError('Existing blob digest mismatch')
                return
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    break
                if not self.transient(error) or attempt == 3:
                    raise
            except Exception as error:
                if not self.transient(error) or attempt == 3:
                    raise
            print('BLOB_HEAD_RETRY', digest[:19], attempt + 1, flush=True)
            time.sleep(min(2 ** attempt, 4))
        upload = None
        complete = False
        try:
            min_chunk_size = 0
            for attempt in range(4):
                try:
                    with self.call('/v2/' + self.repo + '/blobs/uploads/', method='POST', data=b'') as response:
                        if response.status != 202:
                            raise ValueError('Unexpected upload session status')
                        upload = response.headers['Location']
                        minimum = response.headers.get('OCI-Chunk-Min-Length', '0')
                        if not minimum.isdecimal():
                            raise ValueError('Invalid registry minimum chunk size')
                        min_chunk_size = int(minimum)
                        if min_chunk_size > 1024 * 1024:
                            raise ValueError('Registry requires unsafe large chunks')
                    break
                except Exception as error:
                    if not self.transient(error) or attempt == 3:
                        raise
                    print('UPLOAD_START_RETRY', digest[:19], attempt + 1, type(error).__name__, flush=True)
                    time.sleep(min(2 ** attempt, 4))
            sent = 0
            last_progress = 0
            started = time.monotonic()
            print('LAYER_UPLOAD_STARTED', digest[:19], member.size, flush=True)
            chunk_size = max(1024 * 1024, min_chunk_size)
            retries = 0
            with archive.extractfile(member) as stream:
                while sent < member.size:
                    # Re-read from the last byte acknowledged by Cloud.ru.
                    stream.seek(sent)
                    chunk = stream.read(min(chunk_size, member.size - sent))
                    if not chunk:
                        raise ValueError('OCI blob unexpectedly truncated')
                    try:
                        with self.call(upload, method='PATCH', data=chunk,
                                       content_type='application/octet-stream',
                                       extra_headers={'Content-Range': f'{sent}-{sent + len(chunk) - 1}'}) as response:
                            if response.status != 202:
                                raise ValueError('Unexpected chunk status')
                            match = re.fullmatch(r'(?:bytes=)?0-(\d+)', response.headers.get('Range', ''))
                            if not match or int(match.group(1)) + 1 != sent + len(chunk):
                                raise ValueError('Unexpected acknowledged range')
                            upload = response.headers.get('Location', upload)
                        sent += len(chunk)
                        retries = 0
                    except Exception as error:
                        if not self.transient(error) or retries >= 5:
                            raise
                        retries += 1
                        # A timed-out PATCH may already have been accepted.
                        # Never resend unless registry GET proves it was not.
                        upload, actual = self.upload_status(upload, sent, len(chunk))
                        if actual > sent:
                            # Registry might have accepted all or part of the
                            # stream. Resume at its verified next byte only.
                            sent = actual
                            retries = 0
                            print('UPLOAD_ACK_RECOVERED', digest[:19], sent, flush=True)
                        else:
                            chunk_size = max(256 * 1024, min_chunk_size, chunk_size // 2)
                            print('UPLOAD_CHUNK_RETRY', digest[:19], retries,
                                  'BYTES', chunk_size, 'CAUSE', type(error).__name__, flush=True)
                            time.sleep(min(2 ** (retries - 1), 8))
                    if sent - last_progress >= 8 * 1024 * 1024:
                        print('LAYER_PROGRESS', digest[:19], sent, '/', member.size,
                              'SECONDS', round(time.monotonic() - started), flush=True)
                        last_progress = sent
            joiner = '&' if '?' in upload else '?'
            commit_url = upload + joiner + urllib.parse.urlencode({'digest': digest})
            try:
                with self.call(commit_url, method='PUT', data=b'') as response:
                    if response.status != 201 or response.headers.get('Docker-Content-Digest') != digest:
                        raise ValueError('Blob commit not confirmed')
            except Exception as error:
                if not self.transient(error):
                    raise
                # PUT has no payload, but the reply may be lost after commit.
                # Check by content digest before trying to close it again.
                already_committed = False
                for retry in range(4):
                    try:
                        with self.call(endpoint, method='HEAD') as response:
                            if response.status == 200:
                                acknowledged = response.headers.get('Docker-Content-Digest', digest)
                                if acknowledged != digest:
                                    raise ValueError('Committed digest mismatch')
                                already_committed = True
                                break
                    except urllib.error.HTTPError as missing:
                        if missing.code != 404:
                            raise
                    except Exception as transient:
                        if not self.transient(transient) or retry == 3:
                            raise
                    time.sleep(min(2 ** retry, 4))
                if not already_committed:
                    upload, offset = self.upload_status(upload, sent, 0)
                    if offset != member.size:
                        raise ValueError('Cannot safely finish unverified blob')
                    joiner = '&' if '?' in upload else '?'
                    with self.call(upload + joiner + urllib.parse.urlencode({'digest': digest}),
                                   method='PUT', data=b'') as response:
                        if response.status != 201 or response.headers.get('Docker-Content-Digest') != digest:
                            raise ValueError('Blob retry commit not confirmed')
                print('LAYER_COMMIT_ACK_RECOVERED', digest[:19], flush=True)
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
        endpoint = '/v2/' + self.repo + '/manifests/' + reference
        for retry in range(4):
            try:
                with self.call(endpoint, method='PUT', data=data, content_type=media_type) as response:
                    if response.status != 201 or response.headers.get('Docker-Content-Digest') != digest:
                        raise ValueError('Manifest commit not confirmed')
                return
            except Exception as error:
                if not self.transient(error):
                    raise
                # A manifest PUT is idempotent for these digest-pinned bytes.
                # First see whether the lost response was already committed.
                try:
                    with self.call(endpoint, method='HEAD',
                                   extra_headers={'Accept': media_type}) as response:
                        if response.status == 200:
                            if response.headers.get('Docker-Content-Digest') != digest:
                                raise ValueError('Published OCI manifest digest mismatch')
                            print('MANIFEST_ACK_RECOVERED', digest[:19], flush=True)
                            return
                except urllib.error.HTTPError as missing:
                    if missing.code not in (404, 405):
                        raise
                except Exception as temporary:
                    if not self.transient(temporary):
                        raise
                if retry == 3:
                    raise
                print('MANIFEST_RETRY', retry + 1, type(error).__name__, flush=True)
                time.sleep(min(2 ** retry, 4))


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
