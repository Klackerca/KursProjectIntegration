<?php
// Функция для загрузки переменных из .env файла
function loadEnv($filePath) {
    if (!file_exists($filePath)) {
        throw new Exception(".env file not found at: $filePath");
    }
    
    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        // Пропускаем комментарии
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        
        // Парсим строку KEY=VALUE
        if (strpos($line, '=') !== false) {
            list($key, $value) = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            
            // Удаляем кавычки если есть
            $value = trim($value, '"\'');
            
            // Устанавливаем переменную окружения, если еще не установлена
            if (!getenv($key)) {
                putenv("$key=$value");
                $_ENV[$key] = $value;
            }
        }
    }
}

// Загружаем переменные из .env файла
$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
    loadEnv($envPath);
} else {
    // Fallback на значения по умолчанию, если .env не найден
    error_log("Warning: .env file not found. Using default values.");
}

// Настройки базы данных из .env
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'Klacker_Calendar');
define('DB_USER', getenv('DB_USER') ?: 'Klacker_Calendar');
define('DB_PASS', getenv('DB_PASS') ?: '');

// Токен бота из .env
define('BOT_TOKEN', getenv('BOT_TOKEN') ?: '');

// Создание подключения к БД
function getDB() {
    try {
        // Проверяем наличие обязательных параметров
        if (empty(DB_HOST) || empty(DB_NAME) || empty(DB_USER)) {
            $error = "Database configuration incomplete. DB_HOST=" . (DB_HOST ?: 'empty') . 
                     ", DB_NAME=" . (DB_NAME ?: 'empty') . ", DB_USER=" . (DB_USER ?: 'empty');
            error_log($error);
            throw new Exception($error . ". Please check .env file.");
        }
        
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4";
        
        $pdo = new PDO(
            $dsn,
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_TIMEOUT => 5
            ]
        );
        
        return $pdo;
    } catch (PDOException $e) {
        $errorMsg = "Database connection failed: " . $e->getMessage();
        error_log($errorMsg);
        error_log("Connection details: host=" . DB_HOST . ", db=" . DB_NAME . ", user=" . DB_USER);
        throw new Exception($errorMsg);
    }
}

