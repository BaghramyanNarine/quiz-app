const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Хранилище данных (в реальном проекте используйте БД)
const users = [];
const quizzes = [];
const rooms = {};
const results = [];

// === АВТОРИЗАЦИЯ ===
app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;
  
  // Проверка существования пользователя
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Пользователь уже существует' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    role: role || 'participant',
    history: []
  };
  
  users.push(user);
  res.status(201).json({ 
    message: 'Регистрация успешна',
    user: { id: user.id, username: user.username, role: user.role }
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET || 'secret_key',
    { expiresIn: '1h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// === КВИЗЫ ===
app.post('/api/quizzes', (req, res) => {
  const { title, category, timePerQuestion, questions, creator } = req.body;
  
  const quiz = {
    id: uuidv4(),
    title,
    category,
    timePerQuestion: timePerQuestion || 30,
    questions,
    creator,
    createdAt: new Date().toISOString()
  };
  
  quizzes.push(quiz);
  res.status(201).json({ quizId: quiz.id });
});

app.get('/api/quizzes', (req, res) => {
  res.json(quizzes);
});

app.get('/api/quizzes/:id', (req, res) => {
  const quiz = quizzes.find(q => q.id === req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Квиз не найден' });
  }
  res.json(quiz);
});

// === РЕЗУЛЬТАТЫ ===
app.post('/api/results', (req, res) => {
  const { quizId, userId, score, answers } = req.body;
  const result = {
    id: uuidv4(),
    quizId,
    userId,
    score,
    answers,
    completedAt: new Date().toISOString()
  };
  results.push(result);
  
  // Обновляем историю пользователя
  const user = users.find(u => u.id === userId);
  if (user) {
    const quiz = quizzes.find(q => q.id === quizId);
    user.history.push({
      quizId,
      quizTitle: quiz ? quiz.title : 'Unknown',
      score,
      completedAt: result.completedAt
    });
  }
  
  res.status(201).json({ resultId: result.id });
});

app.get('/api/results/:userId', (req, res) => {
  const userResults = results.filter(r => r.userId === req.params.userId);
  res.json(userResults);
});

// === SOCKET.IO (Комнаты и квизы в реальном времени) ===
io.on('connection', (socket) => {
  console.log('Новый клиент подключен:', socket.id);

  // Создание комнаты
  socket.on('createRoom', ({ quizId, username }) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const quiz = quizzes.find(q => q.id === quizId);
    
    if (!quiz) {
      socket.emit('error', 'Квиз не найден');
      return;
    }

    rooms[roomCode] = {
      quizId,
      quiz,
      host: socket.id,
      players: [],
      currentQuestion: -1,
      started: false,
      scores: {},
      answers: {}
    };

    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, quiz });
    console.log(`Комната ${roomCode} создана для квиза: ${quiz.title}`);
  });

  // Подключение к комнате
  socket.on('joinRoom', ({ roomCode, username }) => {
    const room = rooms[roomCode];
    
    if (!room) {
      socket.emit('error', 'Комната не найдена');
      return;
    }

    if (room.started) {
      socket.emit('error', 'Квиз уже начался');
      return;
    }

    const player = {
      id: socket.id,
      username,
      score: 0
    };

    room.players.push(player);
    room.scores[socket.id] = 0;
    socket.join(roomCode);
    socket.emit('joinedRoom', { roomCode, quiz: room.quiz, players: room.players });
    
    // Уведомление всем в комнате о новом игроке
    io.to(roomCode).emit('playerJoined', { 
      players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score }))
    });
  });

  // Начало квиза
  socket.on('startQuiz', ({ roomCode }) => {
    const room = rooms[roomCode];
    
    if (!room) {
      socket.emit('error', 'Комната не найдена');
      return;
    }

    if (room.host !== socket.id) {
      socket.emit('error', 'Только создатель комнаты может начать квиз');
      return;
    }

    room.started = true;
    room.currentQuestion = 0;
    io.to(roomCode).emit('quizStarted', { 
      totalQuestions: room.quiz.questions.length,
      currentQuestion: 0
    });

    // Показываем первый вопрос через 3 секунды
    setTimeout(() => {
      sendQuestion(roomCode);
    }, 3000);
  });

  // Отправка вопроса
  function sendQuestion(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.currentQuestion >= room.quiz.questions.length) {
      io.to(roomCode).emit('quizEnded', { 
        scores: room.scores,
        players: room.players
      });
      return;
    }

    const question = room.quiz.questions[room.currentQuestion];
    room.answers = {};
    
    io.to(roomCode).emit('newQuestion', {
      questionNumber: room.currentQuestion + 1,
      totalQuestions: room.quiz.questions.length,
      question: {
        text: question.text,
        type: question.type,
        options: question.options || [],
        image: question.image || null,
        timeLimit: room.quiz.timePerQuestion || 30
      }
    });

    // Устанавливаем таймер для завершения вопроса
    setTimeout(() => {
      const answerData = room.answers;
      // Подсчет баллов
      room.players.forEach(player => {
        const playerAnswer = answerData[player.id];
        if (playerAnswer !== undefined) {
          const isCorrect = playerAnswer === question.correctAnswer;
          if (isCorrect) {
            const points = question.points || 10;
            room.scores[player.id] = (room.scores[player.id] || 0) + points;
            player.score = room.scores[player.id];
          }
        }
      });

      room.currentQuestion++;
      
      // Отправляем результаты вопроса
      io.to(roomCode).emit('questionResults', {
        scores: room.scores,
        players: room.players,
        correctAnswer: question.correctAnswer
      });

      // Следующий вопрос через 2 секунды
      setTimeout(() => {
        sendQuestion(roomCode);
      }, 2000);
    }, (room.quiz.timePerQuestion || 30) * 1000);
  }

  // Ответ на вопрос
  socket.on('answerQuestion', ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.started) return;

    room.answers[socket.id] = answer;
    
    // Отправляем подтверждение
    socket.emit('answerConfirmed', { 
      message: 'Ответ получен',
      answer 
    });
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log('Клиент отключился:', socket.id);
    
    // Удаляем из комнат
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.scores[socket.id];
      
      io.to(roomCode).emit('playerLeft', {
        players: room.players.map(p => ({ id: p.id, username: p.username, score: p.score }))
      });
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Доступен по адресу: http://localhost:${PORT}`);
});