import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';

// Clone schema only into a disposable database; never alter deployment data.
test('first-account bootstrap and invitation-only access', {timeout: 90000}, async t => {
  const database = `yoggan_access_test_${Date.now()}`;
  const source = process.env.DB_NAME ?? 'yoggan';
  assert.match(database, /^yoggan_access_test_\d+$/);
  assert.match(source, /^[a-zA-Z0-9_]+$/);
  let rootPassword = process.env.TEST_DB_ROOT_PASSWORD ?? process.env.DB_ROOT_PASSWORD;
  if (!rootPassword) {
    try {rootPassword = execFileSync('docker', ['exec', process.env.TEST_DB_CONTAINER ?? 'yoggan-home-db-1', 'printenv', 'MARIADB_ROOT_PASSWORD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();}
    catch { /* CI can supply TEST_DB_ROOT_PASSWORD instead of Docker. */ }
  }
  assert.ok(rootPassword, 'Set TEST_DB_ROOT_PASSWORD or DB_ROOT_PASSWORD for the isolated database test.');
  const sql = await mysql.createConnection({host: process.env.TEST_DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 3306), user: 'root', password: rootPassword, multipleStatements: false});
  let server;
  let created = false;
  const port = 30000 + Math.floor(Math.random() * 20000);
  const base = `http://localhost:${port}`;
  const password = 'Disposable-test-password-123';
  try {
    await sql.query(`CREATE DATABASE \`${database}\``);
    created = true;
    const [tables] = await sql.query(`SHOW TABLES FROM \`${source}\``);
    await sql.query(`USE \`${database}\``);
    await sql.query('SET FOREIGN_KEY_CHECKS=0');
    for (const row of tables) {
      const table = Object.values(row)[0];
      assert.match(table, /^[a-zA-Z0-9_]+$/);
      const [definition] = await sql.query(`SHOW CREATE TABLE \`${source}\`.\`${table}\``);
      await sql.query(definition[0]['Create Table']);
    }
    await sql.query('SET FOREIGN_KEY_CHECKS=1');
    let logs = '';
    server = spawn(process.execPath, ['dist/index.js'], {cwd: new URL('..', import.meta.url), windowsHide: true, env: {...process.env, DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1', DB_USER: 'root', DB_PASSWORD: rootPassword, DB_NAME: database, PORT: String(port), BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: 'disposable-integration-test-secret-123456789', TRUSTED_ORIGINS: base, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: ''}, stdio: ['ignore', 'pipe', 'pipe']});
    server.stdout.on('data', chunk => {logs += chunk;});
    server.stderr.on('data', chunk => {logs += chunk;});
    for (let tries = 0; ; tries++) {
      if (server.exitCode !== null) throw new Error(`Test API exited: ${logs}`);
      try {if (logs.includes(`yoggan-api listening on :${port}`) && (await fetch(`${base}/health`)).ok) break;} catch {}
      if (tries >= 40) throw new Error('Test API did not start.');
      await delay(100);
    }
    const post = (path, body, cookie) => fetch(base + path, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: base, ...(cookie ? {Cookie: cookie} : {})}, body: JSON.stringify(body)});
    const get = (path, cookie) => fetch(base + path, {headers: cookie ? {Cookie: cookie} : {}});
    const cookie = response => response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const account = email => ({name: 'Test member', email, password});
    let ownerCookie;
    let ownerId;
    let householdId;
    await t.test('failed first-account credentials leave bootstrap available', async () => {
      await sql.query("CREATE TRIGGER reject_test_credential BEFORE INSERT ON account FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected credential failure'");
      try {assert.equal((await post('/api/auth/sign-up/email', account('failed-first@example.test'))).ok, false);}
      finally {await sql.query('DROP TRIGGER reject_test_credential');}
      const [users] = await sql.query('SELECT id FROM user');
      assert.equal(users.length, 0);
      assert.deepEqual(await (await get('/api/auth/bootstrap')).json(), {open: true});
    });
    await t.test('only one concurrent first account can register', async () => {
      assert.deepEqual(await (await get('/api/auth/bootstrap')).json(), {open: true});
      const attempts = await Promise.all(['first-a@example.test', 'first-b@example.test'].map(email => post('/api/auth/sign-up/email', account(email))));
      assert.equal(attempts.filter(r => r.ok).length, 1);
      assert.equal(attempts.filter(r => r.status === 403).length, 1);
      const winner = attempts.find(r => r.ok);
      ownerCookie = cookie(winner);
      ownerId = (await winner.json()).user.id;
      assert.ok(ownerCookie);
      const [users] = await sql.query('SELECT id FROM user');
      assert.equal(users.length, 1);
      assert.deepEqual(await (await get('/api/auth/bootstrap')).json(), {open: false});
      assert.equal((await post('/api/auth/sign-up/email', account('blocked@example.test'))).status, 403);
    });
    await t.test('first account creates the household and becomes Admin', async () => {
      assert.deepEqual(await (await get('/api/households/setup', ownerCookie)).json(), {allowed: true});
      const response = await post('/api/households', {name: 'Integration household'}, ownerCookie);
      assert.equal(response.status, 201);
      const data = await response.json();
      householdId = data.household.id;
      assert.equal(data.member.isAdmin, 1);
      assert.deepEqual(await (await get('/api/households/setup', ownerCookie)).json(), {allowed: false});
    });
    const invite = async (options = {}) => {
      const response = await post(`/api/households/${householdId}/invites`, {kind: 'minor', maxUses: 1, expiresInDays: 1, ...options}, ownerCookie);
      assert.equal(response.status, 201);
      return (await response.json()).invite;
    };
    const signup = (token, email) => post('/api/households/join-with-invite', {...account(email), token});
    let invitedCookie;
    await t.test('an invite creates a member and a working login session', async () => {
      const link = await invite();
      const response = await signup(link.token, 'invited@example.test');
      assert.equal(response.status, 201, await response.clone().text());
      invitedCookie = cookie(response);
      const result = await response.json();
      assert.equal(result.member.kind, 'minor');
      assert.equal(result.member.householdId, householdId);
      const session = await (await get('/api/auth/get-session', invitedCookie)).json();
      assert.equal(session.user.email, 'invited@example.test');
      const member = await (await get('/api/members/me', invitedCookie)).json();
      assert.equal(member.member.isAdmin, 0);
      assert.equal((await post('/api/auth/sign-in/email', {email: 'invited@example.test', password})).status, 200);
      assert.equal((await signup(link.token, 'reuse@example.test')).status, 410);
      const [orphan] = await sql.query('SELECT id FROM user WHERE email=?', ['reuse@example.test']);
      assert.equal(orphan.length, 0);
    });
    await t.test('invalid, expired and duplicate-account requests do not consume invitations', async () => {
      assert.equal((await signup('invalid', 'invalid@example.test')).status, 404);
      const expired = await invite();
      await sql.query('UPDATE invite_links SET expires_at=? WHERE id=?', [new Date(Date.now() - 60000), expired.id]);
      assert.equal((await signup(expired.token, 'expired@example.test')).status, 410);
      const fresh = await invite();
      assert.equal((await signup(fresh.token, 'invited@example.test')).status, 409);
      const [rows] = await sql.query('SELECT used_count FROM invite_links WHERE id=?', [fresh.id]);
      assert.equal(rows[0].used_count, 0);
      assert.equal((await signup(fresh.token, 'still-valid@example.test')).status, 201);
    });
    await t.test('concurrent signup cannot exceed a one-use invite', async () => {
      const link = await invite();
      const attempts = await Promise.all(['race-a@example.test', 'race-b@example.test'].map(email => signup(link.token, email)));
      assert.equal(attempts.filter(r => r.status === 201).length, 1);
      assert.equal(attempts.filter(r => r.status === 410).length, 1);
      const [users] = await sql.query("SELECT id FROM user WHERE email IN ('race-a@example.test','race-b@example.test')");
      assert.equal(users.length, 1);
      const [links] = await sql.query('SELECT used_count FROM invite_links WHERE id=?', [link.id]);
      assert.equal(links[0].used_count, 1);
    });
    await t.test('membership failure rolls back the auth user, account, session and invite use', async () => {
      const link = await invite();
      await sql.query("CREATE TRIGGER reject_test_membership BEFORE INSERT ON members FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected membership failure'");
      try {assert.equal((await signup(link.token, 'rollback@example.test')).status, 500);}
      finally {await sql.query('DROP TRIGGER reject_test_membership');}
      const [users] = await sql.query("SELECT id FROM user WHERE email='rollback@example.test'");
      assert.equal(users.length, 0);
      const [links] = await sql.query('SELECT used_count FROM invite_links WHERE id=?', [link.id]);
      assert.equal(links[0].used_count, 0);
      assert.equal((await signup(link.token, 'rollback@example.test')).status, 201);
    });
    await t.test('non-Admin members cannot issue invitations or initialize another household', async () => {
      assert.equal((await post(`/api/households/${householdId}/invites`, {kind: 'adult'}, invitedCookie)).status, 403);
      assert.notEqual((await post('/api/households', {name: 'Forbidden second household'}, invitedCookie)).status, 201);
    });
    await t.test('existing accounts join by link, with the same usage limits', async () => {
      const id = randomUUID();
      // Simulate an older installation's existing account without membership.
      await sql.query('INSERT INTO user (id,name,email,email_verified) VALUES (?,?,?,0)', [id, 'Legacy member', 'legacy@example.test']);
      // Sign a normal session with Better Auth in the isolated API process instead
      // of inventing a cookie: credential login creates the signed session.
      const {hashPassword} = await import('better-auth/crypto');
      await sql.query('INSERT INTO account (id,account_id,provider_id,user_id,password,updated_at) VALUES (?,?,?,?,?,?)', [randomUUID(), id, 'credential', id, await hashPassword(password), new Date()]);
      const login = await post('/api/auth/sign-in/email', {email:'legacy@example.test', password});
      assert.equal(login.status, 200);
      const legacyCookie = cookie(login);
      assert.equal((await post('/api/households', {name:'Bypass'}, legacyCookie)).status, 403);
      const link = await invite({kind:'adult'});
      const joined = await post('/api/households/join', {token:link.token}, legacyCookie);
      assert.equal(joined.status, 201);
      const [member] = await sql.query('SELECT kind,is_admin FROM members WHERE user_id=?',[id]);
      assert.equal(member[0].kind,'adult');
      assert.equal(member[0].is_admin,0);
      assert.equal((await post('/api/households/join', {token:link.token}, legacyCookie)).status,410);
    });
    assert.ok(ownerId);
    assert.doesNotMatch(logs, /was not found in the query object/, 'Auth queries must resolve the registered Drizzle schema.');
  } finally {
    if (server && server.exitCode === null) {server.kill(); await new Promise(resolve => server.once('exit', resolve));}
    if (created) await sql.query(`DROP DATABASE \`${database}\``);
    await sql.end();
  }
});
