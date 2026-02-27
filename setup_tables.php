<?php
require_once '../config/database.php';

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $sql = file_get_contents('../create_notification_tables.sql');
    
    $pdo->exec($sql);
    
    echo "Таблицы созданы успешно!";
} catch (PDOException $e) {
    echo "Ошибка: " . $e->getMessage();
}
?>