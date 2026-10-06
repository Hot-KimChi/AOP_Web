# #22 Windows 인증 전환 재작업 명세

## 목표

사용자명·비밀번호 입력 없이 Windows 도메인 계정으로 로그인한다. 기존 Flask API의 인증 필수 동작, 허용 사용자 정책, 사용자별 할 일, 팝업 로그인, 로그아웃을 유지한다. Next.js Edge Middleware에서는 Windows 전용 Node 모듈을 실행할 수 없으므로 Express Custom Server에서 SSPI 인증을 수행한다.

## 범위

- Express Custom Server로 Next.js 개발·운영 서버를 실행하고 Windows SSPI 로그인 경로를 제공한다.
- SSPI가 반환한 도메인 계정만 서버 측 Flask 인증 절차로 전달한다. 브라우저가 제출한 사용자명은 인증 근거로 사용하지 않는다.
- Flask가 서버 간 비밀을 검증한 뒤 기존 서명 JWT와 `AUTH_ALLOWED_USERS` 정책을 적용한다. 허용 계정은 `DOMAIN\user` 형식으로 지정한다.
- SQL Server 접속은 Flask 프로세스 계정의 Windows 통합 인증으로 전환한다. 사용자 SQL 비밀번호는 브라우저·쿠키·서버 메모리에 전달하거나 보관하지 않는다.
- 로그인 화면, Navbar, 홈 인증 상태, 실행 명령, 관련 문서 및 변경 이력을 함께 갱신한다.

## 범위 밖

- DB 스키마 변경
- 무관한 API·화면 변경 및 생성물 정리
- 허용 목록에 없는 Windows 계정의 신규 허용

## 설계 결정 및 신뢰 경계

1. Windows 신원은 Express 서버의 SSPI 결과(`domain`과 `name`)만 신뢰한다.
2. Express에서 Flask로 보내는 로그인 주장은 별도의 서버 간 비밀로 보호한다. 비밀이 없거나 일치하지 않으면 인증을 거부하며, 클라이언트가 Flask에 직접 요청해 신원을 위조할 수 없어야 한다.
3. Flask는 로그인 때와 각 인증 필수 API 요청 때 모두 허용 목록을 확인한다. JWT는 HttpOnly·SameSite=Lax 쿠키로 전달하고 운영 HTTPS에서는 Secure를 설정한다.
4. Windows SSO는 사용자 신원을 증명할 뿐 DB 비밀번호를 제공하지 않는다. 그러므로 SQL 연결은 Flask 프로세스를 실행하는 Windows 계정으로 수행한다. 운영 환경에서는 해당 계정에 필요한 SQL Server 권한을 부여한다.
5. SSPI 또는 필수 설정이 지원되지 않는 경우 명시적으로 실패하며, 기존 암호 로그인이나 신뢰되지 않은 헤더로 우회하지 않는다.
6. Negotiate 협상 결과가 Kerberos인지 서버에서 확인하고, NTLM·누락·알 수 없는 인증 방식은 Flask에 전달하지 않는다. Kerberos 운영에는 AD 도메인, 서비스 계정의 SPN, 브라우저 인트라넷 신뢰 설정이 필요하다. 운영 웹 트래픽과 인증 쿠키는 HTTPS로 보호한다.
7. 로그아웃은 서버 측 세션 식별자(jti)를 폐기한다. 세션 레지스트리는 단일 Flask 프로세스의 메모리 기반이므로 재시작하면 토큰을 무효화하고, 다중 worker·다중 서버 배포 전 공유 저장소가 필요하다.

## 완료 및 검증 기준

- 사용자명·비밀번호를 받지 않고 Windows 인증 흐름으로 로그인하며 팝업 복귀가 동작한다.
- 허용된 계정만 토큰을 받고, 발급 후 허용 목록에서 제거된 계정도 API 요청에서 차단된다.
- 미인증·만료·로그아웃 상태에서 인증 필수 API가 기존처럼 거부된다.
- 일반 DB 조회, ML 및 MeasSet 관련 DB 접근이 모두 Windows 통합 인증을 사용한다.
- 백엔드 타깃 테스트와 구문 검사, 프론트엔드 프로덕션 빌드 및 변경분 무결성 검사를 통과한다.
- 도메인 컨트롤러·SPN 등 환경 의존성 때문에 자동화할 수 없는 실 Windows SSO 검증은 제약으로 명시한다.

## 2026-10-06 재진단 및 보완 명세

### 재현된 문제

