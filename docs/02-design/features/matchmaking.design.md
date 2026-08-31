# matchmaking Design Document

> **Summary**: 로그인 연결을 `userId` 에 바인딩하고, 인메모리 FIFO 큐로 두 플레이어를 1:1 매치로 페어링하며, 매치 동안 두 연결 사이의 메시지를 서버가 내용 해석 없이 중계한다.
>
> **Project**: zoocat_game_server
> **Version**: 1.0.0
> **Author**: ny030303
> **Date**: 2026-08-31
> **Status**: Draft
> **Planning Doc**: [matchmaking.plan.md](../../01-plan/features/matchmaking.plan.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1 (Schema) | — | N/A |
| Phase 2 (Convention) | — | N/A (암묵적 컨벤션 §10) |
| Phase 4 (API Spec) | 본 문서 §4 (WebSocket 이벤트 계약) | ✅ |

---

## 1. Overview

### 1.1 Design Goals

- `login` 이후 서버가 "이 연결이 누구인지" 알 수 있게 한다 (모든 실시간 기능의 전제).
- 두 플레이어를 결정론적으로 짝지어 양쪽에 동일 정보의 `matchFound` 를 보낸다.
- 매치 중 메시지를 그 매치의 2명에게만 전달한다 (제3자 격리).
- 큐·매치는 전부 인메모리. 연결/매치 종료 시 상태를 누수 없이 회수한다.
- 서버는 매치 메시지의 **내용을 해석하지 않는다** (중계자). 전투 판정은 클라이언트.

### 1.2 Design Principles

- **트랜스포트/로직 분리**: `sockets/*Handlers.ts` 는 `ws` 파싱·전송만, `services/*.ts` 는 순수 상태·규칙.
- **단일 인스턴스 전제**: 인메모리 `Map` 은 Node 단일 스레드에서 사실상 원자적. 다중 인스턴스는 Out of Scope.
- **역인덱스로 O(1) 조회**: `userId → matchId`, `userId → ws` 를 별도 Map 으로 유지.
- **기존 코드 최소 침습**: 새 이벤트는 `eventHandlers.ts` switch 에 case 추가, 종료 처리는 `socketServer.ts` 에 한 줄.

---

## 2. Architecture

### 2.1 Component Diagram

```
                        ┌───────────────────────────────────────────┐
 ws client A  ─┐        │  socketServer.ts                          │
 ws client B  ─┼─ ws ──▶│   on('message') → eventHandlers.ts (switch)│
 ws client C  ─┘        │   on('close')   → matchHandlers.handleDisconnect
                        └───────┬───────────────────────────────────┘
                                │ enqueue/dequeue/matchMessage/leaveMatch
                                ▼
                     ┌──────────────────────┐
                     │ sockets/matchHandlers│  (트랜스포트: 파싱·검증·전송)
                     └───┬───────┬───────┬──┘
             getUserId/  │       │       │  findById
             sendTo      ▼       ▼       ▼
        ┌────────────────────┐ ┌──────────────┐ ┌────────────────────┐ ┌───────────────┐
        │ connectionRegistry │ │ matchmaking  │ │   matchService     │ │ UserRepository│
        │ Map<userId,ws> 양방향│ │ Service       │ │ Map<matchId,Match> │ │  (기존)        │
        │ sendTo()           │ │ FIFO queue    │ │ + Map<userId,matchId>│ │  findById     │
        └────────────────────┘ └──────────────┘ └────────────────────┘ └───────┬───────┘
                                                                                │
                                                                          MongoDB (Atlas)
```

### 2.2 Data Flow

**enqueue (대기)**
```
client → {event:'enqueue'}
  handleEnqueue: getUserId(ws) → matchService.getMatchIdOf? → matchmaking.enqueue(userId)
  = 'queued'  → client ← {event:'queued', data:null}
```

**enqueue (즉시 매칭)**
```
clientB → {event:'enqueue'}   (큐에 A 대기 중)
  matchmaking.enqueue(B) = {status:'matched', opponentId:A}
  matchService.createMatch(A,B) → matchId
  Promise.all(findById(A), findById(B))
  A ← {event:'matchFound', data:{matchId, you:A정보, opponent:B정보}}
  B ← {event:'matchFound', data:{matchId, you:B정보, opponent:A정보}}
```

**matchMessage (중계)**
```
A → {event:'matchMessage', data:{matchId, payload:<any>}}
  handleMatchMessage: getUserId(ws)=A → getMatchIdOf(A)===matchId ?
     yes → opponentOf(matchId,A)=B → sendTo(B, 'matchMessage', {matchId, from:A, payload})
     no  → A ← {event:'error', data:'유효하지 않은 매치입니다'}
```

**leaveMatch / disconnect (종료)**
```
A → {event:'leaveMatch'} 또는 ws 'close'
  matchId = getMatchIdOf(A); opp = opponentOf(matchId,A)
  matchService.endMatch(matchId)          // A,B 역인덱스 삭제 + matches 삭제
  matchmaking.dequeue(A)                  // 큐에 있었다면 제거
  opp ← {event:'opponentLeft', data:{matchId}}
  (leaveMatch 인 경우) A ← {event:'matchEnded', data:{matchId, reason:'left'}}
  (disconnect 인 경우) connectionRegistry.unbind(ws)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| `matchHandlers` | `connectionRegistry`, `matchmakingService`, `matchService`, `UserRepository` | 이벤트 처리 오케스트레이션 |
| `socketServer` | `eventHandlers`, `matchHandlers.handleDisconnect` | 메시지 라우팅, 종료 정리 |
| `eventHandlers` | `matchHandlers`, `authHandlers`, ... | switch 라우팅 |
| `authHandlers` | `connectionRegistry` (신규), `AuthService` | 로그인 성공 시 bind |
| `connectionRegistry` | `ws` | — |
| `matchmakingService` | — (순수) | FIFO 큐 |
| `matchService` | `node:crypto` (randomUUID) | 매치 레지스트리 |

**순환 의존성 없음**: services 는 sockets 를 import 하지 않음. `matchHandlers` 는 `eventHandlers` 를 import 하지 않음.

---

## 3. Data Model

### 3.1 In-memory Structures

```typescript
// matchService.ts
interface Match {
  id: string;                       // crypto.randomUUID()
  players: readonly [string, string]; // [userId, userId] 생성 순서 = [a, b]
  createdAt: number;                // Date.now()
}

// matchmakingService.ts
type QueueEntry = string;           // userId (FIFO 배열)

type EnqueueResult =
  | { status: 'queued' }
  | { status: 'matched'; opponentId: string }
  | { status: 'rejected'; reason: string };
```

### 3.2 Registries (모듈 스코프)

| 모듈 | 자료구조 | 용도 | 정리 시점 |
|---|---|---|---|
| `connectionRegistry` | `Map<string, WebSocket>` (byUser) | userId → 소켓 (`sendTo`) | `unbind` (ws close) / 같은 userId 재접속 시 교체 |
| `connectionRegistry` | `Map<WebSocket, string>` (bySocket) | 소켓 → userId (`getUserId`) | `unbind` |
| `matchmakingService` | `string[]` (queue) | FIFO 대기열 | `dequeue` / 페어링 시 shift / disconnect |
| `matchService` | `Map<string, Match>` (matches) | matchId → 매치 | `endMatch` |
| `matchService` | `Map<string, string>` (byPlayer) | userId → matchId | `endMatch` (두 플레이어 모두 삭제) |

### 3.3 DB

**신규 컬렉션 없음.** 기존 `users` 컬렉션의 `id`, `username`, `level`, `selectedUnits` 만 읽는다 (`UserRepository.findById`). 전적 저장은 Out of Scope.

---

## 4. WebSocket 이벤트 계약

메시지 봉투(기존과 동일): `{ "event": string, "data": any }`. 라우팅: [`src/sockets/eventHandlers.ts`](../../../src/sockets/eventHandlers.ts).

### 4.1 이벤트 목록

**클라 → 서버**

| event | data | 전제 |
|---|---|---|
| `enqueue` | `null` / 생략 | `login` 완료된 연결 |
| `dequeue` | `null` / 생략 | — |
| `matchMessage` | `{ matchId: string, payload: any }` | 요청자가 그 매치 참가자 |
| `leaveMatch` | `null` / 생략 | — |

**서버 → 클라**

| event | data | 발생 조건 |
|---|---|---|
| `queued` | `null` | enqueue 후 대기자 없음 |
| `queueLeft` | `null` | dequeue 성공 |
| `matchFound` | `{ matchId, you: PlayerView, opponent: PlayerView }` | 페어링 성립 (양쪽에 발송) |
| `matchMessage` | `{ matchId, from: string, payload: any }` | 상대가 `matchMessage` 전송 |
| `opponentLeft` | `{ matchId }` | 상대가 leaveMatch 또는 연결 종료 |
| `matchEnded` | `{ matchId, reason: 'left' }` | 본인이 leaveMatch |
| `error` | `string` | 아래 §6 |

```typescript
interface PlayerView {
  userId: string;
  username: string;
  level: number;
  deck: string[];   // users.selectedUnits
}
```

### 4.2 상세

#### `enqueue`
- **전제 검사**: `getUserId(ws)` 없음 → `error: '로그인이 필요합니다'`
- **중복 검사**: `matchService.getMatchIdOf(userId)` 존재 → `error: '이미 매치 중입니다'`
- `matchmakingService.enqueue(userId)`:
  - 이미 큐에 있음 → `{status:'rejected', reason:'이미 매칭 대기 중입니다'}` → `error`
  - 큐 비어있음 → 큐에 push → `{status:'queued'}` → `queued`
  - 큐에 타인 있음 → `queue.shift()` → `{status:'matched', opponentId}`
- **matched 처리**:
  1. `match = matchService.createMatch(userId, opponentId)`
  2. `[me, opp] = await Promise.all([UserRepository.findById(userId), UserRepository.findById(opponentId)])`
  3. 둘 중 하나라도 `null` → `matchService.endMatch(match.id)`; 양쪽에 `error: '상대 정보를 불러오지 못했습니다'`; return
  4. `viewOf(u) = { userId: u.id, username: u.username, level: u.level, deck: u.selectedUnits }`
  5. `ws.send(matchFound, { matchId, you: viewOf(me), opponent: viewOf(opp) })`
  6. `sendTo(opponentId, 'matchFound', { matchId, you: viewOf(opp), opponent: viewOf(me) })`
     - `sendTo` 가 `false`(상대 연결 끊김) → `matchService.endMatch(match.id)`; `ws.send('error', '상대 연결이 끊겼습니다')`

#### `dequeue`
- `getUserId(ws)` 없음 → 무시(return)
- `matchmakingService.dequeue(userId)` (큐에 없으면 no-op) → `queueLeft`

#### `matchMessage`
- `getUserId(ws)` 없음 → 무시
- `data` 가 객체 아님 / `data.matchId` 문자열 아님 → `error: '잘못된 요청입니다'`
- `myMatchId = matchService.getMatchIdOf(userId)`; `!myMatchId || myMatchId !== data.matchId` → `error: '유효하지 않은 매치입니다'`
- `opp = matchService.opponentOf(myMatchId, userId)`; `opp` 있으면 `sendTo(opp, 'matchMessage', { matchId: myMatchId, from: userId, payload: data.payload })`
- 서버는 `data.payload` 를 **파싱/검증하지 않는다** (그대로 전달)

#### `leaveMatch`
- `getUserId(ws)` 없음 → 무시
- `matchId = matchService.getMatchIdOf(userId)`; 없음 → 무시(return)
- `opp = opponentOf(matchId, userId)`; `matchService.endMatch(matchId)`; `matchmakingService.dequeue(userId)`
- `opp` 있으면 `sendTo(opp, 'opponentLeft', { matchId })`
- `ws.send('matchEnded', { matchId, reason: 'left' })`

#### `handleDisconnect(ws)` (이벤트 아님 — `socketServer` 의 `ws.on('close')` 에서 호출)
- `userId = connectionRegistry.unbind(ws)`; 없음 → return
- `matchmakingService.dequeue(userId)`
- `matchId = matchService.getMatchIdOf(userId)`; 있으면: `opp = opponentOf`; `endMatch(matchId)`; `opp` 있으면 `sendTo(opp, 'opponentLeft', { matchId })`

---

## 5. UI/UX

해당 없음 (백엔드 전용). 클라이언트 통합 가이드는 §4 이벤트 계약 참조.

---

## 6. Error Handling

기존 패턴 유지: `ws.send(JSON.stringify({ event: 'error', data: <문자열> }))`.

| 상황 | data 메시지 | 처리 |
|---|---|---|
| 미로그인 연결이 `enqueue`/`matchMessage` | `로그인이 필요합니다` / (matchMessage 는 무시) | 클라: 로그인 재시도 |
| 이미 매치 중인데 `enqueue` | `이미 매치 중입니다` | 클라: 무시 |
| 이미 큐에 있는데 `enqueue` | `이미 매칭 대기 중입니다` | 클라: 무시 |
| `matchMessage` 의 `matchId` 불일치/부재 | `유효하지 않은 매치입니다` | 클라: 매치 상태 리셋 |
| `matchMessage` data 형식 오류 | `잘못된 요청입니다` | 클라: 버그 |
| 페어링 중 상대 프로필 조회 실패 | `상대 정보를 불러오지 못했습니다` | 매치 취소, 양쪽 큐 밖 |
| 페어링 직후 상대 연결 끊김 | `상대 연결이 끊겼습니다` | 매치 취소, 요청자 재큐 안 함 |
| JSON 파싱 실패 (기존) | `잘못된 메시지 형식입니다` | 기존 `eventHandlers` catch |

에러는 연결을 끊지 않는다 (매치 관련 오류는 복구 가능).

---

## 7. Security Considerations

- [x] **인증 게이트**: `enqueue`, `matchMessage`, `leaveMatch` 는 `getUserId(ws)` 필수. `connectionRegistry` 바인딩은 `login` 성공 시에만.
- [x] **매치 소유권 검사**: `matchMessage` 는 서버가 `getMatchIdOf(userId) === data.matchId` 확인 후에만 중계. 남의 `matchId` 로 전송 불가.
- [x] **제3자 격리**: 중계는 `opponentOf` 로 특정된 1명에게만 `sendTo`. 브로드캐스트 아님.
- [x] **payload 불신뢰**: 서버는 `matchMessage.payload` 를 저장/해석하지 않음 → 인젝션 표면 없음. 단 클라이언트는 상대 payload 를 신뢰하면 안 됨(치팅) — 이후 서버 권위화로 대응.
- [ ] **Rate limiting**: 이번 스코프 밖. `matchMessage` 폭주 대비는 이후.
- [x] **동일 유저 다중 연결**: `bind` 가 이전 소켓을 `close(4000)` 로 정리 → 유령 연결 방지.

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool |
|------|--------|------|
| 통합 스모크 | 이벤트 계약 전체 (2~3 ws 클라이언트) | `scripts/socket-test.ts` (기존 미니 러너 확장) |
| 타입 체크 | 전체 | `npx tsc --noEmit` |

단위 테스트 프레임워크는 미도입 상태 → 스모크 테스트로 커버.

### 8.2 Test Cases (Key) — `scripts/socket-test.ts` 에 추가

- [ ] **auth gate**: 로그인 안 한 새 연결 → `enqueue` → `error: '로그인이 필요합니다'`
- [ ] **queued**: c1 로그인 → `enqueue` → `queued`
- [ ] **matchFound**: c2 로그인 → `enqueue` → c1·c2 모두 `matchFound`, 각자 `you.userId` 가 자신, `opponent.userId` 가 상대, `you.deck` 배열 길이 5
- [ ] **중복 enqueue**: 매치 중 c1 `enqueue` → `error: '이미 매치 중입니다'`
- [ ] **relay**: c1 `matchMessage {matchId, payload:{move:'a'}}` → c2 가 `matchMessage {matchId, from:c1, payload:{move:'a'}}` 수신
- [ ] **본인 미수신**: 위 relay 후 c1 은 `matchMessage` 를 받지 않음 (short timeout)
- [ ] **제3자 격리**: c3 로그인(매치 아님) → c1 relay 시 c3 는 `matchMessage` 미수신
- [ ] **matchId 위조**: c1 `matchMessage {matchId:'bogus', ...}` → `error: '유효하지 않은 매치입니다'`
- [ ] **leaveMatch**: c1 `leaveMatch` → c1 `matchEnded {reason:'left'}`, c2 `opponentLeft {matchId}`
- [ ] **종료 후 상태**: leaveMatch 후 c1 `matchMessage` → `error` (매치 없음)
- [ ] **disconnect 전파**: c1·c2 재로그인→매칭, c2 `ws.close()` → c1 `opponentLeft` 수신
- [ ] **dequeue**: c1 `enqueue`→`queued`, `dequeue`→`queueLeft`, 이후 c2 `enqueue`→`queued`(매칭 안 됨)

### 8.3 회귀

기존 스모크 케이스(signup/login/joinLobby/updateDeck/sendMessage/leaveLobby/잘못된 JSON) 전부 유지 통과. `login` 케이스는 이제 연결 바인딩까지 일어나므로, 매칭 케이스보다 먼저 실행되어야 함.

---

## 9. Clean Architecture

### 9.1 Layer 배치 (이 프로젝트 관례: sockets = 트랜스포트, services = 애플리케이션, repositories = 인프라)

| Component | Layer | Location | Import 가능 |
|-----------|-------|----------|------------|
| `connectionRegistry` | Transport 인프라 | `src/sockets/connectionRegistry.ts` | `ws` 만 |
| `matchHandlers` | Transport (오케스트레이션) | `src/sockets/matchHandlers.ts` | registry, services, repositories |
| `matchmakingService` | Application (순수 상태) | `src/services/matchmakingService.ts` | 없음 |
| `matchService` | Application (순수 상태) | `src/services/matchService.ts` | `node:crypto` |
| `Match` 타입 | Domain | `src/services/matchService.ts` 내 export (별도 파일 불필요) | — |

### 9.2 Dependency Rule

```
eventHandlers ─▶ matchHandlers ─▶ matchmakingService  (순수)
socketServer  ─▶ matchHandlers ─▶ matchService        (순수 + crypto)
authHandlers  ─▶ connectionRegistry ─▶ ws
matchHandlers ─▶ connectionRegistry
matchHandlers ─▶ UserRepository ─▶ getDb (기존)

금지: services/* 가 sockets/* 를 import  |  matchHandlers 가 eventHandlers 를 import
```

---

## 10. Coding Convention Reference

### 10.1 이 기능에 적용할 관례 (기존 코드에서 관찰됨)

| Item | 적용 |
|------|------|
| 핸들러 함수명 | `handleX` (예: `handleEnqueue`), `export async function` 또는 `export function` |
| 서비스 | 순수 함수 `export`. 인메모리 상태는 모듈 스코프 `const map = new Map()` |
| ws 응답 | `ws.send(JSON.stringify({ event, data }))` — 기존 핸들러와 동일 |
| 에러 | `try/catch` 후 `{ event: 'error', data: (error as Error).message }` 또는 고정 문자열 |
| 타입 import | `import WebSocket from 'ws'`, `import { X } from '...'` |
| 주석 | 한국어, 필요한 곳만 |
| 파일명 | camelCase.ts (`matchHandlers.ts`, `connectionRegistry.ts`) |

### 10.2 신규 도입 패턴

- **모듈 스코프 인메모리 레지스트리**: 클래스 대신 모듈 + 순수 함수 export (테스트에서 상태 리셋이 필요하면 `__resetForTest()` 를 조건부 export — 스모크 테스트는 별도 프로세스라 불필요).

### 10.3 환경 변수

없음.

---

## 11. Implementation Guide

### 11.1 File Structure (변경/신규)

```
src/
├── sockets/
│   ├── connectionRegistry.ts   (신규)
│   ├── matchHandlers.ts        (신규)
│   ├── eventHandlers.ts        (수정: case 4개 추가)
│   ├── authHandlers.ts         (수정: handleLogin 에서 bind)
│   └── socketServer.ts         (수정: on('close') → handleDisconnect)
├── services/
│   ├── matchmakingService.ts   (신규)
│   └── matchService.ts         (신규)
scripts/
└── socket-test.ts              (수정: §8.2 케이스 추가)
docs/03-analysis/               (Check 단계 산출물 위치)
```

### 11.2 Implementation Order

1. [ ] `src/sockets/connectionRegistry.ts` — `bind` / `unbind` / `getUserId` / `getSocket` / `sendTo`
2. [ ] `src/services/matchmakingService.ts` — `enqueue` / `dequeue` / `isQueued` / `queueSize`
3. [ ] `src/services/matchService.ts` — `createMatch` / `getMatch` / `getMatchIdOf` / `opponentOf` / `endMatch` / `activeCount`
4. [ ] `src/sockets/matchHandlers.ts` — `handleEnqueue` / `handleDequeue` / `handleMatchMessage` / `handleLeaveMatch` / `handleDisconnect`
5. [ ] `src/sockets/authHandlers.ts` — `handleLogin` 성공 직전에 `bind(userProfile.id, ws)`
6. [ ] `src/sockets/socketServer.ts` — `ws.on('close', () => { handleDisconnect(ws); console.log('사용자가 연결을 끊었습니다'); })`
7. [ ] `src/sockets/eventHandlers.ts` — `case 'enqueue' | 'dequeue' | 'matchMessage' | 'leaveMatch'`
8. [ ] `npx tsc --noEmit` 통과 확인
9. [ ] `scripts/socket-test.ts` — §8.2 매칭 시나리오 추가, 로컬 서버 대상 전체 통과
10. [ ] `feature/matchmaking` 브랜치 커밋 → PR

### 11.3 함수 시그니처 (요약)

```typescript
// connectionRegistry.ts
export function bind(userId: string, ws: WebSocket): void;
export function unbind(ws: WebSocket): string | undefined;   // 해제된 userId 반환
export function getUserId(ws: WebSocket): string | undefined;
export function getSocket(userId: string): WebSocket | undefined;
export function sendTo(userId: string, event: string, data: unknown): boolean;

// matchmakingService.ts
export function enqueue(userId: string): EnqueueResult;
export function dequeue(userId: string): void;
export function isQueued(userId: string): boolean;
export function queueSize(): number;

// matchService.ts
export interface Match { id: string; players: readonly [string, string]; createdAt: number; }
export function createMatch(a: string, b: string): Match;
export function getMatch(matchId: string): Match | undefined;
export function getMatchIdOf(userId: string): string | undefined;
export function opponentOf(matchId: string, userId: string): string | undefined;
export function endMatch(matchId: string): Match | undefined;
export function activeCount(): number;

// matchHandlers.ts
export async function handleEnqueue(ws: WebSocket): Promise<void>;
export function handleDequeue(ws: WebSocket): void;
export function handleMatchMessage(ws: WebSocket, data: unknown): void;
export function handleLeaveMatch(ws: WebSocket): void;
export function handleDisconnect(ws: WebSocket): void;
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-08-31 | 초안. Plan 0.1 기반 모듈 설계·이벤트 계약·테스트 케이스 확정 | ny030303 |
