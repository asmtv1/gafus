import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function workspace() {
  const projects=new Map();
  for(const root of ['packages','apps']) {
    for(const item of readdirSync(root,{withFileTypes:true})) {
      if(!item.isDirectory())continue;
      const manifest=join(root,item.name,'package.json');
      if(!existsSync(manifest))continue;
      const pkg=JSON.parse(readFileSync(manifest,'utf8'));
      assert(pkg.name,`Unnamed workspace ${manifest}`);
      assert(!projects.has(pkg.name),`Duplicate workspace ${pkg.name}`);
      projects.set(pkg.name,{path:manifest,pkg});
    }
  }
  return projects;
}

test('workspace runtime DAG contains no cycles or unresolved workspace package names',()=>{
  const projects=workspace();
  assert(projects.size>40,'workspace manifest scan unexpectedly incomplete');
  const edges=new Map();
  for(const [name,{pkg}] of projects) {
    const dependencies={...pkg.dependencies,...pkg.optionalDependencies};
    const children=[];
    for(const [dependency,version] of Object.entries(dependencies)) {
      if(!String(version).startsWith('workspace:'))continue;
      assert(projects.has(dependency),`${name} declares missing workspace dependency ${dependency}`);
      children.push(dependency);
    }
    edges.set(name,children);
    // Development dependencies may be cyclic, but every workspace target must
    // exist. Runtime imports must obey the acyclic graph above.
    for(const [dependency,version] of Object.entries(pkg.devDependencies??{})) {
      if(String(version).startsWith('workspace:'))
        assert(projects.has(dependency),`${name} dev dependency ${dependency} missing`);
    }
  }
  const visiting=new Set(),closed=new Set();
  const visit=(name,trace=[])=>{
    assert(!visiting.has(name),`Workspace runtime dependency cycle: ${[...trace,name].join(' -> ')}`);
    if(closed.has(name))return;
    visiting.add(name);
    for(const child of edges.get(name))visit(child,[...trace,name]);
    visiting.delete(name);closed.add(name);
  };
  for(const name of projects.keys())visit(name);
  assert.equal(closed.size,projects.size);
});
