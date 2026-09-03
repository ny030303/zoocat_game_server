// 핸들러용 공용 형식 검증. 실패 시 핸들러가 '잘못된 요청입니다' 로 응답한다.
// 리포지토리의 String() 강제는 2차 방어선일 뿐, 1차 검증은 여기서.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// deviceSecret / 세션 token 공통: 32바이트 base64url = 43자
const B64URL_43_RE = /^[A-Za-z0-9_-]{43}$/;

export function isStr(v: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): v is string {
    return typeof v === 'string' && v.length >= min && v.length <= max;
}

export function isUuid(v: unknown): v is string {
    return typeof v === 'string' && UUID_RE.test(v);
}

export function isSecretFormat(v: unknown): v is string {
    return typeof v === 'string' && B64URL_43_RE.test(v);
}

export function isTokenFormat(v: unknown): v is string {
    return typeof v === 'string' && B64URL_43_RE.test(v);
}

/** 이벤트 payload 를 객체로 안전 캐스트 (아니면 빈 객체). */
export function asObject(v: unknown): Record<string, unknown> {
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