- 로그인 팝업의 `GET /auth/sso`가 IP 주소로 접속할 때 `401`과 Kerberos 요구 메시지를 반환했다. IP로는 해당 호스트 SPN을 대상으로 한 Kerberos 인증을 보장할 수 없으며, NTLM 폴백은 의도적으로 거부한다.
- DNS FQDN으로 실행한 Edge 자동화에서도 `GET /auth/sso`가 `400`으로 끝났다. 이 결과는 자동화 브라우저가 유효한 `Negotiate <token>`을 보내지 않았음을 보여주며, 실제 사용자 브라우저의 도메인·인트라넷 정책을 대신 검증하지 않는다.
- 백엔드 `AUTH_ALLOWED_USERS`는 프로세스/사용자/시스템 환경 변수와 `backend/.env.production` 모두에 설정되지 않았다. Kerberos 단계를 통과해도 현재 구성은 모든 계정을 `403`으로 거부한다.
- 운영 CORS 목록에 현재 서버의 DNS FQDN에서 접근하는 프론트엔드 Origin이 없었다. 로그인에 성공하더라도 브라우저가 포트 5000의 API를 호출할 때 CORS가 차단할 수 있다.
- 현재 실행 중인 프론트엔드는 개발 서버가 아니라 `node server.js --production`이었다. 개발 실행 요청과 실행 모드가 일치하지 않았다.

### 보완 범위 및 불변식

1. 클라이언트 접속은 서버 IP/`localhost`가 아니라 DNS FQDN을 사용한다. 그 FQDN의 `HTTP/<FQDN>` SPN은 서버가 실제 실행되는 Windows 서비스 계정에 등록되어야 한다.
2. Express는 계속 Kerberos만 허용한다. NTLM, 브라우저 임의 헤더, 사용자명·비밀번호 로그인으로 우회하지 않는다.
3. CORS는 프로세스 설정과 기존 `.env.production`/`.env` Origin을 보존하면서 현재 서버의 실제 호스트명/FQDN Origin을 명시적으로 병합한다. 모든 항목은 경로·쿼리·사용자 정보가 없는 정확한 HTTP(S) Origin이어야 하며, wildcard·정규식은 시작 단계에서 거부한다.
4. `AUTH_ALLOWED_USERS`는 비어 있으면 계속 fail-closed한다. 테스트 사용자를 특정 도메인 계정 단위로 설정하며, 도메인 전체·와일드카드 허용은 하지 않는다.
5. 개발 실행은 비운영 포트 점유를 사용자에게 알리지 않고 강제로 종료하지 않는다. 개발 모드 확인은 `AOP_ENV=development`, Express Custom Server, Flask API 및 사용자가 명시한 허용 계정을 기준으로 한다.

### 검증 가능한 완료 조건

- 로컬/클라이언트에서 `GET /auth/sso`가 Custom Server에 도달하고, 도메인 브라우저가 제공하는 인증 방식이 Kerberos인지 응답·서버 로그로 구분된다. IP 접속과 NTLM은 명시적 안내와 함께 거부된다.
- 실제 지정 계정은 `AUTH_ALLOWED_USERS`에 있을 때만 로그인하며, 로그아웃·허용 목록 제외는 이후 인증 요청에서 거부된다.
- FQDN으로 접속한 브라우저에서 `http(s)://<FQDN>:3000` Origin의 인증 쿠키 포함 API 호출이 CORS를 통과한다. 다른 Origin은 계속 거부된다.
- 개발 실행 시 화면은 `:3000`, API는 같은 FQDN의 `:5000`을 사용한다. 단위 테스트, Node SSO 테스트, 영향 범위 빌드가 통과한다.
- 기존 설정 Origin은 유지되고 새 FQDN만 추가된다. wildcard·비정상 Origin이 있으면 서버를 시작하지 않고 설정 오류를 명시한다.
- 실제 클라이언트 도메인 브라우저에서 로그인 쿠키 발급과 인증 상태 확인을 검증한다. 테스트 실행 환경에 도메인 브라우저/계정이 없으면 그 항목을 완료로 표시하지 않고 운영자 선행 설정으로 남긴다.

### 외부 운영자가 제공해야 하는 환경값

- 승인된 테스트 Windows 도메인 계정 목록(`AUTH_ALLOWED_USERS`, `DOMAIN\user` 형식)
- DNS FQDN 및 그 호스트 SPN을 소유·수락하는 서버 서비스 계정
- 클라이언트 브라우저의 인트라넷/Windows 통합 인증 허용 정책
- 운영 HTTPS 인증서와 SQL Server에서 Flask 실행 계정에 부여한 최소 권한

### 브라우저 기본 인증 창 문제

- IP 주소(예: `10.82.218.49`)로 `/auth/sso`에 접근하면 SSPI가 `WWW-Authenticate: Negotiate` challenge를 돌려보내 Chrome이 사용자 이름/암호 기본 인증 창을 표시할 수 있다. 이 인증 정보 입력은 IP에 대한 Kerberos SSO가 아니며, 이후 NTLM으로 협상될 수 있다.
- IP literal 요청은 SSPI에 전달하기 전에 명시적 안내와 함께 거부하고 `WWW-Authenticate` 헤더를 보내지 않아 브라우저 기본 자격 증명 창을 띄우지 않는다.
- 정상 Windows SSO는 실제 `HTTP/<DNS FQDN>` SPN이 등록된 호스트명으로만 시도한다. 브라우저가 FQDN에서도 통합 인증을 자동 수행하지 않으면 해당 클라이언트의 Chrome `AuthServerAllowlist`/인트라넷 정책을 운영자가 설정해야 한다. 서버는 사용자가 입력한 비밀번호를 받거나 검증하지 않는다.
