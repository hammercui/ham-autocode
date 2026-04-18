/**
 * v4.2 Claude Code sub-agent output parser.
 *
 * `claude -p --output-format json` 会输出单个 JSON 对象（非 JSONL），包含：
 *   {
 *     "type": "result",
 *     "subtype": "success" | "error",
 *     "session_id": "...",
 *     "result": "text output",
 *     "duration_ms": number,
 *     "total_cost_usd": number,
 *     "num_turns": number,
 *     "usage": {
 *       "input_tokens": number,
 *       "output_tokens": number,
 *       "cache_creation_input_tokens"?: number,
 *       "cache_read_input_tokens"?: number
 *     }
 *   }
 *
 * 当前实现也兼容 stream-json (NDJSON) —— 逐行解析，取最后一个 type=result。
 */

export interface ClaudeSubResult {
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  durationMs: number;
  cost: number;
  turns: number;
  sessionId: string | null;
  success: boolean;
  resultText: string;
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ResultBlock {
  type?: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
  usage?: UsageBlock;
}

function extractFromBlock(block: ResultBlock): ClaudeSubResult {
  const usage = block.usage || {};
  const tokensIn = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  const tokensOut = usage.output_tokens || 0;
  return {
    tokensIn,
    tokensOut,
    totalTokens: tokensIn + tokensOut,
    durationMs: block.duration_ms || 0,
    cost: block.total_cost_usd || 0,
    turns: block.num_turns || 0,
    sessionId: block.session_id || null,
    success: block.subtype === 'success',
    resultText: block.result || '',
  };
}

/** 解析 claude -p --output-format json 的 stdout */
export function parseClaudeSubOutput(stdout: string): ClaudeSubResult {
  const empty: ClaudeSubResult = {
    tokensIn: 0, tokensOut: 0, totalTokens: 0, durationMs: 0,
    cost: 0, turns: 0, sessionId: null, success: false, resultText: '',
  };
  const trimmed = stdout.trim();
  if (!trimmed) return empty;

  // 尝试单对象解析
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object' && obj.type === 'result') {
      return extractFromBlock(obj as ResultBlock);
    }
  } catch { /* 继续尝试 NDJSON */ }

  // NDJSON: 逐行取最后一个 type=result
  const lines = trimmed.split('\n').filter(Boolean);
  let lastResult: ResultBlock | null = null;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.type === 'result') lastResult = obj as ResultBlock;
    } catch { /* skip */ }
  }
  return lastResult ? extractFromBlock(lastResult) : empty;
}
