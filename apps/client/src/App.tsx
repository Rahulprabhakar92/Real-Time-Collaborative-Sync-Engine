
import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import {
  Item,
  createDoc,
  Doc,
  getContent,
  localDelete,
  localInsert,
  mergeInto,
} from '@sync/engine';

type Account = {
  id: string;
  username: string;
  color: string;
};

type RemoteUser = Account & {
  cursor?: number;
  lastSeen: number;
  typing?: boolean;
};

const USERNAME_KEY = 'sync-studio-username';
const COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#f472b6'];

const getStoredUsername = (): string => {
  try {
    return localStorage.getItem(USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
};

const buildAccount = (username: string): Account => ({
  id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  username: username.trim().slice(0, 20) || 'Guest',
  color: COLORS[Math.abs(username.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % COLORS.length],
});

const clampCursor = (value: number, maxLength: number) => Math.min(Math.max(value, 0), Math.max(maxLength, 0));

const measureCaretPosition = (textarea: HTMLTextAreaElement, cursorPos: number) => {
  const style = window.getComputedStyle(textarea);
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.5;
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 16;
  const paddingTop = Number.parseFloat(style.paddingTop) || 16;
  const safeCursor = clampCursor(cursorPos, textarea.value.length);
  const prefix = textarea.value.slice(0, safeCursor);
  const lastLine = prefix.split('\n').at(-1) ?? '';
  const lineCount = prefix.split('\n').length - 1;
  const charWidth = Math.max(7, fontSize * 0.58);

  return {
    left: paddingLeft + lastLine.length * charWidth,
    top: paddingTop + lineCount * lineHeight,
  };
};

export function App() {
  const [text, setText] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [docTitle, setDocTitle] = useState('Project Notes');
  const [lastSynced, setLastSynced] = useState('just now');
  const [copied, setCopied] = useState(false);
  const [account, setAccount] = useState<Account | null>(() => {
    const savedUsername = getStoredUsername();
    return savedUsername ? buildAccount(savedUsername) : null;
  });
  const [draftUsername, setDraftUsername] = useState(getStoredUsername());
  const [remoteUsers, setRemoteUsers] = useState<Record<string, RemoteUser>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const docRef = useRef<Doc>(createDoc());
  const agentId = useRef(`agent-${Math.random().toString(36).slice(2, 10)}`);
  const docId = useRef<string>('');
  const offlineQueue = useRef<Item[]>([]);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef('');

  if (!docId.current) {
    const urlParams = new URLSearchParams(window.location.search);
    let idFromUrl = urlParams.get('docId');

    if (!idFromUrl) {
      idFromUrl = `doc-${Math.random().toString(36).substring(7)}`;
      window.history.replaceState(null, '', `?docId=${idFromUrl}`);
    }

    docId.current = idFromUrl;
  }

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    if (!account) return;
    localStorage.setItem(USERNAME_KEY, account.username);
  }, [account]);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      setLastSynced('connected');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const sendPresence = (cursorOverride?: number) => {
    if (!account || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const nextCursor = typeof cursorOverride === 'number' ? clampCursor(cursorOverride, textRef.current.length) : textRef.current.length;

    wsRef.current.send(
      JSON.stringify({
        type: 'presence',
        user: {
          id: account.id,
          username: account.username,
          color: account.color,
          cursor: nextCursor,
          typing: true,
          lastSeen: Date.now(),
        },
      }),
    );
  };

  useEffect(() => {
    if (!account) return;

    function connect() {
      wsRef.current = new WebSocket(`ws://localhost:4000?docId=${docId.current}&userId=${account.id}`);

      wsRef.current.onopen = () => {
        setIsOnline(true);
        setLastSynced('syncing');
        sendPresence(editorRef.current?.selectionStart ?? textRef.current.length);

        if (offlineQueue.current.length > 0) {
          wsRef.current?.send(
            JSON.stringify({
              type: 'SYNC_BATCH',
              items: offlineQueue.current,
            }),
          );
        }

        offlineQueue.current = [];
      };

      wsRef.current.onclose = () => {
        setIsOnline(false);
        setLastSynced('offline');
        window.setTimeout(connect, 3000);
      };

      wsRef.current.onmessage = (event) => {
        const payload = JSON.parse(event.data);

        if (payload.type === 'sync') {
          docRef.current = payload.doc;
          const nextText = getContent(docRef.current);
          setText(nextText);
          textRef.current = nextText;
          setLastSynced('synced');
          return;
        }

        if (payload.type === 'presence') {
          const nextUser = payload.user as RemoteUser;
          if (!nextUser?.id || nextUser.id === account?.id) return;

          setRemoteUsers((current) => ({
            ...current,
            [nextUser.id]: {
              ...nextUser,
              lastSeen: Date.now(),
            },
          }));
          return;
        }

        if (payload.type === 'INSERT' || payload.type === 'DELETE') {
          const tempDoc: Doc = createDoc();
          tempDoc.content.push(payload.item);
          mergeInto(docRef.current, tempDoc);
          const nextText = getContent(docRef.current);
          setText(nextText);
          textRef.current = nextText;
          setLastSynced('synced');
          return;
        }

        if (payload.type === 'SYNC_BATCH') {
          const tempDoc: Doc = createDoc();
          for (const item of payload.items) {
            tempDoc.content.push(item);
          }
          mergeInto(docRef.current, tempDoc);
          const nextText = getContent(docRef.current);
          setText(nextText);
          textRef.current = nextText;
          setLastSynced('synced');
        }
      };
    }

    connect();

    return () => wsRef.current?.close();
  }, [account]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newText = e.target.value;
    const cursorPosition = e.target.selectionStart ?? newText.length;
    const previousText = textRef.current;

    if (newText.length > previousText.length) {
      const insertCount = newText.length - previousText.length;
      const startIndex = cursorPosition - insertCount;
      const insertedString = newText.substring(startIndex, cursorPosition);
      const newItems = localInsert(docRef.current, startIndex, agentId.current, insertedString);

      if (newItems.length > 0) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'SYNC_BATCH', items: newItems }));
        } else {
          offlineQueue.current.push(...newItems);
        }
      }
    } else if (newText.length < previousText.length) {
      const deletedCount = previousText.length - newText.length;
      const deletedItems = localDelete(docRef.current, agentId.current, cursorPosition, deletedCount);

      if (deletedItems.length > 0) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'SYNC_BATCH', items: deletedItems }));
        } else {
          offlineQueue.current.push(...deletedItems);
        }
      }
    }

    const nextText = getContent(docRef.current);
    setText(nextText);
    textRef.current = nextText;
    setLastSynced('saved locally');
    sendPresence(cursorPosition);
  }

  const copyDocLink = async () => {
    const url = window.location.href;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleNameSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextAccount = buildAccount(draftUsername);
    setAccount(nextAccount);
    setDraftUsername(nextAccount.username);
  };

  const activeEditors = Object.values(remoteUsers).filter((user) => Date.now() - user.lastSeen < 30000).length + 1;
  const editorCountText = activeEditors === 1 ? '1 person editing' : `${activeEditors} people editing this file`;
  const presenceText = isOnline ? `${activeEditors} editors currently in this document` : 'Changes are queued and will sync when back online';

  if (!account) {
    return (
      <div className="welcome-screen">
        <form className="welcome-card" onSubmit={handleNameSubmit}>
          <div className="eyebrow">Join the workspace</div>
          <h1>What should we call you?</h1>
          <input
            className="username-input"
            value={draftUsername}
            onChange={(event) => setDraftUsername(event.target.value)}
            placeholder="Your name"
            autoFocus
            maxLength={20}
          />
          <button className="primary-button" type="submit">Open editor</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">S</div>
          <div>
            <div className="eyebrow">Shared workspace</div>
            <div className="brand-name">Sync Studio</div>
          </div>
        </div>

        <div className="topbar-actions">
          <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
            <span className="status-dot" />
            {isOnline ? 'Live sync' : 'Offline mode'}
          </div>
          <button type="button" className="secondary-button" onClick={copyDocLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="sidebar-panel">
          <div className="doc-card">
            <label className="field-label">Document title</label>
            <input
              className="title-input"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              aria-label="Document title"
            />
          </div>

          <div className="meta-card highlight-card">
            <div className="meta-row big-row">
              <span className="count-label">Editing now</span>
              <strong className="count-value">{editorCountText}</strong>
            </div>
          </div>

          <div className="meta-card">
            <div className="meta-row">
              <span>Sync state</span>
              <strong>{lastSynced}</strong>
            </div>
            <div className="meta-row">
              <span>Room id</span>
              <strong>{docId.current}</strong>
            </div>
            <div className="meta-row">
              <span>Word count</span>
              <strong>{text.trim() ? text.trim().split(/\s+/).length : 0}</strong>
            </div>
          </div>

          <div className="meta-card collaborator-card">
            <div className="meta-row big-row">
              <span className="count-label">People</span>
            </div>
            <div className="collaborators">
              <div className="person-row">
                <span className="avatar" style={{ background: account.color }}>{account.username.slice(0, 1).toUpperCase()}</span>
                <div className="person-meta">
                  <span>{account.username}</span>
                  <small>You</small>
                </div>
                <span className="presence online" />
              </div>

              {Object.values(remoteUsers)
                .filter((user) => user.id !== account.id && Date.now() - user.lastSeen < 30000)
                .map((user) => (
                  <div className="person-row" key={user.id}>
                    <span className="avatar" style={{ background: user.color }}>{user.username.slice(0, 1).toUpperCase()}</span>
                    <div className="person-meta">
                      <span>{user.username}</span>
                      <small>{user.typing ? 'typing' : 'active'}</small>
                    </div>
                    <span className="presence online" />
                  </div>
                ))}
            </div>
          </div>
        </aside>

        <main className="editor-panel">
          <div className="editor-header">
            <div>
              <div className="section-label muted">Live document</div>
              <h1>{docTitle}</h1>
            </div>
            <div className="signal-box">
              <span className="tiny-dot" />
              {presenceText}
            </div>
          </div>

          <div className="editor-shell">
            <textarea
              ref={editorRef}
              className="editor"
              value={text}
              onChange={handleChange}
              onClick={() => sendPresence(editorRef.current?.selectionStart ?? text.length)}
              onKeyUp={() => sendPresence(editorRef.current?.selectionStart ?? text.length)}
              onSelect={() => sendPresence(editorRef.current?.selectionStart ?? text.length)}
              placeholder="Start typing here..."
              aria-label="Collaborative document"
            />

            {Object.values(remoteUsers)
              .filter((user) => user.id !== account.id && typeof user.cursor === 'number')
              .map((user) => {
                const position = editorRef.current ? measureCaretPosition(editorRef.current, user.cursor ?? 0) : { left: 18, top: 18 };

                return (
                  <div
                    key={user.id}
                    className="remote-cursor"
                    style={{
                      left: `${position.left}px`,
                      top: `${position.top}px`,
                      background: user.color,
                    }}
                  >
                    <span>{user.username}</span>
                  </div>
                );
              })}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
