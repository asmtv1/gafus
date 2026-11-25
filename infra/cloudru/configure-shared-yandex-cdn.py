#!/usr/bin/env python3
"""Configure one existing, inactive GAFUS CDN resource. Never creates a resource or changes DNS.
Secrets are read from production via SSH; never printed.
"""
import json, re, subprocess, urllib.request, urllib.error, sys
from pathlib import Path

FOLDER = 'b1gjbsvfnd1fl68k43g6'
RESOURCE = 'bc8rr3yxsrkobnonoi2w'
URL = 'https://cdn.api.cloud.yandex.net/cdn/v1/rules'

def yc(*args):
    return subprocess.check_output(['yc', *args], text=True).strip()

def config():
    remote = subprocess.check_output(['ssh','-o','BatchMode=yes','-i',str(Path.home()/'.ssh/gafus_server_key'),'root@185.239.51.125', 'docker exec gafus-api node -e \'console.log(JSON.stringify([process.env.GALLERY_CDN_REDIRECT_SIGNING_SECRET,process.env.GALLERY_CDN_REDIRECT_ORIGIN_SECRET]))\''], text=True)
    sign, origin = json.loads(remote)
    assert re.fullmatch(r'[A-Za-z0-9_-]{24,32}',sign) and re.fullmatch(r'[A-Za-z0-9]{32,128}',origin)
    return sign, origin

def opt(value): return {'enabled':True,'value':value}

def rule(name, pattern, priority, group=None, host=None, options=None):
    assert len(pattern)<=100
    body={'resourceId':RESOURCE,'name':name,'rulePattern':pattern,'weight':str(priority),'options':options or {}}
    if group:
        body.update(originsGroupId=group,originProtocol='HTTPS')
        body['options']['hostOptions']={'host':opt(host)}
    return body

def desired(sign,origin):
    public={'edgeCacheSettings':{'enabled':True,'value':{'simpleValue':'180'}},'browserCacheSettings':opt('180'),'allowedHttpMethods':opt(['GET','HEAD','OPTIONS']),'cors':opt(['*'])}
    private={'edgeCacheSettings':{'enabled':True,'defaultValue':'0'},'browserCacheSettings':{'enabled':False},'followRedirects':{'enabled':False},'allowedHttpMethods':opt(['GET','HEAD']),'secureKey':{'enabled':True,'key':sign,'type':'DISABLE_IP_SIGNING'},'staticRequestHeaders':opt({'x-gafus-gallery-origin-secret':origin,'x-gafus-gallery-origin-mode':'yandex-stream-v1'}),'queryParamsOptions':{'ignoreQueryString':opt(True)},'staticHeaders':opt({'Cache-Control':'private, no-store'})}
    return [rule('deny-other-paths','.*',9999,options={'staticResponse':{'enabled':True,'code':'404','content':'Not found'}}),
        rule('feed-finals',r'^/media/v2/[A-Za-z0-9_-]+/v[1-9][0-9]*/(image/[sml]\.webp|video/(360|720)\.mp4|poster\.webp)$',10,'6089316755496514604','gafus-feed-private.s3.cloud.ru',{**public,'queryParamsOptions':{'ignoreQueryString':opt(True)}}),
        rule('chat2-finals',r'^/chat2/[\w-]+/[\w-]+/[a-fA-F0-9-]{36}/v1/(image/[sm]\.webp|video/(360|720|1080)\.mp4|poster\.webp)$',20,'1458205181430060608','gafus-chat2-media-2026.s3.cloud.ru',dict(public)),
        rule('questions-finals',r'^/questions/uploads/questions/v2/[\w-]+/[a-fA-F0-9-]{36}/v1/image/[sm]\.webp$',25,'4548655483993381843','gafus-questions-public.s3.cloud.ru',dict(public)),
        rule('gallery-album',r'^/albums/[\w-]+/[\w-]+/photos/[\w-]+/(thumb|full)\.webp$',30,'5687968647899802819','api.gafus.ru',dict(private)),
        rule('gallery-v2',r'^/gallery/[\w-]+/media/[\w-]+/v2/(thumb|full)\.webp$',31,'5687968647899802819','api.gafus.ru',dict(private)),
        rule('gallery-vet-preview',r'^/users/[\w-]+/pets/[\w-]+/vet-visits/[\w-]+/[\w-]+/thumb\.webp$',32,'5687968647899802819','api.gafus.ru',dict(private))]

