

let tg = window.Telegram?.WebApp;
let userId = null;
let currentDate = new Date();
let selectedDate = formatDate(new Date());
let tasks = {};
let currentView = localStorage.getItem('calendarView') || 'calendar'; // 'calendar' или 'diary'
let currentWeekStart = new Date();
let currentCalendarId = null;
let calendars = [];
let currentCalendar = null;

// Переменные для режима редактирования задачи
let isEditingTask = false;
let editingTaskId = null;

// Инициализация приложения
if (tg) {
    tg.ready();
    tg.expand();
    if (tg.enableClosingConfirmation) {
        tg.enableClosingConfirmation();
    }
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

// Аутентификация пользователя
async function authenticate() {
    try {
        const initData = tg.initData;
        console.log("Init data from Telegram:", initData ? "Present" : "Missing");
        
        if (!initData) {
            console.warn("No initData from Telegram, using test mode");
            const userInfoEl = document.getElementById('user-info');
            if (userInfoEl) {
                userInfoEl.textContent = "Тестовый режим";
            }
            userId = 12345;
            await loadCalendars();
            await loadLastCalendar();
            return;
        }
        
        const response = await fetch('/api/auth.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                initData: initData
            })
        });
        
        console.log("Response status:", response.status);
        console.log("Response ok:", response.ok);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Response error text:", errorText);
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: errorText || `HTTP ${response.status}` };
            }
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Auth response:", data);
        
        if (data.status === 'success') {
            userId = data.user_id;
            const userInfoEl = document.getElementById('user-info');
            if (userInfoEl) {
                userInfoEl.textContent = `Привет, ${data.first_name}!`;
            }
            await loadCalendars();
            await loadLastCalendar();
        } else {
            const errorMsg = data.error || 'Неизвестная ошибка';
            console.error("Auth failed:", errorMsg);
            showMessage('Ошибка аутентификации: ' + errorMsg);
        }
    } catch (error) {
        console.error('Auth error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        const errorMsg = error.message || 'Неизвестная ошибка';
        showMessage('Ошибка соединения с сервером: ' + errorMsg);
    }
}

// Универсальная функция для показа сообщений
function showMessage(message) {
    if (tg && tg.showAlert) {
        try {
            tg.showAlert(message);
        } catch (e) {
            console.warn("showAlert failed:", e);
            alert(message);
        }
    } else {
        alert(message);
    }
}

// Загрузка списка календарей
async function loadCalendars() {
    if (!userId) return;
    
    try {
        const response = await fetch(`/api/get_calendars.php?user_id=${userId}`);
        const data = await response.json();
        
        calendars = data.calendars || [];
        renderCalendarSelect();
    } catch (error) {
        console.error('Load calendars error:', error);
    }
}

// Загрузка последнего открытого календаря
async function loadLastCalendar() {
    if (!userId) return;
    
    try {
        const response = await fetch(`/api/get_last_calendar.php?user_id=${userId}`);
        const data = await response.json();
        
        if (data.calendar_id) {
            currentCalendarId = data.calendar_id;
            currentCalendar = calendars.find(c => c.id === currentCalendarId);
            if (currentCalendar) {
                document.getElementById('calendarSelect').value = currentCalendarId;
                updateHeaderButtons();
                await loadTasks();
            }
        } else if (calendars.length > 0) {
            // Если нет сохраненного, выбираем первый календарь
            currentCalendarId = calendars[0].id;
            currentCalendar = calendars[0];
            document.getElementById('calendarSelect').value = currentCalendarId;
            updateHeaderButtons();
            await loadTasks();
        }
    } catch (error) {
        console.error('Load last calendar error:', error);
    }
}

// Рендер селектора календарей
function renderCalendarSelect() {
    const select = document.getElementById('calendarSelect');
    select.innerHTML = '';
    
    calendars.forEach(cal => {
        const option = document.createElement('option');
        option.value = cal.id;
        option.textContent = cal.name + (cal.is_default ? ' (по умолчанию)' : '');
        select.appendChild(option);
    });
    
    if (currentCalendarId) {
        select.value = currentCalendarId;
    }
}

// Обновление видимости кнопок в шапке
function updateHeaderButtons() {
    const manageBtn = document.getElementById('manageCalendarBtn');
    const leaveBtn = document.getElementById('leaveCalendarBtn');
    if (manageBtn) manageBtn.style.display = currentCalendar?.is_owner ? '' : 'none';
    if (leaveBtn) leaveBtn.style.display = currentCalendar && !currentCalendar.is_owner ? '' : 'none';
}

// Переключение календаря
async function switchCalendar(calendarId) {
    if (!userId || !calendarId) return;
    
    currentCalendarId = calendarId;
    currentCalendar = calendars.find(c => c.id === calendarId);
    updateHeaderButtons();
    
    // Сохраняем последний открытый календарь
    try {
        await fetch('/api/set_last_calendar.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                calendar_id: calendarId
            })
        });
    } catch (error) {
        console.error('Set last calendar error:', error);
    }
    
    await loadTasks();
}

// Загрузка задач
async function loadTasks() {
    if (!userId || !currentCalendarId) return;
    
    try {
        const response = await fetch(`/api/get_tasks.php?user_id=${userId}&calendar_id=${currentCalendarId}`);
        const data = await response.json();
        
        tasks = {};
        data.tasks.forEach(task => {
            if (!tasks[task.date]) {
                tasks[task.date] = [];
            }
            tasks[task.date].push(task);
        });
        
        if (currentView === 'calendar') {
            renderCalendar();
        } else {
            renderDiary();
        }
        renderTasks(selectedDate);
        updateStats(); // Добавили вызов статистики
    } catch (error) {
        console.error('Load tasks error:', error);
    }
}

