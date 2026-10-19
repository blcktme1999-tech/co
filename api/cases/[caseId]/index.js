const { VIDEO_BUCKET, getSupabase, json, methodNotAllowed, requireStaff, serviceErrorMessage } = require('../../_lib/service');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') return methodNotAllowed(res, ['DELETE']);
  try {
    const session = requireStaff(req, res);
    if (!session) return;
    const client = getSupabase();
    const caseId = req.query.caseId;
    const existing = await client.from('service_cases').select('id').eq('id', caseId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) return json(res, 404, { error: '找不到案件' });

    const files = await client.from('service_files').select('stored_name').eq('case_id', caseId);
    if (files.error) throw files.error;
    const names = (files.data || []).map((file) => file.stored_name).filter(Boolean);
    if (names.length) {
      const removed = await client.storage.from(VIDEO_BUCKET).remove(names);
      if (removed.error) throw removed.error;
    }

    const deleted = await client.from('service_cases').delete().eq('id', caseId);
    if (deleted.error) throw deleted.error;
    json(res, 200, { ok: true, id: caseId });
  } catch (error) {
    json(res, 500, { error: serviceErrorMessage(error, '刪除案件失敗') });
  }
};
