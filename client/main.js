// Summary
// 본 프로젝트는 플레이어 간 충돌, 먹이 생성/소멸, 점수판, 몸통 길이 증가, 화면 경계 제어 등의 기능을 단계적으로 구현함.
// 기능 간 의존성과 시각적 효과를 고려해, 충돌 감지를 가장 먼저 구현하여 게임의 기본 종료 조건을 마련하고,
// 이후 먹이를 먹을 때마다 개수를 유지하도록 설정해 반복 가능한 게임 흐름을 구성함.
// 점수와 몸통 길이는 먹이 섭취 후에 반영되는 시각적/논리적 효과이므로 그 다음 순서로 구현되었으며,
// 마지막으로 화면 밖으로 벗어나는 플레이를 제한해, 전체 게임 영역이 유지되도록 제어함.
// 1. [기능 1] 충돌 체크 - 멈춤으로 구현
//  - 서버: 충돌 여부 판단을 위한 player 간 위치 비교
//  - 클라이언트: 충돌 발생 시 alert 출력 및 clearInterval()로 게임 멈춤 처리
// 2. [기능 3] 먹이 전체 개수 유지 (먹이 먹으면 새로운 먹이 생성)
//  - 서버: 먹이 제거 및 새 먹이 foods.push() 생성
//  - 클라이언트: 서버에서 전달된 최신 foods 배열을 받아서 렌더링
// 3. [기능 4] 플레이어 본인 점수판(클라이언트)-> 타 플레이어 점수판 추가 (서버 -> 클라이언트)
// 4. [기능 2] 플레이어 본인 몸통 길이 추가(클라이언트) -> 타 플레이어 몸통 길이 추가 (서버 -> 클라이언트)
// 5. [기능 5 / 추가기능] 플레이어가 화면 밖으로 나가지 않도록 위치 제한 (클라이언트)

//main.js
const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let player = null;
let foods = [];
let others = {}; //다른 플레이어
const bodySegments = []; // [기능 4] 플레이어 몸통 좌표를 저장할 배열 추가

const mouse = {x:0, y:0}; //마우스의 위치 정보 가져오기 위함

// * [기능 1] 플레이어 간 충돌을 계산하는 함수 - 첫 번째로 구현함 *
// 수박게임에서는 Events.on('collisionStart')를 활용해 충돌을 자동 감지했던 점에 착안해
// 동일한 방식으로 구현을 시도했으나, 해당 프로젝트는 Matter.js가 아닌 socket 기반 좌표 계산 구조이기 때문에 적용되지 않음.
// GPT를 통해 구조적 차이를 이해하고, 물리 엔진 없이 두 객체 간 유클리드 거리 계산을 통해 충돌을 감지하는 방식으로 대체함.
function checkPlayerCollision(p1, p2) {
    const dx = p1.x - p2.x; // x축 거리 계산
    const dy = p1.y - p2.y; // y축 거리 계산
    const distance = Math.sqrt(dx * dx + dy * dy); // 유클리드 공식. 두 점 사이 거리 
    return distance < 20; //두 객체 중심 간 거리와 반지름(10)의 합을 비교하여 충돌 여부 
}

socket.on('init', (data) => {
    console.log('Received init data:', data);
    player = data.player;
    foods = data.foods;
    requestAnimationFrame(draw);
}); // calculate my mouse location 

canvas.addEventListener('mousemove',(e)=>{
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left; //브라우저의 (0,0) 위치와 검정 배경의 (0,0)위치 통일하기 위해. 조건이 없을 졍우 웹 전체에서 마우스 포인터가 움직임. 두 점사이의 거리로 앵글구함. x,y 좌표를 보내는 것이 아니라, 어느 각도로 움직이고 있는지를 서버한테 보내는 것. -> x,y 두개의 데이터가 아니라 각도 하나만 보내서 서버의 부하를 줄이기 위함. 
    mouse.y = e.clientY - rect.top;
});