// Создание новой задачи
async function createTask(text, taskTime = null, taskTimeEnd = null) {
    if (!userId || !text.trim() || !currentCalendarId) return;
    
    try {
        const body = {
            user_id: userId,
            calendar_id: currentCalendarId,
            text: text,
            date: selectedDate
        };
        if (taskTime) body.task_time = taskTime;
        if (taskTimeEnd) body.task_time_end = taskTimeEnd;
        
        const response = await fetch('/api/add_task.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            if (!tasks[selectedDate]) {
                tasks[selectedDate] = [];
            }
            
            tasks[selectedDate].push({
                id: data.task_id,
                text: text,
                task_time: taskTime,
                task_time_end: taskTimeEnd,
                completed: false,
                date: selectedDate
            });
            
            if (currentView === 'calendar') {
                renderCalendar();
            } else {
                renderDiary();
            }
            renderTasks(selectedDate);
            updateStats(); // Добавили вызов статистики
        }
    } catch (error) {
        console.error('Create task error:', error);
        showMessage('Ошибка при создании задачи');
    }
}

// Обновление статуса задачи (чекбокс)
async function updateTaskStatus(taskId, completed) {
    if (!userId) return;
    
    try {
        const response = await fetch('/api/update_task.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: userId,
                task_id: taskId, 
                completed 
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: errorText || `HTTP ${response.status}` };
            }
            console.error('Update task error:', errorData);
            showMessage('Ошибка при обновлении задачи: ' + (errorData.error || 'Неизвестная ошибка'));
            // Перезагружаем задачи для синхронизации состояния
            await loadTasks();
            throw new Error(errorData.error || 'Update failed');
        }
        
        const data = await response.json();
        if (data.status === 'success') {
            // Обновляем локальные данные
            for (let date in tasks) {
                tasks[date] = tasks[date].map(task => 
                    task.id === taskId ? { ...task, completed } : task
                );
            }
            renderTasks(selectedDate);
            updateStats();
        }
    } catch (error) {
        console.error('Update task error:', error);
        showMessage('Ошибка соединения с сервером');
        // Откатываем изменение чекбокса
        await loadTasks();
        throw error;
    }
}

// Обновление текста задачи
async function updateTaskText(taskId, newText) {
    if (!userId || !newText || !newText.trim()) return;
    
    try {
        const response = await fetch('/api/update_task.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: userId,
                task_id: taskId, 
                text: newText.trim()
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { error: errorText || `HTTP ${response.status}` };
            }
            console.error('Update task text error:', errorData);
            showMessage('Ошибка при обновлении задачи: ' + (errorData.error || 'Неизвестная ошибка'));
            await loadTasks();
            throw new Error(errorData.error || 'Update text failed');
        }
        
        const data = await response.json();
        if (data.status === 'success') {
            // Обновляем локальные данные
            for (let date in tasks) {
                tasks[date] = tasks[date].map(task => 
                    task.id === taskId ? { ...task, text: newText.trim() } : task
                );
            }
            renderTasks(selectedDate);
            updateStats();
        }
    } catch (error) {
        console.error('Update task text error:', error);
        showMessage('Ошибка соединения с сервером');
        await loadTasks();
        throw error;
    }
}

// Обновление задачи
async function updateTask(taskId, text, taskTime = null, taskTimeEnd = null) {
    if (!userId || !text.trim()) return;
    
    try {
        const body = {
            user_id: userId,
            task_id: taskId,
            text: text.trim()
        };
        if (taskTime !== null) body.task_time = taskTime;
        if (taskTimeEnd !== null) body.task_time_end = taskTimeEnd;
        
        const response = await fetch('/api/update_task.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
            // Обновляем локальные данные
            for (let date in tasks) {
                tasks[date] = tasks[date].map(task => 
                    task.id === taskId ? { ...task, text: text.trim(), task_time: taskTime, task_time_end: taskTimeEnd } : task
                );
            }
            
            if (currentView === 'calendar') {
                renderCalendar();
            } else {
                renderDiary();
            }
            renderTasks(selectedDate);
            updateStats();
        } else {
            showMessage('Ошибка при обновлении задачи');
        }
    } catch (error) {
        console.error('Update task error:', error);
        showMessage('Ошибка соединения с сервером');
    }
}

// Удаление задачи
async function deleteTask(taskId) {
    if (!userId) return;
    
    try {
        const response = await fetch('/api/delete_task.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: userId,
                task_id: taskId 
            })
        });
        
        if (response.ok) {
            for (let date in tasks) {
                tasks[date] = tasks[date].filter(task => task.id !== taskId);
                if (tasks[date].length === 0) {
                    delete tasks[date];
                }
            }
            if (currentView === 'calendar') {
                renderCalendar();
            } else {
                renderDiary();
            }
            renderTasks(selectedDate);
            updateStats(); // Добавили вызов статистики
        }
    } catch (error) {
        console.error('Delete task error:', error);
    }
}

