import React, { useState, useEffect, useCallback } from 'react';
import {
  apiListTrustCircle,
  apiListTrustCirclePendingSent,
  apiListTrustCirclePendingReceived,
  apiAddTrustCircleMember,
  apiUpdateTrustCircleMember,
  apiDeleteTrustCircleMember,
  apiAcceptTrustCircleInvite,
  apiDeclineTrustCircleInvite,
} from '../api/client';

const TrustCircleManager = () => {
  const [members, setMembers] = useState([]);
  const [pendingSent, setPendingSent] = useState([]);
  const [pendingReceived, setPendingReceived] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('Friend');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [permissions, setPermissions] = useState({
    safety_alerts: false,
    shared_reminders: false,
    shared_documents: false,
  });

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, sentRes, receivedRes] = await Promise.all([
        apiListTrustCircle(),
        apiListTrustCirclePendingSent(),
        apiListTrustCirclePendingReceived(),
      ]);
      setMembers(membersRes.data || []);
      setPendingSent(sentRes.data || []);
      setPendingReceived(receivedRes.data || []);
    } catch (err) {
      showError('Could not load Trust Circle data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    // Poll for new incoming invites every 30s
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const resetForm = () => {
    setName('');
    setRelationship('Friend');
    setEmail('');
    setPhone('');
    setPermissions({ safety_alerts: false, shared_reminders: false, shared_documents: false });
    setEditingMember(null);
    setShowAddModal(false);
  };

  const handleOpenAdd = () => { resetForm(); setShowAddModal(true); };

  const handleOpenEdit = (member) => {
    setEditingMember(member);
    setName(member.name);
    setRelationship(member.relationship || 'Friend');
    setEmail(member.email);
    setPhone(member.phone || '');
    setPermissions({
      safety_alerts: !!member.permissions?.safety_alerts,
      shared_reminders: !!member.permissions?.shared_reminders,
      shared_documents: !!member.permissions?.shared_documents,
    });
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) { showError('Name and email are required.'); return; }
    try {
      if (editingMember) {
        await apiUpdateTrustCircleMember(editingMember.id, { name, relationship, email, phone: phone || null, permissions });
        showSuccess(`Updated ${name}`);
      } else {
        const res = await apiAddTrustCircleMember({ name, relationship, email, phone: phone || null, permissions });
        const invite_status = res.data?.invite_status;
        if (invite_status === 'pending') {
          showSuccess(`✉️ Invite sent to ${email}! They'll see it in their Trust Circle.`);
        } else {
          showSuccess(`✅ ${name} added to your Trust Circle`);
        }
      }
      resetForm();
      loadAll();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to save contact.');
    }
  };

  const handleTogglePermission = async (member, permKey) => {
    const updatedPerms = { ...member.permissions, [permKey]: !member.permissions?.[permKey] };
    try {
      await apiUpdateTrustCircleMember(member.id, { permissions: updatedPerms });
      loadAll();
    } catch {
      showError('Failed to update permission.');
    }
  };

  const handleDelete = async (memberId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from your Trust Circle?`)) return;
    try {
      await apiDeleteTrustCircleMember(memberId);
      showSuccess(`Removed ${memberName}`);
      loadAll();
    } catch { showError('Failed to remove member.'); }
  };

  const handleCancelInvite = async (memberId, memberName) => {
    if (!window.confirm(`Cancel your invite to ${memberName}?`)) return;
    try {
      await apiDeleteTrustCircleMember(memberId);
      showSuccess(`Invite to ${memberName} cancelled`);
      loadAll();
    } catch { showError('Failed to cancel invite.'); }
  };

  const handleAccept = async (invite) => {
    try {
      await apiAcceptTrustCircleInvite(invite.id);
      showSuccess(`✅ You and ${invite.invited_by_name} are now connected!`);
      loadAll();
    } catch (err) {
      showError(err.response?.data?.detail || 'Failed to accept invite.');
    }
  };

  const handleDecline = async (invite) => {
    if (!window.confirm(`Decline invite from ${invite.invited_by_name || invite.email}?`)) return;
    try {
      await apiDeclineTrustCircleInvite(invite.id);
      showSuccess('Invite declined.');
      loadAll();
    } catch { showError('Failed to decline invite.'); }
  };

  const PermBadge = ({ member, permKey, emoji, label, activeClass }) => (
    <button
      type="button"
      onClick={() => handleTogglePermission(member, permKey)}
      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center space-x-1.5 cursor-pointer ${
        member.permissions?.[permKey]
          ? activeClass
          : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
      }`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      <span className="text-[9px] font-black">{member.permissions?.[permKey] ? '✓ ON' : '✕ OFF'}</span>
    </button>
  );

  return (
    <div className="space-y-6 font-sans">

      {/* ── Header ── */}
      <div className="bg-white p-6 rounded-3xl border border-[#83C5BE]/50 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-2">
            <span className="text-xl">🛡️</span>
            <h2 className="text-lg font-bold text-slate-900">Trust Circle</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EDF6F9] text-[#006D77] text-[10px] font-extrabold uppercase tracking-wider">
              {members.length} Active
            </span>
            {pendingReceived.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-extrabold uppercase tracking-wider animate-pulse">
                {pendingReceived.length} Invite{pendingReceived.length > 1 ? 's' : ''} Pending
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Add trusted contacts who can receive safety alerts. Works like friend requests — the other person must accept.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs transition-all flex items-center space-x-2 shrink-0 cursor-pointer"
        >
          <span>+ Add / Invite</span>
        </button>
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-center">{error}</div>
      )}
      {success && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-center">{success}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 font-semibold bg-white rounded-3xl border border-slate-200">
          Loading Trust Circle…
        </div>
      ) : (
        <>
          {/* ─────────────────────────────────────────────────── */}
          {/* SECTION 1: Incoming invites (must accept/decline)   */}
          {/* ─────────────────────────────────────────────────── */}
          {pendingReceived.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">📨</span>
                <h3 className="text-sm font-extrabold text-amber-900">
                  Pending Invites ({pendingReceived.length})
                </h3>
                <span className="text-[10px] text-amber-700 font-medium">
                  — People who added you to their Trust Circle
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingReceived.map((invite) => (
                  <div
                    key={invite.id}
                    className="bg-white border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-amber-500 text-white font-bold text-sm flex items-center justify-center shrink-0">
                        {(invite.invited_by_name || invite.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {invite.invited_by_name || 'SumScale User'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {invite.invited_by_email || invite.email}
                        </p>
                        <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                          {invite.relationship}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => handleAccept(invite)}
                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer"
                      >
                        ✓ Accept
                      </button>
                      <button
                        onClick={() => handleDecline(invite)}
                        className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-bold text-[11px] transition-all cursor-pointer"
                      >
                        ✕ Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────── */}
          {/* SECTION 2: Pending sent invites (awaiting their OK) */}
          {/* ─────────────────────────────────────────────────── */}
          {pendingSent.length > 0 && (
            <div className="bg-sky-50 border border-sky-200 rounded-3xl p-5 space-y-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">⏳</span>
                <h3 className="text-sm font-extrabold text-sky-900">
                  Sent Invites ({pendingSent.length})
                </h3>
                <span className="text-[10px] text-sky-700 font-medium">
                  — Waiting for them to accept
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingSent.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center space-x-2 bg-white border border-sky-200 rounded-full px-3 py-1.5 text-xs shadow-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {inv.name?.[0]?.toUpperCase()}
                    </span>
                    <span className="font-semibold text-slate-700">{inv.name}</span>
                    <span className="text-slate-400 text-[10px]">{inv.email}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[9px] font-bold">PENDING</span>
                    <button
                      onClick={() => handleCancelInvite(inv.id, inv.name)}
                      className="text-slate-400 hover:text-rose-600 transition-colors text-[10px] font-bold cursor-pointer"
                      title="Cancel invite"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────── */}
          {/* SECTION 3: Active members                          */}
          {/* ─────────────────────────────────────────────────── */}
          {members.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-slate-200/80 shadow-2xs space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#EDF6F9] text-[#006D77] flex items-center justify-center text-xl mx-auto font-bold">
                👥
              </div>
              <h3 className="text-sm font-bold text-slate-800">Your Trust Circle is empty</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Invite family or friends. Once they accept, they can receive safety alerts.
              </p>
              <button
                onClick={handleOpenAdd}
                className="px-4 py-2 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs cursor-pointer"
              >
                + Add Trusted Member
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3 px-1">
                🟢 Active Members ({members.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="bg-white p-5 rounded-3xl border border-[#83C5BE]/40 shadow-xs flex flex-col justify-between space-y-4 hover:border-[#006D77]/50 transition-all"
                  >
                    {/* Member header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-[#006D77] text-white font-bold text-sm flex items-center justify-center shrink-0">
                            {member.name?.[0]?.toUpperCase() || 'T'}
                          </div>
                          {member.sync_status === 'mirrored' && (
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-sky-500 text-white text-[8px] font-black rounded-full flex items-center justify-center" title="Synced — they added you">⇄</span>
                          )}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{member.name}</h3>
                          <p className="text-[11px] text-slate-500 font-medium">
                            {member.relationship} · {member.email}
                          </p>
                          {member.phone && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{member.phone}</p>
                          )}
                          {member.invite_status === 'manual' && (
                            <span className="text-[9px] text-slate-400 font-bold">External contact</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenEdit(member)}
                          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                          title="Edit Member"
                        >✏️</button>
                        <button
                          onClick={() => handleDelete(member.id, member.name)}
                          className="p-1.5 rounded-full hover:bg-rose-50 text-rose-600 text-xs font-bold transition-colors cursor-pointer"
                          title="Remove Member"
                        >🗑️</button>
                      </div>
                    </div>

                    {/* Permissions */}
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        Permissions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <PermBadge member={member} permKey="safety_alerts" emoji="🚨" label="Safety Alerts" activeClass="bg-emerald-50 border-emerald-300 text-emerald-800" />
                        <PermBadge member={member} permKey="shared_reminders" emoji="🔔" label="Reminders" activeClass="bg-sky-50 border-sky-300 text-sky-800" />
                        <PermBadge member={member} permKey="shared_documents" emoji="📄" label="Shared Docs" activeClass="bg-purple-50 border-purple-300 text-purple-800" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─────────────────────────────────────────────────── */}
      {/* Add / Edit Modal                                    */}
      {/* ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 border border-[#83C5BE] shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {editingMember ? 'Edit Trusted Contact' : 'Add / Invite Trusted Contact'}
                </h3>
                {!editingMember && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    If they have a SumScale account, they'll receive an invite to accept.
                  </p>
                )}
              </div>
              <button
                onClick={resetForm}
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center cursor-pointer"
              >✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text" required value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Relationship</label>
                <select
                  value={relationship} onChange={(e) => setRelationship(e.target.value)}
                  className="w-full px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                >
                  {['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Doctor', 'Colleague', 'Other'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sarah@example.com"
                  className="w-full px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone (Optional)</label>
                <input
                  type="tel" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                />
              </div>

              {editingMember && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <label className="block text-xs font-bold text-slate-700">Permissions</label>
                  {[
                    { key: 'safety_alerts', emoji: '🚨', label: 'Emergency Safety Alerts' },
                    { key: 'shared_reminders', emoji: '🔔', label: 'Shared Reminders' },
                    { key: 'shared_documents', emoji: '📄', label: 'Shared Document Summaries' },
                  ].map(({ key, emoji, label }) => (
                    <label key={key} className="flex items-center space-x-2 text-xs text-slate-700 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={permissions[key]}
                        onChange={(e) => setPermissions({ ...permissions, [key]: e.target.checked })}
                        className="rounded text-[#006D77] focus:ring-[#006D77]"
                      />
                      <span>{emoji} {label}</span>
                    </label>
                  ))}
                </div>
              )}

              {!editingMember && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-800 font-medium">
                  💡 If this email belongs to a SumScale user, they'll receive an invite notification and must accept before appearing in your active circle.
                </div>
              )}

              <div className="pt-4 flex items-center justify-end space-x-2">
                <button
                  type="button" onClick={resetForm}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >Cancel</button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  {editingMember ? 'Save Changes' : '✉️ Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrustCircleManager;