// Создание таблиц при первом запуске
function initDatabase() {
    try {
        $pdo = getDB();
        
        // Таблица пользователей
        $sql = "CREATE TABLE IF NOT EXISTS users (
            user_id BIGINT PRIMARY KEY,
            first_name VARCHAR(255),
            last_name VARCHAR(255),
            username VARCHAR(255),
            last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        $pdo->exec($sql);
        
        // Таблица календарей
        $sql = "CREATE TABLE IF NOT EXISTS calendars (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL DEFAULT 'Мой календарь',
            owner_id BIGINT NOT NULL,
            is_default BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_owner (owner_id),
            FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        $pdo->exec($sql);
        
        // Таблица участников календарей
        $sql = "CREATE TABLE IF NOT EXISTS calendar_members (
            id INT AUTO_INCREMENT PRIMARY KEY,
            calendar_id INT NOT NULL,
            user_id BIGINT NOT NULL,
            can_edit BOOLEAN DEFAULT 0,
            is_blocked BOOLEAN DEFAULT 0,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_member (calendar_id, user_id),
            INDEX idx_calendar (calendar_id),
            INDEX idx_user (user_id),
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        $pdo->exec($sql);
        
        // Таблица приглашений
        $sql = "CREATE TABLE IF NOT EXISTS calendar_invites (
            id INT AUTO_INCREMENT PRIMARY KEY,
            calendar_id INT NOT NULL,
            invite_code VARCHAR(8) NOT NULL UNIQUE,
            invite_token VARCHAR(64) NOT NULL UNIQUE,
            created_by BIGINT NOT NULL,
            expires_at TIMESTAMP NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_code (invite_code),
            INDEX idx_token (invite_token),
            INDEX idx_calendar (calendar_id),
            FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
            FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        $pdo->exec($sql);
        
        // Проверяем, существует ли таблица tasks и есть ли в ней поле calendar_id
        $checkTasks = $pdo->query("SHOW TABLES LIKE 'tasks'");
        if ($checkTasks->rowCount() > 0) {
            // Таблица существует, проверяем структуру
            $columns = $pdo->query("SHOW COLUMNS FROM tasks LIKE 'calendar_id'");
            if ($columns->rowCount() == 0) {
                // Поле calendar_id отсутствует, нужно мигрировать
                error_log("Migrating tasks table: adding calendar_id column");
                
                // Сначала создаем дефолтные календари для всех пользователей, у которых есть задачи
                $usersWithTasks = $pdo->query("SELECT DISTINCT user_id FROM tasks");
                $userCalendars = [];
                
                foreach ($usersWithTasks->fetchAll() as $userRow) {
                    $userId = $userRow['user_id'];
                    
                    // Проверяем, есть ли уже дефолтный календарь
                    $checkCal = $pdo->prepare("SELECT id FROM calendars WHERE owner_id = ? AND is_default = 1");
                    $checkCal->execute([$userId]);
                    $cal = $checkCal->fetch();
                    
                    if (!$cal) {
                        // Создаем дефолтный календарь
                        $createCal = $pdo->prepare("INSERT INTO calendars (name, owner_id, is_default) VALUES ('Мой календарь', ?, 1)");
                        $createCal->execute([$userId]);
                        $calId = $pdo->lastInsertId();
                    } else {
                        $calId = $cal['id'];
                    }
                    
                    $userCalendars[$userId] = $calId;
                }
                
                // Добавляем поле calendar_id как nullable сначала
                try {
                    $pdo->exec("ALTER TABLE tasks ADD COLUMN calendar_id INT NULL AFTER id");
                } catch (PDOException $e) {
                    error_log("Migration error adding column: " . $e->getMessage());
                }
                
                // Обновляем все задачи, добавляя calendar_id
                foreach ($userCalendars as $userId => $calId) {
                    try {
                        // Проверяем, что поле calendar_id уже добавлено
                        $colCheck = $pdo->query("SHOW COLUMNS FROM tasks LIKE 'calendar_id'");
                        if ($colCheck->rowCount() > 0) {
                            $updateTasks = $pdo->prepare("UPDATE tasks SET calendar_id = ? WHERE user_id = ? AND (calendar_id IS NULL OR calendar_id = 0)");
                            $updateTasks->execute([$calId, $userId]);
                        }
                    } catch (PDOException $e) {
                        error_log("Migration error updating tasks for user $userId: " . $e->getMessage());
                    }
                }
                
                // Теперь делаем поле NOT NULL и добавляем индексы и внешний ключ
                try {
                    $pdo->exec("ALTER TABLE tasks MODIFY COLUMN calendar_id INT NOT NULL");
                    // Проверяем, есть ли уже индекс
                    $indexCheck = $pdo->query("SHOW INDEXES FROM tasks WHERE Key_name = 'idx_calendar_date'");
                    if ($indexCheck->rowCount() == 0) {
                        $pdo->exec("ALTER TABLE tasks ADD INDEX idx_calendar_date (calendar_id, task_date)");
                    }
                    // Проверяем, есть ли уже внешний ключ
                    $fkCheck = $pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
                                           WHERE TABLE_SCHEMA = DATABASE() 
                                           AND TABLE_NAME = 'tasks' 
                                           AND COLUMN_NAME = 'calendar_id' 
                                           AND REFERENCED_TABLE_NAME IS NOT NULL");
                    if ($fkCheck->rowCount() == 0) {
                        $pdo->exec("ALTER TABLE tasks ADD FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE");
                    }
                } catch (PDOException $e) {
                    error_log("Migration error finalizing: " . $e->getMessage());
                }
            }
            
            // Миграция: добавляем поля task_time и task_time_end
            $timeCols = $pdo->query("SHOW COLUMNS FROM tasks LIKE 'task_time'");
            if ($timeCols->rowCount() == 0) {
                try {
                    $pdo->exec("ALTER TABLE tasks ADD COLUMN task_time TIME NULL AFTER task_text");
                    $pdo->exec("ALTER TABLE tasks ADD COLUMN task_time_end TIME NULL AFTER task_time");
                } catch (PDOException $e) {
                    error_log("Migration task_time error: " . $e->getMessage());
                }
            }
        } else {
            // Таблица не существует, создаем с нуля
            $sql = "CREATE TABLE tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                calendar_id INT NOT NULL,
                user_id BIGINT NOT NULL,
                task_date DATE NOT NULL,
                task_text TEXT NOT NULL,
                task_time TIME NULL,
                task_time_end TIME NULL,
                completed BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_calendar_date (calendar_id, task_date),
                INDEX idx_user_date (user_id, task_date),
                FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
            $pdo->exec($sql);
        }
        
        // Таблица настроек пользователей
        $sql = "CREATE TABLE IF NOT EXISTS user_settings (
            user_id BIGINT PRIMARY KEY,
            last_calendar_id INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (last_calendar_id) REFERENCES calendars(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
        $pdo->exec($sql);
        
    } catch (PDOException $e) {
        error_log("Database initialization error: " . $e->getMessage());
        // Не прерываем выполнение, чтобы не блокировать работу приложения
    }
}

// Инициализируем БД при подключении файла
initDatabase();
?>