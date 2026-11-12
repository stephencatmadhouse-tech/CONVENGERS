/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Collaborator, User } from '../types/index.ts';
import { realtime } from '../utils/realtime.ts';

interface CollaboratorBarProps {
  collaborators: Collaborator[];
  currentUser: User | null;
  isLiveConnected: boolean;
}

export const CollaboratorBar: React.FC<CollaboratorBarProps> = ({
  collaborators,
  currentUser,
  isLiveConnected,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(() => realtime.getDisplayName());

  const currentClientId = realtime.clientId;
  const myColor = realtime.userColor;
  const myName = realtime.getDisplayName();

  // Filter other teammates (exclude ourselves so we don't duplicate avatar)
  const others = collaborators.filter((c) => c.clientId !== currentClientId);
  const totalCount = others.length + 1;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      realtime.setDisplayName(nameInput.trim());
    }
    setIsEditingName(false);
  };

  return (
    <div className="flex items-center gap-2 select-none">
      {/* Live Sync Badge */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
        style={{
          background: isLiveConnected ? 'rgba(75, 224, 138, 0.15)' : 'var(--sxa-bg-7)',
          border: `1px solid ${isLiveConnected ? '#4BE08A' : 'var(--sxa-border-2)'}`,
          color: isLiveConnected ? 'var(--sx-text-8)' : 'var(--sx-text-10)',
        }}
        title={
          isLiveConnected
            ? 'Connected live. Instant real-time cell sync active across laptops and phones.'
            : 'Connecting real-time sync stream...'
        }
      >
        <span
          className={`w-2 h-2 rounded-full inline-block ${isLiveConnected ? 'animate-pulse' : ''}`}
          style={{ background: isLiveConnected ? '#4BE08A' : 'var(--sxa-bg-1)' }}
        />
        <span>{isLiveConnected ? 'LIVE SYNC' : 'CONNECTING...'}</span>
      </div>

      {/* Collaborators Avatar Stack (Google Sheets style) */}
      <div
        className="flex items-center -space-x-1.5 bg-[var(--sx-bg-5)] border border-[var(--sx-border-6)]/50 px-2 py-0.5 rounded-full"
        title={`${totalCount} collaborator${totalCount > 1 ? 's' : ''} currently on this timeline sheet`}
      >
        {/* Current User Pill */}
        <button
          type="button"
          onClick={() => setIsEditingName(true)}
          className="relative group w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] text-[var(--sx-text-1)] shadow transition-transform hover:scale-110 focus:outline-none cursor-pointer"
          style={{ background: myColor, border: 'var(--sx-border-24)' }}
          title={`You (${myName}) · Click to change name`}
        >
          {myName.charAt(0).toUpperCase()}
          <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[var(--sx-bg-14)] border border-[var(--sx-border-6)] text-[var(--sx-ink)] text-[11px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-50">
            You: {myName} (Click to edit)
          </span>
        </button>

        {/* Other Active Teammates */}
        {others.slice(0, 5).map((col) => {
          const initials = col.userName.charAt(0).toUpperCase();
          return (
            <div
              key={col.clientId}
              className="relative group w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] text-[var(--sx-text-1)] shadow transition-transform hover:scale-110"
              style={{ background: col.userColor, border: 'var(--sx-border-24)' }}
            >
              {initials}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center bg-[var(--sx-bg-14)] border border-[var(--sx-border-6)] text-[var(--sx-ink)] text-[11px] px-2.5 py-1 rounded shadow-xl whitespace-nowrap z-50">
                <span className="font-semibold">{col.userName}</span>
                <span className="text-[10px] text-[var(--sx-text-2)]">
                  {col.device === 'mobile' ? '📱 Mobile' : '💻 Laptop'} · {col.userRole.toUpperCase()}
                </span>
                {col.focusedCellId && (
                  <span className="text-[9px] text-[var(--sx-text-3)]">Editing cell...</span>
                )}
              </div>
            </div>
          );
        })}

        {others.length > 5 && (
          <div
            className="w-6 h-6 rounded-full bg-[var(--sx-bg-22)] text-[var(--sx-ink)] font-bold text-[10px] flex items-center justify-center border-2 border-[var(--sx-border-23)]"
            title={`${others.length - 5} more teammates online`}
          >
            +{others.length - 5}
          </div>
        )}
      </div>

      {/* Online Count Indicator */}
      <span className="text-xs text-[var(--sx-text-2)] font-medium hidden sm:inline">
        {totalCount === 1 ? '1 online' : `${totalCount} teammates live`}
      </span>

      {/* Modal / Popover to change display nickname */}
      {isEditingName && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSaveName}
            className="bg-[var(--sx-bg-14)] border-2 border-[var(--sx-border-6)] rounded-xl p-5 w-full max-w-sm shadow-2xl flex flex-col gap-3 font-['Barlow']"
          >
            <h3 className="font-extrabold text-lg uppercase tracking-wider text-[var(--sx-text-3)]">
              Your Collaborator Name
            </h3>
            <p className="text-xs text-[var(--sx-text-2)]">
              Teammates on their laptops and phones will see this name tag next to cells you edit.
            </p>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Stephen, Architect Joy, Engr. Mark"
              maxLength={24}
              autoFocus
              className="bg-[var(--sx-bg-5)] border border-[var(--sx-border-6)] rounded-lg px-3 py-2 text-sm text-[var(--sx-ink)] focus:outline-none focus:border-[var(--sx-border-4)]"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsEditingName(false)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-transparent border border-[var(--sx-border-6)] text-[var(--sx-text-2)] hover:bg-[var(--sx-bg-22)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-md text-xs font-bold bg-[var(--sx-bg-12)] text-[var(--sx-text-1)] hover:bg-[#ffd233]"
              >
                Save &amp; Broadcast
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
