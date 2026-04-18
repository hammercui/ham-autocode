/**
 * v4.2 RunContext smoke test — 验证 progress 文件可独立读写，
 * createRunContext + writeProgress 路径链路通畅。
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readProgress } = require('../../dist/executor/auto-runner.js');

function mkTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runctx-'));
  return dir;
}
function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

// Case 1: readProgress 对不存在文件返回 null
{
  const dir = mkTempProject();
  try {
    const p = readProgress(dir);
    assert.strictEqual(p, null);
  } finally { cleanup(dir); }
}

// Case 2: 手写 progress.json 能被 readProgress 解析
{
  const dir = mkTempProject();
  try {
    const progressPath = path.join(dir, '.ham-autocode', 'state', 'dispatch', 'auto-progress.json');
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.writeFileSync(progressPath, JSON.stringify({
      status: 'running',
      completed: 2,
      remaining: 3,
      currentTasks: [],
    }));
    const p = readProgress(dir);
    assert.ok(p);
    assert.strictEqual(p.status, 'running');
    assert.strictEqual(p.completed, 2);
  } finally { cleanup(dir); }
}

// Case 3: readProgress 对损坏 JSON 返回 null 不抛异常
{
  const dir = mkTempProject();
  try {
    const progressPath = path.join(dir, '.ham-autocode', 'state', 'dispatch', 'auto-progress.json');
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.writeFileSync(progressPath, '{this is not valid json');
    const p = readProgress(dir);
    assert.strictEqual(p, null);
  } finally { cleanup(dir); }
}

console.log('run-context tests passed');
