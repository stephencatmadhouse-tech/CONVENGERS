/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { RemoteFocus } from '../types/index.ts';
import { realtime } from '../utils/realtime.ts';

interface CollaborativeCellProps {
  cellId: string;
  value: string | number;
  remoteFocus?: RemoteFocus;
  canEdit: boolean;
  onSave: (val: string) => void;
  inputType?: 'text' | 'number';
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  displayRenderer?: (val: any) => React.ReactNode;
  fallbackValue?: string | number;
  min?: number;
  max?: number;
  onViewerAttemptEdit?: () => void;
}

export const CollaborativeCell: React.FC<CollaborativeCellProps> = ({
  cellId,
  value,
  remoteFocus,
  canEdit,
  onSave,
  inputType = 'text',
  placeholder = '',
  className = '',
  style = {},
  displayRenderer,
  fallbackValue,
  min,
  max,
  onViewerAttemptEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentVal, setCurrentVal] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external changes (e.g. from teammates) when not actively editing
  useEffect(() => {
    if (!isEditing) {
      const effective = (value !== undefined && value !== null && String(value).trim()) 
        ? String(value) 
        : String(fallbackValue ?? '');
      setCurrentVal(effective);
    }
  }, [value, fallbackValue, isEditing]);

  const handleStartEdit = () => {
    if (!canEdit) return;
    setIsEditing(true);
    realtime.focusCell(cellId);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
  };

  const handleFinishEdit = () => {
    setIsEditing(false);
    realtime.blurCell(cellId);

    const trimmed = currentVal.trim();
    // Prevent clearing milestone titles or dates into blank space
    if (!trimmed && fallbackValue !== undefined) {
      const fb = String(fallbackValue);
      setCurrentVal(fb);
      onSave(fb);
      return;
    }

    if (trimmed !== String(value)) {
      onSave(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFinishEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      realtime.blurCell(cellId);
      setCurrentVal(String(value ?? fallbackValue ?? ''));
    }
  };

  const effectiveDisplay = (currentVal && currentVal.trim()) 
    ? currentVal 
    : (fallbackValue !== undefined ? String(fallbackValue) : placeholder);

  // In viewer mode: render as plain text, not as an input. If user double clicks, notify them.
  if (!canEdit) {
    return (
      <span
        onDoubleClick={onViewerAttemptEdit}
        className={`inline-block select-text ${className}`}
        style={style}
        title="Viewing in read-only presentation mode. Sign in to edit."
      >
        {displayRenderer ? displayRenderer(effectiveDisplay) : effectiveDisplay}
      </span>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center transition-all ${className}`}
      style={{
        ...style,
        outline: remoteFocus ? `2px solid ${remoteFocus.userColor}` : undefined,
        outlineOffset: '2px',
        borderRadius: '4px',
      }}
    >
      {/* Google Sheets Remote Collaborator Name Tag */}
      {remoteFocus && (
        <span
          className="absolute -top-3.5 right-0 z-20 px-1.5 py-0.2 text-[10px] font-bold rounded shadow-md pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-90"
          style={{
            background: remoteFocus.userColor,
            color: 'var(--sx-text-1)',
            lineHeight: '14px',
          }}
        >
          {remoteFocus.userName} editing...
        </span>
      )}

      {isEditing ? (
        <input
          ref={inputRef}
          type={inputType}
          min={min}
          max={max}
          value={currentVal}
          onChange={(e) => setCurrentVal(e.target.value)}
          onBlur={handleFinishEdit}
          onKeyDown={handleKeyDown}
          className="w-full bg-[var(--sx-bg-5)] text-[var(--sx-text-3)] border-2 border-[var(--sx-border-4)] rounded px-1.5 py-0.5 font-inherit text-inherit outline-none shadow-inner"
        />
      ) : (
        <div
          onClick={handleStartEdit}
          className="cursor-pointer w-full select-text transition-colors rounded px-0.5 hover:bg-[var(--sx-hover)] hover:outline-dashed hover:outline-1 hover:outline-[var(--sx-border-4)]/50"
          title="Click to edit in real time (syncs to all teammates)"
        >
          {displayRenderer ? displayRenderer(effectiveDisplay) : effectiveDisplay}
        </div>
      )}
    </div>
  );
};
