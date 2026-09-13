'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ListTodo } from 'lucide-react';
import { API_BASE_URL } from '../lib/apiBase';

const MAX_TITLE_LENGTH = 200;

/**
 * 로그인한 사용자(selxxxxx) 본인의 할 일 목록.
 * 소유자 판정은 전적으로 서버(JWT)가 하므로 여기서는 사용자명을 보내지 않는다.
 */
export default function TodoPanel() {
  const [todos, setTodos] = useState([]);
  const [user, setUser] = useState('');
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [error, setError] = useState('');

  const setPending = (id, on) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const request = useCallback(async (path, options = {}) => {
    const res = await fetch(`${API_BASE_URL}/api/todos${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || `요청에 실패했습니다 (HTTP ${res.status})`);
    return data;
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await request('');
      setTodos(data.todos || []);
      setUser(data.user || '');
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value || isSaving) return;
    setIsSaving(true);
    try {
      const data = await request('', { method: 'POST', body: JSON.stringify({ title: value }) });
      setTodos((prev) => [data.todo, ...prev]);
      setTitle('');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (todo) => {
    // 같은 항목에 대한 요청이 아직 끝나지 않았다면 무시한다.
    // 응답이 순서를 바꿔 도착하면 화면이 서버 상태와 어긋나기 때문이다.
    if (pendingIds.has(todo.id)) return;
    // 서버 왕복을 기다리면 체크박스가 잠시 반응하지 않는 것처럼 보인다.
    // 먼저 화면에 반영하고, 실패하면 되돌린다.
    const next = !todo.done;
    setPending(todo.id, true);
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: next } : t)));
    try {
      const data = await request(`/${todo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: next }),
      });
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? data.todo : t)));
      setError('');
    } catch (err) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t)));
      setError(err.message);
    } finally {
      setPending(todo.id, false);
    }
  };

  const handleDelete = async (todo) => {
    if (pendingIds.has(todo.id)) return;
    setPending(todo.id, true);
    try {
      await request(`/${todo.id}`, { method: 'DELETE' });
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(todo.id, false);
    }
  };

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <section className="todo-panel" aria-label="내 할 일">
      <div className="todo-panel-head">
        <h2 className="todo-panel-title">
          <ListTodo size={16} aria-hidden="true" />
          내 할 일
        </h2>
        <span className="todo-panel-meta">
          {user ? `${user} · ` : ''}
          {remaining}건 남음
        </span>
      </div>

      <form className="todo-add" onSubmit={handleAdd}>
        <label className="visually-hidden" htmlFor="todo-new-title">
          할 일 내용
        </label>
        <input
          id="todo-new-title"
          className="todo-input"
          type="text"
          value={title}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="할 일을 입력하세요"
          onChange={(e) => setTitle(e.target.value)}
          disabled={isSaving}
        />
        <button
          type="submit"
          className="btn-app btn-app-primary btn-app-sm"
          disabled={isSaving || !title.trim()}
        >
          <Plus size={14} aria-hidden="true" />
          추가
        </button>
      </form>

      {error && <p className="todo-error" role="alert">{error}</p>}

      {isLoading ? (
        <p className="todo-empty">불러오는 중...</p>
      ) : todos.length === 0 ? (
        <p className="todo-empty">등록된 할 일이 없습니다.</p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <li key={todo.id} className={`todo-item${todo.done ? ' todo-item-done' : ''}`}>
              <label className="todo-check">
                <input
                  type="checkbox"
                  checked={todo.done}
                  disabled={pendingIds.has(todo.id)}
                  onChange={() => handleToggle(todo)}
                />
                <span className="todo-text">{todo.title}</span>
              </label>
              <button
                type="button"
                className="btn-app btn-app-icon-danger"
                onClick={() => handleDelete(todo)}
                disabled={pendingIds.has(todo.id)}
                aria-label={`${todo.title} 삭제`}
                title="삭제"
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
