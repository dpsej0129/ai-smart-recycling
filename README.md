# AI 스마트 분리수거함

Teachable Machine 이미지 모델과 micro:bit를 연결하는 정적 웹앱입니다. 참고 사이트의 화면과 기능을 바탕으로 재구현했습니다.

참고: https://eloquent-chebakia-ade395.netlify.app/

## 사용 방법

1. Chrome 또는 Edge에서 GitHub Pages 사이트를 엽니다.
2. Teachable Machine 이미지 프로젝트를 학습한 뒤 모델을 업로드하고, 공유 주소를 입력합니다.
3. **AI 모델 불러오기**를 누릅니다.
4. 사진을 업로드하거나 **실시간 카메라 → 카메라 시작**을 선택합니다.
5. 필요하면 micro:bit를 USB 데이터 케이블로 연결하고 **USB 시리얼 연결**에서 포트를 선택합니다.
6. 클래스 시험 버튼으로 보드 수신을 확인하고 AI 분류·자동 전송을 사용합니다.

모델 주소는 `https://teachablemachine.withgoogle.com/models/모델ID/` 형식입니다. 이미지 모델만 지원합니다. TensorFlow.js와 Teachable Machine 라이브러리 및 공유 모델 로드에는 인터넷 연결이 필요합니다. 분류는 브라우저에서 수행합니다.

## micro:bit 통신

- Web Serial / USB / 115200bps.
- 클래스 이름을 UTF-8로 전송하고, 끝에 줄바꿈 LF(`\n`)를 붙입니다.
- 초기화 명령은 `RESET\n`입니다. 모델 클래스 이름에 RESET을 사용하면 초기화와 충돌할 수 있습니다.
- 기본 인식 기준 80%, 40~100% 범위 조절.
- 이미지: 분석 버튼을 눌렀을 때 기준을 통과하면 전송합니다.
- 카메라: 같은 클래스가 3회 연속 기준을 통과하고 마지막 전송 후 1200ms 이상 지났을 때 전송합니다. 동일 결과의 반복 전송을 억제합니다.

`microbit-makecode.ts`는 선택 사항인 LED·ACK 수신 예제입니다. MakeCode의 JavaScript 탭에 붙여 넣고 a/b/c를 실제 클래스 이름으로 바꾼 뒤 업로드하세요. 서보나 모터 동작은 연결한 장치에 맞는 보드 프로그램을 준비해야 합니다. MakeCode와 다른 시리얼 모니터의 연결은 웹앱 연결 전에 종료하세요.

## GitHub Pages

이 저장소의 `main` 브랜치 루트(`/`)를 GitHub Pages 게시 원본으로 사용합니다. 별도 빌드나 서버 API는 필요하지 않습니다. `.nojekyll` 파일을 포함했습니다.

## 로컬 실행

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Chrome/Edge에서 http://localhost:8080 을 엽니다. 파일을 더블클릭해 여는 대신 HTTP 서버 또는 HTTPS 배포 주소를 사용하세요.

## 검증 범위

예제 이미지 모델 로드와 이미지 추론을 브라우저에서 확인했습니다. 인식 기준, UTF-8+LF 전송, 자동 전송·중복 억제·연결 해제 등 11개 동작 검사는 가상 모델·시리얼 장치로 확인했습니다. 실제 카메라 영상과 micro:bit의 물리적 수신·동작은 사용자의 장치에서 확인해야 합니다.
