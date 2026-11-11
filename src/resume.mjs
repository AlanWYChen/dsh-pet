// Root-turn tracking for v2 state reconstruction on start. Pure functions so the
// resume decision can be tested without a live Electron process or Host.
const SUBAGENT_ORIGIN = 'subagent';

function isSubagent(session) {
  const header = session && session.header;
  if (!header || typeof header !== 'object') return false;
  return header.origin === SUBAGENT_ORIGIN
    || (typeof header.delegationDepth === 'number' && header.delegationDepth > 0);
}

function sessionIdOf(session) {
  return session && typeof session.id === 'string' ? session.id : null;
}

/**
 * Record root turn boundaries in `turns` (a Map of sessionId -> { sessionId, at }).
 * Subagent sessions are ignored entirely, and only turn/start and turn/end change
 * the tracker so unrelated events cannot make an old turn look recent.
 */
export function noteRootEvent(turns, session, event, at) {
  if (!(turns instanceof Map) || !event || typeof event.type !== 'string') return null;
  if (isSubagent(session)) return null;
  const sessionId = sessionIdOf(session);
  if (!sessionId) return null;
  const timestamp = Number.isFinite(at) ? at : Date.now();
  if (event.type === 'turn/start') {
    turns.set(sessionId, { sessionId, at: timestamp });
    return turns.get(sessionId);
  }
  if (event.type === 'turn/end') {
    turns.delete(sessionId);
    return null;
  }
  return null;
}

/**
 * The most recently *started* still-running root turn, or null when nothing is
 * active. A later turn in another session wins over an older one.
 */
export function latestActive(turns) {
  if (!(turns instanceof Map) || turns.size === 0) return null;
  let best = null;
  for (const entry of turns.values()) {
    if (!entry || typeof entry.sessionId !== 'string' || !Number.isFinite(entry.at)) continue;
    if (!best || entry.at > best.at) best = { sessionId: entry.sessionId, at: entry.at };
    else if (entry.at === best.at && entry.sessionId > best.sessionId) best = { sessionId: entry.sessionId, at: entry.at };
  }
  return best;
}
