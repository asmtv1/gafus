#!/usr/bin/env python3
"""Frozen candidate fingerprint across committed HEAD and dirty source tree.

Read-only Git. JSON output goes to stdout or explicit --write path. Does not
consider build caches, generated .types-build, artifacts, logs as source.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


def git(root:Path,*args:str)->bytes:
    return subprocess.run(['git','-C',str(root),*args],check=True,
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout


def eligible(path:str)->bool:
    parts=path.split('/')
    skip={'node_modules','artifacts','.git','.turbo','.next','coverage','.types-build','dist','build'}
    return not any(s in skip or s.startswith('.types-build-') for s in parts)


def snapshot(root:Path)->dict:
    head=git(root,'rev-parse','HEAD').decode().strip()
    branch=git(root,'branch','--show-current').decode().strip()
    modified=set(git(root,'diff','--name-only','-z','HEAD').decode('utf-8','surrogateescape').strip('\0').split('\0'))-{''}
    untracked=set(git(root,'ls-files','--others','--exclude-standard','-z').decode('utf-8','surrogateescape').strip('\0').split('\0'))-{''}
    paths=sorted(p for p in modified|untracked if eligible(p))
    excluded=sorted(p for p in modified|untracked if not eligible(p))
    rows=[]
    for p in paths:
        src=root/p
        if src.is_symlink():
            digest='SYMLINK:'+hashlib.sha256(os.readlink(src).encode()).hexdigest()
        elif not src.exists(): digest='DELETED'
        elif src.is_file():
            h=hashlib.sha256()
            with src.open('rb') as f:
                while chunk:=f.read(1<<20):h.update(chunk)
            digest=h.hexdigest()
        else: digest='NOT_REGULAR_FILE'
        rows.append((p,digest))
    raw=json.dumps({'head':head,'branch':branch,'files':rows},ensure_ascii=False,separators=(',',':')).encode()
    return {'head':head,'branch':branch,'fileCount':len(rows),
            'excludedBuildOrArtefactPaths':len(excluded),
            'sourceFingerprintSha256':hashlib.sha256(raw).hexdigest()}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',default='.')
    parser.add_argument('--compare',type=Path)
    parser.add_argument('--write',type=Path)
    a=parser.parse_args()
    data=snapshot(Path(a.root).expanduser().resolve())
    if a.write:
        a.write.parent.mkdir(parents=True,exist_ok=True)
        a.write.write_text(json.dumps(data,indent=2)+'\n')
    print(json.dumps(data,indent=2))
    if a.compare:
        old=json.loads(a.compare.read_text())
        assert old['sourceFingerprintSha256']==data['sourceFingerprintSha256'], 'SOURCE_FINGERPRINT_CHANGED_DURING_ACCEPTANCE'
        assert old['head']==data['head'], 'HEAD_CHANGED_DURING_ACCEPTANCE'
        print('A1_A2_A3_UNIFIED_SOURCE_STABLE_PASS')


if __name__=='__main__':main()
