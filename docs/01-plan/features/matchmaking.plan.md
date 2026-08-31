# matchmaking Planning Document

> **Summary**: 로그인한 두 플레이어를 1:1 실시간 매치로 연결하고, 매치 동안 두 클라이언트 사이의 메시지를 중계한다.
>
> **Project**: zoocat_game_server
> **Version**: 1.0.0
> **Author**: ny030303
> **Date**: 2026-08-31
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

현재 서버는 인증(`signup`/`login`), 로비 진입(`joinLobby`), 덱 관리(`updateDeck`), 전체 브로드캐스트 채팅(`sendMessage`)만 제공한다. 두 플레이어를 짝지어 대결을 시작할 방법이 없다. 이 기능은 매칭 큐 → 페어링 → 매치 룸 메시지 중계까지의 최소 경로를 추가한다.

### 1.2 Background

- 게임의 핵심 루프는 1:1 대결이지만, 대결에 진입할 진입점이 없다.
- 전투 규칙(턴 해석, 유닛 전투 계산)은 아직 코드에 없다. 따라서 이번 단계에서 서버는 **심판이 아니라 중계자**로 동작한다. 전투 판정은 클라이언트가 담당하고, 서버는 매칭과 메시지 릴레이만 책임진다. 치팅 방어가 필요해지면 이후 단계에서 서버 권위(authoritative) 모델로 강화한다.
- 매칭은 실시간 게임 기능의 첫 사례이므로, 여기서 도입하는 "연결 ↔ 유저 신원" 레지스트리와 "특정 유저에게 전송" 헬퍼는 이후 친구 초대·관전·랭킹 등 모든 실시간 기능의 공통 기반이 된다.

### 1.3 Related Documents

- Design: `docs/02-design/features/matchmaking.design.md` (예정)
- 기존 이벤트 라우터: `src/sockets/eventHandlers.ts`
- 인증 흐름: `src/sockets/authHandlers.ts` → `src/services/authService.ts`

---

## 2. Scope

### 2.1 In Scope

- [ ] 연결 ↔ 유저 신원 레지스트리 (`login` 시 바인딩, 연결 종료 시 해제)
- [ ] 특정 유저에게 전송하는 헬퍼 (`sendTo(userId, event, data)`)
- [ ] 인메모리 FIFO 매칭 큐: `enqueue` / `dequeue`
- [ ] 2명이 모이면 페어링 → 양쪽 프로필·덱 조회 → 각자에게 `matchFound` 발송
- [ ] 인메모리 매치 레지스트리: `matchId` ↔ 두 플레이어
- [ ] 매치 중 메시지 중계: `matchMessage` → 매치 상대에게만 전달 (서버는 내용 미해석)
- [ ] 매치 이탈: `leaveMatch` → 상대에게 `opponentLeft`, 매치 종료
- [ ] 연결 종료 시 정리: 큐에서 제거, 진행 중 매치면 상대에게 통지 후 종료
- [ ] `scripts/socket-test.ts` 에 매칭 시나리오 스모크 테스트 추가

### 2.2 Out of Scope

