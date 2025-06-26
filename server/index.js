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

// index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 1818; // 1 ~ 1024

app.use(express.static(path.join
    (__dirname, '../client'))); 

/* 게임 로직 시작 */
const players = {};
const foods = generateFoods(50);

function generateFoods(count){
    const arr = [];
    for(let i=0; i<count; i++){
        arr.push({
            id: `food_${i}`, //키보드 1 왼쪽의 따옴표
            x: Math.random() * 800, 
            y: Math.random() * 600,
        });
    }
    return arr;
}

// [기능 3] 플레이어 & 먹이 충돌 체크 함수 추가 - 두 번째로 구현
// 플레이어간 충돌 함수와 마찬가지로 수박게임에서 과일 간 충돌을 거리로 판단했던 방식에서 착안 
// 물리엔진 없이 수학적 거리 기반으로 충돌 판단. 
function checkFoodCollision(player, food) {
    const dx = player.x - food.x;
    const dy = player.y - food.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 15; // 플레이어 반지름 10 + 먹이 반지름 5
}

// *[기능 1]두 플레이어 간 충돌 여부를 판단하는 함수 - 첫 번째로 구현*
    // Matter.js 기반의 수박게임에서는 물리 엔진이 각 객체의 충돌을 자동으로 감지하고,
    // Events.on('collisionStart') 이벤트를 통해 간편하게 충돌 처리를 구현할 수 있었음.
    // 본 프로젝트에서도 초기에는 동일한 방식의 코드 활용을 고려했으나,
    // GPT를 통해 구조적 차이를 검토한 결과, 본 프로젝트는 Matter.js와 같은 물리 시뮬레이션 라이브러리를 사용하지 않고,
    // socket 기반으로 플레이어의 위치 좌표만을 주기적으로 수신/갱신하는 구조이기 때문에,
    // 물리 엔진이 제공하는 자동 충돌 감지 기능을 사용할 수 없음.
    // 이에 따라 모든 플레이어 쌍을 수동으로 순회하며, 두 좌표 간의 거리를 계산해 충돌 여부를 판별하고
    // 충돌이 감지된 경우 해당 객체를 직접 제거하는 방식으로 로직을 구성함.
function checkPlayerCollision(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < 20;
}

io.on('connection', (socket) => {
    console.log(`User connected : ${socket.id}`);

    // 접속한 새로운 유저 정보 생성
    players[socket.id] = { 
        id: socket.id,
        x: Math.random() * 800,
        y: Math.random() * 600,
        angle: 0,
        speed: 2,
        score: 0, // [기능 4] 점수 초기화 추가
        bodySegments: [] // [기능 2-2] 다른 플레이어의 몸통 추가        
    };

    socket.on('move', ({angle}) => {
        if(players[socket.id]){     
            players[socket.id].angle = angle; // 예외처리를 위한 조건문, 앵글만 업데이트
        }
    })

    socket.emit('init', {
        player: players[socket.id],
        foods: foods,
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        delete players[socket.id];
    });
})

//모든 사용자의 angle 정보 주기적으로 전송
setInterval(() => {
    for(const id in players){
        const p = players[id];
        p.x += Math.cos(p.angle) * p.speed;
        p.y += Math.sin(p.angle) * p.speed;
        // * [기능 2-2] 이동 후 bodySegments에 위치 추가 *
        p.bodySegments.push({ x: p.x, y: p.y });
        while (p.bodySegments.length > (p.score + 1)) {
            p.bodySegments.shift();
        }

        // * [기능 3] 먹이와 충돌 시 제거하고 새 먹이 생성 *
        // 먹이를 먹으면 해당 먹이를 제거하고 새로운 먹이를 랜덤 위치에 생성함.
        // 이 로직은 github의 C언어 기반 콘솔 지렁이 게임의 eat_star() 함수에서 착안한 것으로,
        // 해당 함수에서는 rand()를 이용해 먹이의 위치 좌표를 무작위로 생성하고 gotoxy를 통해 콘솔 상에 출력함.
        // 이를 본 프로젝트에 맞춰 socket 기반 구조에 맞게 응용하여,
        // JS의 Math.random()을 활용해 서버에서 foods 배열에 새 먹이를 push하는 방식으로 구현함.
        // 기존 콘솔 게임에서는 화면에 직접 출력(gotoxy)이었다면,
        // 이 구조에서는 서버에서 계산 후 클라이언트에 전달하여 canvas에 시각화(draw)하는 방식으로 구현됨.
        // (github resource: https://github.com/Sehyeon-An/Earthworm_game/blob/master/main3.cpp)
        for (let i = 0; i < foods.length; i++) {    // 모든 먹이 목록을 순회하며 충돌 여부 확인
            const food = foods[i]; // 현재 검사 중인 먹이 객체를 변수에 저장
            if (checkFoodCollision(p, food)) {  // 플레이어 p와 현재 먹이가 충돌했는지 확인
                foods.splice(i, 1); // 충돌한 먹이 삭제
                foods.push({ // 새 먹이 생성
                    id: `food_${Date.now()}`, // 고유 ID 생성
                    x: Math.random() * 800, // 화면 너비가 800px
                    y: Math.random() * 600 // 높이가 600px일 때 해당 범위 안에서만 랜덤한 좌표를 생성하도록
                });
                p.score += 1; // 점수 증가 ← [기능 4 점수]
                break; // 한 번에 하나의 먹이만 먹도록 루프 중단
            }
        }
    }
    // *[기능 1] 충돌 체크 후 양쪽 플레이어 제거*
    // 수박게임처럼 자동 충돌 처리를 활용할 수 없기 때문에,
    // 모든 플레이어 쌍을 순회하며 충돌 여부를 수동으로 계산해 삭제 처리함
    const ids = Object.keys(players); // 현재 모든 플레이어 id 배열
    for (let i = 0; i < ids.length; i++) { // 첫 번째 플레이어 반복문 시작
        for (let j = i + 1; j < ids.length; j++) { // 두 번째 플레이어 반복문 (중복 비교 방지 위해 j = i + 1부터 시작)
            const p1 = players[ids[i]]; // 첫 번째 플레이어 객체 할당
            const p2 = players[ids[j]]; // 두 번째 플레이어 객체 할당

            if (checkPlayerCollision(p1, p2)) { // 충돌 시
                console.log(`💥 충돌 발생: ${p1.id} <-> ${p2.id}`); // 로그 출력
                delete players[p1.id]; // 충돌한 플레이어 서버에서 제거
                delete players[p2.id]; // 서버 상태에서 완전히 삭제 → 서버에선 World.remove 대체 방식
            }
        }
    }

    io.emit('state',{players, foods}); //state라는 헤더를 생성, [기능 3] 추가로 클라이언트에 최신 먹이 상태 포함하여 전송. [기능 4] players 객체 안에 score도 함께 포함됨
}, 1000/60); //1초에 60번 전송 의미

server.listen(PORT,() => {
    console.log("server running at http://localhost:1818");
});