import 'dotenv/config';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? '';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'password123';
const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const cookieJar = new Map();

function absorbCookies(res) {
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const raw of setCookie) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    cookieJar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}

function cookieHeader() {
  return [...cookieJar].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(method, path, { body, internal = false } = {}) {
  const headers = { 'content-type': 'application/json', origin: BASE };
  const ck = cookieHeader();
  if (ck) headers.cookie = ck;
  if (internal) headers['x-internal-token'] = INTERNAL_TOKEN;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  absorbCookies(res);

  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, body: json };
}

function ok(label) {
  console.log(`✓ ${label}`);
}

function assert(cond, label, detail) {
  if (cond) {
    ok(label);
    return;
  }
  console.error(
    `✗ ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ''}`,
  );
  throw new Error(`assertion failed: ${label}`);
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function futureDate(daysAhead) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return toISODate(d);
}

function quarterDates() {
  const today = new Date();
  const daysUntilSaturday = (6 - today.getUTCDay() + 7) % 7;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() + daysUntilSaturday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 21);
  return { startDate: toISODate(start), endDate: toISODate(end) };
}

let memberId;
let classId;
let quarterId;

async function step1_auth() {
  const signIn = await req('POST', '/api/auth/sign-in/email', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status >= 200 && signIn.status < 300) {
    ok('sign in as admin@example.com');
    return;
  }

  const signUp = await req('POST', '/api/auth/sign-up/email', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'E2E Admin' },
  });
  assert(
    signUp.status >= 200 && signUp.status < 300,
    'sign up as first user (superadmin bootstrap)',
    signUp.body,
  );
}

async function step2_me() {
  const me = await req('GET', '/me');
  assert(
    me.status === 200 && !!me.body?.member,
    'GET /me returns a linked member',
    me.body,
  );
  assert(
    Array.isArray(me.body.permissions) &&
      me.body.permissions.includes('role.manage'),
    'GET /me permissions include role.manage (superadmin)',
    me.body.permissions,
  );
}

async function step3_memberAndRole() {
  const create = await req('POST', '/members', {
    body: { fullName: `E2E Member ${SUFFIX}` },
  });
  assert(create.status < 300 && create.body?.id, 'create member', create.body);
  memberId = create.body.id;

  const roles = await req('GET', '/roles');
  assert(
    roles.status === 200 && Array.isArray(roles.body),
    'GET /roles',
    roles.body,
  );
  const teacherRole = roles.body.find((r) => r.key === 'teacher');
  assert(!!teacherRole, 'teacher role present in GET /roles', roles.body);

  const grant = await req('POST', `/members/${memberId}/roles`, {
    body: { roleId: teacherRole.id },
  });
  assert(
    grant.status < 300,
    'grant teacher role via POST /members/:id/roles',
    grant.body,
  );

  const memberRoles = await req('GET', `/members/${memberId}/roles`);
  assert(
    memberRoles.status === 200 &&
      memberRoles.body.some((r) => r.key === 'teacher'),
    'GET /members/:id/roles includes teacher',
    memberRoles.body,
  );
}

let firstAssignmentId;

async function step4_classAndQuarter() {
  const createClass = await req('POST', '/classes', {
    body: { name: `E2E Class ${SUFFIX}` },
  });
  assert(
    createClass.status < 300 && createClass.body?.id,
    'create class',
    createClass.body,
  );
  classId = createClass.body.id;

  const addToPool = await req('POST', `/classes/${classId}/teachers`, {
    body: { memberId },
  });
  assert(addToPool.status < 300, 'add member to class pool', addToPool.body);

  const { startDate, endDate } = quarterDates();
  const createQuarter = await req('POST', '/quarters', {
    body: { name: `E2E Quarter ${SUFFIX}`, startDate, endDate },
  });
  assert(
    createQuarter.status < 300 && createQuarter.body?.id,
    'create quarter',
    createQuarter.body,
  );
  quarterId = createQuarter.body.id;

  const gen = await req('POST', `/quarters/${quarterId}/generate-saturdays`);
  assert(
    gen.status < 300 && gen.body?.created > 0,
    'generate-saturdays created>0',
    gen.body,
  );

  const assignments = await req('GET', `/assignments?classId=${classId}`);
  assert(
    assignments.status === 200 && assignments.body.length > 0,
    'list generated assignments for class',
    assignments.body,
  );
  firstAssignmentId = assignments.body[0].id;
}

async function step5_reassignActivityUndo() {
  const reassign = await req('PATCH', `/assignments/${firstAssignmentId}`, {
    body: { toMemberId: memberId },
  });
  assert(
    reassign.status < 300 && reassign.body?.changeId,
    'reassign assignment to member',
    reassign.body,
  );
  const changeId = reassign.body.changeId;

  const activity = await req('GET', '/activity');
  assert(
    activity.status === 200 && activity.body.some((a) => a.id === changeId),
    'GET /activity shows the reassignment',
    activity.body,
  );

  const undo = await req('POST', '/undo', {
    body: { ref: `change:${changeId}` },
  });
  assert(
    undo.status < 300 && undo.body?.ok === true,
    'POST /undo reverts the change',
    undo.body,
  );

  const after = await req('GET', `/assignments?classId=${classId}`);
  const restored = after.body.find((a) => a.id === firstAssignmentId);
  assert(
    !!restored && restored.memberId === null,
    'assignment memberId is back to null after undo',
    restored,
  );
}