def main():
    assert sys.argv[1:] in (['--apply'],['--check']), 'explicit --apply or --check required'
    apply = sys.argv[1:] == ['--apply']
    resource=json.loads(yc('cdn','resource','get','--id',RESOURCE,'--folder-id',FOLDER,'--format','json'))
    assert resource['cname']=='cdn.gafus.ru', 'wrong resource'
    assert not apply or not resource.get('active'), 'refuse to edit live resource'
    token=yc('iam','create-token')
    def req(method,url,body=None):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method),timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'CDN API HTTP {e.code}; rule request rejected (details suppressed to protect credentials)') from None
    existing=req('GET',URL+'?resourceId='+RESOURCE).get('rules',[])
    by_name={x['name']:x for x in existing}
    targets=desired(*config())
    assert set(by_name).issubset({b['name'] for b in targets}), 'unexpected rule'
    def subset(expected,actual):
        if isinstance(expected,dict):
            return isinstance(actual,dict) and all(k in actual and subset(v,actual[k]) for k,v in expected.items())
        return expected==actual
    if apply:
        parent={'options':{'edgeCacheSettings':{'enabled':True,'defaultValue':'0'},'staticHeaders':opt({'Cache-Control':'private, no-store'})},'updateMask':'options.edgeCacheSettings,options.staticHeaders'}
        result=req('PATCH','https://cdn.api.cloud.yandex.net/cdn/v1/resources/'+RESOURCE,parent)
        assert result.get('done') and not result.get('error'), 'resource default cache update not confirmed'
        for body in targets:
            name=body['name']
            if name in by_name:
                old=by_name[name]
                assert str(old['weight'])==body['weight'],f'Existing rule priority mismatch: {name}'
                keys=['rulePattern','options']
                if 'originsGroupId' in body: keys+=['originsGroupId','originProtocol']
                patch={'resourceId':RESOURCE,**{k:body[k] for k in keys},'updateMask':','.join(keys)}
                result=req('PATCH',URL+'/'+old['id'],patch)
            else:
                result=req('POST',URL,body)
            assert result.get('done') and not result.get('error'),f'{name}: rule update not confirmed'
    rules={r['name']:r for r in req('GET',URL+'?resourceId='+RESOURCE).get('rules',[])}
    assert set(rules)=={b['name'] for b in targets}, 'rule set mismatch'
    for body in targets:
        name=body['name']; actual=rules[name]
        for k in ('rulePattern','weight','originsGroupId','originProtocol'):
            if k in body: assert str(actual.get(k))==str(body[k]), f'{name}: {k} mismatch'
        options=body['options'].copy()
        # Header names are case-insensitive. The album rule can also carry
        # explicit max-age=0 and diagnostic headers without enabling cache.
        static=options.pop('staticHeaders',None)
        assert subset(options,actual.get('options',{})),f'{name}: options mismatch'
        if static:
            headers=actual['options'].get('staticHeaders',{})
            value={k.lower():v for k,v in headers.get('value',{}).items()}.get('cache-control','')
            assert headers.get('enabled') and {'private','no-store'}.issubset({x.strip() for x in value.split(',')}), f'{name}: unsafe cache headers'
        print(name,'verified')
    current=req('GET','https://cdn.api.cloud.yandex.net/cdn/v1/resources/'+RESOURCE)
    assert subset({'enabled':True,'defaultValue':'0'},current.get('options',{}).get('edgeCacheSettings')), 'unsafe resource default cache'
    print('SHARED_CDN_CONTROL_PLANE_PASS')

if __name__=='__main__': main()
