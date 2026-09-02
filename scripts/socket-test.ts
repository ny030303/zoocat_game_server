/**
 * 소켓 기능 통합 스모크 테스트
 *
 * 서버 + MongoDB 가 떠 있는 상태에서 실행한다:
 *   docker compose up -d            # 서버(3000) + mongo
 *   npm run test:socket             # WS_URL 기본값 ws://localhost:3000
 *   WS_URL=ws://1.2.3.4:3000 npm run test:socket
 *
 * signup → login → joinLobby → updateDeck → sendMessage(브로드캐스트) → leaveLobby
 * 순서로 요청/응답을 검증한다. 전부 통과하면 exit 0, 하나라도 실패하면 exit 1.
 */
import WebSocket from 'ws';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3000';
const WAIT_MS = Number(process.env.WAIT_MS) || 5000;

type Msg = { event: string; data: any };
type Waiter = { events: string[]; resolve: (m: Msg) => void; timer: ReturnType<typeof setTimeout> };

/** ws 클라이언트 래퍼 — 먼저 도착한 응답도 큐에 버퍼링해서 놓치지 않는다. */
class TestClient {
    private ws!: WebSocket;
    private queue: Msg[] = [];
    private waiters: Waiter[] = [];

    constructor(readonly name: string) {}

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(WS_URL);
            const to = setTimeout(() => reject(new Error(`${this.name}: 연결 타임아웃 (${WS_URL})`)), WAIT_MS);
            this.ws.on('open', () => { clearTimeout(to); resolve(); });
            this.ws.on('error', (e) => { clearTimeout(to); reject(e); });
            this.ws.on('message', (raw) => this.onMessage(raw.toString()));
        });
    }

    private onMessage(raw: string) {
        let msg: Msg;
        try { msg = JSON.parse(raw); } catch { msg = { event: '<non-json>', data: raw }; }
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

    /** events 중 하나에 해당하는 다음 메시지를 기다린다. */
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

    /** ms 동안 해당 event 가 오지 않아야 통과. */
    async expectNoMessage(event: string, ms = 400) {
        try {
            const m = await this.waitFor(event, ms);
            throw new Error(`${this.name}: '${event}' 를 받으면 안 되는데 받음: ${JSON.stringify(m.data)}`);
        } catch (e) {
            if ((e as Error).message.includes('타임아웃')) return; // 기대대로 안 옴
            throw e;
        }
    }

    close() {
        try { this.ws.close(); } catch { /* noop */ }
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

async function main() {
    console.log(`\n▶ 소켓 스모크 테스트  (${WS_URL})\n`);

    const c1 = new TestClient('c1');
    const c2 = new TestClient('c2');
    try {
        await c1.connect();
        await c2.connect();
    } catch (e) {
        console.error(`\n서버에 연결할 수 없습니다: ${(e as Error).message}`);
        console.error('먼저 서버를 띄우세요:  docker compose up -d\n');
        process.exit(1);
    }

    const uid = `test-${Date.now()}`;
    const cred = { id: uid, userName: uid, underage: 'false' };
    const freshId = `test-${Date.now()}-auto`;

    await test('signup — 신규 유저 등록', async () => {
        c1.send('signup', cred);
        const r = await c1.waitFor(['signupResult', 'signupError']);
        assert(r.event === 'signupResult', `signupError 수신: ${JSON.stringify(r.data)}`);
        assert(r.data?.userProfile?.id === uid, 'userProfile.id 불일치');
        assert(Array.isArray(r.data?.userProfile?.selectedUnits), 'selectedUnits 가 배열이 아님');
    });

    await test('signup — 중복 유저는 signupError', async () => {
        c1.send('signup', cred);
        const r = await c1.waitFor(['signupResult', 'signupError']);
        assert(r.event === 'signupError', 'signupError 가 와야 함');
        assert(String(r.data).includes('already exists'), `메시지 예상과 다름: ${r.data}`);
    });

    await test('login — 기존 유저 loginSuccess (isNewUser=false)', async () => {
        c1.send('login', cred);
        const r = await c1.waitFor(['loginSuccess', 'loginError']);
        assert(r.event === 'loginSuccess', `예상 loginSuccess, 실제 ${r.event}`);
        assert(r.data?.userProfile?.username === uid, 'username 불일치');
        assert(r.data?.isNewUser === false, 'isNewUser 가 false 여야 함');
    });

    await test('login — 미존재 유저는 자동 가입 후 loginSuccess (isNewUser=true)', async () => {
        c1.send('login', { id: freshId, userName: freshId, underage: 'false' });
        const r = await c1.waitFor(['loginSuccess', 'loginError']);
        assert(r.event === 'loginSuccess', `예상 loginSuccess, 실제 ${r.event}`);
        assert(r.data?.isNewUser === true, 'isNewUser 가 true 여야 함');
        assert(r.data?.userProfile?.id === freshId, 'userProfile.id 불일치');
    });

    await test('joinLobby — 유저 유닛 반환', async () => {
        c1.send('joinLobby', { userId: uid });
        const r = await c1.waitFor(['userJoined', 'error']);
        assert(r.event === 'userJoined', `error 수신: ${JSON.stringify(r.data)}`);
        assert(Array.isArray(r.data?.units?.units), 'units.units 가 배열이 아님');
        assert(r.data.units.units.length === 9, `초기 유닛 9개 예상, 실제 ${r.data.units.units.length}`);
    });

    await test('updateDeck — 5장 덱 성공', async () => {
        c1.send('updateDeck', { userId: uid, newDeck: ['1001', '1002', '1003', '1004', '1006'] });
        const r = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(r.event === 'deckUpdated', `deckUpdateError: ${JSON.stringify(r.data)}`);
        assert(r.data?.newDeck?.length === 5, 'newDeck 길이가 5가 아님');
    });

    await test('updateDeck — 5장이 아니면 에러', async () => {
        c1.send('updateDeck', { userId: uid, newDeck: ['1001', '1002', '1003'] });
        const r = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(r.event === 'deckUpdateError', 'deckUpdateError 가 와야 함');
        assert(String(r.data).includes('exactly 5'), `메시지 예상과 다름: ${r.data}`);
    });

    await test('sendMessage — 다른 클라이언트에게만 브로드캐스트', async () => {
        const text = `hello-${Date.now()}`;
        c1.send('sendMessage', { lobbyId: 'lobby-1', message: text });
        const r = await c2.waitFor('newMessage');
        assert(r.data?.message === text, `c2 수신 메시지 불일치: ${JSON.stringify(r.data)}`);
        await c1.expectNoMessage('newMessage', 400); // 보낸 본인은 안 받아야 함
    });

    await test('leaveLobby — userLeft 에코', async () => {
        c1.send('leaveLobby', 'lobby-1');
        const r = await c1.waitFor('userLeft');
        assert(r.data === 'lobby-1', `userLeft data 불일치: ${JSON.stringify(r.data)}`);
    });

    await test('잘못된 JSON — error 응답', async () => {
        c1.sendRaw('this-is-not-json');
        const r = await c1.waitFor('error');
        assert(String(r.data).includes('잘못된 메시지 형식'), `메시지 예상과 다름: ${r.data}`);
    });

    // ── 매칭 (matchmaking) ──────────────────────────────────
    const uidB = `test-${Date.now()}-b`;
    const c3 = new TestClient('c3');
    let matchId = '';

    await test('매칭 준비 — c1 재로그인, c2 로그인, c3 로그인', async () => {
        // c1 은 직전 테스트에서 freshId 로 로그인했으므로 uid 로 되돌린다.
        c1.send('login', { id: uid, userName: uid, underage: 'false' });
        const r1 = await c1.waitFor(['loginSuccess', 'loginError']);
        assert(r1.event === 'loginSuccess', `c1 재로그인 실패: ${JSON.stringify(r1.data)}`);
        c2.send('login', { id: uidB, userName: uidB, underage: 'false' });
        const r2 = await c2.waitFor(['loginSuccess', 'loginError']);
        assert(r2.event === 'loginSuccess', `c2 로그인 실패: ${JSON.stringify(r2.data)}`);
        await c3.connect();
        const uidC = `test-${Date.now()}-c`;
        c3.send('login', { id: uidC, userName: uidC, underage: 'false' });
        const r3 = await c3.waitFor(['loginSuccess', 'loginError']);
        assert(r3.event === 'loginSuccess', `c3 로그인 실패: ${JSON.stringify(r3.data)}`);
    });

    await test('enqueue — 첫 요청은 queued', async () => {
        c1.send('enqueue', null);
        const r = await c1.waitFor(['queued', 'matchFound', 'error']);
        assert(r.event === 'queued', `queued 예상, 실제 ${r.event}: ${JSON.stringify(r.data)}`);
    });

    await test('enqueue — 두 번째 요청에 양쪽 matchFound', async () => {
        c2.send('enqueue', null);
        const [f1, f2] = await Promise.all([c1.waitFor('matchFound'), c2.waitFor('matchFound')]);
        assert(!!f1.data?.matchId && f1.data.matchId === f2.data?.matchId, '양쪽 matchId 불일치');
        matchId = f1.data.matchId;
        assert(f1.data.you?.userId === uid, `c1 you.userId 불일치: ${f1.data.you?.userId}`);
        assert(f1.data.opponent?.userId === uidB, `c1 opponent.userId 불일치: ${f1.data.opponent?.userId}`);
        assert(Array.isArray(f1.data.you?.deck) && f1.data.you.deck.length === 5, 'you.deck 5장 아님');
        assert(f2.data.you?.userId === uidB && f2.data.opponent?.userId === uid, 'c2 시점 you/opponent 뒤바뀜');
    });

    await test('enqueue — 매치 중 재요청은 error', async () => {
        c1.send('enqueue', null);
        const r = await c1.waitFor(['queued', 'matchFound', 'error']);
        assert(r.event === 'error' && String(r.data).includes('이미 매치'), `error 예상: ${r.event} ${r.data}`);
    });

    await test('matchMessage — 상대에게만 전달 (본인·제3자 미수신)', async () => {
        const move = { move: `m-${Date.now()}` };
        c1.send('matchMessage', { matchId, payload: move });
        const r = await c2.waitFor('matchMessage');
        assert(r.data?.from === uid, `from 불일치: ${r.data?.from}`);
        assert(r.data?.matchId === matchId, 'matchId 불일치');
        assert(JSON.stringify(r.data?.payload) === JSON.stringify(move), `payload 불일치: ${JSON.stringify(r.data?.payload)}`);
        await c1.expectNoMessage('matchMessage', 300);
        await c3.expectNoMessage('matchMessage', 300);
    });

    await test('matchMessage — 위조 matchId 는 error', async () => {
        c1.send('matchMessage', { matchId: 'bogus-match-id', payload: {} });
        const r = await c1.waitFor(['matchMessage', 'error']);
        assert(r.event === 'error' && String(r.data).includes('유효하지 않은'), `error 예상: ${r.event} ${r.data}`);
    });

    await test('leaveMatch — 본인 matchEnded, 상대 opponentLeft', async () => {
        c1.send('leaveMatch', null);
        const [ended, left] = await Promise.all([c1.waitFor('matchEnded'), c2.waitFor('opponentLeft')]);
        assert(ended.data?.matchId === matchId && ended.data?.reason === 'left', `matchEnded 내용 불일치: ${JSON.stringify(ended.data)}`);
        assert(left.data?.matchId === matchId, `opponentLeft matchId 불일치: ${JSON.stringify(left.data)}`);
    });

    await test('leaveMatch 후 matchMessage 는 error', async () => {
        c1.send('matchMessage', { matchId, payload: {} });
        const r = await c1.waitFor(['matchMessage', 'error']);
        assert(r.event === 'error', `error 예상, 실제 ${r.event}`);
    });

    await test('dequeue — 큐에서 이탈', async () => {
        c1.send('enqueue', null);
        const q = await c1.waitFor(['queued', 'matchFound', 'error']);
        assert(q.event === 'queued', `queued 예상: ${q.event}`);
        c1.send('dequeue', null);
        const r = await c1.waitFor('queueLeft');
        assert(r.event === 'queueLeft', 'queueLeft 예상');
    });

    await test('disconnect — 상대 연결 종료 시 opponentLeft', async () => {
        c1.send('enqueue', null);
        await c1.waitFor(['queued']);
        c2.send('enqueue', null);
        const [g1] = await Promise.all([c1.waitFor('matchFound'), c2.waitFor('matchFound')]);
        c2.close();
        const r = await c1.waitFor('opponentLeft');
        assert(r.data?.matchId === g1.data.matchId, `opponentLeft matchId 불일치: ${JSON.stringify(r.data)}`);
    });

    await test('auth gate — 미로그인 연결의 enqueue 는 error', async () => {
        const anon = new TestClient('anon');
        await anon.connect();
        anon.send('enqueue', null);
        const r = await anon.waitFor(['queued', 'matchFound', 'error']);
        assert(r.event === 'error' && String(r.data).includes('로그인'), `error 예상: ${r.event} ${r.data}`);
        anon.close();
    });

    // ── 보안 회귀 ───────────────────────────────────────────
    await test('보안 — login 에 NoSQL 연산자 주입 시 거부', async () => {
        const sec = new TestClient('sec');
        await sec.connect();
        sec.send('login', { id: { $ne: 'x' }, userName: 'x', underage: 'false' });
        const r = await sec.waitFor(['loginSuccess', 'loginError', 'signupResult', 'signupError']);
        assert(
            r.event === 'loginError' || r.event === 'signupError',
            `주입 거부 예상, 실제 ${r.event}: ${JSON.stringify(r.data)}`,
        );
        sec.close();
    });

    await test('보안 — updateDeck 는 연결 유저 기준(payload.userId 무시)', async () => {
        c1.send('login', { id: uid, userName: uid, underage: 'false' });
        await c1.waitFor(['loginSuccess', 'loginError']);
        c1.send('updateDeck', { userId: 'nonexistent-victim', newDeck: ['1001', '1002', '1003', '1004', '1005'] });
        const r = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
        if (r.event === 'deckUpdateError') {
            assert(!String(r.data).includes('not found'), `payload.userId 를 신뢰함: ${r.data}`);
        }
    });

    await test('보안 — 미로그인 연결의 updateDeck / sendMessage 는 거부', async () => {
        const sec = new TestClient('sec2');
        await sec.connect();
        sec.send('updateDeck', { newDeck: ['1001', '1002', '1003', '1004', '1005'] });
        const r1 = await sec.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(r1.event === 'deckUpdateError' && String(r1.data).includes('로그인'), `updateDeck 거부 예상: ${r1.event} ${r1.data}`);
        sec.send('sendMessage', { message: 'hi' });
        const r2 = await sec.waitFor(['newMessage', 'error']);
        assert(r2.event === 'error' && String(r2.data).includes('로그인'), `sendMessage 거부 예상: ${r2.event} ${r2.data}`);
        sec.close();
    });

    await test('보안 — updateDeck: 중복 유닛 / 미보유 유닛 거부', async () => {
        c1.send('login', { id: uid, userName: uid, underage: 'false' });
        await c1.waitFor(['loginSuccess', 'loginError']);

        c1.send('updateDeck', { newDeck: ['1001', '1001', '1002', '1003', '1004'] });
        const dup = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(dup.event === 'deckUpdateError', `중복 유닛 거부 예상: ${dup.event}`);

        c1.send('updateDeck', { newDeck: ['1001', '1002', '1003', '1004', '9999'] });
        const unknown = await c1.waitFor(['deckUpdated', 'deckUpdateError']);
        assert(unknown.event === 'deckUpdateError', `미보유 유닛 거부 예상: ${unknown.event}`);
    });

    await test('보안 — sendMessage: 500자 초과 거부', async () => {
        c1.send('sendMessage', { message: 'x'.repeat(501) });
        const r = await c1.waitFor(['newMessage', 'error']);
        assert(r.event === 'error', `길이 초과 거부 예상: ${r.event}`);
    });

    c3.close();
    c1.close();
    c2.close();

    console.log(`\n── 결과: ${pass} 통과 / ${fail} 실패 ──\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
