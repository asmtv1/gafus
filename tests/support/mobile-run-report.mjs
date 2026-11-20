import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function maestroCases(platform, scenario) {
  const cases = [
    ['runtime','common/runtime.yaml','GAFUS QA runtime identity after relaunch'],
    ['login','common/login.yaml','GAFUS QA - login and session'],
  ];
  if (scenario === 'training') {
    cases.push(
      ['open','common/training-open.yaml','GAFUS QA open a cached training'],
      ['offline','common/training-offline.yaml','GAFUS QA complete an exercise offline'],
      ['readback','common/training-readback.yaml','GAFUS QA completion survives reconnect and restart'],
    );
  } else {
    cases.push(
      ['mandatory',platform+'/mandatory-ota.yaml',platform === 'android' ?
        'GAFUS Android QA - mandatory OTA cannot be bypassed' : 'GAFUS iOS QA - mandatory OTA survives relaunch'],
      ['installed','common/runtime.yaml','GAFUS QA runtime identity after relaunch (installed)'],
      ['recovery','common/runtime.yaml','GAFUS QA runtime identity after relaunch (recovery)'],
    );
  }
  return cases.map(([id,path,name])=>({id,path,name,junitName:name.replace(/ \((installed|recovery)\)$/,'')}));
}

export function readMaestroJUnit(path, name) {
  const result = spawnSync('python3',['-c',`
import sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except (ET.ParseError, OSError):
    sys.exit(2)
cases = list(root.iter('testcase'))
if len(cases) != 1 or cases[0].get('name') != sys.argv[2]:
    sys.exit(2)
case = cases[0]
if case.find('failure') is not None or case.find('error') is not None:
    sys.exit(1)
if case.find('skipped') is not None:
    sys.exit(2)
`,path,name],{ encoding:'utf8',timeout:10000 });
  return result.status === 0 ? 'passed' : result.status === 1 ? 'failed' : 'incomplete';
}

export function verifyMobileRun(dir, task, plan) {
  const receipt = JSON.parse(readFileSync(join(dir,'native-run.json'),'utf8'));
  const scenario = task.scenario === 'mobile.ota' ? 'ota' : 'training';
  const cases = maestroCases(task.platform, scenario);
  if (receipt.platform !== task.platform || receipt.scenario !== scenario ||
      receipt.commit !== plan.commit || receipt.runId !== plan.runId || receipt.fingerprint !== plan.fingerprint ||
      !/^\d+\.\d+\.\d+$/.test(receipt.version) || receipt.runtime !== receipt.version ||
      !/^\d+(?:\.\d+)*$/.test(receipt.build) || !/^[0-9a-f]{64}$/.test(receipt.binarySha256) ||
      receipt.phases?.length !== cases.length) throw Error('Invalid or foreign native receipt');
  let lastRevision = -1;
  for (const [index, expected] of cases.entries()) {
    const phase = receipt.phases[index];
    if (phase.id !== expected.id ||
        readMaestroJUnit(join(dir,expected.id+'.xml'),expected.junitName) !== 'passed') {
      throw Error('Missing or incomplete Maestro JUnit: '+expected.id);
    }
    if (['runtime','installed','recovery'].includes(phase.id)) {
      const [prefix,version,build,runtime,revision,update,commit,...extra] = phase.identity.split('/');
      if (extra.length || prefix !== 'qa-runtime' || version !== receipt.version ||
          build !== receipt.build || runtime !== receipt.runtime || commit !== plan.commit ||
          !/^\d+$/.test(revision) || !Number.isSafeInteger(+revision) || +revision <= lastRevision ||
          !(phase.id === 'runtime' && update === 'embedded' || /^[a-f0-9-]{36}$/.test(update))) {
        throw Error('Invalid installed runtime identity');
      }
      lastRevision = +revision;
    }
  }
  if (scenario === 'training' && receipt.persistedCompletions !== 1) throw Error('Missing SQL readback');
  return receipt;
}
