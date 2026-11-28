'use client';

import { FormEvent, useState } from 'react';
import { ControlPlaneClient, Project } from '../../lib/control-plane';
import { Empty, FormPanel, isProjectOwner } from './shared';

export function ProjectsView({
  projects,
  selectedProjectId,
  loading,
  client,
  onSelectProject,
  onOpenApis,
  onRefreshProjects,
  onNotify,
  onError,
}: {
  projects: Project[];
  selectedProjectId: string;
  loading: boolean;
  client: ControlPlaneClient;
  onSelectProject: (id: string) => void;
  onOpenApis: (id: string) => void;
  onRefreshProjects: () => Promise<void>;
  onNotify: (message: string) => void;
  onError: (cause: unknown) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function startEdit(item: Project) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditSlug(item.slug);
    setEditDescription(item.description ?? '');
    setEditStatus(item.status ?? 'ACTIVE');
    setConfirmDeleteId(null);
  }

  async function saveEdit(event: FormEvent, projectId: string) {
    event.preventDefault();
    setBusyId(projectId);
    try {
      await client.updateProject(projectId, {
        name: editName.trim(),
        slug: editSlug.trim().toLowerCase(),
        description: editDescription.trim(),
        status: editStatus,
      });
      setEditingId(null);
      await onRefreshProjects();
      onNotify('Project updated.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(projectId: string) {
    setBusyId(projectId);
    try {
      await client.deleteProject(projectId);
      setConfirmDeleteId(null);
      if (selectedProjectId === projectId) {
        onSelectProject('');
      }
      await onRefreshProjects();
      onNotify('Project deleted.');
    } catch (cause) {
      onError(cause);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <FormPanel
        title="New project"
        onSubmit={async (form) => {
          try {
            const name = String(form.get('name') ?? '').trim();
            const slug = String(form.get('slug') ?? '')
              .trim()
              .toLowerCase();
            const description = String(form.get('description') ?? '').trim();
            const created = await client.createProject({
              name,
              slug,
              description: description || undefined,
            });
            await onRefreshProjects();
            onSelectProject(created.id);
            onNotify('Project created.');
            return true;
          } catch (cause) {
            onError(cause);
            return false;
          }
        }}
      >
        <label>
          Name
          <input name="name" required maxLength={120} placeholder="Checkout Service" />
        </label>
        <label>
          Slug
          <input
            name="slug"
            required
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            maxLength={80}
            placeholder="checkout-service"
            title="Lowercase letters, numbers, and single hyphens"
          />
        </label>
        <label className="field-wide">
          Description <span className="field-optional">(optional)</span>
          <input name="description" maxLength={500} placeholder="Mock endpoints for checkout flow" />
        </label>
        <button type="submit" className="button button-primary">
          Create project
        </button>
      </FormPanel>

      <section className="panel">
        <div className="panel-header panel-header-split">
          <h2>Projects</h2>
          <span className="panel-meta">{projects.length} total</span>
        </div>
        {loading ? (
          <Empty title="Loading projects" description="Fetching your control-plane projects…" />
        ) : projects.length ? (
          <div className="data-list">
            {projects.map((item) => {
              const owner = isProjectOwner(item.role);
              const isSelected = item.id === selectedProjectId;
              const isEditing = editingId === item.id;
              const isConfirmingDelete = confirmDeleteId === item.id;
              const isBusy = busyId === item.id;

              return (
                <div
                  className={`project-item ${isSelected ? 'project-item-active' : ''}`}
                  key={item.id}
                >
                  <div className="data-row data-row-interactive">
                    <button
                      type="button"
                      className="project-select-btn"
                      onClick={() => onSelectProject(item.id)}
                    >
                      <strong>{item.name}</strong>
                      <code>/{item.slug}</code>
                      <span className="role-badge">{item.role}</span>
                      {item.status && item.status !== 'ACTIVE' && (
                        <span className="status-pill">{item.status}</span>
                      )}
                      {isSelected && <span className="status-pill status-pill-active">Active</span>}
                    </button>

                    <div className="row-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onOpenApis(item.id)}
                      >
                        Open APIs
                      </button>
                      {owner && (
                        <>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={isBusy}
                            onClick={() => (isEditing ? setEditingId(null) : startEdit(item))}
                          >
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary button-destructive"
                            disabled={isBusy}
                            onClick={() =>
                              setConfirmDeleteId(isConfirmingDelete ? null : item.id)
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {item.description && !isEditing && (
                    <p className="row-description">{item.description}</p>
                  )}

                  {isEditing && (
                    <form className="inline-edit-form" onSubmit={(e) => saveEdit(e, item.id)}>
                      <div className="form-fields">
                        <label>
                          Name
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            required
                            maxLength={120}
                            disabled={isBusy}
                          />
                        </label>
                        <label>
                          Slug
                          <input
                            value={editSlug}
                            onChange={(e) => setEditSlug(e.target.value)}
                            required
                            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                            maxLength={80}
                            disabled={isBusy}
                          />
                        </label>
                        <label>
                          Status
                          <select
                            value={editStatus}
                            onChange={(e) =>
                              setEditStatus(e.target.value as 'ACTIVE' | 'ARCHIVED')
                            }
                            disabled={isBusy}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="ARCHIVED">ARCHIVED</option>
                          </select>
                        </label>
                        <label>
                          Description
                          <input
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            maxLength={500}
                            disabled={isBusy}
                          />
                        </label>
                      </div>
                      <div className="inline-actions">
                        <button type="submit" className="button button-primary" disabled={isBusy}>
                          {isBusy ? 'Saving…' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={isBusy}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {isConfirmingDelete && (
                    <div className="confirm-bar" role="alert">
                      <span>
                        Delete <strong>{item.name}</strong>? This permanently removes all APIs,
                        scenarios, and logs in this project.
                      </span>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="button button-danger"
                          disabled={isBusy}
                          onClick={() => void handleDelete(item.id)}
                        >
                          {isBusy ? 'Deleting…' : 'Confirm delete'}
                        </button>
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty
            title="No projects yet"
            description="Create a project to begin managing mock APIs."
          />
        )}
      </section>
    </>
  );
}
