-- Таблица для связи пользователей Telegram с их chat_id
CREATE TABLE IF NOT EXISTS telegram_users (
    user_id INT PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица настроек уведомлений пользователей
CREATE TABLE IF NOT EXISTS user_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    notification_type ENUM('day_before', 'hour_before', '10_min_before') NOT NULL,
    enabled TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_notification (user_id, notification_type)
);

-- Таблица отправленных уведомлений (чтобы не дублировать)
CREATE TABLE IF NOT EXISTS sent_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    notification_type ENUM('day_before', 'hour_before', '10_min_before') NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_user_type (task_id, user_id, notification_type)
);

-- Пример вставки настроек по умолчанию для пользователя (запустить после регистрации)
-- INSERT INTO user_notifications (user_id, notification_type, enabled) VALUES
-- (USER_ID, 'day_before', 1),
-- (USER_ID, 'hour_before', 1),
-- (USER_ID, '10_min_before', 1);