async function step6_internal() {
  const tokenResp = await req('POST', `/members/${memberId}/telegram-token`);
  assert(
    tokenResp.status < 300 && !!tokenResp.body?.token,
    'create telegram link token',
    tokenResp.body,
  );
  const linkToken = tokenResp.body.token;
  const tgUserId = Date.now();

  const link = await req('POST', '/internal/members/link-telegram', {
    internal: true,
    body: { token: linkToken, tgUserId, tgUsername: `e2e_${SUFFIX}` },
  });
  assert(
    link.status < 300 && link.body?.ok === true,
    'internal link-telegram',
    link.body,
  );

  const byTelegram = await req(
    'GET',
    `/internal/members/by-telegram/${tgUserId}`,
    { internal: true },
  );
  assert(
    byTelegram.status === 200 && byTelegram.body?.memberId === memberId,
    'internal by-telegram resolves memberId',
    byTelegram.body,
  );

  const remindersDate = futureDate(1000 + Math.floor(Math.random() * 5000));
  const claim1 = await req('POST', '/internal/reminders/claim', {
    internal: true,
    body: { type: 'weekly_reminder', targetDate: remindersDate },
  });
  assert(
    claim1.status < 300 && claim1.body?.claimed === true,
    'reminders/claim first call claims',
    claim1.body,
  );

  const claim2 = await req('POST', '/internal/reminders/claim', {
    internal: true,
    body: { type: 'weekly_reminder', targetDate: remindersDate },
  });
  assert(
    claim2.status < 300 && claim2.body?.claimed === false,
    'reminders/claim second call is not claimed',
    claim2.body,
  );

  const updateId = Date.now() + Math.floor(Math.random() * 1000);
  const agentClaim1 = await req('POST', '/internal/agent-log/claim', {
    internal: true,
    body: { updateId },
  });
  assert(
    agentClaim1.status < 300 && agentClaim1.body?.fresh === true,
    'agent-log/claim first call is fresh',
    agentClaim1.body,
  );

  const agentClaim2 = await req('POST', '/internal/agent-log/claim', {
    internal: true,
    body: { updateId },
  });
  assert(
    agentClaim2.status < 300 && agentClaim2.body?.fresh === false,
    'agent-log/claim second call is not fresh',
    agentClaim2.body,
  );
}

async function step7_announceGraceful() {
  const chatId = -1000000000000 - Math.floor(Math.random() * 1000);
  const setChat = await req('PATCH', '/settings', {
    body: { telegramGroupChatId: chatId },
  });
  assert(setChat.status < 300, 'set telegramGroupChatId', setChat.body);

  const reassignAgain = await req(
    'PATCH',
    `/assignments/${firstAssignmentId}`,
    { body: { toMemberId: memberId } },
  );
  assert(
    reassignAgain.status < 300,
    'reassign slot again for announce test',
    reassignAgain.body,
  );

  const announce = await req(
    'POST',
    `/assignments/${firstAssignmentId}/announce`,
  );
  assert(
    announce.status >= 200 &&
      announce.status < 300 &&
      announce.body?.ok === false,
    'announce degrades gracefully (2xx with ok:false, not 500)',
    { status: announce.status, body: announce.body },
  );

  const resetChat = await req('PATCH', '/settings', {
    body: { telegramGroupChatId: null },
  });
  assert(resetChat.status < 300, 'reset telegramGroupChatId', resetChat.body);
}

async function cleanup() {
  if (quarterId) {
    const r = await req('DELETE', `/quarters/${quarterId}`);
    if (r.status < 300) ok('cleanup: deleted quarter');
    else
      console.error(
        `✗ cleanup: delete quarter failed: ${JSON.stringify(r.body)}`,
      );
  }
  if (classId) {
    const r = await req('DELETE', `/classes/${classId}`);
    if (r.status < 300) ok('cleanup: deleted class (cascades assignments)');
    else
      console.error(
        `✗ cleanup: delete class failed: ${JSON.stringify(r.body)}`,
      );
  }
  if (memberId) {
    const r = await req('DELETE', `/members/${memberId}`);
    if (r.status < 300) ok('cleanup: deleted member');
    else
      console.error(
        `✗ cleanup: delete member failed: ${JSON.stringify(r.body)}`,
      );
  }
}

async function main() {
  try {
    await step1_auth();
    await step2_me();
    await step3_memberAndRole();
    await step4_classAndQuarter();
    await step5_reassignActivityUndo();
    await step6_internal();
    await step7_announceGraceful();
  } finally {
    await cleanup();
  }
}

main()
  .then(() => {
    console.log('\nAll e2e steps passed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\ne2e smoke failed: ${err.message}`);
    process.exit(1);
  });
