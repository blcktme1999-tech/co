const { VIDEO_BUCKET, attachmentTooLarge, createSignedUpload, getJsonBody, getSupabase, json, methodNotAllowed, publicFile, requireStaff, safeName, serviceErrorMessage } = require('../_lib/service');

function storedFileName(applicationId, originalName) {
  return `priority/${applicationId}/${Date.now()}-${safeName(originalName)}`;
}

function setupError(error) {
  if (/priority_application_files|schema cache|does not exist|Could not find/i.test(error?.message || '')) {
    return '請先在 Supabase 執行優先調查附件資料表的 SQL。';
  }
  return serviceErrorMessage(error, '檔案處理失敗');
}

async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  try {
    const session = requireStaff(req, res);
    if (!session) return;
    const client = getSupabase();
    const body = await getJsonBody(req);
    const applicationId = String(body.applicationId || '');
    const application = await client.from('priority_applications').select('id').eq('id', applicationId).maybeSingle();
    if (application.error) throw application.error;
    if (!application.data) return json(res, 404, { error: '找不到這筆申請' });

    if (body.action === 'ticket') {
      if (attachmentTooLarge(body.size)) return json(res, 413, { error: '單檔上限為 20 MB。' });
      const storedName = storedFileName(applicationId, body.fileName);
      return json(res, 200, await createSignedUpload(client, storedName));
    }

    if (body.action === 'delete') {
      const existing = await client.from('priority_application_files').select('*').eq('id', body.fileId).eq('application_id', applicationId).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) return json(res, 404, { error: '找不到檔案' });
      const removed = await client.storage.from(VIDEO_BUCKET).remove([existing.data.stored_name]);
      if (removed.error) throw removed.error;
      const deleted = await client.from('priority_application_files').delete().eq('id', existing.data.id);
      if (deleted.error) throw deleted.error;
      return json(res, 200, { ok: true });
    }

    if (body.action !== 'complete') return json(res, 400, { error: '無法處理這個檔案要求' });
    const storedName = String(body.storedName || '');
    if (!storedName.startsWith(`priority/${applicationId}/`) || storedName.includes('..')) return json(res, 400, { error: '檔案路徑錯誤' });
    if (attachmentTooLarge(body.size)) return json(res, 413, { error: '單檔上限為 20 MB。' });
    const publicResult = client.storage.from(VIDEO_BUCKET).getPublicUrl(storedName);
    const inserted = await client.from('priority_application_files').insert({
      application_id: applicationId,
      uploaded_by: session.user.displayName || '服務人員',
      original_name: String(body.fileName || 'attachment').slice(0, 255),
      stored_name: storedName,
      mime_type: String(body.mimeType || 'application/octet-stream').slice(0, 255),
      size: Number(body.size),
      public_url: publicResult.data?.publicUrl || ''
    }).select('*').single();
    if (inserted.error) throw inserted.error;
    json(res, 200, { file: publicFile(inserted.data) });
  } catch (error) {
    json(res, 500, { error: setupError(error) });
  }
}

module.exports = handler;
