#!/usr/bin/env python3
"""Test-only file-backed model of AWS CLI S3 API operations."""
import hashlib
import json
import os
import pathlib
import sys
args=sys.argv[1:]
root=pathlib.Path(os.environ["GAFUS_TEST_S3_ROOT"])
def val(k,default=None):
    try:return args[args.index("--"+k)+1]
    except ValueError:return default
def fail():
    sys.exit(9)
assert val("endpoint-url")=="http://127.0.0.1:19191"
op=args[args.index("s3api")+1];bucket=val("bucket");profile=val("profile")
if bucket not in json.loads((root/"buckets.json").read_text()):fail()
access="archive" if bucket=="archive-bucket" else "target" if bucket.startswith("gafus-restore-") else "source"
if profile!=access:fail()
p=root/bucket
p.mkdir(exist_ok=True)
def loc(key):
    return p/hashlib.sha256(key.encode()).hexdigest()
def read(key):
    return json.loads(loc(key).with_suffix(".json").read_text())
def etag(b):return '"'+hashlib.md5(b).hexdigest()+'"'
def dump(o):print(json.dumps(o))
if op=="get-bucket-acl":
    dump({"Owner":{"ID":"owner"},"Grants":[{"Grantee":{"Type":"CanonicalUser","ID":"owner"},"Permission":"FULL_CONTROL"}]})
elif op=="get-bucket-policy-status":
    dump({"PolicyStatus":{"IsPublic":(root/"public-bucket").exists() and (root/"public-bucket").read_text()==bucket}})
elif op=="list-objects-v2":
    records=[]
    for f in p.glob("*.json"):
        m=json.loads(f.read_text())
        if m["Key"].startswith(val("prefix","")):
            records.append({k:m[k] for k in ("Key","Size","ETag","LastModified")})
    records.sort(key=lambda v:v["Key"])
    start=int(val("continuation-token","0"));end=start+2
    dump({"Contents":records[start:end],"IsTruncated":end<len(records),**({"NextContinuationToken":str(end)} if end<len(records) else {})})
elif op=="get-object":
    key=val("key")
    if not loc(key).is_file():fail()
    m=read(key)
    if val("if-match") not in (None,m["ETag"]):fail()
    pathlib.Path(args[-1]).write_bytes(loc(key).read_bytes())
    dump({k:v for k,v in m.items() if k not in ("Key","Size")})
elif op=="put-object":
    if access=="source" or val("if-none-match")!="*":fail()
    key=val("key");f=loc(key)
    if f.exists():fail()
    b=pathlib.Path(val("body")).read_bytes()
    f.write_bytes(b)
    headers={"content-type":"ContentType","cache-control":"CacheControl","content-disposition":"ContentDisposition","content-encoding":"ContentEncoding","content-language":"ContentLanguage","expires":"Expires","metadata":"Metadata"}
    m={"Key":key,"Size":len(b),"ETag":etag(b),"LastModified":"2026-11-27T12:00:00Z"}
    for flag,k in headers.items():
        v=val(flag)
        if v is not None:m[k]=json.loads(v) if k=="Metadata" else v
    f.with_suffix(".json").write_text(json.dumps(m))
    dump({"ETag":m["ETag"]})
else:fail()
