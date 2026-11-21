const STORAGE_KEY = 'kanban-board.tasks.v1';
const columns = [
  { id: 'backlog', name: 'Бэклог' },
  { id: 'todo', name: 'К выполнению' },
  { id: 'working', name: 'В работе' },
  { id: 'done', name: 'Готово' },
];

const board = document.querySelector('#board');
const editor = document.querySelector('#editor');
const form = document.querySelector('#task-form');
const title = form.elements.namedItem('title');
const description = form.elements.namedItem('description');
const status = form.elements.namedItem('status');
const deleteButton = document.querySelector('#delete-task');
const newButton = document.querySelector('#new-task');
const notice = document.querySelector('#notice');

let tasks = [];
let editingId = null;
let draggedId = null;
let noticeTimer;

function announce(message, persistent = false) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  if (!persistent) {
    noticeTimer = setTimeout(() => { notice.textContent = ''; }, 3000);
  }
}

function readTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) return [];

  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed)) throw new Error('Invalid stored board');
  return parsed;
}

function refresh() {
  try {
    tasks = readTasks();
  } catch {
    announce('Не удалось загрузить карточки из браузера.', true);
  }
  render();
}

function updateTasks(update) {
  try {
    const next = update(readTasks());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    tasks = next;
  } catch {
    const message = 'Изменения не сохранились. Проверьте, доступно ли хранилище браузера.';
    if (editor.open) {
      document.querySelector('#editor-error').textContent = message;
    } else {
      announce(message, true);
    }
    return false;
  }
  return true;
}

function openEditor(columnId, task) {
  editingId = task?.id ?? null;
  document.querySelector('#editor-title').textContent = task ? 'Редактировать задачу' : 'Новая задача';
  document.querySelector('#editor-error').textContent = '';
  title.setCustomValidity('');
  title.value = task?.title ?? '';
  description.value = task?.description ?? '';
  status.value = columnId;
  deleteButton.hidden = !task;
  editor.showModal();
}

function createCard(task) {
  const item = document.createElement('li');
  item.className = 'task';
  item.draggable = true;
  const button = document.createElement('button');
  button.className = 'card-button';
  button.type = 'button';
  button.dataset.taskId = task.id;
  const name = document.createElement('strong');
  name.textContent = task.title;
  button.append(name);
  if (task.description) {
    const preview = document.createElement('span');
    preview.className = 'card-description';
    preview.textContent = task.description;
    button.append(preview);
  }
  button.addEventListener('click', () => openEditor(task.status, task));
  item.addEventListener('dragstart', (event) => {
    draggedId = task.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    item.classList.add('dragging');
  });
  item.addEventListener('dragend', () => {
    draggedId = null;
    item.classList.remove('dragging');
    board.querySelector('.drag-over')?.classList.remove('drag-over');
  });
  item.append(button);
  return item;
}

function createColumn(column) {
  const items = tasks.filter((task) => task.status === column.id);
  const section = document.createElement('section');
  section.className = 'column';
  section.dataset.status = column.id;
  section.setAttribute('aria-labelledby', `heading-${column.id}`);

  const heading = document.createElement('div');
  heading.className = 'column-heading';
  const name = document.createElement('h2');
  name.id = `heading-${column.id}`;
  name.textContent = column.name;
  const count = document.createElement('span');
  count.className = 'column-count';
  count.textContent = items.length;
  count.setAttribute('aria-label', `Задач: ${items.length}`);
  heading.append(name, count);

  const area = document.createElement('div');
  area.className = 'task-area';
  if (items.length) {
    const list = document.createElement('ul');
    list.className = 'tasks';
    list.append(...items.map(createCard));
    area.append(list);
  } else {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Пока пусто';
    area.append(empty);
  }

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'column-add';
  addButton.textContent = '+ Добавить задачу';
  addButton.setAttribute('aria-label', `Добавить задачу в «${column.name}»`);
  addButton.addEventListener('click', () => openEditor(column.id));
  section.append(heading, area, addButton);

  section.addEventListener('dragover', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    section.classList.add('drag-over');
  });
  section.addEventListener('dragleave', (event) => {
    if (!section.contains(event.relatedTarget)) section.classList.remove('drag-over');
  });
  section.addEventListener('drop', (event) => {
    if (!draggedId) return;
    event.preventDefault();
    section.classList.remove('drag-over');
    const id = draggedId;
    draggedId = null;
    const previous = tasks.find((task) => task.id === id);
    if (!previous || previous.status === column.id) return;
    if (updateTasks((saved) => saved.map((task) => (
      task.id === id ? { ...task, status: column.id } : task
    )))) {
      render();
      announce(`Задача перемещена в «${column.name}».`);
    }
  });

  return section;
}

function render() {
  board.replaceChildren(...columns.map(createColumn));
  const done = tasks.filter((task) => task.status === 'done').length;
  const percentage = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  document.querySelector('#percentage').textContent = `${percentage}%`;
  document.querySelector('#progress').value = percentage;
  document.querySelector('#progress-count').textContent = `Выполнено ${done} из ${tasks.length}`;
}

for (const column of columns) status.add(new Option(column.name, column.id));

newButton.addEventListener('click', () => openEditor('backlog'));
document.querySelector('#close-editor').addEventListener('click', () => editor.close());
title.addEventListener('input', () => title.setCustomValidity(''));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = title.value.trim();
  if (!name) {
    title.setCustomValidity('Введите название задачи.');
    title.reportValidity();
    return;
  }

  const id = editingId ?? crypto.randomUUID();
  const task = { id, title: name, description: description.value.trim(), status: status.value };
  const saved = updateTasks((previous) => (
    previous.some((item) => item.id === id)
      ? previous.map((item) => item.id === id ? task : item)
      : [...previous, task]
  ));

  if (!saved) return;
  editor.close();
  render();
  board.querySelector(`[data-task-id="${id}"]`)?.focus();
  announce('Задача сохранена.');
});

deleteButton.addEventListener('click', () => {
  if (!window.confirm('Удалить эту задачу?')) return;
  const columnId = tasks.find((task) => task.id === editingId)?.status;
  if (!updateTasks((previous) => previous.filter((task) => task.id !== editingId))) return;
  editor.close();
  render();
  (board.querySelector(`[data-status="${columnId}"] .column-add`) ?? newButton).focus();
  announce('Задача удалена.');
});

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) refresh();
});
refresh();
