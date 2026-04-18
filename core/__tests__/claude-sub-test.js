/**
 * claude-sub output parser tests — v4.2 cc-sonnet/cc-haiku.
 */
const assert = require('assert');
const { parseClaudeSubOutput } = require('../../dist/executor/claude-sub.js');

// Case 1: 单对象 JSON (默认 --output-format json)
{
  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'success',
    session_id: 'sess-abc',
    result: 'Task done.',
    duration_ms: 12500,
    total_cost_usd: 0.0042,
    num_turns: 3,
    usage: {
      input_tokens: 1200,
      output_tokens: 340,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 2000,
    },
  });
  const r = parseClaudeSubOutput(stdout);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.sessionId, 'sess-abc');
  assert.strictEqual(r.tokensOut, 340);
  assert.strictEqual(r.tokensIn, 1200 + 500 + 2000);
  assert.strictEqual(r.totalTokens, 4040);
  assert.strictEqual(r.durationMs, 12500);
  assert.strictEqual(r.cost, 0.0042);
  assert.strictEqual(r.turns, 3);
  assert.strictEqual(r.resultText, 'Task done.');
}

// Case 2: NDJSON stream-json 多行，最后一行 type=result
{
  const lines = [
    { type: 'message', role: 'assistant', content: 'thinking...' },
    { type: 'tool_use', name: 'edit' },
    { type: 'result', subtype: 'success', duration_ms: 500, usage: { input_tokens: 100, output_tokens: 50 }, num_turns: 2 },
  ];
  const stdout = lines.map(l => JSON.stringify(l)).join('\n');
  const r = parseClaudeSubOutput(stdout);
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.totalTokens, 150);
  assert.strictEqual(r.durationMs, 500);
  assert.strictEqual(r.turns, 2);
}

// Case 3: 空输出 → 全零
{
  const r = parseClaudeSubOutput('');
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.totalTokens, 0);
  assert.strictEqual(r.sessionId, null);
}

// Case 4: 垃圾输出 (非 JSON) → 全零，不抛异常
{
  const r = parseClaudeSubOutput('This is not JSON at all\nneither is this');
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.totalTokens, 0);
}

// Case 5: 失败结果 subtype !== success
{
  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'error_max_turns',
    duration_ms: 60000,
    usage: { input_tokens: 5000, output_tokens: 200 },
  });
  const r = parseClaudeSubOutput(stdout);
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.totalTokens, 5200);
  assert.strictEqual(r.durationMs, 60000);
}

// Case 6: usage 缺失字段 → 默认 0
{
  const stdout = JSON.stringify({ type: 'result', subtype: 'success' });
  const r = parseClaudeSubOutput(stdout);
  assert.strictEqual(r.totalTokens, 0);
  assert.strictEqual(r.success, true);
}

console.log('claude-sub tests passed');