socket.on('state',(data)=>{
    // [기능 3] 서버(index.js)의 setInterval 루프 내에서 io.emit('state', { players, foods })를 통해
    // 모든 클라이언트에게 현재 전체 게임 상태(플레이어와 먹이)를 주기적으로 전송함.
    // GPT를 통해 서버와의 연동 방식을 파악한 결과, 클라이언트는 이 이벤트를 통해 서버가 계산한 최신 상태를 수신하게 되며,
    // 여기서 전달받은 data.foods는 서버에서 먹이 충돌 처리 후 push된 최신 먹이 목록을 포함함.
    // 따라서 클라이언트는 해당 데이터를 그대로 foods 변수에 반영함으로써,
    // 이후 draw() 함수에서 서버 기준으로 갱신된 먹이 상태를 정확히 시각화할 수 있게 됨.
    // 즉, 먹이의 생성/삭제 로직은 서버에서 담당하고, 클라이언트는 순수하게 렌더링만 담당하는 구조임을 이해하고 구현함.
    others = data.players;
    foods = data.foods; // [기능 3] 서버에서 최신 먹이 목록 반영 코드 추가
})

//일정 간격으로 서버에게 나의 위치 전송
setInterval(()=> {
    const dx = mouse.x - player.x;
    const dy = mouse.y - player.y;
    const angle = Math.atan2(dy,dx); //arc 탄젠트: 비율을 통해 구한다. 반대로. 높이/밑변 = 탄젠트. -> 세타=각도를 구함 

    socket.emit('move',{angle});
},1000 / 20); // // 20fps로 서버에 각도 전송. 1초에 20번 나의 위치를 계산해서 서버에 데이터를 전송한다는 의미.

