# vco-okpos-agent

localhost:4010/send-to-dll에 데이터가 오면 그대로 OKDC.dll에 request
callback이 생기면 그대로 ERP_URL/okpos/callback으로 request

32bit node 필요
`yarn install`로 의존성 설치
안될경우 `set NODE_OPTIONS=--max-old-space-size=8192`

환경변수는 config.ts에 관리하므로 변경이 필요할 시 해당 파일 수정(erp 주소 / POS 연동 번호호)
build시 해당 파일의 내용이 그대로 들어가 exe 파일에 포함됨

빌드 완료된 후 build폴더의 모든 파일들은 함께 옮겨져야 무설치(portable)로 실행할 수 있음
dll은 win-ia32-unpacked\resources\app.asar.unpacked\dist\src\dll에 숨겨져있음
exe 파일 실행 후 log는 exe 파일 옆에 생성됨됨
exe 파일 실행 전 exe파일 옆에 config.txt를 생성하고 API_KEY를 입력해야함(해당 API_KEY를 x-api-key 헤더에 담아서 erp와 통신함)

- 코드 변경시 주의사항
  okpos-process.ts는 spawn으로 돌아가는 sub process이고 다른 파일의 의존성을 최소한으로 할것(의존성 파일들은 모두 package.json의 asarUnpack에 포함시켜야 함)