// Рендер календаря
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthYear = document.getElementById('currentMonthYear');
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthYear.textContent = new Date(year, month).toLocaleString('ru', { 
        month: 'long', 
        year: 'numeric' 
    });
    
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    grid.innerHTML = '';
    
    for (let i = 0; i < startDay; i++) {
        grid.innerHTML += '<div class="calendar-day empty"></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(new Date(year, month, day));
        const hasTasks = tasks[dateStr] && tasks[dateStr].length > 0;
        const isSelected = dateStr === selectedDate;
        
        grid.innerHTML += `
            <div class="calendar-day ${hasTasks ? 'has-tasks' : ''} ${isSelected ? 'selected' : ''}" 
                 data-date="${dateStr}">
                ${day}
            </div>
        `;
    }
    
    document.querySelectorAll('.calendar-day[data-date]').forEach(day => {
        day.addEventListener('click', () => {
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            day.classList.add('selected');
            selectedDate = day.dataset.date;
            renderTasks(selectedDate);
        });
    });
}

// Рендер задач
function renderTasks(date) {
    const tasksList = document.getElementById('tasksList');
    const selectedDateSpan = document.getElementById('selectedDate');
    
    selectedDateSpan.textContent = formatDisplayDate(date);
    
    const dateTasks = tasks[date] || [];
    
    if (dateTasks.length === 0) {
        tasksList.innerHTML = '<p class="no-tasks">Нет задач на этот день</p>';
        return;
    }
    
    const formatTimeDisplay = (t) => {
        if (!t) return '';
        const [h, m] = String(t).split(':');
        return `${h}:${m || '00'}`;
    };
    
    const getTimeDisplay = (task) => {
        if (!task.task_time) return '';
        const start = formatTimeDisplay(task.task_time);
        const end = formatTimeDisplay(task.task_time_end);
        if (end && end !== start) {
            return `<div class="task-time-display">
                <span class="time-icon">⏰</span>
                <span class="time-range">${start} – ${end}</span>
            </div>`;
        }
        return `<div class="task-time-display">
            <span class="time-icon">⏰</span>
            <span class="time-single">${start}</span>
        </div>`;
    };
    
    tasksList.innerHTML = dateTasks
        .sort((a, b) => {
            // Сначала невыполненные задачи, потом выполненные
            if (a.completed !== b.completed) return a.completed - b.completed;
            
            // Задачи с временем идут первыми, сортируются по времени
            const aHasTime = !!a.task_time;
            const bHasTime = !!b.task_time;
            
            if (aHasTime && !bHasTime) return -1;
            if (!aHasTime && bHasTime) return 1;
            
            // Если обе имеют время, сортируем по времени
            if (aHasTime && bHasTime) {
                return a.task_time.localeCompare(b.task_time);
            }
            
            // Если обе без времени, сортируем по ID (порядку создания)
            return a.id - b.id;
        })
        .map(task => {
            // Проверяем права на редактирование (только для владельца календаря или пользователей с правами редактирования)
            const canEditText = currentCalendar && (currentCalendar.is_owner || currentCalendar.can_edit);
            const timeDisplay = getTimeDisplay(task);
            
            return `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="task-content">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                    <div class="task-main">
                        <span class="task-text ${task.completed ? 'completed-text' : ''}" data-task-id="${task.id}">${escapeHtml(task.text)}</span>
                        ${timeDisplay}
                    </div>
                    <input type="text" class="task-edit-input" value="${escapeHtml(task.text)}" style="display: none;" data-task-id="${task.id}">
                </div>
                <div class="task-actions">
                    <button class="task-menu-btn" title="Меню">⋮</button>
                    <div class="task-menu" style="display: none;">
                        ${canEditText ? '<button class="menu-item edit-task" title="Редактировать"><span class="menu-icon">✏️</span> Изменить</button>' : ''}
                        <button class="menu-item delete-task" title="Удалить"><span class="menu-icon">🗑️</span> Удалить</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    
    document.querySelectorAll('.task-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const taskItem = e.target.closest('.task-item');
            const taskId = parseInt(taskItem.dataset.taskId);
            const textSpan = taskItem.querySelector('.task-text');
            const isChecked = e.target.checked;
            const previousState = !isChecked; // Сохраняем предыдущее состояние
            
            console.log('Checkbox changed:', { taskId, isChecked });
            
            // Визуально обновляем сразу
            if (isChecked) {
                textSpan.classList.add('completed-text');
                taskItem.classList.add('completed');
            } else {
                textSpan.classList.remove('completed-text');
                taskItem.classList.remove('completed');
            }
            
            // Обновляем на сервере
            try {
                await updateTaskStatus(taskId, isChecked);
            } catch (error) {
                // При ошибке откатываем чекбокс
                console.error('Failed to update task status:', error);
                e.target.checked = previousState;
                if (previousState) {
                    textSpan.classList.add('completed-text');
                    taskItem.classList.add('completed');
                } else {
                    textSpan.classList.remove('completed-text');
                    taskItem.classList.remove('completed');
                }
            }
        });
    });
    
    // Обработчики для кнопок меню
    document.querySelectorAll('.task-menu-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const taskItem = e.target.closest('.task-item');
            const menu = taskItem.querySelector('.task-menu');
            
            // Закрываем все другие меню
            document.querySelectorAll('.task-menu').forEach(m => {
                if (m !== menu) m.style.display = 'none';
            });
            
            // Переключаем текущее меню
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });
    });
    
    // Закрываем меню при клике вне его
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.task-actions')) {
            document.querySelectorAll('.task-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        }
    });
    
    // Обработчики элементов меню
    document.querySelectorAll('.menu-item.edit-task').forEach(button => {
        button.addEventListener('click', (e) => {
            const taskItem = e.target.closest('.task-item');
            const taskId = parseInt(taskItem.dataset.taskId);
            const menu = taskItem.querySelector('.task-menu');
            
            // Закрываем меню
            menu.style.display = 'none';
            
            // Открываем модальное окно в режиме редактирования
            openEditTaskModal(taskId);
        });
    });
    
    document.querySelectorAll('.menu-item.delete-task').forEach(button => {
        button.addEventListener('click', (e) => {
            const taskItem = e.target.closest('.task-item');
            const taskId = taskItem.dataset.taskId;
            const menu = taskItem.querySelector('.task-menu');
            
            // Закрываем меню
            menu.style.display = 'none';
            
            if (confirm('Удалить задачу?')) {
                deleteTask(parseInt(taskId));
            }
        });
    });
    
    // Сохранение при нажатии Enter в поле редактирования
    document.querySelectorAll('.task-edit-input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const taskItem = e.target.closest('.task-item');
                const taskId = parseInt(taskItem.dataset.taskId);
                const textSpan = taskItem.querySelector('.task-text');
                const newText = e.target.value.trim();
                
                if (newText && newText !== textSpan.textContent) {
                    updateTaskText(taskId, newText);
                }
                
                textSpan.style.display = '';
                e.target.style.display = 'none';
            } else if (e.key === 'Escape') {
                // Отмена редактирования
                const taskItem = e.target.closest('.task-item');
                const textSpan = taskItem.querySelector('.task-text');
                e.target.value = textSpan.textContent; // Восстанавливаем исходный текст
                textSpan.style.display = '';
                e.target.style.display = 'none';
            }
        });
        
        // Отмена редактирования при потере фокуса (если не было изменений)
        input.addEventListener('blur', (e) => {
            // Небольшая задержка, чтобы не конфликтовать с кликом по кнопке сохранения
            setTimeout(() => {
                const taskItem = e.target.closest('.task-item');
                if (taskItem) {
                    const textSpan = taskItem.querySelector('.task-text');
                    if (e.target.style.display !== 'none') {
                        e.target.value = textSpan.textContent;
                        textSpan.style.display = '';
                        e.target.style.display = 'none';
                    }
                }
            }, 200);
        });
    });
}

// Защита от XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Добавим вспомогательную функцию для определения типа дня
function getDayType(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [year, month, day] = dateStr.split('-').map(Number);
    const checkDate = new Date(year, month - 1, day);
    checkDate.setHours(0, 0, 0, 0);
    
    if (checkDate < today) {
        return 'past'; // Прошедший день
    } else if (checkDate.getTime() === today.getTime()) {
        return 'current'; // Сегодня
    } else {
        return 'future'; // Будущий день
    }
}

// Функция для получения начала недели (понедельник)
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
    return new Date(d.setDate(diff));
}

// Функция для получения всех дней недели
function getWeekDays(weekStart) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        days.push(date);
    }
    return days;
}

// Рендер вида дневника
function renderDiary() {
    const diaryDays = document.getElementById('diaryDays');
    const currentWeek = document.getElementById('currentWeek');
    
    const weekStart = getWeekStart(currentWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    
    currentWeek.textContent = `${weekStart.getDate()}.${weekStart.getMonth() + 1} - ${weekEnd.getDate()}.${weekEnd.getMonth() + 1}.${weekEnd.getFullYear()}`;
    
    const weekDays = getWeekDays(weekStart);
    const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    
    diaryDays.innerHTML = '';
    
    weekDays.forEach((day, index) => {
        const dateStr = formatDate(day);
        const dayType = getDayType(dateStr);
        const hasTasks = tasks[dateStr] && tasks[dateStr].length > 0;
        const taskCount = hasTasks ? tasks[dateStr].length : 0;
        const isSelected = dateStr === selectedDate;
        
        const dayElement = document.createElement('div');
        dayElement.className = `diary-day ${dayType} ${isSelected ? 'selected' : ''}`;
        dayElement.dataset.date = dateStr;
        
        dayElement.innerHTML = `
            <div class="diary-day-info">
                <div class="diary-day-name">${dayNames[index]}</div>
                <div class="diary-day-date">${formatDisplayDate(dateStr)}</div>
            </div>
            <div class="diary-day-tasks">
                ${taskCount > 0 ? `<span class="diary-day-tasks-count">${taskCount}</span>` : ''}
            </div>
        `;
        
        dayElement.addEventListener('click', () => {
            document.querySelectorAll('.diary-day').forEach(d => d.classList.remove('selected'));
            dayElement.classList.add('selected');
            selectedDate = dateStr;
            renderTasks(selectedDate);
        });
        
        diaryDays.appendChild(dayElement);
    });
}

// Переключение вида
function toggleView() {
    const calendarView = document.getElementById('calendarView');
    const diaryView = document.getElementById('diaryView');
    const toggleBtn = document.getElementById('viewToggleBtn');
    
    if (currentView === 'calendar') {
        currentView = 'diary';
        calendarView.classList.add('hidden');
        diaryView.style.display = 'block';
        toggleBtn.textContent = '📋';
        // Синхронизируем неделю с текущей датой
        currentWeekStart = new Date(currentDate);
        renderDiary();
    } else {
        currentView = 'calendar';
        calendarView.classList.remove('hidden');
        diaryView.style.display = 'none';
        toggleBtn.textContent = '📅';
        // Синхронизируем дату с текущей неделей
        currentDate = new Date(currentWeekStart);
        renderCalendar();
    }
    
    localStorage.setItem('calendarView', currentView);
}

// Обновим функцию renderCalendar
function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthYear = document.getElementById('currentMonthYear');
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthYear.textContent = new Date(year, month).toLocaleString('ru', { 
        month: 'long', 
        year: 'numeric' 
    });
    
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    grid.innerHTML = '';
    
    // Пустые ячейки до начала месяца
    for (let i = 0; i < startDay; i++) {
        grid.innerHTML += '<div class="calendar-day empty"></div>';
    }
    
    // Ячейки дней месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(new Date(year, month, day));
        const dayType = getDayType(dateStr);
        const hasTasks = tasks[dateStr] && tasks[dateStr].length > 0;
        const isSelected = dateStr === selectedDate;
        
        // Собираем классы для дня
        let dayClasses = ['calendar-day', dayType];
        if (hasTasks) dayClasses.push('has-tasks');
        if (isSelected) dayClasses.push('selected');
        
        grid.innerHTML += `
            <div class="${dayClasses.join(' ')}" 
                 data-date="${dateStr}"
                 data-day-type="${dayType}">
                ${day}
                ${dayType === 'current' ? '<span class="today-label"></span>' : ''}
            </div>
        `;
    }
    
    // Добавляем обработчики кликов
    document.querySelectorAll('.calendar-day[data-date]').forEach(day => {
        day.addEventListener('click', () => {
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            day.classList.add('selected');
            selectedDate = day.dataset.date;
            renderTasks(selectedDate);
        });
    });
    
    // Обновим статистику
    updateStats();
}

// Добавим функцию для отображения статистики
function updateStats() {
    const tasksList = document.getElementById('tasksList');
    
    // Создаем или обновляем блок статистики
    let statsDiv = document.querySelector('.tasks-stats');
    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.className = 'tasks-stats';
        tasksList.parentNode.insertBefore(statsDiv, tasksList.nextSibling);
    }
    
    // Считаем статистику
    const today = formatDate(new Date());
    const todayTasks = tasks[today] || [];
    const completedToday = todayTasks.filter(t => t.completed).length;
    
    const totalTasks = Object.values(tasks).flat().length;
    const completedTasks = Object.values(tasks).flat().filter(t => t.completed).length;
    
    statsDiv.innerHTML = `
        📊 Статистика: 
        Всего задач: ${totalTasks} | 
        Выполнено: ${completedTasks} |
        ${completedToday > 0 ? `Сегодня выполнено: ${completedToday} ✅` : ''}
    `;
}

// Обработчики событий
document.addEventListener('DOMContentLoaded', () => {
    authenticate();
    
    // Инициализация вида при загрузке
    const calendarView = document.getElementById('calendarView');
    const diaryView = document.getElementById('diaryView');
    const toggleBtn = document.getElementById('viewToggleBtn');
    
    // Инициализируем начальную неделю
    currentWeekStart = getWeekStart(new Date());
    
    if (currentView === 'diary') {
        calendarView.classList.add('hidden');
        diaryView.style.display = 'block';
        toggleBtn.textContent = '📋';
    } else {
        calendarView.classList.remove('hidden');
        diaryView.style.display = 'none';
        toggleBtn.textContent = '📅';
    }
    
    // Переключение вида
    toggleBtn.addEventListener('click', toggleView);
    
    // Навигация по месяцам (для вида календаря)
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        if (currentView === 'calendar') {
            renderCalendar();
        }
    });
    
    document.getElementById('nextMonth').addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        if (currentView === 'calendar') {
            renderCalendar();
        }
    });
    
    // Навигация по неделям (для вида дневника)
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        if (currentView === 'diary') {
            renderDiary();
        }
    });
    
    document.getElementById('nextWeek').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        if (currentView === 'diary') {
            renderDiary();
        }
    });
    
    const modal = document.getElementById('taskModal');
    const addBtn = document.getElementById('addTaskBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const saveBtn = document.getElementById('saveTaskBtn');
    const taskInput = document.getElementById('taskInput');
    
    const taskHasTime = document.getElementById('taskHasTime');
    const taskTimeGroup = document.getElementById('taskTimeGroup');
    const taskTimeStart = document.getElementById('taskTimeStart');
    const taskIsPeriod = document.getElementById('taskIsPeriod');
    const taskTimeEndGroup = document.getElementById('taskTimeEndGroup');
    
    taskHasTime.addEventListener('change', () => {
        taskTimeGroup.style.display = taskHasTime.checked ? 'block' : 'none';
        if (!taskHasTime.checked) {
            taskIsPeriod.checked = false;
            taskTimeEndGroup.style.display = 'none';
        }
    });
    
    taskIsPeriod.addEventListener('change', () => {
        taskTimeEndGroup.style.display = taskIsPeriod.checked ? 'block' : 'none';
    });
    
    addBtn.addEventListener('click', () => {
        if (!currentCalendar) {
            showMessage('Выберите календарь');
            return;
        }
        if (!currentCalendar.can_edit) {
            showMessage('У вас нет прав на добавление задач');
            return;
        }
        
        // Сбрасываем режим редактирования
        isEditingTask = false;
        editingTaskId = null;
        
        const modalTitle = document.getElementById('taskModal').querySelector('h3');
        const saveBtn = document.getElementById('saveTaskBtn');
        
        // Возвращаем стандартный заголовок и кнопку
        modalTitle.textContent = '✨ Новая задача';
        saveBtn.textContent = '✅ Создать';
        
        taskInput.value = '';
        taskHasTime.checked = false;
        taskTimeGroup.style.display = 'none';
        taskIsPeriod.checked = false;
        taskTimeStart.value = '';
        taskTimeEndGroup.style.display = 'none';
        modal.classList.add('show');
    });
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        // Сбрасываем режим редактирования
        isEditingTask = false;
        editingTaskId = null;
    });
    
    saveBtn.addEventListener('click', async () => {
        const text = taskInput.value.trim();
        if (!text) return;
        
        let taskTime = null, taskTimeEndVal = null;
        if (taskHasTime.checked && taskTimeStart.value) {
            taskTime = taskTimeStart.value;
            if (taskIsPeriod.checked && document.getElementById('taskTimeEnd').value) {
                taskTimeEndVal = document.getElementById('taskTimeEnd').value;
            }
        }
        
        if (isEditingTask && editingTaskId) {
            // Режим редактирования
            await updateTask(editingTaskId, text, taskTime, taskTimeEndVal);
        } else {
            // Режим создания
            await createTask(text, taskTime, taskTimeEndVal);
        }
        
        modal.classList.remove('show');
        // Сбрасываем режим редактирования
        isEditingTask = false;
        editingTaskId = null;
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            // Сбрасываем режим редактирования
            isEditingTask = false;
            editingTaskId = null;
        }
    });
    
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveBtn.click();
        }
    });

    // Обработчики для управления календарями
    const calendarSelect = document.getElementById('calendarSelect');
    calendarSelect.addEventListener('change', async (e) => {
        await switchCalendar(parseInt(e.target.value));
    });

    // Кнопка управления календарем
    document.getElementById('manageCalendarBtn').addEventListener('click', () => {
        if (!currentCalendar) return;
        openManageCalendarModal();
    });

    // Кнопка выхода из чужого календаря
    document.getElementById('leaveCalendarBtn').addEventListener('click', async () => {
        if (!currentCalendar || currentCalendar.is_owner) return;
        if (!confirm('Выйти из календаря «' + currentCalendar.name + '»?')) return;
        try {
            const response = await fetch('/api/leave_calendar.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendar_id: currentCalendarId,
                    user_id: userId
                })
            });
            const data = await response.json();
            if (data.status === 'success') {
                await loadCalendars();
                if (calendars.length > 0) await switchCalendar(calendars[0].id);
                showMessage('Вы вышли из календаря');
            } else {
                showMessage(data.error || 'Ошибка');
            }
        } catch (error) {
            console.error('Leave calendar error:', error);
            showMessage('Ошибка соединения с сервером');
        }
    });

    // Обработчики модального окна управления календарем
    setupManageCalendarModal();
    setupCreateCalendarModal();
    setupInviteModal();
});

// Функция для открытия модального окна редактирования задачи
function openEditTaskModal(taskId) {
    const task = findTaskById(taskId);
    if (!task) return;
    
    isEditingTask = true;
    editingTaskId = taskId;
    
    const modal = document.getElementById('taskModal');
    const modalTitle = document.getElementById('taskModal').querySelector('h3');
    const saveBtn = document.getElementById('saveTaskBtn');
    const taskInput = document.getElementById('taskInput');
    const taskHasTime = document.getElementById('taskHasTime');
    const taskTimeGroup = document.getElementById('taskTimeGroup');
    const taskTimeStart = document.getElementById('taskTimeStart');
    const taskIsPeriod = document.getElementById('taskIsPeriod');
    const taskTimeEndGroup = document.getElementById('taskTimeEndGroup');
    
    // Меняем заголовок и кнопку
    modalTitle.textContent = '✏️ Изменить задачу';
    saveBtn.textContent = '💾 Сохранить изменения';
    
    // Заполняем поля текущими значениями
    taskInput.value = task.text;
    
    if (task.task_time) {
        taskHasTime.checked = true;
        taskTimeGroup.style.display = 'block';
        taskTimeStart.value = task.task_time;
        
        if (task.task_time_end) {
            taskIsPeriod.checked = true;
            taskTimeEndGroup.style.display = 'block';
            document.getElementById('taskTimeEnd').value = task.task_time_end;
        } else {
            taskIsPeriod.checked = false;
            taskTimeEndGroup.style.display = 'none';
        }
    } else {
        taskHasTime.checked = false;
        taskTimeGroup.style.display = 'none';
        taskIsPeriod.checked = false;
        taskTimeStart.value = '';
        taskTimeEndGroup.style.display = 'none';
    }
    
    modal.classList.add('show');
}

// Функция для поиска задачи по ID
function findTaskById(taskId) {
    for (let date in tasks) {
        const task = tasks[date].find(t => t.id === taskId);
        if (task) return task;
    }
    return null;
}

// Функции для управления календарями
async function openManageCalendarModal() {
    if (!currentCalendar || !currentCalendar.is_owner) {
        showMessage('Только владелец может управлять календарем');
        return;
    }

    const modal = document.getElementById('manageCalendarModal');
    document.getElementById('calendarNameInput').value = currentCalendar.name;
    document.getElementById('manageCalendarTitle').textContent = `Управление: ${currentCalendar.name}`;
    
    // Скрываем вкладки "Участники" и "Приглашения" для дефолтного календаря
    const membersTab = document.querySelector('.tab-btn[data-tab="members"]');
    const invitesTab = document.querySelector('.tab-btn[data-tab="invites"]');
    
    if (currentCalendar.is_default) {
        if (membersTab) membersTab.style.display = 'none';
        if (invitesTab) invitesTab.style.display = 'none';
        document.getElementById('deleteCalendarGroup').style.display = 'none';
    } else {
        if (membersTab) membersTab.style.display = '';
        if (invitesTab) invitesTab.style.display = '';
        document.getElementById('deleteCalendarGroup').style.display = 'block';
    }
    
    // Активируем первую вкладку
    switchTab('settings');
    
    // Загружаем участников и приглашения только для не-дефолтных календарей
    if (!currentCalendar.is_default) {
        await loadMembers();
        await loadInvites();
    }
    
    modal.classList.add('show');
}

function setupManageCalendarModal() {
    const modal = document.getElementById('manageCalendarModal');
    const closeBtn = document.getElementById('closeManageModalBtn');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // Переключение вкладок
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

    // Обновление названия календаря
    document.getElementById('updateCalendarNameBtn').addEventListener('click', async () => {
        const newName = document.getElementById('calendarNameInput').value.trim();
        if (!newName) return;
        
        try {
            const response = await fetch('/api/update_calendar.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendar_id: currentCalendarId,
                    user_id: userId,
                    name: newName
                })
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                await loadCalendars();
                currentCalendar.name = newName;
                renderCalendarSelect();
                showMessage('Название обновлено');
            }
        } catch (error) {
            console.error('Update calendar error:', error);
            showMessage('Ошибка при обновлении названия');
        }
    });

    // Создание нового календаря
    document.getElementById('createCalendarBtn').addEventListener('click', () => {
        document.getElementById('manageCalendarModal').classList.remove('show');
        document.getElementById('createCalendarModal').classList.add('show');
    });

    // Удаление календаря
    document.getElementById('deleteCalendarBtn').addEventListener('click', async () => {
        if (!currentCalendar || currentCalendar.is_default) return;
        if (!confirm('Удалить календарь? Все задачи будут удалены.')) return;
        
        try {
            const response = await fetch('/api/delete_calendar.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendar_id: currentCalendarId,
                    user_id: userId
                })
            });
            const data = await response.json();
            if (data.status === 'success') {
                document.getElementById('manageCalendarModal').classList.remove('show');
                await loadCalendars();
                if (calendars.length > 0) {
                    await switchCalendar(calendars[0].id);
                }
                showMessage('Календарь удалён');
            } else {
                showMessage(data.error || 'Ошибка при удалении');
            }
        } catch (error) {
            console.error('Delete calendar error:', error);
            showMessage('Ошибка соединения с сервером');
        }
    });

        // Загрузка настроек уведомлений при открытии модального окна
        async function loadNotificationSettings() {
            if (!currentCalendarId || !userId) return;
            try {
                const response = await fetch(`/api/get_notification_settings.php?calendar_id=${currentCalendarId}&user_id=${userId}`);
                const data = await response.json();
                document.getElementById('notifyDayBefore').checked = !!data.day_before;
                document.getElementById('notifyHourBefore').checked = !!data.hour_before;
                document.getElementById('notify10MinBefore').checked = !!data.ten_min_before;
            } catch (error) {
                console.error('Load notification settings error:', error);
            }
        }

        // Сохранение настроек уведомлений
        document.getElementById('saveNotificationSettingsBtn').addEventListener('click', async () => {
            if (!currentCalendarId || !userId) return;
            const dayBefore = document.getElementById('notifyDayBefore').checked ? 1 : 0;
            const hourBefore = document.getElementById('notifyHourBefore').checked ? 1 : 0;
            const tenMinBefore = document.getElementById('notify10MinBefore').checked ? 1 : 0;
            try {
                const response = await fetch('/api/update_notification_settings.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        calendar_id: currentCalendarId,
                        user_id: userId,
                        day_before: dayBefore,
                        hour_before: hourBefore,
                        ten_min_before: tenMinBefore
                    })
                });
                const data = await response.json();
                if (data.status === 'success') {
                    showMessage('Настройки уведомлений сохранены');
                } else {
                    showMessage(data.error || 'Ошибка при сохранении уведомлений');
                }
            } catch (error) {
                console.error('Save notification settings error:', error);
                showMessage('Ошибка соединения с сервером');
            }
        });

        // При открытии модального окна управления календарем загружаем настройки уведомлений
        // Для совместимости с текущим кодом (classList.add('show'))
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const modal = mutation.target;
                    if (modal.classList.contains('show')) {
                        loadNotificationSettings();
                    }
                }
            });
        });
        observer.observe(document.getElementById('manageCalendarModal'), { attributes: true });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === `tab-${tabName}`) {
            content.classList.add('active');
        }
    });
}

async function loadMembers() {
    if (!currentCalendarId || !currentCalendar.is_owner) return;
    
    try {
        const response = await fetch(`/api/get_calendar_members.php?calendar_id=${currentCalendarId}&user_id=${userId}`);
        const data = await response.json();
        
        const membersList = document.getElementById('membersList');
        if (data.members && data.members.length > 0) {
            membersList.innerHTML = data.members.map(member => `
                <div class="member-item">
                    <div class="member-info">
                        <div class="member-name">${escapeHtml(member.first_name)} ${escapeHtml(member.last_name || '')}</div>
                        <div class="member-status">
                            ${member.can_edit ? '✏️ Может редактировать' : '👁️ Только просмотр'}
                            ${member.is_blocked ? ' | 🚫 Заблокирован' : ''}
                        </div>
                    </div>
                    <div class="member-actions">
                        <button class="btn-small ${member.can_edit ? 'btn-warning' : 'btn-success'}" 
                                onclick="toggleMemberEdit(${member.user_id}, ${!member.can_edit})">
                            ${member.can_edit ? 'Только просмотр' : 'Разрешить редактирование'}
                        </button>
                        <button class="btn-small ${member.is_blocked ? 'btn-success' : 'btn-danger'}" 
                                onclick="toggleMemberBlock(${member.user_id}, ${!member.is_blocked})">
                            ${member.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            membersList.innerHTML = '<p class="no-tasks">Нет участников</p>';
        }
    } catch (error) {
        console.error('Load members error:', error);
    }
}

async function toggleMemberEdit(memberUserId, canEdit) {
    try {
        const response = await fetch('/api/update_member_permissions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calendar_id: currentCalendarId,
                user_id: userId,
                member_user_id: memberUserId,
                can_edit: canEdit ? 1 : 0
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            await loadMembers();
        }
    } catch (error) {
        console.error('Toggle member edit error:', error);
    }
}

async function toggleMemberBlock(memberUserId, isBlocked) {
    try {
        const response = await fetch('/api/update_member_permissions.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calendar_id: currentCalendarId,
                user_id: userId,
                member_user_id: memberUserId,
                is_blocked: isBlocked ? 1 : 0
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            await loadMembers();
        }
    } catch (error) {
        console.error('Toggle member block error:', error);
    }
}

async function loadInvites() {
    if (!currentCalendarId || !currentCalendar.is_owner) return;
    
    try {
        const response = await fetch(`/api/get_invites.php?calendar_id=${currentCalendarId}&user_id=${userId}`);
        const data = await response.json();
        
        const invitesList = document.getElementById('invitesList');
        if (data.invites && data.invites.length > 0) {
            invitesList.innerHTML = data.invites.map(invite => `
                <div class="invite-item">
                    <div style="margin-bottom: 10px;">
                        <strong>Код:</strong>
                        <div class="invite-code-display">
                            <code>${invite.code}</code>
                            <button class="copy-btn" onclick="copyToClipboard('${invite.code}')">📋</button>
                        </div>
                        <small style="color: var(--hint-color);">Отправьте боту: <code>/join ${invite.code}</code></small>
                    </div>
                    ${invite.expires_at ? `<div style="font-size: 12px; color: var(--hint-color);">Истекает: ${new Date(invite.expires_at).toLocaleDateString('ru')}</div>` : ''}
                    <button class="btn-small btn-danger" onclick="deleteInvite(${invite.id})" style="margin-top: 10px;">Удалить</button>
                </div>
            `).join('');
        } else {
            invitesList.innerHTML = '<p class="no-tasks">Нет активных приглашений</p>';
        }
    } catch (error) {
        console.error('Load invites error:', error);
    }
}

async function deleteInvite(inviteId) {
    try {
        const response = await fetch('/api/delete_invite.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                invite_id: inviteId,
                user_id: userId
            })
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            await loadInvites();
        }
    } catch (error) {
        console.error('Delete invite error:', error);
    }
}

