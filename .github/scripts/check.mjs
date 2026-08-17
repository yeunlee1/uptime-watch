// 정해 둔 주소 몇 곳을 눌러 살아 있는지 확인합니다. 하나라도 이상하면 실패로 끝냅니다.

const RETRY = 3; // 일시적인 네트워크 흔들림으로 헛알람이 가지 않도록 세 번까지 눌러 봅니다.
const RETRY_WAIT_MS = 5000;
const TIMEOUT_MS = 15000;

const targets = (process.env.WATCH_TARGETS ?? '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => {
    const [name, url, keyword] = line.split('|').map((part) => part?.trim() ?? '');
    return { name, url, keyword };
  })
  .filter((target) => target.name && target.url);

if (targets.length === 0) {
  console.error('감시할 대상이 없습니다. WATCH_TARGETS 시크릿을 확인해 주세요.');
  process.exit(1);
}

/**
 * 주소를 한 번 눌러 봅니다. 정상이면 null, 이상하면 사람이 읽을 수 있는 사유를 돌려줍니다.
 * 주소 자체는 로그에 남기지 않습니다. 시크릿이라 가려져서 오히려 읽기 어려워집니다.
 */
async function probe({ url, keyword }) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'uptime-watch', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return error.name === 'TimeoutError' ? '응답이 없습니다 (15초 초과)' : '연결하지 못했습니다';
  }

  if (!response.ok) return `HTTP ${response.status}`;
  if (!keyword) return null;

  const body = await response.text();
  return body.includes(keyword) ? null : '응답은 왔지만 내용이 예상과 다릅니다';
}

const failures = [];

for (const target of targets) {
  let reason = null;

  for (let attempt = 1; attempt <= RETRY; attempt += 1) {
    reason = await probe(target);
    if (!reason) break;
    if (attempt < RETRY) {
      console.log(`재시도 ${target.name} — ${reason} (${attempt}/${RETRY})`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    }
  }

  if (reason) failures.push(`${target.name} — ${reason}`);
  else console.log(`정상  ${target.name}`);
}

if (failures.length > 0) {
  console.error('');
  console.error('=== 이상을 찾았습니다 ===');
  failures.forEach((message) => console.error(message));
  console.error('');
  console.error('대상 화면을 직접 열어 상태를 확인해 주세요.');
  process.exit(1);
}

console.log('');
console.log(`모두 정상입니다. (${targets.length}곳 확인)`);
