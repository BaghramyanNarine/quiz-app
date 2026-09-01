// Глобальные переменные
let socket = null;
let currentUser = null;
let currentRoom = null;
let currentQuiz = null;
let currentQuestionIndex = -1;
let timerInterval = null;
let isAnswering = false;
let selectedQuizId = null;

// API URL
const API_URL = 'http://localhost:5000';

// === АВТОРИЗАЦИЯ ===
function showLogin() {
    hideAllPages();
    document.getElementById('loginPage').style.display = 'block';
}

function showRegister() {
    hideAllPages();
    document.getElementById('registerPage').style.display = 'block';
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(currentUser));
            showHomePage();
        } else {
            alert(data.error || 'Ошибка входа');
        }
    } catch (error) {
        alert('Ошибка подключения к серверу');
    }
}

async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Регистрация успешна! Теперь войдите.');
            showLogin();
        } else {
            alert(data.error || 'Ошибка регистрации');
        }
    } catch (error) {
        alert('Ошибка подключения к серверу');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    hideAllPages();
    document.getElementById('authButtons').style.display = 'flex';
    document.getElementById('userInfo').style.display = 'none';
    document.getElementById('homePage').style.display = 'none';
}

function hideAllPages() {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
}

function showHomePage() {
    hideAllPages();
    document.getElementById('homePage').style.display = 'block';
    document.getElementById('authButtons').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('usernameDisplay').textContent = `👤 ${currentUser.username} (${currentUser.role === 'organizer' ? 'Организатор' : 'Участник'})`;
    
    if (currentUser.role === 'organizer') {
        document.getElementById('organizerPanel').style.display = 'block';
        document.getElementById('participantPanel').style.display = 'block';
        loadMyQuizzes();
    } else {
        document.getElementById('organizerPanel').style.display = 'none';
        document.getElementById('participantPanel').style.display = 'block';
    }
    
    loadAvailableQuizzes();
}

// === КВИЗЫ ===
function addQuestion() {
    const container = document.getElementById('questionsContainer');
    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';
    questionDiv.innerHTML = `
        <input type="text" placeholder="Текст вопроса" class="question-text">
        <select class="question-type">
            <option value="single">Одиночный выбор</option>
            <option value="multiple">Множественный выбор</option>
        </select>
        <div class="options-container">
            <div class="option-input">
                <input type="text" placeholder="Вариант ответа" class="option-text">
                <input type="checkbox" class="option-correct" title="Правильный ответ">
            </div>
            <div class="option-input">
                <input type="text" placeholder="Вариант ответа" class="option-text">
                <input type="checkbox" class="option-correct" title="Правильный ответ">
            </div>
        </div>
        <button class="btn btn-secondary" onclick="addOption(this)">➕ Добавить вариант</button>
        <button class="btn btn-danger" onclick="removeQuestion(this)">✖ Удалить вопрос</button>
    `;
    container.appendChild(questionDiv);
}

function addOption(button) {
    const container = button.previousElementSibling || button.parentElement.querySelector('.options-container');
    const optionDiv = document.createElement('div');
    optionDiv.className = 'option-input';
    optionDiv.innerHTML = `
        <input type="text" placeholder="Вариант ответа" class="option-text">
        <input type="checkbox" class="option-correct" title="Правильный ответ">
    `;
    container.appendChild(optionDiv);
}

function removeQuestion(button) {
    button.parentElement.remove();
}

async function saveQuiz() {
    const title = document.getElementById('quizTitle').value;
    const category = document.getElementById('quizCategory').value;
    const timePerQuestion = parseInt(document.getElementById('quizTime').value) || 30;

    const questionElements = document.querySelectorAll('.question-item');
    const questions = [];

    questionElements.forEach(el => {
        const text = el.querySelector('.question-text').value;
        const type = el.querySelector('.question-type').value;
        const options = [];
        const correctAnswers = [];

        const optionInputs = el.querySelectorAll('.option-input');
        optionInputs.forEach(opt => {
            const text = opt.querySelector('.option-text').value;
            const isCorrect = opt.querySelector('.option-correct').checked;
            options.push(text);
            if (isCorrect) correctAnswers.push(options.length - 1);
        });

        if (text && options.length > 0) {
            questions.push({
                text,
                type,
                options,
                correctAnswer: type === 'single' ? correctAnswers[0] : correctAnswers,
                points: 10
            });
        }
    });

    if (questions.length === 0) {
        alert('Добавьте хотя бы один вопрос!');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/quizzes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                category,
                timePerQuestion,
                questions,
                creator: currentUser.id
            })
        });

        if (response.ok) {
            alert('Квиз сохранен!');
            document.getElementById('quizTitle').value = '';
            document.getElementById('quizCategory').value = '';
            document.getElementById('questionsContainer').innerHTML = '';
            loadMyQuizzes();
        } else {
            alert('Ошибка сохранения квиза');
        }
    } catch (error) {
        alert('Ошибка подключения к серверу');
    }
}

