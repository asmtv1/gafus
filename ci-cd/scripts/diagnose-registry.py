"""Bounded API/upload diagnosis. Never log credentials, tokens or upload URLs."""
import base64
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = 'https://gafus.cr.cloud.ru'

def request(url, method='GET', data=None, headers=None, timeout=20):
    return urllib.request.urlopen(urllib.request.Request(
        url, data=data, headers=headers or {}, method=method), timeout=timeout)

def report(label, fn):
    try:
        return fn()
    except urllib.error.HTTPError as error:
        print(label, 'HTTP', error.code, flush=True)
    except Exception as error:
        print(label, 'ERROR', type(error).__name__, flush=True)

def api_check():
    with request('https://iam.api.cloud.ru/api/v1/auth/token', method='POST',
                 data=json.dumps({'keyId': os.environ['CLOUDRU_KEY_ID'],
                                  'secret': os.environ['CLOUDRU_KEY_SECRET']}).encode(),
                 headers={'Content-Type': 'application/json'}) as response:
        token = json.load(response)['access_token']
    print('IAM_OK', flush=True)
    for host in ['ar.api.cloud.ru', 'containers.api.cloud.ru']:
        def check():
            with request('https://' + host + '/v1/registries?projectId=' +
                         os.environ['CLOUDRU_PROJECT_ID'],
                         headers={'Authorization': 'Bearer ' + token}) as response:
                print(host, 'HTTP', response.status, flush=True)
        report(host, check)

def upload_check():
    try:
        request(BASE + '/v2/')
        raise RuntimeError('Expected registry authentication challenge')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise
        params = dict(re.findall(r'(\w+)="([^"]+)"',
                                 error.headers.get('WWW-Authenticate', '')))
    realm = params['realm']
    if urllib.parse.urlsplit(realm).hostname != 'id.cloud.ru':
        raise RuntimeError('Untrusted token endpoint')
    query = urllib.parse.urlencode({'service': params['service'],
                                  'scope': 'repository:gafus-feed-worker:pull,push'})
    basic = base64.b64encode((os.environ['CLOUDRU_KEY_ID'] + ':' +
                            os.environ['CLOUDRU_KEY_SECRET']).encode()).decode()
    with request(realm + '?' + query, headers={'Authorization': 'Basic ' + basic}) as response:
        result = json.load(response)
        token = result.get('token') or result.get('access_token')
    headers = {'Authorization': 'Bearer ' + token}
    print('DOCKER_AUTH_OK', flush=True)
    upload = None
    try:
        with request(BASE + '/v2/gafus-feed-worker/blobs/uploads/', method='POST',
                     data=b'', headers=headers) as response:
            upload = urllib.parse.urljoin(BASE, response.headers['Location'])
            print('UPLOAD_OPEN', response.status, flush=True)
        for mib in [1, 16]:
            if urllib.parse.urlsplit(upload).hostname != 'gafus.cr.cloud.ru':
                raise RuntimeError('Unexpected upload host')
            started = time.monotonic()
            print('PATCH_START_MIB', mib, flush=True)
            with request(upload, method='PATCH', data=os.urandom(mib * 1024 * 1024),
                         headers={**headers, 'Content-Type': 'application/octet-stream'},
                         timeout=45) as response:
                upload = urllib.parse.urljoin(BASE, response.headers.get('Location', upload))
                print('PATCH_OK_MIB', mib, 'HTTP', response.status,
                      'SECONDS', round(time.monotonic() - started, 2), flush=True)
    finally:
        if upload and urllib.parse.urlsplit(upload).hostname == 'gafus.cr.cloud.ru':
            def abort():
                with request(upload, method='DELETE', headers=headers) as response:
                    print('TEMP_UPLOAD_ABORTED', response.status, flush=True)
            report('ABORT', abort)

report('API', api_check)
report('REGISTRY_UPLOAD', upload_check)
