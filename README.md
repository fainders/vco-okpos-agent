# vco-okpos-agent

VCO OKPOS Agent — ERP와 OKPOS POS 시스템을 연동하는 Electron 기반 Windows 에이전트

## 동작 방식

- `ERP_URL`로 5초마다 polling하여 request 여부 확인
- callback 발생 시 `ERP_URL/okpos/callback`으로 request 전달
- OKPOS DLL과 통신하는 child process를 별도 spawn하여 실행

## 설치 및 실행

### 의존성 설치

```bash
yarn install
```

메모리 부족 오류 발생 시:

```bash
set NODE_OPTIONS=--max-old-space-size=8192
```

### 개발 실행 (로컬)

```bash
yarn start
```

실행 전 프로젝트 루트에 `config.txt` 파일을 생성하고 API_KEY를 입력해야 합니다.

## 빌드

### 빌드 스크립트

`scripts/build.js`가 전체 빌드 프로세스를 처리합니다:

1. `BUILD_TYPE`에 맞는 `config.ts` 자동 생성
2. TypeScript 컴파일 (`yarn transpile`)
3. 이전 출력 폴더 삭제
4. `electron-builder` 실행

### 빌드 명령어

| 명령어 | 환경 | 설명 |
|--------|------|------|
| `yarn build:dev` | Dev | Dev 빌드 (인스톨러만 생성) |
| `yarn build:qa` | QA | QA 빌드 (인스톨러만 생성) |
| `yarn build:prd` | Prd | 운영 빌드 (인스톨러만 생성) |
| `yarn publish:dev` | Dev | Dev 빌드 + S3 배포 |
| `yarn publish:prd` | Prd | 운영 빌드 + S3 배포 |

### 빌드 출력

빌드 완료 후 출력 폴더에 NSIS 인스톨러가 생성됩니다:

- Dev: `FAI VCO OKPOS Agent Dev v{version}/`
- QA: `FAI VCO OKPOS Agent QA v{version}/`
- Prd: `FAI VCO OKPOS Agent v{version}/`

### GitHub Actions 빌드 (CI)

위 빌드 명령어는 Windows 전용(`xcopy`, `koffi`/ia32 네이티브, NSIS)이라 기존에는 의존성이 설치된 로컬 Windows 컴퓨터에서만 빌드할 수 있었습니다. 이제 `.github/workflows/build.yml` 워크플로로 누구나 GitHub Actions에서 빌드할 수 있습니다.

- 실행: GitHub 저장소 → **Actions** → **Build OKPOS Agent** → **Run workflow**
- `windows-latest` 러너 + Node 20(Electron 33 내장 런타임과 일치)에서 실행
- 입력값
  - `build_type`: `dev` / `qa` / `prd`
  - `publish`: 체크 시 S3 자동 업데이트 채널까지 배포 (`publish:qa`는 미정의 — `dev`/`prd`만 가능)
- **결과물**: publish 여부와 무관하게 NSIS 인스톨러(`.exe`, `.yml`, `.blockmap`)가 워크플로 실행 페이지의 **Artifacts**로 업로드됨 (기본 90일 보관)

#### 필요한 저장소 시크릿 (publish 사용 시)

`publish`를 켜면 S3 업로드를 위해 아래 시크릿이 필요합니다 (Settings → Secrets and variables → Actions):

| 시크릿 | 설명 |
|--------|------|
| `AWS_ACCESS_KEY_ID` | S3 배포용 IAM 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | S3 배포용 IAM 시크릿 키 |

publish 없이 인스톨러만 받을 경우 시크릿은 필요하지 않습니다.

## 설치 방식 (NSIS)

