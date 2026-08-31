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

    c1.close();
    c2.close();

    console.log(`\n── 결과: ${pass} 통과 / ${fail} 실패 ──\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