- 서버 권위(authoritative) 전투 로직 — 이번엔 중계만
- 매치 결과/전적 저장 (`matches` 컬렉션, `wins`/`losses` 필드)
- 레벨·MMR 기반 매칭 (지금은 선착순 FIFO)
- 매치 재접속 복구 (연결 끊기면 매치 종료)
- 큐 대기 타임아웃, 봇 대체
- NvN·방 기반 매칭
- 여러 서버 인스턴스 간 큐 공유 (단일 인스턴스 전제)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `login` 성공 시 해당 연결을 `userId` 에 바인딩한다 | High | Pending |
| FR-02 | 같은 `userId` 로 새 연결이 오면 이전 연결을 닫고 교체한다 | Medium | Pending |
| FR-03 | `enqueue`: 로그인된 연결만 허용. 이미 큐/매치 중이면 거절 | High | Pending |
| FR-04 | 큐에 대기자가 있으면 즉시 페어링하고 두 연결 모두에 `matchFound` 를 보낸다 | High | Pending |
| FR-05 | `matchFound` payload 에 `matchId`, 본인/상대의 `userId`·`username`·`level`·`deck(selectedUnits)` 포함 | High | Pending |
| FR-06 | 큐에 대기자가 없으면 `queued` 응답 후 대기 | High | Pending |
| FR-07 | `dequeue`: 큐에서 제거하고 `queueLeft` 응답 | Medium | Pending |
| FR-08 | `matchMessage {matchId, payload}`: 요청자가 그 매치의 참가자일 때만, 상대에게 `matchMessage {matchId, from, payload}` 전달 | High | Pending |
| FR-09 | `leaveMatch`: 매치 종료, 상대에게 `opponentLeft`, 본인에게 `matchEnded` | High | Pending |
| FR-10 | 연결 종료(`ws close`) 시 큐에서 제거하고, 진행 중 매치면 상대에게 `opponentLeft` 후 매치 종료 | High | Pending |
| FR-11 | 알 수 없는/유효하지 않은 매치 대상 요청은 `error` 이벤트로 응답 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Latency | 페어링~`matchFound` 발송 < 100ms (같은 리전 Atlas 조회 1회 포함) | 스모크 테스트 타이밍 로그 |
| Memory | 큐·매치 레지스트리는 O(동시 접속). 매치/연결 종료 시 누수 없이 해제 | 코드 리뷰 + 종료 후 레지스트리 크기 확인 |
| Isolation | 매치 메시지는 그 매치의 2명에게만. 제3자에게 새지 않음 | 스모크 테스트: 3번째 클라가 `matchMessage` 미수신 확인 |
| Auth gate | `enqueue`/`matchMessage` 는 `login` 없이는 거부 | 스모크 테스트: 미로그인 연결 `error` 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-11 구현
- [ ] `scripts/socket-test.ts` 매칭 시나리오 추가, 전체 통과
- [ ] `npx tsc --noEmit` 통과
- [ ] `feature/matchmaking` 브랜치 → PR → 리뷰 후 `master` 머지 (머지 시 자동 배포)

### 4.2 Quality Criteria

- [ ] 빌드 성공 (`npm run build`)
- [ ] 신규 모듈은 기존 컨벤션 준수 (핸들러 = 트랜스포트, 서비스 = 로직, `ws` 미직접참조 최소화)
- [ ] 순환 의존성 없음 (`socketServer` → services, services ↛ `socketServer`)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 연결 종료가 큐/매치 정리를 누락 → 유령 큐 엔트리·유령 매치 | Medium | Medium | `ws.on('close')` 에서 단일 `handleDisconnect(ws)` 호출, 스모크 테스트로 종료 후 상태 검증 |
| 중계 메시지 위조 (남의 `matchId` 로 전송) | Medium | Medium | 서버가 `getMatchIdOf(userId)` 와 요청 `matchId` 일치 검사 후에만 전달 |
| 동시 `enqueue` 레이스 (두 요청이 서로를 못 봄) | Low | Low | Node 단일 스레드 + 큐 연산 동기 처리로 사실상 원자적. 단일 인스턴스 전제 명시 |
| 다중 서버 인스턴스로 확장 시 인메모리 큐 무효 | High | Low (당분간 1대) | Out of Scope 로 명시. 확장 시 Redis 큐/pub-sub 로 이전 (별도 계획) |
| `matchMessage` 폭주로 상대 클라 과부하 | Low | Low | 이번 단계 미대응. 필요 시 이후 rate-limit 추가 |

---

## 6. Architecture Considerations

### 6.1 Project Level

| Level | Selected |
|-------|:--------:|
| Starter | ☐ |
| **Dynamic** | ☑ |
| Enterprise | ☐ |