function setupCreateCalendarModal() {
    const modal = document.getElementById('createCalendarModal');
    const closeBtn = document.getElementById('closeCreateCalendarBtn');
    const saveBtn = document.getElementById('saveNewCalendarBtn');
    const nameInput = document.getElementById('newCalendarNameInput');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        nameInput.value = '';
    });
    
    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        
        try {
            const response = await fetch('/api/create_calendar.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    name: name
                })
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                await loadCalendars();
                await switchCalendar(data.calendar_id);
                modal.classList.remove('show');
                nameInput.value = '';
                showMessage('Календарь создан');
            }
        } catch (error) {
            console.error('Create calendar error:', error);
            showMessage('Ошибка при создании календаря');
        }
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            nameInput.value = '';
        }
    });
}

function setupInviteModal() {
    const modal = document.getElementById('inviteModal');
    const closeBtn = document.getElementById('closeInviteModalBtn');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // Кнопка создания приглашения
    document.getElementById('createInviteBtn').addEventListener('click', async () => {
        try {
            const response = await fetch('/api/create_invite.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendar_id: currentCalendarId,
                    user_id: userId
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { error: errorText || `HTTP ${response.status}` };
                }
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (data.status === 'success') {
                showInviteModal(data.invite);
                await loadInvites();
            } else {
                throw new Error(data.error || 'Неизвестная ошибка');
            }
        } catch (error) {
            console.error('Create invite error:', error);
            showMessage('Ошибка при создании приглашения: ' + (error.message || 'Неизвестная ошибка'));
        }
    });
}

function showInviteModal(invite) {
    document.getElementById('inviteCodeDisplay').textContent = invite.code;
    document.getElementById('inviteCodeText').textContent = invite.code;
    
    document.getElementById('inviteModal').classList.add('show');
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showMessage('Скопировано!');
    }).catch(err => {
        console.error('Copy error:', err);
        showMessage('Ошибка копирования');
    });
}

// Глобальные функции для вызова из HTML
window.toggleMemberEdit = toggleMemberEdit;
window.toggleMemberBlock = toggleMemberBlock;
window.deleteInvite = deleteInvite;
window.copyToClipboard = copyToClipboard;

if (tg && tg.MainButton) {
    tg.MainButton.setText('Добавить задачу');
    tg.MainButton.onClick(() => {
        const addBtn = document.getElementById('addTaskBtn');
        if (addBtn) {
            addBtn.click();
        }
    });
    tg.MainButton.show();
}