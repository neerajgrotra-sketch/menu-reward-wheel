'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AppSupabaseClient } from '@/lib/supabase/client';
import { ConfirmModal } from './ConfirmModal';
import type { ConfirmOptions } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Touchpoint = {
  id: string;
  restaurant_id: string;
  name: string;
  type: string;
  touchpoint_code: string;
  section_name: string | null;
  capacity: number | null;
  active: boolean;
  display_order: number;
  deleted_at: string | null;
};

type AddForm = {
  name: string;
  type: 'table' | 'patio' | 'counter' | 'pickup';
  section_name: string;
  capacity: string;
};

type EditForm = {
  name: string;
  section_name: string;
  capacity: string;
  active: boolean;
  display_order: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: AddForm['type']; label: string }[] = [
  { value: 'table',   label: 'Table'   },
  { value: 'patio',   label: 'Patio'   },
  { value: 'counter', label: 'Counter' },
  { value: 'pickup',  label: 'Pickup'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string): string {
  return TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
}

function generateTouchpointCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'T';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  restaurantId: string;
  supabase: AppSupabaseClient;
}

export function RestaurantTablesTab({ restaurantId, supabase }: Props) {
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [loading, setLoading]         = useState(true);
  const [pageError, setPageError]     = useState('');

  const [showAdd, setShowAdd]         = useState(false);
  const [editTarget, setEditTarget]   = useState<Touchpoint | null>(null);
  const [confirm, setConfirm]         = useState<(ConfirmOptions & { open: boolean }) | null>(null);

  const [addForm, setAddForm]   = useState<AddForm>({ name: '', type: 'table', section_name: '', capacity: '' });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const [editForm, setEditForm]   = useState<EditForm>({ name: '', section_name: '', capacity: '', active: true, display_order: '0' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('restaurant_touchpoints')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .is('deleted_at', null)
      .order('display_order', { ascending: true });

    if (error) { setPageError((error as { message: string }).message); } else { setTouchpoints(data ?? []); }
    setLoading(false);
  }, [restaurantId, supabase]);

  useEffect(() => { load(); }, [load]);

  // ── Add ───────────────────────────────────────────────────────────────────

  function openAdd() {
    setAddForm({ name: '', type: 'table', section_name: '', capacity: '' });
    setAddError('');
    setShowAdd(true);
  }

  async function handleAdd() {
    if (!addForm.name.trim()) { setAddError('Name is required.'); return; }
    setAddSaving(true);
    setAddError('');

    const { error } = await (supabase as any)
      .from('restaurant_touchpoints')
      .insert({
        restaurant_id:  restaurantId,
        name:           addForm.name.trim(),
        type:           addForm.type,
        touchpoint_code: generateTouchpointCode(),
        section_name:   addForm.section_name.trim() || null,
        capacity:       addForm.capacity ? parseInt(addForm.capacity, 10) : null,
      });

    setAddSaving(false);
    if (error) {
      setAddError((error as { message: string }).message);
    } else {
      setShowAdd(false);
      load();
    }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function openEdit(tp: Touchpoint) {
    setEditForm({
      name:          tp.name,
      section_name:  tp.section_name ?? '',
      capacity:      tp.capacity != null ? String(tp.capacity) : '',
      active:        tp.active,
      display_order: String(tp.display_order),
    });
    setEditError('');
    setEditTarget(tp);
  }

  async function handleEdit() {
    if (!editTarget) return;
    if (!editForm.name.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true);
    setEditError('');

    const { error } = await (supabase as any)
      .from('restaurant_touchpoints')
      .update({
        name:          editForm.name.trim(),
        section_name:  editForm.section_name.trim() || null,
        capacity:      editForm.capacity ? parseInt(editForm.capacity, 10) : null,
        active:        editForm.active,
        display_order: parseInt(editForm.display_order, 10) || 0,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', editTarget.id)
      .eq('restaurant_id', restaurantId);

    setEditSaving(false);
    if (error) {
      setEditError((error as { message: string }).message);
    } else {
      setEditTarget(null);
      load();
    }
  }

  // ── Soft Delete ───────────────────────────────────────────────────────────

  function handleDeleteRequest(tp: Touchpoint) {
    setConfirm({
      open:         true,
      title:        `Delete ${tp.name}?`,
      message:      'This table will be removed from your list. The QR code history is preserved. This action cannot be undone.',
      confirmLabel: 'Delete',
      danger:       true,
      onConfirm:    async () => {
        const { error } = await (supabase as any)
          .from('restaurant_touchpoints')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', tp.id)
          .eq('restaurant_id', restaurantId);
        if (error) { setPageError((error as { message: string }).message); } else { load(); }
      },
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <p className="py-8 text-center text-sm text-stone-400">Loading tables…</p>;
  }

  return (
    <>
      {confirm && (
        <ConfirmModal
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {showAdd && (
        <AddTableModal
          form={addForm}
          onChange={(p) => setAddForm(f => ({ ...f, ...p }))}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
          saving={addSaving}
          error={addError}
        />
      )}

      {editTarget && (
        <EditTableModal
          tp={editTarget}
          form={editForm}
          onChange={(p) => setEditForm(f => ({ ...f, ...p }))}
          onSave={handleEdit}
          onCancel={() => setEditTarget(null)}
          saving={editSaving}
          error={editError}
        />
      )}

      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">Table Management</p>
            <p className="mt-0.5 text-xs font-semibold text-stone-400">
              {touchpoints.length === 0
                ? 'No tables added yet.'
                : `${touchpoints.length} table${touchpoints.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="rounded-2xl bg-[#FF6B00] px-4 py-2.5 text-sm font-black text-white shadow-sm"
          >
            + Add Table
          </button>
        </div>

        {pageError && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{pageError}</p>
        )}

        {/* List */}
        {touchpoints.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center">
            <p className="text-sm font-semibold text-stone-400">No tables yet — add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {touchpoints.map((tp) => (
              <div key={tp.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-[#1F1F1F]">{tp.name}</p>
                      {!tp.active && (
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-black text-stone-500">Inactive</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-semibold text-stone-500">
                      {tp.section_name && <span>Section: {tp.section_name}</span>}
                      {tp.capacity != null && <span>Capacity: {tp.capacity}</span>}
                      <span>Type: {typeLabel(tp.type)}</span>
                      <span className="font-mono text-stone-400">#{tp.touchpoint_code}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(tp)}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-black text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRequest(tp)}
                      className="rounded-xl bg-white px-3 py-2 text-xs font-black text-red-600 ring-1 ring-red-100 hover:bg-red-50"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Coming Soon — Phase C"
                      className="cursor-not-allowed rounded-xl bg-stone-100 px-3 py-2 text-xs font-black text-stone-400"
                    >
                      QR
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Add Modal ────────────────────────────────────────────────────────────────

interface AddModalProps {
  form: AddForm;
  onChange: (p: Partial<AddForm>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}

function AddTableModal({ form, onChange, onSave, onCancel, saving, error }: AddModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Add Table"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-black text-[#1F1F1F]">Add Table</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="e.g. Table 1"
              autoFocus
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">Type</label>
            <select
              value={form.type}
              onChange={(e) => onChange({ type: e.target.value as AddForm['type'] })}
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">
              Section <span className="font-semibold normal-case text-stone-400">(optional)</span>
            </label>
            <input
              type="text"
              value={form.section_name}
              onChange={(e) => onChange({ section_name: e.target.value })}
              placeholder="e.g. Main Floor, Patio"
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">
              Capacity <span className="font-semibold normal-case text-stone-400">(optional)</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => onChange({ capacity: e.target.value })}
              placeholder="e.g. 4"
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-stone-200 py-3 text-sm font-black text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-2xl bg-[#FF6B00] py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? 'Adding…' : 'Add Table'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  tp: Touchpoint;
  form: EditForm;
  onChange: (p: Partial<EditForm>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
}

function EditTableModal({ tp, form, onChange, onSave, onCancel, saving, error }: EditModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit Table"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-black text-[#1F1F1F]">Edit Table</h2>
        <p className="mt-1 font-mono text-xs text-stone-400">
          Code: {tp.touchpoint_code} · Type: {typeLabel(tp.type)}
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
              autoFocus
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">
              Section <span className="font-semibold normal-case text-stone-400">(optional)</span>
            </label>
            <input
              type="text"
              value={form.section_name}
              onChange={(e) => onChange({ section_name: e.target.value })}
              placeholder="e.g. Main Floor, Patio"
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">
              Capacity <span className="font-semibold normal-case text-stone-400">(optional)</span>
            </label>
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => onChange({ capacity: e.target.value })}
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-wide text-stone-500">Display Order</label>
            <input
              type="number"
              min="0"
              value={form.display_order}
              onChange={(e) => onChange({ display_order: e.target.value })}
              className="mt-1 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-[#1F1F1F] outline-none focus:border-[#FF6B00] focus:ring-1 focus:ring-[#FF6B00]"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-stone-100 p-4">
            <div className="min-w-0">
              <p className="text-sm font-black text-[#1F1F1F]">Active</p>
              <p className="mt-0.5 text-xs font-semibold text-stone-500">
                Inactive tables are hidden from ordering. Printed QR codes remain valid.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              onClick={() => onChange({ active: !form.active })}
              className={`relative ml-3 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:ring-offset-2 ${form.active ? 'bg-[#FF6B00]' : 'bg-stone-200'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-stone-200 py-3 text-sm font-black text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 rounded-2xl bg-[#FF6B00] py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
