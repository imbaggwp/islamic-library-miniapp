const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// База данных
const db = new Database('database.sqlite');

// Инициализация базы данных
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    title TEXT NOT NULL,
    emoji TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    audio_url TEXT NOT NULL,
    duration INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    description TEXT,
    pdf_url TEXT NOT NULL,
    cover_url TEXT,
    pages INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content_type TEXT NOT NULL CHECK(content_type IN ('lesson', 'book')),
    content_id INTEGER NOT NULL,
    progress_percent REAL DEFAULT 0,
    position INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    completed_at DATETIME,
    last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, content_type, content_id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content_type TEXT NOT NULL CHECK(content_type IN ('lesson', 'book')),
    content_id INTEGER NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, content_type, content_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_type TEXT NOT NULL,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, achievement_type)
  );
`);

// Проверка админа
const isAdmin = (telegramId) => {
  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || '').split(',').map(id => parseInt(id.trim()));
  return adminIds.includes(telegramId);
};

// ============ API ROUTES ============

// Авторизация пользователя
app.post('/api/auth', (req, res) => {
  const { telegram_id, username, first_name } = req.body;
  
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegram_id);
  
  if (!user) {
    const admin = isAdmin(telegram_id) ? 1 : 0;
    const result = db.prepare(
      'INSERT INTO users (telegram_id, username, first_name, is_admin) VALUES (?, ?, ?, ?)'
    ).run(telegram_id, username, first_name, admin);
    
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare(
      'UPDATE users SET username = ?, first_name = ? WHERE telegram_id = ?'
    ).run(username, first_name, telegram_id);
  }
  
  res.json(user);
});

// ============ КАТЕГОРИИ ============

// Получить дерево категорий
app.get('/api/categories/tree', (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, created_at').all();
  
  const buildTree = (parentId = null) => {
    return categories
      .filter(c => c.parent_id === parentId)
      .map(c => ({
        ...c,
        children: buildTree(c.id)
      }));
  };
  
  res.json(buildTree());
});

// Создать категорию
app.post('/api/categories', (req, res) => {
  const { parent_id, title, emoji, description, sort_order = 0 } = req.body;
  
  const result = db.prepare(
    'INSERT INTO categories (parent_id, title, emoji, description, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(parent_id || null, title, emoji, description, sort_order);
  
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
  res.json(category);
});

// Обновить категорию
app.put('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  const { title, emoji, description, sort_order } = req.body;
  
  db.prepare(
    'UPDATE categories SET title = COALESCE(?, title), emoji = COALESCE(?, emoji), description = COALESCE(?, description), sort_order = COALESCE(?, sort_order) WHERE id = ?'
  ).run(title, emoji, description, sort_order, id);
  
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(category);
});

// Удалить категорию
app.delete('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============ УРОКИ ============

// Получить уроки категории
app.get('/api/categories/:categoryId/lessons', (req, res) => {
  const { categoryId } = req.params;
  const lessons = db.prepare('SELECT * FROM lessons WHERE category_id = ? ORDER BY created_at').all(categoryId);
  res.json(lessons);
});

// Создать урок
app.post('/api/lessons', (req, res) => {
  const { category_id, title, description, audio_url, duration } = req.body;
  
  const result = db.prepare(
    'INSERT INTO lessons (category_id, title, description, audio_url, duration) VALUES (?, ?, ?, ?, ?)'
  ).run(category_id, title, description, audio_url, duration);
  
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(result.lastInsertRowid);
  res.json(lesson);
});

// Обновить урок
app.put('/api/lessons/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, audio_url, duration } = req.body;
  
  db.prepare(
    'UPDATE lessons SET title = COALESCE(?, title), description = COALESCE(?, description), audio_url = COALESCE(?, audio_url), duration = COALESCE(?, duration) WHERE id = ?'
  ).run(title, description, audio_url, duration, id);
  
  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);
  res.json(lesson);
});

// Удалить урок
app.delete('/api/lessons/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============ КНИГИ ============

// Получить книги категории
app.get('/api/categories/:categoryId/books', (req, res) => {
  const { categoryId } = req.params;
  const books = db.prepare('SELECT * FROM books WHERE category_id = ? ORDER BY created_at').all(categoryId);
  res.json(books);
});

// Создать книгу
app.post('/api/books', (req, res) => {
  const { category_id, title, author, description, pdf_url, cover_url, pages } = req.body;
  
  const result = db.prepare(
    'INSERT INTO books (category_id, title, author, description, pdf_url, cover_url, pages) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(category_id, title, author, description, pdf_url, cover_url, pages);
  
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(result.lastInsertRowid);
  res.json(book);
});

// Обновить книгу
app.put('/api/books/:id', (req, res) => {
  const { id } = req.params;
  const { title, author, description, pdf_url, cover_url, pages } = req.body;
  
  db.prepare(
    'UPDATE books SET title = COALESCE(?, title), author = COALESCE(?, author), description = COALESCE(?, description), pdf_url = COALESCE(?, pdf_url), cover_url = COALESCE(?, cover_url), pages = COALESCE(?, pages) WHERE id = ?'
  ).run(title, author, description, pdf_url, cover_url, pages, id);
  
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
  res.json(book);
});

// Удалить книгу
app.delete('/api/books/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
  res.json({ success: true });
});

// ============ ПРОГРЕСС ============

// Получить прогресс пользователя
app.get('/api/progress/:userId', (req, res) => {
  const { userId } = req.params;
  const progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ?').all(userId);
  res.json(progress);
});

// Обновить прогресс
app.post('/api/progress', (req, res) => {
  const { user_id, content_type, content_id, progress_percent, position, is_completed } = req.body;
  
  const existing = db.prepare(
    'SELECT * FROM user_progress WHERE user_id = ? AND content_type = ? AND content_id = ?'
  ).get(user_id, content_type, content_id);
  
  if (existing) {
    db.prepare(
      'UPDATE user_progress SET progress_percent = ?, position = ?, is_completed = ?, completed_at = ?, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(progress_percent, position, is_completed ? 1 : 0, is_completed ? new Date() : null, existing.id);
  } else {
    db.prepare(
      'INSERT INTO user_progress (user_id, content_type, content_id, progress_percent, position, is_completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(user_id, content_type, content_id, progress_percent, position, is_completed ? 1 : 0, is_completed ? new Date() : null);
  }
  
  res.json({ success: true });
});

// ============ ИЗБРАННОЕ ============

// Получить избранное пользователя
app.get('/api/favorites/:userId', (req, res) => {
  const { userId } = req.params;
  const favorites = db.prepare('SELECT * FROM favorites WHERE user_id = ?').all(userId);
  res.json(favorites);
});

// Добавить в избранное
app.post('/api/favorites', (req, res) => {
  const { user_id, content_type, content_id } = req.body;
  
  const existing = db.prepare(
    'SELECT * FROM favorites WHERE user_id = ? AND content_type = ? AND content_id = ?'
  ).get(user_id, content_type, content_id);
  
  if (!existing) {
    db.prepare(
      'INSERT INTO favorites (user_id, content_type, content_id) VALUES (?, ?, ?)'
    ).run(user_id, content_type, content_id);
  }
  
  res.json({ success: true });
});

// Удалить из избранного
app.delete('/api/favorites/:userId/:contentType/:contentId', (req, res) => {
  const { userId, contentType, contentId } = req.params;
  db.prepare(
    'DELETE FROM favorites WHERE user_id = ? AND content_type = ? AND content_id = ?'
  ).run(userId, contentType, contentId);
  res.json({ success: true });
});

// ============ ДОСТИЖЕНИЯ ============

// Получить достижения пользователя
app.get('/api/achievements/:userId', (req, res) => {
  const { userId } = req.params;
  const achievements = db.prepare('SELECT * FROM achievements WHERE user_id = ?').all(userId);
  res.json(achievements);
});

// Добавить достижение
app.post('/api/achievements', (req, res) => {
  const { user_id, achievement_type } = req.body;
  
  const existing = db.prepare(
    'SELECT * FROM achievements WHERE user_id = ? AND achievement_type = ?'
  ).get(user_id, achievement_type);
  
  if (!existing) {
    db.prepare(
      'INSERT INTO achievements (user_id, achievement_type) VALUES (?, ?)'
    ).run(user_id, achievement_type);
  }
  
  res.json({ success: true });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
