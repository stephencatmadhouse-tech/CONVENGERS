/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, UserRole, AuditLog } from '../types/index.ts';

interface AuthModalProps {
  currentUser: User | null;
  onClose: () => void;
  onLogin: (email: string, pass: string) => Promise<void>;
  onRegister: (name: string, email: string, pass: string, role: UserRole) => Promise<void>;
  onSwitchDemo: (email: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  onClose,
  onLogin,
  onRegister,
  onSwitchDemo,
  onLogout,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(name, email, password, role);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (demoEmail: string) => {
    setError('');
    setLoading(true);
    try {
      await onSwitchDemo(demoEmail);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '500px' }}>
        <div className="shhead">
          <h2>User Authentication &amp; Roles</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>

        {currentUser ? (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-[#060A24] rounded-lg border border-[#7B4DFF]">
              <div className="text-xs uppercase text-[#BAC4E2] font-bold">Currently Signed In As:</div>
              <div className="text-lg font-bold text-[#F5C518] mt-1">{currentUser.name}</div>
              <div className="text-sm text-[#BAC4E2]">{currentUser.email}</div>
              <div className="mt-2 inline-block px-2.5 py-0.5 rounded text-xs font-bold bg-[#1d2a85] text-white">
                Role: {currentUser.role.toUpperCase()}
              </div>
            </div>

            <div className="text-xs text-[#BAC4E2]">
              Switch to another role instantly:
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="shbtn text-left p-2.5"
                onClick={() => handleDemo('admin@convengers.ph')}
              >
                <b className="text-[#E0213B] block">Administrator</b>
                <small className="text-xs text-[#BAC4E2]">Full control &amp; reset</small>
              </button>
              <button
                type="button"
                className="shbtn text-left p-2.5"
                onClick={() => handleDemo('manager@convengers.ph')}
              >
                <b className="text-[#F5C518] block">Manager</b>
                <small className="text-xs text-[#BAC4E2]">Manage activities &amp; pours</small>
              </button>
              <button
                type="button"
                className="shbtn text-left p-2.5"
                onClick={() => handleDemo('staff@convengers.ph')}
              >
                <b className="text-[#3A9BFF] block">Site Staff</b>
                <small className="text-xs text-[#BAC4E2]">Update progress %</small>
              </button>
              <button
                type="button"
                className="shbtn text-left p-2.5"
                onClick={() => handleDemo('viewer@convengers.ph')}
              >
                <b className="text-[#BAC4E2] block">Viewer</b>
                <small className="text-xs text-[#BAC4E2]">Read-only access</small>
              </button>
            </div>

            <div className="shrow justify-between mt-2">
              <button
                type="button"
                className="shbtn"
                style={{ borderColor: '#E0213B', color: '#FF7A8A' }}
                onClick={async () => {
                  await onLogout();
                  onClose();
                }}
              >
                Sign out
              </button>
              <button type="button" className="shbtn pri" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="shtabs">
              <button
                type="button"
                className={mode === 'login' ? 'act' : ''}
                onClick={() => setMode('login')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'act' : ''}
                onClick={() => setMode('register')}
              >
                Register
              </button>
            </div>

            {error && (
              <div className="p-2 mb-3 bg-red-950/70 border border-red-500 rounded text-red-200 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === 'register' && (
                <div>
                  <span className="pmlbl block mb-1">Full Name</span>
                  <input
                    className="pmi w-full"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Engr. Juan Dela Cruz"
                  />
                </div>
              )}

              <div>
                <span className="pmlbl block mb-1">Email address</span>
                <input
                  className="pmi w-full"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@convengers.ph"
                />
              </div>

              <div>
                <span className="pmlbl block mb-1">Password</span>
                <input
                  className="pmi w-full"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {mode === 'register' && (
                <div>
                  <span className="pmlbl block mb-1">Role</span>
                  <select
                    className="pms w-full"
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                  >
                    <option value="viewer">Viewer (Read-only)</option>
                    <option value="staff">Staff (Update progress)</option>
                    <option value="manager">Manager (Manage activities &amp; content)</option>
                    <option value="admin">Administrator (Full access)</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="shbtn pri w-full mt-2"
              >
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-[#7B4DFF]/40">
              <span className="text-xs text-[#BAC4E2] block mb-2 font-bold">Or quick switch to demo account:</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  className="shbtn text-left p-2"
                  onClick={() => handleDemo('admin@convengers.ph')}
                >
                  <b className="text-[#E0213B] block">Administrator</b>
                  <span className="text-[11px] text-[#BAC4E2]">admin@convengers.ph</span>
                </button>
                <button
                  type="button"
                  className="shbtn text-left p-2"
                  onClick={() => handleDemo('manager@convengers.ph')}
                >
                  <b className="text-[#F5C518] block">Manager</b>
                  <span className="text-[11px] text-[#BAC4E2]">manager@convengers.ph</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ShareModal: React.FC<{
  onClose: () => void;
  onPrintPdf: () => void;
  onCopyLink: () => void;
}> = ({ onClose, onPrintPdf, onCopyLink }) => {
  const [tab, setTab] = useState<'share' | 'export'>('share');
  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://convengers.ph';
  const shareText = `Here is the Convengers Bahay Build timeline: schedule, scopes of work, key milestones and content calendar.\n\nLink: ${currentUrl}`;

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '540px' }}>
        <div className="shhead">
          <h2>Convengers Bahay Build Timeline</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="shtabs">
          <button
            type="button"
            className={tab === 'share' ? 'act' : ''}
            onClick={() => setTab('share')}
          >
            Share
          </button>
          <button
            type="button"
            className={tab === 'export' ? 'act' : ''}
            onClick={() => setTab('export')}
          >
            Export
          </button>
        </div>

        {tab === 'share' ? (
          <div>
            <textarea
              id="shmsg"
              readOnly
              value={shareText}
              style={{ width: '100%', minHeight: '84px', marginBottom: '12px' }}
            />
            <div className="shlink">
              <input readOnly value={currentUrl} />
              <button type="button" className="shbtn" onClick={onCopyLink}>
                Copy link
              </button>
            </div>
            <div className="shrow">
              <button
                type="button"
                className="shbtn pri"
                onClick={() => {
                  window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
                }}
              >
                WhatsApp
              </button>
            </div>
          </div>
        ) : (
          <div className="shexp">
            <button
              type="button"
              className="shbtn"
              onClick={() => {
                onClose();
                onPrintPdf();
              }}
            >
              Print / save PDF
              <small>One landscape page per slide. Pick your paper size in the toolbar first.</small>
            </button>
            <button type="button" className="shbtn" onClick={onCopyLink}>
              Copy link
              <small>The direct link to this real-time project application.</small>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const AuditLogModal: React.FC<{
  logs: AuditLog[];
  onClose: () => void;
}> = ({ logs, onClose }) => {
  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '720px' }}>
        <div className="shhead">
          <h2>System Audit Trail</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>
        <p style={{ fontSize: '13px', color: '#BAC4E2', margin: '0 0 10px' }}>
          Server-side tracking of changes, updates, user actions, and security events.
        </p>

        <div style={{ maxHeight: '380px', overflowY: 'auto' }} className="pmscroll">
          {logs.length === 0 ? (
            <div className="pmempty">No audit events recorded yet.</div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderBottom: '1px solid rgba(123,77,255,0.25)',
                  fontSize: '12px',
                }}
              >
                <div>
                  <b className="text-[#F5C518]">{log.action}</b> on <span className="text-[#BAC4E2]">{log.entityType}</span>
                  {log.details && <div className="text-white text-[11px] mt-0.5">{log.details}</div>}
                </div>
                <div style={{ textAlign: 'right', flex: 'none', marginLeft: '12px' }}>
                  <div className="text-white font-semibold">{log.userEmail}</div>
                  <small className="text-[#BAC4E2]">{new Date(log.timestamp).toLocaleString()}</small>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="shrow mt-4">
          <button type="button" className="shbtn pri" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
