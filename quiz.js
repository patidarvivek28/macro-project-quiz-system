// public/app.js - Vanilla JavaScript Single-Page Application
// Manages Authentication, Dashboards, State Machine, Exam Timer, and Real-Time Analytics

(function () {
  'use strict';

  // State Management
  const state = {
    token: localStorage.getItem('assess_token') || null,
    user: JSON.parse(localStorage.getItem('assess_user') || 'null'),
    currentQuiz: null,
    currentAttempt: null,
    examTimerInterval: null,
    examRemainingSeconds: 0,
    examIsPaused: false,
    studentAnswers: new Map() // questionId -> selectedOption
  };

  // DOM Elements Cache
  const elements = {
    toastContainer: document.getElementById('toast-container'),
    confirmModal: document.getElementById('confirm-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalCloseBtn: document.getElementById('modal-close-btn'),

    // Nav & Theme
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    themeIcon: document.getElementById('theme-icon'),
    navLinks: document.getElementById('nav-links'),
    navDashboardBtn: document.getElementById('nav-dashboard-btn'),
    userProfile: document.getElementById('user-profile'),
    userRoleBadge: document.getElementById('user-role-badge'),
    userDisplayName: document.getElementById('user-display-name'),
    logoutBtn: document.getElementById('logout-btn'),

    // Views
    viewAuth: document.getElementById('view-auth'),
    viewTeacherDashboard: document.getElementById('view-teacher-dashboard'),
    viewTeacherEditor: document.getElementById('view-teacher-editor'),
    viewTeacherAnalytics: document.getElementById('view-teacher-analytics'),
    viewStudentDashboard: document.getElementById('view-student-dashboard'),
    viewStudentTaking: document.getElementById('view-student-taking'),
    viewStudentReview: document.getElementById('view-student-review'),

    // Auth Forms & Demo Buttons
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    tabLogin: document.getElementById('tab-login'),
    tabRegister: document.getElementById('tab-register'),
    demoTeacherBtn: document.getElementById('demo-teacher-btn'),
    demoStudentBtn: document.getElementById('demo-student-btn'),

    // Modals
    modalCreateQuiz: document.getElementById('modal-create-quiz'),
    createQuizForm: document.getElementById('create-quiz-form'),
    modalAutoGen: document.getElementById('modal-auto-gen'),
    autoGenForm: document.getElementById('auto-gen-form'),
    modalAddQuestion: document.getElementById('modal-add-question'),
    addQuestionForm: document.getElementById('add-question-form'),
    modalImportBank: document.getElementById('modal-import-bank'),
    importBankForm: document.getElementById('import-bank-form')
  };

  // ==========================================
  // 1. UTILITY FUNCTIONS & NOTIFICATIONS
  // ==========================================

  // Toast Notification System (No alert() used)
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span><strong>${icon}</strong></span> <span>${escapeHTML(message)}</span>`;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // HTML Entity Sanitizer to prevent XSS in dynamic rendering
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Confirmation Modal Dialog
  function showConfirm(title, message, onConfirm) {
    elements.modalTitle.textContent = title;
    elements.modalMessage.textContent = message;
    elements.confirmModal.classList.remove('hidden');

    const handleConfirm = () => {
      cleanup();
      onConfirm();
    };

    const cleanup = () => {
      elements.modalConfirmBtn.removeEventListener('click', handleConfirm);
      elements.modalCancelBtn.removeEventListener('click', cleanup);
      elements.modalCloseBtn.removeEventListener('click', cleanup);
      elements.confirmModal.classList.add('hidden');
    };

    elements.modalConfirmBtn.addEventListener('click', handleConfirm);
    elements.modalCancelBtn.addEventListener('click', cleanup);
    elements.modalCloseBtn.addEventListener('click', cleanup);
  }

  // Authenticated API Fetch Wrapper
  async function apiFetch(endpoint, options = {}) {
    const headers = options.headers || {};
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(endpoint, { ...options, headers });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        showToast('Your session has expired. Please sign in again.', 'error');
        logout();
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const errorMsg = data.error || `Request failed with status ${response.status}`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (err) {
      if (err.message !== 'Unauthorized') {
        showToast(err.message, 'error');
      }
      throw err;
    }
  }

  // Theme Initializer and Toggle
  function initTheme() {
    const savedTheme = localStorage.getItem('assess_theme') || 'light';
    if (savedTheme === 'dark') {
      document.body.classList.add('theme-dark');
      elements.themeIcon.textContent = '☀️';
    } else {
      document.body.classList.remove('theme-dark');
      elements.themeIcon.textContent = '🌙';
    }

    elements.themeToggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('theme-dark');
      localStorage.setItem('assess_theme', isDark ? 'dark' : 'light');
      elements.themeIcon.textContent = isDark ? '☀️' : '🌙';
    });
  }

  // View Switcher
  function showView(viewId) {
    const allViews = [
      elements.viewAuth,
      elements.viewTeacherDashboard,
      elements.viewTeacherEditor,
      elements.viewTeacherAnalytics,
      elements.viewStudentDashboard,
      elements.viewStudentTaking,
      elements.viewStudentReview
    ];

    allViews.forEach(v => v.classList.add('hidden'));

    const targetView = document.getElementById(viewId);
    if (targetView) {
      targetView.classList.remove('hidden');
      window.scrollTo(0, 0);
    }
  }

  // ==========================================
  // 2. AUTHENTICATION & SESSION MANAGEMENT
  // ==========================================

  function updateAuthUI() {
    if (state.token && state.user) {
      elements.navLinks.classList.remove('hidden');
      elements.userProfile.classList.remove('hidden');
      elements.userDisplayName.textContent = state.user.name;

      elements.userRoleBadge.textContent = state.user.role;
      elements.userRoleBadge.className = `role-badge ${state.user.role === 'TEACHER' ? 'role-teacher' : 'role-student'}`;

      if (state.user.role === 'TEACHER') {
        loadTeacherDashboard();
      } else {
        loadStudentDashboard();
      }
    } else {
      elements.navLinks.classList.add('hidden');
      elements.userProfile.classList.add('hidden');
      showView('view-auth');
    }
  }

  function loginUser(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('assess_token', token);
    localStorage.setItem('assess_user', JSON.stringify(user));
    showToast(`Welcome back, ${user.name}!`, 'success');
    updateAuthUI();
  }

  function logout() {
    clearInterval(state.examTimerInterval);
    state.token = null;
    state.user = null;
    state.currentQuiz = null;
    state.currentAttempt = null;
    localStorage.removeItem('assess_token');
    localStorage.removeItem('assess_user');
    updateAuthUI();
  }

  // Setup Auth Forms & Listeners
  function initAuthListeners() {
    // Tab switching
    elements.tabLogin.addEventListener('click', () => {
      elements.tabLogin.classList.add('active');
      elements.tabRegister.classList.remove('active');
      elements.loginForm.classList.remove('hidden');
      elements.registerForm.classList.add('hidden');
    });

    elements.tabRegister.addEventListener('click', () => {
      elements.tabRegister.classList.add('active');
      elements.tabLogin.classList.remove('active');
      elements.registerForm.classList.remove('hidden');
      elements.loginForm.classList.add('hidden');
    });

    // 1-Click Demo Buttons for Viva
    elements.demoTeacherBtn.addEventListener('click', () => {
      elements.tabLogin.click();
      document.getElementById('login-email').value = 'teacher@test.com';
      document.getElementById('login-password').value = '123456';
      elements.loginForm.dispatchEvent(new Event('submit'));
    });

    elements.demoStudentBtn.addEventListener('click', () => {
      elements.tabLogin.click();
      document.getElementById('login-email').value = 'student@test.com';
      document.getElementById('login-password').value = '123456';
      elements.loginForm.dispatchEvent(new Event('submit'));
    });

    // Login Form Submit
    elements.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        loginUser(data.token, data.user);
      } catch (err) {
        // Handled in apiFetch
      }
    });

    // Register Form Submit
    elements.registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const role = document.querySelector('input[name="reg-role"]:checked').value;

      try {
        const data = await apiFetch('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password, role })
        });
        loginUser(data.token, data.user);
      } catch (err) {
        // Handled in apiFetch
      }
    });

    // Global Logout & Brand Navigation
    elements.logoutBtn.addEventListener('click', logout);
    elements.navDashboardBtn.addEventListener('click', () => {
      if (state.user?.role === 'TEACHER') loadTeacherDashboard();
      else if (state.user?.role === 'STUDENT') loadStudentDashboard();
    });
    document.querySelector('.brand').addEventListener('click', () => {
      if (state.user?.role === 'TEACHER') loadTeacherDashboard();
      else if (state.user?.role === 'STUDENT') loadStudentDashboard();
    });
  }

  // ==========================================
  // 3. TEACHER DASHBOARD & OPERATIONS
  // ==========================================

  async function loadTeacherDashboard() {
    showView('view-teacher-dashboard');

    try {
      const data = await apiFetch('/api/teacher/dashboard');
      const stats = data.stats;

      document.getElementById('t-stat-quizzes').textContent = stats.totalQuizzes;
      document.getElementById('t-stat-attempts').textContent = stats.totalAttempts;
      document.getElementById('t-stat-avg-score').textContent = `${stats.averageScore || 0}%`;
      document.getElementById('t-stat-pass-rate').textContent = `${stats.overallPassRate || 0}%`;
      document.getElementById('t-quiz-count-badge').textContent = `${stats.totalQuizzes} quizzes`;

      renderTeacherQuizzesTable(data.quizzes);
      renderTeacherRecentActivity(data.recentActivity);
    } catch (err) {
      console.error(err);
    }
  }

  function renderTeacherQuizzesTable(quizzes) {
    const tbody = document.getElementById('teacher-quizzes-tbody');
    const emptyState = document.getElementById('teacher-quizzes-empty');
    tbody.innerHTML = '';

    if (!quizzes || quizzes.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    quizzes.forEach(q => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHTML(q.title)}</div>
          <span class="badge badge-accent">${escapeHTML(q.subject)}</span>
        </td>
        <td>${q.duration_minutes} min</td>
        <td>${q.question_count} Qs</td>
        <td>${q.attempt_count}</td>
        <td><strong>${q.avg_score !== null ? `${q.avg_score}%` : 'N/A'}</strong></td>
        <td class="text-right">
          <div class="header-action-group" style="justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" data-action="manage" data-id="${q.id}">Questions</button>
            <button class="btn btn-subtle btn-sm" data-action="analytics" data-id="${q.id}">Analytics</button>
            <button class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${q.id}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Table action listeners
    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const quizId = parseInt(btn.dataset.id, 10);

        if (action === 'manage') {
          loadQuizEditor(quizId);
        } else if (action === 'analytics') {
          loadQuizAnalytics(quizId);
        } else if (action === 'delete') {
          showConfirm('Delete Quiz', 'Are you sure you want to delete this quiz? All student attempts, questions, and scores will be permanently deleted.', async () => {
            try {
              await apiFetch(`/api/quizzes/${quizId}`, { method: 'DELETE' });
              showToast('Quiz deleted successfully.', 'success');
              loadTeacherDashboard();
            } catch (err) {}
          });
        }
      });
    });
  }

  function renderTeacherRecentActivity(activity) {
    const list = document.getElementById('teacher-recent-activity-list');
    const emptyState = document.getElementById('teacher-recent-empty');
    list.innerHTML = '';

    if (!activity || activity.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    activity.forEach(item => {
      const div = document.createElement('div');
      div.className = 'activity-item';
      div.style.padding = '0.75rem 0';
      div.style.borderBottom = '1px solid var(--border-color)';

      const passBadge = item.status === 'GRADED'
        ? (item.passed ? '<span class="badge badge-success">PASSED</span>' : '<span class="badge badge-danger">FAILED</span>')
        : `<span class="badge">${item.status}</span>`;

      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <strong style="color: var(--text-main); font-size: 0.9rem;">${escapeHTML(item.student_name)}</strong>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(item.quiz_title)}</div>
          </div>
          <div style="text-align: right;">
            ${passBadge}
            <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-top: 0.2rem;">${item.score}/${item.max_score} (${item.percentage}%)</div>
          </div>
        </div>
      `;
      list.appendChild(div);
    });
  }

  // ==========================================
  // 4. TEACHER QUIZ EDITOR (Questions, Lock, Bank)
  // ==========================================

  let currentEditingQuiz = null;

  async function loadQuizEditor(quizId) {
    showView('view-teacher-editor');

    try {
      const data = await apiFetch(`/api/quizzes/${quizId}`);
      currentEditingQuiz = data.quiz;

      document.getElementById('editor-quiz-title').textContent = currentEditingQuiz.title;
      document.getElementById('editor-quiz-subtitle').textContent = `Subject: ${currentEditingQuiz.subject} | Duration: ${currentEditingQuiz.duration_minutes} min | Pass: ${currentEditingQuiz.pass_percentage}%`;

      const lockBanner = document.getElementById('editor-lock-banner');
      const addQBtn = document.getElementById('editor-new-q-btn');
      const addBankBtn = document.getElementById('editor-add-bank-btn');

      if (currentEditingQuiz.is_locked) {
        lockBanner.classList.remove('hidden');
        addQBtn.disabled = true;
        addBankBtn.disabled = true;
      } else {
        lockBanner.classList.add('hidden');
        addQBtn.disabled = false;
        addBankBtn.disabled = false;
      }

      renderEditorQuestions(currentEditingQuiz.questions, currentEditingQuiz.is_locked);
    } catch (err) {
      console.error(err);
    }
  }

  function renderEditorQuestions(questions, isLocked) {
    const container = document.getElementById('editor-questions-list');
    container.innerHTML = '';

    if (!questions || questions.length === 0) {
      container.innerHTML = '<div class="empty-state">No questions added yet. Click "+ Add New Question" or "Import from Subject Bank" to add questions.</div>';
      return;
    }

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'panel-card mb-2';
      card.style.padding = '1.25rem';

      const optionsHtml = q.options.map((opt, oIdx) => {
        const isCorrect = oIdx === q.correct_option;
        return `
          <div class="review-option ${isCorrect ? 'correct-answer' : ''}" style="margin-bottom: 0.35rem; padding: 0.5rem 0.85rem;">
            <span><strong>${['A', 'B', 'C', 'D'][oIdx]}.</strong> ${escapeHTML(opt)}</span>
            ${isCorrect ? '<span style="font-size: 0.8rem; font-weight: 700;">✓ Correct Key</span>' : ''}
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
          <div>
            <span class="badge badge-accent">Q${idx + 1} (${q.marks} Marks)</span>
            <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-top: 0.35rem;">${escapeHTML(q.question_text)}</h4>
          </div>
          ${!isLocked ? `
            <div class="header-action-group">
              <button class="btn btn-secondary btn-sm" data-action="edit-q" data-id="${q.id}">Edit</button>
              <button class="btn btn-outline-danger btn-sm" data-action="del-q" data-id="${q.id}">Delete</button>
            </div>
          ` : '<span class="badge">Locked</span>'}
        </div>
        <div style="margin-top: 0.5rem;">${optionsHtml}</div>
      `;
      container.appendChild(card);
    });

    if (!isLocked) {
      container.querySelectorAll('button[data-action="edit-q"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const qId = parseInt(btn.dataset.id, 10);
          const q = questions.find(item => item.id === qId);
          if (q) openEditQuestionModal(q);
        });
      });

      container.querySelectorAll('button[data-action="del-q"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const qId = parseInt(btn.dataset.id, 10);
          showConfirm('Delete Question', 'Are you sure you want to delete this question?', async () => {
            try {
              await apiFetch(`/api/quizzes/${currentEditingQuiz.id}/questions/${qId}`, { method: 'DELETE' });
              showToast('Question deleted.', 'success');
              loadQuizEditor(currentEditingQuiz.id);
            } catch (err) {}
          });
        });
      });
    }
  }

  function openEditQuestionModal(q = null) {
    const isEdit = Boolean(q);
    document.getElementById('add-q-modal-title').textContent = isEdit ? 'Edit Question' : 'Add New Question';
    document.getElementById('edit-q-id').value = isEdit ? q.id : '';
    document.getElementById('q-text').value = isEdit ? q.question_text : '';
    document.getElementById('q-marks').value = isEdit ? q.marks : 1;

    for (let i = 0; i < 4; i++) {
      document.getElementById(`opt-${i}`).value = isEdit ? q.options[i] : '';
      if (isEdit && q.correct_option === i) {
        document.getElementById(`radio-opt-${i}`).checked = true;
      }
    }

    if (!isEdit) {
      document.getElementById('radio-opt-0').checked = true;
    }

    elements.modalAddQuestion.classList.remove('hidden');
  }

  // ==========================================
  // 5. TEACHER ANALYTICS & CSV EXPORT
  // ==========================================

  let currentAnalyticsQuizId = null;

  async function loadQuizAnalytics(quizId) {
    showView('view-teacher-analytics');
    currentAnalyticsQuizId = quizId;

    try {
      const data = await apiFetch(`/api/quizzes/${quizId}/analytics`);
      const { quiz, overview, questionAccuracy, leaderboard } = data.analytics;

      document.getElementById('analytics-quiz-title').textContent = quiz.title;
      document.getElementById('analytics-quiz-meta').textContent = `Subject: ${quiz.subject} | Duration: ${quiz.duration_minutes} min | Pass Standard: ${quiz.pass_percentage}%`;

      document.getElementById('an-total-attempts').textContent = overview.totalAttempts;
      document.getElementById('an-pass-rate').textContent = `${overview.passRate}%`;
      document.getElementById('an-avg-score').textContent = `${overview.averagePercentage}%`;
      document.getElementById('an-high-score').textContent = `${overview.highestPercentage}%`;
      document.getElementById('an-low-score').textContent = `${overview.lowestPercentage}%`;

      renderQuestionAccuracyChart(questionAccuracy);
      renderLeaderboard(leaderboard);
    } catch (err) {
      console.error(err);
    }
  }

  function renderQuestionAccuracyChart(items) {
    const container = document.getElementById('analytics-accuracy-chart');
    container.innerHTML = '';

    if (!items || items.length === 0) {
      container.innerHTML = '<div class="empty-state">No student question responses recorded yet.</div>';
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'chart-bar-row';
      row.innerHTML = `
        <div class="chart-bar-label">
          <span><strong>Q${item.index}:</strong> ${escapeHTML(item.questionText.slice(0, 65))}${item.questionText.length > 65 ? '...' : ''}</span>
          <span><strong>${item.accuracyPercentage}%</strong> (${item.correctResponses}/${item.totalResponses} correct)</span>
        </div>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill" style="width: ${item.accuracyPercentage}%;"></div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  function renderLeaderboard(leaderboard) {
    const tbody = document.getElementById('analytics-leaderboard-tbody');
    const emptyState = document.getElementById('analytics-leaderboard-empty');
    tbody.innerHTML = '';

    if (!leaderboard || leaderboard.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    leaderboard.forEach((entry, idx) => {
      const tr = document.createElement('tr');
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      const minutesTaken = entry.time_taken_seconds !== null ? `${Math.round(entry.time_taken_seconds / 60)}m` : '-';

      tr.innerHTML = `
        <td><strong>${rankBadge}</strong></td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${escapeHTML(entry.student_name)}</div>
        </td>
        <td><strong>${entry.score}/${entry.max_score}</strong> (${entry.percentage}%)</td>
        <td>${minutesTaken}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==========================================
  // 6. STUDENT DASHBOARD & EXAM WORKFLOW
  // ==========================================

  async function loadStudentDashboard() {
    showView('view-student-dashboard');

    try {
      const data = await apiFetch('/api/student/dashboard');
      const stats = data.stats;

      document.getElementById('s-stat-available').textContent = stats.availableCount;
      document.getElementById('s-stat-completed').textContent = stats.totalCompleted;
      document.getElementById('s-stat-avg').textContent = `${stats.averageScore}%`;
      document.getElementById('s-stat-best').textContent = `${stats.bestScore}%`;

      renderStudentAvailableQuizzes(data.availableQuizzes);
      renderStudentHistory(data.recentResults);
    } catch (err) {
      console.error(err);
    }
  }

  function renderStudentAvailableQuizzes(quizzes) {
    const container = document.getElementById('student-available-grid');
    const emptyState = document.getElementById('student-available-empty');
    container.innerHTML = '';

    if (!quizzes || quizzes.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    quizzes.forEach(q => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.innerHTML = `
        <div>
          <div class="quiz-card-header">
            <span class="badge badge-accent">${escapeHTML(q.subject)}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">${q.duration_minutes} Mins</span>
          </div>
          <h3 class="quiz-card-title">${escapeHTML(q.title)}</h3>
          <p class="quiz-card-desc">${escapeHTML(q.description || 'Verified College Assessment')}</p>
        </div>
        <div>
          <div class="quiz-card-meta">
            <span class="quiz-meta-item">📝 ${q.question_count} Questions</span>
            <span class="quiz-meta-item">🎯 Pass: ${q.pass_percentage}%</span>
          </div>
          <button class="btn btn-primary btn-block" data-action="start-quiz" data-id="${q.id}">
            Start Assessment
          </button>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('button[data-action="start-quiz"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const quizId = parseInt(btn.dataset.id, 10);
        showConfirm('Start Assessment', 'Once started, the countdown timer begins. You are allowed 1 attempt. Are you ready to begin?', () => {
          startQuizSession(quizId);
        });
      });
    });
  }

  function renderStudentHistory(attempts) {
    const tbody = document.getElementById('student-history-tbody');
    const emptyState = document.getElementById('student-history-empty');
    tbody.innerHTML = '';

    if (!attempts || attempts.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    attempts.forEach(a => {
      const tr = document.createElement('tr');
      const passBadge = a.status === 'GRADED'
        ? (a.passed ? '<span class="badge badge-success">PASSED</span>' : '<span class="badge badge-danger">FAILED</span>')
        : `<span class="badge">${a.status}</span>`;

      const scoreDisplay = a.status === 'GRADED' ? `${a.score} / ${a.max_score}` : '-';
      const pctDisplay = a.status === 'GRADED' ? `<strong>${a.percentage}%</strong>` : '-';
      const dateDisplay = a.completed_at ? new Date(a.completed_at).toLocaleDateString() : 'In Progress';

      tr.innerHTML = `
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHTML(a.quiz_title)}</div>
          <span class="badge">${escapeHTML(a.subject)}</span>
        </td>
        <td>${dateDisplay}</td>
        <td>${scoreDisplay}</td>
        <td>${pctDisplay}</td>
        <td>${passBadge}</td>
        <td class="text-right">
          ${a.status === 'GRADED'
            ? `<button class="btn btn-secondary btn-sm" data-action="review" data-id="${a.attempt_id}">Review Answers</button>`
            : `<button class="btn btn-primary btn-sm" data-action="resume-exam" data-quiz="${a.quiz_id}">Continue</button>`
          }
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action="review"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const attemptId = parseInt(btn.dataset.id, 10);
        loadAttemptReview(attemptId);
      });
    });

    tbody.querySelectorAll('button[data-action="resume-exam"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const quizId = parseInt(btn.dataset.quiz, 10);
        startQuizSession(quizId);
      });
    });
  }

  // ==========================================
  // 7. QUIZ TAKING SESSION & TIMER STATE MACHINE
  // ==========================================

  async function startQuizSession(quizId) {
    try {
      const data = await apiFetch(`/api/quizzes/${quizId}/start`, { method: 'POST' });

      state.currentQuiz = data.quiz;
      state.currentAttempt = data.attempt;
      state.studentAnswers = new Map();

      // Pre-fill existing answers if resuming
      if (Array.isArray(data.answers)) {
        data.answers.forEach(a => {
          if (a.selected_option !== null) {
            state.studentAnswers.set(a.question_id, a.selected_option);
          }
        });
      }

      showView('view-student-taking');

      document.getElementById('taking-quiz-title').textContent = data.quiz.title;
      document.getElementById('taking-quiz-subject').textContent = data.quiz.subject;
      document.getElementById('taking-total-count').textContent = data.questions.length;

      renderExamQuestions(data.questions);
      updateExamProgress(data.questions.length);

      // Initialize Timer
      initExamTimer(data.quiz.duration_minutes, data.attempt);
    } catch (err) {
      console.error(err);
    }
  }

  function initExamTimer(durationMinutes, attempt) {
    clearInterval(state.examTimerInterval);

    // Calculate remaining seconds
    const totalDurationSeconds = durationMinutes * 60;
    const startedTime = new Date(attempt.started_at + (attempt.started_at.includes('Z') ? '' : 'Z')).getTime();
    const nowTime = Date.now();
    const elapsedSeconds = Math.max(0, Math.floor((nowTime - startedTime) / 1000) - (attempt.total_paused_seconds || 0));

    state.examRemainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);
    state.examIsPaused = attempt.status === 'PAUSED';

    const timerBadge = document.getElementById('taking-timer-badge');
    const timerDisplay = document.getElementById('taking-timer-display');
    const pausedOverlay = document.getElementById('taking-paused-overlay');
    const pauseBtn = document.getElementById('taking-pause-btn');

    if (state.examIsPaused) {
      pausedOverlay.classList.remove('hidden');
      pauseBtn.textContent = 'Resume';
    } else {
      pausedOverlay.classList.add('hidden');
      pauseBtn.textContent = 'Pause';
    }

    function tick() {
      if (state.examIsPaused) return;

      if (state.examRemainingSeconds <= 0) {
        clearInterval(state.examTimerInterval);
        showToast('Time has expired! Automatically submitting your assessment.', 'info');
        submitQuizAttempt(true);
        return;
      }

      const mins = Math.floor(state.examRemainingSeconds / 60);
      const secs = state.examRemainingSeconds % 60;
      timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      // Turn pulsing red when under 1 minute (60s)
      if (state.examRemainingSeconds <= 60) {
        timerBadge.classList.add('timer-warning');
      } else {
        timerBadge.classList.remove('timer-warning');
      }

      state.examRemainingSeconds--;
    }

    tick();
    state.examTimerInterval = setInterval(tick, 1000);
  }

  function renderExamQuestions(questions) {
    const container = document.getElementById('taking-questions-container');
    container.innerHTML = '';

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = `exam-question-card ${state.studentAnswers.has(q.id) ? 'answered' : ''}`;
      card.id = `q-card-${q.id}`;

      const optionsHtml = q.options.map((opt, oIdx) => {
        const isSelected = state.studentAnswers.get(q.id) === oIdx;
        return `
          <label class="exam-option-label ${isSelected ? 'selected' : ''}" data-qid="${q.id}" data-oidx="${oIdx}">
            <input type="radio" name="taking_q_${q.id}" value="${oIdx}" ${isSelected ? 'checked' : ''}>
            <span class="option-badge">${['A', 'B', 'C', 'D'][oIdx]}</span>
            <span>${escapeHTML(opt)}</span>
          </label>
        `;
      }).join('');

      card.innerHTML = `
        <div class="exam-question-header">
          <span class="exam-q-num">Question ${idx + 1} of ${questions.length}</span>
          <span class="badge">${q.marks} Mark${q.marks > 1 ? 's' : ''}</span>
        </div>
        <div class="exam-q-text">${escapeHTML(q.question_text)}</div>
        <div class="exam-options-grid">${optionsHtml}</div>
      `;
      container.appendChild(card);
    });

    // Option selection & autosave event delegation
    container.querySelectorAll('.exam-option-label').forEach(label => {
      label.addEventListener('click', async () => {
        if (state.examIsPaused) return;

        const qId = parseInt(label.dataset.qid, 10);
        const oIdx = parseInt(label.dataset.oidx, 10);

        state.studentAnswers.set(qId, oIdx);

        // Update card visual state
        const card = document.getElementById(`q-card-${qId}`);
        if (card) {
          card.classList.add('answered');
          card.querySelectorAll('.exam-option-label').forEach(l => l.classList.remove('selected'));
          label.classList.add('selected');
        }

        updateExamProgress(questions.length);

        // Autosave answer in background
        apiFetch(`/api/attempts/${state.currentAttempt.id}/answer`, {
          method: 'POST',
          body: JSON.stringify({ question_id: qId, selected_option: oIdx })
        }).catch(() => {});
      });
    });
  }

  function updateExamProgress(totalQuestions) {
    const answeredCount = state.studentAnswers.size;
    document.getElementById('taking-answered-count').textContent = answeredCount;

    const percentage = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
    document.getElementById('taking-progress-fill').style.width = `${percentage}%`;
  }

  // Pause / Resume Event Handlers
  async function togglePause() {
    if (!state.currentAttempt) return;

    if (!state.examIsPaused) {
      // Transition ACTIVE -> PAUSED
      try {
        await apiFetch(`/api/attempts/${state.currentAttempt.id}/pause`, { method: 'POST' });
        state.examIsPaused = true;
        document.getElementById('taking-paused-overlay').classList.remove('hidden');
        document.getElementById('taking-pause-btn').textContent = 'Resume';
        showToast('Assessment paused.', 'info');
      } catch (err) {}
    } else {
      // Transition PAUSED -> ACTIVE
      try {
        await apiFetch(`/api/attempts/${state.currentAttempt.id}/resume`, { method: 'POST' });
        state.examIsPaused = false;
        document.getElementById('taking-paused-overlay').classList.add('hidden');
        document.getElementById('taking-pause-btn').textContent = 'Pause';
        showToast('Assessment resumed.', 'success');
      } catch (err) {}
    }
  }

  async function submitQuizAttempt(auto = false) {
    if (!state.currentAttempt) return;

    clearInterval(state.examTimerInterval);

    const answersPayload = [];
    state.studentAnswers.forEach((selected_option, question_id) => {
      answersPayload.push({ question_id, selected_option });
    });

    try {
      const data = await apiFetch(`/api/attempts/${state.currentAttempt.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: answersPayload })
      });

      showToast(data.message || 'Assessment submitted and graded.', 'success');
      loadAttemptReview(data.result.attemptId);
    } catch (err) {
      console.error(err);
    }
  }

  // ==========================================
  // 8. INSTANT RESULT & ANSWER REVIEW
  // ==========================================

  async function loadAttemptReview(attemptId) {
    showView('view-student-review');

    try {
      const data = await apiFetch(`/api/attempts/${attemptId}/review`);
      const { review } = data;

      document.getElementById('review-quiz-title').textContent = `${review.quizTitle} (${review.subject})`;
      document.getElementById('result-percentage').textContent = `${review.percentage}%`;
      document.getElementById('review-score').textContent = `${review.score} / ${review.maxScore}`;
      document.getElementById('review-pass-pct').textContent = `${review.passPercentage}%`;
      document.getElementById('review-date').textContent = new Date(review.completedAt).toLocaleString();

      const badgeCircle = document.getElementById('result-badge-circle');
      const statusMsg = document.getElementById('review-status-message');

      if (review.passed) {
        badgeCircle.className = 'result-badge-circle passed';
        statusMsg.textContent = '🎉 Congratulations! You have PASSED this assessment.';
        statusMsg.style.color = 'var(--success)';
      } else {
        badgeCircle.className = 'result-badge-circle failed';
        statusMsg.textContent = '⚠️ You did not meet the passing criteria for this assessment.';
        statusMsg.style.color = 'var(--danger)';
      }

      renderReviewQuestions(review.questions);

      // Leaderboard modal button
      document.getElementById('review-view-leaderboard-btn').onclick = () => {
        loadLeaderboardModal(review.attemptId);
      };
    } catch (err) {
      console.error(err);
    }
  }

  function renderReviewQuestions(questions) {
    const container = document.getElementById('review-questions-list');
    container.innerHTML = '';

    questions.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'panel-card mb-2';
      card.style.padding = '1.25rem';

      const optionsHtml = q.options.map((opt, oIdx) => {
        const isCorrectKey = oIdx === q.correct_option;
        const isStudentChoice = oIdx === q.selected_option;

        let styleClass = '';
        let tag = '';

        if (isCorrectKey) {
          styleClass = 'correct-answer';
          tag = '<span style="font-size: 0.8rem; font-weight: 700;">✓ Correct Key</span>';
        } else if (isStudentChoice && !isCorrectKey) {
          styleClass = 'wrong-selection';
          tag = '<span style="font-size: 0.8rem; font-weight: 700;">✕ Your Choice</span>';
        }

        return `
          <div class="review-option ${styleClass}">
            <span><strong>${['A', 'B', 'C', 'D'][oIdx]}.</strong> ${escapeHTML(opt)}</span>
            ${tag}
          </div>
        `;
      }).join('');

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
          <div>
            <span class="badge ${q.is_correct ? 'badge-success' : 'badge-danger'}">
              Q${idx + 1}: ${q.is_correct ? `+${q.marks_awarded} Marks (Correct)` : `0 Marks (Incorrect)`}
            </span>
            <h4 style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-top: 0.35rem;">${escapeHTML(q.question_text)}</h4>
          </div>
        </div>
        <div style="margin-top: 0.5rem;">${optionsHtml}</div>
      `;
      container.appendChild(card);
    });
  }

  async function loadLeaderboardModal(attemptId) {
    try {
      const reviewData = await apiFetch(`/api/attempts/${attemptId}/review`);
      const quizId = reviewData.review.attemptId ? (await apiFetch(`/api/attempts/${attemptId}/review`)).review : null;
      // Fetch leaderboard using quiz ID
      loadTeacherDashboard();
    } catch (err) {}
  }

  // ==========================================
  // 9. EVENT LISTENERS & MODAL BINDINGS
  // ==========================================

  function initModalAndActionListeners() {
    // Modal Close buttons
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      });
    });

    // Teacher: Open Create Quiz
    document.getElementById('open-create-quiz-btn').addEventListener('click', () => {
      elements.modalCreateQuiz.classList.remove('hidden');
    });

    // Teacher: Create Quiz Submit
    elements.createQuizForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('cq-title').value.trim();
      const subject = document.getElementById('cq-subject').value;
      const duration_minutes = parseInt(document.getElementById('cq-duration').value, 10);
      const pass_percentage = parseFloat(document.getElementById('cq-pass-pct').value);
      const description = document.getElementById('cq-desc').value.trim();

      try {
        const data = await apiFetch('/api/quizzes', {
          method: 'POST',
          body: JSON.stringify({ title, subject, duration_minutes, pass_percentage, description, questions: [] })
        });
        elements.modalCreateQuiz.classList.add('hidden');
        showToast('Quiz created! Now add or import questions.', 'success');
        loadQuizEditor(data.quiz.id);
      } catch (err) {}
    });

    // Teacher: Open Auto-Gen Modal
    document.getElementById('open-auto-gen-modal-btn').addEventListener('click', () => {
      elements.modalAutoGen.classList.remove('hidden');
    });

    // Teacher: Auto-Gen Quiz Submit
    elements.autoGenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = document.getElementById('ag-subject').value;
      const count = parseInt(document.getElementById('ag-count').value, 10);
      const duration_minutes = parseInt(document.getElementById('ag-duration').value, 10);
      const pass_percentage = parseFloat(document.getElementById('ag-pass-pct').value);
      const title = document.getElementById('ag-title').value.trim();

      try {
        const data = await apiFetch('/api/quizzes/generate-from-bank', {
          method: 'POST',
          body: JSON.stringify({ subject, count, duration_minutes, pass_percentage, title })
        });
        elements.modalAutoGen.classList.add('hidden');
        showToast(data.message, 'success');
        loadTeacherDashboard();
      } catch (err) {}
    });

    // Teacher: Open Add Single Question
    document.getElementById('editor-new-q-btn').addEventListener('click', () => {
      openEditQuestionModal(null);
    });

    // Teacher: Add/Edit Question Submit
    elements.addQuestionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qId = document.getElementById('edit-q-id').value;
      const question_text = document.getElementById('q-text').value.trim();
      const marks = parseFloat(document.getElementById('q-marks').value);
      const correct_option = parseInt(document.querySelector('input[name="correct_opt_radio"]:checked').value, 10);
      const options = [
        document.getElementById('opt-0').value.trim(),
        document.getElementById('opt-1').value.trim(),
        document.getElementById('opt-2').value.trim(),
        document.getElementById('opt-3').value.trim()
      ];

      const endpoint = qId
        ? `/api/quizzes/${currentEditingQuiz.id}/questions/${qId}`
        : `/api/quizzes/${currentEditingQuiz.id}/questions`;

      const method = qId ? 'PUT' : 'POST';

      try {
        await apiFetch(endpoint, {
          method,
          body: JSON.stringify({ question_text, marks, correct_option, options })
        });
        elements.modalAddQuestion.classList.add('hidden');
        showToast(qId ? 'Question updated.' : 'Question added.', 'success');
        loadQuizEditor(currentEditingQuiz.id);
      } catch (err) {}
    });

    // Teacher: Open Import From Bank Modal
    document.getElementById('editor-add-bank-btn').addEventListener('click', () => {
      elements.modalImportBank.classList.remove('hidden');
    });

    // Teacher: Import from Bank Submit
    elements.importBankForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const count = parseInt(document.getElementById('ib-count').value, 10);

      try {
        const data = await apiFetch(`/api/quizzes/${currentEditingQuiz.id}/add-from-bank`, {
          method: 'POST',
          body: JSON.stringify({ count, subject: currentEditingQuiz.subject })
        });
        elements.modalImportBank.classList.add('hidden');
        showToast(data.message, 'success');
        loadQuizEditor(currentEditingQuiz.id);
      } catch (err) {}
    });

    // Teacher Back Buttons
    document.getElementById('editor-back-btn').addEventListener('click', loadTeacherDashboard);
    document.getElementById('analytics-back-btn').addEventListener('click', loadTeacherDashboard);

    // Export CSV Button
    document.getElementById('export-csv-btn').addEventListener('click', () => {
      if (!currentAnalyticsQuizId) return;
      window.open(`/api/quizzes/${currentAnalyticsQuizId}/export-csv?token=${state.token}`, '_blank');
      // Direct fetch download for authorization header
      fetch(`/api/quizzes/${currentAnalyticsQuizId}/export-csv`, {
        headers: { 'Authorization': `Bearer ${state.token}` }
      })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quiz_${currentAnalyticsQuizId}_results.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('CSV export downloaded.', 'success');
      })
      .catch(() => showToast('Failed to export CSV.', 'error'));
    });

    // Student Exam Action Buttons
    document.getElementById('taking-pause-btn').addEventListener('click', togglePause);
    document.getElementById('taking-resume-btn').addEventListener('click', togglePause);

    const handleSubmitClick = () => {
      const answered = state.studentAnswers.size;
      const total = parseInt(document.getElementById('taking-total-count').textContent, 10);
      const unanswered = total - answered;

      const warningText = unanswered > 0
        ? `You still have ${unanswered} unanswered question(s). Are you sure you want to finalize and submit?`
        : 'Are you sure you want to submit your assessment?';

      showConfirm('Submit Assessment', warningText, () => {
        submitQuizAttempt(false);
      });
    };

    document.getElementById('taking-submit-btn').addEventListener('click', handleSubmitClick);
    document.getElementById('taking-bottom-submit-btn').addEventListener('click', handleSubmitClick);

    // Review Return Button
    document.getElementById('review-back-dash-btn').addEventListener('click', loadStudentDashboard);
  }

  // ==========================================
  // 10. APP INITIALIZATION
  // ==========================================

  function initApp() {
    initTheme();
    initAuthListeners();
    initModalAndActionListeners();
    updateAuthUI();
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();