/**
 * 소켓 통합 스모크 테스트 (auth-session Phase 1 반영)
 *
 *   docker compose up -d
 *   npm run test:socket            # WS_URL 기본 ws://localhost:3000
 *
 * 흐름: register → { userId, deviceId, deviceSecret, token } → 이후 login / resumeSession.
 * 전부 통과하면 exit 0, 하나라도 실패하면 exit 1.
 */
import WebSocket from 'ws';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3000';
const WAIT_MS = Number(process.env.WAIT_MS) || 5000;

type Msg = { event: string; data: any };
type Waiter = { events: string[]; resolve: (m: Msg) => void; timer: ReturnType<typeof setTimeout> };

interface Creds {
    userId: string;
    deviceId: string;
    deviceSecret: string;
    token: string;
}

class TestClient {
    private ws!: WebSocket;
    private queue: Msg[] = [];
    private waiters: Waiter[] = [];

    constructor(readonly name: string) {}

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_URL);
            const to = setTimeout(() => reject(new Error(`${this.name}: 연결 타임아웃 (${WS_URL})`)), WAIT_MS);
            this.ws.on('open', () => {
                clearTimeout(to);
                resolve();
            });
            this.ws.on('error', (e) => {
                clearTimeout(to);
                reject(e);
            });
            this.ws.on('message', (raw) => this.onMessage(raw.toString()));
        });
    }

    private onMessage(raw: string) {
        let msg: Msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            msg = { event: '<non-json>', data: raw };
        }
        const idx = this.waiters.findIndex((w) => w.events.includes(msg.event));
        if (idx >= 0) {
            const [w] = this.waiters.splice(idx, 1);
            clearTimeout(w.timer);
            w.resolve(msg);
        } else {
            this.queue.push(msg);
        }
    }

    send(event: string, data: unknown) {
        this.ws.send(JSON.stringify({ event, data }));
    }
    sendRaw(raw: string) {
        this.ws.send(raw);
    }

    waitFor(events: string | string[], ms = WAIT_MS): Promise<Msg> {
        const evs = Array.isArray(events) ? events : [events];
        const qi = this.queue.findIndex((m) => evs.includes(m.event));
        if (qi >= 0) return Promise.resolve(this.queue.splice(qi, 1)[0]);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const i = this.waiters.findIndex((w) => w.timer === timer);
                if (i >= 0) this.waiters.splice(i, 1);
                reject(new Error(`${this.name}: [${evs.join('|')}] 응답 대기 타임아웃 (${ms}ms)`));
            }, ms);
            this.waiters.push({ events: evs, resolve, timer });
        });
    }

    async expectNoMessage(event: string, ms = 400) {
        try {
            const m = await this.waitFor(event, ms);
            throw new Error(`${this.name}: '${event}' 를 받으면 안 되는데 받음: ${JSON.stringify(m.data)}`);
        } catch (e) {
            if ((e as Error).message.includes('타임아웃')) return;
            throw e;
        }
    }

    /** register 후 인증된 상태가 된다. 발급 자격증명을 반환. */
    async register(name: string, underage: string | boolean = 'false'): Promise<Creds> {
        this.send('register', { userName: name, underage });
        const r = await this.waitFor(['registered', 'registerError', 'error']);
        if (r.event !== 'registered') throw new Error(`${this.name}: register 실패 (${r.event}): ${JSON.stringify(r.data)}`);
        return {
            userId: r.data.userId,
            deviceId: r.data.deviceId,
            deviceSecret: r.data.deviceSecret,
            token: r.data.token,
        };
    }

    close() {
        try {
            this.ws.close();
        } catch {
            /* noop */
        }
    }
}

// ── 미니 러너 ────────────────────────────────────────────────
let pass = 0;
let fail = 0;
async function test(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        pass++;
        console.log(`  \x1b[32m✔\x1b[0m ${name}`);
    } catch (e) {
        fail++;
        console.log(`  \x1b[31m✘\x1b[0m ${name}\n     ${(e as Error).message}`);
    }
}
function assert(cond: unknown, msg: string): asserts cond {
    if (!cond) throw new Error(msg);
}
const UUID_RE = /^[0-9a-f-]{36}$/i;