기존 구조(핸들러/서비스/리포지토리 레이어, `ws` 기반)를 그대로 확장한다. 새 레이어 도입 없음.

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 매치 형태 | 1v1 실시간 / 1v1 턴제 / NvN | **1v1 실시간** | 게임 핵심 루프, 구현 최소 |
| 매치 중 서버 역할 | 메시지 중계 / 서버 권위 | **메시지 중계** | 전투 규칙이 아직 없음. 빠르게 구축, 이후 권위화 여지 |
| 매칭 기준 | FIFO / 레벨·MMR | **FIFO** | 유저 풀 작음. MMR 은 이후 |
| 큐·매치 상태 저장소 | 인메모리 / DB / Redis | **인메모리 (Map)** | 휘발성 상태, DB 왕복 불필요, 단일 인스턴스 |
| 전적 저장 | 저장 / 미저장 | **미저장** | 이번 스코프 밖 |
| 매치 ID | `crypto.randomUUID()` | randomUUID | 표준, 의존성 없음 |

### 6.3 모듈 구조

```
src/
  sockets/
    connectionRegistry.ts   (신규)  Map<userId, ws> 양방향 + sendTo() 헬퍼
    matchHandlers.ts        (신규)  enqueue / dequeue / matchMessage / leaveMatch 핸들러
    eventHandlers.ts        (수정)  신규 이벤트 라우팅
    authHandlers.ts         (수정)  handleLogin 성공 시 bind()
    socketServer.ts         (수정)  ws close 시 handleDisconnect()
  services/
    matchmakingService.ts   (신규)  인메모리 FIFO 큐, enqueue/dequeue
    matchService.ts         (신규)  Map<matchId, {players, createdAt}> + byPlayer 역인덱스
scripts/
  socket-test.ts            (수정)  매칭 스모크 시나리오 추가
```

### 6.4 이벤트 계약

**클라 → 서버**

| event | data |
|---|---|
| `enqueue` | — (로그인된 연결 기준) |
| `dequeue` | — |
| `matchMessage` | `{ matchId, payload }` |
| `leaveMatch` | `{ matchId }` |

**서버 → 클라**

| event | data |
|---|---|
| `queued` / `queueLeft` | `null` |
| `matchFound` | `{ matchId, you: {userId, username, level, deck}, opponent: {userId, username, level, deck} }` |
| `matchMessage` | `{ matchId, from, payload }` |
| `opponentLeft` | `{ matchId }` |
| `matchEnded` | `{ matchId, reason }` |
| `error` | 문자열 사유 |

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `tsconfig.json` (strict)
- [ ] `CLAUDE.md` 코딩 컨벤션 섹션 — 없음
- [ ] ESLint / Prettier — 없음
- [x] 암묵적 컨벤션: `import { Request, Response } from 'express'` 스타일, 한국어 주석, 핸들러=트랜스포트 / 서비스=로직 / 리포지토리=DB

### 7.2 Conventions to Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| Naming | 암묵적 (camelCase, `handleX` 핸들러, `XService` 클래스) | 신규 모듈도 동일 적용 | High |
| 폴더 구조 | `sockets/`, `services/`, `repositories/` | 매칭 모듈을 이 구조에 배치 | High |
| 인메모리 상태 모듈 | 사례 없음 | 모듈 스코프 `Map` + 순수 함수 export 패턴 도입 | Medium |
| Error handling | `ws.send({event:'error', data})` / try-catch | 동일 패턴 재사용 | Medium |

### 7.3 Environment Variables Needed

없음. 매칭은 인메모리라 신규 환경변수 불필요.

### 7.4 Pipeline Integration

해당 없음 (독립 기능 추가, 9-phase 파이프라인 미사용).

---

## 8. Next Steps

1. [ ] `docs/02-design/features/matchmaking.design.md` 작성 (`/pdca design matchmaking`)
2. [ ] `feature/matchmaking` 브랜치 생성
3. [ ] 구현 (`/pdca do matchmaking`)
4. [ ] 스모크 테스트 통과 → 갭 분석 (`/pdca analyze matchmaking`)
5. [ ] PR → `master` 머지 → 자동 배포

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-08-31 | 초안. 스코프: 1v1 실시간 · 중계만 · 전적 미저장 | ny030303 |