async function loadMyQuizzes() {
    try {
        const response = await fetch(`${API_URL}/api/quizzes`);
        const quizzes = await response.json();
        const myQuizzes = quizzes.filter(q => q.creator === currentUser.id);
        
        const container = document.getElementById('myQuizzes');
        container.innerHTML = '';
        
        if (myQuizzes.length === 0) {
            container.innerHTML = '<p>У вас пока нет созданных квизов</p>';
            return;
        }

        myQuizzes.forEach(quiz => {
            const div = document.createElement('div');
            div.className = 'form-card';
            div.innerHTML = `
                <h4>${quiz.title}</h4>
                <p>Категория: ${quiz.category || 'Без категории'}</p>
                <p>Вопросов: ${quiz.questions.length}</p>
                <button class="btn btn-success" onclick="createRoom('${quiz.id}')">🚀 Запустить квиз</button>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Ошибка загрузки квизов:', error);
    }
}

async function loadAvailableQuizzes() {
    try {
        const response = await fetch(`${API_URL}/api/quizzes`);
        const quizzes = await response.json();
        
        const container = document.getElementById('availableQuizzes');
        container.innerHTML = '';
        
        if (quizzes.length === 0) {
            container.innerHTML = '<p>Нет доступных квизов</p>';
            return;
        }

        quizzes.forEach(quiz => {
            const div = document.createElement('div');
            div.className = 'form-card';
            div.innerHTML = `
                <h4>${quiz.title}</h4>
                <p>Категория: ${quiz.category || 'Без категории'}</p>
                <p>Вопросов: ${quiz.questions.length}</p>
                <button class="btn btn-primary" onclick="selectQuiz('${quiz.id}')">📝 Пройти квиз</button>
            `;
            container.appendChild(div);
        });
    } catch (error) {
        console.error('Ошибка загрузки квизов:', error);
    }
}

function selectQuiz(quizId) {
    selectedQuizId = quizId;
    const roomCode = prompt('Введите код комнаты для подключения:');
    if (roomCode) {
        document.getElementById('roomCode').value = roomCode;
        joinRoom();
    }
}

// === КОМНАТЫ И SOCKET ===
function connectSocket() {
    if (!socket) {
        socket = io(API_URL, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Подключен к WebSocket');
        });

        socket.on('roomCreated', (data) => {
            alert(`Комната создана! Код: ${data.roomCode}`);
            currentRoom = data.roomCode;
            currentQuiz = data.quiz;
            showRoom(true);
        });

        socket.on('joinedRoom', (data) => {
            currentRoom = data.roomCode;
            currentQuiz = data.quiz;
            showRoom(true);
            updatePlayersList(data.players);
        });

        socket.on('playerJoined', (data) => {
            updatePlayersList(data.players);
        });

        socket.on('playerLeft', (data) => {
            updatePlayersList(data.players);
        });

        socket.on('quizStarted', (data) => {
            document.getElementById('lobby').style.display = 'none';
            document.getElementById('game').style.display = 'block';
            document.getElementById('questionCounter').textContent = `Вопрос 1/${data.totalQuestions}`;
            currentQuestionIndex = 0;
        });

        socket.on('newQuestion', (data) => {
            isAnswering = true;
            document.getElementById('questionCounter').textContent = `Вопрос ${data.questionNumber}/${data.totalQuestions}`;
            document.getElementById('questionText').textContent = data.question.text;
            
            // Изображение
            if (data.question.image) {
                document.getElementById('questionImage').style.display = 'block';
                document.getElementById('questionImageElement').src = data.question.image;
            } else {
                document.getElementById('questionImage').style.display = 'none';
            }

            // Опции
            const container = document.getElementById('optionsContainer');
            container.innerHTML = '';
            
            if (data.question.type === 'single' || data.question.type === 'multiple') {
                data.question.options.forEach((option, index) => {
                    const btn = document.createElement('button');
                    btn.className = 'option-btn';
                    btn.textContent = option;
                    btn.dataset.index = index;
                    btn.onclick = () => handleAnswer(index);
                    container.appendChild(btn);
                });
            }

            // Таймер
            let timeLeft = data.question.timeLimit || 30;
            document.getElementById('timerDisplay').textContent = `⏱️ ${timeLeft}`;
            
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                timeLeft--;
                document.getElementById('timerDisplay').textContent = `⏱️ ${timeLeft}`;
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    isAnswering = false;
                    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);
                }
            }, 1000);
        });

        socket.on('questionResults', (data) => {
            clearInterval(timerInterval);
            isAnswering = false;
            updateScores(data.players);
            
            // Показываем правильные ответы
            document.querySelectorAll('.option-btn').forEach((btn, index) => {
                btn.disabled = true;
                if (index === data.correctAnswer) {
                    btn.classList.add('correct');
                } else if (btn.classList.contains('selected')) {
                    btn.classList.add('wrong');
                }
            });
        });

        socket.on('quizEnded', (data) => {
            document.getElementById('game').style.display = 'none';
            document.getElementById('results').style.display = 'block';
            showLeaderboard(data.players);
        });

        socket.on('error', (message) => {
            alert(message);
        });

        socket.on('disconnect', () => {
            console.log('Отключен от сервера');
        });
    }
}

function createRoom(quizId) {
    connectSocket();
    socket.emit('createRoom', {
        quizId,
        username: currentUser.username
    });
}

function joinRoom() {
    const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
    if (!roomCode) {
        alert('Введите код комнаты');
        return;
    }

    connectSocket();
    socket.emit('joinRoom', {
        roomCode,
        username: currentUser.username
    });
}

function startQuiz() {
    if (!currentRoom) return;
    socket.emit('startQuiz', { roomCode: currentRoom });
}

function handleAnswer(index) {
    if (!isAnswering) return;
    isAnswering = false;
    
    const btn = document.querySelectorAll('.option-btn')[index];
    btn.classList.add('selected');
    btn.disabled = true;
    
    socket.emit('answerQuestion', {
        roomCode: currentRoom,
        answer: index
    });
}

function leaveRoom() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    currentRoom = null;
    currentQuiz = null;
    document.getElementById('roomPage').style.display = 'none';
    document.getElementById('homePage').style.display = 'block';
    clearInterval(timerInterval);
}

function showRoom(isHost) {
    hideAllPages();
    document.getElementById('roomPage').style.display = 'block';
    document.getElementById('roomCodeDisplay').textContent = currentRoom;
    document.getElementById('roomQuizTitle').textContent = currentQuiz ? currentQuiz.title : '';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('game').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    
    if (currentUser.role === 'organizer') {
        document.getElementById('startQuizBtn').style.display = 'block';
    } else {
        document.getElementById('startQuizBtn').style.display = 'none';
    }
}

function updatePlayersList(players) {
    const ul = document.getElementById('playersListUl');
    ul.innerHTML = '';
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.username} ${player.score ? `(⭐ ${player.score})` : ''}`;
        ul.appendChild(li);
    });
}

function updateScores(players) {
    const ul = document.getElementById('scoresList');
    ul.innerHTML = '';
    players.sort((a, b) => (b.score || 0) - (a.score || 0));
    players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.username}: ${player.score || 0} баллов`;
        ul.appendChild(li);
    });
}

function showLeaderboard(players) {
    const container = document.getElementById('leaderboard');
    const ul = document.createElement('ul');
    players.sort((a, b) => (b.score || 0) - (a.score || 0));
    players.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `${index + 1}. ${player.username} - ${player.score || 0} баллов`;
        ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
}

// === ИНИЦИАЛИЗАЦИЯ ===
// Проверка авторизации при загрузке
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
        currentUser = JSON.parse(user);
        showHomePage();
    } else {
        hideAllPages();
        document.getElementById('authButtons').style.display = 'flex';
    }
});