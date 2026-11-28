'use client';

import { FormEvent, ReactNode, useRef, useState } from 'react';
import { Project } from '../../lib/control-plane';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export function canEditProject(role?: Project['role']): boolean {
  return role === 'OWNER' || role === 'EDITOR';
}

export function isProjectOwner(role?: Project['role']): boolean {
  return role === 'OWNER';
}

export function isNoBodyStatusCode(statusCode: number): boolean {
  return (
    statusCode === 204 ||
    statusCode === 205 ||
    statusCode === 304 ||
    (statusCode >= 100 && statusCode < 200)
  );
}

export function parseJsonInput(
  raw: string,
  fieldLabel: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown };
  } catch {
    return {
      ok: false,
      message: `Invalid JSON in ${fieldLabel}. Please check your syntax and try again.`,
    };
  }
}

export function parseHeadersJson(
  raw: string,
): { ok: true; value: Record<string, string> } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      message: 'Invalid JSON in Headers. Expected a JSON object of string key/value pairs.',
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      message: 'Headers must be a JSON object (e.g. {"content-type": "application/json"}).',
    };
  }
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') {
      return {
        ok: false,
        message: `Header "${k}" must have a string value.`,
      };
    }
    result[k] = v;
  }
  return { ok: true, value: result };
}

export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <div className="empty-mark" aria-hidden="true">
        ⌘
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function FormPanel({
  title,
  children,
  onSubmit,
  id,
  resetOnSuccess = true,
}: {
  title: string;
  children: ReactNode;
  onSubmit: (form: FormData) => Promise<boolean>;
  id?: string;
  resetOnSuccess?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const formData = new FormData(event.currentTarget);
      const succeeded = await onSubmit(formData);
      if (succeeded && resetOnSuccess) {
        formRef.current?.reset();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel form-panel" id={id}>
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <form ref={formRef} className="form-grid" onSubmit={handleSubmit}>
        <fieldset className="form-fieldset" disabled={busy}>
          <div className="form-fields">{children}</div>
        </fieldset>
        {busy && (
          <span className="form-busy" role="status">
            Saving…
          </span>
        )}
      </form>
    </section>
  );
}
