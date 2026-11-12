/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, UserRole, UserStatus } from '../types/index.ts';
import { authService } from '../firebase/authService.ts';

interface AdminPanelModalProps {
  currentUser: User;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  currentUser,
  onClose,
  onShowToast,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Confirmation state
  const [confirmDialog, setConfirmDialog] = useState<{
    targetUser: User;
    actionType: 'changeRole' | 'revoke' | 'approve';
    newRole?: UserRole;
    newStatus?: UserStatus;
  } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await authService.getAllUsers();
      // Sort: Pending first, then Admin, then others
      list.sort((a, b) => {
        if (a.role === 'pending' && b.role !== 'pending') return -1;
        if (b.role === 'pending' && a.role !== 'pending') return 1;
        return a.name.localeCompare(b.name);
      });
      setUsers(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load team users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleConfirmAction = async () => {
    if (!confirmDialog) return;
    const { targetUser, actionType, newRole, newStatus } = confirmDialog;
    setActionInProgress(targetUser.id);
    setConfirmDialog(null);

    try {
      if (actionType === 'revoke') {
        await authService.revokeUserAccess(targetUser.id);
        onShowToast(`Revoked access for ${targetUser.name}`);
      } else {
        const role = newRole || 'staff';
        const status = newStatus || 'active';
        await authService.updateUserRole(targetUser.id, role, status);
        onShowToast(`Updated ${targetUser.name} to ${role.toUpperCase()} (${status})`);
      }
      await fetchUsers();
    } catch (err: any) {
      onShowToast(err.message || 'Action failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const roleColors: Record<string, { bg: string; text: string; border: string }> = {
    admin: { bg: 'rgba(224, 33, 59, 0.2)', text: 'var(--sx-text-13)', border: '#E0213B' },
    manager: { bg: 'var(--sx-bg-15)', text: 'var(--sx-text-3)', border: 'var(--sx-border-4)' },
    staff: { bg: 'rgba(58, 155, 255, 0.2)', text: 'var(--sx-text-11)', border: '#3A9BFF' },
    viewer: { bg: 'var(--sx-bg-16)', text: 'var(--sx-text-2)', border: 'var(--sx-border-17)' },
    pending: { bg: 'rgba(255, 154, 31, 0.2)', text: 'var(--sx-text-10)', border: '#FF9A1F' },
  };

  const pendingCount = users.filter((u) => u.role === 'pending' || u.status === 'pending').length;

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '820px', width: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="shhead flex-none">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <h2 className="text-lg font-bold text-[var(--sx-ink)] tracking-wide">Madhouse Admin Panel — Team Roles &amp; Access</h2>
              {pendingCount > 0 && (
                <span className="bg-[#FF9A1F] text-[var(--sx-text-1)] font-bold text-xs px-2 py-0.5 rounded-full animate-pulse">
                  {pendingCount} Pending Approval
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--sx-text-2)] mt-0.5">
              Manage team members, approve pending registrations, and set role-based access for Convengers Bahay Build.
            </p>
          </div>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Status / Error */}
        {error && (
          <div className="p-3 mb-3 bg-red-950/70 border border-red-500 rounded text-red-200 text-xs">
            {error}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pmscroll pr-1 mt-2">
          {loading ? (
            <div className="flex items-center justify-center p-12 text-[var(--sx-text-3)] gap-3">
              <div className="w-6 h-6 border-2 border-[var(--sx-border-4)] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-semibold">Loading team roster from Firestore...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-[var(--sx-text-2)] text-sm bg-[var(--sx-bg-5)] rounded-lg border border-[var(--sx-border-6)]/40">
              No registered team members found in Firestore yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const rStyle = roleColors[u.role] || roleColors.viewer;
                const isPending = u.role === 'pending' || u.status === 'pending';
                const isRevoked = u.status === 'revoked';

                return (
                  <div
                    key={u.id}
                    className={`p-3.5 rounded-lg border transition-all ${
                      isPending
                        ? 'bg-[#181105] border-[#FF9A1F]/80 shadow-[0_0_12px_rgba(255,154,31,0.2)]'
                        : isRevoked
                        ? 'bg-[#150a0f] border-red-900/60 opacity-60'
                        : 'bg-[var(--sx-bg-5)] border-[var(--sx-border-6)]/50 hover:border-[var(--sx-border-6)]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* User Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[var(--sx-ink)] text-sm">{u.name}</span>
                          {isSelf && (
                            <span className="text-[10px] bg-[var(--sx-bg-7)]/40 text-[var(--sx-text-2)] px-1.5 py-0.5 rounded font-mono">
                              You (Current Admin)
                            </span>
                          )}
                          <span
                            className="text-[11px] font-bold px-2 py-0.5 rounded border uppercase"
                            style={{
                              background: rStyle.bg,
                              color: rStyle.text,
                              borderColor: rStyle.border,
                            }}
                          >
                            {u.role}
                          </span>
                          {u.status && (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded uppercase ${
                                u.status === 'active'
                                  ? 'text-[var(--sx-text-8)]'
                                  : u.status === 'revoked'
                                  ? 'text-[var(--sx-text-9)]'
                                  : 'text-[var(--sx-text-10)]'
                              }`}
                            >
                              ● {u.status}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--sx-text-2)] font-mono mt-0.5 truncate">{u.email}</div>
                      </div>

                      {/* Action Controls */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        {isSelf ? (
                          <span className="text-xs text-[var(--sx-text-2)]/70 italic px-2 py-1">
                            Role locked (cannot change own role)
                          </span>
                        ) : isPending ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={actionInProgress === u.id}
                              onClick={() =>
                                setConfirmDialog({
                                  targetUser: u,
                                  actionType: 'approve',
                                  newRole: 'staff',
                                  newStatus: 'active',
                                })
                              }
                              className="px-2.5 py-1 rounded bg-[#3A9BFF]/20 hover:bg-[#3A9BFF]/40 border border-[#3A9BFF] text-[var(--sx-text-11)] text-xs font-bold transition-all"
                            >
                              Approve as Staff
                            </button>
                            <button
                              type="button"
                              disabled={actionInProgress === u.id}
                              onClick={() =>
                                setConfirmDialog({
                                  targetUser: u,
                                  actionType: 'approve',
                                  newRole: 'manager',
                                  newStatus: 'active',
                                })
                              }
                              className="px-2.5 py-1 rounded bg-[var(--sx-bg-12)]/20 hover:bg-[var(--sx-bg-12)]/40 border border-[var(--sx-border-4)] text-[#F5C518] text-xs font-bold transition-all"
                            >
                              Approve as Manager
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-[var(--sx-text-2)] flex items-center gap-1">
                              <span>Role:</span>
                              <select
                                className="pms text-xs py-1 px-2 font-semibold"
                                value={u.role}
                                disabled={actionInProgress === u.id}
                                onChange={(e) => {
                                  const next = e.target.value as UserRole;
                                  if (next !== u.role) {
                                    setConfirmDialog({
                                      targetUser: u,
                                      actionType: 'changeRole',
                                      newRole: next,
                                      newStatus: 'active',
                                    });
                                  }
                                }}
                              >
                                <option value="admin">Administrator</option>
                                <option value="manager">Manager</option>
                                <option value="staff">Site Staff</option>
                                <option value="viewer">Viewer (Read-only)</option>
                                <option value="pending">Pending</option>
                              </select>
                            </label>

                            {!isRevoked ? (
                              <button
                                type="button"
                                disabled={actionInProgress === u.id}
                                onClick={() =>
                                  setConfirmDialog({
                                    targetUser: u,
                                    actionType: 'revoke',
                                  })
                                }
                                className="px-2.5 py-1 rounded border border-[#E0213B]/60 hover:border-[#E0213B] bg-[#E0213B]/10 hover:bg-[#E0213B]/30 text-[var(--sx-text-13)] text-xs font-semibold transition-all"
                              >
                                Revoke
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={actionInProgress === u.id}
                                onClick={() =>
                                  setConfirmDialog({
                                    targetUser: u,
                                    actionType: 'approve',
                                    newRole: 'viewer',
                                    newStatus: 'active',
                                  })
                                }
                                className="px-2.5 py-1 rounded border border-[#4BE08A]/60 bg-[#4BE08A]/10 text-[var(--sx-text-8)] text-xs font-semibold"
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirmation Modal Overlay */}
        {confirmDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
            <div className="p-5 bg-[var(--sx-bg-14)] border-2 border-[var(--sx-border-4)] rounded-xl shadow-[0_0_24px_rgba(245,197,24,0.3)] max-w-md w-full">
              <h3 className="text-base font-bold text-[var(--sx-ink)] mb-2 flex items-center gap-2">
                <span>⚠️</span> Confirm Role &amp; Access Change
              </h3>

              <div className="text-xs text-[var(--sx-text-2)] leading-relaxed mb-4">
                {confirmDialog.actionType === 'revoke' ? (
                  <span>
                    Are you sure you want to <b className="text-[var(--sx-text-13)]">revoke access</b> for{' '}
                    <b className="text-[var(--sx-ink)]">{confirmDialog.targetUser.name}</b> ({confirmDialog.targetUser.email})?
                    Their permissions will be immediately set to read-only viewer.
                  </span>
                ) : (
                  <span>
                    Are you sure you want to change <b className="text-[var(--sx-ink)]">{confirmDialog.targetUser.name}</b>'s role to{' '}
                    <b className="text-[var(--sx-text-3)] uppercase">{confirmDialog.newRole}</b>?
                  </span>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="shbtn"
                  onClick={() => setConfirmDialog(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`shbtn ${confirmDialog.actionType === 'revoke' ? '' : 'pri'}`}
                  style={
                    confirmDialog.actionType === 'revoke'
                      ? { borderColor: '#E0213B', background: '#E0213B', color: '#fff' }
                      : undefined
                  }
                  onClick={handleConfirmAction}
                >
                  Yes, Confirm Change
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="shrow justify-between pt-3 mt-3 border-t border-[var(--sx-border-6)]/40 flex-none">
          <button
            type="button"
            className="shbtn text-xs"
            onClick={fetchUsers}
            disabled={loading}
          >
            ↻ Refresh User List
          </button>
          <button type="button" className="shbtn pri" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