function draw(){
    ctx.clearRect(0,0,canvas.clientWidth, canvas.height);

    // [기능 3] 코드 자체에는 수정이 없지만,  GPT에게 먹이 상태를 서버와 실시간으로 연동하는 동작 방식을 질문함.
    // 그 결과, 서버(index.js)에서 플레이어가 먹이를 먹었을 때 해당 먹이를 제거하고 foods 배열에 새 먹이를 push한 뒤,
    // 클라이언트(main.js)의 socket.on('state') 이벤트를 통해 새로운 foods 배열이 전달된다는 구조임을 이해함.
    // 따라서 이 draw() 함수는 매 프레임마다 갱신된 foods 배열을 기반으로 먹이를 다시 그리는 역할을 하며,
    // 먹이의 생성/삭제는 서버에서 처리되며 여기는 단순히 최신 상태를 시각화하는 부분임.
    for(const food of foods){
        ctx.fillStyle='yellow';
        ctx.beginPath();
        ctx.arc(food.x, food.y, 5, 0, Math.PI * 2); 
        ctx.fill();
    }

    //다른 플레이어 그리기
    for(const id in others) {
        if(id == player.id){ 
            continue;
    }
    const p = others[id];

    ctx.fillStyle = 'red';
    // [기능 2-2] 다른 플레이어 몸통 길어지는 기능 그리기
    if (p.bodySegments) { // 해당 플레이어가 bodySegments 데이터를 가지고 있을 경우
        for (let i = 0; i < p.bodySegments.length - 1; i++) { // 몸통은 머리를 제외하므로 -1
            const seg = p.bodySegments[i]; // i번째 몸통 좌표를 꺼냄
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, 8, 0, Math.PI * 2); // 몸통은 머리보다 조금 작은 반지름(8)
            ctx.fill(); // 몸통 원 렌더링
        }
    }
   
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
}

    if(player){
        
        const me = others[player.id];
        if(me){
            player = me;
        }
        // [기능 2] 몸통이 길어지는 기능은 github 오픈소스 중 C언어 기반 콘솔 지렁이 게임에서 착안함.
        // 해당 게임에서는 플레이어의 좌표를 큐 또는 배열로 관리하며, 머리 위치를 새로운 좌표로 추가하고,
        // 최대 길이를 초과할 경우 가장 오래된 좌표를 제거하는 방식으로 몸통을 구현했음.
        // 본 프로젝트에서도 이와 유사하게, 클라이언트에서는 본인의 위치를 bodySegments 배열에 지속적으로 추가하고,
        // 점수에 비례한 최대 길이를 초과할 경우 배열의 앞쪽(가장 오래된 좌표)을 제거함으로써
        // 점수를 기반으로 점진적으로 길어지는 효과를 시각적으로 구현함.
        // (참고한 소스: https://github.com/Sehyeon-An/Earthworm_game/blob/master/main3.cpp)

        // [기능 2] 현재 위치를 bodySegments에 추가하고 최대 길이를 점수에 따라 제한
        bodySegments.push({x: player.x, y: player.y});
        while (bodySegments.length > (player.score + 1)) {
            bodySegments.shift();
        }
        // [기능 2] 몸통부터 먼저 그리기
        ctx.fillStyle = 'lime';
        for (let i = 0; i < bodySegments.length - 1; i++) { 
            const seg = bodySegments[i];
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        // 머리 그리기
        ctx.beginPath();
        ctx.arc(player.x, player.y, 10, 0, Math.PI * 2);
        ctx.fill();

        // [기능 4] 나의 점수 좌측 상단에 표시
        // 점수 UI는 Slither.io 화면을 참고해 텍스트의 색상, 크기, 폰트를 유사하게 구현함.
        // 좌측 상단 고정 배치 방식을 통해, 플레이어가 시야를 방해받지 않으면서도 실시간 정보를 빠르게 파악할 수 있도록 구성함.
        ctx.fillStyle = 'white'; // 텍스트 색상
        ctx.font = '20px Arial'; // 폰트 설정
        ctx.fillText(`Score: ${player.score || 0}`, 10, 30); // 좌측 상단 위치 (x:10, y:30)        

        // [기능 4] 다른 플레이어 점수도 표시. GPT의 코드를 응용해 점수 색상과 크기, 위치 자율적으로 구성함.  
        let yOffset = 60; // Your score 아래부터 시작
        for (const id in others) {
            if (id !== player.id) {
                const other = others[id];
                ctx.fillStyle = 'gray';
                ctx.font = '16px Arial';
                ctx.fillText(`Player ${id.slice(0, 4)}: ${other.score || 0}`, 10, yOffset);
                yOffset += 20;
            }
        }
        
        // [기능 5 / 추가기능] 플레이어가 캔버스 밖으로 나가는 것을 방지하기 위한 제어 로직
        // HTML5 캔버스 요소에는 clientWidth와 canvas.height 등이 명시되어 있으며,
        // draw() 함수 내에서도 ctx.clearRect(0, 0, canvas.clientWidth, canvas.height)로 캔버스 영역을 정의하고 있으므로,
        // 여기서도 일관성을 유지해 동일한 속성들을 기준으로 플레이어의 좌표가 화면 밖을 벗어났는지 판단함.
        // 본 프로젝트에서는 플레이어 이동이 클라이언트에서 제어되기 때문에,
        // 이동 자체를 제한함으로써 불필요한 서버 연산이나 예외 처리를 줄이고 안정적인 게임 진행을 유도함.
        if (
            player.x < 0 || // 플레이어의 x좌표가 캔버스의 왼쪽 경계를 벗어난 경우
            player.x > canvas.clientWidth || // 플레이어의 x좌표가 캔버스의 오른쪽 경계를 벗어난 경우
            player.y < 0 || // 플레이어의 y좌표가 캔버스의 위쪽 경계를 벗어난 경우
            player.y > canvas.height // 플레이어의 y좌표가 캔버스의 아래쪽 경계를 벗어난 경우
        ) 

        for (const id in others) {
            if (id !== player.id) { // 다른 플레이어와 충돌 체크
                const p = others[id];
                // 플레이어 간 충돌 시 클라이언트에서 움직임을 멈추기 위해
                // setInterval로 등록한 이동 이벤트를 clearInterval로 직접 제어함
                if (checkPlayerCollision(player, p)) { // 거리 기반 충돌 여부 확인
                    alert("💥 다른 플레이어와 충돌! 게임 종료!"); // 사용자 피드백
                    clearInterval(moveInterval); // 위치 전송 중단 (게임 멈춤 효과)
                    return; // draw() 루프 중단
                }
            }
        }
    }
    requestAnimationFrame(draw);
}