- oneClick 설치 (사용자 계정, 관리자 권한 불필요)
- 바탕화면 바로가기 자동 생성
- 시작 메뉴 바로가기 자동 생성
- **시작 프로그램 자동 등록** (NSIS가 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`에 등록)
- 설치 완료 후 자동 실행

> 시작 프로그램 등록은 NSIS 인스톨러가 처리합니다. 코드에서 별도 등록하지 않습니다.

## 파일 경로

### 설치 후 데이터 경로

| 파일 | 경로 |
|------|------|
| config.txt (API Key) | `%APPDATA%\VCO OKPOS Agent\config.txt` |
| 로그 파일 | `%APPDATA%\VCO OKPOS Agent\logs\` |

### 개발 환경 경로

| 파일 | 경로 |
|------|------|
| config.txt | 프로젝트 루트 |
| 로그 파일 | 프로젝트 루트 |

## 환경 설정

`config.ts`는 빌드 시 `scripts/build.js`에 의해 자동 생성됩니다. 직접 수정하지 마세요.

| 설정 | 설명 |
|------|------|
| `ERP_URL` | ERP 서버 주소 |
| `EXTERNAL_CODE` | POS 연동 코드 |
| `BUILD_TYPE` | 빌드 환경 (`dev` / `qa` / `prd`) |

## 자동 업데이트

AWS S3를 통한 자동 업데이트를 지원합니다. 패키지 빌드(`app.isPackaged`)에서만 동작합니다.

### S3 버킷 구조

버킷: `vco-okpos-agent` (ap-northeast-2)

```
vco-okpos-agent/
├── dev/     ← dev 채널 (dev.yml, 인스톨러, blockmap)
├── prd/     ← prd 채널 (prd.yml, 인스톨러, blockmap)
└── qa/      ← qa 채널 (qa.yml, 인스톨러, blockmap)
```

| 빌드 | 업데이트 채널 | S3 경로 |
|------|-------------|---------|
| `dev` | `dev` | `vco-okpos-agent/dev/` |
| `qa` | `qa` | `vco-okpos-agent/qa/` |
| `prd` | `prd` | `vco-okpos-agent/prd/` |

- 앱 시작 시 자동으로 업데이트 확인
- 업데이트 가능 시 알림 후 백그라운드 다운로드
- 앱 종료 시 자동 설치 (`autoInstallOnAppQuit: true`)

### S3 접근 설정

버킷은 private이며, 업데이트 경로에만 public read를 허용합니다.
아래 버킷 정책을 AWS 콘솔 → S3 → `vco-okpos-agent` → 권한 → 버킷 정책에 적용해야 합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadUpdateFiles",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::vco-okpos-agent/dev/*",
        "arn:aws:s3:::vco-okpos-agent/prd/*",
        "arn:aws:s3:::vco-okpos-agent/qa/*"
      ]
    }
  ]
}
```

### 배포용 IAM 키 설정

S3 업로드 권한을 가진 IAM 사용자 키를 `.env`에 설정합니다 (`.env.example` 참고):

```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

IAM 사용자에 필요한 최소 권한:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::vco-okpos-agent/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::vco-okpos-agent"
    }
  ]
}
```

## 단일 인스턴스

`app.requestSingleInstanceLock()`으로 중복 실행을 방지합니다. 이미 실행 중인 경우 새 인스턴스는 즉시 종료됩니다.

## DLL 연동 구조

- OKPOS DLL과의 통신은 별도 child process(`dllProcess`)로 처리
- `node.exe`를 함께 패키징 (Electron 내장 Node로는 32bit DLL 통신 불가)
- DLL 위치: `resources\app.asar.unpacked\dist\src\dll\`
- child process에 `APP_DATA_DIR` 환경변수를 전달하여 로그 경로 공유

## 트러블슈팅

### Tray 아이콘이 검은색인 경우

OKPOS DLL ping 실패 또는 응답 없음을 의미합니다.

- `-1001` 코드: OKPOS 측에 상점 등록 여부 확인 필요

### OKPOS 디버깅 로그 위치

```
C:\_OKPOS\CFG\LOG\OKDCAgent_yyyymmdd   # DLL 관련 로그
C:\_OKPOS\CFG\OKPOS.ini                 # [AFFILIATE] 섹션에 로그 파일 경로 확인
```

### 코드 변경 시 주의사항

- `dllProcess` 관련 파일은 다른 파일의 의존성을 최소화
- 의존성 파일은 `package.json`의 `asarUnpack`에 반드시 포함

## 테스트 필요 항목

- `RegistServerCallback` 실패 상황에서 Command 통신 후 재등록 성공 여부
  - 실패 시 agent가 직접 `request connkey`를 수행하도록 변경 필요

## Version Log

| 버전 | 변경 내용 |
|------|----------|
| 1.0.1 | dialog 삭제 — 앱 준비 전 dialog 표시로 인한 crash 수정 |
| 1.1.0 | `requestOkposInit` API 추가 — 초기 1회 통신으로 callback 등록 안정화 |
| 1.2.0 | 플로팅 오버레이 추가 — Agent 실행 상태 시각적 표시 |
| 1.2.1 | 오버레이 투명 영역 마우스 이벤트 차단 수정 (`setIgnoreMouseEvents` 적용) |
| 1.3.0 | NSIS 인스톨러로 변경, 시작 프로그램 자동 등록, S3 자동 업데이트 (dev/qa/prd 채널), config/log 경로를 `%APPDATA%`로 이전, 단일 인스턴스 잠금 |