async function main() {
    console.log(`\n▶ 소켓 스모크 테스트  (${WS_URL})\n`);

    const c1 = new TestClient('c1');
    const c2 = new TestClient('c2');
    const c3 = new TestClient('c3');
    try {
        await c1.connect();
        await c2.connect();
        await c3.connect();
    } catch (e) {
        console.error(`\n서버 연결 실패: ${(e as Error).message}\n먼저 서버를 띄우세요: docker compose up -d\n`);
        process.exit(1);
    }

    let cred1: Creds;
    const name1 = `u1-${Date.now()}`;

    // ── 인증 ────────────────────────────────────────────────
    await test('register — userId/deviceId/deviceSecret/token 발급', async () => {
        cred1 = await c1.register(name1);
        assert(UUID_RE.test(cred1.userId), `userId UUID 아님: ${cred1.userId}`);
        assert(UUID_RE.test(cred1.deviceId), `deviceId UUID 아님`);
        assert(/^[A-Za-z0-9_-]{43}$/.test(cred1.deviceSecret), `deviceSecret 형식 이상: ${cred1.deviceSecret}`);
        assert(/^[A-Za-z0-9_-]{43}$/.test(cred1.token), `token 형식 이상`);
    });

    await test('register — 잉여 키(mass-assignment) 저장 안 됨', async () => {
        const sec = new TestClient('mass');
        await sec.connect();
        const mid = `mass-${Date.now()}`;
        sec.send('register', {
            userName: mid,
            underage: 'false',
            deviceSecretHash: 'x',
            providerUserId: 'victim',
            role: 'admin',
            gems: 999999,
        });
        const r = await sec.waitFor(['registered', 'registerError']);
        assert(r.event === 'registered', `registered 예상: ${r.event}`);
        const p = r.data.userProfile ?? {};
        assert(
            !('deviceSecretHash' in p) && !('providerUserId' in p) && !('role' in p),
            `잉여 키 저장됨: ${Object.keys(p).join(',')}`,
        );
        assert(p.gems === 0, `gems 에 클라값 주입됨: ${p.gems}`);
        sec.close();
    });

    await test('register — 이미 인증된 소켓이면 거부', async () => {
        c1.send('register', { userName: 'again', underage: 'false' });
        const r = await c1.waitFor(['registered', 'registerError', 'error']);
        assert(r.event === 'error' && String(r.data).includes('이미 로그인'), `거부 예상: ${r.event} ${r.data}`);
    });

    // login/resume 테스트는 c1 이 아닌 별도 throwaway 계정으로 (bind 가 c1 소켓을 kick 하지 않게)
    let credL: Creds;
    await test('login/resume 준비 — throwaway 계정 register', async () => {
        const cl0 = new TestClient('cl0');
        await cl0.connect();
        credL = await cl0.register(`throwaway-${Date.now()}`);
        cl0.close();
    });

    await test('login — register 자격증명으로 성공', async () => {
        const cl = new TestClient('login1');
        await cl.connect();
        cl.send('login', { userId: credL.userId, deviceId: credL.deviceId, deviceSecret: credL.deviceSecret });
        const r = await cl.waitFor(['loginSuccess', 'loginError']);
        assert(r.event === 'loginSuccess', `loginSuccess 예상: ${r.event} ${JSON.stringify(r.data)}`);
        assert(/^[A-Za-z0-9_-]{43}$/.test(r.data.token), 'login 응답 token 형식 이상');
        assert(r.data.userProfile?.id === credL.userId, 'userProfile.id 불일치');
        cl.close();
    });

    await test('login — 틀린 deviceSecret 거부', async () => {
        const cl = new TestClient('login2');
        await cl.connect();
        const wrong = 'A'.repeat(43);
        cl.send('login', { userId: credL.userId, deviceId: credL.deviceId, deviceSecret: wrong });
        const r = await cl.waitFor(['loginSuccess', 'loginError']);
        assert(r.event === 'loginError' && String(r.data).includes('자격 증명'), `거부 예상: ${r.event} ${r.data}`);
        cl.close();
    });

    await test('login — 존재하지 않는 userId 거부 (타이밍 유사)', async () => {
        const cl = new TestClient('login3');
        await cl.connect();
        const fakeId = '00000000-0000-4000-8000-000000000000';
        const t0 = Date.now();
        cl.send('login', { userId: fakeId, deviceId: credL.deviceId, deviceSecret: credL.deviceSecret });
        const r = await cl.waitFor(['loginSuccess', 'loginError']);
        const dt = Date.now() - t0;
        assert(r.event === 'loginError', `거부 예상: ${r.event}`);
        assert(dt < 2000, `응답이 너무 느림(${dt}ms) — 타이밍 오라클 의심`);
        cl.close();
    });

    await test('login — 형식 위반 거부', async () => {
        const cl = new TestClient('login4');
        await cl.connect();
        cl.send('login', { userId: 'not-a-uuid', deviceId: 'x', deviceSecret: '짧음' });
        const r = await cl.waitFor(['loginSuccess', 'loginError']);
        assert(r.event === 'loginError' && String(r.data).includes('잘못된 요청'), `거부 예상: ${r.event} ${r.data}`);
        cl.close();
    });

    await test('login — 구 계약 { id, userName } 거부', async () => {
        const cl = new TestClient('legacy');
        await cl.connect();
        cl.send('login', { id: 'legacy-id', userName: 'legacy', underage: 'false' });
        const r = await cl.waitFor(['loginSuccess', 'loginError', 'error']);
        assert(r.event !== 'loginSuccess', `구 login 이 성공하면 안 됨: ${JSON.stringify(r.data)}`);
        cl.close();
    });

    await test('resumeSession — 유효 토큰 복원', async () => {
        const cl = new TestClient('resume1');
        await cl.connect();
        cl.send('resumeSession', { token: credL.token });
        const r = await cl.waitFor(['loginSuccess', 'sessionExpired']);
        assert(r.event === 'loginSuccess', `loginSuccess 예상: ${r.event}`);
        assert(r.data.token === undefined, 'resumeSession 은 token 을 재발급하지 않아야 함');
        assert(r.data.userProfile?.id === credL.userId, 'userProfile.id 불일치');
        cl.close();
    });

    await test('resumeSession — 무효 토큰 → sessionExpired', async () => {
        const cl = new TestClient('resume2');
        await cl.connect();
        cl.send('resumeSession', { token: 'Z'.repeat(43) });
        const r = await cl.waitFor(['loginSuccess', 'sessionExpired']);
        assert(r.event === 'sessionExpired', `sessionExpired 예상: ${r.event}`);
        cl.close();
    });

    // ── 로비 / 덱 (회귀) ────────────────────────────────────
    await test('joinLobby — 유저 유닛 반환 (초기 9개)', async () => {
        c1.send('joinLobby', {});
        const r = await c1.waitFor(['userJoined', 'error']);
        assert(r.event === 'userJoined', `error 수신: ${JSON.stringify(r.data)}`);
        assert(Array.isArray(r.data?.units?.units) && r.data.units.units.length === 9, '초기 유닛 9개 아님');
    });

    await test('updateDeck — 5장 성공 (연결 유저 기준)', async () => {
        c1.send('updateDeck', { userId: 'ignored', newDeck: ['1001', '1002', '1003', '1004', '1006'] });
        const r = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(r.event === 'deckUpdated', `deckUpdateError: ${JSON.stringify(r.data)}`);
        assert(r.data?.newDeck?.length === 5, 'newDeck 길이 5 아님');
    });

    await test('updateDeck — 5장 아니면 / 중복 / 미보유 거부', async () => {
        for (const bad of [
            ['1001', '1002', '1003'],
            ['1001', '1001', '1002', '1003', '1004'],
            ['1001', '1002', '1003', '1004', '9999'],
        ]) {
            c1.send('updateDeck', { newDeck: bad });
            const r = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
            assert(r.event === 'deckUpdateError', `deckUpdateError 예상 (${JSON.stringify(bad)}): ${r.event}`);
        }
    });

    await test('보안 — 미인증 소켓의 updateDeck / sendMessage / enqueue 거부', async () => {
        const anon = new TestClient('anon');
        await anon.connect();
        anon.send('updateDeck', { newDeck: ['1001', '1002', '1003', '1004', '1005'] });
        const r1 = await anon.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(r1.event === 'deckUpdateError' && String(r1.data).includes('로그인'), `updateDeck 거부: ${r1.event} ${r1.data}`);
        anon.send('sendMessage', { message: 'hi' });
        const r2 = await anon.waitFor(['newMessage', 'error']);
        assert(r2.event === 'error' && String(r2.data).includes('로그인'), `sendMessage 거부: ${r2.event} ${r2.data}`);
        anon.send('enqueue', null);
        const r3 = await anon.waitFor(['queued', 'matchFound', 'error']);
        assert(r3.event === 'error' && String(r3.data).includes('로그인'), `enqueue 거부: ${r3.event} ${r3.data}`);
        anon.close();
    });

    await test('보안 — register 에 NoSQL 연산자 주입 거부', async () => {
        const cl = new TestClient('inj');
        await cl.connect();
        cl.send('register', { userName: { $ne: 'x' }, underage: 'false' });
        const r = await cl.waitFor(['registered', 'registerError', 'error']);
        assert(r.event !== 'registered', `주입이 거부돼야 함: ${JSON.stringify(r.data)}`);
        cl.close();
    });

    // ── 채팅 (회귀) ────────────────────────────────────────
    let cred2: Creds;
    await test('매칭 준비 — c2 / c3 register', async () => {
        cred2 = await c2.register(`u2-${Date.now()}`);
        await c3.register(`u3-${Date.now()}`);
        assert(UUID_RE.test(cred2.userId), 'c2 userId 이상');
    });

    await test('sendMessage — 다른 클라에게만 브로드캐스트 (+ from)', async () => {
        const text = `hi-${Date.now()}`;
        c1.send('sendMessage', { message: text });
        const r = await c2.waitFor('newMessage');
        assert(r.data?.message === text && typeof r.data?.from === 'string', `newMessage 내용 이상: ${JSON.stringify(r.data)}`);
        await c1.expectNoMessage('newMessage', 300);
    });

    await test('sendMessage — 500자 초과 거부', async () => {
        c1.send('sendMessage', { message: 'x'.repeat(501) });
        const r = await c1.waitFor(['newMessage', 'error']);
        assert(r.event === 'error', `길이 초과 거부 예상: ${r.event}`);
    });

    // ── 매칭 (회귀) ────────────────────────────────────────
    let matchId = '';
    await test('enqueue — 첫 요청 queued', async () => {
        c1.send('enqueue', null);
        const r = await c1.waitFor(['queued', 'matchFound', 'error']);
        assert(r.event === 'queued', `queued 예상: ${r.event} ${JSON.stringify(r.data)}`);
    });

    await test('enqueue — 두 번째 요청에 양쪽 matchFound', async () => {
        c2.send('enqueue', null);
        const [f1, f2] = await Promise.all([c1.waitFor('matchFound'), c2.waitFor('matchFound')]);
        assert(!!f1.data?.matchId && f1.data.matchId === f2.data?.matchId, '양쪽 matchId 불일치');
        matchId = f1.data.matchId;
        assert(f1.data.you?.userId === cred1.userId && f1.data.opponent?.userId === cred2.userId, 'c1 시점 you/opponent 이상');
        assert(Array.isArray(f1.data.you?.deck) && f1.data.you.deck.length === 5, 'deck 5장 아님');
    });

    await test('enqueue — 매치 중 재요청 error', async () => {
        c1.send('enqueue', null);
        const r = await c1.waitFor(['queued', 'matchFound', 'error']);
        assert(r.event === 'error' && String(r.data).includes('이미 매치'), `error 예상: ${r.event} ${r.data}`);
    });

    await test('matchMessage — 상대에게만 전달 (본인·제3자 미수신)', async () => {
        const move = { m: `x-${Date.now()}` };
        c1.send('matchMessage', { matchId, payload: move });
        const r = await c2.waitFor('matchMessage');
        assert(r.data?.from === cred1.userId && JSON.stringify(r.data?.payload) === JSON.stringify(move), `중계 내용 이상: ${JSON.stringify(r.data)}`);
        await c1.expectNoMessage('matchMessage', 300);
        await c3.expectNoMessage('matchMessage', 300);
    });

    await test('matchMessage — 위조 matchId error', async () => {
        c1.send('matchMessage', { matchId: 'bogus', payload: {} });
        const r = await c1.waitFor(['matchMessage', 'error']);
        assert(r.event === 'error' && String(r.data).includes('유효하지 않은'), `error 예상: ${r.event} ${r.data}`);
    });

    await test('leaveMatch — 본인 matchEnded, 상대 opponentLeft', async () => {
        c1.send('leaveMatch', null);
        const [ended, left] = await Promise.all([c1.waitFor('matchEnded'), c2.waitFor('opponentLeft')]);
        assert(ended.data?.reason === 'left' && left.data?.matchId === matchId, '종료 이벤트 내용 이상');
    });

    await test('dequeue — 큐 이탈', async () => {
        c1.send('enqueue', null);
        await c1.waitFor(['queued']);
        c1.send('dequeue', null);
        const r = await c1.waitFor('queueLeft');
        assert(r.event === 'queueLeft', 'queueLeft 예상');
    });

    await test('logout — 큐 대기 중 로그아웃 시 유령 없음 + unbind', async () => {
        c1.send('enqueue', null);
        await c1.waitFor(['queued']);
        c1.send('logout', {});
        const lo = await c1.waitFor(['loggedOut']);
        assert(lo.event === 'loggedOut', 'loggedOut 예상');
        // 언바인드 확인: 이제 enqueue 하면 미인증 취급
        c1.send('enqueue', null);
        const r = await c1.waitFor(['queued', 'matchFound', 'error']);
        assert(r.event === 'error' && String(r.data).includes('로그인'), `unbind 후 enqueue 는 거부돼야 함: ${r.event} ${r.data}`);
        // c2 가 이제 enqueue 해도 유령(c1)과 페어링되지 않아야 함
        c2.send('enqueue', null);
        const q = await c2.waitFor(['queued', 'matchFound', 'error']);
        assert(q.event === 'queued', `c2 는 queued 여야 함(유령 페어링 X): ${q.event}`);
        c2.send('dequeue', null);
        await c2.waitFor('queueLeft');
    });

    await test('disconnect — 매치 중 상대 연결 종료 시 opponentLeft', async () => {
        const a = new TestClient('da');
        const b = new TestClient('db');
        await a.connect();
        await b.connect();
        await a.register(`da-${Date.now()}`);
        await b.register(`db-${Date.now()}`);
        a.send('enqueue', null);
        await a.waitFor(['queued']);
        b.send('enqueue', null);
        const [g] = await Promise.all([a.waitFor('matchFound'), b.waitFor('matchFound')]);
        b.close();
        const r = await a.waitFor('opponentLeft');
        assert(r.data?.matchId === g.data.matchId, 'opponentLeft matchId 불일치');
        a.close();
    });

    c1.close();
    c2.close();
    c3.close();

    console.log(`\n── 결과: ${pass} 통과 / ${fail} 실패 ──\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
