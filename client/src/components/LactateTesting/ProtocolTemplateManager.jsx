import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

const SPORT_LABELS = {
  bike: '🚴 Bike',
  run: '🏃 Run',
  swim: '🏊 Swim',
};

function SportPill({ sport }) {
  const colors = {
    bike: 'bg-blue-100 text-blue-700',
    run: 'bg-emerald-100 text-emerald-700',
    swim: 'bg-cyan-100 text-cyan-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[sport] || 'bg-gray-100 text-gray-600'}`}>
      {SPORT_LABELS[sport] || sport}
    </span>
  );
}

function protocolSummary(protocol) {
  if (!protocol) return '—';
  const { startPower, maxSteps, powerIncrement, workDuration } = protocol;
  const endPower = startPower && maxSteps && powerIncrement
    ? startPower + (maxSteps - 1) * powerIncrement
    : null;
  const parts = [];
  if (startPower && endPower) parts.push(`${startPower}W → ${endPower}W`);
  if (maxSteps && workDuration) parts.push(`${maxSteps}×${workDuration}min`);
  return parts.join(', ') || '—';
}

function TemplateCard({ template, currentUserId, onLoad, onDelete, onShare, athletes }) {
  const isOwn = template.createdBy?._id === currentUserId || template.createdBy === currentUserId;
  const [sharing, setSharing] = useState(false);
  const [shareAthleteId, setShareAthleteId] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(template._id);
    setDeleting(false);
  };

  const handleShare = async () => {
    if (!shareAthleteId) return;
    await onShare(template._id, shareAthleteId);
    setSharing(false);
    setShareAthleteId('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:border-[#767EB5]/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{template.name}</p>
          {template.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>
          )}
        </div>
        <SportPill sport={template.sport} />
      </div>

      <p className="text-xs text-[#767EB5] font-mono mb-3">{protocolSummary(template.protocol)}</p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onLoad(template.protocol)}
          className="text-xs bg-[#767EB5] hover:bg-[#5a6299] text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
        >
          Load
        </button>

        {isOwn && athletes && athletes.length > 0 && (
          <button
            onClick={() => setSharing((s) => !s)}
            className="text-xs border border-[#767EB5] text-[#767EB5] hover:bg-[#767EB5] hover:text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Share
          </button>
        )}

        {isOwn && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs border border-red-200 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ml-auto"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {sharing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex gap-2 overflow-hidden"
          >
            <select
              value={shareAthleteId}
              onChange={(e) => setShareAthleteId(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#767EB5]"
            >
              <option value="">Select athlete…</option>
              {athletes.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} {a.surname}
                </option>
              ))}
            </select>
            <button
              onClick={handleShare}
              disabled={!shareAthleteId}
              className="text-xs bg-[#767EB5] disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-medium"
            >
              Send
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function ProtocolTemplateManager({
  currentProtocol,
  onLoadTemplate,
  currentUser,
  sport,
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [athletes, setAthletes] = useState([]);

  // Save form state
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveSport, setSaveSport] = useState(sport || 'bike');
  const [saving, setSaving] = useState(false);

  const isCoach = ['coach', 'tester', 'testing'].includes(currentUser?.role);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/protocol-templates');
      setTemplates(res.data || []);
      setError(null);
    } catch {
      setError('Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAthletes = useCallback(async () => {
    if (!isCoach) return;
    try {
      const res = await api.get('/user/coach/athletes');
      setAthletes(res.data || []);
    } catch {
      // non-critical
    }
  }, [isCoach]);

  useEffect(() => {
    if (open) {
      fetchTemplates();
      fetchAthletes();
    }
  }, [open, fetchTemplates, fetchAthletes]);

  const handleSave = async () => {
    if (!saveName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await api.post('/api/protocol-templates', {
        name: saveName.trim(),
        description: saveDesc.trim(),
        sport: saveSport,
        protocol: currentProtocol,
      });
      setTemplates((prev) => [res.data, ...prev]);
      setSaveName('');
      setSaveDesc('');
      setError(null);
    } catch {
      setError('Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/api/protocol-templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t._id !== id));
    } catch {
      setError('Failed to delete template.');
    }
  };

  const handleShare = async (id, athleteId) => {
    try {
      await api.post(`/api/protocol-templates/${id}/share/${athleteId}`);
    } catch {
      setError('Failed to share template.');
    }
  };

  const handleLoad = (protocol) => {
    onLoadTemplate(protocol);
    setOpen(false);
  };

  const myTemplates = templates.filter(
    (t) => t.createdBy?._id === currentUser?._id || t.createdBy === currentUser?._id
  );
  const sharedWithMe = templates.filter((t) => {
    const notMine = t.createdBy?._id !== currentUser?._id && t.createdBy !== currentUser?._id;
    return notMine && t.sharedWith?.includes(currentUser?._id);
  });
  const publicTemplates = templates.filter((t) => t.isPublic);

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border border-[#767EB5] text-[#767EB5] hover:bg-[#767EB5] hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 2a2 2 0 00-2 2v16l8-3 8 3V4a2 2 0 00-2-2H6z" />
        </svg>
        Templates
      </button>

      {/* Backdrop + slide-over panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-[#767EB5]" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 2a2 2 0 00-2 2v16l8-3 8 3V4a2 2 0 00-2-2H6z" />
                  </svg>
                  <h2 className="text-lg font-semibold text-gray-800">Protocol Templates</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
                )}

                {/* Save current as template */}
                <div className="bg-[#767EB5]/5 rounded-xl p-4 border border-[#767EB5]/20">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Save current as template</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Template name *"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#767EB5]"
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={saveDesc}
                      onChange={(e) => setSaveDesc(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#767EB5]"
                    />
                    <select
                      value={saveSport}
                      onChange={(e) => setSaveSport(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#767EB5]"
                    >
                      <option value="bike">🚴 Bike</option>
                      <option value="run">🏃 Run</option>
                      <option value="swim">🏊 Swim</option>
                    </select>
                    <div className="text-xs text-gray-500 font-mono bg-white rounded-lg px-3 py-2 border border-gray-100">
                      {protocolSummary(currentProtocol)}
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saving}
                      className="w-full bg-[#767EB5] hover:bg-[#5a6299] disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                    >
                      {saving ? 'Saving…' : 'Save Template'}
                    </button>
                  </div>
                </div>

                {/* My Templates */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    My Templates <span className="text-gray-400 font-normal">({myTemplates.length})</span>
                  </h3>
                  {loading ? (
                    <div className="space-y-2 animate-pulse">
                      {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
                    </div>
                  ) : myTemplates.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No templates yet</p>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence>
                        {myTemplates.map((t) => (
                          <TemplateCard
                            key={t._id}
                            template={t}
                            currentUserId={currentUser?._id}
                            onLoad={handleLoad}
                            onDelete={handleDelete}
                            onShare={handleShare}
                            athletes={athletes}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </section>

                {/* Shared with me */}
                {sharedWithMe.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Shared with me <span className="text-gray-400 font-normal">({sharedWithMe.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {sharedWithMe.map((t) => (
                        <TemplateCard
                          key={t._id}
                          template={t}
                          currentUserId={currentUser?._id}
                          onLoad={handleLoad}
                          onDelete={handleDelete}
                          onShare={handleShare}
                          athletes={[]}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Public */}
                {publicTemplates.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">
                      Public <span className="text-gray-400 font-normal">({publicTemplates.length})</span>
                    </h3>
                    <div className="space-y-2">
                      {publicTemplates.map((t) => (
                        <TemplateCard
                          key={t._id}
                          template={t}
                          currentUserId={currentUser?._id}
                          onLoad={handleLoad}
                          onDelete={handleDelete}
                          onShare={handleShare}
                          athletes={[]}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
