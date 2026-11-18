'use strict';

const DEFAULT_ENDPOINT = 'https://ai.d-verse.in/api/chat';
const DEFAULT_MODEL = 'mercury-3';
const DEFAULT_PROVIDER = 'inception';
const TIMEOUT_MS = 6000;
const RETRIES = 2;
const THROTTLE_STATUS = new Set([429, 503]);

function extractContent(data) {
  if (data && Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  if (data && typeof data.content === 'string') return data.content;
  if (typeof data === 'string') return data;
  return '';
}

function stripFences(raw = '') {
  let clean = String(raw || '').trim();
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return clean;
}

function parseJsonSafe(content) {
  const clean = stripFences(content);
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch (error) {
    // Models sometimes append prose around the JSON object; recover the balanced block.
    const starts = [clean.indexOf('{'), clean.indexOf('[')].filter((index) => index >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      const open = clean[start];
      const close = open === '{' ? '}' : ']';
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = start; i < clean.length; i++) {
        const char = clean[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === open) depth += 1;
        else if (char === close) {
          depth -= 1;
          if (depth === 0) {
            try { return JSON.parse(clean.slice(start, i + 1)); } catch (inner) { break; }
          }
        }
      }
    }
    return null;
  }
}

function makeSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(TIMEOUT_MS);
  }
  return undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAI(prompt, systemPrompt = 'You output strictly raw JSON. No markdown or commentary.') {
  const endpoint = process.env.AI_ENDPOINT || DEFAULT_ENDPOINT;
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const provider = process.env.AI_PROVIDER || DEFAULT_PROVIDER;
  const payload = {
    model,
    provider,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  };

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: makeSignal(),
      });
      if (THROTTLE_STATUS.has(response.status)) return null;
      if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
      const data = await response.json();
      return parseJsonSafe(extractContent(data));
    } catch (error) {
      if (attempt === RETRIES) return null;
      await sleep(200 * (attempt + 1));
    }
  }
  return null;
}

module.exports = { callAI, parseJsonSafe, stripFences, extractContent };
