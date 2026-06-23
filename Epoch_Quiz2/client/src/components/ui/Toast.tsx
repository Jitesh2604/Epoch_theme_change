import React, { useState, useEffect } from 'react';

interface ToastItem {
  id: number;
  msg: string;
  kind: string;
}

let _toastId = 0;
const _toastListeners = new Set<(items: ToastItem[]) => void>();
const _toastState: { items: ToastItem[] } = { items: [] };

export function showToast(msg: string, kind = 'success', timeout = 2500): void {
  const id = ++_toastId;
  _toastState.items = [..._toastState.items, { id, msg, kind }];
  _toastListeners.forEach(fn => fn(_toastState.items));
  setTimeout(() => {
    _toastState.items = _toastState.items.filter(t => t.id !== id);
    _toastListeners.forEach(fn => fn(_toastState.items));
  }, timeout);
}

export const ToastStack: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>(_toastState.items);
  useEffect(() => {
    _toastListeners.add(setItems);
    return () => { _toastListeners.delete(setItems); };
  }, []);
  return (
    <div className="toast-stack">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="t-dot"></span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
};
