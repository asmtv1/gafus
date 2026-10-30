"""AG4 independent source/canonical SQL parity proof; no local DB/network access.
Requires original AG1 migration-source derived synthetic expected JSON and
actual AG4 SELECT-only PostgreSQL catalog JSON. Keeps real DB identity unchanged.
"""
import json,re,sys,copy
from pathlib import Path
ROOT=Path('/Users/asmtv1/Desktop/gafus-refactor')

def norm(v):return re.sub(r'\s+','',str(v).replace('"','').lower())
def defaults(e,a):
 if e is None:return a is None
 if a is None:return False
 # Strip only the syntactic trailing comma after the SQL column declaration.
 # PostgreSQL reports a varchar cast for literal defaults; it is not
 # a semantic default change and must be normalized without ignoring value.
 x=norm(str(e).rstrip(','));y=norm(a)
 y=re.sub(r'::(?:charactervarying|text|integer|bigint|smallint)$','',y)
 if x=='current_timestamp':return y in ('current_timestamp','now()')
 return x==y or (x.startswith("'") and x.endswith("'") and x[1:-1]==y)
def col_names(s):return ','.join(norm(x) for x in s.split(','))
def between(s,left,right):
 x=norm(s)
 return x.find(norm(left))>=0 and x.find(norm(right))>=0

def run(expected,actual):
 errs=[]
 def add(code,target):errs.append(code+':'+str(target))
 if actual.get('schema')!='public':add('SCHEMA',actual.get('schema'))
 if actual.get('finishedCount')!=140 or actual.get('failedCount')!=0 or actual.get('ledger')!=[]:add('LEDGER',str((actual.get('finishedCount'),actual.get('failedCount'),actual.get('ledger'))))
 for kind,key in [('tables','name'),('columns','name'),('constraints','name'),('indexes','name')]:
  e=expected[kind];a=actual[kind]
  keys=lambda arr:[((x.get('table')+'.') if x.get('table') else '')+x[key] for x in arr]
  if sorted(keys(e))!=sorted(keys(a)):add(kind.upper()+'_NAMES',(sorted(set(keys(e))-set(keys(a))),sorted(set(keys(a))-set(keys(e)))))
  if len(e)!=len(a):add(kind.upper()+'_COUNT',f'{len(e)}!={len(a)}')
 ec={(x['table'],x['name']):x for x in expected['columns']};ac={(x['table'],x['name']):x for x in actual['columns']}
 for k,e in ec.items():
  a=ac.get(k)
  if not a:continue
  if norm(e['type'])!=norm(a['type']):add('COLUMN_TYPE',k)
  if bool(e['notNull'])!=bool(a['notNull']):add('COLUMN_NULL',k)
  if not defaults(e.get('default'),a.get('default')):add('COLUMN_DEFAULT',k)
 con={(x['table'],x['name']):x for x in actual['constraints']}
 for x in expected['constraints']:
  k=(x['table'],x['name']);a=con.get(k)
  if a is None:continue
  if x['kind']!=a['kind']:add('CONSTRAINT_KIND',k);continue
  defn=norm(a['definition']);proof=x.get('proof') or {}
  if x['kind']=='p':
   if not defn.startswith('primarykey(') or not between(defn,'primarykey('+proof['columns']+')','primarykey('+proof['columns']+')'):add('PK_COLUMNS',k)
  elif x['kind']=='f':
   required='foreignkey('+proof['columns']+')references'+proof['refTable']+'('+proof['refColumns']+')'
   if required not in defn or 'ondeletecascade' not in defn: add('FK_SEMANTICS',k)
  elif x['kind']=='c':
   if x['name']=='PetCreateReceipt_responseStatus_check':
    if 'responsestatus=201' not in defn:add('CHECK_STATUS',k)
   elif x['name']=='PetCreateReceipt_payloadHash_format':
    if 'payloadhash~' not in defn or '^[a-f0-9]{64}$' not in defn:add('CHECK_HASH_REGEX',k)
   else:add('UNKNOWN_CHECK',k)
 idx={(x['table'],x['name']):x for x in actual['indexes']}
 for x in expected['indexes']:
  k=(x['table'],x['name']);a=idx.get(k)
  if a is None:continue
  d=norm(a['definition']);m=re.search(r'(?:usingbtree)\(([^)]*)\)',d)
  if not m or col_names(x['columns'])!=col_names(m.group(1)):add('INDEX_COLUMNS',k)
  if bool(x['unique'])!=d.startswith('createuniqueindex'):add('INDEX_UNIQUE',k)
 return sorted(set(errs))

if __name__=='__main__':
 if len(sys.argv)!=3:raise SystemExit('usage checker expected-json actual-json')
 paths=[Path(x) for x in sys.argv[1:]]
 if not all(p.resolve().is_relative_to(ROOT) and p.is_file() for p in paths):raise SystemExit('AG4_OUT_OF_SCOPE')
 exp,act=[json.loads(p.read_text()) for p in paths]
 issues=run(exp,act)
 negative={}
 mutations=[('TYPE',('columns','OfflineResourceRevision','revision','type','integer')),
 ('NULL',('columns','OfflineMutationReceipt','id','notNull',False)),
 ('DEFAULT',('columns','PetCreateReceipt','responseStatus','default','0')),
 ('FK',('constraints','PetCreateReceipt','PetCreateReceipt_ownerId_fkey','definition','FOREIGN KEY ("ownerId") REFERENCES "Pet"(id) ON DELETE CASCADE')),
 ('INDEX',('indexes','OfflineMutationReceipt','OfflineMutationReceipt_ownerId_resourceKey_revision_idx','definition','CREATE INDEX "OfflineMutationReceipt_ownerId_resourceKey_revision_idx" ON public."OfflineMutationReceipt" USING btree ("ownerId",revision)')),
 ('CHECK',('constraints','PetCreateReceipt','PetCreateReceipt_responseStatus_check','definition','CHECK ("responseStatus" = 200)'))]
 for label,(group,table,name,field,value) in mutations:
  copyact=copy.deepcopy(act)
  found=[v for v in copyact[group] if v['table']==table and v['name']==name];assert len(found)==1,(label,table,name)
  found[0][field]=value
  err=run(exp,copyact)
  negative[label]=len(err)>0
 result={'kind':'AG4_HISTORICAL_OFF021_G05_SOURCE_DDL_VS_ACTUAL_PG_CATALOG_PARITY','database':act.get('database'),'expected':{'tables':len(exp['tables']),'columns':len(exp['columns']),'constraints':len(exp['constraints']),'indexes':len(exp['indexes'])},'actual':{'tables':len(act['tables']),'columns':len(act['columns']),'constraints':len(act['constraints']),'indexes':len(act['indexes'])},'status':'EXACT_DDL_PARITY' if not issues else 'FAIL_CLOSED','errors':issues,'negativeControls':negative,'allNegativeControlsReject':all(negative.values()),'noDBWrites':True}
 print(json.dumps(result,indent=2))
 if issues or not all(negative.values()):raise SystemExit(78)
