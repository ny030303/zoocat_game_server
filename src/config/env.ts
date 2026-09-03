// 환경변수 1회 로드·검증. 다른 모듈은 process.env 직접 접근 대신 이 env 를 참조한다.
const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

function required(name: string): string {
    const v = process.env[name] ?? '';
    if (!v && isProd) {
        console.error(`❌ 필수 환경변수 누락: ${name} — 프로덕션 기동 중단`);
        process.exit(1);
    }
    return v;
}

const DAY_MS = 86_400_000;

export const env = {
    isProd,

    // ── auth-session ───────────────────────────────────────
    /** deviceSecret HMAC pepper (DB 유출 시 방어선). */
    AUTH_PEPPER: required('AUTH_PEPPER'),
    /** 세션 문서 ipHash salt (원본 IP 저장 안 함). */
    SESSION_IP_SALT: required('SESSION_IP_SALT'),
    /** 세션 유휴 만료 (lastSeenAt 기준). */
    SESSION_IDLE_TTL_MS: (Number(process.env.SESSION_IDLE_TTL_DAYS) || 14) * DAY_MS,
    /** 세션 절대 만료 (createdAt 기준, 슬라이딩 무관). */
    SESSION_ABSOLUTE_TTL_MS: (Number(process.env.SESSION_ABSOLUTE_TTL_DAYS) || 30) * DAY_MS,
    /** 계정당 활성 device 상한. */
    MAX_DEVICES_PER_ACCOUNT: Number(process.env.MAX_DEVICES_PER_ACCOUNT) || 5,

    // 인증 이벤트 레이트리밋 (IP 기준). prod 는 타이트, dev/CI 는 env 로 완화.
    RATE_REGISTER_PER_HOUR: Number(process.env.RATE_REGISTER_PER_HOUR) || 10,
    RATE_LOGIN_PER_MIN: Number(process.env.RATE_LOGIN_PER_MIN) || 10,
    RATE_RESUME_PER_MIN: Number(process.env.RATE_RESUME_PER_MIN) || 20,
};
