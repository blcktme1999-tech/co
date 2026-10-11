const { getJsonBody, getSupabase, json, methodNotAllowed, publicCase, serviceErrorMessage } = require('../_lib/service');

async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
  try {
    const body = req.method === 'GET' ? req.query : await getJsonBody(req);
    const citizenName = String(body.citizenName || '').trim();
    const nationalId = String(body.nationalId || '').trim().toUpperCase();
    if (citizenName.length < 2 || nationalId.length < 6) {
      return json(res, 400, { error: '請輸入姓名與身分證/居留證號' });
    }

    const client = getSupabase();
    const result = await client
      .from('service_cases')
      .select('*')
      .eq('citizen_name', citizenName)
      .eq('national_id', nationalId)
      .order('created_at', { ascending: false });
    if (result.error) throw result.error;

    json(res, 200, { cases: (result.data || []).map(publicCase) });
  } catch (error) {
    json(res, 500, { error: serviceErrorMessage(error, '案件查詢失敗') });
  }
}

module.exports = handler;
