// Shared event mapping for the managed bundle and its tests.

/**
 * Session-event mapping and the pending-approval dispatcher. Runtime lifecycle
 * lives in index.mjs; the apply() below is an inert compatibility tombstone for
 * the former absolute-path profile row.
 *
 * Verified against the installed DSH: session/event(session, event), turn/start,
 * and turn/end { turn, reason: { kind } }. Only completed produces a reply-ready
 * alert; aborted, blocked, interrupted, and forked turns rest; errors alert; and
 * max-tokens asks for rice. Turn events carry no prompt, answer, tool argument,
 * or session title. Delegated subagents are ignored to avoid duplicate alerts.
 */
export const name = 'desktop-pet-notifications';

export function notificationFor(session, event) {
  // Delegated sessions use approval policy 'never'; their audit asks are not
  // user-facing permission prompts. Parent escalations arrive on the parent.
  if (session.header?.origin === 'subagent' || session.header?.delegationDepth > 0) return null;
  if (event.type === 'approval/asked' || event.type === 'approval/decided') {
    if (typeof event.data?.id !== 'string' || !event.data.id) return null;
    return {
      state: event.type === 'approval/asked' ? 'permission' : 'permission-resolved',
      sessionId: session.id,
      requestId: event.data.id,
      title: 'DSH permission request',
      eventId: `${session.id}:${event.seq}`,
    };
  }
  let state;
  if (event.type === 'turn/start') state = 'thinking';
  else if (event.type === 'turn/end') {
    switch (event.data?.reason?.kind) {
      case 'completed': state = 'done'; break;
      case 'error': state = 'error'; break;
      case 'max-tokens': state = 'hungry'; break;
      default: state = 'sleeping';
    }
  } else return null;
  return {
    state,
    sessionId: session.id,
    title: 'DSH',
    eventId: `${session.id}:${event.seq}`,
  };
}

// Do not alert for automatic denials or unavailable approval channels that settle
// immediately. Pending human approvals remain visible until decided or turn end.
export function createPermissionDispatcher(send, delayMs = 500) {
  const requests = new Map();
  return {
    accept(session, event) {
      const notification = notificationFor(session, event);
      const key = JSON.stringify([session.id, notification?.requestId]);
      if (notification?.state === 'permission') {
        if (requests.has(key)) return;
        const entry = { notification, sent: false, timer: null };
        entry.timer = setTimeout(() => { entry.sent = true; send(notification); }, delayMs);
        requests.set(key, entry);
      } else if (notification?.state === 'permission-resolved') {
        const entry = requests.get(key);
        if (!entry) return;
        clearTimeout(entry.timer);
        requests.delete(key);
        if (entry.sent) send(notification);
      } else {
        if (event.type === 'turn/end') {
          for (const [id, entry] of requests) {
            if (entry.notification.sessionId !== session.id) continue;
            clearTimeout(entry.timer);
            requests.delete(id);
            if (entry.sent) send({ ...entry.notification, state: 'permission-resolved', eventId: `${session.id}:${event.seq}:clear:${entry.notification.requestId}` });
          }
        }
        if (notification) send(notification);
      }
    },
    sessionDisposed(session) {
      for (const [id, entry] of requests) {
        if (entry.notification.sessionId !== session.id) continue;
        clearTimeout(entry.timer);
        requests.delete(id);
      }
      if (session.header?.origin !== 'subagent' && !(session.header?.delegationDepth > 0)) send({ state: 'sleeping', sessionId: session.id, eventId: `${session.id}:disposed:${Date.now()}` });
    },
    dispose() {
      for (const entry of requests.values()) clearTimeout(entry.timer);
      requests.clear();
    },
  };
}

// Compatibility tombstone for the former absolute-path profile row. The installed
// bundle's index.mjs now owns lifecycle and event delivery; keeping this inert
// avoids duplicate observers without editing unrelated profile settings.
export function apply() {}
