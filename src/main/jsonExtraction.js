function normalizeJsonText(value) {
  if (typeof value !== 'string') {
    throw new Error('Model response must be a string.');
  }

  return value
    .replace(/^\uFEFF/, '')
    .replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, '')
    .trim();
}

function stripJsonFence(value) {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function collectBalancedJsonObjects(value) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        candidates.push(value.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function parseJsonPayload(value) {
  const normalized = normalizeJsonText(value);
  const unfenced = stripJsonFence(normalized);
  const candidates = [unfenced, ...collectBalancedJsonObjects(unfenced)];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error('Could not extract valid JSON from model response.');
}

module.exports = {
  collectBalancedJsonObjects,
  normalizeJsonText,
  parseJsonPayload,
  stripJsonFence
};
