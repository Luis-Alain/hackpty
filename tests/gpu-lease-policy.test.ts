import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyGpuProcesses, GpuComputeRow } from '../diagnostics/qvac-spike/gpu-lease.js';

// Synthetic process rows only; this test never calls nvidia-smi or PowerShell.
const computeRow = (pid: number, name: string, usedMemory = '512 MiB'): GpuComputeRow =>
  ({ pid, name, usedMemory, raw: `${pid}, ${name}, ${usedMemory}` });

test('D7: owned GPU compute PIDs are ignored', () => {
  const rows = [{ pid: 100, name: 'node.exe' }];
  const result = classifyGpuProcesses(rows, [computeRow(100, 'node.exe')], () => true);
  assert.equal(result.aborting.length, 0);
  assert.equal(result.observedForeignGpuProcesses.length, 0);
});

test('D7: foreign runtime executables still abort', () => {
  const rows = [
    { pid: 1, name: 'node.exe' },
    { pid: 2, name: 'electron.exe' },
    { pid: 3, name: 'bare.exe' },
    { pid: 4, name: 'python.exe' },
    { pid: 5, name: 'python3.12.exe' },
  ];
  const compute = rows.map(row => computeRow(row.pid, row.name));
  const result = classifyGpuProcesses(rows, compute, () => false);
  assert.deepEqual(result.aborting.map(item => item.pid), [1, 2, 3, 4, 5]);
  assert.ok(result.aborting.every(item => item.reason === 'runtime-executable'));
  assert.equal(result.observedForeignGpuProcesses.length, 0);
});

test('D7: foreign process matching the runtime worker command line aborts', () => {
  const rows = [{ pid: 7, name: 'node.exe', runtime: true }];
  const result = classifyGpuProcesses(rows, [computeRow(7, 'node.exe')], () => false);
  assert.deepEqual(result.aborting, [{ pid: 7, name: 'node.exe', reason: 'runtime-worker-command-line' }]);
  assert.equal(result.observedForeignGpuProcesses.length, 0);
});

test('D7: non-runtime foreign GUI processes are observed, not aborted', () => {
  const rows = [{ pid: 65412, name: 'Cursor.exe' }];
  const result = classifyGpuProcesses(rows, [computeRow(65412, 'Cursor.exe', '238 MiB')], () => false);
  assert.equal(result.aborting.length, 0);
  assert.deepEqual(result.observedForeignGpuProcesses, [{ pid: 65412, name: 'Cursor.exe', usedMemory: '238 MiB' }]);
});

test('D7: GUI process absent from Win32 rows falls back to the nvidia-smi name basename', () => {
  const compute = [computeRow(9, 'C:\\Program Files\\Cursor\\Cursor.exe', '120 MiB')];
  const result = classifyGpuProcesses([], compute, () => false);
  assert.equal(result.aborting.length, 0);
  assert.deepEqual(result.observedForeignGpuProcesses, [{ pid: 9, name: 'Cursor.exe', usedMemory: '120 MiB' }]);
});

test('D7: mixed foreign lists split into aborting and observed', () => {
  const rows = [
    { pid: 20, name: 'python.exe' },
    { pid: 21, name: 'Cursor.exe' },
    { pid: 22, name: 'msedge.exe' },
  ];
  const compute = [
    computeRow(20, 'python.exe'),
    computeRow(21, 'Cursor.exe', '238 MiB'),
    computeRow(22, 'msedge.exe', '80 MiB'),
  ];
  const result = classifyGpuProcesses(rows, compute, () => false);
  assert.deepEqual(result.aborting.map(item => item.pid), [20]);
  assert.deepEqual(result.observedForeignGpuProcesses.map(item => item.pid), [21, 22]);
});

test('D7: case-insensitive executable matching', () => {
  const rows = [{ pid: 30, name: 'NODE.EXE' }, { pid: 31, name: 'Python.EXE' }];
  const result = classifyGpuProcesses(rows, [computeRow(30, 'NODE.EXE'), computeRow(31, 'Python.EXE')], () => false);
  assert.deepEqual(result.aborting.map(item => item.pid), [30, 31]);
});
