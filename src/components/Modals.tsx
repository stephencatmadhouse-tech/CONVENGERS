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
  onRegister: (name: string, email: string, pass: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onOpenAdminPanel?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  onClose,
  onLogin,
  onRegister,
  onLogout,
  onOpenAdminPanel,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
        await onRegister(name, email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const isAuthenticated = Boolean(currentUser && currentUser.role !== 'viewer');
  const isPending = currentUser?.role === 'pending' || currentUser?.status === 'pending';
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '520px' }}>
        <div className="shhead">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🛡️</span> Madhouse Team Access Portal
            </h2>
            <div className="text-xs text-[#BAC4E2]">
              Secure Firebase Authentication &amp; Role-Based Access Control
            </div>
          </div>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>

        {/* If Signed In: Show User Profile, Role Badge, Sign Out, and Admin Panel Button */}
        {isAuthenticated ? (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-[#060A24] rounded-lg border-2 border-[#7B4DFF] shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] uppercase text-[#BAC4E2] font-bold tracking-wider">
                  Signed In As:
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-[#E0213B]/20 text-[#FF7A8A] border border-[#E0213B]'
                      : currentUser?.role === 'manager'
                      ? 'bg-[#F5C518]/20 text-[#F5C518] border border-[#F5C518]'
                      : currentUser?.role === 'staff'
                      ? 'bg-[#3A9BFF]/20 text-[#3A9BFF] border border-[#3A9BFF]'
                      : 'bg-[#FF9A1F]/20 text-[#FF9A1F] border border-[#FF9A1F]'
                  }`}
                >
                  ● {currentUser?.role}
                </span>
              </div>

              <div className="text-lg font-bold text-white">{currentUser?.name}</div>
              <div className="text-xs text-[#BAC4E2] font-mono mt-0.5">{currentUser?.email}</div>

              {/* Role explanation */}
              <div className="mt-3 pt-3 border-t border-[#7B4DFF]/30 text-xs leading-relaxed">
                {isPending ? (
                  <div className="text-[#FF9A1F] bg-[#FF9A1F]/10 p-2.5 rounded border border-[#FF9A1F]/30">
                    <b>⚠️ Account Pending Approval:</b> Your registration is awaiting administrator approval. You currently have safe read-only viewer access until an administrator approves your account and assigns your team role.
                  </div>
                ) : isAdmin ? (
                  <div className="text-[#4BE08A]">
                    ✓ <b>Administrator Access:</b> Full permissions to edit all timeline cells, milestones, production dates, notes, and manage team member roles.
                  </div>
                ) : currentUser?.role === 'manager' ? (
                  <div className="text-[#F5C518]">
                    ✓ <b>Project Manager Access:</b> Authorized to edit timeline cells, milestone statuses, and production calendar dates.
                  </div>
                ) : (
                  <div className="text-[#3A9BFF]">
                    ✓ <b>Site Staff Access:</b> Authorized to update milestone statuses and add progress notes.
                  </div>
                )}
              </div>
            </div>

            {/* Admin Management Panel Button (Visible only to Admins) */}
            {isAdmin && onOpenAdminPanel && (
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-lg bg-[#E0213B]/20 hover:bg-[#E0213B]/30 border border-[#E0213B] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(224,33,59,0.3)] transition-all"
                onClick={() => {
                  onClose();
                  onOpenAdminPanel();
                }}
              >
                <span>⚙️</span> Open Admin User Management Panel
              </button>
            )}

            <div className="shrow justify-between pt-2">
              <button
                type="button"
                className="shbtn"
                style={{ borderColor: '#E0213B', color: '#FF7A8A' }}
                onClick={async () => {
                  await onLogout();
                  onClose();
                }}
              >
                Sign Out
              </button>
              <button type="button" className="shbtn pri" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          /* If Not Signed In (Viewer): Clean Email & Password Form (No one-click accounts) */
          <div>
            <div className="p-3 mb-3 bg-[#060A24] rounded-lg border border-[#BAC4E2]/30">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase text-[#BAC4E2] font-bold tracking-wider">
                  Access Level:
                </span>
                <span className="bg-[#BAC4E2]/20 text-[#BAC4E2] px-2 py-0.5 rounded text-xs font-bold uppercase">
                  👁️ VIEWER (READ-ONLY)
                </span>
              </div>
              <p className="mt-1.5 text-xs text-[#BAC4E2]/80 leading-relaxed">
                Viewing in presentation mode. Timeline cells, milestone statuses, and production dates are locked to prevent accidental edits.
              </p>
            </div>

            <div className="shtabs mb-3">
              <button
                type="button"
                className={mode === 'login' ? 'act' : ''}
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                Team Sign In
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'act' : ''}
                onClick={() => {
                  setMode('register');
                  setError('');
                }}
              >
                Register New Member
              </button>
            </div>

            {error && (
              <div className="p-2.5 mb-3 bg-red-950/80 border border-red-500 rounded text-red-200 text-xs">
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
                    placeholder="Engr. Stephen Catapang"
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <span className="pmlbl block mb-1">Email address</span>
                <input
                  className="pmi w-full font-mono text-xs"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@madhouse.ph"
                  autoComplete="email"
                />
              </div>

              <div>
                <span className="pmlbl block mb-1">Password</span>
                <input
                  className="pmi w-full font-mono text-xs"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {mode === 'register' && (
                <div className="p-2.5 bg-[#121C5A] border border-[#7B4DFF]/40 rounded text-[11px] text-[#BAC4E2] leading-relaxed">
                  ℹ️ Newly registered team accounts receive <b className="text-[#FF9A1F]">pending</b> status and safe read-only access until an administrator verifies your identity and assigns your role.
                </div>
              )}

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="shbtn pri flex-1"
                >
                  {loading
                    ? 'Authenticating...'
                    : mode === 'login'
                    ? 'Sign In with Firebase'
                    : 'Submit Registration'}
                </button>
                <button type="button" className="shbtn" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
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
}> = ({ onClose, onPrintPdf, onCopyLink: _onCopyLink }) => {
  const [tab, setTab] = useState<'share' | 'export'>('share');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const getOrigin = () => (typeof window !== 'undefined' ? window.location.origin : '');

  // 1. Presentation links (Guaranteed Read-Only)
  const presentationCustomUrl = 'https://www.convengersassemble.com/?view=presentation';
  const presentationLiveUrl = `${getOrigin()}/?view=presentation`;

  // 2. Madhouse Team links (Editor Access with authentication)
  const teamCustomUrl = 'https://www.convengersassemble.com/?team=login';
  const teamLiveUrl = `${getOrigin()}/?team=login`;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedLink(label);
        setTimeout(() => setCopiedLink(null), 2200);
      }
    } catch {
      // fallback
    }
  };

  const shareText = `Convengers Assemble — Scope of Work Timeline & Production Calendar\n\n👁️ FOR CLIENTS / VIEWERS (Read-Only Presentation):\n${presentationCustomUrl}\n\n🛡️ FOR MADHOUSE TEAM (Editor Access):\n${teamCustomUrl}`;

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '600px' }}>
        <div className="shhead">
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">Convengers Assemble — Share Portal</h2>
            <div className="text-xs text-[#F5C518] font-mono">www.ConvengersAssemble.com</div>
          </div>
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
            Share Links (Viewer vs Team)
          </button>
          <button
            type="button"
            className={tab === 'export' ? 'act' : ''}
            onClick={() => setTab('export')}
          >
            Export &amp; PDF
          </button>
        </div>

        {tab === 'share' ? (
          <div className="flex flex-col gap-4">
            {/* SECTION 1: Presentation Link (Read-Only) */}
            <div className="p-3.5 bg-[#060A24] rounded-lg border-2 border-[#BAC4E2]/40 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>👁️</span> 1. Presentation Link (Guaranteed Read-Only)
                </span>
                <span className="text-[10px] bg-[#BAC4E2]/20 text-[#BAC4E2] px-2 py-0.5 rounded font-bold uppercase">
                  Safe For Stakeholders
                </span>
              </div>
              <p className="text-xs text-[#BAC4E2] mb-3 leading-relaxed">
                Provide this link to clients, viewers, and external stakeholders for meetings. Editing tools, resets, and cell updates are locked so the presentation cannot be altered.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-[11px] font-mono text-[#BAC4E2]/70 block mb-0.5">Custom Domain Presentation:</span>
                  <div className="shlink">
                    <input readOnly value={presentationCustomUrl} className="font-mono text-xs text-[#F5C518]" />
                    <button
                      type="button"
                      className="shbtn pri"
                      onClick={() => copyToClipboard(presentationCustomUrl, 'pres_custom')}
                    >
                      {copiedLink === 'pres_custom' ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-mono text-[#BAC4E2]/70 block mb-0.5">Direct Cloud Presentation:</span>
                  <div className="shlink">
                    <input readOnly value={presentationLiveUrl} className="font-mono text-xs text-white" />
                    <button
                      type="button"
                      className="shbtn"
                      onClick={() => copyToClipboard(presentationLiveUrl, 'pres_cloud')}
                    >
                      {copiedLink === 'pres_cloud' ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* SECTION 2: Madhouse Team Portal (Editor Access) */}
            <div className="p-3.5 bg-[#060A24] rounded-lg border-2 border-[#7B4DFF] shadow-[0_0_12px_rgba(123,77,255,0.25)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-bold text-[#F5C518] flex items-center gap-1.5">
                  <span>🛡️</span> 2. Madhouse Team Link (Editor Access)
                </span>
                <span className="text-[10px] bg-[#E0213B]/20 text-[#FF7A8A] px-2 py-0.5 rounded font-bold uppercase">
                  Team Members Only
                </span>
              </div>
              <p className="text-xs text-[#BAC4E2] mb-3 leading-relaxed">
                Share with the Madhouse team (Stephen, Admin, Manager, Site Staff). Opens the login portal allowing authorized users to edit milestone statuses, scope percentages, and production dates in real-time.
              </p>

              <div className="space-y-2">
                <div>
                  <span className="text-[11px] font-mono text-[#BAC4E2]/70 block mb-0.5">Custom Domain Team Portal:</span>
                  <div className="shlink">
                    <input readOnly value={teamCustomUrl} className="font-mono text-xs text-[#F5C518]" />
                    <button
                      type="button"
                      className="shbtn pri"
                      onClick={() => copyToClipboard(teamCustomUrl, 'team_custom')}
                    >
                      {copiedLink === 'team_custom' ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-mono text-[#BAC4E2]/70 block mb-0.5">Direct Cloud Team Portal:</span>
                  <div className="shlink">
                    <input readOnly value={teamLiveUrl} className="font-mono text-xs text-white" />
                    <button
                      type="button"
                      className="shbtn"
                      onClick={() => copyToClipboard(teamLiveUrl, 'team_cloud')}
                    >
                      {copiedLink === 'team_cloud' ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* WhatsApp & Quick Share */}
            <div className="shrow justify-between pt-1">
              <button
                type="button"
                className="shbtn pri flex-1"
                onClick={() => {
                  window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
                }}
              >
                Share Formatted Links via WhatsApp
              </button>
              <button type="button" className="shbtn" onClick={onClose}>
                Done
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
            <button
              type="button"
              className="shbtn"
              onClick={() => copyToClipboard(presentationLiveUrl, 'export_copy')}
            >
              {copiedLink === 'export_copy' ? 'Copied!' : 'Copy Read-Only Presentation Link'}
              <small>The direct link to the viewer presentation.</small>
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
