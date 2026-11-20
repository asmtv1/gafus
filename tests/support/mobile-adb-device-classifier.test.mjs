import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAdbDevices} from './mobile-adb-device-classifier.mjs';

test('Android emulator is connected but never counted as a physical QA device',()=>{
  const report=classifyAdbDevices([
    'List of devices attached',
    'emulator-5554\tdevice product:sdk_gphone16k_arm64 model:sdk_gphone16k_arm64 device:emu64a16k transport_id:1',
    '',
  ].join('\n'));
  assert.deepEqual(report.deviceIds,['emulator-5554']);
  assert.deepEqual(report.emulatorIds,['emulator-5554']);
  assert.deepEqual(report.physicalDeviceIds,[]);
  assert.equal(report.physicalDeviceConnected,false);
});
test('physical USB phone can be identified independently of an emulator',()=>{
  const report=classifyAdbDevices([
    'List of devices attached',
    'emulator-5554\tdevice product:sdk_gphone model:sdk_gphone device:emu64a16k transport_id:1',
    'R58NA53G0ZK\tdevice product:a53x model:SM_A536E device:a53x transport_id:2',
  ].join('\n'));
  assert.deepEqual(report.physicalDeviceIds,['R58NA53G0ZK']);
  assert.equal(report.emulatorIds.length,1);
  assert.equal(report.physicalDeviceConnected,true);
});
test('offline, unauthorized and non-USB devices do not count toward physical native release QA',()=>{
  const report=classifyAdbDevices([
    'List of devices attached',
    '192.168.1.20:5555\tdevice product:a53x model:SM_A536E device:a53x transport_id:3',
    'R58NA53G0ZK\toffline',
    'deviceWithNoMetadata\tdevice',
  ].join('\n'));
  assert.equal(report.physicalDeviceConnected,false);
  assert.deepEqual(report.unclassifiedDeviceIds,['192.168.1.20:5555','deviceWithNoMetadata']);
  assert.equal(report.deviceIds.length,2);
});
test('duplicate and unreadable device output cannot silently become a physical PASS',()=>{
  assert.throws(()=>classifyAdbDevices(null),/ADB_DEVICE_OUTPUT_NOT_TEXT/);
  assert.throws(()=>classifyAdbDevices([
    'R58NA53G0ZK\tdevice model:SM_A536E device:a53x',
    'R58NA53G0ZK\tdevice model:SM_A536E device:a53x',
  ].join('\n')), /ADB_DUPLICATE_SERIAL/);
});
